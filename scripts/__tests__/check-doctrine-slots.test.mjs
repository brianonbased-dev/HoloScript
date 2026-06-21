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

{
  const result = run({ localPreflight: null });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DOCTRINE VIOLATION: localPreflight null/);
}

{
  const result = run({});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /hook registered but never fired/);
}

{
  const result = run({ localPreflight: { status: 'PASS', duration_ms: 12 } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /OK -- required slot\(s\) non-null/);
  assert.match(result.stdout, /localPreflight status=PASS/);
}

{
  const result = runMissingAllowed();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SKIP -- workload breadcrumb missing/);
}

console.log('PASS check-doctrine-slots');
