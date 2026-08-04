#!/usr/bin/env node
/**
 * Node-target std ABI conformance runner.
 *
 * Executes both the generated action projection and the hash-bound packaged
 * @trait sources in the engine deterministic runtimes, compares every vector
 * against the frozen corpus expectation and a live recomputation from the
 * TypeScript reference twin, and writes a target execution receipt.
 *
 * Fail-closed behaviors:
 *   - manifest sha mismatch on any input artifact aborts before execution;
 *   - any vector mismatch, runtime error, or twin drift fails the run;
 *   - --self-test proves the comparator can go red.
 *
 * Usage:
 *   node scripts/holo-ci/check-std-abi-conformance-node.mjs [--out <path>] [--self-test]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const outFlagIndex = args.indexOf('--out');
const defaultOutPath = join(
  repoRoot,
  'reports',
  'library-coherence',
  '2026-07-26_std-abi-conformance.node.v0.json'
);
const outPath = outFlagIndex >= 0 ? resolve(args[outFlagIndex + 1]) : defaultOutPath;

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-abi-conformance-node] FAIL: ${message}`);
  process.exit(1);
}

// --- Load and verify pinned inputs ------------------------------------------

const generatedDir = join(repoRoot, 'packages', 'std', 'conformance', 'generated');
const manifestPath = join(generatedDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'holoscript.std-abi-conformance-manifest.v0') {
  fail(`unexpected manifest schema ${manifest.schema}`);
}

for (const [relPath, pin] of Object.entries(manifest.files)) {
  const absolute = join(repoRoot, ...relPath.split('/'));
  const actual = sha256(readFileSync(absolute));
  if (actual !== pin.sha256) {
    fail(`manifest sha mismatch for ${relPath}: pinned ${pin.sha256}, actual ${actual}`);
  }
}

const actionSource = readFileSync(join(generatedDir, 'std-abi-conformance.action.hsplus'), 'utf8');
const vectorsRaw = readFileSync(join(generatedDir, 'std-abi-vectors.v0.jsonl'), 'utf8');
const vectors = vectorsRaw
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line));
const opsDefinition = JSON.parse(
  readFileSync(join(repoRoot, ...manifest.opsFile.split('/')), 'utf8')
);
const packagedExecution = JSON.parse(
  readFileSync(join(repoRoot, ...manifest.packagedExecutionFile.split('/')), 'utf8')
);
if (packagedExecution.schema !== 'holoscript.std-abi-packaged-execution.v0') {
  fail(`unexpected packaged execution schema ${packagedExecution.schema}`);
}

// --- Load execution engine and reference twin --------------------------------

const runtimeModule = require(join(repoRoot, 'packages', 'engine', 'dist', 'runtime', 'index.cjs'));
const {
  createDeterministicHsplusActionRuntime,
  createDeterministicHsplusTraitRuntime,
  ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET,
  ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7,
  canonicalizeHeadlessValue,
} = runtimeModule;
if (typeof createDeterministicHsplusTraitRuntime !== 'function') {
  fail('engine dist does not export createDeterministicHsplusTraitRuntime');
}
if (
  packagedExecution.engineSubsetId !== ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7
) {
  fail(
    `packaged engine subset mismatch: ops=${packagedExecution.engineSubsetId}, runtime=${ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7}`
  );
}

const reference = await import(
  pathToFileURL(join(repoRoot, 'packages', 'std', 'dist', 'math.js')).href
);

function resolveReference(refPath) {
  let target = reference;
  for (const segment of refPath) target = target?.[segment];
  return typeof target === 'function' ? target : null;
}

const hostBindingModuleUrl = pathToFileURL(
  join(repoRoot, 'packages', 'std', 'conformance', 'host-abi', 'std-host-binding.mjs')
).href;
const { createStdHostBindings } =
  opsDefinition.hostBindings === true ? await import(hostBindingModuleUrl) : {};
const hostBindings = createStdHostBindings ? createStdHostBindings() : null;

const referenceByOp = new Map(
  opsDefinition.ops.map((op) => {
    if (op.kind === 'host-binding') {
      const [namespace, name] = op.hostRef;
      return [
        op.op,
        {
          fn: hostBindings?.[namespace]?.[name] ?? null,
          params: op.params,
          resultShape: 'host',
        },
      ];
    }
    return [
      op.op,
      { fn: resolveReference(op.reference), params: op.params, resultShape: op.resultShape },
    ];
  })
);

function wrapReferenceResult(resultShape, raw) {
  if (resultShape === 'host' || resultShape === 'scalar') return { value: raw };
  if (resultShape === 'vec3') return { x: raw.x, y: raw.y, z: raw.z };
  return { x: raw.x, y: raw.y, z: raw.z, w: raw.w };
}

function packagedReferenceKey(trait, handler) {
  return `${trait}.${handler}`;
}

const packagedReferenceByHandler = new Map(
  packagedExecution.handlers.map((handler) => {
    const fn = handler.expectRef?.host
      ? hostBindings?.[handler.expectRef.host[0]]?.[handler.expectRef.host[1]]
      : handler.expectRef?.twin
        ? resolveReference(handler.expectRef.twin)
        : null;
    return [
      packagedReferenceKey(handler.trait, handler.handler),
      {
        fn: typeof fn === 'function' ? fn : null,
        params: handler.params,
        wrap: handler.wrap,
        literal: handler.expectRef?.literal === true,
      },
    ];
  })
);

function createPackagedRuntimes() {
  return new Map(
    Object.entries(packagedExecution.sources).map(
      ([traitName, sourcePath]) => [
        traitName,
        createDeterministicHsplusTraitRuntime(
          readFileSync(join(repoRoot, ...sourcePath.split('/')), 'utf8'),
          traitName,
          { hostBindings }
        ),
      ]
    )
  );
}

// --- Comparison --------------------------------------------------------------

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

function runVector(runtime, vector, expectedOverride) {
  const expected = expectedOverride ?? vector.expected;
  const outcome = {
    id: vector.id,
    op: vector.op,
    execution: vector.packaged ? 'packaged-source' : 'projection',
    pass: false,
  };
  let runtimeValue;
  try {
    const result = runtime.invoke({
      kind: 'observation',
      scheduleEntryId: `node-conformance-${vector.id}`,
      order: 0,
      tick: 0,
      phase: 'std-abi-conformance',
      entrypoint: vector.packaged ? vector.op : vector.action,
      args: vector.args,
    });
    runtimeValue = result.value;
  } catch (error) {
    outcome.error = String((error && error.message) || error);
    return outcome;
  }

  const mismatches = [];
  compareValues(runtimeValue, expected, vector.tolerance, 'value', mismatches);

  const ref = vector.packaged
    ? packagedReferenceByHandler.get(packagedReferenceKey(vector.trait, vector.op))
    : referenceByOp.get(vector.op);
  if (!ref) {
    mismatches.push('reference: twin function unavailable');
  } else if (!ref.literal && !ref.fn) {
    mismatches.push('reference: twin function unavailable');
  } else if (!ref.literal) {
    const referenceArgs = vector.expectArgs ?? vector.args;
    const orderedArgs = ref.params.map((param) => referenceArgs[param]);
    const rawTwinValue = ref.fn(...orderedArgs);
    const twinValue = vector.packaged
      ? ref.wrap
        ? wrapReferenceResult(ref.wrap, rawTwinValue)
        : rawTwinValue
      : wrapReferenceResult(ref.resultShape, rawTwinValue);
    compareValues(twinValue, expected, vector.tolerance, 'twin', mismatches);
  }

  outcome.pass = mismatches.length === 0;
  outcome.valueCanonicalHash = sha256(Buffer.from(canonicalizeHeadlessValue(runtimeValue)));
  outcome.actual = runtimeValue;
  if (!outcome.pass) outcome.mismatches = mismatches;
  return outcome;
}

// --- Self-test ---------------------------------------------------------------

const runtimeOptions = {
  numericBuiltins: opsDefinition.numericBuiltins === true,
  localBindings: opsDefinition.localBindings === true,
  ...(hostBindings ? { hostBindings } : {}),
  nullCoalescing: opsDefinition.nullCoalescing === true,
};

if (selfTest) {
  const runtime = createDeterministicHsplusActionRuntime(actionSource, runtimeOptions);
  const packagedRuntimes = createPackagedRuntimes();
  const samples = [
    vectors.find((vector) => !vector.packaged),
    vectors.find((vector) => vector.packaged),
  ];
  for (const sample of samples) {
    if (!sample) fail('self-test requires both projection and packaged-source vectors');
    const sampleRuntime = sample.packaged ? packagedRuntimes.get(sample.trait) : runtime;
    if (!sampleRuntime) fail(`self-test has no packaged runtime for ${sample.trait}`);
    const good = runVector(sampleRuntime, sample);
    const bad = runVector(sampleRuntime, sample, '__poisoned_expectation__');
    if (!good.pass || bad.pass) {
      fail(
        `self-test failed for ${sample.id}: clean vector pass=${good.pass}, poisoned vector pass=${bad.pass}`
      );
    }
  }
  console.log(
    '[std-abi-conformance-node] self-test OK: projection and packaged-source vectors pass clean and go red under poisoned expectations'
  );
  process.exit(0);
}

// --- Full run ----------------------------------------------------------------

const runtime = createDeterministicHsplusActionRuntime(actionSource, runtimeOptions);
const packagedRuntimes = createPackagedRuntimes();
const nodeVectors = vectors.filter(
  (vector) => !Array.isArray(vector.targets) || vector.targets.includes('node')
);
const skippedByTarget = vectors.length - nodeVectors.length;
const results = nodeVectors.map((vector) => {
  const vectorRuntime = vector.packaged ? packagedRuntimes.get(vector.trait) : runtime;
  if (!vectorRuntime) fail(`${vector.id}: no packaged runtime for trait ${vector.trait}`);
  return runVector(vectorRuntime, vector);
});
const failed = results.filter((result) => !result.pass);

const stdPackageJson = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'std', 'package.json'), 'utf8')
);
const enginePackageJson = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'engine', 'package.json'), 'utf8')
);

const receipt = {
  schema: 'holoscript.std-abi-conformance.node.v0',
  generatedAtISO: new Date().toISOString(),
  target: 'node',
  executionRuntime: {
    engine: 'DeterministicHsplusActionRuntime',
    enginePackageVersion: enginePackageJson.version,
    subsetId: runtime.subsetId ?? ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET,
    executedProjection: 'packages/std/conformance/generated/std-abi-conformance.action.hsplus',
    packagedTraitEngine: 'DeterministicHsplusTraitRuntime',
    packagedSubsetId: ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7,
  },
  packagedExecution: {
    subsetId: ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7,
    sources: Object.fromEntries(
      Object.values(packagedExecution.sources).map((sourcePath) => [
        sourcePath,
        manifest.files[sourcePath],
      ])
    ),
    vectors: nodeVectors.filter((vector) => vector.packaged).length,
    claim: packagedExecution.claim,
  },
  referenceTwin: {
    module: 'packages/std/dist/math.js',
    stdPackageVersion: stdPackageJson.version,
    comparison:
      'runtime value vs frozen corpus expectation, plus live twin recomputation where the manifest names a compatible twin; bounded iterable/callable vectors use literal independent oracles',
  },
  sources: manifest.files,
  ...(hostBindings
    ? {
        hostAbi: {
          schema: 'holoscript.std-host-abi.v0',
          descriptorSha256:
            manifest.files['packages/std/conformance/host-abi/std-host-abi.v0.json']?.sha256,
          bindingModuleSha256:
            manifest.files['packages/std/conformance/host-abi/std-host-binding.mjs']?.sha256,
          claim:
            'host-binding vectors call the one canonical JS binding from guest code; equality across targets proves guest-independent marshalling agreement, not independent host implementations',
        },
      }
    : {}),
  environment: {
    node: process.version,
    arch: process.arch,
    platform: process.platform,
  },
  summary: {
    ops: opsDefinition.ops.length,
    vectors: nodeVectors.length,
    passed: results.length - failed.length,
    failed: failed.length,
    skippedByTarget,
    skippedByTargetReason:
      skippedByTarget > 0 ? 'some corpus vectors do not declare the Node target' : undefined,
    excludedOps: opsDefinition.excluded,
  },
  results,
  claimBoundary: {
    provesNodeDeterministicSubsetExecution: true,
    provesBrowserWasmExecution: false,
    provesOwnedMetalExecution: false,
    provesPackagedHandlerExecution: true,
    note: 'Projection vectors execute the generated action source. Packaged vectors execute preserved handler bodies parsed from hash-bound math.hsplus and collections.hsplus source through the engine v7 trait adapter. This receipt does not prove browser or owned-metal execution; cross-target equality remains the separate cross-target checker’s claim.',
  },
};

const receiptForHash = { ...receipt };
delete receiptForHash.receiptHash;
receipt.receiptHash = sha256(Buffer.from(JSON.stringify(receiptForHash)));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);

if (failed.length > 0) {
  console.error(
    `[std-abi-conformance-node] FAIL: ${failed.length}/${vectors.length} vectors failed; receipt at ${outPath}`
  );
  process.exit(1);
}
console.log(
  `[std-abi-conformance-node] OK: ${results.length}/${nodeVectors.length} vectors passed on node ${process.version} (${process.arch}), including ${nodeVectors.filter((vector) => vector.packaged).length} packaged-source vectors${skippedByTarget > 0 ? ` (${skippedByTarget} vector(s) target-scoped elsewhere)` : ''}; receipt at ${outPath}`
);
