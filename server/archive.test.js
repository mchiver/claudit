import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Archive, DayOf } from './archive.js';


async function temporary_folder()
{
	return fs.mkdtemp( path.join( os.tmpdir(), 'claudit-archive-' ) );
}


//---------------------------------------------------------------------
test( 'Append: a session grows a summary and a JSON Lines file; running calls are live only', async function ()
{
	const folder = await temporary_folder();
	const archive = new Archive( folder );
	await archive.Open();

	const start = new Date( 2026, 9, 21, 10, 0, 0 ).getTime();
	await archive.Append( { kind: 'session', phase: 'start', session: 's1', cwd: 'W:/x', time: start } );
	const running = await archive.Append( { kind: 'call', id: 'c1', session: 's1', tool: 'Bash', summary: 'ls', start: start + 1000, outcome: 'running' } );
	assert.equal( running.archived, false );
	await archive.Append( { kind: 'call', id: 'c1', session: 's1', tool: 'Bash', summary: 'ls', start: start + 1000, end: start + 1500, duration: 500, outcome: 'done' } );
	await archive.Append( { kind: 'call', id: 'c2', session: 's1', tool: 'Edit', summary: 'a.md', start: start + 2000, end: start + 2100, duration: 100, outcome: 'denied' } );
	await archive.Append( { kind: 'session', phase: 'end', session: 's1', time: start + 5000 } );

	const sessions = archive.Sessions();
	assert.equal( sessions.length, 1 );
	const summary = sessions[ 0 ];
	assert.equal( summary.id, 's1' );
	assert.equal( summary.cwd, 'W:/x' );
	assert.equal( summary.started, start );
	assert.equal( summary.ended, start + 5000 );
	assert.equal( summary.updated, start + 5000 );
	assert.deepEqual( summary.counts, { calls: 2, done: 1, denied: 1, failed: 0 } );
	assert.equal( summary.folder, DayOf( start ) );

	const events = await archive.Events( 's1' );
	assert.equal( events.length, 4 );
	assert.deepEqual( events.map( function ( Event ) { return Event.kind + ':' + ( Event.outcome || Event.phase ); } ),
		[ 'session:start', 'call:done', 'call:denied', 'session:end' ] );

	const names = await fs.readdir( path.join( folder, DayOf( start ) ) );
	names.sort();
	assert.deepEqual( names, [ 's1.json', 's1.jsonl' ] );

	await fs.rm( folder, { recursive: true, force: true } );
} );


//---------------------------------------------------------------------
test( 'Open reads the summaries back; Sessions lists newest first', async function ()
{
	const folder = await temporary_folder();
	const first = new Archive( folder );
	await first.Open();
	await first.Append( { kind: 'session', phase: 'start', session: 'old', time: 1000 } );
	await first.Append( { kind: 'session', phase: 'start', session: 'new', time: 2000 } );

	const second = new Archive( folder );
	const count = await second.Open();
	assert.equal( count, 2 );
	assert.deepEqual( second.Sessions().map( function ( Summary ) { return Summary.id; } ), [ 'new', 'old' ] );
	assert.equal( second.Session( 'missing' ), null );
	assert.equal( await second.Events( 'missing' ), null );

	await fs.rm( folder, { recursive: true, force: true } );
} );


//---------------------------------------------------------------------
test( 'Prune removes day folders older than the retention; 0 keeps everything', async function ()
{
	const folder = await temporary_folder();
	const archive = new Archive( folder );
	await archive.Open();
	const now = Date.now();
	const day = 24 * 60 * 60 * 1000;
	await archive.Append( { kind: 'session', phase: 'start', session: 'ancient', time: now - 40 * day } );
	await archive.Append( { kind: 'session', phase: 'start', session: 'recent', time: now - 2 * day } );

	assert.deepEqual( await archive.Prune( 0, now ), [] );
	assert.equal( archive.Sessions().length, 2 );

	const removed = await archive.Prune( 30, now );
	assert.deepEqual( removed, [ DayOf( now - 40 * day ) ] );
	assert.deepEqual( archive.Sessions().map( function ( Summary ) { return Summary.id; } ), [ 'recent' ] );
	assert.deepEqual( await archive.DayFolders(), [ DayOf( now - 2 * day ) ] );

	await fs.rm( folder, { recursive: true, force: true } );
} );


//---------------------------------------------------------------------
test( 'Append refuses an event without a session', async function ()
{
	const folder = await temporary_folder();
	const archive = new Archive( folder );
	await archive.Open();
	await assert.rejects( archive.Append( { kind: 'call' } ), /needs a session/ );
	await fs.rm( folder, { recursive: true, force: true } );
} );
