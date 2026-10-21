//=====================================================================
// <claudit-app>: the page. Starts the State service and lays out the
// title bar, the session list and the event list.
//
// Bindings: none. Reads: State. Listens: 'claudit:select' (a session
// id) from the session list, and selects that session.
//=====================================================================

( function ()
{
	'use strict';

	angular.module( 'claudit' ).component( 'clauditApp', {
		templateUrl: 'components/claudit-app/claudit-app.html',
		controller: [ 'State', '$scope', ClauditAppController ],
	} );


	function ClauditAppController( State, $scope )
	{
		const controller = this;
		controller.state = State.state;

		controller.$onInit = function ()
		{
			State.Start();
			$scope.$on( 'claudit:select', function ( Event, Id )
			{
				State.Select( Id );
			} );
		};
	}

} )();
