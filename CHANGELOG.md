# Changelog

## 1.0.0 — 2026-05-07

First public release. Persistent memory for Claude Code is now installable in one command.

### Added
- `mnemo init` — one-command install. Drops the `/mnemo` skill and registers the MCP server in Claude Code's config. `--with-hooks` also wires SessionStart / PreToolUse / PostToolUse for auto-capture and auto-inject.
- `@mnemo/mcp` — MCP server exposing `mnemo_recall`, `mnemo_remember`, `mnemo_forget`, `mnemo_list`, `mnemo_stats`.
- `mnemo hook session-start | pre-task | post-edit` — hook handlers Claude Code can call directly. All hooks fail open.
- Auto-capture rules: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `*.adr.md`, `docs/decisions/**`, `docs/adr/**`.
- `mnemo doctor` now also reports Claude Code integration status (skill installed, MCP registered, hooks wired).
- GitHub Actions CI on Node 20 + 22.

### Changed
- Versions bumped to `1.0.0` across `@mnemo/core`, `@mnemo/mcp`, `@mnemo/cli`.

## 0.1.0 — 2026-05-07

Initial release. Core engine + CLI working end-to-end on disk.

- Real semantic search via ONNX `all-MiniLM-L6-v2` (384-dim, lazy-loaded).
- HNSW persistent index via `hnswlib-node`.
- sql.js (WASM SQLite) metadata store in `~/.mnemo/`.
- CLI: `remember`, `recall`, `list`, `forget`, `stats`, `export`, `import`, `doctor`.
- Two-tier memory: project (per-repo) + global (cross-project).
- Recall scoring: `0.7 × similarity + 0.2 × recency + 0.1 × access`.
