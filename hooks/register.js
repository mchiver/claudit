//=====================================================================
// Claudit: the mod.
//
// Runs inside Claude Code's plugin engine. It sees every turn
// (turn.start, turn.complete), every row the conversation keeps
// (session.append) and every tool call (tool.call), keeps the turn's
// list of calls, shows the call in flight on the status line, puts the
// turn's list beneath the answer (and draws it as a table through
// ui.render), answers /claudit on | off | status
// (command.run), and posts each event to the Claudit server over HTTP.
// It cannot listen on a port: the server is a separate process
// (server/server.js) that the mod starts, through server/launch.js,
// when its health route does not answer.
//
// Reads: ~/.claudit/config.json (port, feedback, messages,
// message_limit), the plugin option "port" (overrides the file when
// above 0), the engine store key "enabled" (the /claudit switch, kept
// across sessions).
//=====================================================================

import { Summarise, OutcomeOf, FormatStatus, FormatBlock, BlockHeader, BlockRows, PadLeft, PadRight, CutToFit } from './format.js';


const DEFAULT_PORT = 3600;
const DEFAULT_MESSAGE_LIMIT = 65536;
const HEALTH_TRIES = 20;
const HEALTH_WAIT_MS = 250;
const TICK_MS = 1000;
const STORE_ENABLED = 'enabled';
const MAIN_LOOP = 'main';
const BLOCKS_KEPT = 50;


// The session's state. A reload of the module starts it over; the
// /claudit switch is the one value kept, in the engine's store.
const STATE = {
	enabled: true,
	feedback: true,
	messages: true,
	message_limit: DEFAULT_MESSAGE_LIMIT,
	port: DEFAULT_PORT,
	server: 'http://127.0.0.1:' + DEFAULT_PORT,
	server_ok: false,
	session: '',
	cwd: '',
	calls: [],
	counter: 0,
	total: 0,
	turns: 0,
	ticker: null,
	loops: {},
	blocks: [],
};


//=====================================================================
// Registration
//=====================================================================

export function register( on, options )
{

	//-----------------------------------------------------------------
	on( 'session.start', async function ( $, e, next )
	{
		const started = await next( e );
		try
		{
			await start_session( $, e, options );
		}
		catch ( error )
		{
			debug( $, 'session.start failed: ' + message_of( error ) );
		}
		return started;
	} );


	//-----------------------------------------------------------------
	on( 'session.end', async function ( $, e, next )
	{
		if ( STATE.enabled && STATE.server_ok )
		{
			await release_all_held( $ );
			await post_event( $, {
				kind: 'session',
				phase: 'end',
				session: STATE.session,
				cwd: STATE.cwd,
				time: await $.clock.now(),
				reason: e.reason,
			} );
		}
		return next( e );
	} );


	//-----------------------------------------------------------------
	on( 'turn.start', async function ( $, e, next )
	{
		const started = await next( e );
		if ( !STATE.enabled )
		{
			return started;
		}
		try
		{
			await start_turn( $, e, started );
		}
		catch ( error )
		{
			debug( $, 'start_turn failed: ' + message_of( error ) );
		}
		return started;
	} );


	//-----------------------------------------------------------------
	on( 'session.append', async function ( $, e, next )
	{
		const stored = await next( e );
		if ( !STATE.enabled || !STATE.messages )
		{
			return stored;
		}
		try
		{
			await record_row( $, e, stored );
		}
		catch ( error )
		{
			debug( $, 'record_row failed: ' + message_of( error ) );
		}
		return stored;
	} );


	//-----------------------------------------------------------------
	on( 'tool.call', async function ( $, e, next )
	{
		if ( !STATE.enabled )
		{
			return next( e );
		}
		let call = null;
		try
		{
			call = await begin_call( $, e );
		}
		catch ( error )
		{
			debug( $, 'begin_call failed: ' + message_of( error ) );
		}
		let ran = null;
		try
		{
			ran = await next( e );
		}
		catch ( error )
		{
			await finish_call( $, call, null );
			throw error;
		}
		await finish_call( $, call, ran );
		return ran;
	} );


	//-----------------------------------------------------------------
	on( 'turn.complete', async function ( $, e, next )
	{
		const answer = await next( e );
		try
		{
			await end_turn( $, e );
		}
		catch ( error )
		{
			debug( $, 'end_turn failed: ' + message_of( error ) );
		}
		if ( e.agentId !== undefined )
		{
			return answer;
		}
		const calls = STATE.calls;
		STATE.calls = [];
		stop_ticker( $ );
		$.ui.status( undefined );
		if ( !STATE.enabled || !STATE.feedback || calls.length === 0 )
		{
			return answer;
		}
		const ended = await $.clock.now();
		remember_block( calls, ended );
		const block = FormatBlock( calls, STATE.session, ended );
		return { text: block, usage: answer.usage };
	} );


	//-----------------------------------------------------------------
	// The engine draws the block the turn.complete hook returned as a
	// system notice, flattened to one line. On the terminal this draws
	// it as a table instead, when the notice is one of ours.
	//-----------------------------------------------------------------
	on( 'ui.render', { component: 'InfoNotice' }, async function ( $, e, next )
	{
		const block = find_block( e.props ? e.props.text : undefined );
		if ( !block || e.surface !== 'terminal' )
		{
			return next( e );
		}
		try
		{
			return draw_block( $, e, block );
		}
		catch ( error )
		{
			debug( $, 'draw_block failed: ' + message_of( error ) );
			return next( e );
		}
	} );


	//-----------------------------------------------------------------
	on( 'command.run', { command: 'claudit' }, async function ( $, e )
	{
		const word = String( e.args || '' ).trim().toLowerCase();
		if ( word === 'on' )
		{
			STATE.enabled = true;
			await $.store.set( STORE_ENABLED, true );
			if ( !STATE.server_ok )
			{
				STATE.server_ok = await ensure_server( $ );
			}
			return { text: 'claudit is on. ' + server_line() };
		}
		if ( word === 'off' )
		{
			STATE.enabled = false;
			await $.store.set( STORE_ENABLED, false );
			stop_ticker( $ );
			$.ui.status( undefined );
			return { text: 'claudit is off. Nothing is recorded until /claudit on.' };
		}
		if ( word === '' || word === 'status' )
		{
			STATE.server_ok = await health( $ );
			return { text: status_text() };
		}
		return { text: 'claudit: "' + word + '" is not a word I know. Use /claudit on, /claudit off or /claudit status.' };
	} );

}


//=====================================================================
// The session
//=====================================================================

async function start_session( $, e, options )
{
	STATE.cwd = e.cwd;
	STATE.session = await $.session.id();
	STATE.calls = [];
	STATE.counter = 0;
	STATE.total = 0;
	STATE.turns = 0;
	STATE.loops = {};

	await $.command.register( {
		name: 'claudit',
		description: 'Claudit audit trail: on, off or status',
		argumentHint: 'on | off | status',
	} );

	const stored = await $.store.get( STORE_ENABLED );
	if ( stored === undefined )
	{
		STATE.enabled = true;
	}
	else
	{
		STATE.enabled = ( stored === true );
	}

	await load_config( $, options );

	if ( !STATE.enabled )
	{
		return;
	}
	STATE.server_ok = await ensure_server( $ );
	if ( STATE.server_ok )
	{
		await post_event( $, {
			kind: 'session',
			phase: 'start',
			session: STATE.session,
			cwd: STATE.cwd,
			time: await $.clock.now(),
		} );
	}
}


//---------------------------------------------------------------------
// ~/.claudit/config.json gives the port, the feedback switch, the
// messages switch and the message limit; the plugin option "port"
// overrides the file when it is above 0.
//---------------------------------------------------------------------

async function load_config( $, options )
{
	let config = {};
	const home = await home_of( $ );
	if ( home )
	{
		try
		{
			const text = await $.fs.read( home + '/.claudit/config.json' );
			config = JSON.parse( text );
		}
		catch ( error )
		{
			config = {};
		}
	}
	let port = Number( config.port ) || DEFAULT_PORT;
	const option_port = Number( options && options.port );
	if ( option_port > 0 )
	{
		port = option_port;
	}
	STATE.port = port;
	STATE.server = 'http://127.0.0.1:' + port;
	STATE.feedback = ( config.feedback !== false );
	STATE.messages = ( config.messages !== false );
	let limit = Number( config.message_limit );
	if ( config.message_limit === undefined || Number.isNaN( limit ) || limit < 0 )
	{
		limit = DEFAULT_MESSAGE_LIMIT;
	}
	STATE.message_limit = limit;
}


//---------------------------------------------------------------------

async function home_of( $ )
{
	let home = await $.env.get( 'HOME' );
	if ( !home )
	{
		home = await $.env.get( 'USERPROFILE' );
	}
	if ( !home )
	{
		return '';
	}
	return String( home ).replace( /\\/g, '/' );
}


//=====================================================================
// The server
//=====================================================================

//---------------------------------------------------------------------
// True when the server answers its health route; when it does not,
// starts it detached (server/launch.js) and waits for it to answer.
//---------------------------------------------------------------------

async function ensure_server( $ )
{
	if ( await health( $ ) )
	{
		return true;
	}
	try
	{
		const launcher = $.plugin.root.replace( /\\/g, '/' ) + '/server/launch.js';
		const ran = await $.process.run( [ 'node', launcher, '--port', String( STATE.port ) ] );
		if ( ran.exitCode !== 0 )
		{
			debug( $, 'launch.js exited ' + ran.exitCode + ': ' + ran.stderr );
			return false;
		}
	}
	catch ( error )
	{
		debug( $, 'could not start the server: ' + message_of( error ) );
		return false;
	}
	for ( let attempt = 0; attempt < HEALTH_TRIES; attempt++ )
	{
		await sleep( HEALTH_WAIT_MS );
		if ( await health( $ ) )
		{
			return true;
		}
	}
	debug( $, 'the server did not answer at ' + STATE.server );
	return false;
}


//---------------------------------------------------------------------

async function health( $ )
{
	try
	{
		const response = await $.http.fetch( STATE.server + '/api/health' );
		return response.ok === true;
	}
	catch ( error )
	{
		return false;
	}
}


//---------------------------------------------------------------------

async function post_event( $, Event )
{
	if ( !STATE.server_ok )
	{
		return;
	}
	try
	{
		const response = await $.http.fetch( STATE.server + '/api/events', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( Event ),
		} );
		if ( !response.ok )
		{
			debug( $, 'the server refused an event: ' + response.status );
		}
	}
	catch ( error )
	{
		STATE.server_ok = false;
		debug( $, 'posting an event failed: ' + message_of( error ) );
	}
}


//=====================================================================
// The loops and their turns
//
// Each loop (the main conversation, or a subagent by its id) has at
// most one turn in flight; every call and row is stamped with it. A
// row that arrives before its turn starts (the prompt, and what the
// engine appends beside it) is held and stamped when the turn starts.
//=====================================================================

function loop_of( AgentId )
{
	const key = AgentId || MAIN_LOOP;
	if ( !STATE.loops[ key ] )
	{
		STATE.loops[ key ] = { turn: null, last: null, held: [] };
	}
	return STATE.loops[ key ];
}


//---------------------------------------------------------------------

async function start_turn( $, e, Started )
{
	const now = await $.clock.now();
	const loop = loop_of( e.agentId );
	let id = e.turnId;
	if ( Started && Started.turnId )
	{
		id = Started.turnId;
	}
	loop.turn = id;
	STATE.turns = STATE.turns + 1;
	const cut = CutToFit( { text: String( e.text || '' ) }, STATE.message_limit );
	const event = {
		kind: 'turn',
		phase: 'start',
		id: id,
		session: STATE.session,
		agent: e.agentId || null,
		text: cut.row.text,
		time: now,
		cwd: STATE.cwd,
	};
	if ( cut.truncated )
	{
		event.truncated = true;
	}
	await post_event( $, event );
	const held = loop.held;
	loop.held = [];
	for ( const row of held )
	{
		row.turn = id;
		await post_event( $, row );
	}
}


//---------------------------------------------------------------------

async function end_turn( $, e )
{
	if ( !STATE.enabled )
	{
		return;
	}
	const now = await $.clock.now();
	const loop = loop_of( e.agentId );
	const id = e.turnId || loop.turn;
	loop.last = id;
	loop.turn = null;
	await post_event( $, {
		kind: 'turn',
		phase: 'end',
		id: id,
		session: STATE.session,
		agent: e.agentId || null,
		time: now,
		duration: e.durationMs,
		reason: e.reason,
		usage: e.usage || null,
		cwd: STATE.cwd,
	} );
}


//---------------------------------------------------------------------
// One row of the conversation, as the engine keeps it, as an event.
// Stamped with the loop's turn in flight; held when a turn is pending
// (a prompt arrived and its turn has not started); otherwise given the
// turn that last ended, for the rows the engine appends after it.
//---------------------------------------------------------------------

async function record_row( $, e, Stored )
{
	const now = await $.clock.now();
	let message = e.message;
	let uuid = e.uuid;
	if ( Stored && Stored.message )
	{
		message = Stored.message;
	}
	if ( Stored && Stored.uuid )
	{
		uuid = Stored.uuid;
	}
	const cut = CutToFit( message, STATE.message_limit );
	const event = {
		kind: 'message',
		id: uuid,
		session: STATE.session,
		agent: e.agentId || null,
		turn: null,
		door: e.door,
		origin: e.origin || null,
		time: now,
		message: cut.row,
		cwd: STATE.cwd,
	};
	if ( cut.truncated )
	{
		event.truncated = true;
	}
	const loop = loop_of( e.agentId );
	if ( loop.turn )
	{
		event.turn = loop.turn;
		await post_event( $, event );
		return;
	}
	if ( e.door === 'prompt' )
	{
		await release_held( $, loop );
		loop.held.push( event );
		return;
	}
	if ( loop.held.length > 0 )
	{
		loop.held.push( event );
		return;
	}
	event.turn = loop.last;
	await post_event( $, event );
}


//---------------------------------------------------------------------
// Posts the rows a loop holds without a turn, when none is coming.
//---------------------------------------------------------------------

async function release_held( $, Loop )
{
	const held = Loop.held;
	Loop.held = [];
	for ( const row of held )
	{
		await post_event( $, row );
	}
}


//---------------------------------------------------------------------

async function release_all_held( $ )
{
	for ( const key of Object.keys( STATE.loops ) )
	{
		await release_held( $, STATE.loops[ key ] );
	}
}


//=====================================================================
// The calls
//=====================================================================

async function begin_call( $, e )
{
	const now = await $.clock.now();
	STATE.counter = STATE.counter + 1;
	let id = e.tool_use_id;
	if ( !id )
	{
		id = STATE.session + '-' + STATE.counter;
	}
	const loop = loop_of( e.agentId );
	const call = {
		kind: 'call',
		id: id,
		session: STATE.session,
		agent: e.agentId || null,
		turn: loop.turn || loop.last,
		tool: e.tool,
		summary: Summarise( e ),
		start: now,
		end: null,
		duration: null,
		outcome: 'running',
		cwd: STATE.cwd,
	};
	STATE.calls.push( call );
	show_status( $, now );
	start_ticker( $ );
	void post_event( $, call );
	return call;
}


//---------------------------------------------------------------------

async function finish_call( $, Call, Ran )
{
	if ( !Call )
	{
		return;
	}
	try
	{
		const now = await $.clock.now();
		Call.end = now;
		Call.duration = now - Call.start;
		Call.outcome = OutcomeOf( Ran );
		STATE.total = STATE.total + 1;
		show_status( $, now );
		if ( !any_running() )
		{
			stop_ticker( $ );
		}
		void post_event( $, Call );
	}
	catch ( error )
	{
		debug( $, 'finish_call failed: ' + message_of( error ) );
	}
}


//---------------------------------------------------------------------

function any_running()
{
	for ( const call of STATE.calls )
	{
		if ( call.outcome === 'running' )
		{
			return true;
		}
	}
	return false;
}


//=====================================================================
// The block beneath the answer
//
// The text goes to the transcript; its header is remembered with the
// turn's rows so the render hook can draw the same block as a table.
//=====================================================================

function remember_block( Calls, EndedAt )
{
	STATE.blocks.push( {
		header: BlockHeader( Calls, STATE.session, EndedAt ),
		rows: BlockRows( Calls ),
	} );
	while ( STATE.blocks.length > BLOCKS_KEPT )
	{
		STATE.blocks.shift();
	}
}


//---------------------------------------------------------------------

function find_block( Text )
{
	if ( typeof Text !== 'string' )
	{
		return null;
	}
	for ( let index = STATE.blocks.length - 1; index >= 0; index-- )
	{
		if ( Text.startsWith( STATE.blocks[ index ].header ) )
		{
			return STATE.blocks[ index ];
		}
	}
	return null;
}


//---------------------------------------------------------------------
// The table: the header in the accent colour, then one row per call
// with the clock and duration dim, the tool bold, the summary plain,
// a denied or failed outcome in the theme's warning or error colour
// and a subagent's id dim.
//---------------------------------------------------------------------

function draw_block( $, e, Block )
{
	const elements = $.ui.resolve( e );
	const Box = elements.Box;
	const Text = elements.Text;
	const lines = [];
	lines.push( h( Text, { color: 'claude', bold: true }, Block.header ) );
	for ( const row of Block.rows )
	{
		const cells = [];
		cells.push( h( Text, { dimColor: true }, row.clock + '  ' + PadLeft( row.duration, 7 ) + '  ' ) );
		cells.push( h( Text, { bold: true }, PadRight( row.tool, 10 ) + '  ' ) );
		cells.push( h( Text, null, row.summary ) );
		if ( row.flagged )
		{
			cells.push( h( Text, { color: outcome_colour( row.outcome ) }, '  [' + row.outcome + ']' ) );
		}
		if ( row.agent )
		{
			cells.push( h( Text, { dimColor: true }, '  (agent ' + row.agent + ')' ) );
		}
		lines.push( h( Box, { flexDirection: 'row' }, ...cells ) );
	}
	return h( Box, { flexDirection: 'column' }, ...lines );
}


//---------------------------------------------------------------------

function outcome_colour( Outcome )
{
	if ( Outcome === 'denied' )
	{
		return 'warning';
	}
	if ( Outcome === 'failed' )
	{
		return 'error';
	}
	return 'success';
}


//=====================================================================
// The status line
//=====================================================================

function show_status( $, Now )
{
	$.ui.status( FormatStatus( STATE.calls, Now ) );
}


//---------------------------------------------------------------------

function start_ticker( $ )
{
	if ( STATE.ticker !== null )
	{
		return;
	}
	STATE.ticker = setInterval( function ()
	{
		if ( !any_running() )
		{
			stop_ticker( $ );
			return;
		}
		show_status( $, Date.now() );
	}, TICK_MS );
}


//---------------------------------------------------------------------

function stop_ticker( $ )
{
	if ( STATE.ticker === null )
	{
		return;
	}
	clearInterval( STATE.ticker );
	STATE.ticker = null;
}


//=====================================================================
// Words
//=====================================================================

function server_line()
{
	if ( STATE.server_ok )
	{
		return 'Server: ' + STATE.server + ' (answering).';
	}
	return 'Server: ' + STATE.server + ' (not answering; events are not recorded until it does).';
}


//---------------------------------------------------------------------

function status_text()
{
	const lines = [];
	lines.push( 'claudit is ' + ( STATE.enabled ? 'on' : 'off' ) + '.' );
	lines.push( server_line() );
	lines.push( 'Session ' + STATE.session + ': ' + STATE.turns + ' turns, ' + STATE.total + ' tool calls recorded, ' + STATE.calls.length + ' this turn.' );
	lines.push( 'Turn-end feedback: ' + ( STATE.feedback ? 'on' : 'off' ) + ' (feedback in ~/.claudit/config.json).' );
	let limit = 'no cap';
	if ( STATE.message_limit > 0 )
	{
		limit = STATE.message_limit + ' bytes per row';
	}
	lines.push( 'Message rows: ' + ( STATE.messages ? 'on' : 'off' ) + ', ' + limit + ' (messages, message_limit in ~/.claudit/config.json).' );
	return lines.join( '\n' );
}


//---------------------------------------------------------------------

function debug( $, Text )
{
	try
	{
		$.ui.log( 'claudit: ' + Text, { to: 'debug' } );
	}
	catch ( error )
	{
		// Nothing to do: the log is the last resort.
	}
}


//---------------------------------------------------------------------

function message_of( Error )
{
	if ( Error && Error.message )
	{
		return Error.message;
	}
	return String( Error );
}


//---------------------------------------------------------------------

function sleep( Ms )
{
	return new Promise( function ( Resolve )
	{
		setTimeout( Resolve, Ms );
	} );
}
