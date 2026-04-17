/**
 * Wrapper to run vitest with a larger heap and optional sharding.
 *
 * Usage:
 *   node --max-old-space-size=16384 run-vitest.mjs [extra vitest args]
 *
 * If explicit test targets are passed, this runs once.
 * Otherwise it runs in 2 shards to reduce memory pressure.
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const vitest = resolve(__dir, 'node_modules', 'vitest', 'vitest.mjs');
const extraArgs = process.argv.slice(2);

function runVitest(args) {
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
  NODE_OPTIONS: '--max-old-space-size=16384',
};

let overallExitCode = 0;

if (hasExplicitShard(extraArgs) || hasPositionalTestTargets(extraArgs)) {
  const proc = runVitest(extraArgs);
  overallExitCode = proc.status ?? 1;
} else {
  for (const shard of ['1/2', '2/2']) {
    const proc = runVitest(['--shard', shard, ...extraArgs]);
    const code = proc.status ?? 1;
    if (code !== 0) overallExitCode = code;
  }
}

process.exit(overallExitCode);
