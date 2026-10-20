// The core Docker-entry drift gate must run before merge (2026-10-15 outage:
// the checker existed, nothing ran it, #565 shipped a crash-loop). This pins
// the pre-push wiring and proves the gate fails on an injected missing entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const checker = 'scripts/holo-ci/check-docker-core-entries.mjs';
const dockerCfg = 'scripts/docker/tsup.core.docker.cjs';

test('pre-push runs check-docker-core-entries.mjs and blocks on failure', () => {
  const hook = readFileSync(join(root, '.githooks/pre-push'), 'utf8');
  assert.match(hook, /if ! node scripts\/holo-ci\/check-docker-core-entries\.mjs; then[\s\S]*?exit 1/);
});

test('checker passes on the real tree', () => {
  const r = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('checker FAILS when the constants entry is removed (injected drift)', () => {
  const original = readFileSync(join(root, dockerCfg), 'utf8');
  const injected = original.replace(/^\s*constants: 'src\/constants\.ts',\r?\n/m, '');
  assert.notEqual(injected, original, 'fixture: constants entry must exist to remove');
  const backup = mkdtempSync(join(tmpdir(), 'dce-'));
  cpSync(join(root, dockerCfg), join(backup, 'cfg.cjs'));
  try {
    writeFileSync(join(root, dockerCfg), injected);
    const r = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /'constants' is MISSING/);
  } finally {
    cpSync(join(backup, 'cfg.cjs'), join(root, dockerCfg));
    rmSync(backup, { recursive: true, force: true });
  }
});
