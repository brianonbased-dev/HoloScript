#!/usr/bin/env node
/** Execute the packaged lifecycle corpus through the shipped engine runtime. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  console.error(`[std-lifecycle-effect-node] FAIL: ${message}`);
  process.exit(1);
}

const vectorsRel =
  'packages/std/conformance/generated/std-lifecycle-effects.v0.json';
const manifestPath = join(
  repoRoot,
  'packages',
  'std',
  'conformance',
  'generated',
  'manifest.json'
);
const outPath = argValue(
  '--out',
  join(
    repoRoot,
    'reports',
    'library-coherence',
    '2026-07-30_std-lifecycle-effect-conformance.node.v0.json'
  )
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const vectors = JSON.parse(readFileSync(join(repoRoot, ...vectorsRel.split('/')), 'utf8'));
if (vectors.schema !== 'holoscript.std-lifecycle-effect-vectors.v0') {
  fail(`unexpected vectors schema ${vectors.schema}`);
}
for (const relPath of [
  vectorsRel,
  vectors.descriptor,
  ...new Set(vectors.vectors.map((vector) => vector.source)),
]) {
  const path = join(repoRoot, ...relPath.split('/'));
  if (!existsSync(path)) fail(`pinned input missing: ${relPath}`);
  const actual = sha256(readFileSync(path));
  const expected = manifest.files?.[relPath]?.sha256;
  if (!expected || actual !== expected) {
    fail(`${relPath}: expected manifest pin ${expected}, got ${actual}`);
  }
}

const engine = require(
  join(repoRoot, 'packages', 'engine', 'dist', 'runtime', 'index.cjs')
);
if (typeof engine.createDeterministicHsplusTraitRuntime !== 'function') {
  fail('engine dist does not export createDeterministicHsplusTraitRuntime');
}
const { createStdHostBindings } = await import(
  new URL('../../packages/std/conformance/host-abi/std-host-binding.mjs', import.meta.url)
);
const hostBindings = createStdHostBindings();

function execute(vector, expected = vector.expected) {
  try {
    const runtime = engine.createDeterministicHsplusTraitRuntime(
      readFileSync(join(repoRoot, ...vector.source.split('/')), 'utf8'),
      vector.trait,
      { hostBindings }
    );
    const actual = runtime.invokeLifecycle();
    return {
      id: vector.id,
      trait: vector.trait,
      pass: isDeepStrictEqual(actual, expected),
      actual,
      expectedSha256: sha256(Buffer.from(JSON.stringify(expected))),
      actualSha256: sha256(Buffer.from(JSON.stringify(actual))),
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
  const bad = execute(sample, {
    ...sample.expected,
    dispatched: true,
  });
  if (!good.pass || bad.pass) {
    fail(`self-test comparator failed: clean=${good.pass}, poisoned=${bad.pass}`);
  }
  console.log('[std-lifecycle-effect-node] self-test OK');
  process.exit(0);
}

const results = vectors.vectors.map((vector) => execute(vector));
const failed = results.filter((result) => !result.pass);
const receipt = {
  schema: 'holoscript.std-lifecycle-effect-conformance.node.v0',
  generatedAtISO: new Date().toISOString(),
  target: 'node',
  subsetId: manifest.lifecycleEffect.subsetId,
  sources: {
    [vectorsRel]: { sha256: manifest.files[vectorsRel].sha256 },
  },
  executionRuntime: {
    engine: '@holoscript/engine DeterministicHsplusTraitRuntime.invokeLifecycle',
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  environment: {
    hostname: os.hostname(),
  },
  results,
  summary: {
    vectors: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    dispatched: false,
  },
  claimBoundary: {
    proved:
      'Actual packaged on_spawn source bytes evaluated to ordered inert lifecycle intents in the engine runtime.',
    notClaimed:
      'No event was dispatched and no host function, timer, asynchronous work, I/O, retry, rollback, or runtime mutation was executed.',
  },
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (failed.length) fail(`${failed.length} vector(s) failed; receipt at ${outPath}`);
console.log(`[std-lifecycle-effect-node] OK: ${results.length}/${results.length}; ${outPath}`);
