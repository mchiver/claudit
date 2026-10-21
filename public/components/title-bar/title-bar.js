//=====================================================================
// <title-bar>: the name, the server's state, the theme and scale
// controls.
//
// Bindings: none. Reads: State (connected, health, theme, scale) and
// sets the theme and scale through it. Reports: nothing.
//=====================================================================

( function ()
{
	'use strict';

	angular.module( 'claudit' ).component( 'titleBar', {
		templateUrl: 'components/title-bar/title-bar.html',
		controller: [ 'State', TitleBarController ],
	} );


	function TitleBarController( State )
	{
		const controller = this;
		controller.state = State.state;
		controller.scales = [ 'small', 'normal', 'large' ];

		controller.ToggleTheme = function ()
		{
			State.SetTheme( controller.state.theme === 'dark' ? 'light' : 'dark' );
		};

		controller.SetScale = function ( Scale )
		{
			State.SetScale( Scale );
		};
	}

} )();
