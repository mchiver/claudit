# Claudit

Claudit is a Claude Code plugin that exposes the audit trail of a Claude Code session: every tool call Claude makes, with its time, description, duration and outcome. The trail is shown in the session, streamed to a local web page as it happens, and archived so earlier sessions can be reviewed.

Git: https://github.com/mchiver/claudit

## What it is made of

Claudit has two parts that run in different places.

- **The mod**, the Claude Code plugin itself. It runs inside Claude Code's plugin engine as a hooks module (`hooks/register.ts`), in a sandbox of its own with no Node and no network of its own: it reaches the outside only through the engine interface, which offers file reads and writes, an HTTP client, a process runner and a small key-value store. It hooks `tool.call` to see each call before it runs and after it finishes, `turn.complete` to put a text block of the turn's calls beneath Claude's answer, and `command.run` to answer the `/claudit` slash command. It cannot listen on a port, so it is a publisher, not a server.
- **The server**, a Node + Express process. It receives the mod's events, streams them live to the web clients, writes the archive to local JSON files, prunes it by the retention policy, and serves the web UI. The web UI is AngularJS + Bootstrap, built as components under `public/components/<name>/`.

How the two meet, where the archive lives and what the API looks like are settled in the plan "Claudit Design I" and its threads; this Readme records the decisions as they are made.

## Where things live

Nothing is built yet. The intended layout:

- `.claude-plugin/plugin.json`: the plugin manifest.
- `hooks/hooks.json` and `hooks/register.ts`: the mod.
- `server/`: the Express server, its API and the archive.
- `public/`: the web UI, with one folder per AngularJS component under `public/components/`.
- `.definitions/`, `.guides/`, `.plans/`, `.reviews/`: project knowledge, as CLAUDE.md describes.
- `.consensus/`: this project's Consensus content; not source.

## Conventions

The rules are in CLAUDE.md at the repo root; the ones that shape every file:

- JavaScript only, never TypeScript. Tabs, spaces inside brackets, braces on new lines, no arrow functions, async/await.
- UPPER_CASE globals and constants, lower_case locals and functions, PascalCase classes, parameters and exported names. No camelCase, except the AngularJS registration names the framework requires.
- Minimal dependencies: Express for the server, AngularJS and Bootstrap for the UI, nothing else without a reason.
- Tests with the native `node --test`.
- Prefer configuration over convention: anything a user might want different is a setting.
- The mod's module is the one file the plugin engine compiles; it is written in plain JavaScript syntax as far as the engine allows.

## Decided

Settled in the plan "Claudit Design I" (revision 13), all its threads applied:

- **Git.** The GitHub repo exists; the working folder is initialised as its root with that URL as origin and a .gitignore for node_modules and tilde-prefixed files. Commits happen only when a build log is accepted; the agent never branches or pushes.
- **Two parts.** The mod publishes; the server, a separate Express process shipped in the plugin folder, receives, streams, archives and serves the UI. On session start the mod checks the health route and starts the server when nothing answers; the server outlives the session. Default address 127.0.0.1:3600, the port set in ~/.claudit/config.json, overridable by the plugin's userConfig.
- **One event per tool call:** session id, agent id, tool name, a one-line summary (a shell call's description, a file tool's path, a search tool's pattern, else the tool name), start, end, duration and outcome (done, denied, failed). No full input or output in v1; optional detail comes as a setting later.
- **In the session:** a status line entry showing the call in flight and the turn's count, cleared at turn end. No pane yet.
- **Beneath the answer:** at turn end, a header line and one line per call, hh:mm:ss, duration, tool, summary. Nothing on a turn without calls. Part of on; the config setting feedback (default true) silences it.
- **Archive:** the server owns it. One JSON Lines file per session at ~/.claudit/archive/<yyyy-mm-dd>/<session id>.jsonl, a summary JSON beside it; the folder is a config setting.
- **Retention:** retention_days in the config, default 30, pruned at start and daily; 0 keeps everything.
- **API:** POST /api/events, GET /api/live (Server-Sent Events, optional ?session= filter), GET /api/sessions, GET /api/sessions/<id>, GET /api/health. Bound to 127.0.0.1, no auth.
- **Web UI:** AngularJS + Bootstrap components: session-list (live on top, archived below), event-list (in-flight highlighted, live over SSE), and a title bar with theme and scale controls. To be reshaped as it is used.
- **Command:** /claudit on, off and status. On by default; the setting persists across sessions in the engine's store; status reports the state, the server's address and reachability, and the session's call count.

## Open

Nothing. The next step is an Owner's word to build "Claudit Design I".
