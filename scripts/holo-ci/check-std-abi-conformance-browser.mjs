#!/usr/bin/env node
/**
 * Real-browser std ABI conformance runner.
 *
 * Serves the committed `--target web` compiler-wasm artifact and canonical
 * @holoscript/std host binding to a headless Chromium process. Every corpus
 * vector, including hash-bound packaged `.hsplus` handlers, is evaluated inside
 * that browser. Node performs only pin verification, strict result comparison,
 * receipt construction, and local server/browser lifecycle management.
 *
 * Usage:
 *   node scripts/holo-ci/check-std-abi-conformance-browser.mjs
 *     [--out <path>] [--self-test]
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');

function argValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`[std-abi-conformance-browser] MISCONFIGURED — ${flag} requires a value`);
    process.exit(2);
  }
  return resolve(value);
}

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-abi-conformance-browser] FAIL: ${message}`);
  process.exit(1);
}

function misconfigured(message) {
  console.error(`[std-abi-conformance-browser] MISCONFIGURED — ${message}`);
  process.exit(2);
}

function compareValues(actual, expected, tolerance, path, mismatches) {
  if (typeof actual !== typeof expected) {
    mismatches.push(`${path}: type ${typeof actual} vs ${typeof expected}`);
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (actualKeys.join(',') !== expectedKeys.join(',')) {
      mismatches.push(`${path}: keys [${actualKeys}] vs [${expectedKeys}]`);
      return;
    }
    for (const key of expectedKeys) {
      compareValues(actual[key], expected[key], tolerance, `${path}.${key}`, mismatches);
    }
    return;
  }
  if (typeof expected === 'number' && tolerance > 0) {
    if (Math.abs(actual - expected) > tolerance) {
      mismatches.push(`${path}: |${actual} - ${expected}| > ${tolerance}`);
    }
    return;
  }
  if (!Object.is(actual, expected)) {
    mismatches.push(`${path}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
  }
}

function traitNameOf(source) {
  const match = /@trait\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(source);
  if (!match) misconfigured('projection does not declare a top-level @trait');
  return match[1];
}

const generatedDir = join(repoRoot, 'packages', 'std', 'conformance', 'generated');
const projectionPath = join(generatedDir, 'std-abi-conformance.trait.hsplus');
const vectorsPath = join(generatedDir, 'std-abi-vectors.v0.jsonl');
const manifestPath = join(generatedDir, 'manifest.json');
const packagedExecutionPath = join(generatedDir, 'std-abi-packaged-execution.v0.json');
const wasmJsPath = join(repoRoot, 'packages', 'compiler-wasm', 'pkg', 'holoscript_wasm.js');
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
const descriptorPath = join(
  repoRoot,
  'packages',
  'std',
  'conformance',
  'host-abi',
  'std-host-abi.v0.json'
);
const outPath =
  argValue('--out') ??
  join(
    repoRoot,
    'reports',
    'library-coherence',
    `${new Date().toISOString().slice(0, 10)}_std-abi-conformance.browser.v0.json`
  );

for (const path of [
  projectionPath,
  vectorsPath,
  manifestPath,
  packagedExecutionPath,
  wasmJsPath,
  wasmBinaryPath,
  bindingPath,
  descriptorPath,
]) {
  if (!existsSync(path)) misconfigured(`required artifact not found at ${path}`);
}

const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.schema !== 'holoscript.std-abi-conformance-manifest.v0') {
  misconfigured(`unexpected manifest schema ${manifest.schema}`);
}
for (const [relPath, pin] of Object.entries(manifest.files)) {
  const absolute = join(repoRoot, ...relPath.split('/'));
  if (!existsSync(absolute)) fail(`manifest-pinned input missing: ${relPath}`);
  const actual = sha256(readFileSync(absolute));
  if (actual !== pin.sha256) {
    fail(`manifest sha mismatch for ${relPath}: pinned ${pin.sha256}, actual ${actual}`);
  }
}

const projectionBytes = readFileSync(projectionPath);
const vectorsBytes = readFileSync(vectorsPath);
const projectionSource = projectionBytes.toString('utf8');
const vectors = vectorsBytes
  .toString('utf8')
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      misconfigured(`vectors line ${index + 1} is not valid JSON: ${error.message}`);
      return null;
    }
  });
if (vectors.length === 0) misconfigured('vectors file contains no vectors');

const packagedExecution = JSON.parse(readFileSync(packagedExecutionPath, 'utf8'));
if (packagedExecution.schema !== 'holoscript.std-abi-packaged-execution.v0') {
  misconfigured(`unexpected packaged execution schema ${packagedExecution.schema}`);
}
const packagedSources = Object.fromEntries(
  Object.entries(packagedExecution.sources).map(([trait, relPath]) => [
    trait,
    readFileSync(join(repoRoot, ...relPath.split('/')), 'utf8'),
  ])
);

function contentType(pathname) {
  if (pathname.endsWith('.wasm')) return 'application/wasm';
  if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) {
    return 'text/javascript; charset=utf-8';
  }
  return 'text/html; charset=utf-8';
}

async function executeInChromium(runVectors, sources, projection) {
  const routes = new Map([
    ['/', Buffer.from('<!doctype html><title>HoloScript std ABI browser proof</title>')],
    ['/wasm/holoscript_wasm.js', readFileSync(wasmJsPath)],
    ['/wasm/holoscript_wasm_bg.wasm', readFileSync(wasmBinaryPath)],
    ['/std/std-host-binding.mjs', readFileSync(bindingPath)],
  ]);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const bytes = routes.get(pathname);
    if (!bytes) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': contentType(pathname),
      'cache-control': 'no-store',
      'cross-origin-resource-policy': 'same-origin',
    });
    response.end(bytes);
  });

  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    misconfigured('local browser proof server did not bind a TCP port');
  }
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const browserVersion = browser.version();
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(origin, { waitUntil: 'networkidle' });
    const browserRun = await page.evaluate(
      async ({ runVectors: pageVectors, sources: pageSources, projection: pageProjection }) => {
        const wasm = await import('/wasm/holoscript_wasm.js');
        const std = await import('/std/std-host-binding.mjs');
        await wasm.default();
        if (typeof wasm.evaluate_trait_handler_v6 !== 'function') {
          throw new Error('web artifact does not export evaluate_trait_handler_v6');
        }
        const hostBindings = std.createStdHostBindings();
        const projectionTrait = /@trait\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(
          pageProjection
        )?.[1];
        if (!projectionTrait) throw new Error('projection trait name is absent');
        const results = pageVectors.map((vector) => {
          const source = vector.packaged ? pageSources[vector.trait] : pageProjection;
          const trait = vector.packaged ? vector.trait : projectionTrait;
          if (!source) {
            return { id: vector.id, op: vector.op, error: `source absent for ${trait}` };
          }
          try {
            const envelope = JSON.parse(
              wasm.evaluate_trait_handler_v6(
                source,
                trait,
                vector.op,
                JSON.stringify(vector.args ?? {}),
                hostBindings
              )
            );
            if (!envelope || envelope.ok !== true) {
              return {
                id: vector.id,
                op: vector.op,
                error: `${envelope?.error?.code ?? 'unknown'}: ${
                  envelope?.error?.message ?? 'no error payload'
                }`,
              };
            }
            return { id: vector.id, op: vector.op, actual: envelope.value };
          } catch (error) {
            return { id: vector.id, op: vector.op, error: String(error?.message ?? error) };
          }
        });
        return {
          results,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          webAssemblyAvailable: typeof WebAssembly === 'object',
        };
      },
      { runVectors, sources, projection }
    );
    return { ...browserRun, browserVersion, consoleErrors };
  } finally {
    await browser?.close();
    await new Promise((accept) => server.close(accept));
  }
}

function compareBrowserResults(runVectors, rawResults, expectedOverrides = new Map()) {
  const byId = new Map(rawResults.map((result) => [result.id, result]));
  return runVectors.map((vector) => {
    const raw = byId.get(vector.id);
    const expected = expectedOverrides.get(vector.id) ?? vector.expected;
    const outcome = {
      id: vector.id,
      op: vector.op,
      pass: false,
      expectedHash: sha256(Buffer.from(JSON.stringify(expected))),
      ...(vector.packaged ? { packaged: true, trait: vector.trait } : {}),
    };
    if (!raw) {
      outcome.error = 'browser returned no result';
      return outcome;
    }
    if (raw.error) {
      outcome.error = raw.error;
      return outcome;
    }
    outcome.actual = raw.actual;
    const mismatches = [];
    compareValues(raw.actual, expected, vector.tolerance ?? 0, 'value', mismatches);
    outcome.pass = mismatches.length === 0;
    if (!outcome.pass) outcome.mismatches = mismatches;
    return outcome;
  });
}

if (selfTest) {
  const fixtureProjection = [
    '@trait self_test_conformance {',
    '  @on_clamp(value, lo, hi) => {',
    '    return { value: math.clamp(value, lo, hi) }',
    '  }',
    '}',
    '',
  ].join('\n');
  const fixture = {
    id: 'self-test-browser-host-clamp',
    op: 'on_clamp',
    args: { value: 42, lo: 0, hi: 10 },
    expected: { value: 10 },
    tolerance: 0,
  };
  const browserRun = await executeInChromium([fixture], {}, fixtureProjection);
  const good = compareBrowserResults([fixture], browserRun.results)[0];
  const bad = compareBrowserResults(
    [fixture],
    browserRun.results,
    new Map([[fixture.id, { value: 6 }]])
  )[0];
  if (!good.pass || bad.pass || !browserRun.webAssemblyAvailable) {
    misconfigured(
      `self-test failed: clean=${good.pass}, poisoned=${bad.pass}, wasm=${browserRun.webAssemblyAvailable}`
    );
  }
  console.log(
    `[std-abi-conformance-browser] self-test OK in Chromium ${browserRun.browserVersion}: WebAssembly host-bound vector passed and poisoned expectation went red`
  );
  process.exit(0);
}

traitNameOf(projectionSource);
const browserRun = await executeInChromium(vectors, packagedSources, projectionSource);
const results = compareBrowserResults(vectors, browserRun.results);
const failed = results.filter((result) => !result.pass);
const opsDefinition = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'std', 'conformance', 'std-abi-ops.v0.json'), 'utf8')
);
const wasmSha = sha256(readFileSync(wasmBinaryPath));

const receipt = {
  schema: 'holoscript.std-abi-conformance.browser.v0',
  generatedAtISO: new Date().toISOString(),
  target: 'browser-wasm',
  executionRuntime: 'chromium-webassembly',
  wasmArtifact: {
    path: 'packages/compiler-wasm/pkg',
    sha256: wasmSha,
  },
  evaluatorExport: 'evaluate_trait_handler_v6',
  subsetId: 'holoscript-engine-hsplus-deterministic-action-subset-v6-null-coalescing',
  packagedExecution: {
    evaluatorExport: 'evaluate_trait_handler_v6',
    subsetId: packagedExecution.wasmSubsetId,
    sources: Object.fromEntries(
      Object.entries(packagedExecution.sources).map(([trait, relPath]) => [
        relPath,
        { trait, sha256: sha256(readFileSync(join(repoRoot, ...relPath.split('/')))) },
      ])
    ),
    vectors: results.filter((result) => result.packaged).length,
    claim: packagedExecution.claim,
  },
  hostAbi: {
    schema: 'holoscript.std-host-abi.v0',
    bindingModuleSha256: sha256(readFileSync(bindingPath)),
    descriptorSha256: sha256(readFileSync(descriptorPath)),
  },
  sources: {
    traitProjectionSha256: sha256(projectionBytes),
    vectorsSha256: sha256(vectorsBytes),
    manifestSha256: sha256(manifestBytes),
    'packages/std/conformance/generated/std-abi-conformance.trait.hsplus': {
      sha256: sha256(projectionBytes),
    },
    'packages/std/conformance/generated/std-abi-vectors.v0.jsonl': {
      sha256: sha256(vectorsBytes),
    },
  },
  environment: {
    browser: 'chromium',
    browserVersion: browserRun.browserVersion,
    userAgent: browserRun.userAgent,
    browserPlatform: browserRun.platform,
    webAssemblyAvailable: browserRun.webAssemblyAvailable,
    launcherNode: process.version,
    launcherArch: process.arch,
    launcherPlatform: process.platform,
  },
  browserConsoleErrors: browserRun.consoleErrors,
  summary: {
    vectors: vectors.length,
    passed: results.length - failed.length,
    failed: failed.length,
    excludedOps: opsDefinition.excluded ?? [],
  },
  results,
  claimBoundary: {
    provesBrowserExecution: true,
    note: 'Executed by a real headless Chromium process importing the committed web-target wasm module and canonical dependency-free @holoscript/std host binding over a loopback HTTP origin.',
  },
};
const receiptForHash = { ...receipt };
delete receiptForHash.receiptHash;
receipt.receiptHash = sha256(Buffer.from(JSON.stringify(receiptForHash)));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);

if (failed.length > 0 || browserRun.consoleErrors.length > 0) {
  for (const result of failed.slice(0, 10)) {
    console.error(
      `  x ${result.id} (${result.op}) — ${result.error ?? result.mismatches?.join('; ')}`
    );
  }
  for (const error of browserRun.consoleErrors) console.error(`  browser console: ${error}`);
  fail(
    `${failed.length}/${vectors.length} vectors failed with ${browserRun.consoleErrors.length} browser console error(s); receipt at ${outPath}`
  );
}

console.log(
  `[std-abi-conformance-browser] OK: ${results.length}/${vectors.length} vectors passed in Chromium ${browserRun.browserVersion} using WebAssembly ${wasmSha.slice(7, 19)}…; receipt at ${outPath}`
);
