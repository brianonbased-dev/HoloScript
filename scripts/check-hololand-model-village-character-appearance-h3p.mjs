#!/usr/bin/env node
/* global process, performance */

import { createHash } from 'node:crypto';
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
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3p-hand-topology-convergence.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3p-hand-topology-convergence-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3p-hand-topology-convergence-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3p-hand-topology-convergence-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3p-hand-topology-convergence-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3p-hand-topology-convergence-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3p-hand-topology-convergence-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3p';
const EXPECTED_COMMIT = '1a9290762e1c1b1671c0a3ae9fb7d25999f0d0c1';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const HASH_BINDINGS = [
  ['inheritedH3NSource', 'inheritedH3NSourceSha256', 'hololand'],
  ['upstreamAvatarMeshPath', 'upstreamAvatarMeshSha256', 'holoscript'],
  ['upstreamDrawSpecPath', 'upstreamDrawSpecSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamNativeRendererPath', 'upstreamNativeRendererSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
];
const CLEAR = [2, 8, 17];
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
    const accent = panel.accent;
    const rgb = [(accent >> 16) & 0xff, (accent >> 8) & 0xff, accent & 0xff];
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
  const engineEntry = path.join(outputDir, 'h3p-native-character-runtime.mjs');
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
          quatFromAxisAngle,
        } from './packages/engine/src/character-render/skin-math.ts';
        export {
          encodePngRgba,
        } from './packages/engine/src/hologram/browser/pngEncoder.ts';
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h3p-native-character-runtime.entry.ts',
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
        name: 'h3p-wgsl-raw',
        setup(build) {
          build.onResolve({ filter: /\.wgsl\?raw$/ }, (args) => ({
            path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
            namespace: 'h3p-wgsl-raw',
          }));
          build.onLoad({ filter: /.*/, namespace: 'h3p-wgsl-raw' }, (args) => ({
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
  if (
    typeof character?.buildCharacterHostFromComposition !== 'function' ||
    typeof character?.deriveCharacterDetailFrame !== 'function' ||
    typeof character?.deriveCharacterMaterialPlateReceipt !== 'function' ||
    typeof character?.renderCharacter !== 'function' ||
    typeof character?.quatFromAxisAngle !== 'function'
  ) {
    throw new Error('HoloScript native character runtime surface is incomplete');
  }
  if (typeof character.encodePngRgba !== 'function') {
    throw new Error('HoloScript deterministic PNG encoder is missing');
  }
  const requireFromHoloScript = createRequire(path.join(holoScriptRoot, 'package.json'));
  const webGpuEntry = requireFromHoloScript.resolve('webgpu');
  const webGpu = await import(pathToFileURL(webGpuEntry).href);
  const create = webGpu.create ?? webGpu.default?.create;
  if (typeof create !== 'function') throw new Error('webgpu create() is unavailable');
  return {
    character,
    encodePngRgba: character.encodePngRgba,
    createWebGpu: create,
    engineEntry,
    webGpuEntry,
  };
}

export async function parseH3PStack(
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
    ['H3P .holo', source],
    ['H3P .hsplus', policy],
    ['H3P .hs', seed],
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
    throw new Error(`H3P manifest .holo parse failed: ${JSON.stringify(manifest.errors)}`);
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
      objects: (source.ast.objects || []).map((object) => ({
        objectId: object.name,
        ...properties(object),
      })),
    },
  };
}

export function validateH3PContract(
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
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3P_HAND_TOPOLOGY_CONVERGENCE',
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
    ['biometricPersistenceAllowed', false],
    ['sourceCompilerEntrypoint', 'CharacterWebGPUCompiler.compile'],
    ['nativeHostBridgeEntrypoint', 'buildCharacterHostFromComposition'],
    ['nativeRendererEntrypoint', 'renderCharacter'],
    ['nativeRendererBackend', 'webgpu'],
    ['materialRoleMetadataClaimed', true],
    ['nativeNailMaterialSeparationClaimed', true],
    ['sourceBoundDetailFrameClaimed', true],
    ['repeatedCompileByteIdentityClaimed', true],
    ['nativeDawnGpuReadbackClaimed', true],
    ['nailMaterialCounterfactualClaimed', true],
    ['volumePreservingDigitProfileClaimed', true],
    ['volumetricWebBlendClaimed', true],
    ['surfaceConformingNailAttachmentClaimed', true],
    ['watertightNailSkinUnionClaimed', false],
    ['legacyV2ByteCompatibilityClaimed', true],
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
  expect(objects.length === 4, 'exactly four symbolic residents are required');
  for (const [index, object] of (stack.source.ast.objects || []).entries()) {
    const body = object.traits?.find((trait) => trait.name === 'body');
    const label = properties(object).displayLabel;
    expect(label === EXPECTED_RESIDENTS[index], `resident ${index} label drifted`);
    expect(
      body?.config?.upper_body_profile === 'coherent_hand_landmarks_v3' &&
        body?.config?.upper_body_radial_segments === 24 &&
        typeof body?.config?.nail_tone === 'string' &&
        typeof body?.config?.nail_roughness === 'number',
      `${label} hand topology controls drifted`
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

async function compileH3PResidents(stack, plan) {
  const records = [];
  for (const resident of plan) {
    const compile = () =>
      new stack.toolchain.CharacterWebGPUCompiler({
        objectId: resident.objectId,
        entityId: `model-village-h3p-${resident.modelFamilyId}`,
        lodLevel: 0,
      }).compile(stack.source.ast);
    const first = await compile();
    const second = await compile();
    if (first !== second) throw new Error(`${resident.displayLabel} compile was not byte-identical`);
    const bundle = JSON.parse(first);
    if (bundle.format !== 'character-webgpu/drawspec' || bundle.report?.stubbed?.length !== 0) {
      throw new Error(`${resident.displayLabel} compiler output was not fully native`);
    }
    const nailGroups = (bundle.materialGroups || []).filter(
      (group) => group.materialRole === 'keratin-nail'
    );
    if (nailGroups.length !== 10) {
      throw new Error(`${resident.displayLabel} compiler emitted ${nailGroups.length} nail groups`);
    }
    records.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      outputSha256: sha256(first),
      byteLength: Buffer.byteLength(first),
      materialGroupCount: bundle.materialGroups.length,
      nailMaterialGroupCount: nailGroups.length,
      repeatedCompileByteIdentity: true,
    });
  }
  return records;
}

async function captureNativePlates(stack, plan, holoScriptRoot, outputDir) {
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
  const plateReceipts = [];
  try {
    for (const resident of plan) {
      const built = runtime.character.buildCharacterHostFromComposition(stack.source.ast, {
        objectId: resident.objectId,
        entityId: `model-village-h3p-${resident.modelFamilyId}`,
        lodLevel: 0,
      });
      if (!built.ok || !built.host || built.report?.stubbed?.length) {
        throw new Error(
          `${resident.displayLabel} native host bridge failed: ${JSON.stringify(built.report)}`
        );
      }
      const host = built.host;
      const digitSpreadPose = {
        left_thumb_proximal: -0.52,
        left_index_proximal: 0.24,
        left_middle_proximal: 0.08,
        left_ring_proximal: -0.09,
        left_pinky_proximal: -0.27,
      };
      for (const [bone, radians] of Object.entries(digitSpreadPose)) {
        host.setBoneRotation(bone, runtime.character.quatFromAxisAngle(0, 0, 1, radians));
      }
      const anatomy = host.getAnatomyReceipt();
      const left = anatomy.upperBody?.upperLimbs.find((limb) => limb.side === 'left');
      const landmarks = left?.handLandmarks || [];
      const digits = left?.digits || [];
      const nailLandmarks = landmarks.filter((landmark) => landmark.materialRole === 'keratin-nail');
      const webLandmarks = landmarks.filter(
        (landmark) => landmark.kind === 'interdigital-web'
      );
      if (landmarks.length !== 18 || digits.length !== 5 || nailLandmarks.length !== 5) {
        throw new Error(`${resident.displayLabel} left hand emitted ${landmarks.length} landmarks`);
      }
      if (
        digits.some(
          (digit) =>
            digit.profile !== 'volume-preserving-three-phalanx-v2' ||
            digit.radialSegments !== 12 ||
            digit.ringCount !== 9 ||
            digit.jointVolumeBlendRingCount !== 4 ||
            digit.minimumJointRadiusRatio !== 0.62 ||
            digit.maximumAdjacentRadiusDrop !== 0.1 ||
            digit.crossSectionAspectRatio !== 0.88
        )
      ) {
        throw new Error(`${resident.displayLabel} V3 digit-volume receipt drifted`);
      }
      if (
        webLandmarks.length !== 4 ||
        webLandmarks.some(
          (landmark) =>
            landmark.profile !== 'volumetric-interdigital-web-v2' ||
            landmark.blendRingCount !== 4 ||
            landmark.vertexRange.vertexCount !== 50 ||
            landmark.indexRange.indexCount !== 288
        )
      ) {
        throw new Error(`${resident.displayLabel} volumetric web receipt drifted`);
      }
      if (
        nailLandmarks.some(
          (landmark) =>
            landmark.profile !== 'surface-conforming-nail-plate-v2' ||
            landmark.attachment !== 'distal-phalanx-surface-conforming-v1' ||
            landmark.attachmentSampleCount !== 25 ||
            landmark.vertexRange.vertexCount !== 50 ||
            landmark.indexRange.indexCount !== 288 ||
            !(landmark.surfaceEmbedDepth > 0) ||
            !(landmark.freeEdgeThickness > landmark.surfaceEmbedDepth)
        )
      ) {
        throw new Error(`${resident.displayLabel} distal nail attachment receipt drifted`);
      }
      const topologyReceipt = {
        schema: 'holoscript.agent-avatar-hand-topology-convergence.v1',
        digitCount: digits.length,
        digitProfile: 'volume-preserving-three-phalanx-v2',
        digitRadialSegments: 12,
        digitRingCount: 9,
        jointVolumeBlendRingCount: 4,
        minimumJointRadiusRatio: 0.62,
        maximumAdjacentRadiusDrop: 0.1,
        crossSectionAspectRatio: 0.88,
        webCount: webLandmarks.length,
        webProfile: 'volumetric-interdigital-web-v2',
        webRadialSegments: 12,
        webBlendRingCount: 4,
        nailCount: nailLandmarks.length,
        nailProfile: 'surface-conforming-nail-plate-v2',
        nailAttachment: 'distal-phalanx-surface-conforming-v1',
        nailAttachmentSampleCount: 25,
        nailSurfaceEmbedDepthRange: [
          Math.min(...nailLandmarks.map((landmark) => landmark.surfaceEmbedDepth)),
          Math.max(...nailLandmarks.map((landmark) => landmark.surfaceEmbedDepth)),
        ],
        nailFreeEdgeThicknessRange: [
          Math.min(...nailLandmarks.map((landmark) => landmark.freeEdgeThickness)),
          Math.max(...nailLandmarks.map((landmark) => landmark.freeEdgeThickness)),
        ],
        watertightNailSkinUnionClaimed: false,
      };
      const spec = host.getDrawSpec();
      const materialReceipt = runtime.character.deriveCharacterMaterialPlateReceipt(spec);
      const detailFrame = runtime.character.deriveCharacterDetailFrame(
        spec.mesh,
        [
          ...digits.map((digit) => digit.vertexRange),
          ...nailLandmarks.map((landmark) => landmark.vertexRange),
        ],
        { padding: 1.42 }
      );
      if (
        materialReceipt.roleCounts['keratin-nail'] !== 10 ||
        materialReceipt.skinNailOverlapIndexCount !== 0 ||
        !materialReceipt.nailSeparatedFromSkin
      ) {
        throw new Error(`${resident.displayLabel} native material separation failed`);
      }
      const renderOptions = {
        size: PANEL_SIZE,
        viewProj: detailFrame.matrix,
        clear: [CLEAR[0] / 255, CLEAR[1] / 255, CLEAR[2] / 255, 1],
        lightDir: [0.32, 0.72, 0.61],
        cameraPos: [detailFrame.center[0], detailFrame.center[1], 6],
      };
      const startedAt = performance.now();
      const authored = await runtime.character.renderCharacter(device, spec, renderOptions);
      const wallClockRenderReadbackMilliseconds = performance.now() - startedAt;
      const counterfactualSpec = {
        ...spec,
        materialGroups: spec.materialGroups.map((group) =>
          group.materialRole === 'keratin-nail'
            ? {
                ...group,
                material: {
                  ...group.material,
                  color: 0x18f6ff,
                  roughness: 0.08,
                },
              }
            : group
        ),
      };
      const counterfactual = await runtime.character.renderCharacter(
        device,
        counterfactualSpec,
        renderOptions
      );
      const delta = changedPixelStats(authored, counterfactual);
      const figurePixels = figurePixelCount(authored);
      if (figurePixels <= 100 || delta.changedPixelCount <= 5 || delta.absoluteChannelDiff <= 100) {
        throw new Error(
          `${resident.displayLabel} GPU material witness too weak: ${JSON.stringify({
            figurePixels,
            ...delta,
          })}`
        );
      }
      panels.push({ grid: authored, accent: resident.accent });
      plateReceipts.push({
        displayLabel: resident.displayLabel,
        objectId: resident.objectId,
        sourceObjectSha256: sha256(
          JSON.stringify(
            canonical(
              (stack.source.ast.objects || []).find((object) => object.name === resident.objectId)
            )
          )
        ),
        materialReceipt: canonical(materialReceipt),
        topologyReceipt,
        detailFrame: {
          ...canonical(detailFrame),
          matrix: Array.from(detailFrame.matrix),
        },
        nativeGpuReadback: true,
        authoredPixelSha256: sha256(authored.data),
        counterfactualPixelSha256: sha256(counterfactual.data),
        figurePixelCount: figurePixels,
        changedPixelCount: delta.changedPixelCount,
        absoluteChannelDiff: delta.absoluteChannelDiff,
        counterfactualChangedGeometry: false,
        counterfactualChangedOnlyMaterialRole: 'keratin-nail',
        authoredDigitSpreadPoseRadians: digitSpreadPose,
        wallClockRenderReadbackMilliseconds,
        timingClassification:
          'host_wall_clock_includes_submission_and_readback_not_gpu_timestamp_not_rtx_benchmark',
      });
    }
    const contactSheet = buildContactSheet(panels);
    const png = runtime.encodePngRgba(
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
      'scripts/check-hololand-model-village-character-appearance-h3p.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3p.test.mjs',
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

export async function runCharacterAppearanceH3P(options = {}) {
  const resolved = {
    root: options.root || ROOT,
    holoScriptRoot: options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: options.outputDir || path.join(options.root || ROOT, OUTPUT_REL),
    heroOutput: options.heroOutput || null,
    evidenceOutput: options.evidenceOutput || null,
    requireManifest: options.requireManifest ?? false,
  };
  const stack = await parseH3PStack(
    resolved.root,
    resolved.holoScriptRoot,
    resolved.outputDir
  );
  try {
    const validation = validateH3PContract(stack, resolved.root, resolved.holoScriptRoot);
    if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
    const compiled = await compileH3PResidents(stack, validation.plan);
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
      schema: 'hololand.model-village.character-appearance-h3p-witness.v1',
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
        topology: {
          schema: 'holoscript.agent-avatar-hand-topology-convergence.v1',
          residentPlateCount: native.plates.length,
          digitCount: native.plates.reduce(
            (count, plate) => count + plate.topologyReceipt.digitCount,
            0
          ),
          webCount: native.plates.reduce(
            (count, plate) => count + plate.topologyReceipt.webCount,
            0
          ),
          nailCount: native.plates.reduce(
            (count, plate) => count + plate.topologyReceipt.nailCount,
            0
          ),
          watertightNailSkinUnionClaimed: false,
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
        browserWebgpuMeasured: false,
        gpuTimestampFrameTimeClaimed: false,
        freshRtxBenchmarkClaimed: false,
        callbackCadenceCountsAsGpuTime: false,
        endToEndDisplayLatencyClaimed: false,
        nativeWebgpuTaaClaimed: false,
        questWebxrMeasured: false,
        productionSkinTexturingClaimed: false,
        productionGroomClaimed: false,
        photorealismClaimed: false,
        biometricLikenessClaimed: false,
        watertightNailSkinUnionClaimed: false,
        fullWorldConvergenceClaimed: false,
      },
    };
    const finalReceipt = {
      ...receipt,
      receiptSha256: sha256(JSON.stringify(canonical(receipt))),
    };
    const finalDir = path.join(resolved.outputDir, 'final');
    mkdirSync(finalDir, { recursive: true });
    const receiptPath = path.join(finalDir, 'character-appearance-h3p-witness.json');
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
  runCharacterAppearanceH3P(parseArgs())
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
