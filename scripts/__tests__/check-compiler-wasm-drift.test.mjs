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

// The order a rebuild takes: the Rust source is committed first, then the build, whose receipt
// names that commit.
function commitArtifactWithReceipt(root, receiptResult, sourceCommit) {
  write(join(root, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
  git(root, ['add', 'package.json', 'src/lib.rs']);
  git(root, ['commit', '-m', 'source']);
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  write(join(root, 'pkg-node/artifact.cjs'), 'exports.parse = function parse() {};\n');
  writeFileSync(join(root, 'pkg-node/holoscript_wasm_bg.wasm'), Buffer.from([0, 97, 115, 109, 1]));
  write(
    join(root, 'pkg-node/rebuild-receipt.json'),
    `${JSON.stringify({ sourceCommit: sourceCommit ?? head, result: receiptResult }, null, 2)}\n`
  );
  git(root, ['add', 'pkg-node']);
  git(root, ['commit', '-m', 'artifact and receipt']);
  return head;
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

function runGateArgs(root, extra) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, '--src', 'src', ...extra], {
    cwd: resolve('.'),
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('compiler-wasm drift gate counts only Rust build inputs: a TypeScript test change leaves the build fresh', () => {
  for (const input of ['src/lib.rs', 'Cargo.toml', 'Cargo.lock']) {
    const root = createFixtureRepo();
    try {
      commitArtifactWithReceipt(root, { wasmSha256: WASM_SHA, wasmBytes: 5 });
      mkdirSync(join(root, 'src/__tests__'), { recursive: true });
      write(join(root, 'src/__tests__/api.test.ts'), 'export {};\n');
      git(root, ['add', 'src/__tests__/api.test.ts']);
      git(root, ['commit', '-m', 'a TypeScript test under src']);
      const fresh = runGate(root);
      assert.equal(fresh.status, 0, `${fresh.stdout}\n${fresh.stderr}`);

      write(join(root, input), '// a build input changes\n');
      git(root, ['add', input]);
      git(root, ['commit', '-m', `change ${input}`]);
      const stale = runGate(root);
      assert.equal(stale.status, 1, `${input}\n${stale.stdout}\n${stale.stderr}`);
      assert.match(stale.stderr, /pkg-node WASM artifact is stale/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('compiler-wasm drift gate fails when the receipt names a commit whose Rust source is not the current one', () => {
  const root = createFixtureRepo();
  try {
    const source = commitArtifactWithReceipt(root, { wasmSha256: WASM_SHA, wasmBytes: 5 });
    write(join(root, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\nfn helper() {}\n');
    git(root, ['add', 'src/lib.rs']);
    git(root, ['commit', '-m', 'the Rust source changes']);
    // A receipt-only commit advances the artifact path without a rebuild.
    write(
      join(root, 'pkg-node/rebuild-receipt.json'),
      `${JSON.stringify({ sourceCommit: source, result: { wasmSha256: WASM_SHA, wasmBytes: 5 }, note: 'touched' }, null, 2)}\n`
    );
    git(root, ['add', 'pkg-node/rebuild-receipt.json']);
    git(root, ['commit', '-m', 'the receipt is touched, not rebuilt']);
    const stale = runGate(root);
    assert.equal(stale.status, 1, `${stale.stdout}\n${stale.stderr}`);
    assert.match(
      stale.stderr,
      /says the WASM was built from [0-9a-f]{10}, but 1 Rust build input\(s\) changed since then \(src\/lib\.rs\)/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const WEB_GLUE =
  'export function parse() {}\nexport function initSync() {}\nconst url = new URL("holoscript_wasm_bg.wasm", import.meta.url);\n';

function commitTwoBuilds(root, nodeBytes, webBytes, webGlue = WEB_GLUE) {
  write(join(root, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
  git(root, ['add', 'package.json', 'src/lib.rs']);
  git(root, ['commit', '-m', 'source']);
  const head = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  mkdirSync(join(root, 'pkg'), { recursive: true });
  write(join(root, 'pkg-node/holoscript_wasm.js'), 'exports.parse = function parse() {};\n');
  write(join(root, 'pkg/holoscript_wasm.js'), webGlue);
  for (const [dir, bytes] of [
    ['pkg-node', nodeBytes],
    ['pkg', webBytes],
  ]) {
    const wasm = Buffer.from(bytes);
    writeFileSync(join(root, dir, 'holoscript_wasm_bg.wasm'), wasm);
    const wasmSha256 = createHash('sha256').update(wasm).digest('hex');
    write(
      join(root, dir, 'rebuild-receipt.json'),
      `${JSON.stringify({ sourceCommit: head, result: { wasmSha256, wasmBytes: wasm.length } }, null, 2)}\n`
    );
  }
  git(root, ['add', 'pkg-node', 'pkg']);
  git(root, ['commit', '-m', 'both builds']);
}

const BOTH = ['--artifact', 'pkg-node', '--artifact', 'pkg'];

test('compiler-wasm drift gate passes when both builds hold the same WASM, reading the web build as an ES module', () => {
  const root = createFixtureRepo();
  try {
    commitTwoBuilds(root, [0, 97, 115, 109, 1], [0, 97, 115, 109, 1]);
    const ok = runGateArgs(root, BOTH);
    assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
    assert.match(ok.stdout, /PASS src@[0-9a-f]{10} <= pkg@/);
    assert.match(
      ok.stdout,
      new RegExp(`2 builds hold the same WASM \\(sha256 ${WASM_SHA.slice(0, 12)}\\)`)
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate fails when the two builds hold different WASM', () => {
  const root = createFixtureRepo();
  try {
    commitTwoBuilds(root, [0, 97, 115, 109, 1], [0, 97, 115, 109, 2]);
    const wrong = runGateArgs(root, BOTH);
    assert.equal(wrong.status, 1, `${wrong.stdout}\n${wrong.stderr}`);
    assert.match(
      wrong.stderr,
      /the builds hold different WASM \(pkg-node [0-9a-f]{12}, pkg [0-9a-f]{12}\)/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate fails when the web build does not export a #[wasm_bindgen] function', () => {
  const root = createFixtureRepo();
  try {
    commitTwoBuilds(
      root,
      [0, 97, 115, 109, 1],
      [0, 97, 115, 109, 1],
      'export function initSync() {}\nconst url = new URL("holoscript_wasm_bg.wasm", import.meta.url);\n'
    );
    const wrong = runGateArgs(root, BOTH);
    assert.equal(wrong.status, 1, `${wrong.stdout}\n${wrong.stderr}`);
    assert.match(wrong.stderr, /pkg\/holoscript_wasm\.js is missing function export\(s\): parse/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate refuses --artifact-js with more than one artifact', () => {
  const root = createFixtureRepo();
  try {
    const refused = runGateArgs(root, [...BOTH, '--artifact-js', 'pkg/holoscript_wasm.js']);
    assert.equal(refused.status, 2, `${refused.stdout}\n${refused.stderr}`);
    assert.match(refused.stderr, /--artifact-js needs exactly one --artifact/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compiler-wasm drift gate checks both builds by default and names the stale one', () => {
  const root = createFixtureRepo();
  const crate = join(root, 'packages/compiler-wasm');
  try {
    mkdirSync(join(crate, 'src'), { recursive: true });
    mkdirSync(join(crate, 'pkg-node'), { recursive: true });
    mkdirSync(join(crate, 'pkg'), { recursive: true });
    write(join(crate, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\n');
    git(root, ['add', 'package.json', 'packages/compiler-wasm/src/lib.rs']);
    git(root, ['commit', '-m', 'source']);
    const first = git(root, ['rev-parse', 'HEAD']).stdout.trim();
    const wasm = Buffer.from([0, 97, 115, 109, 1]);
    const receipt = (sourceCommit) =>
      `${JSON.stringify({ sourceCommit, result: { wasmSha256: WASM_SHA, wasmBytes: 5 } }, null, 2)}\n`;
    write(join(crate, 'pkg-node/holoscript_wasm.js'), 'exports.parse = function parse() {};\n');
    write(join(crate, 'pkg/holoscript_wasm.js'), WEB_GLUE);
    for (const dir of ['pkg-node', 'pkg']) {
      writeFileSync(join(crate, dir, 'holoscript_wasm_bg.wasm'), wasm);
      write(join(crate, dir, 'rebuild-receipt.json'), receipt(first));
    }
    git(root, ['add', 'packages/compiler-wasm/pkg-node', 'packages/compiler-wasm/pkg']);
    git(root, ['commit', '-m', 'both builds']);
    const both = spawnSync(process.execPath, [SCRIPT, '--root', root], {
      cwd: resolve('.'),
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(both.status, 0, `${both.stdout}\n${both.stderr}`);
    assert.match(both.stdout, /packages\/compiler-wasm\/pkg-node@/);
    assert.match(both.stdout, /packages\/compiler-wasm\/pkg@/);

    // The Rust source changes and only the Node build is redone: the web build is stale.
    write(join(crate, 'src/lib.rs'), '#[wasm_bindgen]\npub fn parse() {}\nfn helper() {}\n');
    git(root, ['add', 'packages/compiler-wasm/src/lib.rs']);
    git(root, ['commit', '-m', 'the Rust source changes']);
    const second = git(root, ['rev-parse', 'HEAD']).stdout.trim();
    write(join(crate, 'pkg-node/rebuild-receipt.json'), receipt(second));
    git(root, ['add', 'packages/compiler-wasm/pkg-node/rebuild-receipt.json']);
    git(root, ['commit', '-m', 'only the Node build is redone']);
    const stale = spawnSync(process.execPath, [SCRIPT, '--root', root], {
      cwd: resolve('.'),
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(stale.status, 1, `${stale.stdout}\n${stale.stderr}`);
    assert.match(stale.stderr, /packages\/compiler-wasm\/pkg WASM artifact is stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
