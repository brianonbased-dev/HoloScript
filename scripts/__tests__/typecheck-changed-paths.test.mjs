import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { collectChangedEnforcedPackages, readStagedPathsAsync } from '../holo-ci/typecheck.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if ((r.status ?? 1) !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim()}`);
  }
  return r;
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'typecheck-changed-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'Errors and Tooling']);
  git(dir, ['config', 'user.email', 'errors-tooling@local']);
  git(dir, ['config', 'core.hooksPath', '/dev/null']);
  return dir;
}

function stagedWithFilter(dir, filter) {
  const r = spawnSync(
    'git',
    [
      '-c',
      'core.quotepath=off',
      '-c',
      'diff.renames=false',
      'diff',
      '--cached',
      '--name-only',
      '-z',
      `--diff-filter=${filter}`,
    ],
    { cwd: dir, encoding: 'utf8' }
  );
  if ((r.status ?? 1) !== 0) {
    throw new Error(`diff-filter=${filter} failed: ${(r.stderr || r.stdout || '').trim()}`);
  }
  return String(r.stdout || '')
    .split('\0')
    .filter(Boolean);
}

test('readStagedPathsAsync includes a type change (T) that ACMD misses', async () => {
  const dir = initRepo();
  try {
    const rel = 'packages/studio/src/changed.ts';
    mkdirSync(join(dir, 'packages/studio/src'), { recursive: true });
    writeFileSync(join(dir, rel), 'export {};\n');
    git(dir, ['add', rel]);
    git(dir, ['commit', '-q', '-m', 'add file']);
    unlinkSync(join(dir, rel));
    symlinkSync('other.ts', join(dir, rel));
    git(dir, ['add', rel]);
    const status = spawnSync('git', ['diff', '--cached', '--name-status'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.match(status.stdout || '', /^T\s+packages\/studio\/src\/changed\.ts/m);
    assert.deepEqual(stagedWithFilter(dir, 'ACMD'), [], 'ACMD must miss a type change');
    const paths = await readStagedPathsAsync(dir);
    assert.deepEqual(paths, [rel]);
    const collected = collectChangedEnforcedPackages(paths, ['studio']);
    assert.deepEqual(collected.changed, ['studio']);
    assert.equal(collected.studioTriggered, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('typecheck --changed uses --diff-filter=ACMDT', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(root, 'scripts/holo-ci/typecheck.mjs'), 'utf8');
  assert.match(src, /'--diff-filter=ACMDT'/);
  assert.doesNotMatch(src, /'--diff-filter=ACMD'/);
});
