#!/usr/bin/env node
/* global process */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildH3KPlan,
  compileH3KBundles,
  parseH3KStack,
  proveH3KPoseClearance,
} from './check-hololand-model-village-character-appearance-h3k.mjs';

import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3l-upper-limb.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3l-upper-limb-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3l-upper-limb-seed.hs';
const INHERITED_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3k-upper-body-occlusion.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3l-upper-limb-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3l-upper-limb-2026-07-28.md';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3l';
const EXPECTED_COMMIT = 'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXPECTED_GPU = 'NVIDIA GeForce RTX 3060 Laptop GPU';
const HASH_BINDINGS = [
  ['inheritedH3KSource', 'inheritedH3KSourceSha256', 'hololand'],
  ['upstreamBodyBuilderPath', 'upstreamBodyBuilderSha256', 'holoscript'],
  ['upstreamGarmentBuilderPath', 'upstreamGarmentBuilderSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamCharacterMeshBuilderPath', 'upstreamCharacterMeshBuilderSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
];

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value])
  );
}

// Delegates to the shared validator. The private gitHasCommit() this replaced asserted
// "ancestor of HEAD", which accepted a commit that existed only on one laptop and
// rejected a reproducible one whenever a peer left the shared checkout on a branch.
function upstreamPinFailures(holoScriptRoot, metadata) {
  return validateUpstreamCommitPin(
    holoScriptRoot,
    metadata.upstreamHoloScriptCommit,
    HASH_BINDINGS
      .filter(([, , owner]) => owner === 'holoscript')
      .map(([pathKey, hashKey]) => ({
        pathKey,
        relative: metadata[pathKey],
        sha256: metadata[hashKey],
      })),
  ).errors;
}

async function loadCore(holoScriptRoot) {
  return import(pathToFileURL(path.join(holoScriptRoot, 'packages/core/dist/index.js')).href);
}

async function loadEsbuild(holoScriptRoot) {
  const workspaceRequire = createRequire(path.join(holoScriptRoot, 'package.json'));
  return import(pathToFileURL(workspaceRequire.resolve('esbuild')).href);
}

export async function parseH3LStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT
) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3L .holo', source],
    ['H3L .hsplus', policy],
    ['H3L .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      throw new Error(`${label} parse failed: ${JSON.stringify(parsed.errors)}`);
    }
  }
  const inherited = await parseH3KStack(root, holoScriptRoot);
  return {
    core,
    source,
    policy,
    seed,
    inherited,
    sourceText,
    policyText,
    seedText,
    contract: {
      metadata: source.ast.metadata,
      state: properties(source.ast.state),
      environment: properties(source.ast.environment),
      objects: (source.ast.objects || []).map((object) => ({
        objectId: object.name,
        ...properties(object),
      })),
    },
  };
}

export function validateH3LContract(
  stack,
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT
) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state, objects } = stack.contract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3L_UPPER_LIMB_TAILORING',
    'milestone drifted'
  );
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'upstream commit pin drifted');
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  for (const [pathKey, hashKey, repo] of HASH_BINDINGS) {
    const base = repo === 'holoscript' ? holoScriptRoot : root;
    const absolute = path.join(base, metadata[pathKey] || '');
    expect(existsSync(absolute), `${pathKey} does not exist`);
    if (existsSync(absolute)) {
      expect(sha256File(absolute) === metadata[hashKey], `${hashKey} drifted`);
    }
  }
  for (const [key, expected] of [
    ['residentCount', 4],
    ['providerModelBinding', 'absent'],
    ['adapterFamilyBinding', 'absent'],
    ['researchSeatBinding', 'absent'],
    ['liveResearchJoinAllowed', false],
    ['canonicalWritesAllowed', false],
    ['residentObservationWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['biometricPersistenceAllowed', false],
    ['nativeCharacterCompilerClaimed', true],
    ['nativeCoherentUpperBodyClaimed', true],
    ['nativeUpperLimbReceiptClaimed', true],
    ['nativeTailoredGarmentReceiptClaimed', true],
    ['continuousShoulderToPalmClaimed', true],
    ['torsoToLimbSharedTopologyClaimed', false],
    ['legacyBoxUpperLimbsSuppressedClaimed', true],
    ['repeatedCompileByteIdentityClaimed', true],
    ['strippedUpperBodyDeltaClaimed', true],
    ['nativePoseClearanceClaimed', true],
    ['freshRtxBenchmarkClaimed', false],
    ['currentDriverInstallBenchmarkClaimed', false],
    ['historicalRtxEvidenceMayBeReusedAsCurrent', false],
    ['freshGpuGateRequiredForHero', true],
    ['heroCaptureClaimed', false],
    ['nativeWebgpuTaaClaimed', false],
    ['questWebxrMeasured', false],
    ['vrPerformanceConvergenceClaimed', false],
    ['photorealismClaimed', false],
    ['fullWorldConvergenceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    JSON.stringify(state.residentNames) === JSON.stringify(EXPECTED_RESIDENTS),
    'resident names drifted'
  );
  expect(
    state.upperLimbFoundation?.receiptSchema ===
      'holoscript.agent-avatar-upper-limb-geometry.v1' &&
      state.upperLimbFoundation?.profile === 'coherent-arm-palm-v1' &&
      state.upperLimbFoundation?.sideCount === 2 &&
      state.upperLimbFoundation?.radialSegments === 24 &&
      state.upperLimbFoundation?.ringCount === 8 &&
      state.upperLimbFoundation?.vertexCountPerSide === 193 &&
      state.upperLimbFoundation?.indexCountPerSide === 1080 &&
      state.upperLimbFoundation?.continuityScope === 'shoulder_to_palm_per_side',
    'upper-limb foundation drifted'
  );
  expect(
    state.tailoredGarmentFoundation?.collarProfile === 'tailored-open-v-collar-v1' &&
      state.tailoredGarmentFoundation?.shoulderShellMaximumHalfWidthMeters === 0.43 &&
      state.tailoredGarmentFoundation?.sleeveRootMaximumRadiusMeters === 0.1 &&
      state.tailoredGarmentFoundation?.taperedSleeveRequired === true,
    'tailored-garment foundation drifted'
  );
  expect(
    state.freshGpuAdmission?.hardwareReadbackOnlyCountsAsBenchmark === false &&
      state.freshGpuAdmission?.historicalCaptureCountsAsCurrent === false &&
      state.freshGpuAdmission?.browserProbeRequired === true &&
      state.freshGpuAdmission?.sceneCaptureRequired === true &&
      state.freshGpuAdmission?.gpuNameRequired === EXPECTED_GPU,
    'fresh-GPU admission drifted'
  );
  expect(objects.length === 4, 'exactly four resident witnesses are required');
  expect(
    JSON.stringify(objects.map((object) => object.displayLabel)) ===
      JSON.stringify(EXPECTED_RESIDENTS),
    'resident witness labels drifted'
  );
  const plan = buildH3KPlan(stack.inherited);
  expect(
    JSON.stringify(plan.residents.map((resident) => resident.displayLabel)) ===
      JSON.stringify(EXPECTED_RESIDENTS),
    'inherited compiled resident order drifted'
  );
  return { status: errors.length ? 'fail' : 'pass', errors, plan };
}

function proveConnectedRange(indices, receipt) {
  const start = receipt.vertexRange.vertexStart;
  const end = start + receipt.vertexRange.vertexCount;
  const adjacency = new Map();
  const connect = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  };
  const indexEnd = receipt.indexRange.indexStart + receipt.indexRange.indexCount;
  for (let offset = receipt.indexRange.indexStart; offset < indexEnd; offset += 3) {
    const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
    if (triangle.some((vertex) => vertex < start || vertex >= end)) {
      throw new Error(`${receipt.side} upper-limb index escaped its declared vertex range`);
    }
    connect(triangle[0], triangle[1]);
    connect(triangle[1], triangle[2]);
    connect(triangle[2], triangle[0]);
  }
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const vertex = queue.shift();
    if (visited.has(vertex)) continue;
    visited.add(vertex);
    for (const neighbor of adjacency.get(vertex) || []) queue.push(neighbor);
  }
  if (visited.size !== receipt.vertexRange.vertexCount) {
    throw new Error(`${receipt.side} upper-limb surface is not one connected component`);
  }
  return {
    side: receipt.side,
    connectedVertexCount: visited.size,
    expectedVertexCount: receipt.vertexRange.vertexCount,
  };
}

export async function compileH3LBundles(stack, plan) {
  const compiled = await compileH3KBundles(stack.inherited, plan);
  for (const record of compiled.records) {
    const limbs = record.bundle.anatomy?.upperBody?.upperLimbs;
    if (!Array.isArray(limbs) || limbs.length !== 2) {
      throw new Error(`${record.displayLabel} did not emit exactly two native upper limbs`);
    }
    for (const [index, limb] of limbs.entries()) {
      const expectedSide = index === 0 ? 'left' : 'right';
      if (
        limb.schemaVersion !== 'holoscript.agent-avatar-upper-limb-geometry.v1' ||
        limb.profile !== 'coherent-arm-palm-v1' ||
        limb.side !== expectedSide ||
        limb.radialSegments !== 24 ||
        limb.ringCount !== 8 ||
        limb.vertexRange?.vertexCount !== 193 ||
        limb.indexRange?.indexCount !== 1080
      ) {
        throw new Error(`${record.displayLabel} ${expectedSide} upper-limb receipt drifted`);
      }
    }
    record.upperLimbTopology = limbs.map((limb) =>
      proveConnectedRange(record.bundle.mesh.indices, limb)
    );
    const garment = record.bundle.garment;
    if (
      garment?.collarProfile !== 'tailored-open-v-collar-v1' ||
      !(garment.shoulderShellHalfWidth < 0.43) ||
      !(garment.sleeveRootRadius < 0.1) ||
      !(garment.sleeveWristRadius < garment.sleeveRootRadius)
    ) {
      throw new Error(`${record.displayLabel} tailored civic garment receipt drifted`);
    }
  }
  return compiled;
}

export function classifyFreshRtxReceipt(receipt) {
  const blockers = [];
  if (!receipt) blockers.push('fresh-rtx-receipt-missing');
  if (receipt?.installerProcessRunning !== false) blockers.push('driver-installer-not-proven-idle');
  if (receipt?.pendingDriverRestart !== false) blockers.push('driver-restart-state-not-clear');
  if (receipt?.browserProbePassed !== true) blockers.push('browser-webgpu-probe-not-passed');
  if (receipt?.sceneCapturePassed !== true) blockers.push('current-scene-capture-not-passed');
  if (receipt?.gpuName !== EXPECTED_GPU) blockers.push('expected-rtx-gpu-not-proven');
  if (!/^\d+\.\d+$/.test(receipt?.driverVersion || '')) blockers.push('driver-version-not-recorded');
  if (!receipt?.measuredAt) blockers.push('measurement-time-not-recorded');
  return {
    status: blockers.length ? 'blocked' : 'pass',
    blockers,
    historicalEvidenceCountsAsCurrent: false,
  };
}

function validateManifest(root) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) return { status: 'missing', errors: ['manifest missing'] };
  const text = readFileSync(manifestPath, 'utf8');
  const bindings = [
    [SOURCE_REL, /sourceSha256:\s*"([0-9a-f]{64})"/],
    [POLICY_REL, /policySha256:\s*"([0-9a-f]{64})"/],
    [SEED_REL, /seedSha256:\s*"([0-9a-f]{64})"/],
    [
      'scripts/check-hololand-model-village-character-appearance-h3l.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3l.test.mjs',
      /testSha256:\s*"([0-9a-f]{64})"/,
    ],
    [REPORT_REL, /reportSha256:\s*"([0-9a-f]{64})"/],
  ];
  const errors = [];
  for (const [relative, pattern] of bindings) {
    const match = text.match(pattern);
    const absolute = path.join(root, relative);
    if (!match || !existsSync(absolute) || match[1] !== sha256File(absolute)) {
      errors.push(`${relative} manifest binding drifted`);
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: path.join(ROOT, OUTPUT_REL),
    requireManifest: false,
    requireFreshRtx: false,
    freshRtxReceipt: null,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--require-manifest') options.requireManifest = true;
    else if (arg === '--require-fresh-rtx') options.requireFreshRtx = true;
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--fresh-rtx-receipt') {
      options.freshRtxReceipt = JSON.parse(readFileSync(path.resolve(argv[++index]), 'utf8'));
    }
  }
  return options;
}

export async function runCharacterAppearanceH3L(options = parseArgs([])) {
  const stack = await parseH3LStack(options.root, options.holoScriptRoot);
  const validation = validateH3LContract(stack, options.root, options.holoScriptRoot);
  if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
  const compiled = await compileH3LBundles(stack, validation.plan);
  const esbuild = await loadEsbuild(options.holoScriptRoot);
  const clearance = await proveH3KPoseClearance(
    compiled,
    validation.plan,
    options.holoScriptRoot,
    options.outputDir,
    { esbuild }
  );
  esbuild.stop?.();
  const freshRtx = classifyFreshRtxReceipt(options.freshRtxReceipt);
  if (options.requireFreshRtx && freshRtx.status !== 'pass') {
    throw new Error(`fresh RTX gate blocked: ${freshRtx.blockers.join(', ')}`);
  }
  const manifest = options.requireManifest
    ? validateManifest(options.root)
    : { status: 'not-required', errors: [] };
  if (manifest.status === 'fail' || manifest.status === 'missing') {
    throw new Error(manifest.errors.join('\n'));
  }
  const receipt = {
    schema: 'hololand.model-village.character-appearance-h3l-witness.v1',
    status: 'pass',
    generatedAt: new Date().toISOString(),
    source: {
      path: SOURCE_REL,
      sha256: sha256(stack.sourceText),
      inheritedPath: INHERITED_REL,
      inheritedSha256: sha256(stack.inherited.sourceText),
      upstreamHoloScriptCommit: stack.contract.metadata.upstreamHoloScriptCommit,
    },
    policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
    seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
    admission: {
      compilerTarget: 'character-webgpu',
      nativeBundleCount: compiled.records.length,
      upperLimbReceiptCount: compiled.records.reduce(
        (sum, record) => sum + record.bundle.anatomy.upperBody.upperLimbs.length,
        0
      ),
      connectedUpperLimbComponentCount: compiled.records.reduce(
        (sum, record) => sum + record.upperLimbTopology.length,
        0
      ),
      tailoredGarmentReceiptCount: compiled.records.filter(
        (record) => record.bundle.garment.collarProfile === 'tailored-open-v-collar-v1'
      ).length,
      poseClearanceReceiptCount: clearance.receipts.length,
      triangleIntersectionCount: clearance.receipts.reduce(
        (sum, item) => sum + item.triangleIntersectionCount,
        0
      ),
      minimumClearanceMeters: Math.min(
        ...clearance.receipts.map((item) => item.minimumClearanceMeters)
      ),
      minimumCoveredRayRatio: Math.min(
        ...clearance.receipts.map((item) => item.coveredRayRatio)
      ),
      repeatedCompileByteIdentity: true,
      strippedUpperBodyDelta: compiled.records.every(
        (record) => record.comparisons.strippedUpperBody.geometryChanged
      ),
    },
    records: compiled.records.map((record) => ({
      objectId: record.objectId,
      displayLabel: record.displayLabel,
      modelFamilyId: record.modelFamilyId,
      geometrySha256: record.geometrySha256,
      upperLimbs: record.bundle.anatomy.upperBody.upperLimbs,
      upperLimbTopology: record.upperLimbTopology,
      garment: record.bundle.garment,
    })),
    poseClearance: clearance.receipts,
    freshRtx,
    manifest,
    boundaries: {
      providerModelBinding: 'absent',
      currentDriverInstallBenchmarkClaimed: false,
      historicalRtxEvidenceCountsAsCurrent: false,
      heroCaptureClaimed: false,
      nativeWebgpuTaaClaimed: false,
      questWebxrMeasured: false,
      photorealismClaimed: false,
    },
  };
  const finalReceipt = {
    ...receipt,
    receiptSha256: sha256(JSON.stringify(canonical(receipt))),
  };
  const receiptDir = path.join(options.outputDir, 'final');
  mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, 'character-appearance-h3l-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
  return { receipt: finalReceipt, receiptPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3L(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            receiptSha256: receipt.receiptSha256,
            receiptPath,
            nativeBundleCount: receipt.admission.nativeBundleCount,
            upperLimbReceiptCount: receipt.admission.upperLimbReceiptCount,
            connectedUpperLimbComponentCount:
              receipt.admission.connectedUpperLimbComponentCount,
            tailoredGarmentReceiptCount: receipt.admission.tailoredGarmentReceiptCount,
            poseClearanceReceiptCount: receipt.admission.poseClearanceReceiptCount,
            triangleIntersectionCount: receipt.admission.triangleIntersectionCount,
            minimumClearanceMeters: receipt.admission.minimumClearanceMeters,
            minimumCoveredRayRatio: receipt.admission.minimumCoveredRayRatio,
            freshRtx: receipt.freshRtx,
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
