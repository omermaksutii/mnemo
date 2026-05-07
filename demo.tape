# Mnemo demo — generates demo.gif via `vhs demo.tape`
# Demonstrates the "before/after" without needing to drive Claude Code

Output demo.gif

Set FontSize 16
Set Width 1200
Set Height 700
Set Theme "Dracula"
Set TypingSpeed 60ms
Set Padding 20
Set Shell "bash"

# ----- before: mnemo doesn't know anything yet -----
Type "# What does Claude know about your project right now?"
Sleep 1500ms
Enter
Sleep 800ms

Type "mnemo recall 'what test framework do we use?'"
Sleep 800ms
Enter
Sleep 3500ms

Type "# It doesn't. Yet."
Sleep 1500ms
Enter
Sleep 1000ms
Enter

# ----- teach mnemo two things -----
Type "# Teach Mnemo what your team has decided:"
Sleep 1500ms
Enter
Sleep 800ms

Type "mnemo remember --global -c convention 'We use Vitest for all tests, never Jest'"
Sleep 600ms
Enter
Sleep 2500ms

Type "mnemo remember --global -c decision 'Database migrations live in src/db/migrations'"
Sleep 600ms
Enter
Sleep 2500ms

Type "mnemo remember --global -c gotcha 'OAuth tokens refresh every 30 minutes — never cache longer'"
Sleep 600ms
Enter
Sleep 2500ms

Enter

# ----- after: real semantic recall -----
Type "# Now ask the same question:"
Sleep 1500ms
Enter
Sleep 800ms

Type "mnemo recall 'what test framework do we use?'"
Sleep 600ms
Enter
Sleep 3500ms

Type "# Or ask in completely different words:"
Sleep 1500ms
Enter
Sleep 800ms

Type "mnemo recall 'where do schema changes go'"
Sleep 600ms
Enter
Sleep 3500ms

Type "mnemo recall 'how long do auth tokens last'"
Sleep 600ms
Enter
Sleep 3500ms

# ----- one-line install pitch -----
Enter
Type "# One command to install in Claude Code:"
Sleep 1500ms
Enter
Sleep 800ms

Type "#   npm install -g @mnemo-mcp/cli && mnemo init"
Sleep 1500ms
Enter
Enter

Type "# Persistent memory for Claude Code. Try it: github.com/omermaksutii/mnemo"
Sleep 4000ms
Enter
