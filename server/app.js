//=====================================================================
// Claudit server: the Express application and its API.
//
//   POST /api/events          the mod posts one event or a batch
//   GET  /api/live            Server-Sent Events, ?session= to filter
//   GET  /api/sessions        the sessions, newest first, with summaries
//   GET  /api/sessions/<id>   one session's summary and archived events
//   GET  /api/health          the mod's start-up check
//   /                         the web UI (public/)
//
// CreateApp takes the configuration, the archive and the live hub, so
// a test can build one on a temporary folder and a free port.
//=====================================================================

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const VERSION = '0.1.0';
const PUBLIC_FOLDER = path.join( path.dirname( fileURLToPath( import.meta.url ) ), '..', 'public' );


export function CreateApp( Config, Archive, Live )
{
	const app = express();
	app.disable( 'x-powered-by' );
	app.use( express.json( { limit: '1mb' } ) );


	//-----------------------------------------------------------------
	app.get( '/api/health', function ( Request, Response )
	{
		Response.json( {
			ok: true,
			name: 'claudit',
			version: VERSION,
			port: Config.port,
			archive: Config.archive_folder,
			retention_days: Config.retention_days,
			sessions: Archive.Sessions().length,
			clients: Live.Count(),
		} );
	} );


	//-----------------------------------------------------------------
	app.post( '/api/events', async function ( Request, Response )
	{
		let events = Request.body;
		if ( !Array.isArray( events ) )
		{
			events = [ events ];
		}
		let accepted = 0;
		const refused = [];
		for ( const event of events )
		{
			if ( !event || typeof event !== 'object' || typeof event.session !== 'string' || typeof event.kind !== 'string' )
			{
				refused.push( 'an event needs a session and a kind' );
				continue;
			}
			try
			{
				const taken = await Archive.Append( event );
				event.archived = taken.archived;
				Live.Broadcast( event );
				accepted = accepted + 1;
			}
			catch ( error )
			{
				refused.push( error.message );
			}
		}
		if ( accepted === 0 && refused.length > 0 )
		{
			Response.status( 400 ).json( { accepted: 0, refused: refused } );
			return;
		}
		Response.status( 202 ).json( { accepted: accepted, refused: refused } );
	} );


	//-----------------------------------------------------------------
	app.get( '/api/live', function ( Request, Response )
	{
		const filter = typeof Request.query.session === 'string' ? Request.query.session : null;
		Live.Attach( Request, Response, filter );
	} );


	//-----------------------------------------------------------------
	app.get( '/api/sessions', function ( Request, Response )
	{
		const now = Date.now();
		const sessions = Archive.Sessions().map( function ( Summary )
		{
			return WithLive( Summary, Config, now );
		} );
		Response.json( { sessions: sessions } );
	} );


	//-----------------------------------------------------------------
	app.get( '/api/sessions/:id', async function ( Request, Response )
	{
		const summary = Archive.Session( Request.params.id );
		if ( !summary )
		{
			Response.status( 404 ).json( { error: 'no session ' + Request.params.id } );
			return;
		}
		const events = await Archive.Events( Request.params.id );
		Response.json( { session: WithLive( summary, Config, Date.now() ), events: events } );
	} );


	//-----------------------------------------------------------------
	app.use( express.static( PUBLIC_FOLDER ) );

	return app;
}


//---------------------------------------------------------------------
// A session is live while it has not ended and was active within the
// configured minutes.
//---------------------------------------------------------------------

export function WithLive( Summary, Config, Now )
{
	const copy = Object.assign( {}, Summary );
	const quiet_ms = Now - Summary.updated;
	copy.live = ( Summary.ended === null ) && ( quiet_ms < Config.live_minutes * 60 * 1000 );
	return copy;
}
