//=====================================================================
// Claudit web UI: the module, the State service and the filters.
//
// State holds what the page shows: whether the engine's rows are
// shown, whether the turns run newest first, a count of the times the
// latest turn was asked for, the session list's width and whether it
// is collapsed, the sessions, the selected session and its events (with a version that
// counts every change to them), and the live connection. The look
// (palette, size, margins) is theme.js's. The components read State
// through their bindings or directly, and report through scope events
// ('claudit:select', 'claudit:collapse'). The markdown filter renders
// text with marked and cleans it with DOMPurify.
//=====================================================================

( function ()
{
	'use strict';

	const ENGINE_KEY = 'claudit.engine';
	const ORDER_KEY = 'claudit.order';
	const SESSIONS_WIDTH_KEY = 'claudit.sessions_width';
	const SESSIONS_HIDDEN_KEY = 'claudit.sessions_hidden';
	const SESSIONS_MIN_REM = 12;
	const SESSIONS_REFRESH_MS = 15000;

	angular.module( 'claudit', [] )


	//-----------------------------------------------------------------
	.factory( 'State', [ '$http', '$rootScope', '$interval', function ( $http, $rootScope, $interval )
	{
		const STATE = {
			engine: read_setting( ENGINE_KEY, 'off' ) === 'on',
			newest: read_setting( ORDER_KEY, 'oldest' ) === 'newest',
			latest: 0,
			sessions_width: read_setting( SESSIONS_WIDTH_KEY, '' ),
			sessions_hidden: read_setting( SESSIONS_HIDDEN_KEY, 'off' ) === 'on',
			sessions: [],
			selected: null,
			session: null,
			events: [],
			version: 0,
			connected: false,
			health: null,
			error: '',
		};
		let source = null;


		//-------------------------------------------------------------
		// The session list's width, as --sessions-width on the root;
		// nothing is set until the reader drags, so the stylesheet's
		// default holds.
		//-------------------------------------------------------------
		function ApplySessionsWidth()
		{
			if ( STATE.sessions_width !== '' )
			{
				document.documentElement.style.setProperty( '--sessions-width', STATE.sessions_width );
			}
		}


		//-------------------------------------------------------------
		// A dragged width in pixels, held between SESSIONS_MIN_REM and
		// half the window.
		//-------------------------------------------------------------
		function SetSessionsWidth( Px )
		{
			const rem = parseFloat( window.getComputedStyle( document.documentElement ).fontSize ) || 16;
			const least = SESSIONS_MIN_REM * rem;
			const most = window.innerWidth / 2;
			const width = Math.round( Math.max( least, Math.min( most, Px ) ) );
			STATE.sessions_width = width + 'px';
			write_setting( SESSIONS_WIDTH_KEY, STATE.sessions_width );
			ApplySessionsWidth();
		}


		//-------------------------------------------------------------
		function SetSessionsHidden( On )
		{
			STATE.sessions_hidden = ( On === true );
			write_setting( SESSIONS_HIDDEN_KEY, STATE.sessions_hidden ? 'on' : 'off' );
		}


		//-------------------------------------------------------------
		function SetEngine( On )
		{
			STATE.engine = ( On === true );
			write_setting( ENGINE_KEY, STATE.engine ? 'on' : 'off' );
		}


		//-------------------------------------------------------------
		// The order of the turns: newest first when On, else oldest
		// first; kept in the browser.
		//-------------------------------------------------------------
		function SetNewest( On )
		{
			STATE.newest = ( On === true );
			write_setting( ORDER_KEY, STATE.newest ? 'newest' : 'oldest' );
		}


		//-------------------------------------------------------------
		// Asks the event list to close every turn but the latest and
		// scroll to it: the count changes, and the list acts on that.
		//-------------------------------------------------------------
		function FocusLatest()
		{
			STATE.latest = STATE.latest + 1;
		}


		//-------------------------------------------------------------
		function LoadHealth()
		{
			return $http.get( 'api/health' ).then( function ( Response )
			{
				STATE.health = Response.data;
				STATE.error = '';
			}, function ()
			{
				STATE.health = null;
				STATE.error = 'The Claudit server is not answering.';
			} );
		}


		//-------------------------------------------------------------
		function LoadSessions()
		{
			return $http.get( 'api/sessions' ).then( function ( Response )
			{
				STATE.sessions = Response.data.sessions;
				STATE.error = '';
				if ( STATE.selected === null && STATE.sessions.length > 0 )
				{
					Select( STATE.sessions[ 0 ].id );
				}
				else if ( STATE.selected !== null )
				{
					STATE.session = find_session( STATE.selected ) || STATE.session;
				}
			}, function ()
			{
				STATE.error = 'The Claudit server is not answering.';
			} );
		}


		//-------------------------------------------------------------
		function Select( Id )
		{
			STATE.selected = Id;
			STATE.session = find_session( Id );
			STATE.events = [];
			STATE.version = STATE.version + 1;
			if ( Id === null )
			{
				return;
			}
			return $http.get( 'api/sessions/' + encodeURIComponent( Id ) ).then( function ( Response )
			{
				if ( STATE.selected !== Id )
				{
					return;
				}
				STATE.session = Response.data.session;
				STATE.events = Response.data.events;
				STATE.version = STATE.version + 1;
			} );
		}


		//-------------------------------------------------------------
		function Connect()
		{
			if ( source !== null )
			{
				return;
			}
			source = new EventSource( 'api/live' );
			source.onopen = function ()
			{
				STATE.connected = true;
				$rootScope.$applyAsync();
			};
			source.onerror = function ()
			{
				STATE.connected = false;
				$rootScope.$applyAsync();
			};
			source.onmessage = function ( Message )
			{
				let event = null;
				try
				{
					event = JSON.parse( Message.data );
				}
				catch ( error )
				{
					return;
				}
				OnLive( event );
				$rootScope.$applyAsync();
			};
		}


		//-------------------------------------------------------------
		// One live event: a session mark, a turn, a call or a message.
		// Counted on its session's row; added to the selected session's
		// events, a call or message replacing the one with its id (a
		// call arrives twice, running then finished), a turn's start
		// and end kept as two.
		//-------------------------------------------------------------
		function OnLive( Event )
		{
			if ( Event.kind === 'session' )
			{
				LoadSessions();
				if ( Event.session === STATE.selected )
				{
					STATE.events.push( Event );
					STATE.version = STATE.version + 1;
				}
				return;
			}
			if ( Event.kind !== 'call' && Event.kind !== 'turn' && Event.kind !== 'message' )
			{
				return;
			}
			const summary = find_session( Event.session );
			if ( !summary )
			{
				LoadSessions();
			}
			else
			{
				summary.updated = Date.now();
				summary.live = true;
				count_on_summary( summary, Event );
			}
			if ( Event.session !== STATE.selected )
			{
				return;
			}
			let index = -1;
			if ( Event.kind !== 'turn' )
			{
				index = index_of_event( Event.id, Event.kind );
			}
			if ( index === -1 )
			{
				STATE.events.push( Event );
			}
			else
			{
				STATE.events[ index ] = Event;
			}
			STATE.version = STATE.version + 1;
		}


		//-------------------------------------------------------------
		function count_on_summary( Summary, Event )
		{
			if ( !Summary.counts )
			{
				Summary.counts = { calls: 0, done: 0, denied: 0, failed: 0, turns: 0 };
			}
			if ( Event.kind === 'call' && Event.outcome !== 'running' )
			{
				Summary.counts.calls = Summary.counts.calls + 1;
				if ( Summary.counts[ Event.outcome ] !== undefined )
				{
					Summary.counts[ Event.outcome ] = Summary.counts[ Event.outcome ] + 1;
				}
			}
			if ( Event.kind === 'turn' && Event.phase === 'start' )
			{
				Summary.counts.turns = ( Summary.counts.turns || 0 ) + 1;
			}
		}


		//-------------------------------------------------------------
		function find_session( Id )
		{
			for ( const summary of STATE.sessions )
			{
				if ( summary.id === Id )
				{
					return summary;
				}
			}
			return null;
		}


		//-------------------------------------------------------------
		function index_of_event( Id, Kind )
		{
			if ( !Id )
			{
				return -1;
			}
			for ( let index = 0; index < STATE.events.length; index++ )
			{
				if ( STATE.events[ index ].id === Id && STATE.events[ index ].kind === Kind )
				{
					return index;
				}
			}
			return -1;
		}


		//-------------------------------------------------------------
		function Start()
		{
			ApplySessionsWidth();
			LoadHealth();
			LoadSessions();
			Connect();
			$interval( function ()
			{
				LoadSessions();
				LoadHealth();
			}, SESSIONS_REFRESH_MS );
		}


		return {
			state: STATE,
			Start: Start,
			SetEngine: SetEngine,
			SetNewest: SetNewest,
			FocusLatest: FocusLatest,
			SetSessionsWidth: SetSessionsWidth,
			SetSessionsHidden: SetSessionsHidden,
			LoadHealth: LoadHealth,
			LoadSessions: LoadSessions,
			Select: Select,
		};
	} ] )


	//-----------------------------------------------------------------
	// Text rendered as markdown by marked, cleaned by DOMPurify, trusted
	// for ng-bind-html. Without marked (its script not loaded) the text
	// is shown as it is, escaped, in a pre.
	//-----------------------------------------------------------------
	.filter( 'markdown', [ '$sce', function ( $sce )
	{
		return function ( Text )
		{
			if ( typeof Text !== 'string' || Text === '' )
			{
				return '';
			}
			let html = '';
			if ( window.marked && typeof window.marked.parse === 'function' )
			{
				try
				{
					html = window.marked.parse( Text, { breaks: true, gfm: true } );
				}
				catch ( error )
				{
					html = '';
				}
			}
			if ( html === '' )
			{
				html = '<pre>' + escape_html( Text ) + '</pre>';
			}
			if ( window.DOMPurify && typeof window.DOMPurify.sanitize === 'function' )
			{
				html = window.DOMPurify.sanitize( html );
			}
			return $sce.trustAsHtml( html );
		};
	} ] )


	//-----------------------------------------------------------------
	.filter( 'clock', function ()
	{
		return function ( Ms )
		{
			if ( typeof Ms !== 'number' )
			{
				return '';
			}
			const date = new Date( Ms );
			return [ date.getHours(), date.getMinutes(), date.getSeconds() ]
				.map( function ( Part ) { return String( Part ).padStart( 2, '0' ); } )
				.join( ':' );
		};
	} )


	//-----------------------------------------------------------------
	.filter( 'day', function ()
	{
		return function ( Ms )
		{
			if ( typeof Ms !== 'number' )
			{
				return '';
			}
			const date = new Date( Ms );
			return date.getFullYear() + '-' + String( date.getMonth() + 1 ).padStart( 2, '0' ) + '-' + String( date.getDate() ).padStart( 2, '0' );
		};
	} )


	//-----------------------------------------------------------------
	.filter( 'duration', function ()
	{
		return function ( Ms )
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
		};
	} )


	//-----------------------------------------------------------------
	.filter( 'shortId', function ()
	{
		return function ( Id )
		{
			if ( typeof Id !== 'string' )
			{
				return '';
			}
			return Id.slice( 0, 8 );
		};
	} )


	//-----------------------------------------------------------------
	.filter( 'basename', function ()
	{
		return function ( Path )
		{
			if ( typeof Path !== 'string' || Path === '' )
			{
				return '';
			}
			const parts = Path.replace( /[\\/]+$/, '' ).split( /[\\/]/ );
			return parts[ parts.length - 1 ];
		};
	} );


	//-----------------------------------------------------------------
	function read_setting( Key, Fallback )
	{
		try
		{
			return window.localStorage.getItem( Key ) || Fallback;
		}
		catch ( error )
		{
			return Fallback;
		}
	}


	//-----------------------------------------------------------------
	function escape_html( Text )
	{
		return String( Text )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' );
	}


	//-----------------------------------------------------------------
	function write_setting( Key, Value )
	{
		try
		{
			window.localStorage.setItem( Key, Value );
		}
		catch ( error )
		{
			// Storage may be blocked; the setting lives for the page.
		}
	}

} )();
