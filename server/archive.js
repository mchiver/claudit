//=====================================================================
// Claudit server: the archive.
//
// One JSON Lines file per session, appended as events arrive, at
// <folder>/<yyyy-mm-dd>/<session id>.jsonl, with <session id>.json
// beside it: the session's start, end, working directory and counts,
// for the list view. The day is the session's first event's day.
// A call still running is not archived (it is live only); its finished
// event is. Retention is by age of the day folders.
//=====================================================================

import fs from 'node:fs/promises';
import path from 'node:path';


const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;


export class Archive
{

	constructor( Folder )
	{
		this.folder = Folder;
		this.sessions = new Map();
	}


	//-----------------------------------------------------------------
	// Reads the summaries already on disk.
	//-----------------------------------------------------------------

	async Open()
	{
		await fs.mkdir( this.folder, { recursive: true } );
		const days = await this.DayFolders();
		for ( const day of days )
		{
			const day_folder = path.join( this.folder, day );
			const names = await fs.readdir( day_folder );
			for ( const name of names )
			{
				if ( !name.endsWith( '.json' ) )
				{
					continue;
				}
				try
				{
					const text = await fs.readFile( path.join( day_folder, name ), 'utf8' );
					const summary = JSON.parse( text );
					summary.folder = day;
					this.sessions.set( summary.id, summary );
				}
				catch ( error )
				{
					// A summary that does not parse is left where it is.
				}
			}
		}
		return this.sessions.size;
	}


	//-----------------------------------------------------------------

	async DayFolders()
	{
		const names = await fs.readdir( this.folder );
		const days = names.filter( function ( Name ) { return DAY_PATTERN.test( Name ); } );
		days.sort();
		return days;
	}


	//-----------------------------------------------------------------
	// Takes one event in. Returns { archived, summary }: archived is
	// false for a call still running, which is live only.
	//-----------------------------------------------------------------

	async Append( Event )
	{
		if ( !Event || typeof Event.session !== 'string' || Event.session === '' )
		{
			throw new Error( 'an event needs a session' );
		}
		const time = TimeOf( Event );
		let summary = this.sessions.get( Event.session );
		if ( !summary )
		{
			summary = {
				id: Event.session,
				cwd: Event.cwd || '',
				started: time,
				updated: time,
				ended: null,
				counts: { calls: 0, done: 0, denied: 0, failed: 0 },
				folder: DayOf( time ),
			};
			this.sessions.set( Event.session, summary );
			await fs.mkdir( path.join( this.folder, summary.folder ), { recursive: true } );
		}
		if ( time > summary.updated )
		{
			summary.updated = time;
		}
		if ( !summary.cwd && Event.cwd )
		{
			summary.cwd = Event.cwd;
		}

		let archived = true;
		if ( Event.kind === 'call' )
		{
			if ( Event.outcome === 'running' )
			{
				archived = false;
			}
			else
			{
				summary.counts.calls = summary.counts.calls + 1;
				if ( Event.outcome === 'done' || Event.outcome === 'denied' || Event.outcome === 'failed' )
				{
					summary.counts[ Event.outcome ] = summary.counts[ Event.outcome ] + 1;
				}
			}
		}
		else if ( Event.kind === 'session' )
		{
			if ( Event.phase === 'start' && time < summary.started )
			{
				summary.started = time;
			}
			if ( Event.phase === 'end' )
			{
				summary.ended = time;
			}
		}

		if ( archived )
		{
			await fs.appendFile( this.EventsPath( summary ), JSON.stringify( Event ) + '\n', 'utf8' );
		}
		await this.WriteSummary( summary );
		return { archived: archived, summary: summary };
	}


	//-----------------------------------------------------------------

	EventsPath( Summary )
	{
		return path.join( this.folder, Summary.folder, Summary.id + '.jsonl' );
	}


	//-----------------------------------------------------------------

	SummaryPath( Summary )
	{
		return path.join( this.folder, Summary.folder, Summary.id + '.json' );
	}


	//-----------------------------------------------------------------

	async WriteSummary( Summary )
	{
		await fs.writeFile( this.SummaryPath( Summary ), JSON.stringify( Summary, null, '\t' ), 'utf8' );
	}


	//-----------------------------------------------------------------
	// The sessions, newest activity first.
	//-----------------------------------------------------------------

	Sessions()
	{
		const list = Array.from( this.sessions.values() );
		list.sort( function ( Left, Right ) { return Right.updated - Left.updated; } );
		return list;
	}


	//-----------------------------------------------------------------

	Session( Id )
	{
		return this.sessions.get( Id ) || null;
	}


	//-----------------------------------------------------------------
	// One session's archived events, in the order they arrived.
	//-----------------------------------------------------------------

	async Events( Id )
	{
		const summary = this.sessions.get( Id );
		if ( !summary )
		{
			return null;
		}
		let text = '';
		try
		{
			text = await fs.readFile( this.EventsPath( summary ), 'utf8' );
		}
		catch ( error )
		{
			return [];
		}
		const events = [];
		for ( const line of text.split( '\n' ) )
		{
			if ( line.trim() === '' )
			{
				continue;
			}
			try
			{
				events.push( JSON.parse( line ) );
			}
			catch ( error )
			{
				// A line that does not parse is skipped.
			}
		}
		return events;
	}


	//-----------------------------------------------------------------
	// Removes the day folders older than RetentionDays before Now.
	// 0 keeps everything. Returns the days removed.
	//-----------------------------------------------------------------

	async Prune( RetentionDays, Now )
	{
		if ( !RetentionDays || RetentionDays <= 0 )
		{
			return [];
		}
		const now = Now || Date.now();
		const cutoff = DayOf( now - RetentionDays * 24 * 60 * 60 * 1000 );
		const removed = [];
		const days = await this.DayFolders();
		for ( const day of days )
		{
			if ( day >= cutoff )
			{
				continue;
			}
			await fs.rm( path.join( this.folder, day ), { recursive: true, force: true } );
			removed.push( day );
			for ( const [ id, summary ] of this.sessions )
			{
				if ( summary.folder === day )
				{
					this.sessions.delete( id );
				}
			}
		}
		return removed;
	}

}


//---------------------------------------------------------------------
// The event's moment: a call's start, a session event's time, else now.
//---------------------------------------------------------------------

export function TimeOf( Event )
{
	if ( typeof Event.time === 'number' )
	{
		return Event.time;
	}
	if ( typeof Event.start === 'number' )
	{
		return Event.start;
	}
	return Date.now();
}


//---------------------------------------------------------------------
// yyyy-mm-dd, local time.
//---------------------------------------------------------------------

export function DayOf( Ms )
{
	const date = new Date( Ms );
	const year = date.getFullYear();
	const month = String( date.getMonth() + 1 ).padStart( 2, '0' );
	const day = String( date.getDate() ).padStart( 2, '0' );
	return year + '-' + month + '-' + day;
}
