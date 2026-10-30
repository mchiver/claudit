# Claudit

A Claude Code plugin that exposes the audit trail of a session: every turn, every message the conversation keeps and every tool call Claude makes, timed. The trail shows in the session, streams to a local web page as it happens, and is archived so earlier sessions can be reviewed.

```
claude plugin install claudit --marketplace mchiver/claudit
```

- [`plugin/`](plugin/): the plugin itself. Its [README](plugin/README.md) covers installing, using, configuring, what the mod runs and sends, the API and development.
- [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json): the `mchiver` marketplace, listing the plugin in `plugin/`.
- [`docs/`](docs/): the docs site, https://claudit.mchiver.com. Not part of the plugin.

MIT licensed: see [license.md](license.md).
