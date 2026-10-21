# Claudit Design III: Terminal Display

Two fixes to what the mod shows inside the session: the status line no longer repeats the plugin's name, and the block beneath the answer is drawn as a coloured table instead of one flattened dim line.

## Status line

The engine draws a plugin's status line under the plugin's name, so the mod's own "claudit: " prefix is dropped. The line reads "Bash 2.1s  List files  (3 calls this turn)" while a call runs and "3 calls this turn" between calls.

## The block beneath the answer

The text a turn.complete hook returns is kept as a system notice and drawn by the engine's InfoNotice component, which flattens it to one dim line. The mod keeps returning the text (it is the transcript's record, and the archive's), with a header line that names the session and the turn's end time, "claudit · session 0d9fcdd9 · 12:01:05 · 3 tool calls", unique enough to find the turn again.

The mod hooks ui.render for the InfoNotice component. When the notice's text begins with one of the headers the mod remembers (the last 50 turns' blocks, kept in memory with their calls), the hook draws its own tree with the surface's Box and Text elements: the header in the accent colour, then one row per call with the clock dim, the duration right-aligned and dim, the tool bold, the summary plain, the outcome in the theme's success, warning or error colour when it is not done, and the agent id dim when the call is a subagent's. Any other notice, and any surface but the terminal, is drawn by the engine as before: the hook returns next(e).

The row's strings come from one pure function in hooks/format.js, BlockRows, shared by the text and the drawing and tested in format.test.js. The feedback setting still silences both.

## Tests

format.test.js: the status line without the prefix, the header with the time, BlockRows. The drawing is checked in a live session: a turn with calls shows the table, a turn without calls shows nothing, and the archive's notice row is unchanged.
