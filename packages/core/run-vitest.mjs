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

function ensureCoverageTmp() {
  if (!extraArgs.includes('--coverage')) return;
  fs.mkdirSync(resolve(__dir, 'coverage', '.tmp'), { recursive: true });
}

function runVitest(args) {
  ensureCoverageTmp();
  return spawnSync(process.execPath, ['--max-old-space-size=16384', vitest, 'run', ...args], {
    stdio: 'inherit',
    env: sharedEnv,
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
  for (const shard of ['1/4', '2/4', '3/4', '4/4']) {
    const proc = runVitest(['--shard', shard, ...stabilityArgs, ...extraArgs]);
    const code = proc.status ?? 1;
    if (code !== 0) overallExitCode = code;
  }
}

process.exit(overallExitCode);
