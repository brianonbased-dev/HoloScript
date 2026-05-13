#!/usr/bin/env node
/**
 * scripts/check-pnpm-install-needed.mjs
 *
 * Check if pnpm install is needed before build.
 * Returns 0 if node_modules is up to date, 1 if install is needed.
 *
 * Usage:
 *   node scripts/check-pnpm-install-needed.mjs
 *   # Exits 0 → safe to build
 *   # Exits 1 → run `pnpm install` first
 */

import { statSync, existsSync } from 'fs';
import { join } from 'path';

const lockfilePath = 'pnpm-lock.yaml';
const nodeModulesPath = 'node_modules';
const pnpmStatePath = join(nodeModulesPath, '.modules.yaml');

function getMtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

const lockfileMtime = getMtime(lockfilePath);
const nodeModulesMtime = getMtime(nodeModulesPath);
const pnpmStateMtime = getMtime(pnpmStatePath);

const installNeeded =
  lockfileMtime === 0 ||
  nodeModulesMtime === 0 ||
  pnpmStateMtime === 0 ||
  lockfileMtime > nodeModulesMtime ||
  lockfileMtime > pnpmStateMtime;

if (installNeeded) {
  console.error(
    '[check-pnpm-install] pnpm-lock.yaml is newer than node_modules. ' +
      'Run `pnpm install --frozen-lockfile` before building.'
  );
  process.exit(1);
}

console.log('[check-pnpm-install] node_modules is up to date. Safe to build.');
process.exit(0);
