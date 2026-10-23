import { test } from 'node:test';
import assert from 'node:assert/strict';

await import( './turns.js' );
const TURNS = globalThis.ClauditTurns;


//---------------------------------------------------------------------
function sample_events()
{
	return [
		{ kind: 'session', phase: 'start', session: 's', cwd: 'W:/x', time: 0 },
		{ kind: 'turn', phase: 'start', id: 't1', session: 's', agent: null, text: 'hello\nworld', time: 1 },
		{ kind: 'message', id: 'm1', session: 's', turn: 't1', door: 'prompt', time: 2, message: { type: 'user', content: [ { type: 'text', text: 'hello\nworld' } ] } },
		{ kind: 'message', id: 'm1b', session: 's', turn: 't1', door: 'attachment', time: 2, message: { type: 'attachment', name: 'queued_command', content: [ { type: 'text', text: 'engine text' } ] } },
		{ kind: 'message', id: 'm2', session: 's', turn: 't1', door: 'response', time: 3, message: { type: 'assistant', content: [ { type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'I will look' }, { type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'ls' } } ] } },
		{ kind: 'call', id: 'c1', session: 's', turn: 't1', tool: 'Bash', summary: 'List files', start: 4, end: 5, duration: 1, outcome: 'done' },
		{ kind: 'message', id: 'm3', session: 's', turn: 't1', door: 'tool-result', time: 5, message: { type: 'user', content: [ { type: 'tool_result', tool_use_id: 'c1', content: 'a b' } ] } },
		{ kind: 'message', id: 'm4', session: 's', turn: 't1', door: 'response', time: 6, message: { type: 'assistant', content: [ { type: 'text', text: 'Done.' } ] } },
		{ kind: 'turn', phase: 'end', id: 't1', session: 's', agent: null, time: 7, duration: 6, reason: 'answer', usage: null },
		{ kind: 'call', id: 'c9', session: 's', turn: null, tool: 'Read', summary: 'old.js', start: 8, end: 9, duration: 1, outcome: 'failed' },
		{ kind: 'turn', phase: 'start', id: 't2', session: 's', agent: 'agent-1', text: 'sub task', time: 10 },
		{ kind: 'call', id: 'c2', session: 's', turn: 't2', agent: 'agent-1', tool: 'Grep', summary: 'TODO', start: 11, outcome: 'running' },
		{ kind: 'session', phase: 'end', session: 's', time: 12 },
	];
}


//---------------------------------------------------------------------
test( 'BuildTurns: turns hold their rows in order, calls carry input and result', function ()
{
	const nodes = TURNS.BuildTurns( sample_events() );
	assert.deepEqual( nodes.map( function ( Node ) { return Node.kind; } ), [ 'session', 'turn', 'turn', 'turn', 'session' ] );

	const turn = nodes[ 1 ];
	assert.equal( turn.id, 't1' );
	assert.equal( turn.line, 'hello' );
	assert.equal( turn.text, 'hello\nworld' );
	assert.equal( turn.start, 1 );
	assert.equal( turn.end, 7 );
	assert.equal( turn.duration, 6 );
	assert.equal( turn.reason, 'answer' );
	assert.equal( turn.prompt.id, 'm1' );
	assert.deepEqual( turn.rows.map( function ( Row ) { return Row.kind + ':' + ( Row.label || Row.line ); } ),
		[ 'engine:queued_command', 'engine:thinking', 'text:I will look', 'call:List files', 'text:Done.' ] );
	assert.deepEqual( turn.counts, { calls: 1, done: 1, denied: 0, failed: 0, running: 0 } );

	const call = turn.rows[ 3 ];
	assert.equal( call.call.id, 'c1' );
	assert.equal( call.input.block.name, 'Bash' );
	assert.deepEqual( call.input.block.input, { command: 'ls' } );
	assert.equal( call.result.block.content, 'a b' );
	assert.equal( call.result.event.id, 'm3' );
} );


//---------------------------------------------------------------------
test( 'BuildTurns: events without a turn fall into a synthetic turn; a subagent turn keeps its agent', function ()
{
	const nodes = TURNS.BuildTurns( sample_events() );
	const untagged = nodes[ 2 ];
	assert.equal( untagged.synthetic, true );
	assert.equal( untagged.line, '(no turn recorded)' );
	assert.equal( untagged.rows.length, 1 );
	assert.equal( untagged.counts.failed, 1 );

	const sub = nodes[ 3 ];
	assert.equal( sub.agent, 'agent-1' );
	assert.equal( sub.end, null );
	assert.equal( sub.counts.running, 1 );
	assert.equal( sub.rows[ 0 ].agent, 'agent-1' );
} );


//---------------------------------------------------------------------
test( 'BuildTurns: a result or input that arrives before its call is attached when the call comes', function ()
{
	const nodes = TURNS.BuildTurns( [
		{ kind: 'turn', phase: 'start', id: 't', text: 'x', time: 1 },
		{ kind: 'message', id: 'r', turn: 't', door: 'tool-result', time: 2, message: { type: 'user', content: [ { type: 'tool_result', tool_use_id: 'c', content: 'out' } ] } },
		{ kind: 'message', id: 'i', turn: 't', door: 'response', time: 3, message: { type: 'assistant', content: [ { type: 'tool_use', id: 'c', name: 'Read', input: { file_path: 'a' } } ] } },
		{ kind: 'call', id: 'c', turn: 't', tool: 'Read', summary: 'a', start: 4, outcome: 'done' },
	] );
	const call = nodes[ 0 ].rows[ 0 ];
	assert.equal( call.kind, 'call' );
	assert.equal( call.input.block.name, 'Read' );
	assert.equal( call.result.block.content, 'out' );
} );


//---------------------------------------------------------------------
test( 'BuildTurns: a finished call replaces its running one; a turn end without a start still makes a turn', function ()
{
	const nodes = TURNS.BuildTurns( [
		{ kind: 'call', id: 'c', turn: 't', tool: 'Bash', summary: 'go', start: 4, outcome: 'running' },
		{ kind: 'call', id: 'c', turn: 't', tool: 'Bash', summary: 'go', start: 4, end: 6, duration: 2, outcome: 'done' },
		{ kind: 'turn', phase: 'end', id: 't', time: 7, duration: 6, reason: 'aborted' },
	] );
	assert.equal( nodes.length, 1 );
	assert.equal( nodes[ 0 ].rows.length, 1 );
	assert.equal( nodes[ 0 ].rows[ 0 ].call.outcome, 'done' );
	assert.equal( nodes[ 0 ].reason, 'aborted' );
	assert.equal( nodes[ 0 ].start, 1 );
	assert.equal( TURNS.FirstLine( '\n\n  second  \nthird' ), 'second' );
	assert.equal( TURNS.FirstLine( 'z'.repeat( 400 ) ).length, 160 );
} );

//---------------------------------------------------------------------
test( 'InputFields: a string as text, a number or boolean plain, an object as JSON', function ()
{
	const fields = TURNS.InputFields( { type: 'tool_use', name: 'Bash', input: { command: 'ls\npwd', timeout: 5000, run_in_background: false, nothing: null, options: { a: 1 } } } );
	assert.deepEqual( fields, [
		{ name: 'command', kind: 'text', value: 'ls\npwd' },
		{ name: 'timeout', kind: 'plain', value: '5000' },
		{ name: 'run_in_background', kind: 'plain', value: 'false' },
		{ name: 'nothing', kind: 'plain', value: 'null' },
		{ name: 'options', kind: 'json', value: '{\n  "a": 1\n}' },
	] );
	assert.deepEqual( TURNS.InputFields( { type: 'tool_use', name: 'X' } ), [] );
	assert.deepEqual( TURNS.InputFields( null ), [] );
} );


//---------------------------------------------------------------------
test( 'ResultText: a content string, text blocks joined, an image named, is_error flagged', function ()
{
	assert.deepEqual( TURNS.ResultText( { type: 'tool_result', content: 'a b' } ), { text: 'a b', error: false } );
	assert.deepEqual( TURNS.ResultText( { type: 'tool_result', content: [ { type: 'text', text: 'one' }, { type: 'image', source: {} }, { type: 'text', text: 'two' } ], is_error: true } ), { text: 'one\n\n(image)\n\ntwo', error: true } );
	assert.deepEqual( TURNS.ResultText( { type: 'tool_result' } ), { text: '', error: false } );
	assert.deepEqual( TURNS.ResultText( undefined ), { text: '', error: false } );
} );


//---------------------------------------------------------------------
test( 'OrderNodes: newest first reverses the nodes alone; the rows inside a turn keep their order', function ()
{
	const nodes = TURNS.BuildTurns( sample_events() );
	const newest = TURNS.OrderNodes( nodes, true );
	function key_of( Node ) { return Node.key; }
	assert.deepEqual( newest.map( key_of ), nodes.map( key_of ).reverse() );
	assert.equal( newest[ 3 ].id, 't1' );
	assert.equal( newest[ 3 ].rows[ 0 ].key, 'engine-m1b-0' );
	assert.equal( newest[ 3 ].rows[ 4 ].key, 'text-m4-0' );
	assert.equal( TURNS.OrderNodes( nodes, false ), nodes );
	assert.equal( TURNS.OrderNodes( nodes ), nodes );
	assert.deepEqual( TURNS.OrderNodes( null, true ), [] );
} );
