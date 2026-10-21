# Event

One record the mod posts to the server and the server streams and archives. Two kinds:

- **A call**: `{ kind: "call", id, session, agent, tool, summary, start, end, duration, outcome, cwd }`. Posted twice: once when the call starts, with `outcome: "running"` and no end, and once when it finishes, with the same `id` and the outcome `done`, `denied` (a hook refused it) or `failed` (the tool reported an error). The running one is live only; the finished one is archived. `agent` is a subagent's id, null on the main loop. `summary` is one line: a shell call's description, a file tool's path, a search tool's pattern, else the tool's name.
- **A session mark**: `{ kind: "session", phase: "start" | "end", session, cwd, time, reason? }`.

Times are milliseconds since the epoch; `duration` is `end - start`.
