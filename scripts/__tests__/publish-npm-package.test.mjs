#!/usr/bin/env node
/**
 * Fault injection for the release-provenance guard in
 * scripts/holo-ci/publish-npm-package.mjs.
 *
 * Written 2026-09-03, after three packages (@holoscript/platform 6.1.5,
 * framework 6.1.6, absorb-service 6.1.3) shipped to npm with unresolved
 * `workspace:` ranges and had to be deprecated. The guard that should have
 * stood in the way had two defects:
 *
 *   1. It compared HEAD against `origin/main`. In this ecosystem `origin` is
 *      GitHub — federation/export only, never the supplier. `canon` is the
 *      supplier. It was proving releases against the wrong repository.
 *
 *   2. It never fetched. `rev-parse origin/main` reads the local
 *      remote-tracking ref, as old as the last fetch, while the failure text
 *      claimed "fetched origin/main". The stale-ref case below is the one
 *      that matters: a tracking ref left equal to HEAD by an old fetch let a
 *      release pass that was not on the remote at all.
 *
 * Every case here drives the real script against a throwaway git sandbox, so
 * a regression fails loudly rather than being argued about.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holo-ci', 'publish-npm-package.mjs');
const PKG = '@holoscript/provenance-fixture';

let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`ok   ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}\n     ${String(error.message).split('\n')[0]}`);
  }
}

// Commit as this fixture, never as the seat: the sandbox must not depend on
// (or be blocked by) the operator's signing configuration.
const GIT_ID = [
  '-c',
  'user.email=fixture@holoscript.invalid',
  '-c',
  'user.name=provenance-fixture',
  '-c',
  'commit.gpgsign=false',
];

function git(cwd, args) {
  return execFileSync('git', [...GIT_ID, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  }).trim();
}

function writePackage(workDir, version) {
  const dir = join(workDir, 'packages', 'provenance-fixture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: PKG, version, private: false }, null, 2)}\n`
  );
  return dir;
}

/**
 * A bare `canon` remote plus a work clone whose HEAD is exactly canon's tip.
 * `other` is a second clone used to advance canon behind the work tree's back,
 * which is how the stale-tracking-ref case is built.
 */
function buildSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'holo-provenance-'));
  const canon = join(root, 'canon.git');
  const work = join(root, 'work');
  const other = join(root, 'other');

  execFileSync('git', ['init', '--bare', '--initial-branch=main', canon], { stdio: 'ignore' });
  execFileSync('git', ['init', '--initial-branch=main', work], { stdio: 'ignore' });
  git(work, ['remote', 'add', 'canon', canon]);
  writePackage(work, '1.0.0');
  git(work, ['add', '--all']);
  git(work, ['commit', '-m', 'fixture: initial']);
  git(work, ['push', 'canon', 'main']);
  git(work, ['fetch', 'canon', 'main']);

  execFileSync('git', ['clone', canon, other], { stdio: 'ignore' });

  return { root, canon, work, other };
}

function runProvenance(work, extra = []) {
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--root', work, '--package', PKG, '--provenance-only', ...extra],
    { encoding: 'utf8', timeout: 180_000 }
  );
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

// ---------------------------------------------------------------------------
// 1. The happy path: HEAD is the tip of canon's main.
// ---------------------------------------------------------------------------
check('HEAD equal to canon tip passes', () => {
  const sandbox = buildSandbox();
  try {
    const result = runProvenance(sandbox.work);
    assert.equal(result.code, 0, `expected pass, got:\n${result.out}`);
    assert.match(result.out, /provenance PASS/, 'a passing run says PASS');
    assert.match(result.out, /canon\/main/, 'the PASS line names the remote it proved against');
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. THE REGRESSION THAT MATTERS. canon moves ahead; the work tree's
//    remote-tracking ref is never updated, so it still equals HEAD. The old
//    code read that ref and passed. The guard must fetch and refuse.
// ---------------------------------------------------------------------------
check('a stale remote-tracking ref cannot fake provenance', () => {
  const sandbox = buildSandbox();
  try {
    // Advance canon from a different clone.
    writePackage(sandbox.other, '1.0.0');
    writeFileSync(join(sandbox.other, 'moved-on.txt'), 'canon advanced without the work tree\n');
    git(sandbox.other, ['add', '--all']);
    git(sandbox.other, ['commit', '-m', 'fixture: canon advances']);
    git(sandbox.other, ['push', 'origin', 'main']);

    // Precondition: the work tree still believes canon/main == HEAD. This is
    // exactly the state the pre-fix guard called provenance.
    const head = git(sandbox.work, ['rev-parse', 'HEAD']);
    const staleRef = git(sandbox.work, ['rev-parse', 'canon/main']);
    assert.equal(staleRef, head, 'precondition: the stale tracking ref still equals HEAD');

    const result = runProvenance(sandbox.work);
    assert.equal(result.code, 1, `stale ref must not pass; got:\n${result.out}`);
    assert.match(result.out, /release provenance requires HEAD/, 'it fails on the mismatch');
    assert.doesNotMatch(result.out, /provenance PASS/, 'it must not also claim PASS');
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Local commits that were never landed must not publish.
// ---------------------------------------------------------------------------
check('HEAD ahead of canon fails and says so', () => {
  const sandbox = buildSandbox();
  try {
    writeFileSync(join(sandbox.work, 'unlanded.txt'), 'never pushed\n');
    git(sandbox.work, ['add', '--all']);
    git(sandbox.work, ['commit', '-m', 'fixture: unlanded work']);

    const result = runProvenance(sandbox.work);
    assert.equal(result.code, 1, `unlanded HEAD must fail; got:\n${result.out}`);
    assert.match(result.out, /HEAD is 1 ahead and 0 behind/, 'the operator is told the distance');
    assert.match(result.out, /Land the work into canon/, 'the failure names the remedy');
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. A missing canonical remote must fail loudly, never be skipped. A guard
//    that quietly passes when it cannot check is worse than no guard.
// ---------------------------------------------------------------------------
check('a missing canonical remote fails loudly', () => {
  const sandbox = buildSandbox();
  try {
    const result = runProvenance(sandbox.work, ['--provenance-remote', 'zzz-absent']);
    assert.equal(result.code, 1, `a missing remote must fail; got:\n${result.out}`);
    assert.match(
      result.out,
      /requires the canonical remote "zzz-absent"/,
      'it names what it wanted'
    );
    assert.match(result.out, /remotes: canon/, 'it lists what the checkout actually has');
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. The default is canon, not origin. If a checkout has an `origin` that is
//    ahead, pointing the guard there must not be what happens by default —
//    otherwise the mirror silently becomes the supplier again.
// ---------------------------------------------------------------------------
check('the default remote is canon even when origin exists and matches', () => {
  const sandbox = buildSandbox();
  try {
    // Give the sandbox an `origin` that is ahead of canon, and move HEAD onto
    // it. origin/main == HEAD, canon/main != HEAD. Defaulting to origin would
    // pass; defaulting to canon must fail.
    const origin = join(sandbox.root, 'origin.git');
    execFileSync('git', ['init', '--bare', '--initial-branch=main', origin], { stdio: 'ignore' });
    git(sandbox.work, ['remote', 'add', 'origin', origin]);
    writeFileSync(join(sandbox.work, 'on-github-only.txt'), 'mirrored, not landed\n');
    git(sandbox.work, ['add', '--all']);
    git(sandbox.work, ['commit', '-m', 'fixture: pushed to the mirror only']);
    git(sandbox.work, ['push', 'origin', 'main']);

    const asOrigin = runProvenance(sandbox.work, ['--provenance-remote', 'origin']);
    assert.equal(asOrigin.code, 0, `control: origin does match HEAD here:\n${asOrigin.out}`);

    const byDefault = runProvenance(sandbox.work);
    assert.equal(byDefault.code, 1, `the default must be canon, not origin:\n${byDefault.out}`);
    assert.match(byDefault.out, /canon\/main/, 'the failure names canon');
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. Uncommitted edits inside the package being published must fail, even
//    when HEAD is exactly canon's tip — the tarball would not match the sha.
// ---------------------------------------------------------------------------
check('a dirty package path fails even at the canon tip', () => {
  const sandbox = buildSandbox();
  try {
    writeFileSync(
      join(sandbox.work, 'packages', 'provenance-fixture', 'stray.txt'),
      'uncommitted\n'
    );
    const result = runProvenance(sandbox.work);
    assert.equal(result.code, 1, `a dirty package path must fail; got:\n${result.out}`);
    assert.match(result.out, /clean package path/, 'it names the dirty-path rule');
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

if (failures > 0) {
  console.error(`\n${failures} provenance case(s) failed`);
  process.exit(1);
}
console.log('\nall provenance fault-injection cases passed');
