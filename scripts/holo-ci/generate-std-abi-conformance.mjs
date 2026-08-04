#!/usr/bin/env node
/**
 * Generates the std ABI conformance artifacts from the op-definition SSOT.
 *
 * Reads packages/std/conformance/std-abi-ops.v0.json and emits, under
 * packages/std/conformance/generated/:
 *   - std-abi-conformance.action.hsplus  (composition/logic/action projection,
 *     executed by the engine DeterministicHsplusActionRuntime on Node targets)
 *   - std-abi-conformance.trait.hsplus   (@trait/@on_* projection, executed by
 *     the compiler-wasm trait-handler evaluator on Wasm targets)
 *   - std-abi-vectors.v0.jsonl           (one vector per line with expected
 *     values computed from the TypeScript reference twin)
 *   - manifest.json                      (sha256 pins for every artifact plus
 *     the packaged native sources)
 *
 * Admission gates (generation fails closed):
 *   - every expected value must be finite and free of negative zero;
 *   - the action projection and hash-bound packaged traits must construct in
 *     their deterministic engine runtimes, and every Node-admitted vector must
 *     execute to a bit-exact match with the reference twin.
 *
 * Generated artifacts are deterministic: no timestamps, sorted keys where
 * ordering is not semantic. Receipts carry timestamps; these files carry only
 * content.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const conformanceDir = join(repoRoot, 'packages', 'std', 'conformance');
const generatedDir = join(conformanceDir, 'generated');
const opsPath = join(conformanceDir, 'std-abi-ops.v0.json');

const require = createRequire(import.meta.url);

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function fail(message) {
  console.error(`[generate-std-abi-conformance] FAIL: ${message}`);
  process.exit(1);
}

function assertCleanNumber(value, path) {
  if (typeof value !== 'number') return;
  if (!Number.isFinite(value)) fail(`non-finite value at ${path}`);
  if (Object.is(value, -0)) fail(`negative zero at ${path}`);
}

function assertCleanValue(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCleanValue(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertCleanValue(child, `${path}.${key}`);
    }
    return;
  }
  assertCleanNumber(value, path);
}

function valuesExactlyEqual(a, b, path, mismatches) {
  if (typeof a !== typeof b) {
    mismatches.push(`${path}: type ${typeof a} vs ${typeof b}`);
    return;
  }
  if (a !== null && typeof a === 'object') {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.join(',') !== bKeys.join(',')) {
      mismatches.push(`${path}: keys [${aKeys}] vs [${bKeys}]`);
      return;
    }
    for (const key of aKeys) {
      valuesExactlyEqual(a[key], b[key], `${path}.${key}`, mismatches);
    }
    return;
  }
  if (!Object.is(a, b)) {
    mismatches.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
}

const ops = JSON.parse(readFileSync(opsPath, 'utf8'));
if (ops.schema !== 'holoscript.std-abi-ops.v0') {
  fail(`unexpected ops schema ${ops.schema}`);
}
let packagedExecution = ops.packagedExecution ?? null;
let packagedExtensionsPath = null;
if (packagedExecution?.extensionsFile) {
  packagedExtensionsPath = join(repoRoot, ...packagedExecution.extensionsFile.split('/'));
  const extensions = JSON.parse(readFileSync(packagedExtensionsPath, 'utf8'));
  if (extensions.schema !== 'holoscript.std-abi-packaged-extensions.v0') {
    fail(`unexpected packaged extensions schema ${extensions.schema}`);
  }
  const identities = new Set(
    packagedExecution.handlers.map((handler) => `${handler.trait}.${handler.handler}`)
  );
  for (const handler of extensions.handlers) {
    const identity = `${handler.trait}.${handler.handler}`;
    if (identities.has(identity)) fail(`duplicate packaged handler ${identity}`);
    if (!packagedExecution.sources?.[handler.trait]) {
      fail(`${identity}: no packaged source is declared for trait ${handler.trait}`);
    }
    identities.add(identity);
  }
  packagedExecution = {
    ...packagedExecution,
    handlers: [...packagedExecution.handlers, ...extensions.handlers],
  };
}

const reference = await import(
  pathToFileURL(join(repoRoot, 'packages', 'std', 'dist', 'math.js')).href
);
const { createStdHostBindings } = await import(
  pathToFileURL(
    join(repoRoot, 'packages', 'std', 'conformance', 'host-abi', 'std-host-binding.mjs')
  ).href
);
const hostBindings = createStdHostBindings();
const hostAbiDescriptor = JSON.parse(
  readFileSync(
    join(repoRoot, 'packages', 'std', 'conformance', 'host-abi', 'std-host-abi.v0.json'),
    'utf8'
  )
);

function resolveReference(refPath) {
  let target = reference;
  for (const segment of refPath) {
    target = target?.[segment];
  }
  if (typeof target !== 'function') {
    fail(`reference ${refPath.join('.')} is not a function`);
  }
  return target;
}

function resolveHostFunction(hostRef, label) {
  const [namespace, name] = hostRef;
  const fn = hostBindings[namespace]?.[name];
  if (typeof fn !== 'function') fail(`${label}: host binding ${namespace}.${name} is missing`);
  const declared = hostAbiDescriptor.namespaces?.[namespace]?.[name];
  if (!declared) fail(`${label}: ${namespace}.${name} is not declared in the host-ABI descriptor`);
  return { fn, declared };
}

function wrapReferenceResult(resultShape, raw, path) {
  if (resultShape === 'scalar') return { value: raw };
  if (resultShape === 'vec3') {
    return { x: raw.x, y: raw.y, z: raw.z };
  }
  if (resultShape === 'quat') {
    return { x: raw.x, y: raw.y, z: raw.z, w: raw.w };
  }
  fail(`unknown resultShape at ${path}`);
}

// --- Emit projections -------------------------------------------------------

const actionLines = [
  `composition "${ops.conformanceComposition}" {`,
  '  state {',
  '    touched: 0',
  '  }',
  '',
  '  logic {',
];
const traitLines = [`@trait ${ops.conformanceTrait} {`];

for (const op of ops.ops) {
  if (op.kind === 'host-binding' && !op.body && !op.statements) {
    op.body = `{ value: ${op.hostRef[0]}.${op.hostRef[1]}(${op.params.join(', ')}) }`;
  }
  const params = op.params.join(', ');
  actionLines.push(`    action ${op.action}(${params}) {`);
  if (op.statements) {
    for (const statement of op.statements) actionLines.push(`      ${statement}`);
  } else {
    actionLines.push(`      return ${op.body}`);
  }
  actionLines.push('    }');
  actionLines.push('');
  const traitHeader = op.params.length ? `  @${op.op}(${params}) => {` : `  @${op.op} => {`;
  traitLines.push(traitHeader);
  if (op.statements) {
    for (const statement of op.statements) traitLines.push(`    ${statement}`);
  } else if (op.traitBody) {
    for (const statement of op.traitBody) traitLines.push(`    ${statement}`);
  } else {
    traitLines.push(`    return ${op.body}`);
  }
  traitLines.push('  }');
  traitLines.push('');
}
while (actionLines[actionLines.length - 1] === '') actionLines.pop();
actionLines.push('  }', '}', '');
while (traitLines[traitLines.length - 1] === '') traitLines.pop();
traitLines.push('}', '');

const actionSource = actionLines.join('\n');
const traitSource = traitLines.join('\n');

// --- Compute expected values from the reference twin ------------------------

const vectors = [];
for (const op of ops.ops) {
  const isHostOp = op.kind === 'host-binding';
  const referenceFn = isHostOp ? null : resolveReference(op.reference);
  const host = isHostOp ? resolveHostFunction(op.hostRef, op.op) : null;
  const twinFn = isHostOp && host.declared.twinRef ? resolveReference(host.declared.twinRef) : null;
  for (const vector of op.vectors) {
    const args = vector.args;
    const expectArgs = vector.expectArgs ?? args;
    const orderedArgs = op.params.map((param) => {
      if (!(param in args)) fail(`${op.op}/${vector.id}: missing runtime arg ${param}`);
      if (!(param in expectArgs)) fail(`${op.op}/${vector.id}: missing expectation arg ${param}`);
      return expectArgs[param];
    });
    let expected;
    if (isHostOp) {
      const hostRaw = host.fn(...structuredClone(orderedArgs));
      expected = { value: hostRaw };
      if (twinFn) {
        const twinRaw = twinFn(...structuredClone(orderedArgs));
        const twinMismatches = [];
        valuesExactlyEqual(hostRaw, twinRaw, `${op.op}/${vector.id}.twin`, twinMismatches);
        if (twinMismatches.length > 0) {
          fail(`${op.op}/${vector.id}: binding disagrees with twin: ${twinMismatches.join('; ')}`);
        }
      }
    } else {
      const raw = referenceFn(...orderedArgs);
      expected = wrapReferenceResult(op.resultShape, raw, `${op.op}/${vector.id}`);
    }
    assertCleanValue(expected, `${op.op}/${vector.id}.expected`);
    assertCleanValue(args, `${op.op}/${vector.id}.args`);
    assertCleanValue(expectArgs, `${op.op}/${vector.id}.expectArgs`);
    vectors.push({
      id: vector.id,
      op: op.op,
      action: op.action,
      kind: op.kind,
      args,
      ...(vector.expectArgs ? { expectArgs } : {}),
      expected,
      tolerance: op.tolerance ?? 0,
    });
  }
}

// --- Packaged-handler vectors (executed from shipped source bytes) -----------
// Node consumes the canonical HoloScriptPlusParser @trait AST through the v7
// deterministic trait adapter; wasm targets consume the same hash-bound sources
// through the cumulative v6 evaluator. Both statically lift whitelisted
// on_spawn factories without executing lifecycle side effects.

if (packagedExecution) {
  for (const handler of packagedExecution.handlers) {
    let expectFn = null;
    if (handler.expectRef?.host) {
      expectFn = resolveHostFunction(
        handler.expectRef.host,
        `${handler.trait}.${handler.handler}`
      ).fn;
    } else if (handler.expectRef?.twin) {
      expectFn = resolveReference(handler.expectRef.twin);
    } else if (handler.expectRef?.literal !== true) {
      fail(`${handler.trait}.${handler.handler}: unsupported expectRef`);
    }
    for (const vector of handler.vectors) {
      const expectArgs = vector.expectArgs ?? vector.args;
      const orderedArgs = handler.params.map((param) => {
        if (!(param in vector.args)) {
          fail(`${handler.handler}/${vector.id}: missing runtime arg ${param}`);
        }
        if (!(param in expectArgs)) {
          fail(`${handler.handler}/${vector.id}: missing expectation arg ${param}`);
        }
        return expectArgs[param];
      });
      let expected;
      if (handler.expectRef.literal === true) {
        if (!Object.prototype.hasOwnProperty.call(vector, 'expected')) {
          fail(`${handler.handler}/${vector.id}: literal oracle requires vector.expected`);
        }
        expected = structuredClone(vector.expected);
      } else {
        expected = expectFn(...structuredClone(orderedArgs));
      }
      if (handler.wrap) {
        expected = wrapReferenceResult(handler.wrap, expected, `${handler.handler}/${vector.id}`);
      }
      assertCleanValue(expected, `${handler.handler}/${vector.id}.expected`);
      assertCleanValue(vector.args, `${handler.handler}/${vector.id}.args`);
      assertCleanValue(expectArgs, `${handler.handler}/${vector.id}.expectArgs`);
      vectors.push({
        id: vector.id,
        op: handler.handler,
        action: null,
        kind: 'packaged-handler',
        packaged: true,
        trait: handler.trait,
        args: vector.args,
        ...(vector.expectArgs ? { expectArgs } : {}),
        expected,
        tolerance: handler.tolerance ?? 0,
        targets: packagedExecution.targets,
      });
    }
  }
}

// --- Admission gate: execute the action projection in the engine runtime ----

const runtimeModulePath = join(repoRoot, 'packages', 'engine', 'dist', 'runtime', 'index.cjs');
const runtimeModule = require(runtimeModulePath);
const {
  createDeterministicHsplusActionRuntime,
  createDeterministicHsplusTraitRuntime,
  ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7,
} = runtimeModule;
const runtime = createDeterministicHsplusActionRuntime(actionSource, {
  numericBuiltins: ops.numericBuiltins === true,
  localBindings: ops.localBindings === true,
  ...(ops.hostBindings === true ? { hostBindings } : {}),
  nullCoalescing: ops.nullCoalescing === true,
});
if (typeof createDeterministicHsplusTraitRuntime !== 'function') {
  fail('engine dist does not export createDeterministicHsplusTraitRuntime');
}
if (packagedExecution?.engineSubsetId !== ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7) {
  fail(
    `packaged engine subset mismatch: ops=${packagedExecution?.engineSubsetId}, runtime=${ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET_V7}`
  );
}
const packagedRuntimes = new Map(
  Object.entries(packagedExecution?.sources ?? {}).map(([traitName, sourcePath]) => [
    traitName,
    createDeterministicHsplusTraitRuntime(
      readFileSync(join(repoRoot, ...sourcePath.split('/')), 'utf8'),
      traitName,
      { hostBindings }
    ),
  ])
);

let gateFailures = 0;
for (const vector of vectors) {
  const vectorRuntime = vector.packaged ? packagedRuntimes.get(vector.trait) : runtime;
  if (!vectorRuntime) {
    fail(`${vector.id}: no deterministic runtime for packaged trait ${vector.trait}`);
  }
  let result;
  try {
    result = vectorRuntime.invoke({
      kind: 'observation',
      scheduleEntryId: `gen-gate-${vector.id}`,
      order: 0,
      tick: 0,
      phase: 'generation-admission',
      entrypoint: vector.packaged ? vector.op : vector.action,
      args: vector.args,
    });
  } catch (error) {
    fail(
      `${vector.id}: deterministic ${vector.packaged ? 'packaged-source' : 'projection'} admission threw: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const mismatches = [];
  valuesExactlyEqual(result.value, vector.expected, vector.id, mismatches);
  if (mismatches.length > 0) {
    gateFailures += 1;
    console.error(
      `[generate-std-abi-conformance] admission mismatch ${vector.id}: ${mismatches.join('; ')}`
    );
  }
}
if (gateFailures > 0) {
  fail(`${gateFailures} vector(s) failed the runtime-vs-reference admission gate`);
}

// --- Write artifacts ---------------------------------------------------------

mkdirSync(generatedDir, { recursive: true });

const vectorsJsonl = `${vectors.map((vector) => JSON.stringify(vector)).join('\n')}\n`;
const actionPath = join(generatedDir, 'std-abi-conformance.action.hsplus');
const traitPath = join(generatedDir, 'std-abi-conformance.trait.hsplus');
const vectorsPath = join(generatedDir, 'std-abi-vectors.v0.jsonl');
const packagedExecutionPath = join(generatedDir, 'std-abi-packaged-execution.v0.json');
const packagedExecutionJson = `${JSON.stringify(
  {
    schema: 'holoscript.std-abi-packaged-execution.v0',
    ...packagedExecution,
  },
  null,
  2
)}\n`;

writeFileSync(actionPath, actionSource);
writeFileSync(traitPath, traitSource);
writeFileSync(vectorsPath, vectorsJsonl);
writeFileSync(packagedExecutionPath, packagedExecutionJson);

const stdPackageJson = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'std', 'package.json'), 'utf8')
);

const manifest = {
  schema: 'holoscript.std-abi-conformance-manifest.v0',
  stdPackageVersion: stdPackageJson.version,
  opsFile: 'packages/std/conformance/std-abi-ops.v0.json',
  packagedExecutionFile:
    'packages/std/conformance/generated/std-abi-packaged-execution.v0.json',
  files: {
    'packages/std/conformance/std-abi-ops.v0.json': {
      sha256: sha256(readFileSync(opsPath)),
    },
    'packages/std/conformance/generated/std-abi-conformance.action.hsplus': {
      sha256: sha256(Buffer.from(actionSource)),
    },
    'packages/std/conformance/generated/std-abi-conformance.trait.hsplus': {
      sha256: sha256(Buffer.from(traitSource)),
    },
    'packages/std/conformance/generated/std-abi-vectors.v0.jsonl': {
      sha256: sha256(Buffer.from(vectorsJsonl)),
    },
    'packages/std/conformance/generated/std-abi-packaged-execution.v0.json': {
      sha256: sha256(Buffer.from(packagedExecutionJson)),
    },
    'packages/std/src/math.hsplus': {
      sha256: sha256(readFileSync(join(repoRoot, 'packages', 'std', 'src', 'math.hsplus'))),
    },
    'packages/std/src/collections.hsplus': {
      sha256: sha256(readFileSync(join(repoRoot, 'packages', 'std', 'src', 'collections.hsplus'))),
    },
    'packages/std/conformance/host-abi/std-host-abi.v0.json': {
      sha256: sha256(
        readFileSync(
          join(repoRoot, 'packages', 'std', 'conformance', 'host-abi', 'std-host-abi.v0.json')
        )
      ),
    },
    'packages/std/conformance/host-abi/std-host-binding.mjs': {
      sha256: sha256(
        readFileSync(
          join(repoRoot, 'packages', 'std', 'conformance', 'host-abi', 'std-host-binding.mjs')
        )
      ),
    },
    ...(packagedExtensionsPath
      ? {
          [packagedExecution.extensionsFile]: {
            sha256: sha256(readFileSync(packagedExtensionsPath)),
          },
        }
      : {}),
  },
  counts: {
    ops: ops.ops.length,
    vectors: vectors.length,
    projectionVectors: vectors.filter((vector) => !vector.packaged).length,
    packagedHandlers: packagedExecution?.handlers.length ?? 0,
    packagedVectors: vectors.filter((vector) => vector.packaged).length,
    excluded: ops.excluded.length,
  },
};

writeFileSync(join(generatedDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `[generate-std-abi-conformance] OK: ${ops.ops.length} ops, ${vectors.length} vectors, projection and packaged-source admission exact-match, artifacts written to packages/std/conformance/generated/`
);
