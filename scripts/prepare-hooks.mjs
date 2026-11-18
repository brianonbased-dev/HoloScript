#!/usr/bin/env node
/**
 * npm/pnpm prepare wrapper: install repo git hooks in a git checkout of this
 * repo. Always exits 0 so a hook problem never breaks install.
 *
 * Skips (one plain line, exit 0) when CI=true, HOLO_SKIP_HOOKS=1, there is no
 * .git at the repo root, or this directory is not the root of a git work tree
 * of this repo (for example when installed as a dependency).
 *
 * The no-.git / CI / HOLO_SKIP_HOOKS checks run before any other import, so a
 * Docker or CI install that copied only this file still exits 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function skip(reason) {
  console.warn(reason);
  process.exit(0);
}

const ci = String(process.env.CI ?? '').toLowerCase();
if (ci === 'true' || ci === '1') {
  skip('Skipping git hook install: CI=true.');
}

if (process.env.HOLO_SKIP_HOOKS === '1') {
  skip('Skipping git hook install: HOLO_SKIP_HOOKS=1. To install later: pnpm hooks:install');
}

const gitPath = path.join(repoRoot, '.git');
if (!fs.existsSync(gitPath)) {
  skip(
    'Skipping git hook install: no .git at the repo root (installed as a dependency). To install in a git clone: pnpm hooks:install'
  );
}

const { spawnSync } = await import('node:child_process');

const top = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
});
if ((top.status ?? 1) !== 0) {
  skip(
    'Skipping git hook install: this directory is not inside a git work tree of this repo. To install in a git clone: pnpm hooks:install'
  );
}

const toplevel = path.resolve((top.stdout || '').trim());
if (toplevel !== path.resolve(repoRoot)) {
  skip(
    'Skipping git hook install: this directory is not the root of its git work tree (installed as a dependency). To install in a git clone: pnpm hooks:install'
  );
}

const installer = path.join(repoRoot, 'scripts', 'install-hooks.js');
const result = spawnSync(process.execPath, [installer], {
  cwd: repoRoot,
  encoding: 'utf8',
});

if ((result.status ?? 1) !== 0) {
  const detail = (result.stderr || result.stdout || 'hooks:install failed').trim().split('\n')[0];
  console.warn(
    `Warning: git hook install failed. Hooks may not run. ${detail} Fix: pnpm hooks:install`
  );
  process.exit(0);
}

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(0);
