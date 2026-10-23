# Claudit

A Claude Code plugin that exposes the audit trail of a session: every turn, every message the conversation keeps and every tool call Claude makes, timed. The trail shows in the session, streams to a local web page as it happens, and is archived so earlier sessions can be reviewed.

## What it is made of

- **The mod** (`hooks/register.js`) runs inside Claude Code's plugin engine. It sees each turn start and end, each row the conversation keeps (the prompt, the assistant's response, a tool result, what the engine appends), and each tool call before it runs and after it finishes. It shows the call in flight on the status line (the engine prefixes the plugin's name), keeps the summary pane, a pane of the engine's that lists the last 50 turns' calls newest first with the turn in flight at the top (docked beside the transcript in the fullscreen layout, above the prompt otherwise; close it with ctrl+x x), answers `/claudit`, and posts each event to the server over HTTP. It cannot listen on a port.
- **The server** (`server/`) is a separate Node process with no dependencies. It receives the events, streams them to the web page as Server-Sent Events, writes the archive, prunes it, and serves the web UI. The mod starts it when nothing answers on its port, detached, so it outlives the session.
- **The web UI** (`public/`) is AngularJS + Bootstrap: the sessions down the left, live on top and archived below, in a list you can drag wider or narrower and collapse to a rail; the selected session on the right as a tree of turns. A turn is one of your messages; it opens into the assistant's messages and the tool calls in order. A call opens into its input, one field per line with a command or a file's content shown as it is, and its result rendered as markdown (an error result tinted red); an assistant message opens into its text rendered the same way; the `{}` button on a row shows its raw JSON instead. The engine's rows (reminders, attachments, notices, thinking) are hidden until the **engine rows** button shows them, dimmed, and open into their JSON. The gear in the title bar opens the look: ten palettes (System follows the operating system), three sizes and three margin widths, kept in the browser. Markdown is rendered by marked and cleaned by DOMPurify, both from cdnjs like AngularJS and Bootstrap.

## Installing it

At the prompt of a terminal session:

```
/plugin install claudit --marketplace mchiver/claudit
```

From a shell:

```
claude plugin install claudit --marketplace mchiver/claudit
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `mchiver/claudit`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope; the mod runs from then on, and in every later session under the user scope. A later version comes with `claude plugin update claudit`. The server needs Node 20 or later on the PATH and nothing else: it has no dependencies to install.

To work on the mod instead, load its folder in a session:

```
claude --plugin-dir <the folder>
```

or name the folder in `CLAUDE_CODE_PLUGIN_DIRS`, in the environment or in the `env` block of `~/.claude/settings.json`, to load it in every session without the flag; several folders are separated by the platform's path-list separator (`;` on Windows, `:` elsewhere). Each folder named there loads as a `--plugin-dir` would, saved files reloading the mod. A folder loaded this way should not also be installed, or the mod loads twice.

## Using it

In the session:

```
/claudit status       whether it is on, the server's address, the counts, the summary setting
/claudit off          stop recording (kept across sessions)
/claudit on           record again
/claudit summary off  close the summary pane (kept across sessions; closing it by hand does the same)
/claudit summary on   open it again
```

It is on by default. Open the web page at http://127.0.0.1:3600 once a session has started it, or start the server by hand:

```
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
	"feedback": true,
	"messages": true,
	"message_limit": 65536
}
```

- `port`: where the server listens, on 127.0.0.1. The plugin option `port` (in Claude Code's plugin configuration) overrides it when above 0.
- `archive_folder`: one folder per day, `<yyyy-mm-dd>/<session id>.jsonl` with `<session id>.json` beside it.
- `retention_days`: day folders older than this are removed at start and once a day; 0 keeps everything.
- `live_minutes`: a session that has not ended counts as live for this long after its last event.
- `feedback`: false keeps the summary pane closed at session start without stopping the stream and the archive. It is the default only: once `/claudit summary on` or `off` has been used (or the pane was closed by hand), that choice wins, in every later session. A pane the mod opens on its own is drawn from 144 terminal columns (110 once you have asked for it); `/claudit summary on` draws it at any width.
- `messages`: false stops the message rows (the conversation's JSON), leaving the turns and the calls.
- `message_limit`: the most bytes one row's JSON may take; a larger row has its text, thinking and tool-result content cut to fit, each cut string ending in a mark, and the event marked `truncated`. 0 means no cap. The server takes a body of up to 8 MB.

The mod reads `feedback`, `messages` and `message_limit` at session start; the server reads the rest. The server's output goes to `~/.claudit/server.log`.

## API

All on the server, bound to 127.0.0.1, no auth.

- `POST /api/events`: one event or an array. Each has `kind` (`session`, `turn`, `call` or `message`) and `session`.
- `GET /api/live`: Server-Sent Events, every event as it arrives; `?session=<id>` filters to one.
- `GET /api/sessions`: the sessions, newest activity first, each with its summary (`counts`: calls, done, denied, failed, turns) and `live`.
- `GET /api/sessions/<id>`: one session's summary and archived events.
- `GET /api/health`: `{ ok, name, version, port, archive, retention_days, sessions, clients }`.

The events, with times in milliseconds since the epoch:

- A session mark: `{ kind: "session", phase: "start" | "end", session, cwd, time, reason? }`.
- A turn: `{ kind: "turn", phase: "start", id, session, agent, text, time, truncated? }` when the user's message starts it, and `{ kind: "turn", phase: "end", id, session, agent, time, duration, reason, usage }` when it ends (`reason`: answer, aborted, refusal, error).
- A call: `{ kind: "call", id, session, agent, turn, tool, summary, start, end, duration, outcome, cwd }`, `outcome` one of `running`, `done`, `denied`, `failed`. A running call is streamed but not archived; its finished event is.
- A message: `{ kind: "message", id, session, agent, turn, door, origin, time, message, truncated? }`, where `message` is the row as the conversation keeps it (`type`, `role`, `name`, `isMeta`, `content` blocks) and `door` says how it came in (prompt, response, tool-result, attachment, notice, ...).

`turn` on a call or message is the id of the turn it belongs to; the page groups by it, and puts anything without one under "(no turn recorded)".

## Development

```
npm test                                  the mod's formatting, the turns tree, the server, with node --test
claude plugin validate .                  the marketplace file, the manifest, what the mod hooks and calls, and what the engine would refuse
```

To try the install from the working folder: `claude plugin marketplace add <the folder>`, then `claude plugin install claudit@mchiver`, with the folder not loaded as a plugin dir at the same time; `claude plugin uninstall claudit` and `claude plugin marketplace remove mchiver` undo it.
