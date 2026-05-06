# Changelog

## 1.1.5 — 2026-05-07

Same feature set as 1.1.0 but with the live-install bugs ironed out.

### Fixed (since 1.1.0)
- `1.1.1`: empty HNSW index reloaded from disk would refuse new points (hnswlib quirk) — now deferred persistence until first capture.
- `1.1.3`: `mnemo doctor` no longer reports FAIL for missing index file when DB is empty.
- `1.1.4`: `--json` flag now works in any argv position via pre-parse.
- `1.1.5`: `mnemo stats` and `mnemo list` honor `--json` and `-c <channel>` filter.

## 1.1.0 — 2026-05-07

10 new features added on top of 1.0.

### Added
- **Memory channels** (`decision`, `convention`, `gotcha`, `todo`, `anti-pattern`, `note`). Use `-c <channel>` on remember/recall/list. Auto-inferred during ingest.
- **Secret guard** that refuses to capture GitHub/npm/AWS/OpenAI/Anthropic/Stripe tokens, JWTs, and private keys. `--allow-sensitive` overrides.
- `mnemo ingest <file>` — markdown-aware bulk import.
- `mnemo cite <id>` — emits `[mem:abc123]` reference for prompt injection.
- `mnemo why <id> [-q query]` — provenance + ranking breakdown.
- `mnemo digest [--since 7d]` — activity summary with top-recalled and never-recalled stats.
- `mnemo dead [--older-than 7d]` — never-recalled candidates for prune.
- **Team mode**: `mnemo team init|push|pull|status` with `.mnemo/team.json` git-synced shared memories.
- `mnemo recall -i` — arrow-key interactive picker (no external deps).
- Global `--json` flag for machine-readable output.
- `mnemo completion bash|zsh|fish` for shell completion scripts.
- New `MemoryChannel` type, `MnemoStats.byChannel` and `.neverRecalled`, `Mnemo.dead()`, `Mnemo.scoreBreakdown()`.

### Changed
- `MemoryScope` adds `'team'`. `MemorySource` adds `'team-sync'`.
- Doctor test in CI fixed to use `MNEMO_CLAUDE_DIR` for setup.

## 1.0.1 — 2026-05-07

### Fixed
- `@mnemo-mcp/core`: sql.js could not locate its WASM file when the package was installed from npm (only worked from a workspace symlink). Now resolves `sql.js/dist/sql-wasm.wasm` via `require.resolve('sql.js/package.json')`, which works in any node_modules layout.

### Build
- Root `npm run build` now explicitly orders `core → server → cli` so cross-package types resolve in CI.

## 1.0.0 — 2026-05-07

First public release. Persistent memory for Claude Code is now installable in one command.

### Added
- `mnemo init` — one-command install. Drops the `/mnemo` skill and registers the MCP server in Claude Code's config. `--with-hooks` also wires SessionStart / PreToolUse / PostToolUse for auto-capture and auto-inject.
- `@mnemo-mcp/server` — MCP server exposing `mnemo_recall`, `mnemo_remember`, `mnemo_forget`, `mnemo_list`, `mnemo_stats`.
- `mnemo hook session-start | pre-task | post-edit` — hook handlers Claude Code can call directly. All hooks fail open.
- Auto-capture rules: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `*.adr.md`, `docs/decisions/**`, `docs/adr/**`.
- `mnemo doctor` now also reports Claude Code integration status (skill installed, MCP registered, hooks wired).
- GitHub Actions CI on Node 20 + 22.

### Changed
- Versions bumped to `1.0.0` across `@mnemo-mcp/core`, `@mnemo-mcp/server`, `@mnemo-mcp/cli`.

## 0.1.0 — 2026-05-07

Initial release. Core engine + CLI working end-to-end on disk.

- Real semantic search via ONNX `all-MiniLM-L6-v2` (384-dim, lazy-loaded).
- HNSW persistent index via `hnswlib-node`.
- sql.js (WASM SQLite) metadata store in `~/.mnemo/`.
- CLI: `remember`, `recall`, `list`, `forget`, `stats`, `export`, `import`, `doctor`.
- Two-tier memory: project (per-repo) + global (cross-project).
- Recall scoring: `0.7 × similarity + 0.2 × recency + 0.1 × access`.
