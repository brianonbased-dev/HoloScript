#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
// `danglingLane` makes <home>/.ai-ecosystem a link whose target has been removed: the
// laptop layout after the ai-ecosystem checkout moves. `liveLane` makes it a link to a
// directory that exists: the laptop layout itself (a junction to the checkout). The
// link target is an empty folder inside the same temporary home, so removing the home
// cannot reach anything outside it. `homeAs: 'file'` points the home at a file,
// `homeAs: 'too-long'` at a path os.homedir() refuses, and `homeAs: 'unreadable'` at a
// folder this user may not read (mode 000; binding only for a POSIX user that is not root).
function runFromHome({
  lane = false,
  danglingLane = false,
  liveLane = false,
  homeAs,
  workload,
  env = {},
  args = [],
} = {}) {
  const base = mkdtempSync(join(tmpdir(), 'doctrine-slots-home-'));
  let home = base;
  if (homeAs === 'file') {
    home = join(base, 'home-is-a-file');
    writeFileSync(home, '', 'utf8');
  } else if (homeAs === 'too-long') {
    home = join(base, ...Array.from({ length: 200 }, () => 'b'.repeat(200)));
  } else if (homeAs === 'unreadable') {
    home = join(base, 'home');
    mkdirSync(home);
    chmodSync(home, 0o000);
  }
  if (liveLane) {
    const checkout = join(base, 'checkout');
    mkdirSync(checkout);
    symlinkSync(checkout, join(home, '.ai-ecosystem'), 'junction');
  }
  if (lane || workload !== undefined) {
    const root = join(home, '.ai-ecosystem');
    mkdirSync(root);
    if (workload !== undefined) {
      writeFileSync(join(root, '.holo-ci-last-workload'), JSON.stringify(workload, null, 2), 'utf8');
    }
  }
  if (danglingLane) {
    const moved = join(home, 'moved-checkout');
    mkdirSync(moved);
    symlinkSync(moved, join(home, '.ai-ecosystem'), 'junction');
    rmSync(moved, { recursive: true, force: true });
  }
  const childEnv = { ...process.env, HOME: home, USERPROFILE: home, ...env };
  for (const name of [
    'AI_ECOSYSTEM_ROOT',
    'AI_ECOSYSTEM_DIR',
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
  if (homeAs === 'unreadable') chmodSync(home, 0o700);
  rmSync(base, { recursive: true, force: true });
  return result;
}

// A breadcrumb file outside any home, for the precedence cases.
function withBreadcrumb(workload, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'doctrine-slots-crumb-'));
  const path = join(dir, 'last-workload.json');
  writeFileSync(path, JSON.stringify(workload, null, 2), 'utf8');
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const STACK_FRAME = /\n\s+at /;

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
  // The OK line says what was checked, not that the machine has no lane anywhere.
  assert.match(result.stdout, /no dispatch lane is marked for this user: nothing at /);
  assert.match(result.stdout, /none of --workload, HOLOCI_WORKLOAD_PATH/);
}

// The teeth that correction must not cost. Where the default root exists, a missing
// breadcrumb is proof that should be there and is not, and the refusal says what marks
// the lane and how to fix it.
const DEFAULT_ROOT_MARKS = /\.ai-ecosystem exists, which marks this machine as a dispatch lane/;
{
  const result = runFromHome({ lane: true });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /workload breadcrumb missing/);
  assert.match(result.stderr, DEFAULT_ROOT_MARKS);
  assert.match(result.stderr, /Fix: run a HoloCI dispatch/);
}

// The laptop layout itself: <home>/.ai-ecosystem is a LIVE link (a junction) to the
// checkout, and the breadcrumb is missing. claude3's review of #325 found that no test
// covered it: a gate that counted only dangling links would have passed here.
{
  const result = runFromHome({ liveLane: true });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /workload breadcrumb missing/);
  assert.match(result.stderr, DEFAULT_ROOT_MARKS);
}

// A default root that is a link to a moved checkout is still a lane, not a clean
// machine. existsSync follows the link and would call it absent; the gate must not.
{
  const result = runFromHome({ danglingLane: true });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, DEFAULT_ROOT_MARKS);
}

// A home that is a file (HOME=/dev/null, say) has no .ai-ecosystem inside it: that is a
// clean machine, not a crash. At ae650403b, Linux threw an uncaught ENOTDIR here.
{
  const result = runFromHome({ homeAs: 'file' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /no dispatch lane is marked for this user/);
}

// A home the gate cannot inspect refuses in one readable line, never with a stack
// trace, and never as a pass. There are two guards. A home path this long reaches the
// first: os.homedir() itself refuses it, measured as ERR_SYSTEM_ERROR on Windows and on
// Linux (node 20); a Linux user with no passwd entry and no HOME reaches the same guard.
{
  const result = runFromHome({ homeAs: 'too-long' });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /cannot inspect the home directory: ERR_SYSTEM_ERROR\. This gate cannot tell/);
  assert.doesNotMatch(result.stderr, STACK_FRAME);
}

// The second guard: a home this user may not read (claude3's scenario, HOME=/root under
// uid 1000) makes the lookup of .ai-ecosystem fail with EACCES. Mode bits do not bind
// root, and Windows has none, so there the case is skipped, and says so.
if (process.platform !== 'win32' && process.getuid?.() !== 0) {
  const result = runFromHome({ homeAs: 'unreadable' });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /cannot inspect .*\.ai-ecosystem: EACCES\. This gate cannot tell/);
  assert.doesNotMatch(result.stderr, STACK_FRAME);
} else {
  console.log('SKIP the unreadable-home case: it needs a POSIX user that is not root');
}

// A blank variable is unset, as the checkout's own root resolver treats it.
for (const name of ['AI_ECOSYSTEM_ROOT', 'HOLOMESH_ROOT', 'HOLOCI_WORKLOAD_PATH', 'AI_ECOSYSTEM_DIR']) {
  const result = runFromHome({ env: { [name]: '   ' } });
  assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`);
  assert.match(result.stdout, /no dispatch lane is marked for this user/, name);
}

// --workload=<file> is read like --workload <file>; a --workload with no path refuses.
withBreadcrumb({ requiredSlots: ['localPreflight'], localPreflight: null }, (path) => {
  const result = runFromHome({ args: [`--workload=${path}`] });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /DOCTRINE VIOLATION: localPreflight null/);
});
for (const args of [
  ['--workload'],
  ['--workload', '--allow-missing-workload'],
  ['--workload='],
  ['--workload=   '],
  ['--workload', '   '],
]) {
  const result = runFromHome({ args });
  assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}`);
  assert.match(result.stderr, /--workload needs a path/);
}

// Which input wins: --workload over the workload variables, and those over the roots.
withBreadcrumb({ requiredSlots: [] }, (path) => {
  const missing = join(tmpdir(), 'doctrine-slots-missing.json');
  const flagFirst = runFromHome({
    args: ['--workload', path],
    env: { HOLOCI_WORKLOAD_PATH: missing, AI_ECOSYSTEM_ROOT: join(tmpdir(), 'doctrine-slots-no-such-root') },
  });
  assert.equal(flagFirst.status, 0, flagFirst.stderr || flagFirst.stdout);
  assert.match(flagFirst.stdout, /registered no doctrine slots/);
  const variableFirst = runFromHome({
    env: { HOLOCI_WORKLOAD_PATH: path, AI_ECOSYSTEM_ROOT: join(tmpdir(), 'doctrine-slots-no-such-root') },
  });
  assert.equal(variableFirst.status, 0, variableFirst.stderr || variableFirst.stdout);
  assert.match(variableFirst.stdout, /registered no doctrine slots/);
});

// The default path still enforces registrations, not just the --workload path.
{
  const result = runFromHome({ workload: { requiredSlots: ['localPreflight'], localPreflight: null } });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /DOCTRINE VIOLATION: localPreflight null/);
}

// Every input that marks a lane keeps the missing breadcrumb a failure, and the
// failure names that input instead of claiming a lane nobody checked for.
const MISSING_ROOT = join(tmpdir(), 'doctrine-slots-no-such-root');
const MISSING_FILE = join(tmpdir(), 'doctrine-slots-missing.json');
for (const [label, options, named] of [
  ['AI_ECOSYSTEM_ROOT', { env: { AI_ECOSYSTEM_ROOT: MISSING_ROOT } }, /AI_ECOSYSTEM_ROOT=/],
  ['HOLOMESH_ROOT', { env: { HOLOMESH_ROOT: MISSING_ROOT } }, /HOLOMESH_ROOT=/],
  ['--workload', { args: ['--workload', MISSING_FILE] }, /--workload /],
  ['HOLOCI_WORKLOAD_PATH', { env: { HOLOCI_WORKLOAD_PATH: MISSING_FILE } }, /HOLOCI_WORKLOAD_PATH=/],
  ['HOLO_CI_WORKLOAD_PATH', { env: { HOLO_CI_WORKLOAD_PATH: MISSING_FILE } }, /HOLO_CI_WORKLOAD_PATH=/],
  ['AI_ECOSYSTEM_DIR', { env: { AI_ECOSYSTEM_DIR: MISSING_ROOT } }, /AI_ECOSYSTEM_DIR=/],
]) {
  const result = runFromHome(options);
  assert.equal(result.status, 1, `${label}: ${result.stdout}`);
  assert.match(result.stderr, /workload breadcrumb missing/, label);
  assert.match(result.stderr, named, label);
}

console.log('PASS check-doctrine-slots');
