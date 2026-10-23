//=====================================================================
// Claudit: the pure formatting of the mod, shared with its tests.
//
// Nothing here touches the engine: the mod (register.js) hands these
// functions plain values and shows or posts what they return.
//=====================================================================


export const SUMMARY_LENGTH = 120;


//---------------------------------------------------------------------
// One line that says what a tool call is about, from the call's input:
// a shell call's description, a file tool's path, a search tool's
// pattern, otherwise the tool's name alone.
//---------------------------------------------------------------------

export function Summarise( Event )
{
	let summary = '';
	switch ( Event.tool )
	{
		case 'Bash':
		case 'PowerShell':
			summary = first_line( Event.description ) || first_line( Event.command );
			break;
		case 'Read':
		case 'Edit':
		case 'Write':
		case 'NotebookEdit':
		case 'MultiEdit':
			summary = Event.file_path || Event.notebook_path || '';
			break;
		case 'Grep':
		case 'Glob':
			summary = Event.pattern || '';
			break;
		case 'Agent':
		case 'Task':
			summary = first_line( Event.description ) || Event.subagent_type || '';
			break;
		case 'WebFetch':
			summary = Event.url || '';
			break;
		case 'WebSearch':
			summary = Event.query || '';
			break;
		case 'Skill':
			summary = Event.skill || '';
			break;
		default:
			summary = '';
	}
	summary = String( summary || '' ).trim();
	if ( summary === '' )
	{
		summary = Event.tool || 'tool';
	}
	if ( summary.length > SUMMARY_LENGTH )
	{
		summary = summary.slice( 0, SUMMARY_LENGTH - 1 ) + '…';
	}
	return summary;
}


//---------------------------------------------------------------------

function first_line( Text )
{
	if ( typeof Text !== 'string' )
	{
		return '';
	}
	const line = Text.split( /\r?\n/ )[ 0 ];
	return line.trim();
}


//---------------------------------------------------------------------
// The outcome of a call from what the engine answered: denied when a
// hook refused it, failed when the tool reported an error, else done.
//---------------------------------------------------------------------

export function OutcomeOf( Result )
{
	if ( !Result )
	{
		return 'failed';
	}
	if ( Result.deny !== undefined )
	{
		return 'denied';
	}
	if ( Result.isError === true )
	{
		return 'failed';
	}
	return 'done';
}


//---------------------------------------------------------------------
// hh:mm:ss in local time, from milliseconds since the epoch.
//---------------------------------------------------------------------

export function FormatClock( Ms )
{
	const date = new Date( Ms );
	const hours = String( date.getHours() ).padStart( 2, '0' );
	const minutes = String( date.getMinutes() ).padStart( 2, '0' );
	const seconds = String( date.getSeconds() ).padStart( 2, '0' );
	return hours + ':' + minutes + ':' + seconds;
}


//---------------------------------------------------------------------
// A duration as people read it: 850ms, 1.2s, 1m05s.
//---------------------------------------------------------------------

export function FormatDuration( Ms )
{
	if ( typeof Ms !== 'number' || Ms < 0 )
	{
		return '';
	}
	if ( Ms < 1000 )
	{
		return Math.round( Ms ) + 'ms';
	}
	if ( Ms < 60000 )
	{
		return ( Ms / 1000 ).toFixed( 1 ) + 's';
	}
	const minutes = Math.floor( Ms / 60000 );
	const seconds = Math.round( ( Ms - minutes * 60000 ) / 1000 );
	return minutes + 'm' + String( seconds ).padStart( 2, '0' ) + 's';
}


//---------------------------------------------------------------------
// The status line while calls run: the one in flight with its tool,
// elapsed time and summary, and the count so far this turn. The engine
// draws the line under the plugin's name, so it carries no prefix.
//---------------------------------------------------------------------

export function FormatStatus( Calls, Now )
{
	const running = Calls.filter( function ( Call ) { return Call.outcome === 'running'; } );
	const count = Calls.length;
	const noun = count === 1 ? 'call' : 'calls';
	if ( running.length === 0 )
	{
		return count + ' ' + noun + ' this turn';
	}
	const current = running[ running.length - 1 ];
	const elapsed = FormatDuration( Now - current.start );
	let line = current.tool + ' ' + elapsed + '  ' + current.summary;
	line = line + '  (' + count + ' ' + noun + ' this turn)';
	return line;
}


//---------------------------------------------------------------------
// The header of the block beneath the answer: the session, the time
// the turn ended (when given) and the count. It is what the render
// hook finds the turn's block by, so it starts with the mod's name.
//---------------------------------------------------------------------

export function BlockHeader( Calls, SessionId, EndedAt )
{
	const count = Calls.length;
	const noun = count === 1 ? 'tool call' : 'tool calls';
	let header = 'claudit · session ' + short_id( SessionId );
	if ( typeof EndedAt === 'number' )
	{
		header = header + ' · ' + FormatClock( EndedAt );
	}
	return header + ' · ' + count + ' ' + noun;
}


//---------------------------------------------------------------------
// One row per call, as strings: the clock, the duration, the tool, the
// summary, the outcome, the agent's short id ('' on the main loop) and
// whether the outcome is one to flag (denied or failed). Shared by the
// text block and the drawn one.
//---------------------------------------------------------------------

export function BlockRows( Calls )
{
	const rows = [];
	for ( const call of Calls || [] )
	{
		rows.push( {
			clock: FormatClock( call.start ),
			duration: FormatDuration( call.duration ),
			tool: String( call.tool || '' ),
			summary: String( call.summary || '' ),
			outcome: String( call.outcome || 'done' ),
			agent: call.agent ? short_id( call.agent ) : '',
			flagged: call.outcome === 'denied' || call.outcome === 'failed',
		} );
	}
	return rows;
}


//---------------------------------------------------------------------
// The block shown beneath the answer when a turn ends, as text: the
// header, then one line per call: "hh:mm:ss  1.2s  Bash  description".
// Empty when the turn made no call.
//---------------------------------------------------------------------

function short_id( Id )
{
	if ( typeof Id !== 'string' || Id === '' )
	{
		return '?';
	}
	return Id.slice( 0, 8 );
}


//---------------------------------------------------------------------

function pad_left( Text, Width )
{
	return String( Text ).padStart( Width, ' ' );
}


//---------------------------------------------------------------------

function pad_right( Text, Width )
{
	return String( Text ).padEnd( Width, ' ' );
}


//=====================================================================
// Rows cut to size
//=====================================================================

export const CUT_ROUNDS = 8;
export const CUT_MARGIN = 48;


//---------------------------------------------------------------------
// A conversation row (or any object with text in it) cut to fit a
// limit on the bytes of its JSON: the text of its text and thinking
// blocks and the content of its tool results are shortened, all in
// proportion, until the JSON fits. A limit of 0 or less cuts nothing.
// Returns { row, truncated }: the same object when nothing was cut, a
// cut copy otherwise, each cut string ending in a mark that says how
// many characters went.
//---------------------------------------------------------------------

export function CutToFit( Row, Limit )
{
	const limit = Number( Limit );
	if ( !Row || typeof Row !== 'object' || !( limit > 0 ) )
	{
		return { row: Row, truncated: false };
	}
	let size = ByteLength( JSON.stringify( Row ) );
	if ( size <= limit )
	{
		return { row: Row, truncated: false };
	}
	const row = JSON.parse( JSON.stringify( Row ) );
	let truncated = false;
	for ( let round = 0; round < CUT_ROUNDS && size > limit; round++ )
	{
		const holders = cuttable_strings( row );
		if ( holders.length === 0 )
		{
			break;
		}
		let total = 0;
		for ( const holder of holders )
		{
			total = total + holder.object[ holder.key ].length;
		}
		const excess = ( size - limit ) + CUT_MARGIN * holders.length;
		let keep = ( total - excess ) / total;
		if ( keep < 0 )
		{
			keep = 0;
		}
		for ( const holder of holders )
		{
			const text = holder.object[ holder.key ];
			const length = Math.floor( text.length * keep );
			if ( length >= text.length )
			{
				continue;
			}
			holder.object[ holder.key ] = text.slice( 0, length ) + cut_mark( text.length - length );
			truncated = true;
		}
		size = ByteLength( JSON.stringify( row ) );
	}
	return { row: row, truncated: truncated };
}


//---------------------------------------------------------------------

function cut_mark( Count )
{
	return '… [claudit cut ' + Count + ' characters]';
}


//---------------------------------------------------------------------
// The strings of a row that may be cut, as { object, key } pairs: a
// top-level text, and in the content blocks the text, the thinking and
// a tool result's content (a string, or the text of its blocks). A
// string that is already a cut mark alone is left out.
//---------------------------------------------------------------------

function cuttable_strings( Row )
{
	const holders = [];
	if ( typeof Row.text === 'string' )
	{
		holders.push( { object: Row, key: 'text' } );
	}
	if ( Array.isArray( Row.content ) )
	{
		for ( const block of Row.content )
		{
			if ( !block || typeof block !== 'object' )
			{
				continue;
			}
			if ( typeof block.text === 'string' )
			{
				holders.push( { object: block, key: 'text' } );
			}
			if ( typeof block.thinking === 'string' )
			{
				holders.push( { object: block, key: 'thinking' } );
			}
			if ( block.type === 'tool_result' )
			{
				if ( typeof block.content === 'string' )
				{
					holders.push( { object: block, key: 'content' } );
				}
				else if ( Array.isArray( block.content ) )
				{
					for ( const item of block.content )
					{
						if ( item && typeof item.text === 'string' )
						{
							holders.push( { object: item, key: 'text' } );
						}
					}
				}
			}
		}
	}
	return holders.filter( function ( Holder )
	{
		const text = Holder.object[ Holder.key ];
		return text.length > 0 && !text.startsWith( '… [claudit cut' );
	} );
}


//---------------------------------------------------------------------
// The bytes of a string in UTF-8, counted without an encoder so it
// runs in the engine's sandbox as it is.
//---------------------------------------------------------------------

export function ByteLength( Text )
{
	let bytes = 0;
	for ( let index = 0; index < Text.length; index++ )
	{
		const code = Text.charCodeAt( index );
		if ( code < 0x80 )
		{
			bytes = bytes + 1;
		}
		else if ( code < 0x800 )
		{
			bytes = bytes + 2;
		}
		else if ( code >= 0xD800 && code <= 0xDBFF )
		{
			bytes = bytes + 4;
			index = index + 1;
		}
		else
		{
			bytes = bytes + 3;
		}
	}
	return bytes;
}


//---------------------------------------------------------------------
// Padding, for the drawn block as for the text one.
//---------------------------------------------------------------------

export function PadLeft( Text, Width )
{
	return pad_left( Text, Width );
}


//---------------------------------------------------------------------

export function PadRight( Text, Width )
{
	return pad_right( Text, Width );
}


//=====================================================================
// The drawn block's columns and the command's words
//=====================================================================

export const TOOL_WIDTH_MAX = 16;


//---------------------------------------------------------------------
// The columns of the drawn block, as widths in cells, so the rows'
// cells line up: Time 8, Duration 7, Tool the longest tool name in the
// rows (at least 4, at most TOOL_WIDTH_MAX), Outcome 6, and Agent 8
// when any row came from a subagent (else 0: no column). The summary
// takes what is left.
//---------------------------------------------------------------------

export function BlockColumns( Rows )
{
	let tool = 4;
	let agent = 0;
	for ( const row of Rows || [] )
	{
		tool = Math.max( tool, String( row.tool || '' ).length );
		if ( row.agent )
		{
			agent = 8;
		}
	}
	tool = Math.min( tool, TOOL_WIDTH_MAX );
	return { time: 8, duration: 7, tool: tool, outcome: 6, agent: agent };
}


//---------------------------------------------------------------------
// The words of /claudit <args>: { word, value }, both lower case,
// "summary on" giving word "summary" and value "on"; nothing gives
// two empty strings.
//---------------------------------------------------------------------

export function ParseCommand( Args )
{
	const words = String( Args || '' ).trim().toLowerCase().split( /\s+/ );
	return {
		word: words[ 0 ] || '',
		value: words[ 1 ] || '',
	};
}
