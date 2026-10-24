//=====================================================================
// <claudit-app>: the page. Starts the State service and lays out the
// title bar, the session list, the splitter and the event list.
//
// Bindings: none. Reads: State. Listens: 'claudit:select' (a session
// id) from the session list, and selects that session;
// 'claudit:collapse' (a boolean) from the session list, and hides or
// shows it; 'claudit:matches' ({ matched, total } or null) from the
// event list, and passes it to State for the title bar's count. The splitter's drag sets the list's width through State:
// mouse down on the handle, move on the window, up ends it.
//=====================================================================

( function ()
{
	'use strict';

	angular.module( 'claudit' ).component( 'clauditApp', {
		templateUrl: 'components/claudit-app/claudit-app.html',
		controller: [ 'State', '$scope', '$element', ClauditAppController ],
	} );


	function ClauditAppController( State, $scope, $element )
	{
		const controller = this;
		controller.state = State.state;


		//-------------------------------------------------------------
		controller.$onInit = function ()
		{
			State.Start();
			$scope.$on( 'claudit:select', function ( Event, Id )
			{
				State.Select( Id );
			} );
			$scope.$on( 'claudit:collapse', function ( Event, Hidden )
			{
				State.SetSessionsHidden( Hidden );
			} );
			$scope.$on( 'claudit:matches', function ( Event, Matches )
			{
				State.SetMatches( Matches );
			} );
		};


		//-------------------------------------------------------------
		controller.StartDrag = function ( Down )
		{
			Down.preventDefault();
			const body = $element[ 0 ].querySelector( '.claudit-body' );
			const left = body ? body.getBoundingClientRect().left : 0;
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none';

			function move( Event )
			{
				State.SetSessionsWidth( Event.clientX - left );
			}

			function up()
			{
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
				window.removeEventListener( 'mousemove', move );
				window.removeEventListener( 'mouseup', up );
			}

			window.addEventListener( 'mousemove', move );
			window.addEventListener( 'mouseup', up );
		};
	}

} )();
