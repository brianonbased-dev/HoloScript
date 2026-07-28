#!/usr/bin/env node
/**
 * check:native-render-contract
 *
 * Runs the HoloVM native renderer contract golden fixtures without invoking
 * pnpm. The repo can have an incompatible pnpm module-state cache on shared
 * Windows machines; this runner uses the already-installed Vitest binary and
 * leaves node_modules untouched.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const packageRoot = join(repoRoot, 'packages', 'holo-vm');
const vitestBin = join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vitest.CMD' : 'vitest'
);

if (!existsSync(vitestBin)) {
  console.error(`[native-render-contract] missing Vitest binary: ${vitestBin}`);
  process.exit(1);
}

const result = spawnSync(vitestBin, ['run', 'src/__tests__/native-render-contract.test.ts'], {
  cwd: packageRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[native-render-contract] failed to launch Vitest: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
