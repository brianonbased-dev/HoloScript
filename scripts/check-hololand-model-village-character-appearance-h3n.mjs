#!/usr/bin/env node
/* global process */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  parseH3MStack,
  sha256,
} from './check-hololand-model-village-character-appearance-h3m.mjs';
import {
  buildH3KPlan,
  proveH3KPoseClearance,
} from './check-hololand-model-village-character-appearance-h3k.mjs';

import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3n-hand-landmarks-taa-lod.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3n-hand-landmarks-taa-lod-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3n-hand-landmarks-taa-lod-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3n-hand-landmarks-taa-lod-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3n-hand-landmarks-taa-lod-2026-07-28.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3n-hand-landmarks-taa-lod-2026-07-28.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3n-hand-landmarks-taa-lod-2026-07-28.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3n';
const EXPECTED_COMMIT = 'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXPECTED_DIGITS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const EXPECTED_LANDMARK_COUNTS = {
  'interdigital-web': 4,
  'metacarpal-knuckle': 5,
  'dorsal-tendon-ridge': 4,
  'nail-plate': 5,
};
const HASH_BINDINGS = [
  ['inheritedH3MSource', 'inheritedH3MSourceSha256', 'hololand'],
  ['upstreamBodyBuilderPath', 'upstreamBodyBuilderSha256', 'holoscript'],
  ['upstreamGarmentBuilderPath', 'upstreamGarmentBuilderSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamHairBuilderPath', 'upstreamHairBuilderSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
  ['upstreamTaaReferencePath', 'upstreamTaaReferenceSha256', 'holoscript'],
];

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

function packRgb(value) {
  return Number.parseInt(String(value).replace('#', ''), 16);
}

function meshSha(bundle) {
  return sha256(JSON.stringify(canonical(bundle.mesh)));
}

function overlap(a, b) {
  const aEnd = a.indexStart + a.indexCount;
  const bEnd = b.indexStart + b.indexCount;
  return a.indexStart < bEnd && b.indexStart < aEnd;
}

function proveConnectedRange(indices, receipt, label) {
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
      throw new Error(`${label} index escaped its declared vertex range`);
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
    throw new Error(`${label} is not one connected surface`);
  }
  return visited.size;
}

async function loadTaaReference(stack, holoScriptRoot, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const outfile = path.join(outputDir, 'h3n-screen-space-effects.mjs');
  await stack.esbuild.build({
    entryPoints: [path.join(holoScriptRoot, 'packages/engine/src/rendering/ScreenSpaceEffects.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    sourcemap: false,
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(outfile).href}?sha=${sha256File(outfile)}`);
}

async function captureH3NBrowser(compiled, clearance, options) {
  const sourcePath = path.join(
    options.root,
    'scripts/check-hololand-model-village-character-appearance-h3k.mjs'
  );
  const bridgePath = path.join(options.outputDir, 'h3n-h3k-visual-bridge.mjs');
  const bridgeSource = readFileSync(sourcePath, 'utf8')
    .replace(
      'async function loadWorkspaceModules(holoScriptRoot)',
      'export async function loadWorkspaceModules(holoScriptRoot)'
    )
    .replace(
      'async function buildBrowserSurface(compiled, clearance, options, modules)',
      'export async function buildBrowserSurface(compiled, clearance, options, modules)'
    )
    .replace(
      'async function captureBrowser(surface, options, modules)',
      'export async function captureBrowser(surface, options, modules)'
    );
  writeFileSync(bridgePath, bridgeSource, 'utf8');
  const bridge = await import(`${pathToFileURL(bridgePath).href}?sha=${sha256(bridgeSource)}`);
  const modules = await bridge.loadWorkspaceModules(options.holoScriptRoot);
  try {
    const surface = await bridge.buildBrowserSurface(compiled, clearance, options, modules);
    const html = readFileSync(surface.htmlPath, 'utf8')
      .replaceAll('NATIVE CHARACTER H3K', 'NATIVE CHARACTER H3N')
      .replaceAll('Coherent Upper-Body Convergence', 'Hand Landmark and LOD Convergence')
      .replaceAll(
        '@body(coherent_shoulder_neck_torso_v1) + @clothing(open_civic)',
        '@body(coherent_hand_landmarks_v3) + @lod(distance,dither)'
      )
      .replaceAll(
        '4 NAMED RESIDENTS · 12 POSE-CLEARANCE RECEIPTS · ZERO EXTERNAL TEXTURES',
        '4 RESIDENTS · 144 HAND LANDMARKS · 12 LOD RECEIPTS · ZERO EXTERNAL TEXTURES'
      );
    writeFileSync(surface.htmlPath, html, 'utf8');
    const visual = await bridge.captureBrowser(surface, options, modules);
    return {
      ...visual,
      sourceCompiledH3NGeometry: true,
      sourceCompiledLandmarkReceiptCount: 144,
      sourceCompiledLodReceiptCount: 12,
      visualBridge: 'three_webgl_angle_d3d11',
      nativeSceneWebgpuClaimed: false,
      nativeSceneTaaClaimed: false,
      bridgeModuleSha256: sha256(bridgeSource),
    };
  } finally {
    modules.esbuild.stop?.();
  }
}

function variance(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function rmse(actual, expected) {
  return Math.sqrt(
    actual.reduce((sum, value, index) => sum + (value - expected[index]) ** 2, 0) /
      actual.length
  );
}

function runTaaReferenceOnce(toolchain) {
  const width = 64;
  const height = 8;
  const sampleCount = 16;
  const feedback = 0.9;
  const jitterScale = 0.5;
  const edge = 31.48;
  const frames = [];
  const jitters = [];
  for (let frameIndex = 0; frameIndex < sampleCount; frameIndex++) {
    const jitter = toolchain.haltonJitter(frameIndex);
    jitters.push(jitter);
    const pixels = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const luminance = x + 0.5 + jitter[0] * jitterScale < edge ? 0.08 : 0.92;
        const offset = (y * width + x) * 4;
        pixels[offset] = luminance;
        pixels[offset + 1] = luminance;
        pixels[offset + 2] = luminance;
        pixels[offset + 3] = 1;
      }
    }
    frames.push(pixels);
  }
  const reference = new Float32Array(frames[0].length);
  for (const frame of frames) {
    for (let index = 0; index < frame.length; index++) {
      reference[index] += frame[index] / frames.length;
    }
  }
  const history = new Float32Array(frames[0]);
  const currentProbe = [frames[0][(3 * width + 31) * 4]];
  const historyProbe = [history[(3 * width + 31) * 4]];
  for (let frameIndex = 1; frameIndex < frames.length; frameIndex++) {
    const output = toolchain.blendTAA(frames[frameIndex], history, width, height, {
      feedback,
      jitterScale,
    });
    currentProbe.push(frames[frameIndex][(3 * width + 31) * 4]);
    historyProbe.push(output[(3 * width + 31) * 4]);
  }
  const meanCurrentRmse =
    frames.reduce((sum, frame) => sum + rmse(frame, reference), 0) / frames.length;
  return {
    implementation: 'holoscript_screen_space_cpu_reference',
    width,
    height,
    sampleCount,
    feedback,
    jitterScale,
    haltonJitters: jitters,
    probePixel: [31, 3],
    currentProbe,
    historyProbe,
    currentProbeVarianceLast8: variance(currentProbe.slice(-8)),
    historyProbeVarianceLast8: variance(historyProbe.slice(-8)),
    meanCurrentFrameRmseToSampleMean: meanCurrentRmse,
    finalHistoryRmseToSampleMean: rmse(history, reference),
    nativeSceneTaaClaimed: false,
  };
}

export async function proveH3NTaaReference(stack, holoScriptRoot, outputDir) {
  const toolchain = await loadTaaReference(stack, holoScriptRoot, outputDir);
  const first = runTaaReferenceOnce(toolchain);
  const second = runTaaReferenceOnce(toolchain);
  const firstCanonical = JSON.stringify(canonical(first));
  const secondCanonical = JSON.stringify(canonical(second));
  if (firstCanonical !== secondCanonical) {
    throw new Error('H3N TAA reference convergence was not deterministic');
  }
  if (
    !(first.historyProbeVarianceLast8 < first.currentProbeVarianceLast8) ||
    !(first.finalHistoryRmseToSampleMean < first.meanCurrentFrameRmseToSampleMean)
  ) {
    throw new Error('H3N TAA reference did not reduce controlled temporal/spatial error');
  }
  return {
    ...first,
    repeatedRunByteIdentity: true,
    receiptSha256: sha256(firstCanonical),
  };
}

export async function parseH3NStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
  outputDir = path.join(root, OUTPUT_REL)
) {
  const stack = await parseH3MStack(root, holoScriptRoot, outputDir);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new stack.toolchain.HoloCompositionParser().parse(sourceText);
  const policy = new stack.toolchain.HoloScriptPlusParser().parse(policyText);
  const seed = new stack.toolchain.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3N .holo', source],
    ['H3N .hsplus', policy],
    ['H3N .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      stack.esbuild.stop?.();
      throw new Error(`${label} parse failed: ${JSON.stringify(parsed.errors)}`);
    }
  }
  return {
    ...stack,
    source,
    policy,
    seed,
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

export function validateH3NContract(
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
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3N_HAND_LANDMARKS_TAA_LOD',
    'milestone drifted'
  );
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'upstream commit pin drifted');
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  for (const [pathKey, hashKey, owner] of HASH_BINDINGS) {
    const base = owner === 'holoscript' ? holoScriptRoot : root;
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
    ['nativeHandLandmarkReceiptClaimed', true],
    ['nativeNailMaterialSeparationClaimed', true],
    ['nativeAuthoredLodClaimed', true],
    ['repeatedCompileByteIdentityClaimed', true],
    ['strippedHandLandmarkDeltaClaimed', true],
    ['inheritedPoseClearanceClaimed', true],
    ['referenceTaaConvergenceClaimed', true],
    ['torsoToLimbSharedTopologyClaimed', false],
    ['palmToDigitSharedTopologyClaimed', false],
    ['landmarkToHandSharedTopologyClaimed', false],
    ['freshRtxBenchmarkClaimed', false],
    ['historicalRtxEvidenceMayBeReusedAsCurrent', false],
    ['sceneWebgpuRenderingClaimed', false],
    ['nativeWebgpuTaaClaimed', false],
    ['gpuTimestampFrameTimeClaimed', false],
    ['questWebxrMeasured', false],
    ['productionSkinTexturingClaimed', false],
    ['productionGroomClaimed', false],
    ['biometricLikenessClaimed', false],
    ['photorealismClaimed', false],
    ['fullWorldConvergenceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    JSON.stringify(state.residentNames) === JSON.stringify(EXPECTED_RESIDENTS),
    'resident names drifted'
  );
  const hand = state.handFoundation;
  expect(
    hand?.authoredProfile === 'coherent-hand-landmarks-v3' &&
      hand?.upperBodyProfile === 'anatomical-hand-landmarks-v3' &&
      hand?.limbProfile === 'anatomical-landmark-hand-v3' &&
      hand?.digitProfile === 'articulated-three-phalanx-v1' &&
      hand?.landmarkProfile === 'anatomical-hand-landmark-v1' &&
      hand?.landmarkCountPerHand === 18 &&
      hand?.webCountPerHand === 4 &&
      hand?.knuckleCountPerHand === 5 &&
      hand?.tendonCountPerHand === 4 &&
      hand?.nailCountPerHand === 5 &&
      hand?.connectedSurfaceCountPerLimb === 24 &&
      hand?.nailMaterialRole === 'keratin-nail' &&
      hand?.nailMaterialShadingModel === 'skin-sss',
    'hand foundation drifted'
  );
  const quality = state.qualityFoundation;
  expect(
    JSON.stringify(quality?.lodLevels) === '[0,1,2]' &&
      JSON.stringify(quality?.lodDistancesMeters) === '[0,8,20]' &&
      JSON.stringify(quality?.lodGarmentSegments) === '[24,14,8]' &&
      JSON.stringify(quality?.lodHairGuides) === '[168,92,48]' &&
      JSON.stringify(quality?.lodHairCardsPerGuide) === '[2,1,1]' &&
      JSON.stringify(quality?.lodHairSegments) === '[7,5,3]' &&
      quality?.lodSelectionMode === 'distance' &&
      quality?.lodFadeMode === 'dither' &&
      quality?.lodFadeDurationMilliseconds === 260 &&
      quality?.lodHysteresisBand === 0.65 &&
      quality?.taaReferenceImplementation === 'holoscript_screen_space_cpu_reference' &&
      quality?.taaSampleCount === 16 &&
      quality?.taaFeedback === 0.9 &&
      quality?.taaJitterScale === 0.5 &&
      quality?.taaNativeSceneClaimed === false,
    'quality foundation drifted'
  );
  expect(objects.length === 4, 'exactly four resident objects are required');
  const plan = buildH3KPlan(stack);
  expect(
    JSON.stringify(plan.residents.map((resident) => resident.displayLabel)) ===
      JSON.stringify(EXPECTED_RESIDENTS),
    'resident order drifted'
  );
  expect(plan.poses.length === 3, 'pose probe count drifted');
  for (const resident of plan.residents) {
    const object = stack.source.ast.objects?.find(
      (candidate) => candidate.name === resident.objectId
    );
    const body = object?.traits?.find((trait) => trait.name === 'body');
    const lod = object?.traits?.find((trait) => trait.name === 'lod');
    expect(
      body?.config?.upper_body_profile === 'coherent_hand_landmarks_v3' &&
        body?.config?.upper_body_radial_segments === 24 &&
        /^#[0-9A-Fa-f]{6}$/.test(body?.config?.nail_tone || '') &&
        body?.config?.nail_roughness >= 0.08 &&
        body?.config?.nail_roughness <= 0.65,
      `${resident.displayLabel} hand controls drifted`
    );
    expect(
      lod?.config?.mode === 'distance' &&
        lod?.config?.fade_mode === 'dither' &&
        lod?.config?.fade_duration_ms === 260 &&
        lod?.config?.hysteresis === 0.65 &&
        JSON.stringify(lod?.config?.levels?.map((level) => level.level)) === '[0,1,2]',
      `${resident.displayLabel} LOD controls drifted`
    );
  }
  return { status: errors.length ? 'fail' : 'pass', errors, plan };
}

function withoutHandLandmarks(ast) {
  const copy = structuredClone(ast);
  for (const object of copy.objects || []) {
    const body = object.traits?.find((trait) => trait.name === 'body');
    if (!body) continue;
    body.config.upper_body_profile = 'coherent_anatomical_limbs_v2';
    delete body.config.nail_tone;
    delete body.config.nail_roughness;
  }
  return copy;
}

async function compileOne(toolchain, ast, resident, lodLevel) {
  return new toolchain.CharacterWebGPUCompiler({
    objectId: resident.objectId,
    entityId: `model-village-h3n-${resident.modelFamilyId}`,
    lodLevel,
  }).compile(ast);
}

export async function compileH3NBundles(stack, plan) {
  const records = [];
  const baselineAst = withoutHandLandmarks(stack.source.ast);
  for (const resident of plan.residents) {
    const levelOutputs = [];
    for (const lodLevel of [0, 1, 2]) {
      const first = await compileOne(stack.toolchain, stack.source.ast, resident, lodLevel);
      const second = await compileOne(stack.toolchain, stack.source.ast, resident, lodLevel);
      if (first !== second) {
        throw new Error(`${resident.displayLabel} LOD${lodLevel} compile was not byte-identical`);
      }
      levelOutputs.push({ output: first, bundle: JSON.parse(first) });
    }
    const bundle = levelOutputs[0].bundle;
    const baseline = JSON.parse(await compileOne(stack.toolchain, baselineAst, resident, 0));
    const upperBody = bundle.anatomy?.upperBody;
    if (
      bundle.format !== 'character-webgpu/drawspec' ||
      bundle.report?.stubbed?.length !== 0 ||
      upperBody?.schemaVersion !== 'holoscript.agent-avatar-upper-body-geometry.v1' ||
      upperBody?.profile !== 'anatomical-hand-landmarks-v3' ||
      bundle.garment?.fitProfile !== 'coherent-upper-body-clearance-v1'
    ) {
      throw new Error(`${resident.displayLabel} native H3N bundle contract drifted`);
    }
    const sourceObject = stack.source.ast.objects?.find(
      (candidate) => candidate.name === resident.objectId
    );
    const body = sourceObject?.traits?.find((trait) => trait.name === 'body');
    const expectedNailTone = packRgb(body.config.nail_tone);
    const expectedNailRoughness = body.config.nail_roughness;
    const landmarkTopology = [];
    const digitTopology = [];
    const nailRanges = [];
    for (const [sideIndex, limb] of upperBody.upperLimbs.entries()) {
      const expectedSide = sideIndex === 0 ? 'left' : 'right';
      if (
        limb.profile !== 'anatomical-landmark-hand-v3' ||
        limb.side !== expectedSide ||
        limb.connectedSurfaceCount !== 24 ||
        JSON.stringify(limb.digits?.map((digit) => digit.digit)) !==
          JSON.stringify(EXPECTED_DIGITS) ||
        limb.handLandmarks?.length !== 18
      ) {
        throw new Error(`${resident.displayLabel} ${expectedSide} H3N limb receipt drifted`);
      }
      const kindCounts = Object.fromEntries(
        Object.keys(EXPECTED_LANDMARK_COUNTS).map((kind) => [
          kind,
          limb.handLandmarks.filter((landmark) => landmark.kind === kind).length,
        ])
      );
      if (
        Object.entries(EXPECTED_LANDMARK_COUNTS).some(
          ([kind, count]) => kindCounts[kind] !== count
        )
      ) {
        throw new Error(`${resident.displayLabel} ${expectedSide} landmark kinds drifted`);
      }
      for (const digit of limb.digits) {
        const connectedVertexCount = proveConnectedRange(
          bundle.mesh.indices,
          digit,
          `${resident.displayLabel} ${expectedSide} ${digit.digit}`
        );
        digitTopology.push({ side: expectedSide, digit: digit.digit, connectedVertexCount });
      }
      for (const landmark of limb.handLandmarks) {
        const connectedVertexCount = proveConnectedRange(
          bundle.mesh.indices,
          landmark,
          `${resident.displayLabel} ${expectedSide} ${landmark.kind}`
        );
        const joints = bundle.mesh.jointIndices.slice(
          landmark.vertexRange.vertexStart,
          landmark.vertexRange.vertexStart + landmark.vertexRange.vertexCount
        );
        if (joints.some((joint) => joint < 0 || joint >= bundle.jointCount)) {
          throw new Error(`${resident.displayLabel} ${expectedSide} landmark joint escaped rig`);
        }
        if (landmark.kind === 'nail-plate') {
          if (landmark.materialRole !== 'keratin-nail') {
            throw new Error(`${resident.displayLabel} ${expectedSide} nail role drifted`);
          }
          nailRanges.push(landmark.indexRange);
        } else if (landmark.materialRole !== 'skin') {
          throw new Error(`${resident.displayLabel} ${expectedSide} skin landmark role drifted`);
        }
        landmarkTopology.push({
          side: expectedSide,
          kind: landmark.kind,
          digit: landmark.digit,
          betweenDigits: landmark.betweenDigits,
          materialRole: landmark.materialRole,
          connectedVertexCount,
        });
      }
    }
    const groups = bundle.materialGroups || [];
    const nailGroups = nailRanges.map((range) =>
      groups.find(
        (group) =>
          group.indexStart === range.indexStart &&
          group.indexCount === range.indexCount &&
          group.material?.shadingModel === 'skin-sss' &&
          group.material?.color === expectedNailTone &&
          group.material?.roughness === expectedNailRoughness
      )
    );
    if (nailGroups.some((group) => !group)) {
      throw new Error(`${resident.displayLabel} nail material separation drifted`);
    }
    const skinGroups = groups.filter(
      (group) =>
        group.material?.shadingModel === 'skin-sss' && group.material?.color !== expectedNailTone
    );
    if (nailRanges.some((range) => skinGroups.some((group) => overlap(range, group)))) {
      throw new Error(`${resident.displayLabel} nail range overlapped a skin draw`);
    }
    const lodReceipts = levelOutputs.map(({ bundle: levelBundle }) => ({
      ...levelBundle.lod,
      vertexCount: levelBundle.vertexCount,
      indexCount: levelBundle.indexCount,
      geometrySha256: meshSha(levelBundle),
    }));
    if (
      lodReceipts.some(
        (lod, level) =>
          lod.level !== level ||
          lod.transition?.selectionMode !== 'distance' ||
          lod.transition?.mode !== 'dither' ||
          lod.transition?.durationSeconds !== 0.26 ||
          lod.transition?.hysteresisBand !== 0.65
      ) ||
      !(lodReceipts[0].vertexCount > lodReceipts[1].vertexCount) ||
      !(lodReceipts[1].vertexCount > lodReceipts[2].vertexCount)
    ) {
      throw new Error(`${resident.displayLabel} authored LOD topology did not descend`);
    }
    const geometrySha256 = meshSha(bundle);
    const baselineGeometrySha256 = meshSha(baseline);
    if (
      baseline.anatomy?.upperBody?.upperLimbs?.some((limb) => limb.handLandmarks) ||
      baselineGeometrySha256 === geometrySha256
    ) {
      throw new Error(`${resident.displayLabel} stripped H3N causal delta failed`);
    }
    records.push({
      ...resident,
      bundle,
      geometrySha256,
      landmarkTopology,
      digitTopology,
      nailMaterialGroupCount: nailGroups.length,
      lodReceipts,
      comparisons: {
        strippedHandLandmarks: {
          baselineLandmarkReceiptsAbsent: true,
          geometryChanged: baselineGeometrySha256 !== geometrySha256,
          vertexDelta: bundle.vertexCount - baseline.vertexCount,
          baselineGeometrySha256,
        },
      },
    });
  }
  return { records };
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
      'scripts/check-hololand-model-village-character-appearance-h3n.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3n.test.mjs',
      /testSha256:\s*"([0-9a-f]{64})"/,
    ],
    [REPORT_REL, /reportSha256:\s*"([0-9a-f]{64})"/],
    [HERO_REL, /heroSha256:\s*"([0-9a-f]{64})"/],
    [EVIDENCE_REL, /evidenceSha256:\s*"([0-9a-f]{64})"/],
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
    heroOutput: path.join(ROOT, HERO_REL),
    browser: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    captureVisual: false,
    requireManifest: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--require-manifest') options.requireManifest = true;
    else if (arg === '--capture-visual') options.captureVisual = true;
    else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
  }
  return options;
}

export async function runCharacterAppearanceH3N(options = parseArgs([])) {
  const stack = await parseH3NStack(options.root, options.holoScriptRoot, options.outputDir);
  try {
    const validation = validateH3NContract(stack, options.root, options.holoScriptRoot);
    if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
    const compiled = await compileH3NBundles(stack, validation.plan);
    const clearance = await proveH3KPoseClearance(
      compiled,
      validation.plan,
      options.holoScriptRoot,
      options.outputDir,
      { esbuild: stack.esbuild }
    );
    const taa = await proveH3NTaaReference(stack, options.holoScriptRoot, options.outputDir);
    const visual = options.captureVisual
      ? await captureH3NBrowser(compiled, clearance, options)
      : null;
    const manifest = options.requireManifest
      ? validateManifest(options.root)
      : { status: 'not-required', errors: [] };
    if (manifest.status === 'fail' || manifest.status === 'missing') {
      throw new Error(manifest.errors.join('\n'));
    }
    const allLandmarks = compiled.records.flatMap((record) => record.landmarkTopology);
    const receipt = {
      schema: 'hololand.model-village.character-appearance-h3n-witness.v1',
      status: 'pass',
      generatedAt: new Date().toISOString(),
      source: {
        path: SOURCE_REL,
        sha256: sha256(stack.sourceText),
        upstreamHoloScriptCommit: stack.contract.metadata.upstreamHoloScriptCommit,
      },
      policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
      seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
      admission: {
        compilerTarget: 'character-webgpu',
        compilerEntrypoint: 'CharacterWebGPUCompiler.compile',
        nativeBundleCount: compiled.records.length,
        limbReceiptCount: 8,
        digitReceiptCount: compiled.records.reduce(
          (sum, record) => sum + record.digitTopology.length,
          0
        ),
        handLandmarkReceiptCount: allLandmarks.length,
        webReceiptCount: allLandmarks.filter((item) => item.kind === 'interdigital-web').length,
        knuckleReceiptCount: allLandmarks.filter((item) => item.kind === 'metacarpal-knuckle')
          .length,
        tendonReceiptCount: allLandmarks.filter((item) => item.kind === 'dorsal-tendon-ridge')
          .length,
        nailReceiptCount: allLandmarks.filter((item) => item.kind === 'nail-plate').length,
        connectedSurfaceCount: compiled.records.reduce(
          (sum, record) =>
            sum +
            record.bundle.anatomy.upperBody.upperLimbs.reduce(
              (limbSum, limb) => limbSum + limb.connectedSurfaceCount,
              0
            ),
          0
        ),
        nailMaterialGroupCount: compiled.records.reduce(
          (sum, record) => sum + record.nailMaterialGroupCount,
          0
        ),
        lodReceiptCount: compiled.records.reduce(
          (sum, record) => sum + record.lodReceipts.length,
          0
        ),
        poseClearanceReceiptCount: clearance.receipts.length,
        triangleIntersectionCount: clearance.receipts.reduce(
          (sum, item) => sum + item.triangleIntersectionCount,
          0
        ),
        minimumClearanceMeters: Math.min(
          ...clearance.receipts.map((item) => item.minimumClearanceMeters)
        ),
        minimumCoveredRayRatio: Math.min(...clearance.receipts.map((item) => item.coveredRayRatio)),
        repeatedCompileByteIdentity: true,
        strippedHandLandmarkDelta: compiled.records.every(
          (record) => record.comparisons.strippedHandLandmarks.geometryChanged
        ),
      },
      records: compiled.records.map((record) => ({
        objectId: record.objectId,
        displayLabel: record.displayLabel,
        modelFamilyId: record.modelFamilyId,
        geometrySha256: record.geometrySha256,
        landmarkTopology: record.landmarkTopology,
        nailMaterialGroupCount: record.nailMaterialGroupCount,
        lodReceipts: record.lodReceipts,
        comparisons: record.comparisons,
      })),
      poseClearance: clearance.receipts,
      taaReference: taa,
      visual,
      manifest,
      boundaries: {
        providerModelBinding: 'absent',
        landmarkToHandSharedTopologyClaimed: false,
        freshRtxBenchmarkClaimed: false,
        historicalRtxEvidenceCountsAsCurrent: false,
        sceneWebgpuRenderingClaimed: false,
        nativeWebgpuTaaClaimed: false,
        gpuTimestampFrameTimeClaimed: false,
        questWebxrMeasured: false,
        productionSkinTexturingClaimed: false,
        productionGroomClaimed: false,
        photorealismClaimed: false,
      },
    };
    const finalReceipt = {
      ...receipt,
      receiptSha256: sha256(JSON.stringify(canonical(receipt))),
    };
    const receiptDir = path.join(options.outputDir, 'final');
    mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, 'character-appearance-h3n-witness.json');
    writeFileSync(receiptPath, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
    return { receipt: finalReceipt, receiptPath, compiled, clearance, taa, visual };
  } finally {
    stack.esbuild.stop?.();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3N(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            receiptSha256: receipt.receiptSha256,
            receiptPath,
            ...receipt.admission,
            taaReference: {
              receiptSha256: receipt.taaReference.receiptSha256,
              currentProbeVarianceLast8: receipt.taaReference.currentProbeVarianceLast8,
              historyProbeVarianceLast8: receipt.taaReference.historyProbeVarianceLast8,
              meanCurrentFrameRmseToSampleMean:
                receipt.taaReference.meanCurrentFrameRmseToSampleMean,
              finalHistoryRmseToSampleMean:
                receipt.taaReference.finalHistoryRmseToSampleMean,
            },
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
