/**
 * Wrapper that splits vitest into 4 shards so each run handles ~500 test
 * files, preventing a single fork from accumulating enough live objects to
 * exhaust the V8 heap before GC can reclaim them.
 * The smaller shard size also keeps Windows hardware-local runs below the
 * process-custody cliff where Vitest can print a green summary and still exit
 * with 0xffffffff after a long shard.
 *
 * NODE_OPTIONS is also propagated so every forked worker inherits 16 GB.
 * Worker concurrency is capped to avoid Windows fork-custody failures where
 * Vitest reports passing tests but one worker exits unexpectedly under load.
 *
 * Usage: node --max-old-space-size=16384 run-vitest.mjs [extra vitest args]
 *   e.g. node run-vitest.mjs --coverage
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
