#!/usr/bin/env node
/**
 * Smoke/regression test for scripts/holoshell-ready-world.mjs.
 *
 * Proves the current-host readiness primitive emits a redacted evidence pack,
 * writes the stable latest pointer, and keeps the flagship pipeline off fixed
 * historical receipt paths.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReadyWorldEvidencePack } from '../holoshell-ready-world.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-ready-world.mjs');
const OUT_DIR = join(REPO_ROOT, '.scratch', 'holoshell-ready-world-test');
const OUT_FILE = join(OUT_DIR, 'ready-world-evidence-pack.json');
const LATEST_FILE = join(OUT_DIR, 'latest', 'ready-world-evidence-pack.json');
const PIPELINE = join(
  REPO_ROOT,
  'experiments',
  'holoshell-human-os-frontier',
  'flagship-readiness-pipeline.hs'
);

let testsRun = 0;
let testsFailed = 0;

try {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--out',
      OUT_FILE,
      '--latest-out',
      LATEST_FILE,
      '--now',
      '2026-07-13T00:00:00.000Z',
      '--json',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  );

  assertEq(result.status, 0, 'ready-world exits 0');
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
  }
  assertOk(existsSync(OUT_FILE), 'timestamped evidence pack was written');
  assertOk(existsSync(LATEST_FILE), 'latest evidence pack pointer was written');

  const pack = JSON.parse(readFileSync(OUT_FILE, 'utf8'));
  const latest = JSON.parse(readFileSync(LATEST_FILE, 'utf8'));
  const printed = JSON.parse(result.stdout);

  assertEq(pack.schemaVersion, 'holoscript.holoshell.ready-world.evidence-pack.v0.1.0', 'schema');
  assertEq(pack.toolName, 'holoshell_ready_world', 'tool name is canonical');
  assertEq(pack.generatedAt, '2026-07-13T00:00:00.000Z', 'generatedAt uses current run timestamp');
  assertOk(/^sha256:[a-f0-9]{64}$/.test(pack.packHash), 'pack hash is sha256 hex');
  assertEq(printed.packHash, pack.packHash, 'stdout prints same pack hash');
  assertEq(latest.packHash, pack.packHash, 'latest pointer has same pack hash');
  assertEq(latest.latestPointer, true, 'latest pointer marker present');
  assertOk(
    pack.redaction.policy.includes('no env, wallet, token, or credential reads'),
    'redaction policy forbids credential reads'
  );
  assertOk(!JSON.stringify(pack).includes('HOLOMESH_WALLET_KEY'), 'wallet key name not emitted');
  assertOk(pack.host.hostFingerprint.startsWith('sha256:'), 'host identity is hashed');
  assertOk(Array.isArray(pack.repos) && pack.repos.length >= 2, 'repo receipts captured');
  assertOk(
    pack.repos.every((repo) => !String(repo.redactedRoot || '').includes('Users/')),
    'repo roots are redacted'
  );
  assertOk(
    pack.sourceContract.sources.some((source) =>
      source.path.endsWith('flagship-readiness-room.holo')
    ),
    'room source hash is included'
  );
  assertOk(
    pack.sourceContract.contractChecks.some(
      (check) => check.id === 'pipeline-current-host-input' && check.status === 'pass'
    ),
    'pipeline consumes current-host input'
  );
  assertEq(validateReadyWorldEvidencePack(pack).length, 0, 'pack validates');

  const pipelineText = readFileSync(PIPELINE, 'utf8');
  assertOk(
    pipelineText.includes('${input.current_host_readiness_pack}'),
    'pipeline has current-host input'
  );
  assertOk(
    !pipelineText.includes('2026-05-14'),
    'pipeline no longer references stale May 14 receipts'
  );

  const selfTest = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assertEq(selfTest.status, 0, 'self-test exits 0');
  assertOk(JSON.parse(selfTest.stdout).ok, 'self-test prints ok');
} finally {
  rmSync(OUT_DIR, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`FAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`PASS ${testsRun} assertions`);

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  not ok - ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  not ok - ${name}`);
  }
}
