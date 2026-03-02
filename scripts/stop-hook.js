#!/usr/bin/env node
// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Ralph Wiggum AfterAgent Stop Hook (Node.js — cross-platform)
 *
 * Reads JSON from stdin (AfterAgent hook input).
 * Checks .gemini/ralph/state.json for an active loop.
 * Decides: allow (exit 0) or deny/retry (exit 0 + decision:"deny").
 *
 * CRITICAL RULES:
 *   - stdout = ONLY valid JSON. All logging goes to stderr.
 *   - On ANY error, output {"decision":"allow"} and exit 0 — never crash.
 *   - All paths use path.join() — never hardcode separators.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
    process.stderr.write(`Ralph: ${msg}\n`);
}

/** Write JSON to stdout and exit. */
function respond(obj, exitCode = 0) {
    process.stdout.write(JSON.stringify(obj));
    process.exit(exitCode);
}

/** Safe-allow: used whenever we want to let Gemini proceed normally. */
function allow(extra) {
    respond(Object.assign({ decision: 'allow' }, extra || {}));
}

/** Read and parse the state file. Returns null on any failure. */
function readState(stateFile) {
    try {
        const raw = fs.readFileSync(stateFile, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** Atomically write state (write to tmp, then rename). */
function writeState(stateFile, state) {
    const tmp = stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, stateFile);
}

/** Remove state file and try to remove dir if empty. */
function cleanup(stateFile) {
    try { fs.unlinkSync(stateFile); } catch { /* ignore */ }
    const dir = path.dirname(stateFile);
    try { fs.rmdirSync(dir); } catch { /* non-empty or missing — fine */ }
}

/**
 * Normalize a prompt for Ghost Protection comparison.
 * Strips the /ralph:loop prefix, --max-iterations, --completion-promise flags,
 * surrounding quotes, and collapses whitespace.
 */
function normalizePrompt(raw) {
    if (!raw) return '';
    let s = raw;
    // Strip /ralph:loop prefix
    s = s.replace(/^\/ralph:loop\s+/i, '');
    // Strip known flags with their values
    s = s.replace(/--max-iterations\s+\S+/g, '');
    s = s.replace(/--completion-promise\s+\S+/g, '');
    // Strip surrounding double or single quotes
    s = s.replace(/^["']|["']$/g, '');
    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    // 1. Read hook input from stdin ------------------------------------------
    let input;
    try {
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    } catch {
        // Can't parse stdin at all — allow gracefully
        allow();
        return;
    }

    const lastMessage = input.prompt_response || '';
    const currentPrompt = input.prompt || '';

    // 2. Locate state file ---------------------------------------------------
    const cwd = input.cwd || process.cwd();
    const stateDir = path.join(cwd, '.gemini', 'ralph');
    const stateFile = path.join(stateDir, 'state.json');

    if (!fs.existsSync(stateFile)) {
        allow();
        return;
    }

    // 3. Read state ----------------------------------------------------------
    const state = readState(stateFile);
    if (!state) {
        // Corrupt state — clean up and allow
        cleanup(stateFile);
        allow();
        return;
    }

    // 4. Ghost Protection — prompt mismatch check ----------------------------
    const originalPrompt = state.original_prompt || '';

    if (currentPrompt) {
        const cleanCurrent = normalizePrompt(currentPrompt);
        const cleanOriginal = normalizePrompt(originalPrompt);

        if (cleanCurrent && cleanOriginal && cleanCurrent !== cleanOriginal) {
            // User started a new task — silently deactivate the loop
            cleanup(stateFile);
            allow({
                systemMessage:
                    `🚨 Ralph detected a prompt mismatch.\n` +
                    `Expected: '${cleanOriginal}'\nGot:      '${cleanCurrent}'`
            });
            return;
        }
    }

    // 5. Check active flag ---------------------------------------------------
    if (!state.active) {
        allow();
        return;
    }

    // 6. Completion promise check (BEFORE incrementing) ----------------------
    const promise = state.completion_promise || '';
    if (promise) {
        const promiseRegex = new RegExp(`<promise>\\s*${escapeRegExp(promise)}\\s*<\\/promise>`, 's');
        if (promiseRegex.test(lastMessage)) {
            cleanup(stateFile);
            log(`I found a shiny penny! It says ${promise}. The computer is sleeping now.`);
            allow({
                continue: false,
                stopReason: `✅ Ralph found the completion promise: '${promise}'`,
                systemMessage: `✅ Ralph found the completion promise: '${promise}'`
            });
            return;
        }
    }

    // 7. Max iterations check ------------------------------------------------
    const currentIteration = state.current_iteration || 1;
    const maxIterations = state.max_iterations || 0;

    if (maxIterations > 0 && currentIteration >= maxIterations) {
        cleanup(stateFile);
        log(`I'm tired. I've gone around ${currentIteration} times. The computer is sleeping now.`);
        allow({
            continue: false,
            stopReason: '✅ Ralph has reached the iteration limit.',
            systemMessage: '✅ Ralph has reached the iteration limit.'
        });
        return;
    }

    // 8. Continue the loop — increment and deny ------------------------------
    const newIteration = currentIteration + 1;
    state.current_iteration = newIteration;

    try {
        writeState(stateFile, state);
    } catch (err) {
        log(`Failed to write state: ${err.message}`);
        allow();
        return;
    }

    log(`I'm doing a circle! Iteration ${currentIteration} is done.`);

    respond({
        decision: 'deny',
        reason: originalPrompt,
        systemMessage: `🔄 Ralph is starting iteration ${newIteration}...`,
        hookSpecificOutput: {
            clearContext: true
        }
    });
}

/** Escape special regex characters in a string. */
function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Run
main().catch(() => {
    // Absolute last-resort fallback — never crash
    try { process.stdout.write('{"decision":"allow"}'); } catch { /* */ }
    process.exit(0);
});
