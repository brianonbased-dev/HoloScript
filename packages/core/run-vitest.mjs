/**
 * Wrapper that splits vitest into 2 shards so each run handles ~1000 test
 * files, preventing a single fork from accumulating enough live objects to
 * exhaust the V8 heap before GC can reclaim them.
 *
 * NODE_OPTIONS is also propagated so every forked worker inherits 16 GB.
 *
 * Usage: node --max-old-space-size=16384 run-vitest.mjs [extra vitest args]
 *   e.g. node run-vitest.mjs --coverage
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const vitest = resolve(__dir, 'node_modules', 'vitest', 'vitest.mjs');
// Any extra args forwarded by the caller (e.g. --coverage)
const extraArgs = process.argv.slice(2);

const sharedEnv = {
  ...process.env,
  // Inherited by every child process spawned by vitest (forks, threads, etc.)
  NODE_OPTIONS: '--max-old-space-size=16384',
};

let overallExitCode = 0;

for (const shard of ['1/2', '2/2']) {
  const proc = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=16384',
      vitest,
      'run',
      '--shard', shard,
      ...extraArgs,
    ],
    { stdio: 'inherit', env: sharedEnv }
  );

  const code = proc.status ?? 1;
  if (code !== 0) overallExitCode = code;
}

process.exit(overallExitCode);

