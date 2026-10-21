# Claudit

Claudit is a Claude Code plugin that exposes the audit trail of a Claude Code session: every tool call Claude makes, with its time, description, duration and outcome. The trail is shown in the session, streamed to a local web page as it happens, and archived so earlier sessions can be reviewed.

Git: https://github.com/mchiver/claudit

## What it is made of

Claudit has two parts that run in different places.

- **The mod**, the Claude Code plugin itself. It runs inside Claude Code's plugin engine as a hooks module (`hooks/register.js`), in a sandbox of its own with no Node and no network of its own: it reaches the outside only through the engine interface, which offers file reads and writes, an HTTP client, a process runner and a small key-value store. It hooks `tool.call` to see each call before it runs and after it finishes, `turn.complete` to put a text block of the turn's calls beneath Claude's answer, `session.start` and `session.end` for the session marks, and `command.run` to answer the `/claudit` slash command. It cannot listen on a port, so it is a publisher, not a server.
- **The server**, a Node + Express process. It receives the mod's events, streams them live to the web clients as Server-Sent Events, writes the archive to local JSON Lines files, prunes it by the retention policy, and serves the web UI. The web UI is AngularJS + Bootstrap, built as components under `public/components/<name>/`.

A child the engine spawns dies with the module, so the mod starts the server through `server/launch.js`, which detaches it. That is why the server outlives the session.

## Where things live

Built by the plan "Claudit Design I" (Finished, commit 6823236 on master, 2026-10-21):

- `.claude-plugin/plugin.json`: the plugin manifest, with the plugin option `port` (0 = use the config file).
- `hooks/hooks.json` and `hooks/register.js`: the mod. `hooks/format.js` holds its pure formatting (summary per tool, outcome, clock, duration, status line, turn-end block), tested in `hooks/format.test.js`.
- `server/`: `server.js` (start-up, prune at start and daily, `Start()` for tests), `app.js` (the Express routes and the static UI), `archive.js` (JSON Lines per session under dated folders, summaries, retention), `live.js` (the SSE hub), `config.js` (defaults, `~/.claudit/config.json`, command line), `launch.js` (starts the server detached, output to `~/.claudit/server.log`). Tests in `archive.test.js` and `app.test.js`.
- `public/`: `index.html`, `app.js` (the module, the State service, the filters), `app.css`, and one folder per AngularJS component under `public/components/`: claudit-app, title-bar, session-list, event-list.
- `README.md`: use, configuration and the API. `.guides/launch-server.md`; `.definitions/event.md` and `session.md`.
- `.consensus/`: this project's Consensus content, committed with the rest.
- Runtime state, outside the repo: `~/.claudit/config.json`, `~/.claudit/archive/`, `~/.claudit/server.log`.
- `.claude-plugin/types/` and the root `tsconfig.json`: written by Claude Code's plugin engine when it loads the mod, for editor type hints only; the types folder ignores itself, the root `tsconfig.json` is untracked. Not part of the build and no TypeScript is written.

Commands: `npm test` (node --test, 15 tests), `npm start` (the server in the foreground), `claude plugin validate .`, `claude --plugin-dir <repo>` to load the mod in a session.

## Conventions

The rules are in CLAUDE.md at the repo root; the ones that shape every file:

- JavaScript only, never TypeScript. Tabs, spaces inside brackets, braces on new lines, no arrow functions, async/await. The whole repo is ES modules (`"type": "module"`), because the engine loads the mod as one.
- UPPER_CASE globals and constants, lower_case locals and functions, PascalCase classes, parameters and exported names. No camelCase, except the AngularJS registration names the framework requires.
- Minimal dependencies: Express for the server, AngularJS 1.8.3 and Bootstrap 5.3.3 from cdnjs for the UI, nothing else without a reason.
- Tests with the native `node --test`; `*.test.js` beside the code it tests.
- Prefer configuration over convention: anything a user might want different is a key in `~/.claudit/config.json`.

## Decided

Settled in the plan "Claudit Design I" (revision 13), all its threads applied:

- **Git.** The GitHub repo exists; the working folder is initialised as its root with that URL as origin and a .gitignore for node_modules and tilde-prefixed files. Commits happen only when a build log is accepted; the agent never branches or pushes.
- **Two parts.** The mod publishes; the server, a separate Express process shipped in the plugin folder, receives, streams, archives and serves the UI. On session start the mod checks the health route and starts the server when nothing answers; the server outlives the session. Default address 127.0.0.1:3600, the port set in ~/.claudit/config.json, overridable by the plugin's userConfig.
- **One event per tool call:** session id, agent id, tool name, a one-line summary (a shell call's description, a file tool's path, a search tool's pattern, else the tool name), start, end, duration and outcome (done, denied, failed). Posted once as running (live only) and once finished (archived). No full input or output in v1; optional detail comes as a setting later.
- **In the session:** a status line entry showing the call in flight with its elapsed time and the turn's count, cleared at turn end. No pane yet.
- **Beneath the answer:** at turn end, a header line and one line per call, hh:mm:ss, duration, tool, summary. Nothing on a turn without calls. Part of on; the config setting feedback (default true) silences it.
- **Archive:** the server owns it. One JSON Lines file per session at ~/.claudit/archive/<yyyy-mm-dd>/<session id>.jsonl, a summary JSON beside it; the folder is a config setting.
- **Retention:** retention_days in the config, default 30, pruned at start and daily; 0 keeps everything.
- **API:** POST /api/events, GET /api/live (Server-Sent Events, optional ?session= filter), GET /api/sessions, GET /api/sessions/<id>, GET /api/health. Bound to 127.0.0.1, no auth.
- **Web UI:** AngularJS + Bootstrap components: session-list (live on top, archived below), event-list (in-flight highlighted, live over SSE), and a title bar with theme and scale controls. To be reshaped as it is used.
- **Command:** /claudit on, off and status. On by default; the setting persists across sessions in the engine's store; status reports the state, the server's address and reachability, and the session's call count.

## Built and known

- Claudit Design I is built and accepted. The checks: 15 tests, the plugin validator, a launcher smoke test, and a headless session that started the server by itself and recorded its own tool calls.
- Checked from an interactive session (2026-10-21): /claudit is registered at session start and answers /claudit status itself; the session's calls reach the archive and the page with their summaries, durations and outcomes, and a shell call that exits non-zero is recorded as failed. In a headless (-p) run the prompt is read before the command registers, so "/claudit status" as the whole prompt goes to the model.
- The server started by the headless check (2026-10-21) is still running on http://127.0.0.1:3600 on the owner's machine; it stays up until stopped.

## Open

Nothing in Consensus. Next plans will come from using the page and the session.
