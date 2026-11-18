#!/usr/bin/env node
/**
 * Fail if a tracked git hook would be silently skipped.
 *
 * Git on Linux and macOS skips a hook whose index mode is not 100755, or
 * whose working file is not executable. A hook with no #! line may also
 * fail to run. This check names the hook and the exact fix command.
 *
 * Usage: node scripts/holo-ci/check-hooks-runnable.mjs [--root <dir>] [--local|--ci]
 * Exit 0 = clean (hooksPath mismatch only warns in local mode), 1 = not runnable.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const ROOT = path.resolve(arg('--root', process.cwd()));
const CI_ENV = String(process.env.CI ?? '').toLowerCase();
const CI_DEFAULT = CI_ENV === 'true' || CI_ENV === '1';
const LOCAL = process.argv.includes('--local') || (!process.argv.includes('--ci') && !CI_DEFAULT);

function git(args) {
  return spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' });
}

function posixPath(p) {
  return p.split(path.sep).join('/');
}

if (!fs.existsSync(ROOT)) {
  console.error(`Hooks check: directory not found: ${ROOT}`);
  process.exit(1);
}

const listed = git(['ls-files', '-s', '--', '.githooks']);
if (listed.status !== 0) {
  const err = (listed.stderr || listed.stdout || 'git ls-files failed').trim();
  console.error(`Hooks check: could not list tracked hooks. ${err}`);
  process.exit(1);
}

const hooks = [];
for (const line of listed.stdout.split('\n')) {
  if (!line) continue;
  const tab = line.indexOf('\t');
  if (tab < 0) continue;
  const meta = line.slice(0, tab).split(' ');
  const mode = meta[0];
  const filePath = line.slice(tab + 1);
  hooks.push({ mode, filePath });
}

if (hooks.length === 0) {
  console.error(
    'Hooks check: no tracked files under .githooks. Fix: add the hook files and run git add .githooks'
  );
  process.exit(1);
}

const errors = [];
const isPosix = process.platform !== 'win32';

for (const hook of hooks) {
  const rel = posixPath(hook.filePath);
  const abs = path.join(ROOT, hook.filePath);

  if (hook.mode !== '100755') {
    errors.push(
      `Git will silently skip ${rel} because it isn't executable. Fix: git update-index --chmod=+x ${rel} && chmod +x ${rel}`
    );
  } else if (isPosix && fs.existsSync(abs)) {
    const mode = fs.statSync(abs).mode;
    if ((mode & 0o111) === 0) {
      errors.push(
        `Git will silently skip ${rel} because it isn't executable. Fix: chmod +x ${rel}`
      );
    }
  }

  if (!fs.existsSync(abs)) {
    errors.push(
      `Git will silently skip ${rel} because the working file is missing. Fix: git checkout -- ${rel}`
    );
    continue;
  }

  const firstLine = fs.readFileSync(abs, 'utf8').split(/\r?\n/, 1)[0] ?? '';
  if (!firstLine.startsWith('#!')) {
    errors.push(
      `Git will silently skip ${rel} because it has no #! line. Fix: add a shebang as the first line (for example #!/bin/bash or #!/usr/bin/env node).`
    );
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(e);
  process.exit(1);
}

if (LOCAL) {
  const cfg = git(['config', '--get', 'core.hooksPath']);
  const value = (cfg.stdout || '').trim();
  const expectedAbs = path.resolve(ROOT, '.githooks');
  const ok =
    value === '.githooks' ||
    value === './.githooks' ||
    (value !== '' && path.resolve(ROOT, value) === expectedAbs);
  if (!ok) {
    const shown = value || 'unset';
    console.warn(
      `Warning: git core.hooksPath is ${shown}, not .githooks, so these hooks will not run. Fix: git config core.hooksPath .githooks`
    );
  }
}

console.log(`Hooks runnable: ${hooks.map((h) => posixPath(h.filePath)).join(', ')}`);
process.exit(0);
