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
 *   node scripts/check-core-test-baseline.mjs                 # runs the suite (~19 min)
 *   pnpm --filter @holoscript/core test:baseline              # same, by name
 *
 * Classify a run that ALREADY happened — no second suite execution:
 *   pnpm --filter @holoscript/core test > run.log 2>&1
 *   node scripts/check-core-test-baseline.mjs --from-log run.log
 *
 * The 19 minutes is the SUITE's cost, not this classifier's. --from-log exists so
 * the gate can attach to whatever surface already runs the suite rather than
 * paying for a duplicate run — which is what kept it off pre-push (measured
 * 18m54s, 2026-08-05).
 *
 * Refresh the baseline on a clean tree (run the suite ≥2× yourself first, then):
 *   node scripts/check-core-test-baseline.mjs --update   # rewrites stableFailures
 *   node scripts/check-core-test-baseline.mjs --update --from-log run.log
 * Reseed ONLY when failures were genuinely resolved. Reseeding to make a red run
 * green converts an unrecorded regression into accepted noise.
 *
 * Exit codes: 0 = no new failures, 1 = new failures (regressions), 2 = setup error
 * (including: the log carries no vitest summary, so the run cannot be confirmed
 * to have happened — this gate fails CLOSED rather than reporting a false green).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const coreRoot = resolve(__dir, '..');
const manifestPath = resolve(coreRoot, 'test-baseline.json');
const UPDATE = process.argv.includes('--update');

// --from-log <path>: classify a run that ALREADY happened instead of spawning a
// new one. The 19 minutes this gate costs is the suite's cost, not the
// classifier's — decoupling them is what lets the gate attach to a surface that
// already runs the suite, instead of paying for a second full run.
const fromLogIdx = process.argv.indexOf('--from-log');
const fromLog = fromLogIdx === -1 ? null : process.argv[fromLogIdx + 1];
if (fromLogIdx !== -1 && (!fromLog || fromLog.startsWith('--'))) {
  console.error('[baseline-gate] --from-log requires a path argument');
  process.exit(2);
}

// A log with no recognizable vitest summary does not prove the suite ran, and a
// run that never happened has zero FAIL lines — which would otherwise classify
// as "no new failures" and exit 0. Fail CLOSED instead: an unverifiable run is a
// setup error, never a pass.
const SUITE_RAN = /^\s*Test Files\s+/m;

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error(`[baseline-gate] cannot read ${manifestPath}: ${e.message}`);
  process.exit(2);
}

const flakyFiles = new Set(manifest.flakyFiles?.files ?? []);
const stableFailures = new Set(manifest.stableFailures?.tests ?? []);

// Captured BEFORE the suite runs, and this ordering is load-bearing. The core
// suite rewrites tracked files inside packages/core as a side effect (the
// holotorch parity receipts under src/reconstruction/holotorch/receipts/ are
// regenerated on every run). Sampling cleanliness afterwards would therefore
// report dirty for every legitimate run and the receipt would never validate.
// The question the receipt answers is "was the tree clean when testing STARTED",
// i.e. did this run exercise what HEAD contains.
const startedDirty = (() => {
  const r = spawnSync('git', ['status', '--porcelain', '--', '.'], {
    cwd: coreRoot,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim().length > 0 : true;
})();

// Obtain the run output: either read a completed run's log, or produce one.
let out;
let source;

if (fromLog) {
  const logPath = resolve(fromLog);
  source = logPath;
  try {
    out = readFileSync(logPath, 'utf8');
  } catch (e) {
    console.error(`[baseline-gate] cannot read --from-log ${logPath}: ${e.message}`);
    process.exit(2);
  }
  console.error(`[baseline-gate] classifying a previously captured run: ${logPath}`);
} else {
  source = 'live run';
  console.error('[baseline-gate] running full core suite (sharded) — this takes a few minutes…');
  const proc = spawnSync(
    process.execPath,
    ['--max-old-space-size=16384', resolve(coreRoot, 'run-vitest.mjs')],
    { cwd: coreRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env }
  );
  // A suite that never started produces no FAIL lines, which would otherwise
  // read as "clean". Surface the spawn failure instead of inheriting its silence.
  if (proc.error) {
    console.error(`[baseline-gate] could not run the suite: ${proc.error.message}`);
    process.exit(2);
  }
  out = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`;
}

// Fail closed on an unverifiable run — see SUITE_RAN above. Without this, an
// empty/truncated log or a suite that crashed on startup exits 0 ("no new
// failures") and reports green for a run that never produced a result.
if (!SUITE_RAN.test(out)) {
  console.error(
    `[baseline-gate] no vitest summary found in ${source} — cannot confirm the suite ran.`
  );
  console.error('[baseline-gate] refusing to report a verdict on an unverifiable run.');
  process.exit(2);
}

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

// Emit a receipt bound to the CONTENT of packages/core at HEAD, not to a commit
// sha — so an amend or rebase that leaves core's tree untouched keeps the proof
// valid, while any real change to core invalidates it. This is what lets a
// ~15-minute suite gate a push in milliseconds: the cost is paid once, whenever
// the developer chooses, and the receipt proves it was paid for THIS core tree.
function coreTreeSha() {
  const r = spawnSync('git', ['rev-parse', 'HEAD:packages/core'], {
    cwd: coreRoot,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : null;
}
const receiptPath = resolve(coreRoot, '.test-baseline-receipt.json');
const dirty = startedDirty;

/**
 * True when this tree's dependencies are borrowed from a DIFFERENT checkout.
 *
 * A HoloRepo candidate worktree ships no `node_modules`, so the only way to run
 * anything in one is to junction/symlink another checkout's. pnpm's workspace
 * links inside those then resolve `@holoscript/core/*` back to the tree that
 * OWNS them — so a test importing a module by package specifier and a test
 * importing it by relative path get two different files, and any identity
 * assertion between them fails on structurally identical objects.
 *
 * Measured 2026-08-16 (task_1786942099138_9ad3):
 * `src/traits/__tests__/SharedTraitBarrelPopulation.test.ts` fails in a
 * candidate worktree and passes in the owning checkout, with all 79 package
 * `node_modules` junctioned — so it is not a coverage gap that more links fix.
 * A run under those conditions did not test THIS tree, exactly as a dirty run
 * did not test HEAD, so the receipt records it and the gate refuses it.
 */
function nodeModulesBorrowedFrom() {
  try {
    const link = resolve(coreRoot, 'node_modules');
    const real = realpathSync.native(link);
    const owner = realpathSync.native(coreRoot);
    // Same tree: the realpath of core/node_modules sits under core itself.
    if (real === resolve(owner, 'node_modules')) return null;
    return real;
  } catch {
    // No node_modules at all, or an unreadable link. Either way we cannot show
    // it was borrowed, and the suite could not have run without deps anyway.
    return null;
  }
}
const borrowedFrom = nodeModulesBorrowedFrom();
try {
  writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        '//': 'Local proof that the core baseline gate ran for this packages/core tree. Not committed. Consumed by scripts/holo-ci/check-core-baseline-receipt.mjs on pre-push.',
        schema: 'holoscript.core-baseline-receipt.v1',
        result: newFailures.length > 0 ? 'new-failures' : 'clean',
        coreTreeSha: coreTreeSha(),
        // A run against a dirty tree did not test what HEAD contains, so the
        // receipt records that and the gate refuses to honour it.
        capturedFromDirtyWorkingTree: dirty,
        // Null when this tree owns its dependencies. A path here names the
        // checkout they were borrowed from, which means module identity in this
        // run belonged to that checkout, not this one.
        nodeModulesBorrowedFrom: borrowedFrom,
        totals: {
          failures: failures.size,
          knownStable: knownStable.length,
          knownFlaky: knownFlaky.length,
          new: newFailures.length,
        },
        newFailures: newFailures.sort(),
        source,
        capturedAtIso: new Date().toISOString(),
      },
      null,
      2
    ) + '\n'
  );
} catch (e) {
  console.error(`[baseline-gate] warning: could not write receipt: ${e.message}`);
}

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
if (dirty) {
  console.error(
    '[baseline-gate] NOTE: working tree was dirty — this run did not test what HEAD contains,'
  );
  console.error('[baseline-gate]       so the receipt will not satisfy the pre-push gate.');
  console.error('[baseline-gate]       Commit your changes, then re-run to produce a valid proof.');
}
process.exit(0);
