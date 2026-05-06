# Mnemo — Design Spec

**Status:** Approved (user waived section-by-section review, gave blanket sign-off)
**Date:** 2026-05-07
**Author:** Omer Maksuti (with Claude)

---

## 1. Vision

> Persistent memory and learning for Claude Code. Your AI never starts from scratch again.

Mnemo gives Claude Code a brain that survives across sessions, projects, and machines. It captures decisions, conventions, file purposes, and architectural choices automatically, and recalls them when relevant — through MCP tools, hooks, skill commands, and a CLI.

## 2. Goals & Non-Goals

### Goals (v1)
- Eliminate "Claude forgot the convention we agreed on yesterday" pain
- Single-binary install: `npx mnemo init` → it works, no daemon, no cloud account
- Local-first storage in `~/.mnemo/` (SQLite + HNSW vector index)
- Native-feeling integration with Claude Code (MCP + hooks + skill commands + CLI)
- Two-tier memory: per-project (auto-loaded) and global (cross-project preferences)
- Sub-100ms recall p95 on 50k memories

### Non-Goals (v1)
- Multi-agent swarm orchestration
- Plugin marketplace / IPFS distribution
- Cloud sync (deferred to v1.1, optional)
- Custom embedding model training
- Background daemon
- Anything beyond memory (no agents, no codegen, no review pipelines)

### Non-Goals (ever, unless evidence demands)
- 60-agent zoo, MCP-tool-zoo, multi-LLM provider abstraction
- Replacing Claude Code or competing with it

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLAUDE CODE                          │
└─────┬───────────────┬─────────────────┬─────────────────┘
      │ MCP tools     │ hooks           │ skill commands
      ▼               ▼                 ▼
┌────────────┐ ┌──────────────┐ ┌──────────────┐
│  mnemo-mcp │ │  mnemo-hooks │ │  mnemo-cli   │
│  (server)  │ │  (handlers)  │ │  (terminal)  │
└─────┬──────┘ └──────┬───────┘ └──────┬───────┘
      └───────────────┼────────────────┘
                      ▼
              ┌──────────────┐
              │  mnemo-core  │ ← all data logic lives here
              └──────┬───────┘
                     ▼
            ~/.mnemo/{memory.db, hnsw.bin, model/}
```

### Why this shape
- **Core is the only thing that touches data.** MCP/hooks/CLI are thin adapters. New entry points (VSCode, web UI) add zero data risk.
- **Local-first single binary.** No daemon = nothing to crash, nothing to install separately.
- **Two-tier memory model:**
  - **Project memory** — scoped by repo path hash, auto-loaded on `session-start`
  - **Global memory** — user-wide preferences, available everywhere

## 4. Packages & Responsibilities

### `@omermaksutii/mnemo-core`
Pure TS. No Claude Code dependency. The only package that talks to disk.

**Public API:**
```ts
class Mnemo {
  constructor(opts?: { dataDir?: string });

  capture(input: CaptureInput): Promise<MemoryRecord>;
  recall(query: string, opts?: RecallOpts): Promise<MemoryHit[]>;
  forget(id: string): Promise<void>;
  list(filter?: ListFilter): Promise<MemoryRecord[]>;
  export(): Promise<MemoryRecord[]>;
  import(records: MemoryRecord[]): Promise<void>;
  stats(): Promise<MnemoStats>;
}
```

**Subsystems:**
- `Embedder` — wraps ONNX (`all-MiniLM-L6-v2`, 384-dim, ~25MB). First call lazy-downloads.
- `Index` — HNSW persistent index (`hnsw.bin`)
- `Store` — sql.js (WASM SQLite) for the metadata table
- `Capture rules` — pluggable predicates that decide what's worth remembering

### `@omermaksutii/mnemo-mcp`
Wraps `@omermaksutii/mnemo-core` as an MCP server. Tools exposed:
- `mnemo_recall(query, k?, scope?)` — semantic search
- `mnemo_remember(content, tags?, scope?)` — explicit capture
- `mnemo_forget(id)` — delete
- `mnemo_list(filter?)` — browse
- `mnemo_stats()` — debug

### `@omermaksutii/mnemo-hooks (deferred)`
Claude Code hook handlers that auto-capture and auto-inject:
- `session-start` → load top-N project memories into context
- `post-edit` → capture noteworthy edits (CLAUDE.md, ADRs, schema files)
- `pre-task` → semantic search for relevant memories, inject summary
- `session-end` → consolidate recent edits into durable memories

### `@omermaksutii/mnemo-cli`
The terminal-facing surface and one-shot installer:
- `mnemo init` — install MCP + hooks + skills into Claude Code config
- `mnemo recall <query>`, `mnemo remember <text>`, `mnemo forget <id>`, `mnemo list`
- `mnemo stats`, `mnemo doctor`, `mnemo export`, `mnemo import`

## 5. Data Model

### Memory record
```ts
type MemoryRecord = {
  id: string;              // UUID v7
  scope: 'project' | 'global';
  projectHash: string | null;  // sha256(absolute repo path), null if global
  source: 'manual' | 'auto-edit' | 'auto-task' | 'imported';
  content: string;         // The fact, decision, convention
  tags: string[];          // ['auth', 'decision', 'convention']
  embedding: Float32Array; // 384 dims, stored separately in HNSW index
  createdAt: number;       // unix ms
  updatedAt: number;
  accessCount: number;     // for relevance ranking
  lastAccessedAt: number;
};
```

### Storage
- `~/.mnemo/memory.db` — sql.js SQLite, table `memories` (no embedding column — those live in HNSW)
- `~/.mnemo/hnsw.bin` — binary HNSW index, key = memory.id
- `~/.mnemo/model/` — ONNX model + tokenizer (lazy-downloaded on first use)
- `~/.mnemo/config.json` — user prefs (capture rules, telemetry opt-in, scope defaults)

### Recall ranking
`score = cosine_sim * 0.7 + recency_decay * 0.2 + access_boost * 0.1`
Tunable via config. Recency decay: `exp(-age_days / 30)`.

## 6. Claude Code Integration

### Hooks wired by `mnemo init`
| Hook | Trigger | Behavior |
|------|---------|----------|
| `session-start` | New session | Inject top-5 project memories into context |
| `post-edit` | After Claude edits a file | Run capture rules; if matches → store |
| `pre-task` | Before Task tool spawn | Semantic search task description; inject relevant memories |
| `session-end` | Session ends | Consolidate session edits into 1–3 durable memories |

### Skill (`/mnemo`)
Single skill installed to `~/.claude/skills/mnemo/`. Commands:
- `/recall <query>` — search and display top hits
- `/teach <text>` — capture a fact explicitly (project scope by default)
- `/teach-global <text>` — capture as global memory
- `/forget <id>` — delete by id
- `/memories` — list recent memories for current project

### MCP server
Registered in user's Claude Code MCP config by `mnemo init`. Tools listed in §4.

## 7. Capture Rules (default set)

Out of the box, Mnemo auto-captures:
1. Any addition or change to `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `*.adr.md`
2. Decisions in PR descriptions / commit messages with prefix `decision:` or `convention:`
3. Anything Claude says with the literal phrase "let's remember" or "I'll remember"
4. New entries in `docs/decisions/` or `docs/adr/`

Rules are pluggable via `~/.mnemo/config.json`. Users can disable any default and add custom regex predicates.

## 8. Error Handling

| Failure | Behavior |
|---------|----------|
| ONNX model missing | First call downloads with progress; if offline, fail with actionable error pointing to `mnemo doctor` |
| Corrupt HNSW index | Detect via checksum; offer to rebuild from sql.js metadata + re-embed |
| Disk full | Refuse new captures with clear error; recall still works |
| sql.js lock contention | Single-writer queue inside core; reads always parallel |
| Embedding dimension drift (model upgrade) | Refuse to mix; require explicit `mnemo migrate` |
| Hook timeout | Hooks fail open (don't block Claude Code); logged to `~/.mnemo/log` |

## 9. Testing Strategy

- **Unit**: `@omermaksutii/mnemo-core` — capture/recall/forget/list/embed/index round-trips. Target 90% line coverage.
- **Integration**: `@omermaksutii/mnemo-mcp` against a mock MCP client. `@omermaksutii/mnemo-hooks (deferred)` against a recorded Claude Code hook payload corpus.
- **End-to-end**: `mnemo init` in a throwaway dir → spawn `claude -p` with a test prompt → assert memory appears.
- **Performance**: benchmark suite with 10k, 50k, 250k memories; assert p95 recall <100ms at 50k.

## 10. Telemetry (opt-in only)

Off by default. If user opts in via `mnemo init --telemetry`, anonymous metrics:
- Recall hit rate (was the top hit clicked / used?)
- Capture rule trigger frequency
- Index size buckets

Sent to `https://mnemo.dev/telemetry` (or sink TBD). Never content. Never IDs. Easy to disable: `mnemo telemetry off`.

This metric matters because **recall hit rate is the viral metric** — it's what we put on the README to prove Mnemo works.

## 11. Distribution & Branding

- **Repo**: `github.com/maksutiomer/mnemo` (or chosen GitHub handle)
- **npm packages**: `@omermaksutii/mnemo-core`, `@omermaksutii/mnemo-mcp`, `@omermaksutii/mnemo-hooks (deferred)`, `@omermaksutii/mnemo-cli`. Single `mnemo` umbrella for `npx mnemo init`.
- **License**: MIT.
- **Brand**:
  - Name: Mnemo (rhymes with "Nemo")
  - Tagline: *"Persistent memory for Claude Code."*
  - Logo: minimalist anchor or elephant silhouette (TBD by designer)
  - Color: ink-blue + warm-cream palette (calm, durable, "memory")

## 12. Roadmap & Out of Scope for v1

| Version | Adds |
|---------|------|
| **v0.1** (this build) | core + cli + working `recall`/`remember`/`forget`/`list` end-to-end on disk |
| **v0.2** | MCP server + auto-install via `mnemo init` |
| **v0.3** | Hooks (session-start, post-edit, pre-task) |
| **v0.4** | Skill commands, polish, demo GIF, README, landing page |
| **v1.0** | First public release. Telemetry. `mnemo doctor`. |
| **v1.1** | Team mode (git-synced JSON memory file) |
| **v2.0** | Hosted optional sync, web UI |

### Explicitly OUT of v1
- No swarm / multi-agent orchestration
- No cloud sync
- No plugin system
- No multi-model provider abstraction
- No SONA/MoE/EWC++ / advanced ML — start simple, add ML only if recall quality demands it

## 13. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| ONNX model is 25MB → slow first install | Lazy download on first capture; show progress; cache forever |
| sql.js perf at 250k+ memories | Plan migration path to better-sqlite3 if Node-only build acceptable |
| HNSW index corruption | Atomic write via temp-file-rename; rebuild path from sql.js |
| Claude Code MCP API changes | Pin to a stable MCP version; have a CI canary against latest Claude Code |
| Privacy concerns about auto-capture | Default capture rules are opinionated but conservative; `mnemo list` always shows what's stored; `mnemo forget` is one command |
| "Why not just use CLAUDE.md?" | README has explicit comparison table; key differentiator is semantic recall vs. always-loaded blob |

## 14. Open Questions (deferred — won't block v0.1)

- Final GitHub handle / npm scope (need user confirmation before publish)
- Logo / visual identity (commission later)
- Telemetry sink (own server vs. PostHog vs. Plausible)
- Team-mode auth model (deferred to v1.1)

---

## Self-Review Checklist (run inline before handoff)

- [x] **Placeholders**: scanned for TBD/TODO. Two found: logo (§11) and telemetry sink (§14) — both flagged as deferred, not blockers.
- [x] **Internal consistency**: API in §4 matches data model in §5 matches integration in §6. Roadmap §12 reinforces non-goals from §2.
- [x] **Scope**: tight. v0.1 ships in days, v1.0 in 3–4 weeks. Out-of-scope items are explicit and defended.
- [x] **Ambiguity**: capture rules in §7 are concrete (literal strings). Recall ranking formula in §5 is explicit. No "appropriate" or "robust" hand-waving.

Spec is ready for implementation planning.
