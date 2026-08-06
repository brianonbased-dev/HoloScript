#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'check-doctrine-slots.mjs');

function run(workload) {
  const dir = mkdtempSync(join(tmpdir(), 'doctrine-slots-'));
  const workloadPath = join(dir, 'last-workload.json');
  if (workload !== undefined) {
    writeFileSync(workloadPath, JSON.stringify(workload, null, 2), 'utf8');
  }
  const result = spawnSync(process.execPath, [SCRIPT, '--workload', workloadPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

function runMissingAllowed() {
  const dir = mkdtempSync(join(tmpdir(), 'doctrine-slots-'));
  const workloadPath = join(dir, 'missing.json');
  const result = spawnSync(process.execPath, [SCRIPT, '--workload', workloadPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, HOLOCI_ALLOW_MISSING_WORKLOAD: '1' },
  });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

// THE CASE THIS GATE EXISTS FOR: a dispatch that registered the slot and then did
// not fill it. Unchanged in intent from the original suite; the trigger is now the
// explicit registration rather than an assumption that every dispatch registers it.
{
  const result = run({ requiredSlots: ['localPreflight'], localPreflight: null });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DOCTRINE VIOLATION: localPreflight null/);
}

{
  const result = run({ requiredSlots: ['localPreflight'] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hook registered but never fired/);
}

{
  const result = run({
    requiredSlots: ['localPreflight'],
    localPreflight: { status: 'PASS', duration_ms: 12 },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /OK -- every registered slot is non-null/);
  assert.match(result.stdout, /localPreflight status=PASS/);
}

// A dispatch that registered nothing has nothing to prove. Before 2026-08-06 this
// case failed, which is why the gate blocked every candidate submit: run.mjs leaves
// localPreflight null unless --require-s23-receipt is passed, and the S23 hardware
// loop behind that flag was never built (idea-seeds/2026-06-13_sync-hardware-loop-
// local-gpu-validation.md: "the schema slot already exists and is always null").
{
  const result = run({ requiredSlots: [], localPreflight: null });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /registered no doctrine slots/);
}

// Legacy breadcrumbs (no requiredSlots key) register nothing — but say so out loud,
// so a silently-unenforced gate is visible in the log rather than looking like a pass.
{
  const result = run({ localPreflight: null });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /declares no requiredSlots/);
}

// Fail closed on a slot this gate cannot evaluate: an unrecognised registration must
// not read as satisfied.
{
  const result = run({ requiredSlots: ['someFutureSlot'] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not know how to check/);
}

{
  const result = runMissingAllowed();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SKIP -- workload breadcrumb missing/);
}

console.log('PASS check-doctrine-slots');
