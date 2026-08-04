#!/usr/bin/env node
/** Self-contained owned-metal lifecycle runner; no npm install is required. */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const bundleDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);

function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-lifecycle-effect-owned-metal] FAIL: ${message}`);
  process.exit(1);
}

const manifest = JSON.parse(
  readFileSync(join(bundleDir, 'bundle-manifest.json'), 'utf8')
);
if (
  manifest.schema !== 'holoscript.std-lifecycle-effect-owned-metal-bundle.v0' ||
  !/^[0-9a-f]{40}$/.test(manifest.sourceCommit ?? '')
) {
  fail('bundle manifest schema or source commit is invalid');
}
for (const [name, pin] of Object.entries(manifest.files)) {
  const actual = sha256(readFileSync(join(bundleDir, ...name.split('/'))));
  if (actual !== pin.sha256) {
    fail(`${name}: expected ${pin.sha256}, got ${actual}`);
  }
}
const vectors = JSON.parse(
  readFileSync(join(bundleDir, 'std-lifecycle-effects.v0.json'), 'utf8')
);
const wasm = require(join(bundleDir, 'pkg-node', 'holoscript_wasm.js'));
if (typeof wasm.evaluate_trait_spawn_v1 !== 'function') {
  fail('bundle wasm does not export evaluate_trait_spawn_v1');
}
const { createStdHostBindings } = await import(
  pathToFileURL(join(bundleDir, 'std-host-binding.mjs')).href
);
const hostBindings = createStdHostBindings();
const sources = Object.fromEntries(
  Object.entries(manifest.packagedSources).map(([repoPath, bundleName]) => [
    repoPath,
    readFileSync(join(bundleDir, bundleName), 'utf8'),
  ])
);
const results = vectors.vectors.map((vector) => {
  try {
    const envelope = JSON.parse(
      wasm.evaluate_trait_spawn_v1(
        sources[vector.source],
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
      pass: isDeepStrictEqual(envelope.value, vector.expected),
      actual: envelope.value,
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
});
const failed = results.filter((result) => !result.pass);
const receipt = {
  schema: 'holoscript.std-lifecycle-effect-conformance.owned-metal.v0',
  generatedAtISO: new Date().toISOString(),
  target: 'owned-metal',
  hostLabel: argValue('--host-label', 'owned-metal'),
  subsetId: vectors.vectors[0]?.expected?.subsetId,
  sources: {
    'packages/std/conformance/generated/std-lifecycle-effects.v0.json': {
      sha256:
        manifest.files['std-lifecycle-effects.v0.json'].sha256,
    },
  },
  executionRuntime: {
    engine: '@holoscript/wasm evaluate_trait_spawn_v1 in owned-metal Node WebAssembly',
    sourceCommit: manifest.sourceCommit,
    wasmSha256:
      manifest.files['pkg-node/holoscript_wasm_bg.wasm'].sha256,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  environment: {
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
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
      'Commit-bound packaged on_spawn bytes evaluated to ordered inert lifecycle intents on the named owned-metal host.',
    notClaimed:
      'No event was dispatched and no host function, timer, asynchronous work, I/O, retry, rollback, or runtime mutation was executed.',
  },
};
const outPath = resolve(
  argValue('--out', join(bundleDir, 'owned-metal-receipt.json'))
);
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (failed.length) fail(`${failed.length} vector(s) failed; receipt at ${outPath}`);
console.log(
  `[std-lifecycle-effect-owned-metal] OK: ${results.length}/${results.length}; ${outPath}`
);
