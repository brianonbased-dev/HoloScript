#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

// Runs the gate the way a plain `git push` does: no --workload, so the breadcrumb
// path comes from the environment or the home directory. The child gets a temporary
// home (HOME on POSIX, USERPROFILE on Windows) and none of the variables that would
// choose the path, so the answer depends only on what the fixture puts on disk.
// `lane` creates <home>/.ai-ecosystem; `workload` also writes the breadcrumb inside it.
function runFromHome({ lane = false, workload, env = {}, args = [] } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'doctrine-slots-home-'));
  if (lane || workload !== undefined) {
    const root = join(home, '.ai-ecosystem');
    mkdirSync(root);
    if (workload !== undefined) {
      writeFileSync(join(root, '.holo-ci-last-workload'), JSON.stringify(workload, null, 2), 'utf8');
    }
  }
  const childEnv = { ...process.env, HOME: home, USERPROFILE: home, ...env };
  for (const name of [
    'AI_ECOSYSTEM_ROOT',
    'HOLOMESH_ROOT',
    'HOLOCI_WORKLOAD_PATH',
    'HOLO_CI_WORKLOAD_PATH',
    'HOLOCI_ALLOW_MISSING_WORKLOAD',
  ]) {
    if (!(name in env)) delete childEnv[name];
  }
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: childEnv,
  });
  rmSync(home, { recursive: true, force: true });
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

// A machine with no HoloCI dispatch lane (a fresh clone, a Claude Code cloud session,
// an outside contributor) registered nothing, so a push from it has nothing to prove.
// Before 2026-09-23 this failed as "localPreflight null -- hook registered but never
// fired", which blocked every push from the first HoloScript cloud session.
{
  const result = runFromHome();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /no HoloCI dispatch lane on this machine/);
}

// The teeth that correction must not cost. Where the default root exists (the laptop
// layout), a missing breadcrumb is proof that should be there and is not.
{
  const result = runFromHome({ lane: true });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /workload breadcrumb missing/);
}

// The default path still enforces registrations, not just the --workload path.
{
  const result = runFromHome({ workload: { requiredSlots: ['localPreflight'], localPreflight: null } });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /DOCTRINE VIOLATION: localPreflight null/);
}

// A configured root names a lane even when nothing exists there yet: its missing
// breadcrumb fails rather than reading as "no lane".
{
  const result = runFromHome({ env: { AI_ECOSYSTEM_ROOT: join(tmpdir(), 'doctrine-slots-no-such-root') } });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /workload breadcrumb missing/);
}

// An explicit --workload that does not exist is a request for proof, not a clean machine.
{
  const result = runFromHome({ args: ['--workload', join(tmpdir(), 'doctrine-slots-missing.json')] });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /workload breadcrumb missing/);
}

console.log('PASS check-doctrine-slots');
