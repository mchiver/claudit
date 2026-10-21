import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Summarise, OutcomeOf, FormatClock, FormatDuration, FormatStatus, FormatBlock, BlockHeader, BlockRows, PadLeft, PadRight, CutToFit, ByteLength, SUMMARY_LENGTH } from './format.js';


//---------------------------------------------------------------------
test( 'Summarise: a shell call is its description, else its command', function ()
{
	assert.equal( Summarise( { tool: 'Bash', command: 'ls -la', description: 'List files' } ), 'List files' );
	assert.equal( Summarise( { tool: 'Bash', command: 'ls -la\necho done' } ), 'ls -la' );
} );


//---------------------------------------------------------------------
test( 'Summarise: file tools give the path, search tools the pattern', function ()
{
	assert.equal( Summarise( { tool: 'Read', file_path: 'W:/x/y.js' } ), 'W:/x/y.js' );
	assert.equal( Summarise( { tool: 'Edit', file_path: 'a.md' } ), 'a.md' );
	assert.equal( Summarise( { tool: 'Grep', pattern: 'TODO' } ), 'TODO' );
	assert.equal( Summarise( { tool: 'Glob', pattern: '**/*.js' } ), '**/*.js' );
} );


//---------------------------------------------------------------------
test( 'Summarise: an unknown tool or an empty input is the tool name', function ()
{
	assert.equal( Summarise( { tool: 'mcp__thing__do' } ), 'mcp__thing__do' );
	assert.equal( Summarise( { tool: 'Bash', command: '   ' } ), 'Bash' );
} );


//---------------------------------------------------------------------
test( 'Summarise: a long line is cut to SUMMARY_LENGTH', function ()
{
	const long = 'x'.repeat( 500 );
	const summary = Summarise( { tool: 'Bash', description: long } );
	assert.equal( summary.length, SUMMARY_LENGTH );
	assert.ok( summary.endsWith( '…' ) );
} );


//---------------------------------------------------------------------
test( 'OutcomeOf: denied, failed, done', function ()
{
	assert.equal( OutcomeOf( { deny: 'no' } ), 'denied' );
	assert.equal( OutcomeOf( { result: {}, isError: true } ), 'failed' );
	assert.equal( OutcomeOf( { result: {} } ), 'done' );
	assert.equal( OutcomeOf( null ), 'failed' );
} );


//---------------------------------------------------------------------
test( 'FormatClock and FormatDuration read as people do', function ()
{
	const noon = new Date( 2026, 9, 21, 12, 5, 9 ).getTime();
	assert.equal( FormatClock( noon ), '12:05:09' );
	assert.equal( FormatDuration( 850 ), '850ms' );
	assert.equal( FormatDuration( 1234 ), '1.2s' );
	assert.equal( FormatDuration( 65000 ), '1m05s' );
	assert.equal( FormatDuration( null ), '' );
} );


//---------------------------------------------------------------------
test( 'FormatStatus names the call in flight and the count', function ()
{
	const calls = [
		{ tool: 'Read', summary: 'a.js', start: 0, outcome: 'done' },
		{ tool: 'Bash', summary: 'Run tests', start: 1000, outcome: 'running' },
	];
	const line = FormatStatus( calls, 3100 );
	assert.equal( line, 'Bash 2.1s  Run tests  (2 calls this turn)' );
	assert.equal( FormatStatus( [ calls[ 0 ] ], 5000 ), '1 call this turn' );
} );


//---------------------------------------------------------------------
test( 'FormatBlock: a header and one line per call; empty with no calls', function ()
{
	assert.equal( FormatBlock( [], 'abc' ), '' );
	const start = new Date( 2026, 9, 21, 9, 30, 0 ).getTime();
	const calls = [
		{ tool: 'Bash', summary: 'List files', start: start, duration: 1200, outcome: 'done', agent: null },
		{ tool: 'Edit', summary: 'a.md', start: start + 2000, duration: 300, outcome: 'denied', agent: 'agent-12345678' },
	];
	const block = FormatBlock( calls, 'session-abcdefgh-rest' );
	const lines = block.split( '\n' );
	assert.equal( lines.length, 3 );
	assert.equal( lines[ 0 ], 'claudit · session session- · 2 tool calls' );
	assert.ok( lines[ 1 ].startsWith( '09:30:00     1.2s  Bash        List files' ) );
	assert.ok( lines[ 2 ].includes( '[denied]' ) );
	assert.ok( lines[ 2 ].includes( '(agent agent-12)' ) );
} );


//---------------------------------------------------------------------
test( 'ByteLength counts UTF-8 bytes', function ()
{
	assert.equal( ByteLength( 'abc' ), 3 );
	assert.equal( ByteLength( 'é' ), 2 );
	assert.equal( ByteLength( '€' ), 3 );
	assert.equal( ByteLength( '😀' ), 4 );
} );


//---------------------------------------------------------------------
test( 'CutToFit leaves a row under the limit as it is, and cuts nothing with no limit', function ()
{
	const row = { type: 'user', content: [ { type: 'text', text: 'short' } ] };
	const same = CutToFit( row, 1000 );
	assert.equal( same.row, row );
	assert.equal( same.truncated, false );
	const big = { type: 'user', content: [ { type: 'text', text: 'x'.repeat( 5000 ) } ] };
	assert.equal( CutToFit( big, 0 ).row, big );
	assert.equal( CutToFit( big, 0 ).truncated, false );
} );


//---------------------------------------------------------------------
test( 'CutToFit shortens text, thinking and tool results until the JSON fits, and marks the cut', function ()
{
	const row = {
		type: 'user',
		content: [
			{ type: 'tool_result', tool_use_id: 't1', content: 'a'.repeat( 100000 ) },
			{ type: 'tool_result', tool_use_id: 't2', content: [ { type: 'text', text: 'b'.repeat( 30000 ) } ] },
			{ type: 'text', text: 'c'.repeat( 10000 ) },
			{ type: 'thinking', thinking: 'd'.repeat( 10000 ) },
			{ type: 'image', source: { data: 'e'.repeat( 200 ) } },
		],
	};
	const cut = CutToFit( row, 65536 );
	assert.equal( cut.truncated, true );
	assert.notEqual( cut.row, row );
	assert.ok( ByteLength( JSON.stringify( cut.row ) ) <= 65536 );
	assert.equal( row.content[ 0 ].content.length, 100000 );
	assert.ok( cut.row.content[ 0 ].content.includes( '[claudit cut ' ) );
	assert.ok( cut.row.content[ 1 ].content[ 0 ].text.includes( '[claudit cut ' ) );
	assert.ok( cut.row.content[ 2 ].text.includes( '[claudit cut ' ) );
	assert.ok( cut.row.content[ 3 ].thinking.includes( '[claudit cut ' ) );
	assert.equal( cut.row.content[ 4 ].source.data.length, 200 );
} );


//---------------------------------------------------------------------
test( 'CutToFit cuts a plain text object too, as the turn start uses it', function ()
{
	const cut = CutToFit( { text: 'y'.repeat( 1000 ) }, 300 );
	assert.equal( cut.truncated, true );
	assert.ok( cut.row.text.length < 1000 );
	assert.ok( ByteLength( JSON.stringify( cut.row ) ) <= 300 );
} );

//---------------------------------------------------------------------
test( 'BlockHeader names the session, the end time when given, and the count', function ()
{
	const ended = new Date( 2026, 9, 21, 12, 1, 5 ).getTime();
	assert.equal( BlockHeader( [ {} ], 'session-abcdefgh-rest' ), 'claudit · session session- · 1 tool call' );
	assert.equal( BlockHeader( [ {}, {}, {} ], '0d9fcdd9-6baf', ended ), 'claudit · session 0d9fcdd9 · 12:01:05 · 3 tool calls' );
	assert.ok( FormatBlock( [ { tool: 'Read', summary: 'a', start: ended, duration: 5, outcome: 'done' } ], '0d9fcdd9-6baf', ended ).startsWith( 'claudit · session 0d9fcdd9 · 12:01:05 · 1 tool call' ) );
} );


//---------------------------------------------------------------------
test( 'BlockRows gives one row of strings per call, flagging denied and failed', function ()
{
	const start = new Date( 2026, 9, 21, 9, 30, 0 ).getTime();
	const rows = BlockRows( [
		{ tool: 'Bash', summary: 'List files', start: start, duration: 1200, outcome: 'done', agent: null },
		{ tool: 'Edit', summary: 'a.md', start: start + 2000, duration: 300, outcome: 'denied', agent: 'agent-12345678' },
	] );
	assert.equal( rows.length, 2 );
	assert.deepEqual( rows[ 0 ], { clock: '09:30:00', duration: '1.2s', tool: 'Bash', summary: 'List files', outcome: 'done', agent: '', flagged: false } );
	assert.deepEqual( rows[ 1 ], { clock: '09:30:02', duration: '300ms', tool: 'Edit', summary: 'a.md', outcome: 'denied', agent: 'agent-12', flagged: true } );
	assert.deepEqual( BlockRows( [] ), [] );
	assert.equal( PadLeft( '1.2s', 7 ), '   1.2s' );
	assert.equal( PadRight( 'Bash', 6 ), 'Bash  ' );
} );
