# Claudit

A Claude Code plugin that exposes the audit trail of a session: every tool call Claude makes, with its time, description, duration and outcome. The trail shows in the session, streams to a local web page as it happens, and is archived so earlier sessions can be reviewed.

## What it is made of

- **The mod** (`hooks/register.js`) runs inside Claude Code's plugin engine. It sees each tool call before it runs and after it finishes, shows the call in flight on the status line, puts the turn's list beneath Claude's answer, answers `/claudit`, and posts each event to the server over HTTP. It cannot listen on a port.
- **The server** (`server/`) is a separate Node + Express process. It receives the events, streams them to the web page as Server-Sent Events, writes the archive, prunes it, and serves the web UI. The mod starts it when nothing answers on its port, detached, so it outlives the session.
- **The web UI** (`public/`) is AngularJS + Bootstrap: the sessions down the left, live on top and archived below; the selected session's events on the right, the running call highlighted; light and dark themes and three sizes in the title bar.

## Using it

Load the plugin in a session:

```
claude --plugin-dir W:/code-projects/orgs/mchiver/claudit.git
```

Then in the session:

```
/claudit status     whether it is on, the server's address, the counts
/claudit off        stop recording (kept across sessions)
/claudit on         record again
```

It is on by default. Open the web page at http://127.0.0.1:3600 once a session has started it, or start the server by hand:

```
npm install
npm start
```

## Configuration

`~/.claudit/config.json`, every key optional:

```json
{
	"port": 3600,
	"archive_folder": "~/.claudit/archive",
	"retention_days": 30,
	"live_minutes": 30,
	"feedback": true
}
```

- `port`: where the server listens, on 127.0.0.1. The plugin option `port` (in Claude Code's plugin configuration) overrides it when above 0.
- `archive_folder`: one folder per day, `<yyyy-mm-dd>/<session id>.jsonl` with `<session id>.json` beside it.
- `retention_days`: day folders older than this are removed at start and once a day; 0 keeps everything.
- `live_minutes`: a session that has not ended counts as live for this long after its last event.
- `feedback`: false silences the block beneath the answer without stopping the stream and the archive.

The server's output goes to `~/.claudit/server.log`.

## API

All on the server, bound to 127.0.0.1, no auth.

- `POST /api/events`: one event or an array. Each has `kind` (`call` or `session`) and `session`.
- `GET /api/live`: Server-Sent Events, every event as it arrives; `?session=<id>` filters to one.
- `GET /api/sessions`: the sessions, newest activity first, each with its summary and `live`.
- `GET /api/sessions/<id>`: one session's summary and archived events.
- `GET /api/health`: `{ ok, name, version, port, archive, retention_days, sessions, clients }`.

A call event: `{ kind: "call", id, session, agent, tool, summary, start, end, duration, outcome, cwd }`, with `outcome` one of `running`, `done`, `denied`, `failed`. Times are milliseconds since the epoch. A running call is streamed but not archived; its finished event is.

## Development

```
npm test                                  the server and the formatting, with node --test
claude plugin validate .                  what the mod hooks and calls, and what the engine would refuse
```

Conventions are in `CLAUDE.md`. Plans are worked out in Consensus; the project's Readme there records what has been decided.
