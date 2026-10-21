//=====================================================================
// Claudit server: start-up.
//
//   node server/server.js [--port N] [--archive <folder>] [--retention <days>]
//
// Loads the configuration, opens the archive, prunes it, serves the
// API and the web UI, and prunes again once a day. Start() is exported
// for tests, which run it on port 0 and a temporary archive.
//=====================================================================

import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LoadConfig, ParseArguments } from './config.js';
import { Archive } from './archive.js';
import { Live } from './live.js';
import { CreateApp } from './app.js';


const PRUNE_EVERY_MS = 24 * 60 * 60 * 1000;


//---------------------------------------------------------------------
// Starts the server and resolves { config, archive, live, server,
// port, Close }.
//---------------------------------------------------------------------

export async function Start( Overrides )
{
	const config = LoadConfig( Overrides );
	const archive = new Archive( config.archive_folder );
	await archive.Open();
	const pruned = await archive.Prune( config.retention_days );
	const live = new Live();
	const app = CreateApp( config, archive, live );
	const server = http.createServer( app );

	await new Promise( function ( Resolve, Reject )
	{
		server.once( 'error', Reject );
		server.listen( config.port, config.host, Resolve );
	} );
	const port = server.address().port;

	const prune_timer = setInterval( async function ()
	{
		try
		{
			await archive.Prune( config.retention_days );
		}
		catch ( error )
		{
			console.error( 'claudit: pruning failed: ' + error.message );
		}
	}, PRUNE_EVERY_MS );
	prune_timer.unref();

	async function Close()
	{
		clearInterval( prune_timer );
		live.Close();
		await new Promise( function ( Resolve )
		{
			server.close( Resolve );
		} );
	}

	return { config: config, archive: archive, live: live, server: server, port: port, pruned: pruned, Close: Close };
}


//---------------------------------------------------------------------

async function main()
{
	const overrides = ParseArguments( process.argv.slice( 2 ) );
	const started = await Start( overrides );
	const config = started.config;
	console.log( 'claudit server ' + new Date().toISOString() );
	console.log( '  listening on http://' + config.host + ':' + started.port );
	console.log( '  archive ' + config.archive_folder + ' (' + started.archive.Sessions().length + ' sessions, retention ' + config.retention_days + ' days' + ( started.pruned.length ? ', pruned ' + started.pruned.join( ' ' ) : '' ) + ')' );
	console.log( '  config ' + config.config_path );

	function shutdown()
	{
		started.Close().then( function () { process.exit( 0 ); } );
	}
	process.on( 'SIGINT', shutdown );
	process.on( 'SIGTERM', shutdown );
}


//---------------------------------------------------------------------

const is_main = process.argv[ 1 ] && ( pathToFileURL( path.resolve( process.argv[ 1 ] ) ).href === import.meta.url );
if ( is_main )
{
	main().catch( function ( error )
	{
		console.error( 'claudit server failed to start: ' + error.message );
		process.exit( 1 );
	} );
}

export const SERVER_FILE = fileURLToPath( import.meta.url );
