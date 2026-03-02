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
 * Ralph Wiggum JS — Test Suite (zero-dep, runs with node)
 *
 * Tests the stop-hook.js, setup.js, and cancel.js scripts by spawning them
 * with child_process (the ONLY place we use it — tests are dev-only).
 *
 * Run:  node tests/run-tests.js
 */

'use strict';

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(ROOT, 'scripts', 'stop-hook.js');
const SETUP = path.join(ROOT, 'scripts', 'setup.js');
const CANCEL = path.join(ROOT, 'scripts', 'cancel.js');

// Use a temp dir so tests don't pollute the real project
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ralph-test-'));
const STATE_DIR = path.join(TMP, '.gemini', 'ralph');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

let passed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(cond, msg) {
    if (cond) {
        passed++;
        process.stdout.write(`  ✅ ${msg}\n`);
    } else {
        failed++;
        process.stderr.write(`  ❌ FAIL: ${msg}\n`);
    }
}

function writeState(obj) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2));
}

function removeState() {
    try { fs.unlinkSync(STATE_FILE); } catch { }
    try { fs.rmdirSync(STATE_DIR); } catch { }
}

/** Run stop-hook.js with JSON on stdin, return parsed stdout & exit code. */
function runHook(inputObj) {
    const inputStr = JSON.stringify(inputObj);
    try {
        const stdout = execFileSync(process.execPath, [HOOK], {
            input: inputStr,
            cwd: TMP,
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe']
        }).toString('utf-8');
        return { output: JSON.parse(stdout), exitCode: 0 };
    } catch (err) {
        // execFileSync throws on non-zero exit
        const stdout = (err.stdout || '').toString('utf-8');
        let output;
        try { output = JSON.parse(stdout); } catch { output = null; }
        return { output, exitCode: err.status || 1 };
    }
}

/** Run setup.js with args, return stdout. */
function runSetup(args) {
    return execFileSync(process.execPath, [SETUP, ...args], {
        cwd: TMP,
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
    }).toString('utf-8');
}

/** Run cancel.js, return stderr. */
function runCancel() {
    try {
        execFileSync(process.execPath, [CANCEL], {
            cwd: TMP,
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe']
        });
    } catch { }
    // We mostly care about side effects (file removal)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function cleanup() {
    removeState();
}

// ---- stop-hook.js tests ----
process.stdout.write('\n🧪 stop-hook.js\n');

// Test 1: No state file → allow
cleanup();
(function test_noState() {
    const { output } = runHook({ prompt: 'hello', prompt_response: 'world', cwd: TMP });
    assert(output.decision === 'allow', 'No state file → allow');
})();

// Test 2: Active loop → deny and continue
(function test_activeLoop() {
    writeState({
        active: true,
        current_iteration: 1,
        max_iterations: 10,
        completion_promise: 'DONE',
        original_prompt: 'Build a REST API'
    });
    const { output } = runHook({
        prompt: 'Build a REST API',
        prompt_response: 'Working on it...',
        cwd: TMP
    });
    assert(output.decision === 'deny', 'Active loop → deny');
    assert(output.reason === 'Build a REST API', 'Reason contains original prompt');
    assert(output.hookSpecificOutput && output.hookSpecificOutput.clearContext === true, 'clearContext is true');
    assert(output.systemMessage.includes('iteration 2'), 'System message mentions next iteration');

    // Check state file was incremented
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    assert(state.current_iteration === 2, 'Iteration incremented to 2');
})();

// Test 3: Completion promise detected
(function test_completionPromise() {
    writeState({
        active: true,
        current_iteration: 3,
        max_iterations: 10,
        completion_promise: 'TASK_COMPLETE',
        original_prompt: 'Build a REST API'
    });
    const { output } = runHook({
        prompt: 'Build a REST API',
        prompt_response: 'All done! <promise>TASK_COMPLETE</promise>',
        cwd: TMP
    });
    assert(output.decision === 'allow', 'Promise found → allow');
    assert(output.continue === false, 'continue is false');
    assert(output.stopReason.includes('TASK_COMPLETE'), 'stopReason contains promise text');
    assert(!fs.existsSync(STATE_FILE), 'State file cleaned up after promise');
})();

// Test 4: Max iterations reached
(function test_maxIterations() {
    writeState({
        active: true,
        current_iteration: 10,
        max_iterations: 10,
        completion_promise: '',
        original_prompt: 'Build feature X'
    });
    const { output } = runHook({
        prompt: 'Build feature X',
        prompt_response: 'Still working...',
        cwd: TMP
    });
    assert(output.decision === 'allow', 'Max iterations → allow');
    assert(output.continue === false, 'continue is false at max iterations');
    assert(output.stopReason.includes('iteration limit'), 'stopReason mentions limit');
    assert(!fs.existsSync(STATE_FILE), 'State file cleaned up at max iterations');
})();

// Test 5: Ghost Protection — prompt mismatch
(function test_ghostProtection() {
    writeState({
        active: true,
        current_iteration: 2,
        max_iterations: 10,
        completion_promise: '',
        original_prompt: 'Build a REST API'
    });
    const { output } = runHook({
        prompt: 'What is the weather today?',
        prompt_response: 'The weather is nice.',
        cwd: TMP
    });
    assert(output.decision === 'allow', 'Ghost Protection → allow');
    assert(output.systemMessage && output.systemMessage.includes('mismatch'), 'System message mentions mismatch');
    assert(!fs.existsSync(STATE_FILE), 'State file cleaned up on mismatch');
})();

// Test 6: Inactive loop → allow
(function test_inactiveLoop() {
    writeState({
        active: false,
        current_iteration: 1,
        max_iterations: 10,
        completion_promise: '',
        original_prompt: 'Build a REST API'
    });
    const { output } = runHook({
        prompt: 'Build a REST API',
        prompt_response: 'Done.',
        cwd: TMP
    });
    assert(output.decision === 'allow', 'Inactive loop → allow');
})();

// Test 7: Corrupt state file → allow
(function test_corruptState() {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, 'THIS IS NOT JSON!!!');
    const { output } = runHook({
        prompt: 'hello',
        prompt_response: 'world',
        cwd: TMP
    });
    assert(output.decision === 'allow', 'Corrupt state → allow');
})();

// Test 8: Empty prompt (automated retry) — should NOT trigger ghost protection
(function test_emptyPrompt() {
    writeState({
        active: true,
        current_iteration: 1,
        max_iterations: 10,
        completion_promise: '',
        original_prompt: 'Build a REST API'
    });
    const { output } = runHook({
        prompt: '',
        prompt_response: 'Working...',
        cwd: TMP
    });
    assert(output.decision === 'deny', 'Empty prompt (retry) → deny (loop continues)');
})();

// Test 9: Promise with regex special characters
(function test_promiseSpecialChars() {
    writeState({
        active: true,
        current_iteration: 1,
        max_iterations: 10,
        completion_promise: 'DONE (v1.0)',
        original_prompt: 'Build it'
    });
    const { output } = runHook({
        prompt: 'Build it',
        prompt_response: 'Finished: <promise>DONE (v1.0)</promise>',
        cwd: TMP
    });
    assert(output.decision === 'allow', 'Promise with special regex chars → allow');
    assert(output.continue === false, 'continue is false');
})();

cleanup();

// ---- setup.js tests ----
process.stdout.write('\n🧪 setup.js\n');

// Test 10: Basic setup
(function test_basicSetup() {
    cleanup();
    const out = runSetup(['Build a REST API', '--max-iterations', '15', '--completion-promise', 'DONE']);
    assert(out.includes('Max Iterations: 15'), 'Setup output shows max iterations');
    assert(out.includes('DONE'), 'Setup output shows completion promise');
    assert(fs.existsSync(STATE_FILE), 'State file created');

    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    assert(state.active === true, 'State is active');
    assert(state.current_iteration === 1, 'Starts at iteration 1');
    assert(state.max_iterations === 15, 'Max iterations is 15');
    assert(state.completion_promise === 'DONE', 'Completion promise is DONE');
    assert(state.original_prompt === 'Build a REST API', 'Prompt stored correctly');
})();

// Test 11: Default max iterations
(function test_defaultMaxIter() {
    cleanup();
    runSetup(['Build something']);
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    assert(state.max_iterations === 5, 'Default max iterations is 5');
})();

// Test 12: No prompt → fails
(function test_noPrompt() {
    cleanup();
    try {
        runSetup([]);
        assert(false, 'Setup with no prompt should fail');
    } catch {
        assert(true, 'Setup with no prompt exits with error');
    }
})();

cleanup();

// ---- cancel.js tests ----
process.stdout.write('\n🧪 cancel.js\n');

// Test 13: Cancel existing state
(function test_cancelExisting() {
    writeState({ active: true, current_iteration: 5 });
    runCancel();
    assert(!fs.existsSync(STATE_FILE), 'Cancel removes state file');
})();

// Test 14: Cancel when no state
(function test_cancelNoState() {
    cleanup();
    // Should not crash
    runCancel();
    assert(true, 'Cancel with no state does not crash');
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

cleanup();
// Clean up temp dir
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { }

process.stdout.write(`\n${'═'.repeat(50)}\n`);
process.stdout.write(`Results: ${passed} passed, ${failed} failed\n`);
process.stdout.write(`${'═'.repeat(50)}\n\n`);

process.exit(failed > 0 ? 1 : 0);
