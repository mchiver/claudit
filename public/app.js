//=====================================================================
// Claudit web UI: the module, the State service and the filters.
//
// State holds what the page shows: the theme and scale, whether the
// engine's rows are shown, the sessions, the selected session and its
// events (with a version that counts every change to them), and the
// live connection. The components read it through their bindings or
// directly, and report through scope events ('claudit:select').
//=====================================================================

( function ()
{
	'use strict';

	const THEME_KEY = 'claudit.theme';
	const SCALE_KEY = 'claudit.scale';
	const ENGINE_KEY = 'claudit.engine';
	const SESSIONS_REFRESH_MS = 15000;

	angular.module( 'claudit', [] )


	//-----------------------------------------------------------------
	.factory( 'State', [ '$http', '$rootScope', '$interval', function ( $http, $rootScope, $interval )
	{
		const STATE = {
			theme: read_setting( THEME_KEY, 'dark' ),
			scale: read_setting( SCALE_KEY, 'normal' ),
			engine: read_setting( ENGINE_KEY, 'off' ) === 'on',
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
		function ApplyLook()
		{
			document.documentElement.setAttribute( 'data-bs-theme', STATE.theme );
			document.body.classList.remove( 'scale-small', 'scale-normal', 'scale-large' );
			document.body.classList.add( 'scale-' + STATE.scale );
		}


		//-------------------------------------------------------------
		function SetTheme( Theme )
		{
			STATE.theme = Theme;
			write_setting( THEME_KEY, Theme );
			ApplyLook();
		}


		//-------------------------------------------------------------
		function SetScale( Scale )
		{
			STATE.scale = Scale;
			write_setting( SCALE_KEY, Scale );
			ApplyLook();
		}


		//-------------------------------------------------------------
		function SetEngine( On )
		{
			STATE.engine = ( On === true );
			write_setting( ENGINE_KEY, STATE.engine ? 'on' : 'off' );
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
			ApplyLook();
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
			SetTheme: SetTheme,
			SetScale: SetScale,
			SetEngine: SetEngine,
			LoadHealth: LoadHealth,
			LoadSessions: LoadSessions,
			Select: Select,
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
