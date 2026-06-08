#!/usr/bin/env node
/**
 * Core test baseline gate — makes "no NEW test failures" trustworthy.
 *
 * The core vitest suite is NOT green and NOT deterministic: `run-vitest.mjs`
 * shards into 4, and a set of memory-heavy / timing-sensitive files
 * (ChoreographyTrait.prod, RuntimeOptimization, the perf benchmarks, …) flake
 * under shard memory pressure — they pass in isolation but fail intermittently
 * in the full sharded run. That makes a raw "did any test fail?" check useless
 * as a regression gate: flake reads as regression, and a real regression hides
 * among the noise. (Discovered during board task_1780207572551_ax8w; see
 * research/2026-05-31_core-onramp-optional-peer-barrel-diagnosis.md.)
 *
 * This gate classifies every failure against `test-baseline.json`:
 *   - in `flakyFiles`        → IGNORED (known flaky file)
 *   - in `stableFailures`    → IGNORED (known pre-existing deterministic failure)
 *   - anything else          → NEW FAILURE (a real regression) → exit 1
 *
 * So a change is "baseline-clean" iff it introduces zero failures outside the
 * captured baseline. Run AFTER a change to prove it added no regressions:
 *   node scripts/check-core-test-baseline.mjs
 *
 * Refresh the baseline on a clean tree (run the suite ≥2× yourself first, then):
 *   node scripts/check-core-test-baseline.mjs --update   # rewrites stableFailures
 *
 * Exit codes: 0 = no new failures, 1 = new failures (regressions), 2 = setup error.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(__dir, '..');
const manifestPath = resolve(coreRoot, 'test-baseline.json');
const UPDATE = process.argv.includes('--update');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`[baseline-gate] cannot read ${manifestPath}: ${e.message}`);
  process.exit(2);
}

const flakyFiles = new Set(manifest.flakyFiles?.files ?? []);
const stableFailures = new Set(manifest.stableFailures?.tests ?? []);

// Run the full sharded suite, capturing combined output.
console.error('[baseline-gate] running full core suite (sharded) — this takes a few minutes…');
const proc = spawnSync(
  process.execPath,
  ['--max-old-space-size=16384', resolve(coreRoot, 'run-vitest.mjs')],
  { cwd: coreRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env }
);
const out = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`;

// Parse vitest " FAIL  <id>" lines into normalized failure identifiers.
const failures = new Set();
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^\s*FAIL\s+(.*\S)\s*$/);
  if (m) failures.add(m[1].trim());
}

const isFlakyFile = (id) => {
  // id is either "<file> > describe > test" or "<file> [ <file> ]" (file-level).
  const file = id.split(' > ')[0].split(' [')[0].trim();
  return flakyFiles.has(file);
};

const newFailures = [...failures].filter((id) => !stableFailures.has(id) && !isFlakyFile(id));
const knownStable = [...failures].filter((id) => stableFailures.has(id));
const knownFlaky = [...failures].filter((id) => !stableFailures.has(id) && isFlakyFile(id));

if (UPDATE) {
  const updated = [...failures].filter((id) => !isFlakyFile(id)).sort();
  manifest.stableFailures.count = updated.length;
  manifest.stableFailures.tests = updated;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.error(
    `[baseline-gate] --update: wrote ${updated.length} stable failures to test-baseline.json`
  );
  process.exit(0);
}

console.error(
  `[baseline-gate] total failures=${failures.size} | known-stable=${knownStable.length} | known-flaky=${knownFlaky.length} | NEW=${newFailures.length}`
);

if (newFailures.length > 0) {
  console.error('\n[baseline-gate] NEW FAILURES (not in baseline — likely regressions):');
  for (const id of newFailures.sort()) console.error(`  ✗ ${id}`);
  console.error(
    '\n[baseline-gate] FAIL — the change introduced failures outside the captured baseline.'
  );
  process.exit(1);
}

console.error(
  '\n[baseline-gate] OK — no failures outside the captured baseline (no new regressions).'
);
process.exit(0);
