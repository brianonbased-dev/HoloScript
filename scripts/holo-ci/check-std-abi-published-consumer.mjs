#!/usr/bin/env node
/**
 * Published-surface std ABI consumer check.
 *
 * Creates a fresh temporary consumer, installs the named PUBLISHED versions of
 * @holoscript/wasm and @holoscript/std from the public npm registry (scripts
 * disabled, no local source paths), then executes shipped packaged handlers
 * from the installed bytes through the wasm evaluator's highest
 * packaged-capable export (v6 preferred, v5 fallback): pure arithmetic,
 * numeric builtins, a host-binding delegation, and a null-coalescing default. Proves the published artifacts carry the evaluator
 * chain and the executable native sources; writes a durable receipt.
 *
 * The canonical host-binding module ships in the repository, not (yet) in the
 * std tarball, so this check inlines a minimal math/list host binding whose
 * semantics mirror packages/std/conformance/host-abi/std-host-binding.mjs and
 * records that boundary in the receipt.
 *
 * Usage:
 *   node scripts/holo-ci/check-std-abi-published-consumer.mjs
 *     [--wasm-version <v>] [--std-version <v>] [--out <path>] [--keep]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const wasmVersion = flagValue('--wasm-version', '6.1.14');
const stdVersion = flagValue('--std-version', '7.0.11');
const outPath = resolve(
  flagValue(
    '--out',
    join(repoRoot, 'reports', 'library-coherence', '2026-07-28_std-abi-published-consumer.v0.json')
  )
);
const keep = args.includes('--keep');

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-abi-published-consumer] FAIL: ${message}`);
  process.exit(1);
}

const consumerDir = mkdtempSync(join(tmpdir(), 'std-abi-published-'));
const checks = [];
let verdict = 'FAILED';

try {
  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify({ name: 'std-abi-published-consumer', private: true, version: '0.0.0' }, null, 2)
  );
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--registry',
      'https://registry.npmjs.org/',
      `@holoscript/wasm@${wasmVersion}`,
      `@holoscript/std@${stdVersion}`,
    ],
    { cwd: consumerDir, stdio: 'pipe', timeout: 300000, shell: process.platform === 'win32' }
  );

  const require = createRequire(join(consumerDir, 'noop.js'));
  const wasm = require(
    join(consumerDir, 'node_modules', '@holoscript', 'wasm', 'pkg-node', 'holoscript_wasm.js')
  );
  const stdRoot = join(consumerDir, 'node_modules', '@holoscript', 'std');
  const mathSource = readFileSync(join(stdRoot, 'src', 'math.hsplus'), 'utf8');
  const collectionsSource = readFileSync(join(stdRoot, 'src', 'collections.hsplus'), 'utf8');
  const installedWasm = readFileSync(
    join(consumerDir, 'node_modules', '@holoscript', 'wasm', 'pkg-node', 'holoscript_wasm_bg.wasm')
  );

  const evaluatorExport =
    typeof wasm.evaluate_trait_handler_v6 === 'function'
      ? 'evaluate_trait_handler_v6'
      : 'evaluate_trait_handler_v5';
  if (typeof wasm[evaluatorExport] !== 'function') {
    fail('published @holoscript/wasm has no packaged-capable evaluator export');
  }

  const bindings = {
    math: {
      clamp: (value, lo, hi) => Math.max(lo, Math.min(hi, value)),
      lerp: (a, b, t) => a + (b - a) * t,
      quat_slerp: null,
    },
    list_lib: {
      list_range: (start, end, step) => {
        const out = [];
        for (let i = start; step > 0 ? i < end : i > end; i += step) out.push(i);
        return out;
      },
    },
    // The collections factory builds a union handle over all three namespaces,
    // so they must exist even when a check only exercises list functions.
    map_lib: {},
    set_lib: {},
  };
  delete bindings.math.quat_slerp;

  const cases = [
    {
      id: 'published-pure-lerp',
      source: 'math',
      trait: 'std_math',
      handler: 'on_lerp',
      args: { a: 0, b: 10, t: 0.5 },
      expect: 5,
    },
    {
      id: 'published-builtin-vec3-length',
      source: 'math',
      trait: 'std_math',
      handler: 'on_vec3_length',
      args: { v: { x: 3, y: 4, z: 0 } },
      expect: 5,
    },
    {
      id: 'published-host-clamp',
      source: 'math',
      trait: 'std_math',
      handler: 'on_clamp',
      args: { value: 42, min: 0, max: 10 },
      expect: 10,
    },
    {
      id: 'published-coalesced-range',
      source: 'collections',
      trait: 'std_list',
      handler: 'on_range',
      args: { start: 0, end: 3, step: null },
      expect: [0, 1, 2],
    },
  ];

  for (const testCase of cases) {
    const raw = wasm[evaluatorExport](
      testCase.source === 'math' ? mathSource : collectionsSource,
      testCase.trait,
      testCase.handler,
      JSON.stringify(testCase.args),
      bindings
    );
    const envelope = JSON.parse(raw);
    const pass =
      envelope.ok === true && JSON.stringify(envelope.value) === JSON.stringify(testCase.expect);
    checks.push({ ...testCase, pass, actual: envelope.ok ? envelope.value : envelope.error });
    if (!pass) console.error(`  x ${testCase.id}: ${raw}`);
  }

  verdict = checks.every((check) => check.pass) ? 'OK' : 'FAILED';

  const receipt = {
    schema: 'holoscript.std-abi-published-consumer.v0',
    generatedAtISO: new Date().toISOString(),
    verdict,
    localSourceUsed: false,
    registry: 'https://registry.npmjs.org/',
    packages: {
      '@holoscript/wasm': { version: wasmVersion, installedWasmSha256: sha256(installedWasm) },
      '@holoscript/std': {
        version: stdVersion,
        installedMathHsplusSha256: sha256(Buffer.from(mathSource)),
        installedCollectionsHsplusSha256: sha256(Buffer.from(collectionsSource)),
      },
    },
    evaluatorExport,
    checks,
    claimBoundary: {
      provesPublishedEvaluatorChain: verdict === 'OK',
      provesPublishedPackagedSourcesExecute: verdict === 'OK',
      hostBindings:
        'minimal inline binding mirroring the repo-canonical std-host-binding.mjs; the canonical binding module is repository-tracked and not yet published',
      note: 'Executed in a fresh temporary consumer with install scripts disabled and no local source paths.',
    },
  };
  const receiptForHash = { ...receipt };
  delete receiptForHash.receiptHash;
  receipt.receiptHash = sha256(Buffer.from(JSON.stringify(receiptForHash)));

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  if (!keep) rmSync(consumerDir, { recursive: true, force: true });
}

if (verdict !== 'OK') fail(`published-consumer checks failed; receipt at ${outPath}`);
console.log(
  `[std-abi-published-consumer] OK: @holoscript/wasm@${wasmVersion} + @holoscript/std@${stdVersion} execute the packaged std handlers from published bytes; receipt at ${outPath}`
);
