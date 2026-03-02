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
 * Ralph Wiggum — Cancel Script (Node.js — cross-platform)
 *
 * Removes .gemini/ralph/state.json and cleans up the directory if empty.
 * Called by Gemini via the /ralph:cancel TOML command.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const stateDir = path.join('.gemini', 'ralph');
const stateFile = path.join(stateDir, 'state.json');

if (fs.existsSync(stateFile)) {
    try {
        fs.unlinkSync(stateFile);
        process.stderr.write("Ralph: I've stopped my loop and cleaned up my toys.\n");
    } catch (err) {
        process.stderr.write(`Ralph: Failed to remove state file: ${err.message}\n`);
    }
} else {
    process.stderr.write("Ralph: I wasn't doing anything anyway!\n");
}

// Remove directory if empty
try {
    fs.rmdirSync(stateDir);
} catch {
    // Directory not empty or doesn't exist — that's fine
}
