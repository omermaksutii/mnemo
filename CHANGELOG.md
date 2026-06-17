# Changelog

## 2.4.0 — 2026-06-17

Cross-agent memory (roadmap v2.3). One memory layer shared across agents.

### Added
- **Per-agent attribution** — memories carry an `agent` field (new column, auto-migrated). Set via `MnemoOpts.defaultAgent`, `$MNEMO_AGENT`, `remember --agent`, or the MCP `agent` arg.
- `recall --agent` / `recall({ agent })` and `list({ agent })` filter by capturing agent.
- `mnemo agents` — attribution view with per-agent counts and unattributed total. `MnemoStats.byAgent`.
- **Standard MCP discovery** — the server now ships `instructions` so any MCP-aware client (Cursor, Aider, custom) can use Mnemo without bespoke wiring. MCP `mnemo_remember`/`mnemo_recall` accept an `agent` arg; the server defaults attribution to `claude-code` (override with `$MNEMO_AGENT`).
- MCP recall now applies an anti-pattern boost so prior failures surface across agents.

## 2.3.0 — 2026-06-17

Self-reflective learning (roadmap v2.2). Mnemo learns from its own failures.

### Added
- **Stop / SubagentStop hooks** — when a session or spawned agent ends with failures (failed tests, errors, type errors, build failures, reverts), Mnemo captures a single `anti-pattern` memory summarizing what went wrong. Opt-out with `MNEMO_REFLECT=0`; only installed via `init --with-hooks`.
- Failure detection: `detectFailures(text)` + `summarizeFailures(signals)` in core (`FailureKind`, `FailureSignal`).
- `recall({ antiPatternBoost })` — additive score bonus that lifts anti-pattern hits so past mistakes surface before similar work.
- The pre-task hook now boosts anti-patterns and renders them under a `⚠ Watch out (past failures)` heading.
- `mnemo hook stop|subagent-stop` handlers; `init --with-hooks` wires `Stop` and `SubagentStop`.

## 2.2.0 — 2026-06-17

Knowledge graph (roadmap v2.1). Entities and relations on top of the vector layer.

### Added
- **Entities** — named things (services, modules, concepts) memories attach to. New `entities`, `relations`, and `memory_entities` tables (auto-created; existing DBs migrate on open).
- `mnemo entity create|link|attach|list|show|delete` — CLI surface. `show --depends` lists transitive dependents.
- Relations with kinds `uses | supersedes | contradicts | requires | related`.
- `Mnemo.createEntity / getEntity / listEntities / deleteEntity / relate / attachMemory / entityContext / whatDependsOn`. `whatDependsOn` is a BFS over incoming `requires`/`uses` edges.
- `recall({ includeEntities: true })` attaches linked entities to each hit.
- MCP tools `mnemo_entity_context` and `mnemo_what_depends_on`.
- New types: `Entity`, `Relation`, `RelationKind`, `EntityContext`, `RELATION_KINDS`.

## 2.1.0 — 2026-06-17

Quality-of-life release. Everything stays local-first and opt-in.

### Added
- `mnemo backup [-o file]` / `mnemo restore <file>` — first-class snapshot wrappers over export/import. Backup writes a timestamped envelope; restore reads both the envelope and raw export arrays.
- `mnemo migrate` — rebuild the vector index from the database after an embedder/dimension change or a corrupted index. Backed by new `Mnemo.reindex()`.
- `mnemo watch <dir>` — auto-capture changes to matching files (default rules or `--glob`), debounced.
- `mnemo serve` — zero-dependency localhost web dashboard (search, browse, add, forget) with a small JSON API.
- `mnemo recall --explain` — inline ranking breakdown (sim×0.7 / recency×0.2 / access×0.1).
- `mnemo recall --stream` — newline-delimited JSON for large/piped result sets.
- **Encryption at rest** — set `MNEMO_ENCRYPTION_KEY` (or `MnemoOpts.encryptionKey`) to store `memory.db` as an AES-256-GCM envelope. Plaintext DBs are read transparently, so it's a safe one-way upgrade.
- **Int8 embedding quantization** utilities (`quantizeInt8`, `dequantizeInt8`, `cosine`, `bytesSaved`) — ~4× memory savings with cosine preserved to >0.999.
- New core exports: `Mnemo.reindex()`, `encryptBytes`/`decryptBytes`/`isEncrypted`/`resolveEncryptionKey`, quantization helpers, `MnemoOpts.encryptionKey`.

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
