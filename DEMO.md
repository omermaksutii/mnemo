# Mnemo demo — script + recording guide

This is the script for the viral demo GIF. Two-window split-screen, ~30 seconds, no narration needed. The contrast does the talking.

## Setup (do once)

Open two terminal windows side-by-side, both at the same project directory. Use a clean look (large font, transparent or single-color background, no clutter). Recommended: [VHS](https://github.com/charmbracelet/vhs) for repeatable GIF generation, or `asciinema` + `agg` for high-quality output.

## Window L — Vanilla Claude Code (no Mnemo)

```bash
claude
```

Then type these prompts back-to-back:

```
> What test framework do we use in this project?
```

Claude responds with something generic: "I don't have context about your project — could you tell me?". **This is the problem.**

## Window R — Claude Code + Mnemo

```bash
# (one-time setup)
npm install -g @mnemo-mcp/cli
mnemo init
mnemo remember --global --channel convention "We use Vitest for all tests, never Jest"
mnemo remember --global --channel decision "Database migrations live in src/db/migrations"

# Now open Claude Code
claude
```

Same prompt:

```
> What test framework do we use in this project?
```

Claude responds: *"You use Vitest for all tests, never Jest."*

The `[mem:abc12345]` reference appears in Claude's chain of thought. **The same question, answered correctly, because Mnemo recalled the right memory.**

## VHS recording script

Save as `demo.tape` and run `vhs demo.tape` to generate `demo.gif`:

```vhs
Output demo.gif
Set FontSize 18
Set Width 1400
Set Height 700
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms

# Title card
Type "# Claude Code without Mnemo:"
Enter
Sleep 1s

Type "claude"
Enter
Sleep 2s

Type "What test framework do we use?"
Enter
Sleep 4s

# Scroll through the unhelpful response
Sleep 3s

Type "exit"
Enter
Sleep 1s

# Install + setup
Type "# Now: install Mnemo (one command)"
Enter
Sleep 1s

Type "npm install -g @mnemo-mcp/cli && mnemo init"
Enter
Sleep 5s

Type "mnemo remember --global --channel convention 'We use Vitest, never Jest'"
Enter
Sleep 2s

# Restart Claude
Type "claude"
Enter
Sleep 2s

Type "What test framework do we use?"
Enter
Sleep 5s

# The "wow" moment — Claude cites the memory
Sleep 3s
```

## Posting

The shareable assets:

1. **The GIF** itself, hosted on GitHub releases or imgur (gif.com / cloudinary if size matters)
2. **One-line tweet**:
   > Claude Code forgot what we agreed on yesterday. Again.
   > So I built Mnemo: persistent memory for Claude Code. One command to install.
   > [npm install -g @mnemo-mcp/cli]
   > [GIF]
3. **One-line HN Show HN title**:
   > Show HN: Mnemo – Persistent memory for Claude Code
4. **Reddit r/ClaudeAI / r/LocalLLaMA**:
   > Tired of Claude Code forgetting your conventions? I built Mnemo. [link + GIF]

## Talking points (for replies)

- **"Why not just CLAUDE.md?"** — CLAUDE.md is loaded every turn (token cost grows linearly). Mnemo is on-demand semantic recall.
- **"Is my data sent anywhere?"** — No. 100% local: ONNX embeddings + HNSW + sql.js in `~/.mnemo/`.
- **"Team support?"** — Yes: `mnemo team init/push/pull` with `.mnemo/team.json` checked into git.
- **"Will it capture my secrets?"** — Built-in secret guard refuses tokens, JWTs, AWS creds, etc. by default.
