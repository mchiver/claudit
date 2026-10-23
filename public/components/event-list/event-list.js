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
// (whether the engine's rows are shown). Reports: nothing. In a live
// session the turn in flight is open and followed; a turn that has
// ended is closed unless the reader opened it. Scrolls to the newest
// row when the tree grows while the reader is at the bottom.
//=====================================================================

( function ()
{
	'use strict';

	const NEAR_BOTTOM_PX = 48;

	angular.module( 'claudit' ).component( 'eventList', {
		templateUrl: 'components/event-list/event-list.html',
		bindings: {
			events: '<',
			session: '<',
			version: '<',
			engine: '<',
		},
		controller: [ '$element', '$timeout', EventListController ],
	} );


	function EventListController( $element, $timeout )
	{
		const controller = this;
		let built_version = -1;
		let built_session = null;
		let last_size = 0;
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
			if ( controller.version !== built_version )
			{
				rebuild();
			}
		};


		//-------------------------------------------------------------
		function rebuild()
		{
			built_version = controller.version;
			details = {};
			controller.nodes = globalThis.ClauditTurns.BuildTurns( controller.events || [] );
			let size = 0;
			for ( const node of controller.nodes )
			{
				size = size + 1 + ( node.rows ? node.rows.length : 0 );
			}
			const grew = size > last_size;
			last_size = size;
			const scroller = $element[ 0 ].querySelector( '.event-scroll' );
			if ( !scroller )
			{
				return;
			}
			const at_bottom = ( scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight ) < NEAR_BOTTOM_PX;
			if ( ( grew && at_bottom ) || !grew )
			{
				$timeout( function ()
				{
					scroller.scrollTop = scroller.scrollHeight;
				}, 0, false );
			}
		}


		//-------------------------------------------------------------
		controller.IsOpen = function ( Node )
		{
			if ( controller.open[ Node.key ] !== undefined )
			{
				return controller.open[ Node.key ];
			}
			const live = controller.session && controller.session.live === true;
			return live && Node.end === null && !Node.synthetic;
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
		controller.Turns = function ()
		{
			return controller.nodes.filter( function ( Node ) { return Node.kind === 'turn' && !Node.synthetic; } ).length;
		};


		//-------------------------------------------------------------
		controller.Calls = function ()
		{
			let count = 0;
			for ( const node of controller.nodes )
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
