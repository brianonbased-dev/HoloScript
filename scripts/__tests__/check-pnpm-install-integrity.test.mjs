import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  checkPnpmInstallIntegrity,
  isContentlessPackageDir,
} from '../check-pnpm-install-integrity.mjs';

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'check-pnpm-install-integrity.mjs'
);

function fixture(label) {
  const root = mkdtempSync(join(tmpdir(), `pnpm-integrity-${label}-`));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture',
        private: true,
        dependencies: { zod: '^4.3.6' },
        workspaces: ['packages/*'],
      },
      null,
      2
    )
  );
  mkdirSync(join(root, 'packages', 'core'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'core', 'package.json'),
    JSON.stringify(
      {
        name: '@fixture/core',
        dependencies: { zod: '^4.3.6' },
      },
      null,
      2
    )
  );
  return root;
}

function runCli(root, extraArgs = []) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...extraArgs], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('empty resolved dependency directory fails the integrity check', () => {
  const root = fixture('empty');
  mkdirSync(join(root, 'node_modules', 'zod'), { recursive: true });
  assert.equal(isContentlessPackageDir(join(root, 'node_modules', 'zod')), true);
  const report = checkPnpmInstallIntegrity(root, { names: ['zod'] });
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].status, 'contentless');
  const cli = runCli(root, ['--name', 'zod']);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /empty or contentless directory/u);
  assert.match(cli.stderr, /zod/u);
});

test('directory without package.json is contentless even if other files exist', () => {
  const root = fixture('no-manifest');
  mkdirSync(join(root, 'node_modules', 'zod'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'zod', 'README.md'), 'stale\n');
  const cli = runCli(root, ['--name', 'zod']);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /zod/u);
});

test('populated package directory passes', () => {
  const root = fixture('ok');
  mkdirSync(join(root, 'node_modules', 'zod'), { recursive: true });
  writeFileSync(
    join(root, 'node_modules', 'zod', 'package.json'),
    JSON.stringify({ name: 'zod', version: '4.4.3' })
  );
  const report = checkPnpmInstallIntegrity(root, { names: ['zod'] });
  assert.equal(report.ok, true);
  const cli = runCli(root, ['--name', 'zod']);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /1 declared node_modules packages have contents/u);
});

test('pnpm store target that is empty fails through the public node_modules symlink', () => {
  const root = fixture('pnpm-store');
  const store = join(root, 'node_modules', '.pnpm', 'zod@4.4.3', 'node_modules', 'zod');
  mkdirSync(store, { recursive: true });
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  symlinkSync(
    store,
    join(root, 'node_modules', 'zod'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  const cli = runCli(root, ['--name', 'zod']);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /zod/u);
});
