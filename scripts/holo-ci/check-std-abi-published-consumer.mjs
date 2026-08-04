#!/usr/bin/env node
/**
 * Fresh-consumer std ABI check.
 *
 * Installs @holoscript/wasm and @holoscript/std into a new temporary project
 * with lifecycle scripts disabled, verifies every conformance file against the
 * manifest shipped inside @holoscript/std, imports the published canonical
 * host binding, and executes the complete projection + packaged-source corpus
 * through the installed WebAssembly evaluator. No repository source, inline
 * host mirror, or workspace dependency participates in execution.
 *
 * Registry usage:
 *   node scripts/holo-ci/check-std-abi-published-consumer.mjs
 *     [--wasm-version <v>] [--std-version <v>] [--out <path>] [--keep]
 *
 * Pre-publish tarball usage:
 *   node scripts/holo-ci/check-std-abi-published-consumer.mjs
 *     --std-spec <path-to-tgz> [--wasm-spec <package-spec>]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const wasmVersion = flagValue('--wasm-version', '6.1.14');
const stdVersion = flagValue('--std-version', '7.0.12');
const wasmSpec = flagValue('--wasm-spec', `@holoscript/wasm@${wasmVersion}`);
const stdSpec = flagValue('--std-spec', `@holoscript/std@${stdVersion}`);
const outPath = resolve(
  flagValue(
    '--out',
    join(
      repoRoot,
      'reports',
      'library-coherence',
      `${new Date().toISOString().slice(0, 10)}_std-abi-published-consumer.v1.json`
    )
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
  if (!match) fail('published trait projection does not declare a top-level @trait');
  return match[1];
}

const consumerDir = mkdtempSync(join(tmpdir(), 'std-abi-published-'));
let verdict = 'FAILED';

try {
  writeFileSync(
    join(consumerDir, 'package.json'),
    `${JSON.stringify(
      { name: 'std-abi-published-consumer', private: true, version: '0.0.0' },
      null,
      2
    )}\n`
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
      wasmSpec,
      stdSpec,
    ],
    {
      cwd: consumerDir,
      stdio: 'pipe',
      timeout: 300000,
      shell: process.platform === 'win32',
    }
  );

  const require = createRequire(join(consumerDir, 'noop.js'));
  const wasmRoot = join(consumerDir, 'node_modules', '@holoscript', 'wasm');
  const stdRoot = join(consumerDir, 'node_modules', '@holoscript', 'std');
  const wasm = require(join(wasmRoot, 'pkg-node', 'holoscript_wasm.js'));
  const evaluatorExport = 'evaluate_trait_handler_v6';
  if (typeof wasm[evaluatorExport] !== 'function') {
    fail(`installed @holoscript/wasm does not export ${evaluatorExport}`);
  }

  const stdPackage = JSON.parse(readFileSync(join(stdRoot, 'package.json'), 'utf8'));
  const manifestPath = join(stdRoot, 'conformance', 'generated', 'manifest.json');
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== 'holoscript.std-abi-conformance-manifest.v0') {
    fail(`unexpected installed manifest schema ${manifest.schema}`);
  }

  const verifiedFiles = {};
  for (const [repoRelativePath, pin] of Object.entries(manifest.files)) {
    const packagePrefix = 'packages/std/';
    if (!repoRelativePath.startsWith(packagePrefix)) {
      fail(`installed manifest path is outside @holoscript/std: ${repoRelativePath}`);
    }
    const packageRelativePath = repoRelativePath.slice(packagePrefix.length);
    const absolute = join(stdRoot, ...packageRelativePath.split('/'));
    if (!existsSync(absolute)) fail(`installed manifest file is absent: ${packageRelativePath}`);
    const actual = sha256(readFileSync(absolute));
    if (actual !== pin.sha256) {
      fail(
        `installed manifest sha mismatch for ${packageRelativePath}: ${pin.sha256} vs ${actual}`
      );
    }
    verifiedFiles[packageRelativePath] = { sha256: actual };
  }

  const bindingPath = join(
    stdRoot,
    'conformance',
    'host-abi',
    'std-host-binding.mjs'
  );
  const { createStdHostBindings, STD_HOST_ABI_SCHEMA } = await import(
    pathToFileURL(bindingPath).href
  );
  const hostBindings = createStdHostBindings();
  const hostFunctionCount = Object.values(hostBindings).reduce(
    (count, namespace) =>
      count + Object.values(namespace).filter((value) => typeof value === 'function').length,
    0
  );

  const projectionPath = join(
    stdRoot,
    'conformance',
    'generated',
    'std-abi-conformance.trait.hsplus'
  );
  const vectorsPath = join(
    stdRoot,
    'conformance',
    'generated',
    'std-abi-vectors.v0.jsonl'
  );
  const packagedExecutionPath = join(
    stdRoot,
    'conformance',
    'generated',
    'std-abi-packaged-execution.v0.json'
  );
  const projectionSource = readFileSync(projectionPath, 'utf8');
  const vectors = readFileSync(vectorsPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
  const packagedExecution = JSON.parse(readFileSync(packagedExecutionPath, 'utf8'));
  if (packagedExecution.schema !== 'holoscript.std-abi-packaged-execution.v0') {
    fail(`unexpected packaged execution schema ${packagedExecution.schema}`);
  }

  const packagedSources = Object.fromEntries(
    Object.entries(packagedExecution.sources).map(([trait, repoRelativePath]) => {
      const packageRelativePath = repoRelativePath.replace(/^packages\/std\//u, '');
      return [trait, readFileSync(join(stdRoot, ...packageRelativePath.split('/')), 'utf8')];
    })
  );
  const projectionTrait = traitNameOf(projectionSource);
  const results = vectors.map((vector) => {
    const source = vector.packaged ? packagedSources[vector.trait] : projectionSource;
    const trait = vector.packaged ? vector.trait : projectionTrait;
    const outcome = {
      id: vector.id,
      op: vector.op,
      execution: vector.packaged ? 'packaged-source' : 'projection',
      pass: false,
    };
    try {
      const envelope = JSON.parse(
        wasm[evaluatorExport](
          source,
          trait,
          vector.op,
          JSON.stringify(vector.args ?? {}),
          hostBindings
        )
      );
      if (!envelope?.ok) {
        outcome.error = `${envelope?.error?.code ?? 'unknown'}: ${
          envelope?.error?.message ?? 'no error payload'
        }`;
        return outcome;
      }
      const mismatches = [];
      compareValues(envelope.value, vector.expected, vector.tolerance ?? 0, 'value', mismatches);
      outcome.actual = envelope.value;
      outcome.pass = mismatches.length === 0;
      if (mismatches.length > 0) outcome.mismatches = mismatches;
      return outcome;
    } catch (error) {
      outcome.error = String(error?.message ?? error);
      return outcome;
    }
  });

  const failed = results.filter((result) => !result.pass);
  verdict = failed.length === 0 ? 'OK' : 'FAILED';
  const installedWasm = readFileSync(
    join(wasmRoot, 'pkg-node', 'holoscript_wasm_bg.wasm')
  );
  const registryInstalled =
    stdSpec === `@holoscript/std@${stdVersion}` &&
    wasmSpec === `@holoscript/wasm@${wasmVersion}`;
  const receipt = {
    schema: 'holoscript.std-abi-published-consumer.v1',
    generatedAtISO: new Date().toISOString(),
    verdict,
    registry: 'https://registry.npmjs.org/',
    registryInstalled,
    localSourceUsed: false,
    packageBytesOnly: true,
    requestedSpecs: { wasm: wasmSpec, std: stdSpec },
    packages: {
      '@holoscript/wasm': {
        version: JSON.parse(readFileSync(join(wasmRoot, 'package.json'), 'utf8')).version,
        installedWasmSha256: sha256(installedWasm),
      },
      '@holoscript/std': {
        version: stdPackage.version,
        manifestSha256: sha256(manifestBytes),
        verifiedFiles,
      },
    },
    evaluatorExport,
    hostAbi: {
      schema: STD_HOST_ABI_SCHEMA,
      bindingModuleSha256: sha256(readFileSync(bindingPath)),
      functionCount: hostFunctionCount,
      source: '@holoscript/std/host-abi installed bytes',
    },
    summary: {
      vectors: vectors.length,
      passed: results.length - failed.length,
      failed: failed.length,
      packagedVectors: results.filter((result) => result.execution === 'packaged-source').length,
      projectionVectors: results.filter((result) => result.execution === 'projection').length,
    },
    results,
    claimBoundary: {
      provesFreshInstall: true,
      provesRegistryInstall: registryInstalled,
      provesFullInstalledCorpus: verdict === 'OK',
      provesCanonicalPublishedBinding: verdict === 'OK',
      provesBrowserExecution: false,
      provesOwnedMetalExecution: false,
      note:
        'Every executed source, vector, manifest, and host-binding byte came from packages installed into a fresh consumer with lifecycle scripts disabled. Registry publication is claimed only when requestedSpecs are exact registry versions.',
    },
  };
  const receiptForHash = { ...receipt };
  delete receiptForHash.receiptHash;
  receipt.receiptHash = sha256(Buffer.from(JSON.stringify(receiptForHash)));

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
  if (failed.length > 0) {
    for (const result of failed.slice(0, 10)) {
      console.error(
        `  x ${result.id}: ${result.error ?? (result.mismatches ?? []).join('; ')}`
      );
    }
  }
} finally {
  if (!keep) rmSync(consumerDir, { recursive: true, force: true });
}

if (verdict !== 'OK') fail(`fresh-consumer corpus failed; receipt at ${outPath}`);
console.log(
  `[std-abi-published-consumer] OK: full installed corpus passed with canonical @holoscript/std host binding; receipt at ${outPath}`
);
