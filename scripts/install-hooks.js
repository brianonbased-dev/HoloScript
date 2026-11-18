#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const hooksDir = path.join(repoRoot, '.githooks');

function posixRel(abs) {
  return path.relative(repoRoot, abs).split(path.sep).join('/');
}

function hookFiles() {
  if (!fs.existsSync(hooksDir)) {
    console.error(`Missing hooks directory: ${posixRel(hooksDir)}`);
    process.exit(1);
  }
  const names = fs
    .readdirSync(hooksDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  return names.map((name) => path.join(hooksDir, name));
}

const hooks = hookFiles();
if (hooks.length === 0) {
  console.error('No hook files found in .githooks');
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
  for (const hook of hooks) {
    try {
      fs.chmodSync(hook, 0o755);
    } catch (err) {
      const rel = posixRel(hook);
      console.error(
        `Git will silently skip ${rel} because it isn't executable. Fix: chmod +x ${rel} (${String(err)})`
      );
      process.exit(1);
    }
  }
}

const failures = [];
for (const hook of hooks) {
  const rel = posixRel(hook);
  if (!fs.existsSync(hook)) {
    failures.push(
      `Git will silently skip ${rel} because the working file is missing. Fix: git checkout -- ${rel}`
    );
    continue;
  }
  const firstLine = fs.readFileSync(hook, 'utf8').split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.startsWith('#!')) {
    failures.push(
      `Git will silently skip ${rel} because it has no #! line. Fix: add a shebang as the first line (for example #!/bin/bash or #!/usr/bin/env node).`
    );
  }
  if (process.platform !== 'win32') {
    try {
      fs.accessSync(hook, fs.constants.X_OK);
    } catch {
      failures.push(
        `Git will silently skip ${rel} because it isn't executable. Fix: chmod +x ${rel}`
      );
    }
  }
}

if (failures.length > 0) {
  for (const line of failures) console.error(line);
  process.exit(1);
}

const names = hooks.map((hook) => path.basename(hook)).join(', ');
console.log(`Installed git hooks path: .githooks (${names})`);
