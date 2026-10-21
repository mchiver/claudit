# Claudit Design II: Turns

The web page shows a session as a hierarchy instead of a flat list of calls: the session is cut into turns by the user's messages, each turn expands into the assistant's messages and tool calls in order, and each of those expands into the actual message as JSON.

## Events

The mod gains two sources from the plugin engine, beside the tool.call hook of Design I.

**Turns.** The turn.start hook carries the user's text and a turn id; turn.complete carries the same id, the reason the turn ended (answer, aborted, refusal, error), its duration and its token usage. Each becomes an event: kind turn, phase start (session, agent, turn id, the user's text, start time) and phase end (end time, duration, reason, usage). The mod keeps the current turn per loop (the main conversation, or a subagent by its agent id) and stamps every call and message event with it.

**Messages.** The session.append hook sees every row the engine appends to the conversation as it will be kept: a user row (the prompt, or a meta row the person did not type), an assistant row (text, thinking and tool_use blocks), a tool-result row, an attachment the engine injected, a system notice. Each becomes an event: kind message, with the session, the agent, the turn, the row's id, its door (prompt, response, tool-result, attachment, notice, ...), the time, and the row itself as JSON: type, role, name, isMeta and the content blocks. A row arriving before its turn's start is held and stamped when the turn starts.

Every row is recorded, engine rows included: the archive is the audit trail, and what is shown is the page's choice.

**Size and secrets.** A row now carries the full tool input and the full tool result, which Design I left out. Two config keys govern it: messages (default true) turns the message events off entirely, leaving the calls and turns; message_limit (default 65536) caps the bytes of one row's JSON: a larger row is kept with its text and tool_result content cut to fit and a truncated mark set on the event.

The session marks, the call events, the status line and the block beneath the answer stay as in Design I.

## Server

The archive takes the new kinds as it takes the others: one line per event in the session's JSON Lines file, the turn and message events alongside the calls. The session summary gains the count of turns. GET /api/sessions/<id> returns every event of the session; the live stream carries every kind. The server does not reassemble the hierarchy; the page does, from the turn stamps.

## Web UI

The event-list component becomes a turn-list, three levels deep:

- **Turn.** One row per turn: the first line of the user's text, the start time, the duration, the count of calls and the outcome (the reason the turn ended; failed and denied calls counted). Collapsed by default in an archived session; in a live session the turn in progress is open and followed, earlier turns collapsed.
- **Messages.** Inside a turn, in order: the assistant's text messages (first line, time) and the tool calls as the list shows them today (time, duration, tool, summary, outcome; the one in flight highlighted). Engine rows (attachments, system notices, meta user rows) are shown dimmed; a toggle in the title bar hides them, hidden by default.
- **JSON.** Each message row expands to its JSON, pretty-printed in a monospace block. A tool call expands to two: the tool_use block of the assistant row (the input) and the tool_result row (the output), joined by the tool_use_id. A truncated row says so above the block.

A subagent's turns and rows are shown inline in the session, each with its agent id as a badge; nesting them under the Agent call that spawned them is left to a later plan.

The session list, the title bar's theme and scale controls, and the live dot stay as they are.

## Tests

hooks/format.test.js gains the turn and message events and the size cap. server/archive.test.js and app.test.js gain the new kinds in the file, the summary's turn count and the stream. The page is checked by hand against a live session, as in Design I.
