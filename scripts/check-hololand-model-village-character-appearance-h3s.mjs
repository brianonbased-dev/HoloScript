#!/usr/bin/env node
/* global process, performance */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

import {
  parseH3MStack,
  sha256,
} from './check-hololand-model-village-character-appearance-h3m.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3s-hand-surface-anatomy.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3s-hand-surface-anatomy-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3s-hand-surface-anatomy-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3s-hand-surface-anatomy-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3s-hand-surface-anatomy-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3s-hand-surface-anatomy-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3s-hand-surface-anatomy-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3s';
const EXPECTED_COMMIT = '8f1555f8a8ccf16a3745b9f021bcc21cf87e2b96';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXPECTED_POSES = [
  'measured-open-palm',
  'considered-listening',
  'asymmetric-visual-framing',
  'direct-broad-challenge',
];
const V5_PROFILE = 'coherent_hand_surface_v5';
const V4_PROFILE = 'coherent_deforming_hands_v4';
const V5_RECEIPT_PROFILE = 'coherent-hand-surface-v5';
const V4_RECEIPT_PROFILE = 'coherent-deforming-hands-v4';
const HAND_SURFACE_SCHEMA = 'holoscript.agent-avatar-hand-surface.v1';
const HAND_GEOMETRY_SCHEMA = 'holoscript.agent-avatar-hand-surface-geometry.v1';
const HAND_SURFACE_PROFILE = 'tapered-digit-commissure-cuticle-wrist-v1';
const EXPECTED_VERTEX_DELTA = 1336;
const EXPECTED_INFLUENCED_VERTICES = 1008;
const EXPECTED_JOINT_PAIRS = 38;
const EXPECTED_REGION_VERTEX_COUNTS = {
  wristTransition: 288,
  digitSections: 1690,
  metacarpalKnuckles: 260,
  interdigitalCommissures: 560,
  nailCuticles: 980,
};
const EXPECTED_REGION_INDEX_COUNTS = {
  wristTransition: 1728,
  digitSections: 9720,
  metacarpalKnuckles: 1440,
  interdigitalCommissures: 3264,
  nailCuticles: 5760,
};
const HASH_BINDINGS = [
  ['inheritedH3RSource', 'inheritedH3RSourceSha256', 'hololand'],
  ['upstreamAvatarMeshPath', 'upstreamAvatarMeshSha256', 'holoscript'],
  ['upstreamDrawSpecPath', 'upstreamDrawSpecSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamNativeRendererPath', 'upstreamNativeRendererSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
];
const CLEAR = [2, 8, 17];
const LIGHT_DIR = [0.32, 0.72, 0.61];
const PANEL_SIZE = 320;
const CONTACT_GUTTER = 6;

// The HEAD-equality assertion this replaced demanded one exact commit; eighteen gates
// demanded eighteen different ones, so the set could never be satisfied at once. See
// scripts/lib/model-village-upstream-commit-pin.mjs for the full reasoning.
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

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function sha256ManifestFile(filePath) {
  const bytes = readFileSync(filePath);
  if (path.extname(filePath).toLowerCase() === '.png') return sha256(bytes);
  return sha256(bytes.toString('utf8').replace(/\r\n?/gu, '\n'));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (ArrayBuffer.isView(value)) return Array.from(value);
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

function gitHead(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

function packRgb(value) {
  return Number.parseInt(String(value).replace('#', ''), 16);
}

function changedPixelStats(a, b) {
  let changedPixelCount = 0;
  let absoluteChannelDiff = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    const delta =
      Math.abs(a.data[index] - b.data[index]) +
      Math.abs(a.data[index + 1] - b.data[index + 1]) +
      Math.abs(a.data[index + 2] - b.data[index + 2]);
    absoluteChannelDiff += delta;
    if (delta > 8) changedPixelCount += 1;
  }
  return { changedPixelCount, absoluteChannelDiff };
}

function figurePixelCount(grid) {
  let count = 0;
  for (let index = 0; index < grid.data.length; index += 4) {
    const delta =
      Math.abs(grid.data[index] - CLEAR[0]) +
      Math.abs(grid.data[index + 1] - CLEAR[1]) +
      Math.abs(grid.data[index + 2] - CLEAR[2]);
    if (delta > 25) count += 1;
  }
  return count;
}

function sanitizeAdapterInfo(info) {
  const output = {};
  for (const key of ['vendor', 'architecture', 'device', 'description', 'driver']) {
    const value = info?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      output[key] = String(value);
    }
  }
  return output;
}

async function readAdapterInfo(adapter) {
  const direct = sanitizeAdapterInfo(adapter.info);
  if (Object.keys(direct).length > 0) return direct;
  if (typeof adapter.requestAdapterInfo === 'function') {
    try {
      return sanitizeAdapterInfo(await adapter.requestAdapterInfo());
    } catch {
      return {};
    }
  }
  return {};
}

function buildContactSheet(panels) {
  const width = PANEL_SIZE * 2 + CONTACT_GUTTER * 3;
  const height = PANEL_SIZE * 4 + CONTACT_GUTTER * 5;
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = CLEAR[0];
    data[index + 1] = CLEAR[1];
    data[index + 2] = CLEAR[2];
    data[index + 3] = 255;
  }
  panels.forEach((panel, panelIndex) => {
    const column = panelIndex % 2;
    const row = Math.floor(panelIndex / 2);
    const originX = CONTACT_GUTTER + column * (PANEL_SIZE + CONTACT_GUTTER);
    const originY = CONTACT_GUTTER + row * (PANEL_SIZE + CONTACT_GUTTER);
    for (let y = 0; y < PANEL_SIZE; y += 1) {
      const sourceStart = y * PANEL_SIZE * 4;
      const targetStart = ((originY + y) * width + originX) * 4;
      data.set(panel.grid.data.subarray(sourceStart, sourceStart + PANEL_SIZE * 4), targetStart);
    }
    const rgb = [(panel.accent >> 16) & 0xff, (panel.accent >> 8) & 0xff, panel.accent & 0xff];
    for (let x = originX; x < originX + PANEL_SIZE; x += 1) {
      for (const y of [originY - 2, originY - 1, originY + PANEL_SIZE, originY + PANEL_SIZE + 1]) {
        const offset = (y * width + x) * 4;
        data[offset] = rgb[0];
        data[offset + 1] = rgb[1];
        data[offset + 2] = rgb[2];
        data[offset + 3] = 255;
      }
    }
  });
  return { width, height, data };
}

async function loadNativeRuntime(holoScriptRoot, outputDir, esbuild) {
  mkdirSync(outputDir, { recursive: true });
  const engineEntry = path.join(outputDir, 'h3s-native-character-runtime.mjs');
  await esbuild.build({
    stdin: {
      contents: `
        export {
          buildCharacterHostFromComposition,
        } from './packages/engine/src/character-render/CharacterHostFromComposition.ts';
        export {
          deriveCharacterDetailFrame,
          deriveCharacterMaterialPlateReceipt,
          renderCharacter,
        } from './packages/engine/src/character-render/character-render.ts';
        export {
          encodePngRgba,
        } from './packages/engine/src/hologram/browser/pngEncoder.ts';
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h3s-native-character-runtime.entry.ts',
      loader: 'ts',
    },
    outfile: engineEntry,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    sourcemap: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'h3s-wgsl-raw',
        setup(build) {
          build.onResolve({ filter: /\.wgsl\?raw$/ }, (args) => ({
            path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
            namespace: 'h3s-wgsl-raw',
          }));
          build.onLoad({ filter: /.*/, namespace: 'h3s-wgsl-raw' }, (args) => ({
            contents: readFileSync(args.path, 'utf8'),
            loader: 'text',
          }));
        },
      },
    ],
  });
  const character = await import(
    `${pathToFileURL(engineEntry).href}?sha=${sha256File(engineEntry)}`
  );
  for (const required of [
    'buildCharacterHostFromComposition',
    'deriveCharacterDetailFrame',
    'deriveCharacterMaterialPlateReceipt',
    'renderCharacter',
    'encodePngRgba',
  ]) {
    if (typeof character[required] !== 'function') {
      throw new Error(`HoloScript native character runtime is missing ${required}`);
    }
  }
  const requireFromHoloScript = createRequire(path.join(holoScriptRoot, 'package.json'));
  const webGpuEntry = requireFromHoloScript.resolve('webgpu');
  const webGpu = await import(pathToFileURL(webGpuEntry).href);
  const create = webGpu.create ?? webGpu.default?.create;
  if (typeof create !== 'function') throw new Error('webgpu create() is unavailable');
  return { character, createWebGpu: create, engineEntry, webGpuEntry };
}

export async function parseH3SStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
  outputDir = path.join(root, OUTPUT_REL)
) {
  const stack = await parseH3MStack(root, holoScriptRoot, outputDir);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const manifestPath = path.join(root, MANIFEST_REL);
  const manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  const v4SourceText = sourceText.replaceAll(V5_PROFILE, V4_PROFILE);
  const source = new stack.toolchain.HoloCompositionParser().parse(sourceText);
  const v4Source = new stack.toolchain.HoloCompositionParser().parse(v4SourceText);
  const policy = new stack.toolchain.HoloScriptPlusParser().parse(policyText);
  const seed = new stack.toolchain.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3S .holo', source],
    ['H3S V4 counterfactual .holo', v4Source],
    ['H3S .hsplus', policy],
    ['H3S .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      stack.esbuild.stop?.();
      throw new Error(`${label} parse failed: ${JSON.stringify(parsed.errors)}`);
    }
  }
  const manifest = manifestText
    ? new stack.toolchain.HoloCompositionParser().parse(manifestText)
    : null;
  if (manifest && (!manifest.success || manifest.errors.length)) {
    stack.esbuild.stop?.();
    throw new Error(`H3S manifest .holo parse failed: ${JSON.stringify(manifest.errors)}`);
  }
  return {
    ...stack,
    source,
    v4Source,
    policy,
    seed,
    manifest,
    sourceText,
    v4SourceText,
    policyText,
    seedText,
    manifestText,
    contract: {
      metadata: source.ast.metadata,
      state: properties(source.ast.state),
      objects: (source.ast.objects || []).map((object) => {
        const pose = object.traits?.find((trait) => trait.name === 'pose');
        return {
          objectId: object.name,
          ...properties(object),
          poseName: pose?.config?.name,
          poseBones: pose?.config?.bones,
        };
      }),
    },
  };
}

export function validateH3SContract(stack, root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state, objects } = stack.contract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3S_HAND_SURFACE_ANATOMY',
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
    ['canonicalWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['sourceCompilerEntrypoint', 'CharacterWebGPUCompiler.compile'],
    ['nativeHostBridgeEntrypoint', 'buildCharacterHostFromComposition'],
    ['nativeRendererEntrypoint', 'renderCharacter'],
    ['nativeRendererBackend', 'webgpu'],
    ['authoredUpperBodyProfile', V5_RECEIPT_PROFILE],
    ['counterfactualUpperBodyProfile', V4_RECEIPT_PROFILE],
    ['handSurfaceReceiptSchema', HAND_SURFACE_SCHEMA],
    ['handSurfaceGeometryReceiptSchema', HAND_GEOMETRY_SCHEMA],
    ['handSurfaceProfile', HAND_SURFACE_PROFILE],
    ['jointDeformationReceiptSchema', 'holoscript.agent-avatar-joint-deformation.v1'],
    ['jointDeformationProfile', 'dual-influence-upper-limb-v1'],
    ['sourcePoseSoleAuthoredInputClaimed', true],
    ['repeatedCompileByteIdentityClaimed', true],
    ['compilerHandSurfaceReceiptClaimed', true],
    ['nativeDawnGpuReadbackClaimed', true],
    ['topologyOnlyV4CounterfactualClaimed', true],
    ['samePoseMaterialLightCameraClaimed', true],
    ['measuredTissueModelClaimed', false],
    ['browserWebgpuMeasured', false],
    ['gpuTimestampFrameTimeClaimed', false],
    ['freshRtxBenchmarkClaimed', false],
    ['callbackCadenceCountsAsGpuTime', false],
    ['photorealismClaimed', false],
    ['biometricLikenessClaimed', false],
    ['fullWorldConvergenceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  const foundation = state.handSurfaceFoundation || {};
  for (const [key, expected] of [
    ['expectedVertexDeltaOverV4', EXPECTED_VERTEX_DELTA],
    ['secondaryInfluencedVertexCount', EXPECTED_INFLUENCED_VERTICES],
    ['uniqueJointPairCount', EXPECTED_JOINT_PAIRS],
    ['upperLimbRingCount', 13],
    ['digitSectionRingCount', 14],
    ['digitCrossSectionExponent', 2.35],
    ['commissureRows', 5],
    ['commissureColumns', 7],
    ['nailRows', 7],
    ['nailColumns', 7],
    ['plateSizePixels', PANEL_SIZE],
    ['contactSheetColumns', 2],
    ['contactSheetRows', 4],
    ['gpuTimestampRequired', false],
  ]) {
    expect(foundation[key] === expected, `handSurfaceFoundation.${key} drifted`);
  }
  for (const [sourceKey, receiptKey] of [
    ['wristTransition', 'wristTransition'],
    ['digitSection', 'digitSections'],
    ['metacarpalKnuckle', 'metacarpalKnuckles'],
    ['interdigitalCommissure', 'interdigitalCommissures'],
    ['nailCuticle', 'nailCuticles'],
  ]) {
    expect(
      foundation[`${sourceKey}VertexCount`] === EXPECTED_REGION_VERTEX_COUNTS[receiptKey],
      `handSurfaceFoundation.${sourceKey}VertexCount drifted`
    );
    expect(
      foundation[`${sourceKey}IndexCount`] === EXPECTED_REGION_INDEX_COUNTS[receiptKey],
      `handSurfaceFoundation.${sourceKey}IndexCount drifted`
    );
  }
  expect(
    JSON.stringify(state.residentNames) === JSON.stringify(EXPECTED_RESIDENTS),
    'resident names drifted'
  );
  expect(JSON.stringify(state.fixedLightDirection) === JSON.stringify(LIGHT_DIR), 'light drifted');
  expect(JSON.stringify(state.fixedClearColor) === JSON.stringify(CLEAR), 'clear color drifted');
  expect(objects.length === 4, 'exactly four symbolic residents are required');
  expect(new Set(objects.map((object) => object.poseName)).size === 4, 'poses must be distinct');
  const replacementCount = stack.sourceText.split(V5_PROFILE).length - 1;
  expect(replacementCount === 4, 'V4 counterfactual must replace exactly four body profile values');
  for (const [index, object] of (stack.source.ast.objects || []).entries()) {
    const v4Object = stack.v4Source.ast.objects[index];
    const body = object.traits?.find((trait) => trait.name === 'body');
    const v4Body = v4Object?.traits?.find((trait) => trait.name === 'body');
    const pose = object.traits?.find((trait) => trait.name === 'pose');
    const sss = object.traits?.find((trait) => trait.name === 'subsurface_scattering');
    const label = properties(object).displayLabel;
    expect(label === EXPECTED_RESIDENTS[index], `resident ${index} label drifted`);
    expect(pose?.config?.name === EXPECTED_POSES[index], `${label} pose name drifted`);
    expect(
      pose?.config?.bones && Object.keys(pose.config.bones).length === 8,
      `${label} must author eight pose bones`
    );
    expect(
      body?.config?.upper_body_profile === V5_PROFILE &&
        body?.config?.upper_body_radial_segments === 24,
      `${label} V5 hand-surface profile drifted`
    );
    expect(v4Body?.config?.upper_body_profile === V4_PROFILE, `${label} V4 profile drifted`);
    const { upper_body_profile: _v5Profile, ...v5BodyConfig } = body?.config || {};
    const { upper_body_profile: _v4Profile, ...v4BodyConfig } = v4Body?.config || {};
    expect(
      JSON.stringify(canonical(v5BodyConfig)) === JSON.stringify(canonical(v4BodyConfig)),
      `${label} counterfactual changed body inputs beyond topology profile`
    );
    expect(
      sss?.config?.material_calibration_profile === 'fixed_light_human_v1',
      `${label} material calibration profile drifted`
    );
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    plan: objects.map((object) => ({ ...object, accent: packRgb(object.accentColor) })),
  };
}

function validateHandSurfaceReceipt(receipt, label) {
  if (
    receipt?.schemaVersion !== HAND_SURFACE_SCHEMA ||
    receipt?.profile !== HAND_SURFACE_PROFILE ||
    receipt?.upperBodyProfile !== V5_RECEIPT_PROFILE ||
    receipt?.limbs?.length !== 2 ||
    JSON.stringify(canonical(receipt.regionVertexCounts)) !==
      JSON.stringify(canonical(EXPECTED_REGION_VERTEX_COUNTS)) ||
    JSON.stringify(canonical(receipt.regionIndexCounts)) !==
      JSON.stringify(canonical(EXPECTED_REGION_INDEX_COUNTS))
  ) {
    throw new Error(`${label} aggregate hand-surface receipt drifted`);
  }
  for (const limb of receipt.limbs) {
    if (
      limb.schemaVersion !== HAND_GEOMETRY_SCHEMA ||
      limb.profile !== HAND_SURFACE_PROFILE ||
      limb.wristTransitionRingCount !== 6 ||
      limb.digitSectionRingCount !== 14 ||
      limb.digitSectionExponent !== 2.35 ||
      limb.commissureRows !== 5 ||
      limb.commissureColumns !== 7 ||
      limb.nailRows !== 7 ||
      limb.nailColumns !== 7
    ) {
      throw new Error(`${label} ${limb.side || 'unknown'} hand geometry receipt drifted`);
    }
  }
}

function validateDeformation(bundle, label) {
  const secondaryIndices = bundle.mesh?.secondaryJointIndices;
  const secondaryWeights = bundle.mesh?.secondaryJointWeights;
  if (
    !Array.isArray(secondaryIndices) ||
    !Array.isArray(secondaryWeights) ||
    secondaryIndices.length !== bundle.vertexCount ||
    secondaryWeights.length !== bundle.vertexCount
  ) {
    throw new Error(`${label} secondary influence ABI drifted`);
  }
  const positiveSecondaryInfluenceCount = secondaryWeights.filter((weight) => weight > 0).length;
  let maxWeightSumError = 0;
  for (let vertex = 0; vertex < bundle.vertexCount; vertex += 1) {
    maxWeightSumError = Math.max(
      maxWeightSumError,
      Math.abs(bundle.mesh.jointWeights[vertex] + secondaryWeights[vertex] - 1)
    );
  }
  if (
    positiveSecondaryInfluenceCount !== EXPECTED_INFLUENCED_VERTICES ||
    maxWeightSumError > 0.000001 ||
    bundle.jointDeformation?.schemaVersion !==
      'holoscript.agent-avatar-joint-deformation.v1' ||
    bundle.jointDeformation?.profile !== 'dual-influence-upper-limb-v1' ||
    bundle.jointDeformation?.influencedVertexCount !== EXPECTED_INFLUENCED_VERTICES ||
    bundle.jointDeformation?.jointPairCount !== EXPECTED_JOINT_PAIRS
  ) {
    throw new Error(`${label} compiler deformation receipt drifted`);
  }
  return { positiveSecondaryInfluenceCount, maxWeightSumError };
}

async function compileH3SResidents(stack, plan) {
  const records = [];
  for (const resident of plan) {
    const compilerOptions = {
      objectId: resident.objectId,
      entityId: `model-village-h3s-${resident.modelFamilyId}`,
      lodLevel: 0,
    };
    const compileV5 = () =>
      new stack.toolchain.CharacterWebGPUCompiler(compilerOptions).compile(stack.source.ast);
    const v5First = await compileV5();
    const v5Second = await compileV5();
    const v4Text = await new stack.toolchain.CharacterWebGPUCompiler(compilerOptions).compile(
      stack.v4Source.ast
    );
    if (v5First !== v5Second) {
      throw new Error(`${resident.displayLabel} V5 compile was not byte-identical`);
    }
    const v5 = JSON.parse(v5First);
    const v4 = JSON.parse(v4Text);
    for (const [label, bundle] of [
      ['V5', v5],
      ['V4', v4],
    ]) {
      if (bundle.format !== 'character-webgpu/drawspec' || bundle.report?.stubbed?.length !== 0) {
        throw new Error(`${resident.displayLabel} ${label} compiler output was not fully native`);
      }
      if (
        bundle.pose?.schemaVersion !== 'holoscript.character-source-pose.v1' ||
        bundle.pose?.name !== resident.poseName ||
        bundle.pose?.boneCount !== 8
      ) {
        throw new Error(`${resident.displayLabel} ${label} pose receipt drifted`);
      }
    }
    validateHandSurfaceReceipt(v5.handSurface, resident.displayLabel);
    if (v4.handSurface !== undefined) {
      throw new Error(`${resident.displayLabel} V4 unexpectedly emitted a hand-surface receipt`);
    }
    if (
      v5.vertexCount - v4.vertexCount !== EXPECTED_VERTEX_DELTA ||
      v5.anatomy?.upperBody?.profile !== 'anatomical-hand-surface-v5' ||
      v4.anatomy?.upperBody?.profile !== 'anatomical-deforming-hands-v4'
    ) {
      throw new Error(`${resident.displayLabel} V5/V4 topology delta drifted`);
    }
    const v5Deformation = validateDeformation(v5, `${resident.displayLabel} V5`);
    const v4Deformation = validateDeformation(v4, `${resident.displayLabel} V4`);
    if (
      JSON.stringify(canonical(v5.pose)) !== JSON.stringify(canonical(v4.pose)) ||
      JSON.stringify(canonical(v5.jointDeformation)) !==
        JSON.stringify(canonical(v4.jointDeformation))
    ) {
      throw new Error(`${resident.displayLabel} V5/V4 pose or deformation ABI diverged`);
    }
    records.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      repeatedV5CompileByteIdentity: true,
      v5: {
        outputSha256: sha256(v5First),
        byteLength: Buffer.byteLength(v5First),
        vertexCount: v5.vertexCount,
        handSurface: canonical(v5.handSurface),
        pose: canonical(v5.pose),
        jointDeformation: canonical(v5.jointDeformation),
        ...v5Deformation,
      },
      v4: {
        outputSha256: sha256(v4Text),
        byteLength: Buffer.byteLength(v4Text),
        vertexCount: v4.vertexCount,
        handSurface: null,
        pose: canonical(v4.pose),
        jointDeformation: canonical(v4.jointDeformation),
        ...v4Deformation,
      },
      vertexDelta: v5.vertexCount - v4.vertexCount,
      topologyOnlyCounterfactual: true,
    });
  }
  return records;
}

function meshWithSkinnedPositions(spec) {
  const positions = new Float32Array(spec.mesh.positions.length);
  const secondaryIndices = spec.mesh.secondaryJointIndices;
  const secondaryWeights = spec.mesh.secondaryJointWeights;
  for (let vertex = 0; vertex < spec.mesh.vertexCount; vertex += 1) {
    const positionOffset = vertex * 3;
    const x = spec.mesh.positions[positionOffset];
    const y = spec.mesh.positions[positionOffset + 1];
    const z = spec.mesh.positions[positionOffset + 2];
    const primaryIndex = spec.mesh.jointIndices[vertex];
    const primaryWeight = spec.mesh.jointWeights[vertex];
    const secondaryIndex = secondaryIndices?.[vertex] ?? primaryIndex;
    const secondaryWeight = secondaryWeights?.[vertex] ?? 0;
    const transform = (jointIndex) => {
      const offset = jointIndex * 16;
      return [
        spec.jointMatrices[offset] * x +
          spec.jointMatrices[offset + 4] * y +
          spec.jointMatrices[offset + 8] * z +
          spec.jointMatrices[offset + 12],
        spec.jointMatrices[offset + 1] * x +
          spec.jointMatrices[offset + 5] * y +
          spec.jointMatrices[offset + 9] * z +
          spec.jointMatrices[offset + 13],
        spec.jointMatrices[offset + 2] * x +
          spec.jointMatrices[offset + 6] * y +
          spec.jointMatrices[offset + 10] * z +
          spec.jointMatrices[offset + 14],
      ];
    };
    const primary = transform(primaryIndex);
    const secondary = transform(secondaryIndex);
    positions[positionOffset] =
      primary[0] * primaryWeight + secondary[0] * secondaryWeight;
    positions[positionOffset + 1] =
      primary[1] * primaryWeight + secondary[1] * secondaryWeight;
    positions[positionOffset + 2] =
      primary[2] * primaryWeight + secondary[2] * secondaryWeight;
  }
  return { ...spec.mesh, positions };
}

function sourceMaterialSignature(object) {
  const body = object.traits?.find((trait) => trait.name === 'body');
  const sss = object.traits?.find((trait) => trait.name === 'subsurface_scattering');
  return canonical({
    skinTone: body?.config?.skin_tone,
    nailTone: body?.config?.nail_tone,
    nailRoughness: body?.config?.nail_roughness,
    nailBedTone: body?.config?.nail_bed_tone,
    nailBedRoughness: body?.config?.nail_bed_roughness,
    subsurfaceScattering: sss?.config,
  });
}

async function captureNativeTopologyPairs(stack, plan, holoScriptRoot, outputDir) {
  const runtime = await loadNativeRuntime(holoScriptRoot, outputDir, stack.esbuild);
  const gpu = runtime.createWebGpu([]);
  let adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('native Dawn WebGPU adapter unavailable');
  const adapterInfo = await readAdapterInfo(adapter);
  const adapterFeatures = Array.from(adapter.features || []).map(String).sort();
  const device = await adapter.requestDevice();
  const deviceFeatures = Array.from(device.features || []).map(String).sort();
  const panels = [];
  const pairReceipts = [];
  try {
    for (const resident of plan) {
      const hostOptions = {
        objectId: resident.objectId,
        entityId: `model-village-h3s-${resident.modelFamilyId}`,
        lodLevel: 0,
      };
      const v5Built = runtime.character.buildCharacterHostFromComposition(
        stack.source.ast,
        hostOptions
      );
      const v4Built = runtime.character.buildCharacterHostFromComposition(
        stack.v4Source.ast,
        hostOptions
      );
      for (const [label, built] of [
        ['V5', v5Built],
        ['V4', v4Built],
      ]) {
        if (!built.ok || !built.host || built.report?.stubbed?.length) {
          throw new Error(
            `${resident.displayLabel} ${label} host bridge failed: ${JSON.stringify(built.report)}`
          );
        }
        if (
          built.pose?.schemaVersion !== 'holoscript.character-source-pose.v1' ||
          built.pose?.name !== resident.poseName ||
          built.pose?.boneCount !== 8 ||
          built.jointDeformation?.influencedVertexCount !== EXPECTED_INFLUENCED_VERTICES
        ) {
          throw new Error(`${resident.displayLabel} ${label} bridge receipt drifted`);
        }
      }
      const v5Host = v5Built.host;
      const v4Host = v4Built.host;
      const handSurface = v5Host.getHandSurfaceReceipt();
      validateHandSurfaceReceipt(handSurface, resident.displayLabel);
      if (v4Host.getHandSurfaceReceipt() !== null) {
        throw new Error(`${resident.displayLabel} V4 host emitted a hand-surface receipt`);
      }
      const v5Spec = v5Host.getDrawSpec();
      const v4Spec = v4Host.getDrawSpec();
      if (v5Spec.mesh.vertexCount - v4Spec.mesh.vertexCount !== EXPECTED_VERTEX_DELTA) {
        throw new Error(`${resident.displayLabel} native V5/V4 vertex delta drifted`);
      }
      const left = v5Host
        .getAnatomyReceipt()
        .upperBody?.upperLimbs.find((limb) => limb.side === 'left');
      const digits = left?.digits || [];
      const nailLandmarks = (left?.handLandmarks || []).filter(
        (landmark) => landmark.materialRole === 'keratin-nail'
      );
      const commissures = (left?.handLandmarks || []).filter(
        (landmark) => landmark.kind === 'interdigital-web'
      );
      if (digits.length !== 5 || nailLandmarks.length !== 5 || commissures.length !== 4) {
        throw new Error(`${resident.displayLabel} V5 detail ranges drifted`);
      }
      const detailRanges = [
        ...digits.map((digit) => digit.vertexRange),
        ...nailLandmarks.map((landmark) => landmark.vertexRange),
        ...commissures.map((landmark) => landmark.vertexRange),
      ];
      const detailFrame = runtime.character.deriveCharacterDetailFrame(
        meshWithSkinnedPositions(v5Spec),
        detailRanges,
        { padding: 1.48 }
      );
      const renderOptions = {
        size: PANEL_SIZE,
        viewProj: detailFrame.matrix,
        clear: [CLEAR[0] / 255, CLEAR[1] / 255, CLEAR[2] / 255, 1],
        lightDir: LIGHT_DIR,
        cameraPos: [detailFrame.center[0], detailFrame.center[1], 6],
      };
      const startedAt = performance.now();
      const v5Pixels = await runtime.character.renderCharacter(device, v5Spec, renderOptions);
      const v5WallClockMilliseconds = performance.now() - startedAt;
      const v4StartedAt = performance.now();
      const v4Pixels = await runtime.character.renderCharacter(device, v4Spec, renderOptions);
      const v4WallClockMilliseconds = performance.now() - v4StartedAt;
      const delta = changedPixelStats(v5Pixels, v4Pixels);
      const v5FigurePixelCount = figurePixelCount(v5Pixels);
      const v4FigurePixelCount = figurePixelCount(v4Pixels);
      if (
        delta.changedPixelCount <= 20 ||
        delta.absoluteChannelDiff <= 200 ||
        v5FigurePixelCount <= 100 ||
        v4FigurePixelCount <= 100
      ) {
        throw new Error(
          `${resident.displayLabel} topology counterfactual witness too weak: ${JSON.stringify({
            ...delta,
            v5FigurePixelCount,
            v4FigurePixelCount,
          })}`
        );
      }
      const sourceIndex = (stack.source.ast.objects || []).findIndex(
        (object) => object.name === resident.objectId
      );
      const v5SourceObject = stack.source.ast.objects[sourceIndex];
      const v4SourceObject = stack.v4Source.ast.objects[sourceIndex];
      const sourceMaterial = sourceMaterialSignature(v5SourceObject);
      const v4SourceMaterial = sourceMaterialSignature(v4SourceObject);
      const v5Skin = canonical(v5Host.getSkinMaterialReceipt());
      const v4Skin = canonical(v4Host.getSkinMaterialReceipt());
      if (
        JSON.stringify(sourceMaterial) !== JSON.stringify(v4SourceMaterial) ||
        JSON.stringify(v5Skin) !== JSON.stringify(v4Skin) ||
        JSON.stringify(canonical(v5Built.pose)) !== JSON.stringify(canonical(v4Built.pose)) ||
        JSON.stringify(canonical(v5Built.jointDeformation)) !==
          JSON.stringify(canonical(v4Built.jointDeformation))
      ) {
        throw new Error(`${resident.displayLabel} topology counterfactual changed held inputs`);
      }
      const v5MaterialReceipt = runtime.character.deriveCharacterMaterialPlateReceipt(v5Spec);
      const v4MaterialReceipt = runtime.character.deriveCharacterMaterialPlateReceipt(v4Spec);
      panels.push({ grid: v5Pixels, accent: resident.accent });
      panels.push({ grid: v4Pixels, accent: 0x607080 });
      pairReceipts.push({
        displayLabel: resident.displayLabel,
        objectId: resident.objectId,
        gestureMeaning: resident.gestureMeaning,
        topologyOnlyCounterfactual: true,
        changedOnlySourceBodyField: 'upper_body_profile',
        v5Profile: V5_RECEIPT_PROFILE,
        v4Profile: V4_RECEIPT_PROFILE,
        vertexDelta: v5Spec.mesh.vertexCount - v4Spec.mesh.vertexCount,
        handSurface: canonical(handSurface),
        pose: canonical(v5Built.pose),
        jointDeformation: canonical(v5Built.jointDeformation),
        sourceMaterial,
        skinReceipt: v5Skin,
        materialGeometryReceipts: {
          v5: canonical(v5MaterialReceipt),
          v4: canonical(v4MaterialReceipt),
          note: 'role geometry counts may differ because topology is the tested variable',
        },
        fixedInputs: {
          poseChanged: false,
          materialsChanged: false,
          cameraChanged: false,
          lightChanged: false,
          detailFrame: {
            center: canonical(detailFrame.center),
            extents: canonical(detailFrame.extents),
            matrixSha256: sha256(detailFrame.matrix),
          },
          lightDirection: LIGHT_DIR,
          clearColorBytes: CLEAR,
        },
        nativeGpuReadback: true,
        v5PixelSha256: sha256(v5Pixels.data),
        v4PixelSha256: sha256(v4Pixels.data),
        v5FigurePixelCount,
        v4FigurePixelCount,
        ...delta,
        wallClockRenderReadbackMilliseconds: {
          v5: v5WallClockMilliseconds,
          v4: v4WallClockMilliseconds,
        },
        timingClassification:
          'host_wall_clock_includes_submission_and_readback_not_gpu_timestamp_not_rtx_benchmark',
      });
    }
    const contactSheet = buildContactSheet(panels);
    const png = runtime.character.encodePngRgba(
      contactSheet.data,
      contactSheet.width,
      contactSheet.height
    );
    return {
      adapter: {
        info: adapterInfo,
        features: adapterFeatures,
        deviceFeatures,
        timestampQuerySupported: adapterFeatures.includes('timestamp-query'),
        timestampQueryMeasured: false,
      },
      runtime: {
        renderer: 'HoloScript CharacterRender.renderCharacter',
        backend: 'native_webgpu_dawn',
        engineEntrySha256: sha256File(runtime.engineEntry),
        webGpuModulePath: path.relative(holoScriptRoot, runtime.webGpuEntry).replaceAll('\\', '/'),
        threeJsDependencyUsed: false,
        browserUsed: false,
        runtimePoseMutationUsed: false,
      },
      pairs: pairReceipts,
      contactSheet: {
        columns: 2,
        rows: 4,
        columnMeaning: ['V5_hand_surface', 'V4_counterfactual'],
        rowMeaning: EXPECTED_RESIDENTS,
        width: contactSheet.width,
        height: contactSheet.height,
        rgbaSha256: sha256(contactSheet.data),
        pngSha256: sha256(png),
        png,
      },
    };
  } finally {
    device.destroy?.();
  }
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
      'scripts/check-hololand-model-village-character-appearance-h3s.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3s.test.mjs',
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
    if (!match || !existsSync(absolute) || match[1] !== sha256ManifestFile(absolute)) {
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
    heroOutput: null,
    evidenceOutput: null,
    requireManifest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--require-manifest') options.requireManifest = true;
    else if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--hero-output') options.heroOutput = path.resolve(argv[++index]);
    else if (arg === '--evidence-output') options.evidenceOutput = path.resolve(argv[++index]);
  }
  return options;
}

export async function runCharacterAppearanceH3S(options = {}) {
  const resolved = {
    root: options.root || ROOT,
    holoScriptRoot: options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: options.outputDir || path.join(options.root || ROOT, OUTPUT_REL),
    heroOutput: options.heroOutput || null,
    evidenceOutput: options.evidenceOutput || null,
    requireManifest: options.requireManifest ?? false,
  };
  const stack = await parseH3SStack(resolved.root, resolved.holoScriptRoot, resolved.outputDir);
  try {
    const validation = validateH3SContract(stack, resolved.root, resolved.holoScriptRoot);
    if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
    const compiled = await compileH3SResidents(stack, validation.plan);
    const native = await captureNativeTopologyPairs(
      stack,
      validation.plan,
      resolved.holoScriptRoot,
      resolved.outputDir
    );
    const manifest = resolved.requireManifest
      ? validateManifest(resolved.root)
      : { status: 'not-required', errors: [] };
    if (manifest.status === 'fail' || manifest.status === 'missing') {
      throw new Error(manifest.errors.join('\n'));
    }
    const receipt = {
      schema: 'hololand.model-village.character-appearance-h3s-witness.v1',
      status: 'pass',
      generatedAt: new Date().toISOString(),
      source: {
        path: SOURCE_REL,
        sha256: sha256(stack.sourceText),
        upstreamHoloScriptCommit: EXPECTED_COMMIT,
        v4CounterfactualSha256: sha256(stack.v4SourceText),
        counterfactualDerivation: `replace exactly four ${V5_PROFILE} values with ${V4_PROFILE}`,
      },
      policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
      seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
      architecture: {
        sovereignCompilerGuidance: 'W.GOLD.002',
        sourceCompilerEntrypoint: 'CharacterWebGPUCompiler.compile',
        hostBridgeEntrypoint: 'buildCharacterHostFromComposition',
        rendererEntrypoint: 'renderCharacter',
        rendererBackend: 'webgpu',
        handSurfaceReceiptSchema: HAND_SURFACE_SCHEMA,
        handSurfaceGeometryReceiptSchema: HAND_GEOMETRY_SCHEMA,
        handSurfaceProfile: HAND_SURFACE_PROFILE,
      },
      compilerAdmission: {
        residentCount: compiled.length,
        residentNames: compiled.map((record) => record.displayLabel),
        records: compiled,
      },
      nativeGpuAdmission: {
        deviceExecutionMeasured: true,
        adapter: native.adapter,
        runtime: native.runtime,
        fixedLight: {
          direction: LIGHT_DIR,
          clearColorBytes: CLEAR,
          plateSizePixels: PANEL_SIZE,
        },
        topologyPairs: native.pairs,
        contactSheet: {
          columns: native.contactSheet.columns,
          rows: native.contactSheet.rows,
          columnMeaning: native.contactSheet.columnMeaning,
          rowMeaning: native.contactSheet.rowMeaning,
          width: native.contactSheet.width,
          height: native.contactSheet.height,
          rgbaSha256: native.contactSheet.rgbaSha256,
          pngSha256: native.contactSheet.pngSha256,
        },
      },
      manifest,
      boundaries: {
        providerModelBinding: 'absent',
        symbolicAppearanceOnly: true,
        runtimePoseMutationUsed: false,
        browserWebgpuMeasured: false,
        gpuTimestampFrameTimeClaimed: false,
        freshRtxBenchmarkClaimed: false,
        callbackCadenceCountsAsGpuTime: false,
        endToEndDisplayLatencyClaimed: false,
        nativeWebgpuTaaClaimed: false,
        questWebxrMeasured: false,
        productionSkinTexturingClaimed: false,
        measuredTissueModelClaimed: false,
        productionGroomClaimed: false,
        photorealismClaimed: false,
        biometricLikenessClaimed: false,
        fullWorldConvergenceClaimed: false,
      },
    };
    const finalReceipt = {
      ...receipt,
      receiptSha256: sha256(JSON.stringify(canonical(receipt))),
    };
    const finalDir = path.join(resolved.outputDir, 'final');
    mkdirSync(finalDir, { recursive: true });
    const receiptPath = path.join(finalDir, 'character-appearance-h3s-witness.json');
    writeFileSync(receiptPath, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
    if (resolved.heroOutput) {
      mkdirSync(path.dirname(resolved.heroOutput), { recursive: true });
      writeFileSync(resolved.heroOutput, native.contactSheet.png);
    }
    if (resolved.evidenceOutput) {
      mkdirSync(path.dirname(resolved.evidenceOutput), { recursive: true });
      writeFileSync(resolved.evidenceOutput, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
    }
    return {
      receipt: finalReceipt,
      receiptPath,
      heroPath: resolved.heroOutput,
      evidencePath: resolved.evidenceOutput,
    };
  } finally {
    stack.esbuild.stop?.();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3S(parseArgs())
    .then(({ receipt, receiptPath, heroPath, evidencePath }) => {
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            schema: receipt.schema,
            receiptSha256: receipt.receiptSha256,
            receiptPath,
            heroPath,
            evidencePath,
            nativeGpuReadbackPairCount:
              receipt.nativeGpuAdmission.topologyPairs.length,
            adapter: receipt.nativeGpuAdmission.adapter.info,
            timestampQueryMeasured:
              receipt.nativeGpuAdmission.adapter.timestampQueryMeasured,
            freshRtxBenchmarkClaimed: receipt.boundaries.freshRtxBenchmarkClaimed,
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
