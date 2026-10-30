//=====================================================================
// Claudit server: the application and its API, on node:http alone.
//
//   POST /api/events          the mod posts one event or a batch (a
//                             body of at most BODY_LIMIT bytes)
//   GET  /api/live            Server-Sent Events, ?session= to filter
//   GET  /api/sessions        the sessions, newest first, with summaries
//   GET  /api/sessions/<id>   one session's summary and archived events
//   GET  /api/health          the mod's start-up check
//   /                         the web UI (public/)
//
// CreateApp takes the configuration, the archive and the live hub and
// returns the request listener that http.createServer takes, so a test
// can build one on a temporary folder and a free port. The server has
// no dependencies: an installed copy of the plugin has no node_modules.
//=====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const VERSION = '0.6.6';
const BODY_LIMIT = 8 * 1024 * 1024;
const PUBLIC_FOLDER = path.join( path.dirname( fileURLToPath( import.meta.url ) ), '..', 'public' );

const CONTENT_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
};


export function CreateApp( Config, Archive, Live )
{

	//-----------------------------------------------------------------
	// The API routes: method, a pattern on the path (its group is the
	// route's parameter), and the handler.
	//-----------------------------------------------------------------

	const ROUTES = [
		{ method: 'GET', pattern: /^\/api\/health$/, handler: health },
		{ method: 'POST', pattern: /^\/api\/events$/, handler: post_events },
		{ method: 'GET', pattern: /^\/api\/live$/, handler: live_stream },
		{ method: 'GET', pattern: /^\/api\/sessions$/, handler: list_sessions },
		{ method: 'GET', pattern: /^\/api\/sessions\/([^/]+)$/, handler: one_session },
	];


	//-----------------------------------------------------------------
	async function health( Request, Response )
	{
		send_json( Response, 200, {
			ok: true,
			name: 'claudit',
			version: VERSION,
			port: Config.port,
			archive: Config.archive_folder,
			retention_days: Config.retention_days,
			sessions: Archive.Sessions().length,
			clients: Live.Count(),
		} );
	}


	//-----------------------------------------------------------------
	async function post_events( Request, Response )
	{
		let events;
		try
		{
			events = await read_json( Request );
		}
		catch ( error )
		{
			send_json( Response, error.status || 400, { error: error.message } );
			return;
		}
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
			send_json( Response, 400, { accepted: 0, refused: refused } );
			return;
		}
		send_json( Response, 202, { accepted: accepted, refused: refused } );
	}


	//-----------------------------------------------------------------
	async function live_stream( Request, Response, Url )
	{
		const filter = Url.searchParams.get( 'session' );
		Live.Attach( Request, Response, filter );
	}


	//-----------------------------------------------------------------
	async function list_sessions( Request, Response )
	{
		const now = Date.now();
		const sessions = Archive.Sessions().map( function ( Summary )
		{
			return WithLive( Summary, Config, now );
		} );
		send_json( Response, 200, { sessions: sessions } );
	}


	//-----------------------------------------------------------------
	async function one_session( Request, Response, Url, Id )
	{
		const summary = Archive.Session( Id );
		if ( !summary )
		{
			send_json( Response, 404, { error: 'no session ' + Id } );
			return;
		}
		const events = await Archive.Events( Id );
		send_json( Response, 200, { session: WithLive( summary, Config, Date.now() ), events: events } );
	}


	//-----------------------------------------------------------------
	// The listener: an API route when one matches, else a file from
	// public/, else 404. An error in a handler answers 500.
	//-----------------------------------------------------------------

	return async function app( Request, Response )
	{
		try
		{
			const url = new URL( Request.url, 'http://' + ( Request.headers.host || Config.host ) );
			for ( const route of ROUTES )
			{
				if ( route.method !== Request.method )
				{
					continue;
				}
				const match = route.pattern.exec( url.pathname );
				if ( !match )
				{
					continue;
				}
				await route.handler( Request, Response, url, match[ 1 ] );
				return;
			}
			await serve_file( Request, Response, url );
		}
		catch ( error )
		{
			if ( Response.headersSent )
			{
				Response.destroy();
				return;
			}
			send_json( Response, 500, { error: error.message } );
		}
	};
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


//---------------------------------------------------------------------
// A JSON answer with its length, so the connection can be kept.
//---------------------------------------------------------------------

function send_json( Response, Status, Value )
{
	const text = JSON.stringify( Value );
	Response.writeHead( Status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': Buffer.byteLength( text ),
	} );
	Response.end( text );
}


//---------------------------------------------------------------------
// The request body as JSON. An empty body is an empty object; a body
// over BODY_LIMIT is refused with 413, one that is not JSON with 400.
//---------------------------------------------------------------------

function read_json( Request )
{
	return new Promise( function ( Resolve, Reject )
	{
		const chunks = [];
		let size = 0;
		let refused = false;

		Request.on( 'data', function ( Chunk )
		{
			if ( refused )
			{
				return;
			}
			size = size + Chunk.length;
			if ( size > BODY_LIMIT )
			{
				refused = true;
				const error = new Error( 'the body is larger than ' + BODY_LIMIT + ' bytes' );
				error.status = 413;
				Reject( error );
				return;
			}
			chunks.push( Chunk );
		} );

		Request.on( 'end', function ()
		{
			if ( refused )
			{
				return;
			}
			const text = Buffer.concat( chunks ).toString( 'utf8' ).trim();
			if ( text === '' )
			{
				Resolve( {} );
				return;
			}
			try
			{
				Resolve( JSON.parse( text ) );
			}
			catch ( error )
			{
				Reject( new Error( 'the body is not JSON: ' + error.message ) );
			}
		} );

		Request.on( 'error', Reject );
	} );
}


//---------------------------------------------------------------------
// A file under public/: the root is index.html, the content type comes
// from the extension, and nothing outside the folder is reachable.
// Anything else, and any method but GET and HEAD, is 404.
//---------------------------------------------------------------------

async function serve_file( Request, Response, Url )
{
	if ( Request.method !== 'GET' && Request.method !== 'HEAD' )
	{
		send_json( Response, 404, { error: 'no route ' + Request.method + ' ' + Url.pathname } );
		return;
	}
	let relative;
	try
	{
		relative = decodeURIComponent( Url.pathname );
	}
	catch ( error )
	{
		send_json( Response, 400, { error: 'a path that cannot be decoded' } );
		return;
	}
	if ( relative.endsWith( '/' ) )
	{
		relative = relative + 'index.html';
	}
	const file = path.normalize( path.join( PUBLIC_FOLDER, relative ) );
	if ( !file.startsWith( PUBLIC_FOLDER + path.sep ) )
	{
		send_json( Response, 404, { error: 'not found' } );
		return;
	}
	let stats;
	try
	{
		stats = await fs.promises.stat( file );
	}
	catch ( error )
	{
		stats = null;
	}
	if ( !stats || !stats.isFile() )
	{
		send_json( Response, 404, { error: 'not found' } );
		return;
	}
	const type = CONTENT_TYPES[ path.extname( file ).toLowerCase() ] || 'application/octet-stream';
	Response.writeHead( 200, {
		'Content-Type': type,
		'Content-Length': stats.size,
		'Cache-Control': 'no-cache',
	} );
	if ( Request.method === 'HEAD' )
	{
		Response.end();
		return;
	}
	const stream = fs.createReadStream( file );
	stream.on( 'error', function ()
	{
		Response.destroy();
	} );
	stream.pipe( Response );
}
