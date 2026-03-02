# Ralph Wiggum JS 🔄

**Cross-platform Node.js implementation of the Ralph Wiggum Loop for Gemini CLI.**

A drop-in replacement for the shell-based Ralph extensions ([jackwotherspoon/gemini-cli-ralph-wiggum](https://github.com/jackwotherspoon/gemini-cli-ralph-wiggum), [gemini-cli-extensions/ralph](https://github.com/gemini-cli-extensions/ralph)) that works on **Windows, macOS, and Linux** without any shell dependencies.

## Why This Exists

The original Ralph extensions are written in Bash and depend on `jq`, `chmod`, `grep`, and other Unix tools. This breaks on Windows ([documented bug](https://github.com/anthropics/claude-code/issues/14817)). This extension uses **pure Node.js** with zero npm dependencies — only `fs`, `path`, and `process`.

## Installation

```bash
gemini extensions install https://github.com/YOUR_USERNAME/ralph-wiggum-js --auto-update
```

Or install from a local path:

```bash
gemini extensions install /path/to/ralph-wiggum-js
```

## Configuration

Enable hooks in your `~/.gemini/settings.json`:

```json
{
  "hooksConfig": {
    "enabled": true
  }
}
```

## Quick Start

```bash
# Start a loop with a task
/ralph:loop "Build a REST API for todos with full test coverage." --max-iterations 10 --completion-promise "TASK_COMPLETE"
```

Gemini will:
1. Initialize the loop state
2. Work on the task
3. Get intercepted by the AfterAgent hook when it tries to exit
4. Continue with the same prompt (conversation cleared, files persisted)
5. Repeat until the completion promise is output or max iterations reached

## Commands

| Command | Description |
|---------|-------------|
| `/ralph:loop <prompt> [options]` | Start a Ralph loop |
| `/ralph:cancel` | Cancel an active loop and clean up state |
| `/ralph:help` | Show usage information |

### Options

- `--max-iterations <N>` — Stop after N iterations (default: 5)
- `--completion-promise <TEXT>` — Stop when `<promise>TEXT</promise>` appears in agent output

## How It Works

```
User: /ralph:loop "Build feature X" --max-iterations 10
  │
  ├─► setup.js creates .gemini/ralph/state.json
  │
  ├─► Gemini works on the task...
  │
  ├─► Agent finishes turn
  │     │
  │     └─► AfterAgent hook fires (stop-hook.js)
  │           │
  │           ├── No state file? → allow (exit normally)
  │           ├── Prompt mismatch? → Ghost Protection: cleanup + allow
  │           ├── Promise found? → cleanup + allow (done!)
  │           ├── Max iterations? → cleanup + allow (limit reached)
  │           └── Otherwise → increment iteration, deny + retry
  │
  └─► Loop continues with original prompt...
```

### Ghost Protection

If you interrupt a loop and start typing a new task, the hook detects the prompt mismatch and silently deactivates — it won't hijack your new conversation.

### Completion Promise

The agent must output the promise text wrapped in `<promise>` tags:

```
<promise>TASK_COMPLETE</promise>
```

The hook uses regex matching to detect this in the agent's response.

## Prompt Writing Best Practices

### 1. Clear Completion Criteria

```bash
/ralph:loop "Build a REST API for todos. When all CRUD endpoints work and tests pass with >80% coverage, output <promise>DONE</promise>." --completion-promise "DONE"
```

### 2. Safety Hatches

Always set `--max-iterations` to prevent infinite loops:

```bash
/ralph:loop "Refactor the auth module." --max-iterations 20
```

### 3. Encourage Self-Correction

```
Implement feature X using TDD:
1. Write failing tests
2. Implement the code
3. Run tests
4. If tests fail, debug and fix
5. Repeat until all green
6. Output: <promise>TESTS_PASSED</promise>
```

## Launch Safely

Run in sandbox mode with auto-approve for tool execution:

```bash
gemini -s -y
```

### Recommended Security Settings

Add to your project's `.gemini/settings.json`:

```json
{
  "tools": {
    "exclude": ["run_shell_command(git push)"],
    "allowed": [
      "run_shell_command(git commit)",
      "run_shell_command(git add)",
      "run_shell_command(git diff)",
      "run_shell_command(git status)"
    ]
  }
}
```

## Cross-Platform Compatibility

| Feature | Shell-based Ralph | ralph-wiggum-js |
|---------|-------------------|-----------------|
| Windows | ❌ Broken | ✅ Works |
| macOS | ✅ Works | ✅ Works |
| Linux | ✅ Works | ✅ Works |
| Requires `jq` | Yes | No |
| Requires `bash` | Yes | No |
| Requires `chmod` | Yes | No |
| Dependencies | Shell tools | Node.js only |

## File Structure

```
ralph-wiggum-js/
├── gemini-extension.json          # Extension manifest
├── package.json                   # Zero dependencies
├── GEMINI.md                      # Agent context (read by Gemini)
├── README.md                      # This file
├── commands/ralph/
│   ├── loop.toml                  # /ralph:loop command
│   ├── cancel.toml                # /ralph:cancel command
│   └── help.toml                  # /ralph:help command
├── hooks/
│   └── hooks.json                 # AfterAgent hook config
├── scripts/
│   ├── stop-hook.js               # Core loop logic (AfterAgent)
│   ├── setup.js                   # State initialization
│   └── cancel.js                  # State cleanup
└── tests/
    └── run-tests.js               # Built-in test suite
```

## Uninstallation

```bash
gemini extensions uninstall ralph-wiggum-js
```

## Credits

- [Geoffrey Huntley](https://ghuntley.com/ralph/) — Original "Ralph Wiggum" technique
- [jackwotherspoon/gemini-cli-ralph-wiggum](https://github.com/jackwotherspoon/gemini-cli-ralph-wiggum) — Shell-based implementation
- [gemini-cli-extensions/ralph](https://github.com/gemini-cli-extensions/ralph) — Shell-based implementation with Ghost Protection
- [Anthropic Engineering](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Research on effective agent harnesses

## License

Apache-2.0
