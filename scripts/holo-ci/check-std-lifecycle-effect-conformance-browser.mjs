#!/usr/bin/env node
/** Execute the packaged lifecycle corpus in real headless Chromium WebAssembly. */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from 'playwright';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
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
  console.error(`[std-lifecycle-effect-browser] FAIL: ${message}`);
  process.exit(1);
}

const vectorsRel =
  'packages/std/conformance/generated/std-lifecycle-effects.v0.json';
const vectors = JSON.parse(
  readFileSync(join(repoRoot, ...vectorsRel.split('/')), 'utf8')
);
const manifest = JSON.parse(
  readFileSync(
    join(repoRoot, 'packages', 'std', 'conformance', 'generated', 'manifest.json'),
    'utf8'
  )
);
const wasmJsPath = join(
  repoRoot,
  'packages',
  'compiler-wasm',
  'pkg',
  'holoscript_wasm.js'
);
const wasmBinaryPath = join(
  repoRoot,
  'packages',
  'compiler-wasm',
  'pkg',
  'holoscript_wasm_bg.wasm'
);
const bindingPath = join(
  repoRoot,
  'packages',
  'std',
  'conformance',
  'host-abi',
  'std-host-binding.mjs'
);
for (const path of [wasmJsPath, wasmBinaryPath, bindingPath]) {
  if (!existsSync(path)) fail(`required browser artifact absent: ${path}`);
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
const sources = Object.fromEntries(
  [...new Set(vectors.vectors.map((vector) => vector.source))].map((relPath) => [
    relPath,
    readFileSync(join(repoRoot, ...relPath.split('/')), 'utf8'),
  ])
);
const routes = new Map([
  ['/', Buffer.from('<!doctype html><title>HoloScript lifecycle proof</title>')],
  ['/wasm/holoscript_wasm.js', readFileSync(wasmJsPath)],
  ['/wasm/holoscript_wasm_bg.wasm', readFileSync(wasmBinaryPath)],
  ['/std/std-host-binding.mjs', readFileSync(bindingPath)],
]);
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const bytes = routes.get(pathname);
  if (!bytes) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    'content-type': pathname.endsWith('.wasm')
      ? 'application/wasm'
      : pathname.endsWith('.js') || pathname.endsWith('.mjs')
        ? 'text/javascript; charset=utf-8'
        : 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(bytes);
});
await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', accept);
});
const address = server.address();
if (!address || typeof address === 'string') fail('browser proof server did not bind');

let browser;
let browserVersion;
let rawResults;
try {
  browser = await chromium.launch({ headless: true });
  browserVersion = browser.version();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}`, {
    waitUntil: 'networkidle',
  });
  rawResults = await page.evaluate(
    async ({ pageVectors, pageSources }) => {
      const wasm = await import('/wasm/holoscript_wasm.js');
      const std = await import('/std/std-host-binding.mjs');
      await wasm.default();
      if (typeof wasm.evaluate_trait_spawn_v1 !== 'function') {
        throw new Error('web artifact does not export evaluate_trait_spawn_v1');
      }
      const hostBindings = std.createStdHostBindings();
      return pageVectors.map((vector) => {
        try {
          const envelope = JSON.parse(
            wasm.evaluate_trait_spawn_v1(
              pageSources[vector.source],
              vector.trait,
              hostBindings
            )
          );
          return envelope.ok
            ? { id: vector.id, trait: vector.trait, actual: envelope.value }
            : {
                id: vector.id,
                trait: vector.trait,
                error: `${envelope.error?.code}: ${envelope.error?.message}`,
              };
        } catch (error) {
          return {
            id: vector.id,
            trait: vector.trait,
            error: String(error?.message ?? error),
          };
        }
      });
    },
    { pageVectors: vectors.vectors, pageSources: sources }
  );
} finally {
  if (browser) await browser.close();
  await new Promise((accept) => server.close(accept));
}

function compare(raw, vector, expected = vector.expected) {
  return {
    ...raw,
    pass: !raw.error && isDeepStrictEqual(raw.actual, expected),
    ...(raw.actual
      ? { actualSha256: sha256(Buffer.from(JSON.stringify(raw.actual))) }
      : {}),
  };
}
if (selfTest) {
  const good = compare(rawResults[0], vectors.vectors[0]);
  const bad = compare(rawResults[0], vectors.vectors[0], {
    ...vectors.vectors[0].expected,
    handler: 'poisoned',
  });
  if (!good.pass || bad.pass) {
    fail(`self-test comparator failed: clean=${good.pass}, poisoned=${bad.pass}`);
  }
  console.log('[std-lifecycle-effect-browser] self-test OK');
  process.exit(0);
}
const results = rawResults.map((raw, index) =>
  compare(raw, vectors.vectors[index])
);
const failed = results.filter((result) => !result.pass);
const outPath = argValue(
  '--out',
  join(
    repoRoot,
    'reports',
    'library-coherence',
    '2026-07-30_std-lifecycle-effect-conformance.browser.v0.json'
  )
);
const receipt = {
  schema: 'holoscript.std-lifecycle-effect-conformance.browser.v0',
  generatedAtISO: new Date().toISOString(),
  target: 'browser-wasm',
  subsetId: manifest.lifecycleEffect.subsetId,
  sources: {
    [vectorsRel]: { sha256: manifest.files[vectorsRel].sha256 },
  },
  executionRuntime: {
    engine: '@holoscript/wasm evaluate_trait_spawn_v1 in headless Chromium',
    browser: `Chromium ${browserVersion}`,
    wasmSha256: sha256(readFileSync(wasmBinaryPath)),
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
      'Actual packaged on_spawn source bytes evaluated to ordered inert lifecycle intents inside Chromium WebAssembly.',
    notClaimed:
      'No event was dispatched and no host function, timer, asynchronous work, I/O, retry, rollback, or runtime mutation was executed.',
  },
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
if (failed.length) fail(`${failed.length} vector(s) failed; receipt at ${outPath}`);
console.log(`[std-lifecycle-effect-browser] OK: ${results.length}/${results.length}; ${outPath}`);
