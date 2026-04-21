/**
 * Paper-6 — Mecanim-style ordering-divergence 6×6 matrix harness.
 * @see memory/paper-6-mecanim-divergence-harness.md
 */
import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dir, '..');
const runVitest = resolve(pkgRoot, 'run-vitest.mjs');
const testFile = 'src/compiler/__tests__/paper-6-mecanim-divergence-matrix.bench.test.ts';

const r = spawnSync(
  process.execPath,
  ['--max-old-space-size=16384', runVitest, testFile],
  { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=16384' }, cwd: pkgRoot }
);
process.exit(r.status ?? 1);
