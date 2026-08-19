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
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3t-skin-surface-response.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3t-skin-surface-response-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3t-skin-surface-response-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3t-skin-surface-response-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3t.mjs';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h3t.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3t-skin-surface-response-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3t-skin-surface-response-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3t-skin-surface-response-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3t';
const EXPECTED_COMMIT = 'f165a58722c0808bc4ab9753ab1c68136870e10d';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const HASH_BINDINGS = [
  ['inheritedH3SSource', 'inheritedH3SSourceSha256', 'hololand'],
  ['upstreamAvatarMeshPath', 'upstreamAvatarMeshSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamNativeRendererPath', 'upstreamNativeRendererSha256', 'holoscript'],
  ['upstreamSkinShaderPath', 'upstreamSkinShaderSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
];
const CLEAR = [2, 8, 17];
const RAKING_LIGHT = [0.72, 0.28, 0.63];
const FACE_SIZE = 320;
const HAND_SIZE = 128;
const CONTACT_GUTTER = 6;
const MIN_SHADOW_CONTRAST = 12;
const LABEL_GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
};

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
  let strongChangedPixelCount = 0;
  let absoluteChannelDiff = 0;
  let maximumPixelDelta = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    const delta =
      Math.abs(a.data[index] - b.data[index]) +
      Math.abs(a.data[index + 1] - b.data[index + 1]) +
      Math.abs(a.data[index + 2] - b.data[index + 2]);
    absoluteChannelDiff += delta;
    maximumPixelDelta = Math.max(maximumPixelDelta, delta);
    if (delta > 0) changedPixelCount += 1;
    if (delta > 8) strongChangedPixelCount += 1;
  }
  return {
    changedPixelCount,
    strongChangedPixelCount,
    absoluteChannelDiff,
    maximumPixelDelta,
  };
}

function figureLuminanceStats(grid) {
  const values = [];
  for (let index = 0; index < grid.data.length; index += 4) {
    const backgroundDelta =
      Math.abs(grid.data[index] - CLEAR[0]) +
      Math.abs(grid.data[index + 1] - CLEAR[1]) +
      Math.abs(grid.data[index + 2] - CLEAR[2]);
    if (backgroundDelta <= 25) continue;
    values.push(
      grid.data[index] * 0.2126 +
        grid.data[index + 1] * 0.7152 +
        grid.data[index + 2] * 0.0722
    );
  }
  values.sort((a, b) => a - b);
  const percentile = (fraction) =>
    values.length ? values[Math.min(values.length - 1, Math.floor(values.length * fraction))] : 0;
  const p10 = percentile(0.1);
  const p50 = percentile(0.5);
  const p90 = percentile(0.9);
  return {
    figurePixelCount: values.length,
    p10,
    p50,
    p90,
    p90MinusP10: p90 - p10,
    metric: 'figure-luminance-p90-minus-p10',
  };
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

function drawResidentLabel(data, width, height, label, accentRgb) {
  const scale = 2;
  const glyphWidth = 5 * scale;
  const gap = scale;
  const text = label.toUpperCase();
  const textWidth = text.length * glyphWidth + Math.max(0, text.length - 1) * gap;
  const originX = 12;
  const originY = 12;
  const padding = 5;
  for (let y = originY - padding; y < originY + 7 * scale + padding; y += 1) {
    for (let x = originX - padding; x < originX + textWidth + padding; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const offset = (y * width + x) * 4;
      data[offset] = CLEAR[0];
      data[offset + 1] = CLEAR[1];
      data[offset + 2] = CLEAR[2];
      data[offset + 3] = 255;
    }
  }
  let cursorX = originX;
  for (const character of text) {
    const glyph = LABEL_GLYPHS[character];
    if (glyph) {
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((pixel, columnIndex) => {
          if (pixel !== '1') return;
          for (let y = 0; y < scale; y += 1) {
            for (let x = 0; x < scale; x += 1) {
              const targetX = cursorX + columnIndex * scale + x;
              const targetY = originY + rowIndex * scale + y;
              const offset = (targetY * width + targetX) * 4;
              data[offset] = accentRgb[0];
              data[offset + 1] = accentRgb[1];
              data[offset + 2] = accentRgb[2];
              data[offset + 3] = 255;
            }
          }
        });
      });
    }
    cursorX += glyphWidth + gap;
  }
}

function compositeHandInset(face, hand, accent, label) {
  const data = new Uint8Array(face.data);
  const border = 4;
  const margin = 10;
  const originX = face.width - hand.width - margin;
  const originY = face.height - hand.height - margin;
  const accentRgb = [(accent >> 16) & 0xff, (accent >> 8) & 0xff, accent & 0xff];
  for (let y = -border; y < hand.height + border; y += 1) {
    for (let x = -border; x < hand.width + border; x += 1) {
      const targetX = originX + x;
      const targetY = originY + y;
      if (targetX < 0 || targetY < 0 || targetX >= face.width || targetY >= face.height) continue;
      const target = (targetY * face.width + targetX) * 4;
      const inHand = x >= 0 && y >= 0 && x < hand.width && y < hand.height;
      if (inHand) {
        const source = (y * hand.width + x) * 4;
        data.set(hand.data.subarray(source, source + 4), target);
      } else {
        data[target] = accentRgb[0];
        data[target + 1] = accentRgb[1];
        data[target + 2] = accentRgb[2];
        data[target + 3] = 255;
      }
    }
  }
  drawResidentLabel(data, face.width, face.height, label, accentRgb);
  return { width: face.width, height: face.height, data };
}

function buildContactSheet(panels) {
  const width = FACE_SIZE * 2 + CONTACT_GUTTER * 3;
  const height = FACE_SIZE * 2 + CONTACT_GUTTER * 3;
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
    const originX = CONTACT_GUTTER + column * (FACE_SIZE + CONTACT_GUTTER);
    const originY = CONTACT_GUTTER + row * (FACE_SIZE + CONTACT_GUTTER);
    for (let y = 0; y < FACE_SIZE; y += 1) {
      const sourceStart = y * FACE_SIZE * 4;
      const targetStart = ((originY + y) * width + originX) * 4;
      data.set(panel.grid.data.subarray(sourceStart, sourceStart + FACE_SIZE * 4), targetStart);
    }
    const rgb = [(panel.accent >> 16) & 0xff, (panel.accent >> 8) & 0xff, panel.accent & 0xff];
    for (let x = originX; x < originX + FACE_SIZE; x += 1) {
      for (const y of [originY - 2, originY - 1, originY + FACE_SIZE, originY + FACE_SIZE + 1]) {
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
  const engineEntry = path.join(outputDir, 'h3t-native-character-runtime.mjs');
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
      sourcefile: 'h3t-native-character-runtime.entry.ts',
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
        name: 'h3t-wgsl-raw',
        setup(build) {
          build.onResolve({ filter: /\.wgsl\?raw$/ }, (args) => ({
            path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
            namespace: 'h3t-wgsl-raw',
          }));
          build.onLoad({ filter: /.*/, namespace: 'h3t-wgsl-raw' }, (args) => ({
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
    'quatFromAxisAngle',
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

export async function parseH3TStack(
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
    ['H3T .holo', source],
    ['H3T .hsplus', policy],
    ['H3T .hs', seed],
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
    throw new Error(`H3T manifest .holo parse failed: ${JSON.stringify(manifest.errors)}`);
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
        const objectProperties = properties(object);
        const sss = object.traits?.find((trait) => trait.name === 'subsurface_scattering');
        return {
          objectId: object.name,
          ...objectProperties,
          microdetailScale: sss?.config?.microdetail_scale,
          albedoVariationStrength: sss?.config?.albedo_variation_strength,
          roughnessVariationStrength: sss?.config?.roughness_variation_strength,
          normalMicrodetailStrength: sss?.config?.normal_microdetail_strength,
        };
      }),
    },
  };
}

export function validateH3TContract(
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
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3T_SKIN_SURFACE_RESPONSE',
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
    ['materialCalibrationProfile', 'fixed-light-human-v1'],
    ['skinSurfaceResponseProfile', 'calibrated-skin-surface-v1'],
    ['skinMicrodetailProfile', 'analytic-pore-v1'],
    ['nativeSkinReceiptSchema', 'holoscript.agent-avatar-skin-material.v3'],
    ['sourceBoundFaceFrameClaimed', true],
    ['sourceBoundHandInsetClaimed', true],
    ['repeatedCompileByteIdentityClaimed', true],
    ['nativeDawnGpuReadbackClaimed', true],
    ['albedoCounterfactualClaimed', true],
    ['roughnessCounterfactualClaimed', true],
    ['fineNormalCounterfactualClaimed', true],
    ['nailBedTransitionCounterfactualClaimed', true],
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
  expect(
    JSON.stringify(state.semanticSurfaceChannels) ===
      JSON.stringify(['albedo-variation', 'roughness-variation', 'fine-normal-response']),
    'semantic surface channels drifted'
  );
  expect(
    JSON.stringify(state.retainedHandMaterialRoles) ===
      JSON.stringify(['skin', 'keratin-nail', 'nail-bed']),
    'retained hand material roles drifted'
  );
  expect(
    JSON.stringify(state.rakingLightDirection) === JSON.stringify(RAKING_LIGHT),
    'raking light drifted'
  );
  expect(objects.length === 4, 'exactly four symbolic residents are required');
  for (const [index, object] of (stack.source.ast.objects || []).entries()) {
    const body = object.traits?.find((trait) => trait.name === 'body');
    const face = object.traits?.find((trait) => trait.name === 'face');
    const sss = object.traits?.find((trait) => trait.name === 'subsurface_scattering');
    const label = properties(object).displayLabel;
    expect(label === EXPECTED_RESIDENTS[index], `resident ${index} label drifted`);
    expect(
      body?.config?.upper_body_profile === 'coherent_hand_surface_v5' &&
        body?.config?.upper_body_radial_segments === 24,
      `${label} V5 hand profile drifted`
    );
    expect(
      face?.config?.topology === 'neutral_anatomical_v2' &&
        face?.config?.facial_detail_profile === 'civic_landmarks_v1',
      `${label} source-bound face profile drifted`
    );
    expect(
      sss?.config?.material_calibration_profile === 'fixed_light_human_v1' &&
        sss?.config?.microdetail_profile === 'analytic_pore_v1' &&
        sss?.config?.surface_response_profile === 'calibrated_skin_surface_v1' &&
        sss?.config?.albedo_variation_strength > 0 &&
        sss?.config?.roughness_variation_strength > 0 &&
        sss?.config?.normal_microdetail_strength > 0,
      `${label} decoupled surface controls drifted`
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

async function compileH3TResidents(stack, plan) {
  const records = [];
  for (const resident of plan) {
    const compile = () =>
      new stack.toolchain.CharacterWebGPUCompiler({
        objectId: resident.objectId,
        entityId: `model-village-h3t-${resident.modelFamilyId}`,
        lodLevel: 0,
      }).compile(stack.source.ast);
    const first = await compile();
    const second = await compile();
    if (first !== second) {
      throw new Error(`${resident.displayLabel} compile was not byte-identical`);
    }
    const bundle = JSON.parse(first);
    const skinGroup = (bundle.materialGroups || []).find(
      (group) => group.materialRole === 'skin'
    );
    if (
      bundle.format !== 'character-webgpu/drawspec' ||
      bundle.report?.stubbed?.length !== 0 ||
      bundle.skin?.schemaVersion !== 'holoscript.agent-avatar-skin-material.v3' ||
      bundle.skin?.surfaceResponseProfile !== 'calibrated-skin-surface-v1' ||
      bundle.skin?.albedoVariationStrength !== resident.albedoVariationStrength ||
      bundle.skin?.roughnessVariationStrength !== resident.roughnessVariationStrength ||
      bundle.skin?.normalMicrodetailStrength !== resident.normalMicrodetailStrength ||
      skinGroup?.material?.surfaceResponseProfile !== 'calibrated-skin-surface-v1' ||
      bundle.facialLandmarks?.schemaVersion !==
        'holoscript.agent-avatar-facial-landmarks.v1' ||
      bundle.handSurface?.schemaVersion !== 'holoscript.agent-avatar-hand-surface.v1'
    ) {
      throw new Error(`${resident.displayLabel} compiler skin-surface ABI drifted`);
    }
    records.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      outputSha256: sha256(first),
      byteLength: Buffer.byteLength(first),
      materialGroupCount: bundle.materialGroups.length,
      skinReceipt: canonical(bundle.skin),
      facialLandmarks: canonical(bundle.facialLandmarks),
      handSurface: canonical(bundle.handSurface),
      repeatedCompileByteIdentity: true,
    });
  }
  return records;
}

function skinChannelCounterfactual(spec, field) {
  return {
    ...spec,
    materialGroups: spec.materialGroups.map((group) =>
      group.materialRole === 'skin'
        ? {
            ...group,
            material: {
              ...group.material,
              [field]: 0,
            },
          }
        : group
    ),
  };
}

function nailBedCounterfactual(spec) {
  return {
    ...spec,
    materialGroups: spec.materialGroups.map((group) =>
      group.materialRole === 'nail-bed'
        ? {
            ...group,
            material: {
              ...group.material,
              color: 0xff2b78,
              roughness: 0.08,
            },
          }
        : group
    ),
  };
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
        entityId: `model-village-h3t-${resident.modelFamilyId}`,
        lodLevel: 0,
      });
      if (!built.ok || !built.host || built.report?.stubbed?.length) {
        throw new Error(
          `${resident.displayLabel} native host bridge failed: ${JSON.stringify(built.report)}`
        );
      }
      if (
        built.skin?.schemaVersion !== 'holoscript.agent-avatar-skin-material.v3' ||
        built.facialLandmarks?.schemaVersion !==
          'holoscript.agent-avatar-facial-landmarks.v1' ||
        built.handSurface?.schemaVersion !== 'holoscript.agent-avatar-hand-surface.v1'
      ) {
        throw new Error(`${resident.displayLabel} native source receipts drifted`);
      }
      const host = built.host;
      for (const [bone, radians] of Object.entries({
        left_thumb_proximal: -0.52,
        left_index_proximal: 0.24,
        left_middle_proximal: 0.08,
        left_ring_proximal: -0.09,
        left_pinky_proximal: -0.27,
      })) {
        host.setBoneRotation(bone, runtime.character.quatFromAxisAngle(0, 0, 1, radians));
      }
      const anatomy = host.getAnatomyReceipt();
      const left = anatomy.upperBody?.upperLimbs.find((limb) => limb.side === 'left');
      const digits = left?.digits || [];
      const nailLandmarks = (left?.handLandmarks || []).filter(
        (landmark) => landmark.materialRole === 'keratin-nail'
      );
      if (digits.length !== 5 || nailLandmarks.length !== 5) {
        throw new Error(`${resident.displayLabel} V5 hand ranges drifted`);
      }
      const spec = host.getDrawSpec();
      const geometrySha256 = sha256(
        Buffer.concat([
          Buffer.from(spec.mesh.positions.buffer),
          Buffer.from(spec.mesh.indices.buffer),
        ])
      );
      const skinReceipt = host.getSkinMaterialReceipt();
      const handSurface = host.getHandSurfaceReceipt();
      const materialReceipt = runtime.character.deriveCharacterMaterialPlateReceipt(spec);
      if (
        skinReceipt.schemaVersion !== 'holoscript.agent-avatar-skin-material.v3' ||
        skinReceipt.surfaceResponseProfile !== 'calibrated-skin-surface-v1' ||
        handSurface?.schemaVersion !== 'holoscript.agent-avatar-hand-surface.v1' ||
        materialReceipt.skinNailOverlapIndexCount !== 0 ||
        materialReceipt.skinNailBedOverlapIndexCount !== 0 ||
        materialReceipt.nailBedKeratinOverlapIndexCount !== 0 ||
        !materialReceipt.calibratedNailSurface
      ) {
        throw new Error(`${resident.displayLabel} material/hand receipt drifted`);
      }
      const faceFrame = runtime.character.deriveCharacterDetailFrame(
        spec.mesh,
        [built.facialLandmarks.vertexRange],
        { padding: 2.15, minHalfExtent: 0.12 }
      );
      const handFrame = runtime.character.deriveCharacterDetailFrame(
        spec.mesh,
        [
          ...digits.map((digit) => digit.vertexRange),
          ...nailLandmarks.map((landmark) => landmark.vertexRange),
        ],
        { padding: 1.42 }
      );
      const faceOptions = {
        size: FACE_SIZE,
        viewProj: faceFrame.matrix,
        clear: [CLEAR[0] / 255, CLEAR[1] / 255, CLEAR[2] / 255, 1],
        lightDir: RAKING_LIGHT,
        cameraPos: [faceFrame.center[0], faceFrame.center[1], 6],
      };
      const handOptions = {
        size: HAND_SIZE,
        viewProj: handFrame.matrix,
        clear: [CLEAR[0] / 255, CLEAR[1] / 255, CLEAR[2] / 255, 1],
        lightDir: RAKING_LIGHT,
        cameraPos: [handFrame.center[0], handFrame.center[1], 6],
      };
      const startedAt = performance.now();
      const authoredFace = await runtime.character.renderCharacter(device, spec, faceOptions);
      const wallClockFaceRenderReadbackMilliseconds = performance.now() - startedAt;
      const counterfactuals = {};
      for (const [label, field] of [
        ['albedo', 'albedoVariationStrength'],
        ['roughness', 'roughnessVariationStrength'],
        ['fineNormal', 'normalMicrodetailStrength'],
      ]) {
        const pixels = await runtime.character.renderCharacter(
          device,
          skinChannelCounterfactual(spec, field),
          faceOptions
        );
        counterfactuals[label] = {
          ...changedPixelStats(authoredFace, pixels),
          pixelSha256: sha256(pixels.data),
          changedGeometry: false,
          changedOnlySkinField: field,
        };
      }
      const authoredHand = await runtime.character.renderCharacter(device, spec, handOptions);
      const nailBedPixels = await runtime.character.renderCharacter(
        device,
        nailBedCounterfactual(spec),
        handOptions
      );
      const nailBedTransition = {
        ...changedPixelStats(authoredHand, nailBedPixels),
        pixelSha256: sha256(nailBedPixels.data),
        changedGeometry: false,
        changedOnlyMaterialRole: 'nail-bed',
      };
      for (const [label, witness] of [
        ...Object.entries(counterfactuals),
        ['nailBedTransition', nailBedTransition],
      ]) {
        if (witness.changedPixelCount <= 0 || witness.absoluteChannelDiff <= 0) {
          throw new Error(
            `${resident.displayLabel} ${label} native counterfactual had no pixel delta`
          );
        }
      }
      const shadowReadability = figureLuminanceStats(authoredFace);
      if (
        shadowReadability.figurePixelCount <= 500 ||
        shadowReadability.p90MinusP10 < MIN_SHADOW_CONTRAST
      ) {
        throw new Error(
          `${resident.displayLabel} raking-light readability too weak: ${JSON.stringify(
            shadowReadability
          )}`
        );
      }
      const panel = compositeHandInset(
        authoredFace,
        authoredHand,
        resident.accent,
        resident.displayLabel
      );
      panels.push({ grid: panel, accent: resident.accent });
      plateReceipts.push({
        displayLabel: resident.displayLabel,
        objectId: resident.objectId,
        sourceObjectSha256: sha256(
          JSON.stringify(
            canonical(
              (stack.source.ast.objects || []).find(
                (object) => object.name === resident.objectId
              )
            )
          )
        ),
        geometrySha256,
        fixedLighting: {
          direction: RAKING_LIGHT,
          clearColorBytes: CLEAR,
          faceCamera: 'source-bounded-civic-landmark-frame-v1',
          handCamera: 'source-bounded-v5-hand-frame-v1',
        },
        skinReceipt: canonical(skinReceipt),
        handSurface: canonical(handSurface),
        materialReceipt: canonical(materialReceipt),
        faceFrame: {
          ...canonical(faceFrame),
          matrix: Array.from(faceFrame.matrix),
        },
        handFrame: {
          ...canonical(handFrame),
          matrix: Array.from(handFrame.matrix),
        },
        nativeGpuReadback: true,
        authoredFacePixelSha256: sha256(authoredFace.data),
        authoredHandPixelSha256: sha256(authoredHand.data),
        panelPixelSha256: sha256(panel.data),
        shadowReadability,
        counterfactuals: {
          ...counterfactuals,
          nailBedTransition,
        },
        wallClockFaceRenderReadbackMilliseconds,
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
    [CHECKER_REL, /checkerSha256:\s*"([0-9a-f]{64})"/],
    [TEST_REL, /testSha256:\s*"([0-9a-f]{64})"/],
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

export async function runCharacterAppearanceH3T(options = {}) {
  const resolved = {
    root: options.root || ROOT,
    holoScriptRoot: options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: options.outputDir || path.join(options.root || ROOT, OUTPUT_REL),
    heroOutput: options.heroOutput || null,
    evidenceOutput: options.evidenceOutput || null,
    requireManifest: options.requireManifest ?? false,
  };
  const stack = await parseH3TStack(
    resolved.root,
    resolved.holoScriptRoot,
    resolved.outputDir
  );
  try {
    const validation = validateH3TContract(stack, resolved.root, resolved.holoScriptRoot);
    if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
    const compiled = await compileH3TResidents(stack, validation.plan);
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
      schema: 'hololand.model-village.character-appearance-h3t-witness.v1',
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
        materialCalibrationProfile: 'fixed-light-human-v1',
        skinSurfaceResponseProfile: 'calibrated-skin-surface-v1',
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
        fixedLighting: {
          direction: RAKING_LIGHT,
          clearColorBytes: CLEAR,
          facePlateSizePixels: FACE_SIZE,
          handInsetSizePixels: HAND_SIZE,
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
    const receiptPath = path.join(finalDir, 'character-appearance-h3t-witness.json');
    writeFileSync(receiptPath, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
    if (resolved.heroOutput) {
      mkdirSync(path.dirname(resolved.heroOutput), { recursive: true });
      writeFileSync(resolved.heroOutput, native.contactSheet.png);
    }
    if (resolved.evidenceOutput) {
      mkdirSync(path.dirname(resolved.evidenceOutput), { recursive: true });
      writeFileSync(
        resolved.evidenceOutput,
        `${JSON.stringify(finalReceipt, null, 2)}\n`,
        'utf8'
      );
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

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3T(parseArgs())
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
            channelPixelDeltas: Object.fromEntries(
              receipt.nativeGpuAdmission.plates.map((plate) => [
                plate.displayLabel,
                Object.fromEntries(
                  Object.entries(plate.counterfactuals).map(([key, value]) => [
                    key,
                    value.changedPixelCount,
                  ])
                ),
              ])
            ),
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
