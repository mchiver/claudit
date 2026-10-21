//=====================================================================
// <session-list>: the sessions down the left, live ones on top,
// archived ones below.
//
// Bindings: sessions (the summaries from /api/sessions), selected (the
// selected session's id). Reports: 'claudit:select' with a session id
// when one is picked.
//=====================================================================

( function ()
{
	'use strict';

	angular.module( 'claudit' ).component( 'sessionList', {
		templateUrl: 'components/session-list/session-list.html',
		bindings: {
			sessions: '<',
			selected: '<',
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
	}

} )();
