//=====================================================================
// Claudit server: the live stream.
//
// Server-Sent Events: every client attached to GET /api/live gets each
// event as it arrives, as one "data:" line of JSON, filtered to one
// session when the client asked for it. A comment line every
// HEARTBEAT_MS keeps the connections open through proxies.
//=====================================================================


const HEARTBEAT_MS = 25000;


export class Live
{

	constructor()
	{
		this.clients = new Set();
		this.heartbeat = null;
	}


	//-----------------------------------------------------------------
	// Turns a response into a stream and keeps it until the client
	// goes away.
	//-----------------------------------------------------------------

	Attach( Request, Response, SessionFilter )
	{
		Response.status( 200 );
		Response.set( {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no',
		} );
		Response.flushHeaders();
		Response.write( ': claudit live\n\n' );

		const client = { response: Response, session: SessionFilter || null };
		this.clients.add( client );
		this.StartHeartbeat();

		const live = this;
		Request.on( 'close', function ()
		{
			live.clients.delete( client );
			if ( live.clients.size === 0 )
			{
				live.StopHeartbeat();
			}
		} );
	}


	//-----------------------------------------------------------------
	// Sends one event to every client whose filter it passes.
	//-----------------------------------------------------------------

	Broadcast( Event )
	{
		const line = 'data: ' + JSON.stringify( Event ) + '\n\n';
		let sent = 0;
		for ( const client of this.clients )
		{
			if ( client.session && client.session !== Event.session )
			{
				continue;
			}
			try
			{
				client.response.write( line );
				sent = sent + 1;
			}
			catch ( error )
			{
				this.clients.delete( client );
			}
		}
		return sent;
	}


	//-----------------------------------------------------------------

	Count()
	{
		return this.clients.size;
	}


	//-----------------------------------------------------------------

	StartHeartbeat()
	{
		if ( this.heartbeat !== null )
		{
			return;
		}
		const live = this;
		this.heartbeat = setInterval( function ()
		{
			for ( const client of live.clients )
			{
				try
				{
					client.response.write( ': heartbeat\n\n' );
				}
				catch ( error )
				{
					live.clients.delete( client );
				}
			}
		}, HEARTBEAT_MS );
		this.heartbeat.unref();
	}


	//-----------------------------------------------------------------

	StopHeartbeat()
	{
		if ( this.heartbeat === null )
		{
			return;
		}
		clearInterval( this.heartbeat );
		this.heartbeat = null;
	}


	//-----------------------------------------------------------------
	// Ends every stream, for a clean shutdown.
	//-----------------------------------------------------------------

	Close()
	{
		this.StopHeartbeat();
		for ( const client of this.clients )
		{
			try
			{
				client.response.end();
			}
			catch ( error )
			{
				// Already gone.
			}
		}
		this.clients.clear();
	}

}
