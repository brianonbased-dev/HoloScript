#!/usr/bin/env node
/**
 * local-wasm-smoke.mjs — PostToolUse hook
 *
 * Fires ONLY when an edited file is under packages/compiler-wasm/.
 * Loads the pre-built WASM module (pkg-node/) as a sub-second smoke test
 * to catch Rust/WASM breakage before a fleet job spends money.
 *
 * Writes {status, duration_ms, ts} to .holo-ci-last-workload.localPreflight.
 * Always exits 0 — this is a smoke, not a hard gate.
 * Safe: async in settings.json, zero GPU, zero Playwright, zero thermal risk.
 *
 * Scope rationale (B+partial-A consensus, 2026-06-13):
 *   - compiler-wasm: wired here (~571ms cold, zero GPU)
 *   - snn-webgpu:    use packages/snn-webgpu/scripts/probe-webgpu-headless.mjs
 *   - sync_hardware_loop: retired from CLAUDE.md doctrine (phantom, never wired)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

// HOW THIS HOOK RECEIVES THE FILE IT IS MEANT TO CHECK.
//
// It used to read CLAUDE_TOOL_INPUT_FILE_PATH, then argv[2]. settings.json wires
// it with no argument, and nothing anywhere sets that variable -- grep finds two
// consumers of it and zero producers. So `filePath` was always empty, the path
// gate below always matched nothing, and the hook exited 0 in silence. Measured
// 2026-08-19, invoked exactly as wired: no output, exit 0. Its stated job is to
// catch Rust/WASM breakage before a fleet job spends money; it had done that zero
// times since it was written on 2026-06-13.
//
// Claude Code hands hooks their payload on stdin as JSON. Its sibling on this same
// matcher, packages/snn-webgpu/scripts/probe-webgpu-headless.mjs, already read it
// that way and works. This is that solution, forty lines away, applied here.
function readHookPayloadFilePath() {
  try {
    const raw = readFileSync(0, 'utf8').trim();
    if (!raw) return '';
    const payload = JSON.parse(raw);
    const toolInput =
      payload && typeof payload.tool_input === 'object' && payload.tool_input !== null
        ? payload.tool_input
        : {};
    return [toolInput.file_path, toolInput.path, payload.file_path, payload.path].find(
      (value) => typeof value === 'string' && value.length > 0,
    ) || '';
  } catch {
    return '';
  }
}

// argv stays last, for running this by hand. An unexpanded shell placeholder is
// not a path -- treating it as one is how the sibling gate hid its own failure.
const argvPath = process.argv[2] && !process.argv[2].includes('$') ? process.argv[2] : '';
const filePath = readHookPayloadFilePath() ||
                 process.env.CLAUDE_TOOL_INPUT_FILE_PATH ||
                 argvPath ||
                 '';

// Path gate — only fire for compiler-wasm edits
const WATCHED_PREFIX = 'packages/compiler-wasm';
const normalized = filePath.replace(/\\/g, '/');
if (!normalized.includes(WATCHED_PREFIX)) {
  process.exit(0);
}

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const WASM_JS   = join(REPO_ROOT, 'packages', 'compiler-wasm', 'pkg-node', 'holoscript_wasm.js');
const WORKLOAD_ROOT = process.env.AI_ECOSYSTEM_ROOT ||
                      process.env.HOLOMESH_ROOT ||
                      join(homedir(), '.ai-ecosystem');
const WORKLOAD  = process.env.HOLOCI_WORKLOAD_PATH ||
                  process.env.HOLO_CI_WORKLOAD_PATH ||
                  join(WORKLOAD_ROOT, '.holo-ci-last-workload');

const t0 = Date.now();
let status = 'PASS';
let error  = null;

try {
  execFileSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(WASM_JS)}); process.exit(0);`],
    { timeout: 8000, windowsHide: true, stdio: 'pipe' }
  );
} catch (err) {
  status = 'FAIL';
  error  = err.message?.slice(0, 200) ?? 'unknown';
}

const duration_ms = Date.now() - t0;
const result = { status, duration_ms, ts: new Date().toISOString(), ...(error ? { error } : {}) };

// Emit one line to stdout for Claude's session log
console.log(`[local-smoke] ${status} compiler-wasm ${duration_ms}ms`);

// A failure has to reach somebody. Measured 2026-08-19: with the payload defect
// above repaired and the wasm entry deliberately broken, this printed
// `[local-smoke] FAIL compiler-wasm 180ms` and then exited 0 -- so the smoke test
// found the breakage, said so into a log, and told no one. stdout on a passing
// PostToolUse hook is not shown to the agent; stderr with exit 2 is. Keeping exit 0
// here would have swapped one silent failure for another.
//
// PostToolUse runs AFTER the edit is applied, so this blocks nothing and undoes
// nothing. It tells the agent that the thing it just changed no longer loads.
if (status === 'FAIL') {
  console.error(`[local-smoke] compiler-wasm no longer loads after this edit.`);
  if (error) console.error(`  ${error}`);
  console.error(`  The edit was applied. The WASM build needs rebuilding or fixing.`);
}

// Write into .holo-ci-last-workload.localPreflight (merge, don't clobber)
try {
  let workload = {};
  try { workload = JSON.parse(readFileSync(WORKLOAD, 'utf8')); } catch {}
  workload.localPreflight = result;
  writeFileSync(WORKLOAD, JSON.stringify(workload, null, 2));
} catch {
  // Non-fatal — workload file may not exist or may be locked
}

process.exit(status === 'FAIL' ? 2 : 0);
