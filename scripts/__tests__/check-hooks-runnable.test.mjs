#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const checker = join(root, 'scripts/holo-ci/check-hooks-runnable.mjs');
const prepareSrc = join(root, 'scripts/prepare-hooks.mjs');

function gitEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.CI;
  delete env.HOLO_SKIP_HOOKS;
  env.GIT_AUTHOR_NAME = 'hooks-test';
  env.GIT_AUTHOR_EMAIL = 'hooks-test@example.com';
  env.GIT_COMMITTER_NAME = 'hooks-test';
  env.GIT_COMMITTER_EMAIL = 'hooks-test@example.com';
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_SYSTEM = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  Object.assign(env, extra);
  return env;
}

function git(cwd, args, extraEnv = {}) {
  const r = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: gitEnv(extraEnv),
  });
  return r;
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'hooks-runnable-'));
  const r = spawnSync('git', ['init', '-b', 'main'], { cwd: dir, encoding: 'utf8', env: gitEnv() });
  assert.equal(r.status, 0, r.stderr);
  git(dir, ['config', 'user.name', 'hooks-test']);
  git(dir, ['config', 'user.email', 'hooks-test@example.com']);
  mkdirSync(join(dir, '.githooks'));
  return dir;
}

function writeHook(dir, name, { shebang = true, executable = true, body = 'echo hook\\n' } = {}) {
  const path = join(dir, '.githooks', name);
  const text = (shebang ? '#!/bin/bash\n' : '') + body;
  writeFileSync(path, text);
  if (executable) chmodSync(path, 0o755);
  else chmodSync(path, 0o644);
}

function addHooks(dir, chmodIndex = true) {
  const r = git(dir, ['add', '.githooks']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  if (chmodIndex) {
    const names = spawnSync('git', ['-C', dir, 'ls-files', '--', '.githooks'], {
      encoding: 'utf8',
      env: gitEnv(),
    })
      .stdout.trim()
      .split('\n')
      .filter(Boolean);
    if (names.length) {
      const chmod = git(dir, ['update-index', '--chmod=+x', ...names]);
      assert.equal(chmod.status, 0, chmod.stderr + chmod.stdout);
    }
  }
}

function runChecker(dir, extraArgs = [], extraEnv = {}) {
  return spawnSync(process.execPath, [checker, '--root', dir, ...extraArgs], {
    encoding: 'utf8',
    env: gitEnv(extraEnv),
  });
}

function output(r) {
  return `${r.stdout || ''}${r.stderr || ''}`;
}

test('100644 hook gives exit 1 with the fix command', () => {
  const dir = initRepo();
  try {
    writeHook(dir, 'commit-msg', { executable: false });
    addHooks(dir, false);
    const mode = git(dir, ['ls-files', '-s', '--', '.githooks/commit-msg']).stdout;
    assert.match(mode, /^100644 /);
    const r = runChecker(dir, ['--ci']);
    assert.equal(r.status, 1, output(r));
    assert.match(
      output(r),
      /Git will silently skip \.githooks\/commit-msg because it isn't executable\. Fix: git update-index --chmod=\+x \.githooks\/commit-msg && chmod \+x \.githooks\/commit-msg/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('100755 hook with a shebang gives exit 0', () => {
  const dir = initRepo();
  try {
    writeHook(dir, 'commit-msg');
    writeHook(dir, 'pre-commit');
    addHooks(dir, true);
    const mode = git(dir, ['ls-files', '-s', '--', '.githooks/commit-msg']).stdout;
    assert.match(mode, /^100755 /);
    const r = runChecker(dir, ['--ci']);
    assert.equal(r.status, 0, output(r));
    assert.match(output(r), /Hooks runnable:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing shebang fails even when the hook is 100755', () => {
  const dir = initRepo();
  try {
    writeHook(dir, 'commit-msg', { shebang: false, executable: true });
    addHooks(dir, true);
    const r = runChecker(dir, ['--ci']);
    assert.equal(r.status, 1, output(r));
    assert.match(
      output(r),
      /Git will silently skip \.githooks\/commit-msg because it has no #! line/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-push runs check-hooks-runnable.mjs and blocks on failure', () => {
  const text = readFileSync(join(root, '.githooks/pre-push'), 'utf8');
  assert.match(
    text,
    /if ! node scripts\/holo-ci\/check-hooks-runnable\.mjs; then[\s\S]*?exit 1/
  );
});

function layoutPrepare(dir) {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  cpSync(prepareSrc, join(dir, 'scripts/prepare-hooks.mjs'));
}

function runPrepare(dir, extraEnv = {}) {
  return spawnSync(process.execPath, [join(dir, 'scripts/prepare-hooks.mjs')], {
    cwd: dir,
    encoding: 'utf8',
    env: gitEnv(extraEnv),
  });
}

test('prepare skips with a line and exit 0 when CI=true', () => {
  const dir = initRepo();
  try {
    layoutPrepare(dir);
    writeFileSync(join(dir, 'scripts/install-hooks.js'), 'process.exit(1);\n');
    const r = runPrepare(dir, { CI: 'true' });
    assert.equal(r.status, 0, output(r));
    assert.match(output(r), /Skipping git hook install: CI=true\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prepare skips with a line and exit 0 when HOLO_SKIP_HOOKS=1', () => {
  const dir = initRepo();
  try {
    layoutPrepare(dir);
    writeFileSync(join(dir, 'scripts/install-hooks.js'), 'process.exit(1);\n');
    const r = runPrepare(dir, { HOLO_SKIP_HOOKS: '1' });
    assert.equal(r.status, 0, output(r));
    assert.match(output(r), /Skipping git hook install: HOLO_SKIP_HOOKS=1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prepare skips with a line and exit 0 when there is no .git', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hooks-prepare-nogit-'));
  try {
    layoutPrepare(dir);
    const r = runPrepare(dir);
    assert.equal(r.status, 0, output(r));
    assert.match(output(r), /Skipping git hook install: no \.git at the repo root/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prepare downgrades a failing install-hooks to a warning and exit 0', () => {
  const dir = initRepo();
  try {
    layoutPrepare(dir);
    writeFileSync(
      join(dir, 'scripts/install-hooks.js'),
      "#!/usr/bin/env node\nconsole.error('install-hooks exploded');\nprocess.exit(1);\n"
    );
    const r = runPrepare(dir);
    assert.equal(r.status, 0, output(r));
    assert.match(output(r), /Warning: git hook install failed\. Hooks may not run\./);
    assert.match(output(r), /install-hooks exploded/);
    assert.match(output(r), /Fix: pnpm hooks:install/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
