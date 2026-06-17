# Mnemo Roadmap

## Shipped

- ✅ **v1.0** — core engine (ONNX + HNSW + sql.js), CLI, MCP server, hooks, skill, `mnemo init`
- ✅ **v1.1** — channels, secret-guard, ingest, why, digest, dead, cite, team mode, interactive recall, JSON output, completions
- ✅ **v1.2** — JSON mode wired into all commands, `procedure` channel scaffolded, doctor + init bug fixes from real-install validation
- ✅ **v1.3** — `recall --explain`/`--stream`, `backup`/`restore`, `migrate`, `watch`, `serve` (web UI), encryption at rest (AES-256-GCM), Int8 quantization

## v2.0 — A different level

These three pieces turn Mnemo from a search-over-notes tool into a *reasoning layer*. Each is its own substantial design pass.

### v2.0.0 — Procedural memory (alpha shipped)

Capture *how*, not just *what*. A procedure is a memory with `channel: 'procedure'` whose content is a markdown checklist of steps Claude can follow.

**v1.2 (now):** `procedure` channel exists. Use:
```bash
mnemo remember --channel procedure --global "## Add API endpoint
1. Write spec in docs/api/
2. Add migration in src/db/migrations
3. Implement handler in src/api/
4. Write integration test
5. Update OpenAPI doc"
```

**v2.0.0 (next):**
- `mnemo procedure record` — interactive capture with named steps
- `mnemo procedure run <name>` — Claude executes step-by-step with checkboxes
- Procedures auto-suggested when starting a new task that matches one ("Looks like you're adding an API endpoint — run `procedure run add-api-endpoint`?")
- Procedure success/failure tracking — refine based on outcomes

### v2.1 — Knowledge graph

Entities + relations on top of the existing vector layer. *AuthService* is an entity. Memories link to it. Relations: `uses`, `supersedes`, `contradicts`, `requires`. Query: *"everything we know about AuthService"*.

- New table `entities`, new table `relations`
- `mnemo entity create / link / show`
- Recall surfaces entity context alongside hits
- Graph traversal via simple BFS for "what depends on X?"

### v2.2 — Self-reflective learning

Observe Claude's own mistakes (failed tests, reverted commits, error stack traces) and capture *anti-patterns* automatically.

- New hook: `Stop` — when a session ends with errors, capture what was attempted vs. what failed
- New hook: `SubagentStop` — capture lessons from spawned agents
- Anti-pattern channel auto-populated from these observations
- `mnemo recall` boosts anti-pattern hits when about to do something similar ("Last 3 attempts to do X failed because Y — try Z instead")

### v2.3 — Cross-agent memory

Same memory layer for Claude Code, Cursor, Aider, custom MCP clients. Mnemo becomes infrastructure.

- Standard MCP discovery so any MCP-aware agent can use it
- Per-agent attribution (which agent captured what, which agent recalled it)
- Reasoning across agent traces

### v2.4 — Plug-in framework

Custom embedders, custom rankers, custom capture rules. Other devs build on top.

- `@mnemo-mcp/plugin-*` convention
- Plugin discovery via package.json `mnemo` key
- API surface for ranker / embedder / hook / capture-rule plugins

### v2.5 — Hosted optional sync + web UI

For users who want multi-machine sync without git.

- `mnemo.dev` hosted backend (open-source server too)
- Web dashboard at `mnemo.dev/<your-handle>`
- End-to-end encryption (server can't read content)
- Free tier, paid for teams

## Principles (don't break)

1. **Local-first.** Default install hits no network beyond the one-time ONNX model download.
2. **No daemon.** Everything runs as one-shot CLI invocations or stateless MCP server.
3. **Single binary.** `npm install -g @mnemo-mcp/cli` then `mnemo init` — that's the install.
4. **Opt-in everything.** Telemetry, auto-capture, hooks, team sync — all opt-in.
5. **Don't grow the surface unless evidence demands.** Better to have 10 great commands than 30 mediocre ones.
