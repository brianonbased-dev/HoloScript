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

// Every hook in the directory, not a fixed list: commit-msg was left off the old
// list, so a clone that stores it 100644 kept it non-executable and git skipped it.
const hookNames = fs
  .readdirSync(hooksDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

if (process.platform !== 'win32') {
  for (const name of hookNames) {
    const hook = path.join(hooksDir, name);
    try {
      fs.chmodSync(hook, 0o755);
    } catch (err) {
      console.warn(`Could not chmod ${hook}: ${String(err)}`);
    }
  }
}

console.log(`Installed git hooks path: .githooks (${hookNames.join(', ')})`);
