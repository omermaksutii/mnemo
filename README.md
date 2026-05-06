# Mnemo

> Persistent memory for Claude Code. Your AI never starts from scratch again.

Mnemo gives Claude Code a brain that survives across sessions. It remembers your codebase, your patterns, your decisions — and gets smarter every session.

## Why?

Claude Code forgets everything when the session ends. `CLAUDE.md` helps, but it's a static blob loaded every time. Mnemo gives you semantic, on-demand memory: capture facts, recall by meaning, prune what no longer matters.

## Install

```bash
npm install -g @mnemo/cli
```

Or run without installing:

```bash
npx @mnemo/cli remember --global "we use Vitest, never Jest"
npx @mnemo/cli recall "which test framework do we use?"
```

## Quick start

```bash
# Capture a project memory (scoped to current repo)
mnemo remember "our API auth uses OAuth2 with refresh tokens every 30min"

# Capture a global preference (cross-project)
mnemo remember --global "I prefer pnpm over npm"

# Semantic recall
mnemo recall "what's our auth pattern?"

# See what's stored
mnemo list
mnemo stats

# Forget something
mnemo forget <id>

# Move memories between machines
mnemo export --out memories.json
mnemo import memories.json

# Diagnose
mnemo doctor
```

## How it works

- **Embeddings:** ONNX `all-MiniLM-L6-v2` (384-dim, ~25MB, lazy-downloaded on first use)
- **Index:** HNSW (`hnswlib-node`) — sub-100ms semantic search at 50k+ memories
- **Storage:** sql.js (WASM SQLite) in `~/.mnemo/`
- **Two-tier memory:** project-scoped (auto-loaded for the current repo) and global (cross-project preferences)

Everything lives locally in `~/.mnemo/`. No daemon, no cloud account, no telemetry.

## Recall scoring

```
score = 0.7 × cosine_similarity + 0.2 × recency_decay + 0.1 × access_boost
```

Recency decays with a 30-day half-life. Access boost saturates at 20 reads. Tunable via config (coming in v1.0).

## Roadmap

- **v0.1** ✅ Core engine + CLI
- **v0.2** MCP server (drop-in for Claude Code)
- **v0.3** Hooks (auto-capture from edits, auto-inject into context)
- **v0.4** Skill (`/recall`, `/teach`, `/forget` from inside Claude Code)
- **v1.0** Polish, opt-in telemetry, public release
- **v1.1** Team mode (git-synced shared memory)

## Development

```bash
# Install
npm install

# Test (fast, hash embedder)
npm test

# Test with real ONNX embeddings (downloads ~25MB model)
MNEMO_TEST_ONNX=1 MNEMO_E2E=1 npm test

# Build
npm run build

# Type check
npm run lint
```

## Architecture

```
@mnemo/core       — pure TS, the only package that touches data
@mnemo/cli        — commander wrapper, exposes the binary
(coming in v0.2)
@mnemo/mcp        — MCP server adapter
@mnemo/hooks      — Claude Code hook handlers
```

Core is local-first and adapter-agnostic — anyone can wire Mnemo into a new editor or platform without touching memory logic.

## License

MIT — see [LICENSE](LICENSE).

