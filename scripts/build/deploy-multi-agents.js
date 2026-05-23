#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const repoRoot = join(__dirname, '..', '..');
const scriptPath = join(__dirname, 'deploy-multi-agents.ts');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpm, ['exec', 'tsx', scriptPath, ...process.argv.slice(2)], {
  cwd: repoRoot,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
