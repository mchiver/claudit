//=====================================================================
// <event-list>: the selected session's events, oldest first, the call
// in flight highlighted, new ones arriving over the live stream.
//
// Bindings: events (the session's events, archived then live), session
// (its summary). Reports: nothing. Scrolls to the newest row when the
// list grows while the reader is at the bottom.
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
		},
		controller: [ '$element', '$timeout', EventListController ],
	} );


	function EventListController( $element, $timeout )
	{
		const controller = this;
		let last_count = 0;

		controller.RowClass = function ( Event )
		{
			if ( Event.kind === 'session' )
			{
				return 'is-session';
			}
			return 'is-' + ( Event.outcome || 'done' );
		};

		controller.Calls = function ()
		{
			return ( controller.events || [] ).filter( function ( Event ) { return Event.kind === 'call'; } ).length;
		};

		controller.$doCheck = function ()
		{
			const count = ( controller.events || [] ).length;
			if ( count === last_count )
			{
				return;
			}
			const grew = count > last_count;
			last_count = count;
			const scroller = $element[ 0 ].querySelector( '.event-scroll' );
			if ( !scroller )
			{
				return;
			}
			const at_bottom = ( scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight ) < NEAR_BOTTOM_PX;
			if ( grew && at_bottom || !grew )
			{
				$timeout( function ()
				{
					scroller.scrollTop = scroller.scrollHeight;
				}, 0, false );
			}
		};
	}

} )();
