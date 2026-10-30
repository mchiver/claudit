//=====================================================================
// Claudit server: configuration tests.
//=====================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import { ParseArguments, ParseEnvironment } from './config.js';


//---------------------------------------------------------------------

test( 'ParseEnvironment reads the port from CLAUDIT_PORT', function ()
{
	assert.deepEqual( ParseEnvironment( { CLAUDIT_PORT: '41800' } ), { port: 41800 } );
	assert.deepEqual( ParseEnvironment( {} ), {} );
	assert.deepEqual( ParseEnvironment( { CLAUDIT_PORT: '' } ), {} );
} );


//---------------------------------------------------------------------

test( 'the command line wins over CLAUDIT_PORT', function ()
{
	const from_environment = ParseEnvironment( { CLAUDIT_PORT: '41800' } );
	const from_arguments = ParseArguments( [ '--port', '41900' ] );
	const overrides = Object.assign( {}, from_environment, from_arguments );
	assert.equal( overrides.port, 41900 );
} );
