#!/usr/bin/env node
import { createHash } from 'node:crypto';
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

function commitArtifactWithReceipt(root, receiptResult, sourceCommit) {
  git(root, ['add', 'package.json']);
  git(root, ['commit', '-m', 'init']);
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  write(join(root, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
  write(join(root, 'pkg-node/artifact.cjs'), 'exports.parse = function parse() {};\n');
  writeFileSync(join(root, 'pkg-node/holoscript_wasm_bg.wasm'), Buffer.from([0, 97, 115, 109, 1]));
  write(
    join(root, 'pkg-node/rebuild-receipt.json'),
    `${JSON.stringify({ sourceCommit: sourceCommit ?? head, result: receiptResult }, null, 2)}\n`
  );
  git(root, ['add', 'src/lib.rs', 'pkg-node']);
  git(root, ['commit', '-m', 'source, artifact and receipt']);
}

const WASM_SHA = createHash('sha256')
  .update(Buffer.from([0, 97, 115, 109, 1]))
  .digest('hex');

test('compiler-wasm drift gate fails when the rebuild receipt names a different digest', () => {
  const root = createFixtureRepo();
  try {
    // One character short, as the 2026-09-28 pkg-node receipt was.
    commitArtifactWithReceipt(root, { wasmSha256: WASM_SHA.slice(0, 63), wasmBytes: 5 });
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, `${wrong.stdout}\n${wrong.stderr}`);
    assert.match(wrong.stderr, /rebuild-receipt\.json records wasmSha256/);
    assert.match(wrong.stderr, new RegExp(`hashes to ${WASM_SHA}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate fails when the rebuild receipt names a different size', () => {
  const root = createFixtureRepo();
  try {
    commitArtifactWithReceipt(root, { wasmSha256: WASM_SHA, wasmBytes: 6 });
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, `${wrong.stdout}\n${wrong.stderr}`);
    assert.match(wrong.stderr, /records wasmBytes 6, but .* is 5 bytes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate fails when a committed wasm has no receipt', () => {
  const root = createFixtureRepo();
  try {
    write(join(root, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
    write(join(root, 'pkg-node/artifact.cjs'), 'exports.parse = function parse() {};\n');
    writeFileSync(
      join(root, 'pkg-node/holoscript_wasm_bg.wasm'),
      Buffer.from([0, 97, 115, 109, 1])
    );
    git(root, ['add', 'src/lib.rs', 'pkg-node', 'package.json']);
    git(root, ['commit', '-m', 'source and artifact without a receipt']);
    const missing = runGate(root);
    assert.equal(missing.status, 1, `${missing.stdout}\n${missing.stderr}`);
    assert.match(missing.stderr, /has no pkg-node\/rebuild-receipt\.json/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate fails when the receipt names a short or unknown source commit', () => {
  for (const [sourceCommit, pattern] of [
    ['36bd409ca', /must be a full 40-character commit id; found "36bd409ca"/],
    ['0'.repeat(40), /is not in this branch's history/],
  ]) {
    const root = createFixtureRepo();
    try {
      commitArtifactWithReceipt(root, { wasmSha256: WASM_SHA, wasmBytes: 5 }, sourceCommit);
      const wrong = runGate(root);
      assert.equal(wrong.status, 1, `${wrong.stdout}\n${wrong.stderr}`);
      assert.match(wrong.stderr, pattern);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('compiler-wasm drift gate passes and says so when the receipt matches the wasm', () => {
  const root = createFixtureRepo();
  try {
    commitArtifactWithReceipt(root, { wasmSha256: WASM_SHA, wasmBytes: 5 });
    const ok = runGate(root);
    assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
    assert.match(ok.stdout, new RegExp(`receipt matches wasm sha256 ${WASM_SHA.slice(0, 12)}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
