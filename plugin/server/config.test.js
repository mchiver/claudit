//=====================================================================
// Claudit server: configuration tests.
//=====================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import { ParseArguments, ParsePortVariable } from './config.js';


//---------------------------------------------------------------------

test( 'ParsePortVariable reads the port from the value of CLAUDIT_PORT', function ()
{
	assert.deepEqual( ParsePortVariable( '41800' ), { port: 41800 } );
	assert.deepEqual( ParsePortVariable( undefined ), {} );
	assert.deepEqual( ParsePortVariable( '' ), {} );
} );


//---------------------------------------------------------------------

test( 'the command line wins over CLAUDIT_PORT', function ()
{
	const from_environment = ParsePortVariable( '41800' );
	const from_arguments = ParseArguments( [ '--port', '41900' ] );
	const overrides = Object.assign( {}, from_environment, from_arguments );
	assert.equal( overrides.port, 41900 );
} );
