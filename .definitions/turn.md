# Turn

One run of the model loop: it starts with a user message (or a continuation with no typed text) and ends when the model answers, is interrupted, refuses, or an API error ends it. The engine gives each turn an id that its start, its end and everything inside it share.

In Claudit a turn is the first level of the session's tree on the web page: the turn's row shows the first line of the user's message, when it started, how long it took, how many calls it made and how it ended; it opens into the assistant's messages and the tool calls in order, each of which opens into its JSON. A subagent runs turns of its own, shown inline with the agent's id as a badge.
