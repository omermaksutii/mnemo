# Mnemo

> Persistent memory for Claude Code. Your AI never starts from scratch again.

![demo](demo.gif)

[![CI](https://github.com/omermaksutii/mnemo/actions/workflows/ci.yml/badge.svg)](https://github.com/omermaksutii/mnemo/actions)
[![npm: cli](https://img.shields.io/npm/v/@mnemo-mcp/cli?label=%40mnemo-mcp%2Fcli&color=cb3837)](https://www.npmjs.com/package/@mnemo-mcp/cli)
[![npm: server](https://img.shields.io/npm/v/@mnemo-mcp/server?label=%40mnemo-mcp%2Fserver&color=cb3837)](https://www.npmjs.com/package/@mnemo-mcp/server)
[![npm: core](https://img.shields.io/npm/v/@mnemo-mcp/core?label=%40mnemo-mcp%2Fcore&color=cb3837)](https://www.npmjs.com/package/@mnemo-mcp/core)
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
mnemo recall "auth" --explain          # show the ranking breakdown per hit
mnemo list
mnemo stats
mnemo forget <id>
mnemo backup                            # timestamped snapshot
mnemo restore mnemo-backups/<file>.json
mnemo migrate                           # rebuild the index after an embedder change
mnemo serve                             # localhost web dashboard
mnemo watch docs/                       # auto-capture matching files as they change
```

### Knowledge graph (v2.1)

```bash
mnemo entity create AuthService -t service -d "login + tokens"
mnemo entity link Billing requires AuthService
mnemo entity attach <memoryId> AuthService
mnemo entity show AuthService --depends   # memories, relations, and what depends on it
```

### Cross-agent, plugins, and sync (v2.3–v2.5)

```bash
mnemo agents                            # who captured what (claude-code, cursor, aider…)
mnemo plugins                           # discovered embedder/ranker/hook plugins
# end-to-end encrypted multi-machine sync (server stores ciphertext only):
export MNEMO_ENCRYPTION_KEY=…  MNEMO_SYNC_URL=https://your-host  MNEMO_SYNC_TOKEN=…
mnemo sync push      # encrypt locally → upload
mnemo sync pull      # download → decrypt → import
```

Run your own sync backend with `npx @mnemo-mcp/sync-server` — it never sees plaintext.

### Encryption at rest

```bash
export MNEMO_ENCRYPTION_KEY="a strong passphrase"   # memory.db is then AES-256-GCM at rest
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
@mnemo-mcp/core         — pure TS memory engine (embeddings, HNSW, store, graph, plugins, crypto)
@mnemo-mcp/server       — MCP server (drop into Claude Code; 9 tools)
@mnemo-mcp/cli          — terminal commands + hook handlers + init
@mnemo-mcp/sync-server  — self-hostable, end-to-end-encrypted sync backend
```

## Roadmap

- ✅ **v0.1** — core engine + CLI
- ✅ **v0.2** — MCP server (5 tools)
- ✅ **v0.3** — hooks (session-start, pre-task, post-edit)
- ✅ **v0.4** — `/mnemo` skill
- ✅ **v1.0** — `mnemo init`, beefier doctor, CI, polish
- ✅ **v1.1** — team mode, channels, secret guard, ingest, why, digest, dead, cite, interactive recall, JSON output, completions
- ✅ **v1.2** — JSON mode in all commands, idempotent init, doctor robustness
- ✅ **v2.0** — procedural memory: `mnemo procedure record/run/suggest/done` + 2 new MCP tools + auto-suggestion via `pre-task` hook
- ✅ **v2.1 (2.1.0)** — quality of life: `backup`/`restore`, `migrate`, `watch`, `serve` dashboard, `recall --explain/--stream`, encryption at rest, int8 quantization
- ✅ **v2.1 (2.2.0)** — knowledge graph (entities + relations + BFS depends-on + 2 MCP tools)
- ✅ **v2.2 (2.3.0)** — self-reflective learning (auto-capture anti-patterns from `Stop`/`SubagentStop` hooks)
- ✅ **v2.3 (2.4.0)** — cross-agent memory (per-agent attribution, `mnemo agents`, standard MCP discovery)
- ✅ **v2.4 (2.5.0)** — plug-in framework (custom embedders, rankers, capture rules, hooks)
- ✅ **v2.5 (2.6.0)** — optional end-to-end-encrypted sync (`@mnemo-mcp/sync-server` + `mnemo sync`) + web UI

See [ROADMAP.md](ROADMAP.md) for design notes on each.

## Development

```bash
npm install
npm run build
npm test                                    # fast (150+ tests, hash embedder)
MNEMO_TEST_ONNX=1 MNEMO_E2E=1 npm test     # full incl. real ONNX (~5s)
npm run lint
```

## License

MIT — see [LICENSE](LICENSE).
