#!/usr/bin/env node
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = resolve('scripts/holo-ci/check-compiler-wasm-drift.mjs');

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function git(cwd, args) {
  return run('git', args, cwd);
}

function write(path, content) {
  writeFileSync(path, content, 'utf8');
}

function createFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'compiler-wasm-drift-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'pkg-node'), { recursive: true });
  write(join(root, 'package.json'), '{"type":"commonjs"}\n');
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test Agent']);
  return root;
}

function runGate(root) {
  return spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--root',
      root,
      '--src',
      'src',
      '--artifact',
      'pkg-node',
      '--artifact-js',
      'pkg-node/artifact.cjs',
    ],
    {
      cwd: resolve('.'),
      encoding: 'utf8',
      windowsHide: true,
    }
  );
}

test('compiler-wasm drift gate fails when source commit is newer than artifact commit', () => {
  const root = createFixtureRepo();
  try {
    write(join(root, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
    write(join(root, 'pkg-node/artifact.cjs'), 'exports.parse = function parse() {};\n');
    git(root, ['add', 'src/lib.rs', 'pkg-node/artifact.cjs', 'package.json']);
    git(root, ['commit', '-m', 'initial source and artifact']);

    write(
      join(root, 'src/lib.rs'),
      '#[wasm_bindgen]\npub fn parse() {}\n#[wasm_bindgen]\npub fn compile_to_uaal() {}\n'
    );
    git(root, ['add', 'src/lib.rs']);
    git(root, ['commit', '-m', 'source adds uaal export']);

    const stale = runGate(root);
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /pkg-node WASM artifact is stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate passes once artifact commit follows source and exports match', () => {
  const root = createFixtureRepo();
  try {
    write(join(root, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
    write(join(root, 'pkg-node/artifact.cjs'), 'exports.parse = function parse() {};\n');
    git(root, ['add', 'src/lib.rs', 'pkg-node/artifact.cjs', 'package.json']);
    git(root, ['commit', '-m', 'initial source and artifact']);

    write(
      join(root, 'src/lib.rs'),
      '#[wasm_bindgen]\npub fn parse() {}\n#[wasm_bindgen]\npub fn compile_to_uaal() {}\n'
    );
    git(root, ['add', 'src/lib.rs']);
    git(root, ['commit', '-m', 'source adds uaal export']);

    write(
      join(root, 'pkg-node/artifact.cjs'),
      [
        'exports.parse = function parse() {};',
        'exports.compile_to_uaal = function compile_to_uaal() {};',
        '',
      ].join('\n')
    );
    git(root, ['add', 'pkg-node/artifact.cjs']);
    git(root, ['commit', '-m', 'rebuild artifact']);

    const fresh = runGate(root);
    assert.equal(fresh.status, 0, `${fresh.stdout}\n${fresh.stderr}`);
    assert.match(fresh.stdout, /PASS/);
    assert.match(fresh.stdout, /2 function exports checked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate admits a staged artifact refresh during pre-commit', () => {
  const root = createFixtureRepo();
  try {
    write(join(root, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
    write(join(root, 'pkg-node/artifact.cjs'), 'exports.parse = function parse() {};\n');
    git(root, ['add', 'src/lib.rs', 'pkg-node/artifact.cjs', 'package.json']);
    git(root, ['commit', '-m', 'initial source and artifact']);

    write(
      join(root, 'src/lib.rs'),
      '#[wasm_bindgen]\npub fn parse() {}\n#[wasm_bindgen]\npub fn compile_to_uaal() {}\n'
    );
    git(root, ['add', 'src/lib.rs']);
    git(root, ['commit', '-m', 'source adds uaal export']);

    write(
      join(root, 'pkg-node/artifact.cjs'),
      [
        'exports.parse = function parse() {};',
        'exports.compile_to_uaal = function compile_to_uaal() {};',
        '',
      ].join('\n')
    );
    git(root, ['add', 'pkg-node/artifact.cjs']);

    const pending = runGate(root);
    assert.equal(pending.status, 0, `${pending.stdout}\n${pending.stderr}`);
    assert.match(pending.stdout, /staged-refresh/);
    assert.match(pending.stdout, /2 function exports checked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
