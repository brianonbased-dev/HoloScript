/**
 * Paper-10 (HS Core PLDI) — compile matrix depth-distribution harness runner.
 *
 * Usage (from packages/core):
 *   node scripts/run-paper10-compile-matrix.mjs           # CI-sized grid (fast)
 *   node scripts/run-paper10-compile-matrix.mjs --full    # 20-seed camera-ready matrix
 *
 * @see memory/paper-10-depth-distribution-harness.md
 * @see src/compiler/__tests__/paper-10-compile-matrix-depth.bench.test.ts
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dir, '..');
const full = process.argv.includes('--full');

const env = {
  ...process.env,
  NODE_OPTIONS: '--max-old-space-size=16384',
};
if (full) env.PAPER10_FULL = '1';

const runVitest = resolve(pkgRoot, 'run-vitest.mjs');
const testFile = 'src/compiler/__tests__/paper-10-compile-matrix-depth.bench.test.ts';

const r = spawnSync(
  process.execPath,
  ['--max-old-space-size=16384', runVitest, testFile],
  { stdio: 'inherit', env, cwd: pkgRoot }
);
process.exit(r.status ?? 1);
