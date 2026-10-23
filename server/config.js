//=====================================================================
// Claudit server: configuration.
//
// Defaults, over which ~/.claudit/config.json is read, over which the
// command line's values go. Every value a user might want different is
// here, named as the file names it.
//=====================================================================

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';


export const DEFAULTS = {
	port: 3600,
	host: '127.0.0.1',
	archive_folder: '~/.claudit/archive',
	retention_days: 30,
	live_minutes: 30,
	log_file: '~/.claudit/server.log',
};


//---------------------------------------------------------------------

export function ClauditFolder()
{
	return path.join( os.homedir(), '.claudit' );
}


//---------------------------------------------------------------------

export function ConfigPath()
{
	return path.join( ClauditFolder(), 'config.json' );
}


//---------------------------------------------------------------------
// A path that starts with ~ is under the home folder.
//---------------------------------------------------------------------

export function ExpandHome( Path )
{
	if ( typeof Path !== 'string' )
	{
		return Path;
	}
	if ( Path === '~' )
	{
		return os.homedir();
	}
	if ( Path.startsWith( '~/' ) || Path.startsWith( '~\\' ) )
	{
		return path.join( os.homedir(), Path.slice( 2 ) );
	}
	return Path;
}


//---------------------------------------------------------------------
// The configuration in force: defaults, the file, then Overrides.
// A missing or unreadable file counts as empty.
//---------------------------------------------------------------------

export function LoadConfig( Overrides )
{
	let from_file = {};
	const config_path = ConfigPath();
	if ( fs.existsSync( config_path ) )
	{
		try
		{
			from_file = JSON.parse( fs.readFileSync( config_path, 'utf8' ) );
		}
		catch ( error )
		{
			from_file = {};
		}
	}
	const config = Object.assign( {}, DEFAULTS, from_file, clean( Overrides ) );
	config.port = Number( config.port );
	if ( Number.isNaN( config.port ) || config.port < 0 )
	{
		config.port = DEFAULTS.port;
	}
	config.retention_days = Number( config.retention_days );
	if ( Number.isNaN( config.retention_days ) || config.retention_days < 0 )
	{
		config.retention_days = DEFAULTS.retention_days;
	}
	config.live_minutes = Number( config.live_minutes ) || DEFAULTS.live_minutes;
	config.archive_folder = ExpandHome( config.archive_folder );
	config.log_file = ExpandHome( config.log_file );
	config.config_path = config_path;
	return config;
}


//---------------------------------------------------------------------
// Overrides without the undefined values, so they do not shadow.
//---------------------------------------------------------------------

function clean( Overrides )
{
	const result = {};
	if ( !Overrides )
	{
		return result;
	}
	for ( const key of Object.keys( Overrides ) )
	{
		if ( Overrides[ key ] !== undefined && Overrides[ key ] !== null )
		{
			result[ key ] = Overrides[ key ];
		}
	}
	return result;
}


//---------------------------------------------------------------------
// Reads --port and the like from an argument vector.
//---------------------------------------------------------------------

export function ParseArguments( Argv )
{
	const result = {};
	for ( let index = 0; index < Argv.length; index++ )
	{
		const word = Argv[ index ];
		if ( word === '--port' )
		{
			result.port = Number( Argv[ index + 1 ] );
			index++;
		}
		else if ( word === '--archive' )
		{
			result.archive_folder = Argv[ index + 1 ];
			index++;
		}
		else if ( word === '--retention' )
		{
			result.retention_days = Number( Argv[ index + 1 ] );
			index++;
		}
	}
	return result;
}
