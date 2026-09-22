/**
 * Core test runner with memory hygiene.
 *
 * Shards into 4 by default (each ~500 test files) to keep V8 heap reasonable.
 * On coverage or explicit targets: single run + --maxWorkers=50%.
 * NODE_OPTIONS + execArgv always pass 16 GB (local hardware) or respect CI override.
 *
 * === Bounded, repeatable test commands (closes the OOM quarantine item) ===
 * Local full (hardware, 32 GB+):          node --max-old-space-size=16384 run-vitest.mjs
 * Local coverage (full, no CI quarantine): pnpm --filter @holoscript/core test:coverage
 * CI-like (quarantine active):             CI=true pnpm --filter @holoscript/core test:coverage
 * Single heavy suite (for owners):         pnpm --filter @holoscript/core exec vitest run <file>
 *
 * === Flaky-file quarantine (determinism fix) ===
 * 10 files pass in isolation but flake under shard memory/timing pressure.
 * These are run in a dedicated sequential pass (maxWorkers=1) BEFORE the
 * 4-way sharded pass, and excluded from the sharded pass via the
 * HOLOSCRIPT_EXCLUDE_FLAKY=1 env flag read by vitest.config.ts.
 * The canonical list is in test-baseline.json flakyFiles.
 *
 * Known memory-heavy suites (the ones previously quarantined on coverage):
 *   - StressTests.comprehensive.test.ts          (owner: core/perf team)
 *   - RuntimeOptimization.test.ts                (owner: runtime)
 *   - trait-commutativity.test.ts                (owner: traits)
 *   - mockadapter-static-properties.test.ts      (owner: traits)
 *   - SynthEngine.test.ts + EmbeddingTrait.test.ts (owner: audio/synth)
 *   - HoloMapPerformanceBenchmark.test.ts        (owner: holomap)
 *   - paper-4-sandbox-bench.test.ts              (owner: paper-4)
 *   - hsplus-files.test.ts (always excluded — parser stress, run manually)
 *
 * If any of the above still OOM on a 8 GB CI runner, the owner must either:
 *   - split the suite, or
 *   - mark it "local-hardware-only" in docs, or
 *   - add a dedicated high-mem CI job.
 *
 * See also: docs/strategy/ROADMAP.md §5 Promoted Seed Backlog (Core test memory closure)
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const vitest = resolve(__dir, 'node_modules', 'vitest', 'vitest.mjs');
// Any extra args forwarded by the caller (e.g. --coverage)
const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--');
// --bench sets HOLO_BENCH=1 for the child. Four test sites read that variable and
// NOTHING in the repository set it, so every assertion behind it was dead rather
// than "kept behind a flag". This is the caller that makes the flag mean something;
// `pnpm --filter @holoscript/core benchmark:heavy` is the entry point.
const BENCH = rawArgs.includes('--bench');
const extraArgs = rawArgs.filter((arg) => arg !== '--bench');

// SINGLE SOURCE OF TRUTH. These used to be a hardcoded array here AND a second
// hardcoded array in vitest.config.ts, both headed "must stay in sync" with a
// third list in test-baseline.json. All three had diverged: test-baseline.json's
// flakyFiles was emptied on 2026-09-21 while both copies here kept their ten
// entries, so files believed un-quarantined were still being routed down the
// protected serial path. A comment cannot keep two arrays equal; reading one file
// can. Divergence is now not expressible.
//
// Note these are SCHEDULING, not a verdict. A failure in one of these files is
// still a failure -- the gate's ignore-list is flakyFiles, and it is empty.
const baseline = JSON.parse(fs.readFileSync(resolve(__dir, 'test-baseline.json'), 'utf8'));
export const SERIAL_FILES = baseline.serialPassFiles?.files ?? [];

function ensureCoverageTmp() {
  if (!extraArgs.includes('--coverage')) return;
  fs.mkdirSync(resolve(__dir, 'coverage', '.tmp'), { recursive: true });
}

function runVitest(args, extraEnv = {}) {
  ensureCoverageTmp();
  return spawnSync(process.execPath, ['--max-old-space-size=16384', vitest, 'run', ...args], {
    stdio: 'inherit',
    env: { ...sharedEnv, ...extraEnv },
  });
}

function hasExplicitShard(args) {
  return args.includes('--shard');
}

function hasPositionalTestTargets(args) {
  return args.some((arg) => typeof arg === 'string' && arg.length > 0 && !arg.startsWith('-'));
}

const sharedEnv = {
  ...process.env,
  ...(BENCH ? { HOLO_BENCH: '1' } : {}),
  // Inherited by every child process spawned by vitest (forks, threads, etc.)
  NODE_OPTIONS: '--max-old-space-size=16384',
};

const stabilityArgs = ['--maxWorkers=50%'];

let overallExitCode = 0;

// EVERY PASS'S REAL OUTCOME, carried across the process boundary.
//
// This runner always knew each pass's exit status; the gate that spawns it read
// only `proc.error` (spawn failure) and never `proc.status`, so a pass that
// CRASHED looked identical to a pass that passed. A crashed vitest worker prints
// no FAIL line, so the gate's failure parser saw nothing and reported clean.
// The envelope below is how the gate learns what actually happened, on the live
// path and equally in a captured --from-log file.
//
// `proc.status ?? null` and `proc.signal` are recorded raw, NOT coerced to 1: a
// kill-by-signal must stay distinguishable from an ordinary failing run.
const passes = [];
function runPass(label, args, extraEnv = {}) {
  // A DELIMITER, so failures can be attributed to the pass that produced them.
  // Without one, a reader of the combined log can only count FAIL lines across
  // the WHOLE run, and "this pass exited non-zero but printed no failure" --
  // the crash signature -- becomes unaskable: one forgiven failure anywhere
  // answers for every pass everywhere.
  console.error(`[run-vitest] pass-begin ${label}`);
  const proc = runVitest(args, extraEnv);
  passes.push({ label, status: proc.status ?? null, signal: proc.signal ?? null });
  return proc.status ?? 1;
}

/**
 * The content of packages/core this run actually tested.
 *
 * It goes in the envelope so a captured log is BOUND to a tree. Without it,
 * `--from-log` accepts any text file: a seven-line log hand-written once mints
 * a clean receipt for any future tree in about a second, which is a quieter
 * bypass than the `--no-verify` the gate documents.
 */
function coreTreeSha() {
  const r = spawnSync('git', ['rev-parse', 'HEAD:packages/core'], {
    cwd: __dir,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

// If caller already set sharding, or passed explicit test file globs/paths,
// do a single run to avoid Vitest shard-count errors on small test sets.
// W.150: Windows race in @vitest/coverage-v8@4.1.0 .tmp-* dirs - disable
// sharding for coverage runs; pre-create .tmp so the v8 provider doesn't race.
const isCoverage = extraArgs.includes('--coverage');
if (hasExplicitShard(extraArgs) || hasPositionalTestTargets(extraArgs) || isCoverage) {
  overallExitCode = runPass('single', [...stabilityArgs, ...extraArgs]);
} else {
  // === Pass 1: sequential pass ===
  // Run the memory/timing-sensitive files with maxWorkers=1 so they get
  // dedicated heap and no sibling-shard interference. Positional file args
  // restrict vitest to just those files; no exclusion env flag needed here.
  //
  // THE EMPTY-LIST GUARD IS LOAD-BEARING. With no positional files, this
  // invocation becomes an unfiltered `vitest run --maxWorkers=1` over the WHOLE
  // suite -- a single-worker full run that would look like a hang, not an error.
  // Emptying serialPassFiles is a reasonable thing for a future maintainer to do;
  // it must mean "skip this pass", never "run everything serially".
  if (SERIAL_FILES.length === 0) {
    console.error(
      `[run-vitest] pass 1/2 — skipped: serialPassFiles is empty in test-baseline.json`
    );
    passes.push({ label: 'sequential', status: 0, signal: null, skipped: true });
  } else {
    console.error(
      `[run-vitest] pass 1/2 — sequential pass (${SERIAL_FILES.length} files, maxWorkers=1)`
    );
    const seqCode = runPass('sequential', ['--maxWorkers=1', ...SERIAL_FILES]);
    if (seqCode !== 0) overallExitCode = seqCode;
  }

  // === Pass 2: 4-way sharded pass (serial-pass files excluded) ===
  // HOLOSCRIPT_EXCLUDE_FLAKY=1 tells vitest.config.ts to add the same
  // serialPassFiles list to the exclude list, so no shard picks them up again.
  // Both sides now read that list from test-baseline.json rather than keeping
  // their own copy.
  console.error(`[run-vitest] pass 2/2 — sharded pass (4 shards, serial-pass files excluded)`);
  for (const shard of ['1/4', '2/4', '3/4', '4/4']) {
    const code = runPass(`shard-${shard}`, ['--shard', shard, ...stabilityArgs, ...extraArgs], {
      HOLOSCRIPT_EXCLUDE_FLAKY: '1',
    });
    if (code !== 0) overallExitCode = code;
  }
}

// One machine-readable line, last. The gate parses this to learn each pass's real
// exit status; without it, --from-log has no way to know a pass ever crashed.
console.error(
  '[run-vitest] run-envelope ' +
    JSON.stringify({ v: 2, coreTreeSha: coreTreeSha(), passes, overall: overallExitCode })
);

process.exit(overallExitCode);
