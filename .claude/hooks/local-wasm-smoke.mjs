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

const filePath = process.env.CLAUDE_TOOL_INPUT_FILE_PATH ||
                 process.argv[2] ||
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

// Write into .holo-ci-last-workload.localPreflight (merge, don't clobber)
try {
  let workload = {};
  try { workload = JSON.parse(readFileSync(WORKLOAD, 'utf8')); } catch {}
  workload.localPreflight = result;
  writeFileSync(WORKLOAD, JSON.stringify(workload, null, 2));
} catch {
  // Non-fatal — workload file may not exist or may be locked
}

process.exit(0);
