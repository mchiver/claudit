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


//=====================================================================
// The command's words
//=====================================================================


//---------------------------------------------------------------------
// The words of /claudit <args>: { word, value }, both lower case,
// "on" giving word "on" and an empty value; nothing gives two empty
// strings.
//---------------------------------------------------------------------

export function ParseCommand( Args )
{
	const words = String( Args || '' ).trim().toLowerCase().split( /\s+/ );
	return {
		word: words[ 0 ] || '',
		value: words[ 1 ] || '',
	};
}
