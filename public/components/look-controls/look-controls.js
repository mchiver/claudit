//=====================================================================
// <look-controls>: the theme, the size and the margins, a label and a
// select per row, in the title bar's look popover. Copied from
// Consensus's look-controls, without its editor and confirm rows.
//
// Bindings: none. Reads: window.ClauditTheme (theme.js) and sets the
// three through it. Reports: nothing.
//=====================================================================

( function ()
{
	'use strict';

	angular.module( 'claudit' ).component( 'lookControls', {
		templateUrl: 'components/look-controls/look-controls.html',
		controller: [ '$window', LookControlsController ],
	} );


	function LookControlsController( $window )
	{
		const controller = this;
		const theme = $window.ClauditTheme;
		controller.palettes = theme.PALETTES;
		controller.theme = theme.Get().Theme;
		controller.scale = theme.Get().Scale;
		controller.margins = theme.Get().Margins;

		controller.SetTheme = function ()
		{
			theme.SetTheme( controller.theme );
		};

		controller.SetScale = function ()
		{
			theme.SetScale( controller.scale );
		};

		controller.SetMargins = function ()
		{
			theme.SetMargins( controller.margins );
		};
	}

} )();
