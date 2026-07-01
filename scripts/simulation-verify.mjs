#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxBin = resolve(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
);
const implementation = resolve(root, 'scripts', 'simulation-verify.ts');

const result = spawnSync(tsxBin, [implementation, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`[simulation:verify] failed to launch tsx: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
