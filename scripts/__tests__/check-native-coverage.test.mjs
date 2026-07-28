#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holo-ci/check-native-coverage.mjs (the D.104 gate).
 *
 * The gate's job: keep native-authoring coverage (.hsplus/.holo/.hs in packages/)
 * rising or holding vs hand-authored TS traits — TS must dissolve INTO native
 * authoring, not grow as TS. These tests lock in that (a) the metric is real
 * (computed from the tree), (b) the committed baseline is HONEST — it can never
 * claim more coverage than the tree actually has (the anti-fabrication property
 * that replaces the unverified "1.32%" paper figure), and (c) a simulated
 * regression makes the gate exit non-zero (so it can't rot into a no-op).
 *
 * Run via: `node scripts/__tests__/check-native-coverage.test.mjs`
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCoverage } from '../holo-ci/check-native-coverage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holo-ci', 'check-native-coverage.mjs');
const BASELINE = join(REPO_ROOT, 'scripts', 'holo-ci', 'native-coverage-baseline.json');

let run = 0;
let failed = 0;
function check(cond, name) {
  run += 1;
  if (cond) console.log(`  PASS ${name}`);
  else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

// 1. Metric is real and well-formed.
const m = computeCoverage();
check(m.native > 0, 'native count > 0');
check(m.handTsTraits > 0, 'hand-TS trait count > 0');
check(m.ratio > 0 && m.ratio <= 1, 'ratio in (0, 1]');
check(m.byExt['.hsplus'] + m.byExt['.holo'] + m.byExt['.hs'] === m.native, 'byExt sums to native');

// 2. Real, material number — not the unverified 1.32% paper figure.
check(m.ratio > 0.05, 'ratio is material (> 5%), not the fabricated 1.32%');

// 3. Committed baseline is honest: never claims MORE than reality.
const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8'));
check(baseline.native <= m.native, 'baseline.native <= actual (no over-claim)');
check(baseline.ratio <= m.ratio + 1e-9, 'baseline.ratio <= actual (no over-claim)');

// 4. Gate passes at baseline, and a simulated drop fails it (non-trivial guard).
const pass = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
check(pass.status === 0, 'gate exits 0 when coverage holds');

const saved = readFileSync(BASELINE, 'utf-8');
try {
  const inflated = { ...baseline, native: baseline.native + 50 };
  writeFileSync(BASELINE, JSON.stringify(inflated, null, 2) + '\n');
  const drop = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
  check(drop.status === 1, 'gate exits 1 on a simulated native-count regression');
} finally {
  writeFileSync(BASELINE, saved); // always restore the real baseline
}

console.log(`\n[native-coverage] ${run - failed}/${run} passed.`);
process.exit(failed ? 1 : 0);
