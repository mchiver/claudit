//=====================================================================
// Claudit server: the detached launcher.
//
//   node server/launch.js [--port N]
//
// The mod runs this through the engine's process runner. It starts
// server/server.js detached from this process, with its output in the
// configured log file, and exits at once, so the server outlives both
// the launcher and the Claude Code session that asked for it.
//=====================================================================

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { LoadConfig, ParseArguments } from './config.js';


const HERE = path.dirname( fileURLToPath( import.meta.url ) );
const SERVER = path.join( HERE, 'server.js' );


function main()
{
	const overrides = ParseArguments( process.argv.slice( 2 ) );
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
