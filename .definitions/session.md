# Session

One Claude Code session, by the id the engine gives it. In the archive it is one JSON Lines file of events and one summary beside it, under the day folder of its first event:

```
{ id, cwd, started, updated, ended, counts: { calls, done, denied, failed, turns }, folder }
```

`ended` is null until the session's end mark arrives. The API adds `live`: true while the session has not ended and its last event is within `live_minutes`. The web page lists live sessions on top and archived ones below, and shows the selected one as a tree of turns.
