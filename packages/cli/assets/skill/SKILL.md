---
name: mnemo
description: Persistent memory for the current session. Use this skill whenever the user asks you to remember a fact, recall something they told you before, or when starting work where prior context might exist (conventions, decisions, file purposes, preferences).
---

# Mnemo — persistent memory

You have access to a persistent memory layer via these MCP tools:

- `mnemo_recall(query, k?, scope?)` — semantic search across stored memories
- `mnemo_remember(content, scope?, tags?)` — capture a new memory
- `mnemo_forget(id)` — delete a memory
- `mnemo_list(scope?, limit?)` — browse recent memories
- `mnemo_stats()` — show memory engine status

## When to use each

**`mnemo_recall`** — call this BEFORE answering anything where prior context might help:
- "what's our convention for X?"
- "how did we decide to handle Y?"
- "why is Z structured this way?"
- whenever you're starting a task in an unfamiliar area of the codebase

Use natural-language queries. Don't try to construct keyword searches — the index is semantic.

**`mnemo_remember`** — call this when:
- The user explicitly asks ("remember this", "save this for later")
- You make or affirm a non-obvious decision (capture it as `scope: "project"`)
- The user states a personal preference that applies across projects (capture as `scope: "global"`)
- You finish a task and notice something worth not having to rediscover

Default scope is `"project"` (auto-tied to the current repo).

**`mnemo_forget`** — only when the user explicitly asks to forget, OR when you discover a memory contradicts current reality and should be replaced.

## Examples

User: "we always use Vitest, never Jest"
→ `mnemo_remember({ content: "we always use Vitest, never Jest", scope: "global" })`

User: "what test framework do we use?"
→ `mnemo_recall({ query: "test framework preference", k: 3 })` then synthesize the answer.

User: "forget that pnpm thing"
→ `mnemo_list({ limit: 50 })` to find it, then `mnemo_forget({ id: "..." })`.

## Discipline

- Don't capture things that are already in CLAUDE.md or other always-loaded files (Mnemo is for the long tail that those files can't carry)
- Don't capture transient task state — capture lasting facts
- Prefer global scope for cross-project preferences; default to project scope otherwise
- When recall returns nothing useful, say so plainly — don't guess or hallucinate from low-similarity hits
