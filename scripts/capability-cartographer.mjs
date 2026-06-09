#!/usr/bin/env node
/**
 * capability-cartographer.mjs — HoloScript forwarding shim
 *
 * Forwards to the canonical implementation in ai-ecosystem, which resolves
 * relative to the user home directory (cross-platform, no ~ expansion needed).
 *
 * This shim exists so `pnpm run capabilities:cartographer` works on all
 * platforms (Windows npm scripts don't expand ~; an absolute path in package.json
 * would pin a specific username).
 *
 * Authority: task_1781033663943_c9c3.
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const target = join(homedir(), '.ai-ecosystem', 'scripts', 'capability-cartographer.mjs');
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [target, ...args], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 0);
