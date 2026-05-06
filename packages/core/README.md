# Mnemo

> Persistent memory for Claude Code. Your AI never starts from scratch again.

[![CI](https://github.com/omermaksutii/mnemo/actions/workflows/ci.yml/badge.svg)](https://github.com/omermaksutii/mnemo/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Mnemo gives Claude Code a brain that survives across sessions. It captures decisions, conventions, and preferences — and recalls them by meaning, on demand, with sub-100ms semantic search.

---

## Install

```bash
# install the CLI
npm install -g @mnemo-mcp/cli

# install Mnemo into Claude Code (skill + MCP server)
mnemo init

# (optional) also wire auto-capture hooks
mnemo init --with-hooks

# verify
mnemo doctor
```

After `mnemo init`, restart Claude Code. The `/mnemo` skill and the `mnemo_*` MCP tools are now available — Claude will use them automatically when relevant.

## Use it from the terminal too

```bash
mnemo remember "our API auth uses OAuth2 with refresh tokens every 30min"
mnemo remember --global "I prefer pnpm over npm"
mnemo recall "what's our auth pattern?"
mnemo list
mnemo stats
mnemo forget <id>
mnemo export --out memories.json
mnemo import memories.json
```

## What Mnemo solves

Claude Code forgets everything when the session ends. `CLAUDE.md` partially helps — it's a static blob loaded on every turn — but it grows unwieldy fast and can't answer "do we have a precedent for X?"

Mnemo gives you semantic, on-demand memory:

| | `CLAUDE.md` | Mnemo |
|---|---|---|
| Capacity | A handful of paragraphs before token cost hurts | Tens of thousands of memories |
| Retrieval | Always loaded, every turn | On demand, by meaning |
| Updates | You edit a file by hand | Captured automatically or via `/teach` |
| Cross-project | Per-project only | Project + global tiers |
| Forgetting | Manually delete lines | `mnemo forget <id>` or `/forget` |

## How it works

```
Claude Code session
  ├── /mnemo skill              ← teaches Claude when to call the tools
  ├── @mnemo-mcp/server server          ← exposes recall/remember/forget/list/stats
  └── @mnemo-mcp/cli hooks           ← session-start, pre-task, post-edit auto-wiring
              │
              ▼
       @mnemo-mcp/core
       ├── ONNX all-MiniLM-L6-v2  (384-dim embeddings, ~25MB, lazy)
       ├── HNSW vector index      (sub-100ms recall at 50k memories)
       └── sql.js (WASM SQLite)   (~/.mnemo/memory.db)
```

Everything is local-first. No daemon. No cloud account. No telemetry.

## Auto-capture rules

By default the post-edit hook captures any change to:

- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`
- `*.adr.md`
- `docs/decisions/**`
- `docs/adr/**`

Anything you write to those files becomes a project memory automatically. Disable with `mnemo init` (no `--with-hooks`).

## Recall scoring

```
score = 0.7 × cosine_similarity + 0.2 × recency + 0.1 × access_boost
```

Recency decays with a 30-day half-life. Access boost saturates at 20 reads.

## Layout

```
@mnemo-mcp/core   — pure TS memory engine
@mnemo-mcp/server    — MCP server (drop into Claude Code)
@mnemo-mcp/cli    — terminal commands + hook handlers + init
```

## Roadmap

- ✅ **v0.1** — core engine + CLI
- ✅ **v0.2** — MCP server (5 tools)
- ✅ **v0.3** — hooks (session-start, pre-task, post-edit)
- ✅ **v0.4** — `/mnemo` skill
- ✅ **v1.0** — `mnemo init`, beefier doctor, CI, polish
- ⏳ **v1.1** — team mode (git-synced shared memory)
- ⏳ **v2.0** — opt-in hosted sync, web UI

## Development

```bash
npm install
npm test                                    # fast (44 tests, hash embedder)
MNEMO_TEST_ONNX=1 MNEMO_E2E=1 npm test     # full incl. real ONNX (~5s)
npm run build
npm run lint
```

## License

MIT — see [LICENSE](LICENSE).
