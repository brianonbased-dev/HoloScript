/**
 * Paper-10 (HS Core PLDI) §3.3 — Empirical depth-distribution harness runner.
 *
 * Runs the 50-source × k-target depth-distribution measurement and writes a
 * markdown artifact to `.bench-logs/2026-04-27-paper-10-depth-distribution-50xk.md`
 * for citation from the paper via `\measuredFrom{}`.
 *
 * Usage (from `packages/core`):
 *   node scripts/run-paper10-depth-distribution.mjs
 *   PAPER10_COMMIT_SHA=$(git rev-parse HEAD) node scripts/run-paper10-depth-distribution.mjs
 *
 * @see src/compiler/__tests__/paper-10-depth-distribution-50xk.bench.test.ts
 * @see research/paper-10-hs-core-pldi.tex §3.3
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dir, '..');

const env = {
  ...process.env,
  NODE_OPTIONS: '--max-old-space-size=16384',
};

const runVitest = resolve(pkgRoot, 'run-vitest.mjs');
const testFile = 'src/compiler/__tests__/paper-10-depth-distribution-50xk.bench.test.ts';

const r = spawnSync(
  process.execPath,
  ['--max-old-space-size=16384', runVitest, testFile],
  { stdio: 'inherit', env, cwd: pkgRoot }
);
process.exit(r.status ?? 1);
