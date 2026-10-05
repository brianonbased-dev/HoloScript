#!/usr/bin/env node
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

// Board task y39k: in the package layout every caller uses (no --artifact override), the gate also
// covers the web build pkg/ (the package's default export) and both rebuild receipts. pkg/ sat at a
// 2026-08-04 build for two months because only pkg-node/ was checked.
const CW = 'packages/compiler-wasm';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function writeBuild(root, dir, { wasm, sourceCommit, claimedSha = sha256(wasm) }) {
  write(join(root, CW, dir, 'holoscript_wasm_bg.wasm'), wasm);
  write(join(root, CW, dir, 'holoscript_wasm.js'), 'exports.parse = function parse() {};\n');
  write(
    join(root, CW, dir, 'rebuild-receipt.json'),
    `${JSON.stringify({ sourceCommit, result: { wasmSha256: claimedSha } }, null, 2)}\n`
  );
}

function createLayoutRepo() {
  const root = createFixtureRepo();
  for (const dir of ['src', 'pkg', 'pkg-node']) mkdirSync(join(root, CW, dir), { recursive: true });
  write(join(root, CW, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'source']);
  const sourceCommit = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  writeBuild(root, 'pkg-node', { wasm: 'same-wasm', sourceCommit });
  writeBuild(root, 'pkg', { wasm: 'same-wasm', sourceCommit });
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'both builds from that source']);
  return { root, sourceCommit };
}

function runLayoutGate(root) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root], {
    cwd: resolve('.'),
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('package layout: passes when both builds follow the source and both receipts match one commit', () => {
  const { root } = createLayoutRepo();
  try {
    const result = runLayoutGate(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /compiler-wasm\/pkg-node@.*compiler-wasm\/pkg@/);
    assert.match(result.stdout, /2 receipts match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('package layout: a web build older than the source fails even when pkg-node is fresh', () => {
  const { root, sourceCommit } = createLayoutRepo();
  try {
    write(join(root, CW, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n// changed\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'source change']);
    writeBuild(root, 'pkg-node', { wasm: 'new-wasm', sourceCommit });
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'rebuild pkg-node only']);
    const result = runLayoutGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pkg WASM artifact is stale/);
    assert.doesNotMatch(result.stderr, /pkg-node WASM artifact is stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('package layout: a receipt whose wasmSha256 is not its wasm fails', () => {
  const { root, sourceCommit } = createLayoutRepo();
  try {
    writeBuild(root, 'pkg', { wasm: 'rebuilt-wasm', sourceCommit, claimedSha: sha256('same-wasm') });
    const result = runLayoutGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pkg\/rebuild-receipt\.json says wasmSha256 .* the receipt does not describe this build/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('package layout: builds whose receipts name different source commits fail', () => {
  const { root } = createLayoutRepo();
  try {
    writeBuild(root, 'pkg', { wasm: 'old-wasm', sourceCommit: '580d91e32aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    const result = runLayoutGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /the builds name different source commits/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('package layout: a build with no receipt fails', () => {
  const { root } = createLayoutRepo();
  try {
    rmSync(join(root, CW, 'pkg-node/rebuild-receipt.json'));
    const result = runLayoutGate(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /pkg-node\/rebuild-receipt\.json is missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
