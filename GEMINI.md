# Ralph Wiggum JS — Agent Context

*You are operating inside a Ralph loop. Read this to understand how you should behave.*

---

## What Is Happening

You are in a **persistent, self-correcting development loop**. An `AfterAgent` hook intercepts your exit and feeds your **original prompt** back to you. Your conversation history is cleared between iterations, but **your files and git history persist**.

## How to Work

1. **Read the current state of the codebase** (files, tests, git log) — this is your ground truth.
2. **Work iteratively** — don't try to do everything in one shot.
3. **Run tests before claiming completion** — `npm test`, `pytest`, `go test`, etc.
4. **Run `git status`** at the start of each iteration to see what changed.
5. **Commit meaningful progress** — `git add -A && git commit -m "iteration N: description"`.

## Completion

- Check `.gemini/ralph/state.json` for the `completion_promise` field.
- When your task is **genuinely complete** and all tests pass, output:
  ```
  <promise>YOUR_PROMISE_TEXT</promise>
  ```
- **Do NOT** output the promise tag until you have verified completion.

## Important Rules

- **Do NOT** modify `.gemini/ralph/state.json` yourself. The hook manages it.
- **Do NOT** delete the state file. Use `/ralph:cancel` if you need to stop.
- If `max_iterations` is reached, the loop will stop automatically.
- If you output the promise text outside of `<promise>` tags, it will NOT be detected.

## Iteration Awareness

Each iteration you should:
1. `git status` / `git log --oneline -5` — see what's changed
2. Read any failing test output from previous iteration
3. Fix issues, implement next piece
4. Run tests
5. Commit
6. If done: output the `<promise>` tag
