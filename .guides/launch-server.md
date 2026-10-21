# Launching the server

The Claudit server is a plain Node + Express process. Three ways to start it:

1. **From a session.** With the plugin loaded (`claude --plugin-dir <repo>`), the mod checks `GET /api/health` at session start and, when nothing answers, runs `node server/launch.js --port <port>`, which starts `server/server.js` detached with its output in `~/.claudit/server.log`. The server keeps running after the session ends.
2. **By hand, in the foreground.** `npm start`, or `node server/server.js [--port N] [--archive <folder>] [--retention <days>]`. It prints where it listens, where the archive is and what it pruned.
3. **By hand, detached.** `node server/launch.js [--port N]`: the same as the mod does.

The port and the rest come from `~/.claudit/config.json` (see README.md); the command line wins over the file.

To stop a detached server, end the `node` process that holds the port (Task Manager, or `Get-NetTCPConnection -LocalPort 3600` to find its pid). Ctrl+C stops a foreground one.

Tests: `npm test` starts a server on a free port with a temporary archive; nothing of yours is touched.
