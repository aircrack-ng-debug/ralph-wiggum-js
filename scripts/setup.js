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
 * Ralph Wiggum — Setup Script (Node.js — cross-platform)
 *
 * Parses CLI arguments, creates .gemini/ralph/state.json.
 * Called by Gemini via the /ralph:loop TOML command.
 *
 * Usage:
 *   node setup.js <prompt> [--max-iterations N] [--completion-promise TEXT]
 *
 * Output goes to stdout (read by the agent) and stderr (persona logging).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg) {
    process.stderr.write(`❌ Error: ${msg}\n`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

let rawArgs = process.argv.slice(2);

// Workaround: LLM tool invocation sometimes passes all args as a single string
if (rawArgs.length === 1 && rawArgs[0].includes(' --')) {
    rawArgs = rawArgs[0].match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    rawArgs = rawArgs.map(a => a.replace(/^"|"$/g, ''));
}

let maxIterations = 5;
let completionPromise = '';
const promptParts = [];

let i = 0;
while (i < rawArgs.length) {
    const arg = rawArgs[i];

    if (arg === '--max-iterations') {
        const val = rawArgs[i + 1];
        if (!val || !/^\d+$/.test(val)) {
            die(`Invalid iteration limit: '${val || ''}'`);
        }
        maxIterations = parseInt(val, 10);
        i += 2;
        continue;
    }

    if (arg === '--completion-promise') {
        const val = rawArgs[i + 1];
        if (!val) {
            die('Missing promise text.');
        }
        completionPromise = val;
        i += 2;
        continue;
    }

    promptParts.push(arg);
    i += 1;
}

const prompt = promptParts.join(' ').replace(/^["']|["']$/g, '').trim();

if (!prompt) {
    die('No task specified. Run /ralph:help for usage.');
}

// ---------------------------------------------------------------------------
// State initialization
// ---------------------------------------------------------------------------

const stateDir = path.join('.gemini', 'ralph');
const stateFile = path.join(stateDir, 'state.json');

// Ensure directory exists (recursive)
fs.mkdirSync(stateDir, { recursive: true });

const state = {
    active: true,
    current_iteration: 1,
    max_iterations: maxIterations,
    completion_promise: completionPromise,
    original_prompt: prompt,
    started_at: new Date().toISOString()
};

fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

// ---------------------------------------------------------------------------
// Output (stdout for agent, stderr for persona)
// ---------------------------------------------------------------------------

const output = `
Ralph is helping! I'm going in a circle!

>> Config:
   - Max Iterations: ${maxIterations}
   - Completion Promise: ${completionPromise || '(none)'}
   - Original Prompt: ${prompt}

I'm starting now! I hope I don't run out of paste!

⚠️  WARNING: This loop will continue until the task is complete,
    the iteration limit (${maxIterations}) is reached, or a promise is fulfilled.
`;

process.stdout.write(output);

if (completionPromise) {
    process.stdout.write(`\n⚠️  RALPH IS LISTENING FOR A PROMISE TO EXIT\n`);
    process.stdout.write(`   You must OUTPUT: <promise>${completionPromise}</promise>\n`);
}

process.stderr.write('\nRalph is helping! I\'m setting up my toys.\n');
