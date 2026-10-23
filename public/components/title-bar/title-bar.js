//=====================================================================
// <title-bar>: the name, the server's state, the engine-rows toggle
// and the look button, whose popover holds <look-controls>.
//
// Bindings: none. Reads: State (connected, health, engine) and sets
// the engine toggle through it. Reports: nothing. The popover closes
// on a click elsewhere, Escape or the button again.
//=====================================================================

( function ()
{
	'use strict';

	angular.module( 'claudit' ).component( 'titleBar', {
		templateUrl: 'components/title-bar/title-bar.html',
		controller: [ 'State', '$scope', '$element', TitleBarController ],
	} );


	function TitleBarController( State, $scope, $element )
	{
		const controller = this;
		controller.state = State.state;
		controller.look_open = false;


		//-------------------------------------------------------------
		controller.ToggleEngine = function ()
		{
			State.SetEngine( !controller.state.engine );
		};


		//-------------------------------------------------------------
		controller.ToggleLook = function ( Event )
		{
			Event.stopPropagation();
			controller.look_open = !controller.look_open;
		};


		//-------------------------------------------------------------
		function close_look()
		{
			if ( controller.look_open )
			{
				controller.look_open = false;
				$scope.$applyAsync();
			}
		}


		//-------------------------------------------------------------
		function on_mousedown( Event )
		{
			if ( !controller.look_open )
			{
				return;
			}
			const popover = $element[ 0 ].querySelector( '.look-popover' );
			const button = $element[ 0 ].querySelector( '.look-button' );
			if ( ( popover && popover.contains( Event.target ) ) || ( button && button.contains( Event.target ) ) )
			{
				return;
			}
			close_look();
		}


		//-------------------------------------------------------------
		function on_keydown( Event )
		{
			if ( Event.key === 'Escape' )
			{
				close_look();
			}
		}


		controller.$onInit = function ()
		{
			document.addEventListener( 'mousedown', on_mousedown, true );
			document.addEventListener( 'keydown', on_keydown );
		};

		controller.$onDestroy = function ()
		{
			document.removeEventListener( 'mousedown', on_mousedown, true );
			document.removeEventListener( 'keydown', on_keydown );
		};
	}

} )();
