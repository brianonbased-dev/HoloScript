#!/usr/bin/env node
/** Execute the packaged lifecycle corpus through the Node WebAssembly artifact. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import os from 'node:os';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');

function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? resolve(args[index + 1]) : fallback;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-lifecycle-effect-wasm] FAIL: ${message}`);
  process.exit(1);
}

const vectorsRel =
  'packages/std/conformance/generated/std-lifecycle-effects.v0.json';
const vectorsPath = join(repoRoot, ...vectorsRel.split('/'));
const manifest = JSON.parse(
  readFileSync(
    join(repoRoot, 'packages', 'std', 'conformance', 'generated', 'manifest.json'),
    'utf8'
  )
);
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf8'));
const wasmJsPath = join(
  repoRoot,
  'packages',
  'compiler-wasm',
  'pkg-node',
  'holoscript_wasm.js'
);
const wasmBinaryPath = join(
  repoRoot,
  'packages',
  'compiler-wasm',
  'pkg-node',
  'holoscript_wasm_bg.wasm'
);
for (const path of [wasmJsPath, wasmBinaryPath]) {
  if (!existsSync(path)) fail(`wasm artifact absent: ${path}`);
}
for (const relPath of [
  vectorsRel,
  vectors.descriptor,
  ...new Set(vectors.vectors.map((vector) => vector.source)),
]) {
  const actual = sha256(readFileSync(join(repoRoot, ...relPath.split('/'))));
  const expected = manifest.files?.[relPath]?.sha256;
  if (!expected || actual !== expected) {
    fail(`${relPath}: expected manifest pin ${expected}, got ${actual}`);
  }
}
const wasm = require(wasmJsPath);
if (typeof wasm.evaluate_trait_spawn_v1 !== 'function') {
  fail('pkg-node artifact does not export evaluate_trait_spawn_v1');
}
const { createStdHostBindings } = await import(
  pathToFileURL(
    join(
      repoRoot,
      'packages',
      'std',
      'conformance',
      'host-abi',
      'std-host-binding.mjs'
    )
  ).href
);
const hostBindings = createStdHostBindings();

function execute(vector, expected = vector.expected) {
  try {
    const envelope = JSON.parse(
      wasm.evaluate_trait_spawn_v1(
        readFileSync(join(repoRoot, ...vector.source.split('/')), 'utf8'),
        vector.trait,
        hostBindings
      )
    );
    if (envelope.ok !== true) {
      return {
        id: vector.id,
        trait: vector.trait,
        pass: false,
        error: `${envelope.error?.code}: ${envelope.error?.message}`,
      };
    }
    return {
      id: vector.id,
      trait: vector.trait,
      pass: isDeepStrictEqual(envelope.value, expected),
      actual: envelope.value,
      expectedSha256: sha256(Buffer.from(JSON.stringify(expected))),
      actualSha256: sha256(Buffer.from(JSON.stringify(envelope.value))),
    };
  } catch (error) {
    return {
      id: vector.id,
      trait: vector.trait,
      pass: false,
      error: String(error?.message ?? error),
    };
  }
}

if (selfTest) {
  const sample = vectors.vectors[0];
  const good = execute(sample);
  const bad = execute(sample, { ...sample.expected, result: 'poisoned' });
  if (!good.pass || bad.pass) {
    fail(`self-test comparator failed: clean=${good.pass}, poisoned=${bad.pass}`);
  }
  console.log('[std-lifecycle-effect-wasm] self-test OK');
  process.exit(0);
}

const outPath = argValue(
  '--out',
  join(
    repoRoot,
    'reports',
    'library-coherence',
    '2026-07-30_std-lifecycle-effect-conformance.wasm.v0.json'
  )
);
const results = vectors.vectors.map((vector) => execute(vector));
const failed = results.filter((result) => !result.pass);
const receipt = {
  schema: 'holoscript.std-lifecycle-effect-conformance.wasm.v0',
  generatedAtISO: new Date().toISOString(),
  target: 'node-wasm',
  subsetId: manifest.lifecycleEffect.subsetId,
  sources: {
    [vectorsRel]: { sha256: manifest.files[vectorsRel].sha256 },
  },
  executionRuntime: {
    engine: '@holoscript/wasm evaluate_trait_spawn_v1 in Node WebAssembly',
    wasmSha256: sha256(readFileSync(wasmBinaryPath)),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  environment: { hostname: os.hostname() },
  results,
  summary: {
    vectors: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    dispatched: false,
  },
  claimBoundary: {
    proved:
      'Actual packaged on_spawn source bytes crossed the WebAssembly boundary and evaluated to ordered inert lifecycle intents.',
    notClaimed:
      'No event was dispatched and no host function, timer, asynchronous work, I/O, retry, rollback, or runtime mutation was executed.',
  },
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (failed.length) fail(`${failed.length} vector(s) failed; receipt at ${outPath}`);
console.log(`[std-lifecycle-effect-wasm] OK: ${results.length}/${results.length}; ${outPath}`);
