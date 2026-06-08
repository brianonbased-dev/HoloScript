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
const extraArgs = process.argv.slice(2).filter((arg) => arg !== '--');

// The 10 files that flake under 4-way shard memory/timing pressure.
// Must stay in sync with test-baseline.json flakyFiles.
const FLAKY_FILES = [
  'src/__tests__/HotReloadIntegrated.test.ts',
  'src/__tests__/RuntimeOptimization.test.ts',
  'src/__tests__/aivalidator-instantiation.test.ts',
  'src/__tests__/camera-inventory-terrain-lighting-exports.test.ts',
  'src/__tests__/trait-commutativity.test.ts',
  'src/__tests__/trait-docs-count-structure.test.ts',
  'src/compiler/__tests__/VRRPerformanceBenchmark.spec.ts',
  'src/compiler/dispatch/__tests__/DispatchPolicy.test.ts',
  'src/reconstruction/__tests__/HoloMapPerformanceBenchmark.test.ts',
  'src/traits/__tests__/ChoreographyTrait.prod.test.ts',
];

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
  // Inherited by every child process spawned by vitest (forks, threads, etc.)
  NODE_OPTIONS: '--max-old-space-size=16384',
};

const stabilityArgs = ['--maxWorkers=50%'];

let overallExitCode = 0;

// If caller already set sharding, or passed explicit test file globs/paths,
// do a single run to avoid Vitest shard-count errors on small test sets.
// W.150: Windows race in @vitest/coverage-v8@4.1.0 .tmp-* dirs - disable
// sharding for coverage runs; pre-create .tmp so the v8 provider doesn't race.
const isCoverage = extraArgs.includes('--coverage');
if (hasExplicitShard(extraArgs) || hasPositionalTestTargets(extraArgs) || isCoverage) {
  const proc = runVitest([...stabilityArgs, ...extraArgs]);
  overallExitCode = proc.status ?? 1;
} else {
  // === Pass 1: sequential flaky-file pass ===
  // Run the 10 timing/memory-sensitive files with maxWorkers=1 so they get
  // dedicated heap and no sibling-shard interference. Positional file args
  // restrict vitest to just those files; no exclusion env flag needed here.
  console.error(
    `[run-vitest] pass 1/2 — sequential flaky pass (${FLAKY_FILES.length} files, maxWorkers=1)`
  );
  const seqProc = runVitest(['--maxWorkers=1', ...FLAKY_FILES]);
  const seqCode = seqProc.status ?? 1;
  if (seqCode !== 0) overallExitCode = seqCode;

  // === Pass 2: 4-way sharded pass (flaky files excluded) ===
  // HOLOSCRIPT_EXCLUDE_FLAKY=1 tells vitest.config.ts to add FLAKY_FILES to
  // the exclude list so no shard accidentally picks them up again.
  console.error('[run-vitest] pass 2/2 — sharded pass (4 shards, flaky files excluded)');
  for (const shard of ['1/4', '2/4', '3/4', '4/4']) {
    const proc = runVitest(['--shard', shard, ...stabilityArgs, ...extraArgs], {
      HOLOSCRIPT_EXCLUDE_FLAKY: '1',
    });
    const code = proc.status ?? 1;
    if (code !== 0) overallExitCode = code;
  }
}

process.exit(overallExitCode);
