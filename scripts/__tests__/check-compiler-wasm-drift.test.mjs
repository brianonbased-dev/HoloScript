#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILD_TARGETS,
  buildRecipe,
  collectBuildInputs,
  gitSource,
  inputsDigest,
  runWasmBuild,
} from '../../packages/compiler-wasm/scripts/build-wasm.mjs';

const SCRIPT = resolve('scripts/holo-ci/check-compiler-wasm-drift.mjs');
const WASM = Buffer.from([0, 97, 115, 109, 1]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const WASM_SHA = sha256(WASM);

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync(
    'git',
    [
      '-c',
      'user.name=Test Agent',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', windowsHide: true }
  );
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

// Glue that answers the smoke programs as the checker does: the gate loads every build.
const VERDICTS = `source.includes('missing_name')
    ? JSON.stringify({ valid: false, errors: [{ message: 'unknown name missing_name' }] })
    : JSON.stringify({ valid: true, errors: [] })`;
const NODE_GLUE = `exports.parse = function parse() {};
exports.validate_detailed = function validate_detailed(source) {
  return ${VERDICTS};
};
`;
// The web glue answers only after initSync was given the WASM bytes, as wasm-bindgen's does.
const WEB_GLUE = `let wasmBytes = 0;
export function initSync(options) {
  wasmBytes = options && options.module ? options.module.length : 0;
}
export function parse() {}
export function validate_detailed(source) {
  if (!wasmBytes) throw new Error('the WASM was never given to initSync');
  return ${VERDICTS};
}
const url = new URL('holoscript_wasm_bg.wasm', import.meta.url);
`;

const CRATE = 'packages/compiler-wasm';

/** A workspace laid out as this repository is: the crate in packages/, the lock at the root. */
const WORKSPACE = {
  'Cargo.toml':
    '[workspace]\nmembers = ["packages/compiler-wasm"]\n\n[profile.release]\nopt-level = "z"\n',
  'Cargo.lock': '# the workspace lock\nversion = 4\n',
  'package.json': '{"type":"commonjs"}\n',
  'packages/compiler-wasm/Cargo.toml': '[package]\nname = "holoscript-wasm"\n',
  'packages/compiler-wasm/Cargo.lock': '# a member lock cargo never reads\n',
  'packages/compiler-wasm/src/lib.rs':
    '#[wasm_bindgen]\npub fn parse() {}\nconst D: &str = include_str!("../../std/src/holo/absorb.hs");\n',
  'packages/compiler-wasm/src/__tests__/api.test.ts': 'export {};\n',
  'packages/std/src/holo/absorb.hs': 'export function f(): bool {\n  return true\n}\n',
};

/** A crate at the repository root, its own workspace. */
const SOLO = {
  'Cargo.toml': '[package]\nname = "solo"\n',
  'Cargo.lock': '# the lock\n',
  'package.json': '{"type":"commonjs"}\n',
  'src/lib.rs': '#[wasm_bindgen]\npub fn parse() {}\n',
};

function createRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'compiler-wasm-drift-'));
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'the crate']);
  return root;
}

function withRepo(files, body) {
  const root = createRepo(files);
  try {
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function gitFor(root) {
  return (args, input) => {
    const result = spawnSync('git', args, {
      cwd: root,
      input,
      maxBuffer: 1 << 26,
      windowsHide: true,
    });
    return { status: result.status ?? 1, stdout: result.stdout, stderr: String(result.stderr) };
  };
}

/** The v2 receipt `rebuild` would write for `wasm`, hashing the inputs `rev` holds (null: the index). */
function receiptFor(
  root,
  crateDir,
  artifactRel,
  wasm,
  { rev = 'HEAD', result = {}, ...overrides } = {}
) {
  const outDir = artifactRel.split('/').pop();
  const { target, schema } = BUILD_TARGETS.find((entry) => entry.outDir === outDir);
  const digest = inputsDigest(collectBuildInputs(gitSource(gitFor(root), rev), crateDir).inputs);
  const wasmSha256 = sha256(wasm);
  return {
    schema,
    generatedAt: '2026-10-05T00:00:00Z',
    sourcePath: crateDir === '.' ? 'src' : `${crateDir}/src`,
    sourceCommit: git(root, ['rev-parse', 'HEAD']).trim(),
    artifactPath: artifactRel,
    inputs: { sha256: digest.sha256, files: digest.files },
    recipe: { ...buildRecipe(target, outDir), extraRustflags: [] },
    result: {
      wasmBytes: wasm.length,
      wasmSha256,
      repeatBuildSha256Matched: true,
      repeatBuildWasmSha256: wasmSha256,
      ...result,
    },
    ...overrides,
  };
}

/** Writes one build (glue, WASM, receipt) into <crateDir>/<outDir>; returns its path. */
function writeBuild(
  root,
  crateDir,
  outDir,
  { wasm = WASM, glue, glueFile = 'holoscript_wasm.js', receipt = {} } = {}
) {
  const artifactRel = crateDir === '.' ? outDir : `${crateDir}/${outDir}`;
  const web = outDir === 'pkg';
  write(root, `${artifactRel}/${glueFile}`, glue ?? (web ? WEB_GLUE : NODE_GLUE));
  if (web) write(root, `${artifactRel}/package.json`, '{"type":"module"}\n');
  writeFileSync(join(root, artifactRel, 'holoscript_wasm_bg.wasm'), wasm);
  const body = receiptFor(root, crateDir, artifactRel, wasm, receipt);
  write(root, `${artifactRel}/rebuild-receipt.json`, `${JSON.stringify(body, null, 2)}\n`);
  return artifactRel;
}

/** Writes and commits both builds; `perBuild` holds writeBuild options by out dir. */
function commitBuilds(root, crateDir = CRATE, perBuild = {}) {
  const paths = ['pkg-node', 'pkg'].map((outDir) =>
    writeBuild(root, crateDir, outDir, perBuild[outDir])
  );
  git(root, ['add', ...paths]);
  git(root, ['commit', '-q', '-m', 'both builds']);
}

function commitChange(root, path, content, message = `change ${path}`) {
  write(root, path, content);
  git(root, ['add', path]);
  git(root, ['commit', '-q', '-m', message]);
}

function runGate(root, extra = []) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...extra], {
    cwd: resolve('.'),
    encoding: 'utf8',
    windowsHide: true,
  });
}

const shown = (run) => `${run.stdout}\n${run.stderr}`;
const SOLO_NODE = ['--src', 'src', '--artifact', 'pkg-node'];
const LIB_CHANGED = `${WORKSPACE['packages/compiler-wasm/src/lib.rs']}fn helper() {}\n`;

test('passes when both builds were built from the inputs this commit holds, load, and agree', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    const ok = runGate(root);
    assert.equal(ok.status, 0, shown(ok));
    for (const build of ['pkg-node', 'pkg']) {
      assert.match(
        ok.stdout,
        new RegExp(
          `PASS packages/compiler-wasm/${build}: receipt matches wasm sha256 ${WASM_SHA.slice(0, 12)}; ` +
            'built from the Rust build inputs this commit holds \\(inputs sha256 [0-9a-f]{12}, 5 files\\) ' +
            'and repeated with the same WASM; loads, exports 1 checked function'
        )
      );
    }
    assert.match(
      ok.stdout,
      /PASS 2 builds hold the same WASM \(sha256 [0-9a-f]{12}\), were built from the same inputs/
    );
  });
});

test('fails when a build has its glue but no WASM (P2-1)', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    unlinkSync(join(root, 'packages/compiler-wasm/pkg/holoscript_wasm_bg.wasm'));
    const missing = runGate(root);
    assert.equal(missing.status, 1, shown(missing));
    assert.match(
      missing.stderr,
      /FAIL packages\/compiler-wasm\/pkg: packages\/compiler-wasm\/pkg\/holoscript_wasm_bg\.wasm is missing: a build ships its WASM/
    );
    assert.doesNotMatch(missing.stderr, /FAIL packages\/compiler-wasm\/pkg-node:/);
  });
});

test('fails when a single build is glue with no WASM: a committed artifact is not green without one (P2-1)', () => {
  withRepo(SOLO, (root) => {
    write(root, 'pkg-node/artifact.cjs', NODE_GLUE);
    git(root, ['add', 'pkg-node/artifact.cjs']);
    git(root, ['commit', '-q', '-m', 'glue only']);
    const missing = runGate(root, [...SOLO_NODE, '--artifact-js', 'pkg-node/artifact.cjs']);
    assert.equal(missing.status, 1, shown(missing));
    assert.match(missing.stderr, /pkg-node\/holoscript_wasm_bg\.wasm is missing/);
    assert.doesNotMatch(missing.stdout, /PASS/);
  });
});

test("fails when a build's JS entry is missing (F3)", () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    unlinkSync(join(root, 'packages/compiler-wasm/pkg-node/holoscript_wasm.js'));
    const missing = runGate(root);
    assert.equal(missing.status, 1, shown(missing));
    assert.match(
      missing.stderr,
      /FAIL packages\/compiler-wasm\/pkg-node: the JS entry packages\/compiler-wasm\/pkg-node\/holoscript_wasm\.js is missing/
    );
  });
});

test('fails when a build has no receipt', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    unlinkSync(join(root, 'packages/compiler-wasm/pkg/rebuild-receipt.json'));
    const missing = runGate(root);
    assert.equal(missing.status, 1, shown(missing));
    assert.match(
      missing.stderr,
      /FAIL packages\/compiler-wasm\/pkg: packages\/compiler-wasm\/pkg\/rebuild-receipt\.json is missing/
    );
  });
});

test('fails when the receipt names another digest or another size', () => {
  withRepo(SOLO, (root) => {
    // One character short, as the 2026-09-28 pkg-node receipt was.
    writeBuild(root, '.', 'pkg-node', {
      receipt: { result: { wasmSha256: WASM_SHA.slice(0, 63) } },
    });
    const wrong = runGate(root, SOLO_NODE);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(
      wrong.stderr,
      new RegExp(
        `records wasmSha256 "${WASM_SHA.slice(0, 63)}", but pkg-node/holoscript_wasm_bg\\.wasm hashes to ${WASM_SHA}`
      )
    );

    writeBuild(root, '.', 'pkg-node', { receipt: { result: { wasmBytes: 6 } } });
    const size = runGate(root, SOLO_NODE);
    assert.equal(size.status, 1, shown(size));
    assert.match(
      size.stderr,
      /records wasmBytes 6, but pkg-node\/holoscript_wasm_bg\.wasm is 5 bytes/
    );
  });
});

test('refuses a v1 receipt, which names a commit and no inputs hash, and says to rebuild', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    write(
      root,
      'packages/compiler-wasm/pkg-node/rebuild-receipt.json',
      JSON.stringify({
        schema: 'holoscript.compiler-wasm.pkg-node.rebuild-receipt.v1',
        sourceCommit: head,
        result: { wasmSha256: WASM_SHA, wasmBytes: 5, repeatBuildSha256Matched: null },
      })
    );
    const legacy = runGate(root);
    assert.equal(legacy.status, 1, shown(legacy));
    assert.match(
      legacy.stderr,
      /pkg-node\/rebuild-receipt\.json is a holoscript\.compiler-wasm\.pkg-node\.rebuild-receipt\.v1 receipt: it names a commit but no hash of the Rust build inputs, .* Run `pnpm --filter @holoscript\/wasm run rebuild` and commit both builds\./
    );
  });
});

test('a squash merge keeps the builds green: the commit a receipt names is information, not a check (P2-3)', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    git(root, ['checkout', '-q', '-b', 'side']);
    commitChange(root, 'packages/compiler-wasm/src/lib.rs', LIB_CHANGED, 'the Rust change');
    commitBuilds(root);
    const builtAt = git(root, ['rev-parse', 'HEAD~1']).trim();
    git(root, ['checkout', '-q', 'main']);
    git(root, ['merge', '-q', '--squash', 'side']);
    git(root, ['commit', '-q', '-m', 'the side branch, squashed']);
    const receipt = JSON.parse(
      readFileSync(join(root, 'packages/compiler-wasm/pkg/rebuild-receipt.json'), 'utf8')
    );
    assert.equal(receipt.sourceCommit, builtAt);
    const inHistory = spawnSync('git', ['merge-base', '--is-ancestor', builtAt, 'HEAD'], {
      cwd: root,
    });
    assert.equal(inHistory.status, 1, 'the squash leaves the named commit out of main');
    const ok = runGate(root);
    assert.equal(ok.status, 0, shown(ok));
  });
});

test('fails on a short source commit id, and passes one missing from history when the inputs hash holds', () => {
  withRepo(SOLO, (root) => {
    writeBuild(root, '.', 'pkg-node', { receipt: { sourceCommit: '36bd409ca' } });
    const short = runGate(root, SOLO_NODE);
    assert.equal(short.status, 1, shown(short));
    assert.match(
      short.stderr,
      /sourceCommit must be a full 40-character commit id .*found "36bd409ca"/
    );

    writeBuild(root, '.', 'pkg-node', { receipt: { sourceCommit: '0'.repeat(40) } });
    const elsewhere = runGate(root, SOLO_NODE);
    assert.equal(elsewhere.status, 0, shown(elsewhere));
  });
});

for (const [label, path, content, how] of [
  ['a Rust source', 'packages/compiler-wasm/src/lib.rs', LIB_CHANGED, 'changed'],
  [
    'a new Rust file under src',
    'packages/compiler-wasm/src/extra.rs',
    'pub fn extra() {}\n',
    'new',
  ],
  [
    'the crate Cargo.toml',
    'packages/compiler-wasm/Cargo.toml',
    '[package]\nname = "renamed"\n',
    'changed',
  ],
  [
    'the workspace Cargo.toml, whose release profile shapes the WASM (P2-2)',
    'Cargo.toml',
    WORKSPACE['Cargo.toml'].replace('"z"', '"s"'),
    'changed',
  ],
  [
    'the workspace Cargo.lock (P2-2)',
    'Cargo.lock',
    '# the workspace lock\nversion = 4\n# a bumped dependency\n',
    'changed',
  ],
  [
    'a file the build code embeds (P2-2)',
    'packages/std/src/holo/absorb.hs',
    'export function g(): bool {\n  return false\n}\n',
    'changed',
  ],
]) {
  test(`fails, naming it, when ${label} changes after the build`, () => {
    withRepo(WORKSPACE, (root) => {
      commitBuilds(root);
      commitChange(root, path, content);
      const stale = runGate(root);
      assert.equal(stale.status, 1, shown(stale));
      for (const build of ['pkg-node', 'pkg']) {
        assert.ok(
          stale.stderr.includes(
            `FAIL packages/compiler-wasm/${build}: packages/compiler-wasm/${build}/rebuild-receipt.json was built from other Rust build inputs than this commit holds (${how}: ${path})`
          ),
          shown(stale)
        );
      }
    });
  });
}

test("the member crate's own Cargo.lock and TypeScript under src are not build inputs (P2-2)", () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    commitChange(root, 'packages/compiler-wasm/Cargo.lock', '# edited, and still never read\n');
    commitChange(root, 'packages/compiler-wasm/src/__tests__/api.test.ts', 'export const x = 1;\n');
    const fresh = runGate(root);
    assert.equal(fresh.status, 0, shown(fresh));
  });
});

test("checks each build's inputs: a web build from older inputs fails by name while the Node build passes (F5)", () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    commitChange(root, 'packages/compiler-wasm/src/lib.rs', LIB_CHANGED);
    git(root, ['add', writeBuild(root, CRATE, 'pkg-node')]);
    git(root, ['commit', '-q', '-m', 'only the Node build is redone']);
    const stale = runGate(root);
    assert.equal(stale.status, 1, shown(stale));
    assert.match(
      stale.stderr,
      /FAIL packages\/compiler-wasm\/pkg: packages\/compiler-wasm\/pkg\/rebuild-receipt\.json was built from other Rust build inputs than this commit holds \(changed: packages\/compiler-wasm\/src\/lib\.rs\)/
    );
    assert.doesNotMatch(stale.stderr, /FAIL packages\/compiler-wasm\/pkg-node:/);
    assert.match(stale.stdout, /PASS packages\/compiler-wasm\/pkg-node:/);
  });
});

test('fails when the two builds hold different WASM', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root, CRATE, { pkg: { wasm: Buffer.from([0, 97, 115, 109, 2]) } });
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(
      wrong.stderr,
      /FAIL the builds hold different WASM \(packages\/compiler-wasm\/pkg-node [0-9a-f]{12}, packages\/compiler-wasm\/pkg [0-9a-f]{12}\)/
    );
  });
});

test('pre-commit: a staged Rust change (a new export) passes with a warning, and fails once committed', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    write(
      root,
      'packages/compiler-wasm/src/lib.rs',
      `${WORKSPACE['packages/compiler-wasm/src/lib.rs']}#[wasm_bindgen]\npub fn holo_modules_json() {}\n`
    );
    git(root, ['add', 'packages/compiler-wasm/src/lib.rs']);
    const pending = runGate(root);
    // The build describes HEAD, whose lib.rs has `parse` only: the new export is not asked for yet.
    assert.equal(pending.status, 0, shown(pending));
    assert.match(
      pending.stdout,
      /WARN packages\/compiler-wasm\/pkg-node was built from the Rust build inputs HEAD holds, and the staged ones differ \(changed: packages\/compiler-wasm\/src\/lib\.rs\): this commit leaves it stale until `pnpm --filter @holoscript\/wasm run rebuild` runs on it/
    );
    assert.match(pending.stdout, /built from the Rust build inputs HEAD holds/);
    git(root, ['commit', '-q', '-m', 'the Rust change adds an export']);
    const after = runGate(root);
    assert.equal(after.status, 1, shown(after));
    assert.match(
      after.stderr,
      /was built from other Rust build inputs than this commit holds \(changed: packages\/compiler-wasm\/src\/lib\.rs\)/
    );
  });
});

test('pre-commit: a merge that brings a Rust change with its rebuilt builds passes, and one without them warns', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    git(root, ['checkout', '-q', '-b', 'side']);
    commitChange(root, 'packages/compiler-wasm/src/lib.rs', LIB_CHANGED);
    git(root, ['checkout', '-q', '-b', 'side-rebuilt']);
    commitBuilds(root);
    git(root, ['checkout', '-q', 'main']);
    commitChange(root, 'README.md', 'main moves on\n');

    git(root, ['merge', '--no-commit', '--no-ff', 'side-rebuilt']);
    const withBuilds = runGate(root);
    assert.equal(withBuilds.status, 0, shown(withBuilds));
    assert.doesNotMatch(withBuilds.stdout, /WARN/);
    git(root, ['merge', '--abort']);

    git(root, ['merge', '--no-commit', '--no-ff', 'side']);
    const withoutBuilds = runGate(root);
    assert.equal(withoutBuilds.status, 0, shown(withoutBuilds));
    assert.match(
      withoutBuilds.stdout,
      /WARN packages\/compiler-wasm\/pkg was built from the Rust build inputs HEAD holds/
    );
    git(root, ['commit', '-q', '-m', 'merge side']);
    assert.equal(runGate(root).status, 1);
  });
});

test("pre-commit: fails when one build hashes the staged inputs and the other HEAD's", () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    write(root, 'packages/compiler-wasm/src/lib.rs', LIB_CHANGED);
    git(root, ['add', 'packages/compiler-wasm/src/lib.rs']);
    // Only the Node build is redone from the staged source; the web build still describes HEAD.
    git(root, ['add', writeBuild(root, CRATE, 'pkg-node', { receipt: { rev: null } })]);
    const mixed = runGate(root);
    assert.equal(mixed.status, 1, shown(mixed));
    assert.match(
      mixed.stderr,
      /FAIL the receipts name different Rust build inputs \(packages\/compiler-wasm\/pkg-node [0-9a-f]{12}, packages\/compiler-wasm\/pkg [0-9a-f]{12}\)/
    );
  });
});

test('fails while a Rust build input has an unresolved merge conflict', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    git(root, ['checkout', '-q', '-b', 'side']);
    commitChange(root, 'packages/compiler-wasm/src/lib.rs', `${LIB_CHANGED}fn side() {}\n`);
    git(root, ['checkout', '-q', 'main']);
    commitChange(root, 'packages/compiler-wasm/src/lib.rs', `${LIB_CHANGED}fn main_side() {}\n`);
    git(root, ['merge', '--no-ff', 'side'], { allowFailure: true });
    const conflicted = runGate(root);
    assert.equal(conflicted.status, 1, shown(conflicted));
    assert.match(
      conflicted.stderr,
      /packages\/compiler-wasm\/src\/lib\.rs has an unresolved merge conflict/
    );
  });
});

test('fails when the web build does not export a #[wasm_bindgen] function', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root, CRATE, {
      pkg: { glue: WEB_GLUE.replace('export function parse() {}\n', '') },
    });
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(
      wrong.stderr,
      /FAIL packages\/compiler-wasm\/pkg: packages\/compiler-wasm\/pkg\/holoscript_wasm\.js is missing function export\(s\): parse/
    );
  });
});

test('fails when a build exports every name but its checker throws inside (P3-1)', () => {
  withRepo(WORKSPACE, (root) => {
    const broken = WEB_GLUE.replace(`return ${VERDICTS};`, "throw new Error('glue is broken');");
    commitBuilds(root, CRATE, { pkg: { glue: broken } });
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(
      wrong.stderr,
      /FAIL packages\/compiler-wasm\/pkg: packages\/compiler-wasm\/pkg throws on a valid function: glue is broken/
    );
  });
});

test('fails when a build accepts every program (P3-1)', () => {
  withRepo(WORKSPACE, (root) => {
    const accepting = NODE_GLUE.replace(
      `return ${VERDICTS};`,
      'return JSON.stringify({ valid: true, errors: [] });'
    );
    commitBuilds(root, CRATE, { 'pkg-node': { glue: accepting } });
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(
      wrong.stderr,
      /FAIL packages\/compiler-wasm\/pkg-node: packages\/compiler-wasm\/pkg-node judges a function that returns an unknown name .*; the checker's verdict is invalid, its first error naming missing_name/
    );
  });
});

test("fails when a build's WASM does not instantiate (P3-1)", () => {
  withRepo(WORKSPACE, (root) => {
    const instantiating = `new WebAssembly.Module(require('fs').readFileSync(require('path').join(__dirname, 'holoscript_wasm_bg.wasm')));\n${NODE_GLUE}`;
    commitBuilds(root, CRATE, { 'pkg-node': { glue: instantiating } });
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(
      wrong.stderr,
      /FAIL packages\/compiler-wasm\/pkg-node: packages\/compiler-wasm\/pkg-node does not load: /
    );
  });
});

test('fails when the two builds give different verdicts', () => {
  withRepo(WORKSPACE, (root) => {
    const otherWording = NODE_GLUE.replace(
      'unknown name missing_name',
      'missing_name is not defined'
    );
    commitBuilds(root, CRATE, { 'pkg-node': { glue: otherWording } });
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(wrong.stderr, /FAIL the builds give different verdicts on the smoke programs/);
  });
});

test('fails when a receipt records no repeat build, or a repeat of other bytes (B7)', () => {
  withRepo(SOLO, (root) => {
    writeBuild(root, '.', 'pkg-node', { receipt: { result: { repeatBuildSha256Matched: null } } });
    const none = runGate(root, SOLO_NODE);
    assert.equal(none.status, 1, shown(none));
    assert.match(
      none.stderr,
      /does not record a repeat build that gave this WASM \(repeatBuildSha256Matched null\)/
    );

    writeBuild(root, '.', 'pkg-node', {
      receipt: { result: { repeatBuildWasmSha256: 'f'.repeat(64) } },
    });
    const other = runGate(root, SOLO_NODE);
    assert.equal(other.status, 1, shown(other));
    assert.match(
      other.stderr,
      /does not record a repeat build that gave this WASM \(repeatBuildSha256Matched true\)/
    );
  });
});

test('fails when a receipt records another build recipe, such as a build without the path remaps', () => {
  withRepo(SOLO, (root) => {
    writeBuild(root, '.', 'pkg-node', {
      receipt: {
        recipe: { ...buildRecipe('nodejs', 'pkg-node'), rustflags: [], extraRustflags: [] },
      },
    });
    const wrong = runGate(root, SOLO_NODE);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(
      wrong.stderr,
      /records the recipe \{.*"rustflags":\[\]\}, but build-wasm\.mjs builds with \{.*--remap-path-prefix=<cargo home>=\/cargo-home/
    );
  });
});

test('fails when a receipt was copied from the other build', () => {
  withRepo(WORKSPACE, (root) => {
    commitBuilds(root);
    write(
      root,
      'packages/compiler-wasm/pkg/rebuild-receipt.json',
      readFileSync(join(root, 'packages/compiler-wasm/pkg-node/rebuild-receipt.json'), 'utf8')
    );
    const wrong = runGate(root);
    assert.equal(wrong.status, 1, shown(wrong));
    assert.match(
      wrong.stderr,
      /pkg\/rebuild-receipt\.json has schema "holoscript\.compiler-wasm\.pkg-node\.rebuild-receipt\.v2"; pkg receipts are holoscript\.compiler-wasm\.pkg-web\.rebuild-receipt\.v2/
    );
    assert.match(
      wrong.stderr,
      /pkg\/rebuild-receipt\.json describes "packages\/compiler-wasm\/pkg-node", not packages\/compiler-wasm\/pkg/
    );
  });
});

test('refuses --artifact-js with more than one artifact', () => {
  withRepo(SOLO, (root) => {
    const refused = runGate(root, [
      '--src',
      'src',
      '--artifact',
      'pkg-node',
      '--artifact',
      'pkg',
      '--artifact-js',
      'pkg/holoscript_wasm.js',
    ]);
    assert.equal(refused.status, 2, shown(refused));
    assert.match(refused.stderr, /--artifact-js needs exactly one --artifact/);
  });
});

// The include forms claude3's review fixtures showed the old heuristic missing (P3-3), and the
// control it saw: each embedded file must make the build stale once it changes.
for (const [label, lib, embedded] of [
  [
    'an include before any #[cfg(test)]',
    'const D: &str = include_str!("../decl/absorb.hs");\n#[cfg(test)]\nmod tests {}\n',
    'decl/absorb.hs',
  ],
  [
    'an include after an early single-item #[cfg(test)]',
    '#[cfg(test)]\nuse std::fmt::Write;\nconst D: &str = include_str!("../decl/absorb.hs");\n',
    'decl/absorb.hs',
  ],
  [
    'include_str!(concat!(env!("CARGO_MANIFEST_DIR"), ...))',
    'const D: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/decl/absorb.hs"));\n',
    'decl/absorb.hs',
  ],
  ['include! of Rust code outside src/', 'include!("../decl/table.rs");\n', 'decl/table.rs'],
]) {
  test(`counts ${label} as a build input`, () => {
    withRepo(
      {
        ...SOLO,
        'src/lib.rs': `#[wasm_bindgen]\npub fn parse() {}\n${lib}`,
        'decl/absorb.hs': 'export function f(): bool {\n  return true\n}\n',
        'decl/table.rs': 'const T: u8 = 1;\n',
      },
      (root) => {
        writeBuild(root, '.', 'pkg-node');
        git(root, ['add', 'pkg-node']);
        git(root, ['commit', '-q', '-m', 'the build']);
        assert.equal(runGate(root, SOLO_NODE).status, 0);
        commitChange(root, embedded, `${readFileSync(join(root, embedded), 'utf8')}// changed\n`);
        const stale = runGate(root, SOLO_NODE);
        assert.equal(stale.status, 1, shown(stale));
        assert.ok(stale.stderr.includes(`(changed: ${embedded})`), shown(stale));
      }
    );
  });
}

test('a file only test code embeds is not a build input', () => {
  withRepo(
    {
      ...SOLO,
      'src/lib.rs':
        '#[wasm_bindgen]\npub fn parse() {}\n#[cfg(test)]\nmod tests {\n    const F: &str = include_str!("../decl/fixture.hs");\n}\n',
      'decl/fixture.hs': 'function t() {}\n',
    },
    (root) => {
      writeBuild(root, '.', 'pkg-node');
      git(root, ['add', 'pkg-node']);
      git(root, ['commit', '-q', '-m', 'the build']);
      commitChange(root, 'decl/fixture.hs', 'function t() {}\nfunction u() {}\n');
      const fresh = runGate(root, SOLO_NODE);
      assert.equal(fresh.status, 0, shown(fresh));
    }
  );
});

test('refuses, naming file and line, an include form it cannot read', () => {
  withRepo(
    {
      ...SOLO,
      'src/lib.rs':
        '#[wasm_bindgen]\npub fn parse() {}\nconst P: &str = include_str!(SOME_PATH);\n',
    },
    (root) => {
      const refused = runGate(root, SOLO_NODE);
      assert.equal(refused.status, 1, shown(refused));
      assert.match(
        refused.stderr,
        /src\/lib\.rs:3: include_str!\(SOME_PATH\) cannot be read by the build-input scanner/
      );
    }
  );
});

test('accepts the receipts rebuild writes, until a build input changes', () => {
  withRepo(WORKSPACE, (root) => {
    const scratch = mkdtempSync(join(tmpdir(), 'compiler-wasm-repeat-'));
    try {
      const spawn = (command, args, options) => {
        if (command === 'git') return spawnSync('git', args, options);
        if (args[0] === '--version') return { status: 0, stdout: `${command} 1.0.0\n` };
        if (command === '/tools/wasm-pack' && args[0] === 'build') {
          const target = args[args.indexOf('--target') + 1];
          const out = args[args.indexOf('--out-dir') + 1];
          const outDir = isAbsolute(out) ? out : join(options.cwd, out);
          mkdirSync(outDir, { recursive: true });
          writeFileSync(join(outDir, 'holoscript_wasm_bg.wasm'), WASM);
          writeFileSync(
            join(outDir, 'holoscript_wasm.js'),
            target === 'web' ? WEB_GLUE : NODE_GLUE
          );
          writeFileSync(
            join(outDir, 'package.json'),
            target === 'web' ? '{"type":"module"}\n' : '{}\n'
          );
          return { status: 0 };
        }
        return { status: 127 };
      };
      const errors = [];
      const status = runWasmBuild({
        env: { ...process.env, WASM_PACK_BIN: '/tools/wasm-pack' },
        platform: 'linux',
        spawn,
        cwd: join(root, CRATE),
        log: () => {},
        error: (message) => errors.push(message),
        tmp: scratch,
        rebuild: true,
      });
      assert.equal(status, 0, errors.join('\n'));
      git(root, ['add', `${CRATE}/pkg`, `${CRATE}/pkg-node`]);
      git(root, ['commit', '-q', '-m', 'rebuild']);
      const ok = runGate(root);
      assert.equal(ok.status, 0, shown(ok));
      commitChange(root, 'Cargo.lock', '# the workspace lock\nversion = 4\n# bumped\n');
      const stale = runGate(root);
      assert.equal(stale.status, 1, shown(stale));
      assert.match(stale.stderr, /\(changed: Cargo\.lock\)/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
