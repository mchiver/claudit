//=====================================================================
// <session-list>: the sessions down the left, live ones on top,
// archived ones below, two lines each (the folder's name and the
// time, then the counts and the short id), under a header row whose
// chevron collapses the list to a rail.
//
// Bindings: sessions (the summaries from /api/sessions), selected (the
// selected session's id), collapsed (whether the list is a rail).
// Reports: 'claudit:select' with a session id when one is picked;
// 'claudit:collapse' with true or false when the chevron is pressed.
//=====================================================================

( function ()
{
	'use strict';

	angular.module( 'claudit' ).component( 'sessionList', {
		templateUrl: 'components/session-list/session-list.html',
		bindings: {
			sessions: '<',
			selected: '<',
			collapsed: '<',
		},
		controller: [ '$scope', SessionListController ],
	} );


	function SessionListController( $scope )
	{
		const controller = this;

		controller.Live = function ()
		{
			return ( controller.sessions || [] ).filter( function ( Summary ) { return Summary.live; } );
		};

		controller.Archived = function ()
		{
			return ( controller.sessions || [] ).filter( function ( Summary ) { return !Summary.live; } );
		};

		controller.Select = function ( Summary )
		{
			$scope.$emit( 'claudit:select', Summary.id );
		};

		controller.Collapse = function ()
		{
			$scope.$emit( 'claudit:collapse', !controller.collapsed );
		};
	}

} )();
