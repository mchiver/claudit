//=====================================================================
// Claudit server: the detached launcher.
//
//   node server/launch.js [--port N]
//
// The port can also come in CLAUDIT_PORT; --port wins over it.
// The mod runs this through the engine's process runner, from the
// plugin's folder, with the port in CLAUDIT_PORT. It starts
// server/server.js detached from this process, with its output in the
// configured log file, and exits at once, so the server outlives both
// the launcher and the Claude Code session that asked for it.
//=====================================================================

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { LoadConfig, ParseArguments, ParseEnvironment } from './config.js';


const HERE = path.dirname( fileURLToPath( import.meta.url ) );
const SERVER = path.join( HERE, 'server.js' );


function main()
{
	const from_environment = ParseEnvironment( process.env );
	const from_arguments = ParseArguments( process.argv.slice( 2 ) );
	const overrides = Object.assign( {}, from_environment, from_arguments );
	const config = LoadConfig( overrides );

	fs.mkdirSync( path.dirname( config.log_file ), { recursive: true } );
	const log = fs.openSync( config.log_file, 'a' );

	const argv = [ SERVER, '--port', String( config.port ) ];
	const child = spawn( process.execPath, argv, {
		detached: true,
		stdio: [ 'ignore', log, log ],
		windowsHide: true,
		cwd: path.join( HERE, '..' ),
	} );
	child.unref();
	fs.closeSync( log );

	console.log( 'claudit server started, pid ' + child.pid + ', port ' + config.port + ', log ' + config.log_file );
}


main();
