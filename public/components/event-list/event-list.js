//=====================================================================
// <event-list>: the selected session as a tree of turns. Each turn (a
// user message) opens into the assistant's messages and the tool calls
// in order; a call opens into its input as fields and its result as
// markdown, an assistant row into its text as markdown, an engine row
// into its JSON; the {} button swaps a row's detail for its raw JSON.
// Session marks sit between the turns. The engine's rows (reminders, attachments,
// notices, thinking) are shown dimmed when the engine binding is on.
//
// Bindings: events (the session's events, archived then live), session
// (its summary), version (counts every change to the events), engine
// (whether the engine's rows are shown), newest (the turns newest
// first), latest (a count: each change closes every turn but the
// latest and scrolls to it), search (the text that filters the turns).
// Reports: 'claudit:matches' ({ matched, total } turns, or null with
// no search) each time the tree is built. In a live session the
// latest turn is open, running or ended, until the next turn starts;
// a turn the reader opened or closed keeps that choice. Follows the
// session when the tree grows while the reader is at its newest end
// (the bottom, or the top when newest first). While the session is
// live and a turn or call is running, a one-second timer keeps its
// running time counting in the duration column.
//=====================================================================

( function ()
{
	'use strict';

	const NEAR_BOTTOM_PX = 48;
	const TICK_MS = 1000;

	angular.module( 'claudit' ).component( 'eventList', {
		templateUrl: 'components/event-list/event-list.html',
		bindings: {
			events: '<',
			session: '<',
			version: '<',
			engine: '<',
			newest: '<',
			latest: '<',
			search: '<',
		},
		controller: [ '$element', '$timeout', '$interval', '$filter', '$scope', EventListController ],
	} );


	function EventListController( $element, $timeout, $interval, $filter, $scope )
	{
		const controller = this;
		let built_version = -1;
		let built_session = null;
		let built_newest = null;
		let built_search = null;
		let has_running = false;
		let timer = null;
		let all_nodes = [];
		controller.now = Date.now();
		let seen_latest = null;
		let last_size = 0;
		controller.latest_key = null;
		controller.nodes = [];
		controller.open = {};
		controller.shown = {};
		controller.raw = {};
		let details = {};


		//-------------------------------------------------------------
		controller.$doCheck = function ()
		{
			const session_id = controller.session ? controller.session.id : null;
			if ( session_id !== built_session )
			{
				built_session = session_id;
				controller.open = {};
				controller.shown = {};
				controller.raw = {};
				built_version = -1;
			}
			if ( controller.version !== built_version || controller.newest !== built_newest || controller.search !== built_search )
			{
				rebuild();
			}
			update_timer();
			if ( seen_latest === null )
			{
				seen_latest = controller.latest;
			}
			else if ( controller.latest !== seen_latest )
			{
				seen_latest = controller.latest;
				focus_latest();
			}
		};


		//-------------------------------------------------------------
		function rebuild()
		{
			built_version = controller.version;
			built_newest = controller.newest;
			built_search = controller.search;
			details = {};
			const built = globalThis.ClauditTurns.BuildTurns( controller.events || [] );
			controller.latest_key = latest_turn_key( built );
			all_nodes = globalThis.ClauditTurns.OrderNodes( built, controller.newest === true );
			controller.nodes = globalThis.ClauditTurns.FilterNodes( all_nodes, controller.search );
			report_matches( all_nodes, controller.nodes );
			has_running = anything_running( built );
			let size = 0;
			for ( const node of controller.nodes )
			{
				size = size + 1 + ( node.rows ? node.rows.length : 0 );
			}
			const grew = size > last_size;
			last_size = size;
			follow( grew );
		}


		//-------------------------------------------------------------
		// Tells the page how many turns the search keeps, of how many;
		// null when there is no search.
		//-------------------------------------------------------------
		function report_matches( All, Kept )
		{
			const search = String( controller.search || '' ).trim();
			if ( search === '' )
			{
				$scope.$emit( 'claudit:matches', null );
				return;
			}
			$scope.$emit( 'claudit:matches', { matched: count_turns( Kept ), total: count_turns( All ) } );
		}


		//-------------------------------------------------------------
		function count_turns( Nodes )
		{
			return Nodes.filter( function ( Node ) { return Node.kind === 'turn' && !Node.synthetic; } ).length;
		}


		//-------------------------------------------------------------
		// Whether a turn or a call in the tree is still running.
		//-------------------------------------------------------------
		function anything_running( Nodes )
		{
			for ( const node of Nodes )
			{
				if ( node.kind !== 'turn' )
				{
					continue;
				}
				if ( is_running_turn( node ) )
				{
					return true;
				}
				for ( const row of node.rows )
				{
					if ( is_running_call( row ) )
					{
						return true;
					}
				}
			}
			return false;
		}


		//-------------------------------------------------------------
		function is_running_turn( Node )
		{
			return Node.end === null && !Node.synthetic && typeof Node.start === 'number';
		}


		//-------------------------------------------------------------
		function is_running_call( Row )
		{
			return Row.kind === 'call' && Row.call && Row.call.outcome === 'running' && typeof Row.call.start === 'number';
		}


		//-------------------------------------------------------------
		// The one-second timer runs only while the session is live and
		// something is running; otherwise it is cancelled.
		//-------------------------------------------------------------
		function update_timer()
		{
			const live = controller.session && controller.session.live === true;
			const wanted = live && has_running;
			if ( wanted && timer === null )
			{
				controller.now = Date.now();
				timer = $interval( function () { controller.now = Date.now(); }, TICK_MS );
			}
			else if ( !wanted && timer !== null )
			{
				$interval.cancel( timer );
				timer = null;
			}
		}


		//-------------------------------------------------------------
		// A turn's duration column: the exact duration once it ended,
		// the running time in whole seconds while it runs in a live
		// session, else blank.
		//-------------------------------------------------------------
		controller.TurnDuration = function ( Node )
		{
			if ( typeof Node.duration === 'number' )
			{
				return $filter( 'duration' )( Node.duration );
			}
			if ( timer !== null && is_running_turn( Node ) )
			{
				return $filter( 'elapsed' )( controller.now - Node.start );
			}
			return '';
		};


		//-------------------------------------------------------------
		// A row's duration column: blank for an assistant or engine row,
		// which has no call.
		//-------------------------------------------------------------
		controller.CallDuration = function ( Row )
		{
			if ( !Row.call )
			{
				return '';
			}
			if ( typeof Row.call.duration === 'number' )
			{
				return $filter( 'duration' )( Row.call.duration );
			}
			if ( timer !== null && is_running_call( Row ) )
			{
				return $filter( 'elapsed' )( controller.now - Row.call.start );
			}
			return '';
		};


		//-------------------------------------------------------------
		controller.$onDestroy = function ()
		{
			if ( timer !== null )
			{
				$interval.cancel( timer );
				timer = null;
			}
		};


		//-------------------------------------------------------------
		// Scrolls to the newest end (the bottom, or the top when newest
		// first) unless the tree grew while the reader was away from it.
		//-------------------------------------------------------------
		function follow( Grew )
		{
			const scroller = $element[ 0 ].querySelector( '.event-scroll' );
			if ( !scroller )
			{
				return;
			}
			const newest = controller.newest === true;
			let near = ( scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight ) < NEAR_BOTTOM_PX;
			if ( newest )
			{
				near = scroller.scrollTop < NEAR_BOTTOM_PX;
			}
			if ( Grew && !near )
			{
				return;
			}
			$timeout( function ()
			{
				scroller.scrollTop = newest ? 0 : scroller.scrollHeight;
			}, 0, false );
		}


		//-------------------------------------------------------------
		// The key of the latest turn: the last real turn in the order
		// built (oldest first), null when there is none.
		//-------------------------------------------------------------
		function latest_turn_key( Nodes )
		{
			let key = null;
			for ( const node of Nodes )
			{
				if ( node.kind === 'turn' && !node.synthetic )
				{
					key = node.key;
				}
			}
			return key;
		}


		//-------------------------------------------------------------
		// The latest-turn button: every turn closed but the latest,
		// which opens, then the list scrolled to it once it is drawn.
		//-------------------------------------------------------------
		function focus_latest()
		{
			controller.open = {};
			if ( controller.latest_key === null )
			{
				return;
			}
			controller.open[ controller.latest_key ] = true;
			const key = controller.latest_key;
			$timeout( function ()
			{
				const element = $element[ 0 ].querySelector( '[data-key="' + key + '"]' );
				if ( element )
				{
					element.scrollIntoView( { block: 'start' } );
				}
			}, 0, false );
		}


		//-------------------------------------------------------------
		controller.IsOpen = function ( Node )
		{
			if ( controller.open[ Node.key ] !== undefined )
			{
				return controller.open[ Node.key ];
			}
			const live = controller.session && controller.session.live === true;
			return live && Node.key === controller.latest_key;
		};


		//-------------------------------------------------------------
		controller.Toggle = function ( Node )
		{
			controller.open[ Node.key ] = !controller.IsOpen( Node );
		};


		//-------------------------------------------------------------
		controller.IsShown = function ( Key )
		{
			return controller.shown[ Key ] === true;
		};


		//-------------------------------------------------------------
		controller.Show = function ( Key )
		{
			controller.shown[ Key ] = !controller.IsShown( Key );
		};


		//-------------------------------------------------------------
		controller.IsRaw = function ( Key )
		{
			return controller.raw[ Key ] === true;
		};


		//-------------------------------------------------------------
		// The {} button: shows the row's raw JSON in place of its
		// detail, opening the row when it was closed.
		//-------------------------------------------------------------
		controller.ShowRaw = function ( Key )
		{
			controller.raw[ Key ] = !controller.IsRaw( Key );
			controller.shown[ Key ] = true;
		};


		//-------------------------------------------------------------
		// A call's input fields and result text, computed once per
		// build of the tree (the same objects each digest, so ng-repeat
		// and ng-bind-html see nothing new).
		//-------------------------------------------------------------
		controller.Fields = function ( Row )
		{
			const key = 'fields-' + Row.key;
			if ( details[ key ] === undefined )
			{
				details[ key ] = globalThis.ClauditTurns.InputFields( Row.input ? Row.input.block : null );
			}
			return details[ key ];
		};


		//-------------------------------------------------------------
		controller.Result = function ( Row )
		{
			const key = 'result-' + Row.key;
			if ( details[ key ] === undefined )
			{
				details[ key ] = globalThis.ClauditTurns.ResultText( Row.result ? Row.result.block : null );
			}
			return details[ key ];
		};


		//-------------------------------------------------------------
		controller.Rows = function ( Node )
		{
			if ( controller.engine )
			{
				return Node.rows;
			}
			return Node.rows.filter( function ( Row ) { return Row.kind !== 'engine'; } );
		};


		//-------------------------------------------------------------
		controller.Hidden = function ( Node )
		{
			if ( controller.engine )
			{
				return 0;
			}
			return Node.rows.filter( function ( Row ) { return Row.kind === 'engine'; } ).length;
		};


		//-------------------------------------------------------------
		controller.TurnClass = function ( Node )
		{
			return {
				'is-open': controller.IsOpen( Node ),
				'is-running': Node.end === null && !Node.synthetic,
				'is-synthetic': Node.synthetic === true,
			};
		};


		//-------------------------------------------------------------
		controller.RowClass = function ( Row )
		{
			if ( Row.kind === 'call' )
			{
				return 'is-call is-' + ( Row.call.outcome || 'done' );
			}
			return 'is-' + Row.kind;
		};


		//-------------------------------------------------------------
		controller.Reason = function ( Node )
		{
			if ( Node.reason )
			{
				return Node.reason;
			}
			if ( Node.synthetic )
			{
				return '';
			}
			if ( Node.end === null )
			{
				return 'running';
			}
			return 'ended';
		};


		//-------------------------------------------------------------
		// The header's counts are the whole session's, search or not.
		//-------------------------------------------------------------
		controller.Turns = function ()
		{
			return count_turns( all_nodes );
		};


		//-------------------------------------------------------------
		controller.Calls = function ()
		{
			let count = 0;
			for ( const node of all_nodes )
			{
				if ( node.kind === 'turn' )
				{
					count = count + node.counts.calls;
				}
			}
			return count;
		};
	}

} )();
