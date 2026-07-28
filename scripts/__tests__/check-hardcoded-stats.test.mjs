import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECKER = join(ROOT, 'scripts', 'holo-ci', 'check-hardcoded-stats.mjs');

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'hardcoded-stats-fixture-'));
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  mkdirSync(join(root, 'docs', 'marketing'), { recursive: true });
  return root;
}

function runChecker(root) {
  return spawnSync(process.execPath, [CHECKER, '--all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
}

describe('check-hardcoded-stats historical exemptions', () => {
  it('still fails active docs with mutable ecosystem counts', () => {
    const root = makeFixture();
    writeFileSync(join(root, 'docs', 'active.md'), 'HoloScript has 3,300 traits today.\n');

    const result = runChecker(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /docs[\\/]active\.md/u);
  });

  it('allows archived marketing and changelog point-in-time counts', () => {
    const root = makeFixture();
    writeFileSync(
      join(root, 'docs', 'marketing', 'SOCIAL_POSTS.md'),
      '> **ARCHIVED — Stale as of 2026-04-29.**\n\nOld copy with 3,300 traits.\n'
    );
    writeFileSync(join(root, 'CHANGELOG.md'), 'Historical release note: 18 domain plugins.\n');

    const result = runChecker(root);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /check:hardcoded-stats/u);
  });
});
