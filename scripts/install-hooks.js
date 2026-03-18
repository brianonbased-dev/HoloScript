#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const hooksDir = path.join(repoRoot, '.githooks');
const preCommit = path.join(hooksDir, 'pre-commit');

if (!fs.existsSync(preCommit)) {
  console.error(`Missing hook file: ${preCommit}`);
  process.exit(1);
}

const setPath = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if ((setPath.status ?? 1) !== 0) {
  process.exit(setPath.status ?? 1);
}

if (process.platform !== 'win32') {
  try {
    fs.chmodSync(preCommit, 0o755);
  } catch (err) {
    console.warn(`Could not chmod ${preCommit}: ${String(err)}`);
  }
}

console.log('Installed git hooks path: .githooks');
