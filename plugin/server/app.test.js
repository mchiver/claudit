import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Start } from './server.js';


async function start_test_server()
{
	const folder = await fs.mkdtemp( path.join( os.tmpdir(), 'claudit-app-' ) );
	const started = await Start( { port: 0, archive_folder: folder, retention_days: 30 } );
	started.folder = folder;
	started.url = 'http://127.0.0.1:' + started.port;
	return started;
}


async function stop_test_server( Started )
{
	await Started.Close();
	await fs.rm( Started.folder, { recursive: true, force: true } );
}


//---------------------------------------------------------------------
test( 'health answers, and events flow into sessions', async function ()
{
	const started = await start_test_server();
	try
	{
		const health = await ( await fetch( started.url + '/api/health' ) ).json();
		assert.equal( health.ok, true );
		assert.equal( health.name, 'claudit' );
		assert.equal( health.sessions, 0 );

		const now = Date.now();
		const posted = await fetch( started.url + '/api/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( [
				{ kind: 'session', phase: 'start', session: 'abc', cwd: 'W:/x', time: now },
				{ kind: 'turn', phase: 'start', id: 't1', session: 'abc', agent: null, text: 'list the files', time: now + 5 },
				{ kind: 'message', id: 'm1', session: 'abc', turn: 't1', door: 'response', time: now + 8, message: { type: 'assistant', role: 'assistant', content: [ { type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'ls' } } ] } },
				{ kind: 'call', id: 'c1', session: 'abc', turn: 't1', tool: 'Bash', summary: 'ls', start: now + 10, end: now + 20, duration: 10, outcome: 'done' },
				{ kind: 'turn', phase: 'end', id: 't1', session: 'abc', agent: null, time: now + 30, duration: 25, reason: 'answer', usage: null },
			] ),
		} );
		assert.equal( posted.status, 202 );
		assert.deepEqual( await posted.json(), { accepted: 5, refused: [] } );

		const list = await ( await fetch( started.url + '/api/sessions' ) ).json();
		assert.equal( list.sessions.length, 1 );
		assert.equal( list.sessions[ 0 ].id, 'abc' );
		assert.equal( list.sessions[ 0 ].live, true );
		assert.equal( list.sessions[ 0 ].counts.calls, 1 );
		assert.equal( list.sessions[ 0 ].counts.turns, 1 );

		const one = await ( await fetch( started.url + '/api/sessions/abc' ) ).json();
		assert.equal( one.session.id, 'abc' );
		assert.equal( one.events.length, 5 );
		assert.deepEqual( one.events.map( function ( Event ) { return Event.kind; } ), [ 'session', 'turn', 'message', 'call', 'turn' ] );
		assert.equal( one.events[ 2 ].message.content[ 0 ].name, 'Bash' );

		const missing = await fetch( started.url + '/api/sessions/nope' );
		assert.equal( missing.status, 404 );

		const bad = await fetch( started.url + '/api/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { kind: 'call' } ),
		} );
		assert.equal( bad.status, 400 );
	}
	finally
	{
		await stop_test_server( started );
	}
} );


//---------------------------------------------------------------------
test( 'the live stream carries each posted event, filtered by session', async function ()
{
	const started = await start_test_server();
	try
	{
		const controller = new AbortController();
		const stream = await fetch( started.url + '/api/live?session=abc', { signal: controller.signal } );
		assert.equal( stream.status, 200 );
		assert.ok( stream.headers.get( 'content-type' ).startsWith( 'text/event-stream' ) );
		const reader = stream.body.getReader();
		const decoder = new TextDecoder();

		await fetch( started.url + '/api/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( [
				{ kind: 'call', id: 'other', session: 'zzz', tool: 'Read', summary: 'b', start: 1, outcome: 'running' },
				{ kind: 'call', id: 'c1', session: 'abc', tool: 'Bash', summary: 'ls', start: 1, outcome: 'running' },
			] ),
		} );

		let text = '';
		while ( !text.includes( '\n\n', text.indexOf( 'data:' ) ) || !text.includes( 'data:' ) )
		{
			const chunk = await reader.read();
			if ( chunk.done )
			{
				break;
			}
			text = text + decoder.decode( chunk.value, { stream: true } );
		}
		const data_lines = text.split( '\n' ).filter( function ( Line ) { return Line.startsWith( 'data:' ); } );
		assert.equal( data_lines.length, 1 );
		const event = JSON.parse( data_lines[ 0 ].slice( 5 ) );
		assert.equal( event.session, 'abc' );
		assert.equal( event.id, 'c1' );
		assert.equal( event.archived, false );

		const health = await ( await fetch( started.url + '/api/health' ) ).json();
		assert.equal( health.clients, 1 );

		controller.abort();
	}
	finally
	{
		await stop_test_server( started );
	}
} );


//---------------------------------------------------------------------
test( 'the web UI is served from public', async function ()
{
	const started = await start_test_server();
	try
	{
		const page = await fetch( started.url + '/' );
		assert.equal( page.status, 200 );
		const html = await page.text();
		assert.ok( html.includes( 'ng-app="claudit"' ) );
	}
	finally
	{
		await stop_test_server( started );
	}
} );
