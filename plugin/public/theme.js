//=====================================================================
// Claudit web UI: the look. A palette (System, or one of nine light
// and dark ones), a size (small, normal, large) and the margins
// (narrow, normal, wide: the width the event list's content is held
// to). Loaded before Angular and applied before the page renders, from
// the browser's storage: Bootstrap's data-bs-theme carries light or
// dark, data-theme the palette, --scale the size and --text-width the
// margins, all on the root element. Copied from Consensus's theme.js.
//
// Attaches itself as window.ClauditTheme: PALETTES, SCALES, MARGINS,
// Get(), SetTheme( Id ), SetScale( Name ), SetMargins( Name ).
//=====================================================================

( function ()
{
	'use strict';

	const THEME_KEY = 'claudit.theme';
	const SCALE_KEY = 'claudit.scale';
	const MARGINS_KEY = 'claudit.margins';

	const PALETTES = [
		{ Id: 'system', Label: 'System', Dark: null },
		{ Id: 'light', Label: 'Light', Dark: false },
		{ Id: 'sepia', Label: 'Sepia', Dark: false },
		{ Id: 'paper', Label: 'Paper', Dark: false },
		{ Id: 'solarized-light', Label: 'Solarized Light', Dark: false },
		{ Id: 'dark', Label: 'Dark', Dark: true },
		{ Id: 'slate', Label: 'Slate', Dark: true },
		{ Id: 'solarized-dark', Label: 'Solarized Dark', Dark: true },
		{ Id: 'nord', Label: 'Nord', Dark: true },
		{ Id: 'midnight', Label: 'Midnight', Dark: true },
	];
	const SCALES = { small: 0.875, normal: 1, large: 1.15 };
	const MARGINS = { narrow: 'none', normal: '68rem', wide: '52rem' };

	const CURRENT = { Theme: 'system', Scale: 'normal', Margins: 'narrow' };
	const MEDIA = window.matchMedia( '(prefers-color-scheme: dark)' );


	//-----------------------------------------------------------------
	function read( Key, Fallback )
	{
		try
		{
			return window.localStorage.getItem( Key ) || Fallback;
		}
		catch ( error )
		{
			return Fallback;
		}
	}


	//-----------------------------------------------------------------
	function write( Key, Value )
	{
		try
		{
			window.localStorage.setItem( Key, Value );
		}
		catch ( error )
		{
			// Storage may be blocked; the setting lives for the page.
		}
	}


	//-----------------------------------------------------------------
	function palette_of( Id )
	{
		for ( const palette of PALETTES )
		{
			if ( palette.Id === Id )
			{
				return palette;
			}
		}
		return PALETTES[ 0 ];
	}


	//-----------------------------------------------------------------
	function is_dark()
	{
		const palette = palette_of( CURRENT.Theme );
		if ( palette.Dark === null )
		{
			return MEDIA.matches;
		}
		return palette.Dark;
	}


	//-----------------------------------------------------------------
	// The palette in effect: for System, light or dark as the OS says.
	//-----------------------------------------------------------------
	function palette()
	{
		if ( CURRENT.Theme === 'system' )
		{
			return MEDIA.matches ? 'dark' : 'light';
		}
		return CURRENT.Theme;
	}


	//-----------------------------------------------------------------
	function apply()
	{
		const root = document.documentElement;
		root.setAttribute( 'data-bs-theme', is_dark() ? 'dark' : 'light' );
		root.setAttribute( 'data-theme', palette() );
		root.style.setProperty( '--scale', String( SCALES[ CURRENT.Scale ] ) );
		root.style.setProperty( '--text-width', MARGINS[ CURRENT.Margins ] );
	}


	//-----------------------------------------------------------------
	function SetTheme( Id )
	{
		if ( palette_of( Id ).Id !== Id )
		{
			return;
		}
		CURRENT.Theme = Id;
		write( THEME_KEY, Id );
		apply();
	}


	//-----------------------------------------------------------------
	function SetScale( Name )
	{
		if ( !SCALES[ Name ] )
		{
			return;
		}
		CURRENT.Scale = Name;
		write( SCALE_KEY, Name );
		apply();
	}


	//-----------------------------------------------------------------
	function SetMargins( Name )
	{
		if ( !MARGINS[ Name ] )
		{
			return;
		}
		CURRENT.Margins = Name;
		write( MARGINS_KEY, Name );
		apply();
	}


	//-----------------------------------------------------------------
	function Get()
	{
		return { Theme: CURRENT.Theme, Scale: CURRENT.Scale, Margins: CURRENT.Margins, Dark: is_dark(), Palette: palette() };
	}


	//-----------------------------------------------------------------
	const stored_theme = read( THEME_KEY, 'system' );
	if ( palette_of( stored_theme ).Id === stored_theme )
	{
		CURRENT.Theme = stored_theme;
	}
	const stored_scale = read( SCALE_KEY, 'normal' );
	if ( SCALES[ stored_scale ] )
	{
		CURRENT.Scale = stored_scale;
	}
	const stored_margins = read( MARGINS_KEY, 'narrow' );
	if ( MARGINS[ stored_margins ] )
	{
		CURRENT.Margins = stored_margins;
	}
	MEDIA.addEventListener( 'change', function ()
	{
		if ( CURRENT.Theme === 'system' )
		{
			apply();
		}
	} );
	apply();

	window.ClauditTheme = {
		PALETTES: PALETTES,
		SCALES: Object.keys( SCALES ),
		MARGINS: Object.keys( MARGINS ),
		Get: Get,
		SetTheme: SetTheme,
		SetScale: SetScale,
		SetMargins: SetMargins,
	};

} )();
