//=====================================================================
// Claudit web UI: the turns tree, built from a session's events.
//
// Pure. BuildTurns( Events ) turns the flat list of events (session
// marks, turns, calls, messages) into what <event-list> shows: a list
// of top-level nodes, each a session mark or a turn, a turn holding
// its rows (the assistant's text, the tool calls with their input and
// result, the engine's rows) in time order. Events without a turn fall
// into a synthetic turn so nothing is lost. InputFields( Block ) and
// ResultText( Block ) pick what <event-list> shows of a tool_use
// block's input and a tool_result block's content. OrderNodes( Nodes,
// Newest ) gives the top-level nodes in the order shown. FilterNodes(
// Nodes, Query ) keeps the session marks and the turns whose user
// message, assistant text, tool names or call summaries hold the
// query, ignoring case.
//
// Loaded by the page as a plain script and by the tests through node:
// it attaches itself to globalThis.ClauditTurns.
//=====================================================================

( function ()
{
	'use strict';

	const LINE_LENGTH = 160;
	const UNTAGGED_TEXT = '(no turn recorded)';


	//-----------------------------------------------------------------
	function BuildTurns( Events )
	{
		const build = {
			nodes: [],
			turns: {},
			calls: {},
			inputs: {},
			results: {},
			untagged: null,
		};
		for ( const event of ( Events || [] ) )
		{
			if ( !event || typeof event !== 'object' )
			{
				continue;
			}
			switch ( event.kind )
			{
				case 'session':
					add_session( build, event );
					break;
				case 'turn':
					add_turn( build, event );
					break;
				case 'call':
					add_call( build, event );
					break;
				case 'message':
					add_message( build, event );
					break;
				default:
					break;
			}
		}
		for ( const node of build.nodes )
		{
			if ( node.kind === 'turn' )
			{
				finish_turn( node );
			}
		}
		return build.nodes;
	}


	//-----------------------------------------------------------------
	function add_session( Build, Event )
	{
		Build.untagged = null;
		Build.nodes.push( {
			kind: 'session',
			key: 'session-' + Event.phase + '-' + Event.time,
			phase: Event.phase,
			time: Event.time,
			reason: Event.reason || null,
			cwd: Event.cwd || '',
			event: Event,
		} );
	}


	//-----------------------------------------------------------------
	function turn_node( Build, Id )
	{
		if ( Build.turns[ Id ] )
		{
			return Build.turns[ Id ];
		}
		const node = {
			kind: 'turn',
			key: 'turn-' + Id,
			id: Id,
			text: '',
			line: '',
			agent: null,
			start: null,
			end: null,
			duration: null,
			reason: null,
			usage: null,
			truncated: false,
			synthetic: false,
			prompt: null,
			event: null,
			rows: [],
			counts: { calls: 0, done: 0, denied: 0, failed: 0, running: 0 },
		};
		Build.turns[ Id ] = node;
		Build.nodes.push( node );
		return node;
	}


	//-----------------------------------------------------------------
	// The turn an untagged call or row falls into: one synthetic turn
	// per run of untagged events.
	//-----------------------------------------------------------------
	function untagged_turn( Build, Time )
	{
		if ( Build.untagged === null )
		{
			const id = 'untagged-' + Time;
			const node = turn_node( Build, id );
			node.text = UNTAGGED_TEXT;
			node.line = UNTAGGED_TEXT;
			node.start = Time;
			node.synthetic = true;
			Build.untagged = node;
		}
		return Build.untagged;
	}


	//-----------------------------------------------------------------
	function turn_for( Build, Event )
	{
		if ( Event.turn )
		{
			return turn_node( Build, Event.turn );
		}
		return untagged_turn( Build, time_of( Event ) );
	}


	//-----------------------------------------------------------------
	function add_turn( Build, Event )
	{
		Build.untagged = null;
		const node = turn_node( Build, Event.id );
		if ( Event.agent )
		{
			node.agent = Event.agent;
		}
		if ( Event.phase === 'start' )
		{
			node.text = String( Event.text || '' );
			node.line = first_line( node.text );
			node.start = Event.time;
			node.truncated = ( Event.truncated === true );
			node.event = Event;
			return;
		}
		if ( Event.phase === 'end' )
		{
			node.end = Event.time;
			node.duration = Event.duration;
			node.reason = Event.reason || null;
			node.usage = Event.usage || null;
			if ( node.start === null && typeof Event.time === 'number' && typeof Event.duration === 'number' )
			{
				node.start = Event.time - Event.duration;
			}
		}
	}


	//-----------------------------------------------------------------
	function add_call( Build, Event )
	{
		let row = Build.calls[ Event.id ];
		if ( row )
		{
			row.call = Event;
			row.time = Event.start;
			row.line = Event.summary;
			return;
		}
		const turn = turn_for( Build, Event );
		row = {
			kind: 'call',
			key: 'call-' + Event.id,
			id: Event.id,
			time: Event.start,
			line: Event.summary,
			agent: Event.agent || null,
			call: Event,
			input: null,
			result: null,
		};
		if ( Build.inputs[ Event.id ] )
		{
			row.input = Build.inputs[ Event.id ];
		}
		if ( Build.results[ Event.id ] )
		{
			row.result = Build.results[ Event.id ];
		}
		Build.calls[ Event.id ] = row;
		turn.rows.push( row );
	}


	//-----------------------------------------------------------------
	function add_message( Build, Event )
	{
		const message = Event.message || {};
		const content = Array.isArray( message.content ) ? message.content : [];
		const turn = turn_for( Build, Event );

		if ( message.type === 'user' && Event.door === 'prompt' && message.isMeta !== true )
		{
			if ( turn.prompt === null )
			{
				turn.prompt = Event;
				if ( turn.text === '' )
				{
					turn.text = text_of( content );
					turn.line = first_line( turn.text );
				}
				return;
			}
		}

		if ( message.type === 'assistant' )
		{
			for ( let index = 0; index < content.length; index++ )
			{
				const block = content[ index ];
				if ( !block || typeof block !== 'object' )
				{
					continue;
				}
				if ( block.type === 'text' )
				{
					turn.rows.push( {
						kind: 'text',
						key: 'text-' + Event.id + '-' + index,
						time: Event.time,
						line: first_line( String( block.text || '' ) ),
						agent: Event.agent || null,
						event: Event,
						block: block,
					} );
				}
				else if ( block.type === 'tool_use' )
				{
					const input = { event: Event, block: block };
					const row = Build.calls[ block.id ];
					if ( row )
					{
						row.input = input;
					}
					else
					{
						Build.inputs[ block.id ] = input;
					}
				}
				else
				{
					turn.rows.push( engine_row( Event, block.type || 'block', index ) );
				}
			}
			return;
		}

		let results = 0;
		for ( const block of content )
		{
			if ( block && block.type === 'tool_result' )
			{
				results = results + 1;
				const result = { event: Event, block: block };
				const row = Build.calls[ block.tool_use_id ];
				if ( row )
				{
					row.result = result;
				}
				else
				{
					Build.results[ block.tool_use_id ] = result;
				}
			}
		}
		if ( results > 0 )
		{
			return;
		}

		turn.rows.push( engine_row( Event, label_of( Event, message ), 0 ) );
	}


	//-----------------------------------------------------------------
	function engine_row( Event, Label, Index )
	{
		const message = Event.message || {};
		return {
			kind: 'engine',
			key: 'engine-' + Event.id + '-' + Index,
			time: Event.time,
			line: first_line( text_of( message.content ) ),
			label: Label,
			agent: Event.agent || null,
			event: Event,
		};
	}


	//-----------------------------------------------------------------
	function label_of( Event, Message )
	{
		if ( Message.name )
		{
			return String( Message.name );
		}
		if ( Message.type === 'user' && Message.isMeta === true )
		{
			return 'meta';
		}
		if ( Event.door && Event.door !== 'prompt' )
		{
			return String( Event.door );
		}
		return String( Message.type || 'row' );
	}


	//-----------------------------------------------------------------
	function finish_turn( Node )
	{
		Node.rows.sort( function ( Left, Right )
		{
			return ( Left.time || 0 ) - ( Right.time || 0 );
		} );
		const counts = { calls: 0, done: 0, denied: 0, failed: 0, running: 0 };
		for ( const row of Node.rows )
		{
			if ( row.kind !== 'call' )
			{
				continue;
			}
			counts.calls = counts.calls + 1;
			const outcome = row.call.outcome;
			if ( counts[ outcome ] !== undefined )
			{
				counts[ outcome ] = counts[ outcome ] + 1;
			}
		}
		Node.counts = counts;
		if ( Node.start === null && Node.rows.length > 0 )
		{
			Node.start = Node.rows[ 0 ].time;
		}
	}


	//-----------------------------------------------------------------
	function text_of( Content )
	{
		if ( typeof Content === 'string' )
		{
			return Content;
		}
		if ( !Array.isArray( Content ) )
		{
			return '';
		}
		const parts = [];
		for ( const block of Content )
		{
			if ( block && typeof block.text === 'string' )
			{
				parts.push( block.text );
			}
		}
		return parts.join( '\n' );
	}


	//-----------------------------------------------------------------
	function first_line( Text )
	{
		if ( typeof Text !== 'string' )
		{
			return '';
		}
		const lines = Text.split( '\n' );
		let line = '';
		for ( const candidate of lines )
		{
			line = candidate.trim();
			if ( line !== '' )
			{
				break;
			}
		}
		if ( line.length > LINE_LENGTH )
		{
			line = line.slice( 0, LINE_LENGTH - 1 ) + '…';
		}
		return line;
	}


	//-----------------------------------------------------------------
	// A tool_use block's input as fields to show: one per key, { name,
	// kind, value }, kind 'text' for a string (shown as it is, newlines
	// kept), 'plain' for a number, boolean or null, 'json' for an
	// object or array (indented JSON).
	//-----------------------------------------------------------------
	function InputFields( Block )
	{
		const input = ( Block && Block.input && typeof Block.input === 'object' ) ? Block.input : {};
		const fields = [];
		for ( const name of Object.keys( input ) )
		{
			const value = input[ name ];
			if ( typeof value === 'string' )
			{
				fields.push( { name: name, kind: 'text', value: value } );
			}
			else if ( value === null || typeof value !== 'object' )
			{
				fields.push( { name: name, kind: 'plain', value: String( value ) } );
			}
			else
			{
				fields.push( { name: name, kind: 'json', value: JSON.stringify( value, null, 2 ) } );
			}
		}
		return fields;
	}


	//-----------------------------------------------------------------
	// A tool_result block's content as { text, error }: the content
	// string, or the text of its text blocks joined by blank lines, an
	// image block giving the line "(image)"; error when the block says
	// is_error.
	//-----------------------------------------------------------------
	function ResultText( Block )
	{
		const block = ( Block && typeof Block === 'object' ) ? Block : {};
		let text = '';
		if ( typeof block.content === 'string' )
		{
			text = block.content;
		}
		else if ( Array.isArray( block.content ) )
		{
			const parts = [];
			for ( const part of block.content )
			{
				if ( !part || typeof part !== 'object' )
				{
					continue;
				}
				if ( typeof part.text === 'string' )
				{
					parts.push( part.text );
				}
				else if ( part.type === 'image' )
				{
					parts.push( '(image)' );
				}
			}
			text = parts.join( '\n\n' );
		}
		return { text: text, error: block.is_error === true };
	}


	//-----------------------------------------------------------------
	// The top-level nodes in the order shown: as built (oldest first)
	// or reversed (newest first). Only the nodes move: a turn keeps its
	// rows earliest to latest, and a session mark stays next to the
	// turns it sits between.
	//-----------------------------------------------------------------
	function OrderNodes( Nodes, Newest )
	{
		const nodes = Array.isArray( Nodes ) ? Nodes : [];
		if ( Newest !== true )
		{
			return nodes;
		}
		return nodes.slice().reverse();
	}

	//-----------------------------------------------------------------
	// The nodes with the turns that do not match the query removed. An
	// empty query keeps everything. A turn matches on its user message,
	// its assistant rows' text, and its calls' tool names and summary
	// lines; engine rows, tool inputs and results are not searched.
	//-----------------------------------------------------------------
	function FilterNodes( Nodes, Query )
	{
		const nodes = Array.isArray( Nodes ) ? Nodes : [];
		const query = String( Query || '' ).trim().toLowerCase();
		if ( query === '' )
		{
			return nodes;
		}
		return nodes.filter( function ( Node )
		{
			if ( Node.kind !== 'turn' )
			{
				return true;
			}
			return turn_matches( Node, query );
		} );
	}


	//-----------------------------------------------------------------
	function turn_matches( Node, Query )
	{
		if ( holds( Node.text, Query ) )
		{
			return true;
		}
		for ( const row of Node.rows )
		{
			if ( row.kind === 'text' && holds( row.block ? row.block.text : '', Query ) )
			{
				return true;
			}
			if ( row.kind === 'call' && ( holds( row.call.tool, Query ) || holds( row.line, Query ) ) )
			{
				return true;
			}
		}
		return false;
	}


	//-----------------------------------------------------------------
	function holds( Text, Query )
	{
		if ( typeof Text !== 'string' || Text === '' )
		{
			return false;
		}
		return Text.toLowerCase().includes( Query );
	}


	//-----------------------------------------------------------------
	function time_of( Event )
	{
		if ( typeof Event.time === 'number' )
		{
			return Event.time;
		}
		if ( typeof Event.start === 'number' )
		{
			return Event.start;
		}
		return 0;
	}


	globalThis.ClauditTurns = {
		BuildTurns: BuildTurns,
		FirstLine: first_line,
		TextOf: text_of,
		InputFields: InputFields,
		ResultText: ResultText,
		OrderNodes: OrderNodes,
		FilterNodes: FilterNodes,
	};

} )();
