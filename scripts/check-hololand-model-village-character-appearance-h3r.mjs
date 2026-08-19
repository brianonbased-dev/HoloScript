#!/usr/bin/env node
/* global process, performance */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseH3MStack, sha256 } from './check-hololand-model-village-character-appearance-h3m.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3r-posed-deformation.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3r-posed-deformation-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3r-posed-deformation-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3r-posed-deformation-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3r-posed-deformation-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3r-posed-deformation-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3r-posed-deformation-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3r';
const EXPECTED_COMMIT = 'ad577ed2238d0e8a7302badd5656b7bf791aefc9';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const EXPECTED_POSES = [
  'measured-open-palm',
  'considered-listening',
  'asymmetric-visual-framing',
  'direct-broad-challenge',
];
const HASH_BINDINGS = [
  ['inheritedH3QSource', 'inheritedH3QSourceSha256', 'hololand'],
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
  const height = PANEL_SIZE * 2 + CONTACT_GUTTER * 3;
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
  const engineEntry = path.join(outputDir, 'h3r-native-character-runtime.mjs');
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
      sourcefile: 'h3r-native-character-runtime.entry.ts',
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
        name: 'h3r-wgsl-raw',
        setup(build) {
          build.onResolve({ filter: /\.wgsl\?raw$/ }, (args) => ({
            path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
            namespace: 'h3r-wgsl-raw',
          }));
          build.onLoad({ filter: /.*/, namespace: 'h3r-wgsl-raw' }, (args) => ({
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
  return {
    character,
    createWebGpu: create,
    engineEntry,
    webGpuEntry,
  };
}

export async function parseH3RStack(
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
  const source = new stack.toolchain.HoloCompositionParser().parse(sourceText);
  const policy = new stack.toolchain.HoloScriptPlusParser().parse(policyText);
  const seed = new stack.toolchain.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3R .holo', source],
    ['H3R .hsplus', policy],
    ['H3R .hs', seed],
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
    throw new Error(`H3R manifest .holo parse failed: ${JSON.stringify(manifest.errors)}`);
  }
  return {
    ...stack,
    source,
    policy,
    seed,
    manifest,
    sourceText,
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

export function validateH3RContract(stack, root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state, objects } = stack.contract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3R_POSED_DEFORMATION',
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
    ['authoredUpperBodyProfile', 'coherent-deforming-hands-v4'],
    ['sourcePoseReceiptSchema', 'holoscript.character-source-pose.v1'],
    ['jointDeformationReceiptSchema', 'holoscript.agent-avatar-joint-deformation.v1'],
    ['jointDeformationProfile', 'dual-influence-upper-limb-v1'],
    ['sourcePoseSoleAuthoredInputClaimed', true],
    ['sourceBoundDetailFrameClaimed', true],
    ['repeatedCompileByteIdentityClaimed', true],
    ['compilerSecondaryInfluenceAbiClaimed', true],
    ['nativeDawnGpuReadbackClaimed', true],
    ['primaryOnlyDeformationCounterfactualClaimed', true],
    ['neutralPoseCounterfactualClaimed', true],
    ['materialRoleCounterfactualClaimed', true],
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
  expect(
    JSON.stringify(state.residentNames) === JSON.stringify(EXPECTED_RESIDENTS),
    'resident names drifted'
  );
  expect(JSON.stringify(state.fixedLightDirection) === JSON.stringify(LIGHT_DIR), 'light drifted');
  expect(objects.length === 4, 'exactly four symbolic residents are required');
  expect(new Set(objects.map((object) => object.poseName)).size === 4, 'poses must be distinct');
  for (const [index, object] of (stack.source.ast.objects || []).entries()) {
    const body = object.traits?.find((trait) => trait.name === 'body');
    const pose = object.traits?.find((trait) => trait.name === 'pose');
    const sss = object.traits?.find((trait) => trait.name === 'subsurface_scattering');
    const label = properties(object).displayLabel;
    const poseBones = pose?.config?.bones;
    expect(label === EXPECTED_RESIDENTS[index], `resident ${index} label drifted`);
    expect(pose?.config?.name === EXPECTED_POSES[index], `${label} pose name drifted`);
    expect(
      poseBones && typeof poseBones === 'object' && Object.keys(poseBones).length === 8,
      `${label} must author eight pose bones`
    );
    expect(
      body?.config?.upper_body_profile === 'coherent_deforming_hands_v4' &&
        body?.config?.upper_body_radial_segments === 24,
      `${label} V4 deformation profile drifted`
    );
    expect(
      sss?.config?.material_calibration_profile === 'fixed_light_human_v1',
      `${label} material calibration profile drifted`
    );
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    plan: objects.map((object) => ({
      ...object,
      accent: packRgb(object.accentColor),
    })),
  };
}

async function compileH3RResidents(stack, plan) {
  const records = [];
  for (const resident of plan) {
    const compile = () =>
      new stack.toolchain.CharacterWebGPUCompiler({
        objectId: resident.objectId,
        entityId: `model-village-h3r-${resident.modelFamilyId}`,
        lodLevel: 0,
      }).compile(stack.source.ast);
    const first = await compile();
    const second = await compile();
    if (first !== second) {
      throw new Error(`${resident.displayLabel} compile was not byte-identical`);
    }
    const bundle = JSON.parse(first);
    if (bundle.format !== 'character-webgpu/drawspec' || bundle.report?.stubbed?.length !== 0) {
      throw new Error(`${resident.displayLabel} compiler output was not fully native`);
    }
    const secondaryIndices = bundle.mesh?.secondaryJointIndices;
    const secondaryWeights = bundle.mesh?.secondaryJointWeights;
    if (
      !Array.isArray(secondaryIndices) ||
      !Array.isArray(secondaryWeights) ||
      secondaryIndices.length !== bundle.vertexCount ||
      secondaryWeights.length !== bundle.vertexCount
    ) {
      throw new Error(`${resident.displayLabel} secondary influence ABI drifted`);
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
      positiveSecondaryInfluenceCount !== 1008 ||
      maxWeightSumError > 0.000001 ||
      bundle.pose?.schemaVersion !== 'holoscript.character-source-pose.v1' ||
      bundle.pose?.name !== resident.poseName ||
      bundle.pose?.boneCount !== 8 ||
      bundle.jointDeformation?.schemaVersion !==
        'holoscript.agent-avatar-joint-deformation.v1' ||
      bundle.jointDeformation?.influencedVertexCount !== 1008 ||
      bundle.jointDeformation?.jointPairCount !== 38
    ) {
      throw new Error(`${resident.displayLabel} compiler deformation receipt drifted`);
    }
    records.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      outputSha256: sha256(first),
      byteLength: Buffer.byteLength(first),
      vertexCount: bundle.vertexCount,
      secondaryInfluenceArrayLength: secondaryWeights.length,
      positiveSecondaryInfluenceCount,
      maxWeightSumError,
      pose: canonical(bundle.pose),
      jointDeformation: canonical(bundle.jointDeformation),
      repeatedCompileByteIdentity: true,
    });
  }
  return records;
}

function materialCounterfactualSpec(spec, role, color, roughness) {
  return {
    ...spec,
    materialGroups: spec.materialGroups.map((group) =>
      group.materialRole === role
        ? {
            ...group,
            material: {
              ...group.material,
              color,
              roughness,
            },
          }
        : group
    ),
  };
}

function primaryOnlyCounterfactualSpec(spec) {
  const secondaryWeights = spec.mesh.secondaryJointWeights;
  if (!secondaryWeights || secondaryWeights.length !== spec.mesh.jointWeights.length) {
    throw new Error('primary-only counterfactual requires the secondary influence ABI');
  }
  const jointWeights = new Float32Array(spec.mesh.jointWeights.length);
  for (let vertex = 0; vertex < jointWeights.length; vertex += 1) {
    jointWeights[vertex] = spec.mesh.jointWeights[vertex] + secondaryWeights[vertex];
  }
  return {
    ...spec,
    mesh: {
      ...spec.mesh,
      jointWeights,
      secondaryJointWeights: new Float32Array(secondaryWeights.length),
    },
  };
}

function neutralPoseCounterfactualSpec(spec) {
  const jointMatrices = new Float32Array(spec.jointMatrices.length);
  for (let joint = 0; joint < spec.jointCount; joint += 1) {
    const offset = joint * 16;
    jointMatrices[offset] = 1;
    jointMatrices[offset + 5] = 1;
    jointMatrices[offset + 10] = 1;
    jointMatrices[offset + 15] = 1;
  }
  return { ...spec, jointMatrices };
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

async function captureNativePlates(stack, plan, holoScriptRoot, outputDir) {
  const runtime = await loadNativeRuntime(holoScriptRoot, outputDir, stack.esbuild);
  const gpu = runtime.createWebGpu([]);
  let adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('native Dawn WebGPU adapter unavailable');
  const adapterInfo = await readAdapterInfo(adapter);
  const adapterFeatures = Array.from(adapter.features || [])
    .map(String)
    .sort();
  const device = await adapter.requestDevice();
  const deviceFeatures = Array.from(device.features || [])
    .map(String)
    .sort();
  const panels = [];
  const plateReceipts = [];
  try {
    for (const resident of plan) {
      const built = runtime.character.buildCharacterHostFromComposition(stack.source.ast, {
        objectId: resident.objectId,
        entityId: `model-village-h3r-${resident.modelFamilyId}`,
        lodLevel: 0,
      });
      if (!built.ok || !built.host || built.report?.stubbed?.length) {
        throw new Error(
          `${resident.displayLabel} native host bridge failed: ${JSON.stringify(built.report)}`
        );
      }
      if (
        built.pose?.schemaVersion !== 'holoscript.character-source-pose.v1' ||
        built.pose?.name !== resident.poseName ||
        built.pose?.boneCount !== 8 ||
        built.jointDeformation?.schemaVersion !==
          'holoscript.agent-avatar-joint-deformation.v1' ||
        built.jointDeformation?.influencedVertexCount !== 1008
      ) {
        throw new Error(`${resident.displayLabel} source pose bridge receipt drifted`);
      }
      const host = built.host;
      const anatomy = host.getAnatomyReceipt();
      const left = anatomy.upperBody?.upperLimbs.find((limb) => limb.side === 'left');
      const digits = left?.digits || [];
      const nailLandmarks = (left?.handLandmarks || []).filter(
        (landmark) => landmark.materialRole === 'keratin-nail'
      );
      if (digits.length !== 5 || nailLandmarks.length !== 5) {
        throw new Error(`${resident.displayLabel} hand detail ranges drifted`);
      }
      const spec = host.getDrawSpec();
      const secondaryWeights = spec.mesh.secondaryJointWeights;
      if (
        !spec.mesh.secondaryJointIndices ||
        !secondaryWeights ||
        secondaryWeights.filter((weight) => weight > 0).length !== 1008
      ) {
        throw new Error(`${resident.displayLabel} native secondary influence ABI drifted`);
      }
      const skinReceipt = host.getSkinMaterialReceipt();
      const materialReceipt = runtime.character.deriveCharacterMaterialPlateReceipt(spec);
      if (
        skinReceipt.calibrationProfile !== 'fixed-light-human-v1' ||
        materialReceipt.schemaVersion !== 'holoscript.character-material-plate.v2' ||
        materialReceipt.roleCounts['keratin-nail'] !== 20 ||
        materialReceipt.roleCounts['nail-bed'] !== 10 ||
        materialReceipt.keratinIndexCount !== 2160 ||
        materialReceipt.nailBedIndexCount !== 720 ||
        !materialReceipt.calibratedNailSurface
      ) {
        throw new Error(`${resident.displayLabel} material calibration receipt drifted`);
      }
      const detailRanges = [
        ...digits.map((digit) => digit.vertexRange),
        ...nailLandmarks.map((landmark) => landmark.vertexRange),
      ];
      const detailFrame = runtime.character.deriveCharacterDetailFrame(
        meshWithSkinnedPositions(spec),
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
      const authored = await runtime.character.renderCharacter(device, spec, renderOptions);
      const wallClockRenderReadbackMilliseconds = performance.now() - startedAt;

      const primaryOnlyPixels = await runtime.character.renderCharacter(
        device,
        primaryOnlyCounterfactualSpec(spec),
        renderOptions
      );
      const neutralPosePixels = await runtime.character.renderCharacter(
        device,
        neutralPoseCounterfactualSpec(spec),
        renderOptions
      );
      const primaryOnly = {
        ...changedPixelStats(authored, primaryOnlyPixels),
        pixelSha256: sha256(primaryOnlyPixels.data),
        changedGeometry: false,
        changedOnlyInfluenceInterpretation: 'secondary_weight_collapsed_into_primary',
        jointMatricesChanged: false,
        materialsChanged: false,
      };
      const neutralPose = {
        ...changedPixelStats(authored, neutralPosePixels),
        pixelSha256: sha256(neutralPosePixels.data),
        testOnly: true,
        changedGeometry: false,
        changedOnlyJointPalette: 'identity_palette',
        sourcePoseReauthored: false,
        materialsChanged: false,
      };
      if (
        primaryOnly.changedPixelCount <= 2 ||
        primaryOnly.absoluteChannelDiff <= 20 ||
        neutralPose.changedPixelCount <= 20 ||
        neutralPose.absoluteChannelDiff <= 200
      ) {
        throw new Error(
          `${resident.displayLabel} deformation counterfactual too weak: ${JSON.stringify({
            primaryOnly,
            neutralPose,
          })}`
        );
      }

      const materialRoles = {};
      for (const [role, color, roughness] of [
        ['skin', 0x31d7ff, 0.12],
        ['keratin-nail', 0x18f6ff, 0.08],
        ['nail-bed', 0xff276c, 0.12],
      ]) {
        const pixels = await runtime.character.renderCharacter(
          device,
          materialCounterfactualSpec(spec, role, color, roughness),
          renderOptions
        );
        materialRoles[role] = {
          ...changedPixelStats(authored, pixels),
          pixelSha256: sha256(pixels.data),
          changedGeometry: false,
          changedOnlyMaterialRole: role,
        };
      }
      for (const [role, threshold] of [
        ['skin', { pixels: 100, diff: 2000 }],
        ['keratin-nail', { pixels: 5, diff: 100 }],
        ['nail-bed', { pixels: 2, diff: 40 }],
      ]) {
        const delta = materialRoles[role];
        if (
          delta.changedPixelCount <= threshold.pixels ||
          delta.absoluteChannelDiff <= threshold.diff
        ) {
          throw new Error(
            `${resident.displayLabel} ${role} GPU witness too weak: ${JSON.stringify(delta)}`
          );
        }
      }
      const figurePixels = figurePixelCount(authored);
      if (figurePixels <= 100) {
        throw new Error(`${resident.displayLabel} fixed-light figure witness was too small`);
      }
      panels.push({ grid: authored, accent: resident.accent });
      plateReceipts.push({
        displayLabel: resident.displayLabel,
        objectId: resident.objectId,
        gestureMeaning: resident.gestureMeaning,
        sourceObjectSha256: sha256(
          JSON.stringify(
            canonical(
              (stack.source.ast.objects || []).find((object) => object.name === resident.objectId)
            )
          )
        ),
        sourcePose: canonical(built.pose),
        jointDeformation: canonical(built.jointDeformation),
        fixedLight: {
          direction: LIGHT_DIR,
          clearColorBytes: CLEAR,
          camera: 'source-bounded-posed-orthographic-detail-frame-v1',
        },
        skinReceipt: canonical(skinReceipt),
        materialReceipt: canonical(materialReceipt),
        detailFrame: {
          ...canonical(detailFrame),
          matrix: Array.from(detailFrame.matrix),
        },
        nativeGpuReadback: true,
        authoredPixelSha256: sha256(authored.data),
        figurePixelCount: figurePixels,
        counterfactuals: {
          primaryOnly,
          neutralPose,
          materialRoles,
        },
        wallClockRenderReadbackMilliseconds,
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
      plates: plateReceipts,
      contactSheet: {
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
      'scripts/check-hololand-model-village-character-appearance-h3r.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3r.test.mjs',
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

export async function runCharacterAppearanceH3R(options = {}) {
  const resolved = {
    root: options.root || ROOT,
    holoScriptRoot: options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: options.outputDir || path.join(options.root || ROOT, OUTPUT_REL),
    heroOutput: options.heroOutput || null,
    evidenceOutput: options.evidenceOutput || null,
    requireManifest: options.requireManifest ?? false,
  };
  const stack = await parseH3RStack(resolved.root, resolved.holoScriptRoot, resolved.outputDir);
  try {
    const validation = validateH3RContract(stack, resolved.root, resolved.holoScriptRoot);
    if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
    const compiled = await compileH3RResidents(stack, validation.plan);
    const native = await captureNativePlates(
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
      schema: 'hololand.model-village.character-appearance-h3r-witness.v1',
      status: 'pass',
      generatedAt: new Date().toISOString(),
      source: {
        path: SOURCE_REL,
        sha256: sha256(stack.sourceText),
        upstreamHoloScriptCommit: EXPECTED_COMMIT,
      },
      policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
      seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
      architecture: {
        sovereignCompilerGuidance: 'W.GOLD.002',
        sourceCompilerEntrypoint: 'CharacterWebGPUCompiler.compile',
        hostBridgeEntrypoint: 'buildCharacterHostFromComposition',
        rendererEntrypoint: 'renderCharacter',
        rendererBackend: 'webgpu',
        sourcePoseReceiptSchema: 'holoscript.character-source-pose.v1',
        jointDeformationReceiptSchema: 'holoscript.agent-avatar-joint-deformation.v1',
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
        plates: native.plates,
        contactSheet: {
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
    const receiptPath = path.join(finalDir, 'character-appearance-h3r-witness.json');
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
  runCharacterAppearanceH3R(parseArgs())
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
            nativeGpuReadbackPlateCount: receipt.nativeGpuAdmission.plates.length,
            adapter: receipt.nativeGpuAdmission.adapter.info,
            timestampQueryMeasured: receipt.nativeGpuAdmission.adapter.timestampQueryMeasured,
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
