#!/usr/bin/env node
/* global WebSocket */

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseH3UStack } from './check-hololand-model-village-character-appearance-h3u.mjs';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3V',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3v-portrait-anatomy'],
});
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3v-portrait-anatomy.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3v-portrait-anatomy-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3v-portrait-anatomy-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3v-portrait-anatomy-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3v.mjs';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h3v.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3v-portrait-anatomy-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3v-portrait-anatomy-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3v-portrait-anatomy-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3v';
const EXPECTED_COMMIT = '38cef37972e2c5a6a980ae874206c15f5752ce26';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const RENDER_SIZE = 384;
const CLEAR = [0.008, 0.031, 0.067, 1];
const LIGHT = [0.72, 0.28, 0.63];
const CAMERA = [0, 1.05, 6];
const HASH_BINDINGS = [
  ['upstreamAvatarMeshPath', 'upstreamAvatarMeshSha256'],
  ['upstreamHostBridgePath', 'upstreamHostBridgeSha256'],
  ['upstreamRendererPath', 'upstreamRendererSha256'],
];

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function sha256PortableFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.holo', '.hsplus', '.hs', '.mjs', '.md', '.json'].includes(extension)) {
    return sha256(readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n'));
  }
  return sha256File(filePath);
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

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value])
  );
}

function trait(node, name) {
  return node?.traits?.find((candidate) => candidate.name === name);
}

function gitHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    browser: null,
    outputDir: path.join(ROOT, OUTPUT_REL),
    writeArtifacts: false,
    skipManifest: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node ${CHECKER_REL} [options]

Options:
  --holoscript-root <path>  Pinned, built HoloScript checkout
  --browser <path>          Chrome or Edge executable
  --output-dir <path>       Runtime and temporary screenshot directory
  --write-artifacts         Refresh the durable PNG and JSON witness
  --skip-manifest           Bootstrap before the immutable manifest exists
  --json                    Emit the complete receipt`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function parseH3VStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
  outputDir = path.join(root, OUTPUT_REL)
) {
  const stack = await parseH3UStack(root, holoScriptRoot, outputDir);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const manifestPath = path.join(root, MANIFEST_REL);
  const manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  const source = new stack.toolchain.HoloCompositionParser().parse(sourceText);
  const policy = new stack.toolchain.HoloScriptPlusParser().parse(policyText);
  const seed = new stack.toolchain.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3V .holo', source],
    ['H3V .hsplus', policy],
    ['H3V .hs', seed],
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
    throw new Error(`H3V manifest parse failed: ${JSON.stringify(manifest.errors)}`);
  }
  const objects = (source.ast.objects || []).map((object) => ({
    objectId: object.name,
    ...properties(object),
    height: trait(object, 'body')?.config?.height,
  }));
  return {
    ...stack,
    h3vSource: source,
    h3vPolicy: policy,
    h3vSeed: seed,
    h3vManifest: manifest,
    h3vContract: {
      metadata: source.ast.metadata,
      state: properties(source.ast.state),
      objects,
    },
  };
}

export function validateH3VContract(
  stack,
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT
) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state, objects } = stack.h3vContract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3V_PORTRAIT_ANATOMY',
    'milestone drifted'
  );
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'commit pin drifted');
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  for (const [pathKey, hashKey] of HASH_BINDINGS) {
    const absolute = path.join(holoScriptRoot, metadata[pathKey] || '');
    expect(existsSync(absolute), `${pathKey} does not exist`);
    if (existsSync(absolute)) {
      expect(sha256File(absolute) === metadata[hashKey], `${hashKey} drifted`);
    }
  }
  for (const [key, expected] of [
    ['residentCount', 4],
    ['providerModelBinding', 'absent'],
    ['adapterFamilyBinding', 'absent'],
    ['canonicalWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['sourceCompilerEntrypoint', 'CharacterWebGPUCompiler.compile'],
    ['browserRendererEntrypoint', 'renderCharacter'],
    ['browserRendererBackend', 'webgpu'],
    ['portraitAnatomyProfile', 'coherent_portrait_anatomy_v6'],
    ['portraitSilhouetteProfile', 'portrait_silhouette_v2'],
    ['shoulderBlendRingCount', 6],
    ['minimumAuthoredShoulderRadiusRatio', 0.7],
    ['minimumSuperiorShoulderContourScale', 0.15],
    ['expectedShoulderInfluencedVertexCount', 288],
    ['expectedTotalInfluencedVertexCount', 1200],
    ['poseName', 'portrait_arms_down'],
    ['poseBoneCount', 4],
    ['fixedLightSkinCalibrationRequired', true],
    ['analyticPoreMicrodetailRequired', true],
    ['browserWebgpuMeasured', true],
    ['browserAdapterRequired', true],
    ['browserDeviceRequired', true],
    ['sourcePoseApplied', true],
    ['gpuTimestampMeasured', false],
    ['freshRtxBenchmarkClaimed', false],
    ['questHeadsetMeasured', false],
    ['browserWebxrMeasured', false],
    ['photorealismClaimed', false],
    ['physicallyCalibratedCameraClaimed', false],
    ['fullWorldPerformanceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    JSON.stringify(state.residentNames) === JSON.stringify(EXPECTED_RESIDENTS),
    'resident names drifted'
  );
  expect(objects.length === 4, 'exactly four residents are required');
  for (const [index, object] of (stack.h3vSource.ast.objects || []).entries()) {
    const values = properties(object);
    const body = trait(object, 'body')?.config;
    const face = trait(object, 'face')?.config;
    const skin = trait(object, 'subsurface_scattering')?.config;
    const pose = trait(object, 'pose')?.config;
    expect(values.displayLabel === EXPECTED_RESIDENTS[index], `resident ${index} label drifted`);
    expect(
      body?.upper_body_profile === 'coherent_portrait_anatomy_v6',
      `${values.displayLabel} portrait body profile drifted`
    );
    expect(
      face?.topology === 'neutral_anatomical_v2' &&
        face?.facial_detail_profile === 'portrait_silhouette_v2',
      `${values.displayLabel} portrait face profile drifted`
    );
    expect(
      Number.isFinite(face?.cheekbone_scale) &&
        Number.isFinite(face?.chin_projection) &&
        Number.isFinite(face?.temple_width),
      `${values.displayLabel} silhouette controls are missing`
    );
    expect(
      skin?.material_calibration_profile === 'fixed_light_human_v1' &&
        skin?.microdetail_profile === 'analytic_pore_v1' &&
        skin?.surface_response_profile === 'calibrated_skin_surface_v1',
      `${values.displayLabel} calibrated skin contract drifted`
    );
    expect(
      pose?.name === 'portrait_arms_down' &&
        Object.keys(pose?.bones || {}).sort().join(',') ===
          'left_shoulder,left_upper_arm,right_shoulder,right_upper_arm',
      `${values.displayLabel} source pose drifted`
    );
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    plan: objects,
  };
}

function typedArray(value) {
  return value ? Array.from(value) : null;
}

function serializeSpec(spec) {
  return {
    jointCount: spec.jointCount,
    mesh: {
      vertexCount: spec.mesh.vertexCount,
      positions: typedArray(spec.mesh.positions),
      normals: typedArray(spec.mesh.normals),
      tangents: typedArray(spec.mesh.tangents),
      indices: typedArray(spec.mesh.indices),
      jointIndices: typedArray(spec.mesh.jointIndices),
      jointWeights: typedArray(spec.mesh.jointWeights),
      secondaryJointIndices: typedArray(spec.mesh.secondaryJointIndices),
      secondaryJointWeights: typedArray(spec.mesh.secondaryJointWeights),
      uvs: typedArray(spec.mesh.uvs),
    },
    jointMatrices: typedArray(spec.jointMatrices),
    modelMatrix: typedArray(spec.modelMatrix),
    materialGroups: spec.materialGroups,
  };
}

function wgslRawPlugin() {
  return {
    name: 'h3v-wgsl-raw',
    setup(build) {
      build.onResolve({ filter: /\.wgsl\?raw$/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
        namespace: 'h3v-wgsl-raw',
      }));
      build.onLoad({ filter: /.*/, namespace: 'h3v-wgsl-raw' }, (args) => ({
        contents: readFileSync(args.path, 'utf8'),
        loader: 'text',
      }));
    },
  };
}

async function buildNodeHostRuntime(stack, holoScriptRoot, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const outfile = path.join(outputDir, 'h3v-host-runtime.mjs');
  await stack.esbuild.build({
    stdin: {
      contents: `
        export {
          buildCharacterHostFromComposition,
        } from './packages/engine/src/character-render/CharacterHostFromComposition.ts';
        export {
          deriveCharacterDetailFrame,
        } from './packages/engine/src/character-render/character-render.ts';
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h3v-host-runtime.entry.ts',
      loader: 'ts',
    },
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node20'],
    sourcemap: false,
    logLevel: 'silent',
    plugins: [wgslRawPlugin()],
  });
  return import(`${pathToFileURL(outfile).href}?sha=${sha256File(outfile)}`);
}

async function bundleBrowserRuntime(stack, holoScriptRoot) {
  const result = await stack.esbuild.build({
    stdin: {
      contents: `
        import {
          renderCharacter,
        } from './packages/engine/src/character-render/character-render.ts';
        window.__H3V_RUNTIME__ = { renderCharacter };
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h3v-browser-runtime.entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    loader: { '.wgsl': 'text' },
    write: false,
    legalComments: 'none',
    minify: true,
    logLevel: 'silent',
    plugins: [wgslRawPlugin()],
  });
  assert(result.outputFiles?.length === 1, 'browser runtime bundle was not emitted');
  return result.outputFiles[0].text;
}

async function buildCompiledPayload(stack, plan, holoScriptRoot, outputDir) {
  const hostRuntime = await buildNodeHostRuntime(stack, holoScriptRoot, outputDir);
  const residents = [];
  const compilerRecords = [];
  for (const resident of plan) {
    const compile = () =>
      new stack.toolchain.CharacterWebGPUCompiler({
        objectId: resident.objectId,
        entityId: `model-village-h3v-${resident.modelFamilyId}`,
        lodLevel: 0,
      }).compile(stack.h3vSource.ast);
    const first = await compile();
    const second = await compile();
    assert(first === second, `${resident.displayLabel} compile drifted`);
    const bundle = JSON.parse(first);
    assert(bundle.format === 'character-webgpu/drawspec', 'compiler output format drifted');
    assert(bundle.report?.stubbed?.length === 0, `${resident.displayLabel} compiler stubbed`);
    const built = hostRuntime.buildCharacterHostFromComposition(stack.h3vSource.ast, {
      objectId: resident.objectId,
      entityId: `model-village-h3v-${resident.modelFamilyId}-host`,
      lodLevel: 0,
    });
    assert(
      built.ok && built.host && built.report?.stubbed?.length === 0,
      `${resident.displayLabel} host bridge failed`
    );
    assert(
      built.anatomy?.upperBody?.profile === 'portrait-anatomy-v6',
      `${resident.displayLabel} upper-body receipt drifted`
    );
    assert(
      built.jointDeformation?.profile === 'portrait-shoulder-volume-v2' &&
        built.jointDeformation?.regionVertexCounts?.shoulder === 288 &&
        built.jointDeformation?.influencedVertexCount === 1200 &&
        built.jointDeformation?.shoulderVolume?.blendRingCount === 6 &&
        built.jointDeformation?.shoulderVolume?.minimumAuthoredRadiusRatio >= 0.7,
      `${resident.displayLabel} shoulder-volume receipt drifted`
    );
    assert(
      built.anatomy?.upperBody?.upperLimbs.every(
        (limb) => limb.superiorContourScaleMin === 0.15
      ),
      `${resident.displayLabel} superior shoulder contour drifted`
    );
    assert(
      built.facialLandmarks?.profile === 'portrait-silhouette-v2',
      `${resident.displayLabel} facial-silhouette receipt drifted`
    );
    assert(
      built.pose?.name === 'portrait_arms_down' && built.pose?.boneCount === 4,
      `${resident.displayLabel} source pose was not applied`
    );
    assert(
      built.host.getSkinMaterialReceipt()?.calibrationProfile === 'fixed-light-human-v1',
      `${resident.displayLabel} fixed-light skin receipt drifted`
    );
    built.host.applyWorldState({
      position: { x: 0, y: 0, z: 0 },
      rotationY: -0.08,
    });
    const spec = built.host.getDrawSpec();
    assert(
      spec.mesh.secondaryJointIndices?.length === spec.mesh.vertexCount &&
        spec.mesh.secondaryJointWeights?.length === spec.mesh.vertexCount,
      `${resident.displayLabel} secondary deformation channels are missing`
    );
    const upperBody = built.anatomy.upperBody;
    const frameRanges = [
      upperBody.vertexRange,
      ...upperBody.upperLimbs.map((limb) => limb.vertexRange),
      built.facialLandmarks.vertexRange,
    ];
    const frame = hostRuntime.deriveCharacterDetailFrame(spec.mesh, frameRanges, {
      padding: 1.08,
      minHalfExtent: 0.5,
    });
    residents.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      modelFamilyId: resident.modelFamilyId,
      accentColor: resident.accentColor,
      heightScale: resident.height / 1.82,
      spec: serializeSpec(spec),
      viewProj: typedArray(frame.matrix),
    });
    compilerRecords.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      modelFamilyId: resident.modelFamilyId,
      outputSha256: sha256(first),
      byteLength: Buffer.byteLength(first),
      repeatedCompileByteIdentity: true,
      vertexCount: spec.mesh.vertexCount,
      indexCount: spec.mesh.indices.length,
      materialGroupCount: spec.materialGroups.length,
      upperBodyProfile: built.anatomy.upperBody.profile,
      superiorContourScaleMin: Math.min(
        ...built.anatomy.upperBody.upperLimbs.map((limb) => limb.superiorContourScaleMin)
      ),
      jointDeformation: canonical(built.jointDeformation),
      facialLandmarks: canonical(built.facialLandmarks),
      pose: canonical(built.pose),
      skinMaterial: canonical(built.host.getSkinMaterialReceipt()),
    });
  }
  return {
    payload: {
      schema: 'hololand.model-village.character-appearance-h3v-browser-payload.v1',
      renderSize: RENDER_SIZE,
      clear: CLEAR,
      light: LIGHT,
      camera: CAMERA,
      residents,
    },
    compilerRecords,
  };
}

function safeInlineJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function browserApplication() {
  return String.raw`
(() => {
  const payload = window.__H3V_PAYLOAD__;
  const runtime = window.__H3V_RUNTIME__;
  const state = {
    schema: 'hololand.model-village.character-appearance-h3v-browser-state.v1',
    ready: false,
    status: 'booting',
    gpu: null,
    residents: [],
    errors: [],
  };
  window.__H3V__ = state;

  const hydrateSpec = (value) => ({
    jointCount: value.jointCount,
    mesh: {
      vertexCount: value.mesh.vertexCount,
      positions: new Float32Array(value.mesh.positions),
      normals: new Float32Array(value.mesh.normals),
      tangents: new Float32Array(value.mesh.tangents),
      indices: new Uint32Array(value.mesh.indices),
      jointIndices: new Uint32Array(value.mesh.jointIndices),
      jointWeights: new Float32Array(value.mesh.jointWeights),
      secondaryJointIndices: value.mesh.secondaryJointIndices
        ? new Uint32Array(value.mesh.secondaryJointIndices)
        : undefined,
      secondaryJointWeights: value.mesh.secondaryJointWeights
        ? new Float32Array(value.mesh.secondaryJointWeights)
        : undefined,
      uvs: new Float32Array(value.mesh.uvs),
    },
    jointMatrices: new Float32Array(value.jointMatrices),
    modelMatrix: new Float32Array(value.modelMatrix),
    materialGroups: value.materialGroups,
  });

  const gridSha256 = async (grid) => {
    const bytes = new Uint8Array(grid.data.buffer, grid.data.byteOffset, grid.data.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const imageMetrics = (grid) => {
    const clear = payload.clear.slice(0, 3).map((value) => Math.round(value * 255));
    let nonBackgroundPixelCount = 0;
    let minimumLuminance = 255;
    let maximumLuminance = 0;
    let luminanceSum = 0;
    for (let index = 0; index < grid.data.length; index += 4) {
      const red = grid.data[index];
      const green = grid.data[index + 1];
      const blue = grid.data[index + 2];
      const distance =
        Math.abs(red - clear[0]) + Math.abs(green - clear[1]) + Math.abs(blue - clear[2]);
      if (distance <= 12) continue;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      nonBackgroundPixelCount += 1;
      luminanceSum += luminance;
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);
    }
    return {
      nonBackgroundPixelCount,
      minimumLuminance,
      maximumLuminance,
      luminanceRange: maximumLuminance - minimumLuminance,
      meanLuminance: nonBackgroundPixelCount ? luminanceSum / nonBackgroundPixelCount : 0,
    };
  };

  const drawGrid = (canvas, grid) => {
    canvas.width = grid.width;
    canvas.height = grid.height;
    canvas.getContext('2d').putImageData(
      new ImageData(new Uint8ClampedArray(grid.data), grid.width, grid.height),
      0,
      0
    );
  };

  async function boot() {
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('navigator.gpu.requestAdapter returned null');
    const device = await adapter.requestDevice();
    const info = adapter.info || {};
    state.gpu = {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      vendor: info.vendor || '',
      architecture: info.architecture || '',
      device: info.device || '',
      description: info.description || '',
      verifiedDeviceMethods: [
        'createShaderModule',
        'createRenderPipeline',
        'createTexture',
        'createBuffer',
        'createCommandEncoder',
      ].filter((name) => typeof device[name] === 'function'),
    };
    for (const resident of payload.residents) {
      const grid = await runtime.renderCharacter(device, hydrateSpec(resident.spec), {
        size: payload.renderSize,
        viewProj: new Float32Array(resident.viewProj),
        lightDir: payload.light,
        cameraPos: payload.camera,
        clear: payload.clear,
        heightScale: resident.heightScale,
      });
      const metrics = imageMetrics(grid);
      if (metrics.nonBackgroundPixelCount < 5000) {
        throw new Error(resident.displayLabel + ' portrait coverage is too small');
      }
      if (metrics.luminanceRange < 35) {
        throw new Error(resident.displayLabel + ' material response is too flat');
      }
      drawGrid(
        document.querySelector('[data-resident="' + resident.displayLabel + '"]'),
        grid
      );
      const metricsNode = document.querySelector(
        '[data-metrics="' + resident.displayLabel + '"]'
      );
      metricsNode.textContent =
        Math.round(metrics.luminanceRange) + ' luma range · ' +
        metrics.nonBackgroundPixelCount.toLocaleString() + ' portrait pixels';
      state.residents.push({
        displayLabel: resident.displayLabel,
        pixelSha256: await gridSha256(grid),
        renderSize: grid.width,
        metrics,
        secondaryJointWeightsConsumed: true,
      });
    }
    state.status = 'pass';
    state.ready = true;
    document.body.dataset.ready = 'true';
    document.querySelector('[data-status]').textContent =
      'Native Chrome WebGPU portrait witness complete';
    device.destroy?.();
  }

  boot().catch((error) => {
    state.status = 'error';
    state.ready = true;
    state.errors.push(error.stack || error.message);
    document.body.dataset.ready = 'error';
    document.querySelector('[data-status]').textContent = error.message;
    console.error(error);
  });
})();
`;
}

function residentCards() {
  return EXPECTED_RESIDENTS.map(
    (name, index) => `
      <article class="resident resident-${index + 1}">
        <canvas data-resident="${name}" width="${RENDER_SIZE}" height="${RENDER_SIZE}"></canvas>
        <div class="copy">
          <span>0${index + 1} · symbolic model-family resident</span>
          <h2>${name}</h2>
          <p>V6 deltoid volume · source-authored pose</p>
          <small data-metrics="${name}">Awaiting GPU material readback</small>
        </div>
      </article>`
  ).join('');
}

function buildHtml(payload, browserBundle) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stormglass H3V Portrait Anatomy</title>
<style>
  :root { color-scheme:dark; --ink:#f3f5ef; --muted:#97aaa6; --line:#28413f; }
  * { box-sizing:border-box; }
  body { margin:0; width:1400px; height:900px; overflow:hidden; color:var(--ink);
    background:
      radial-gradient(circle at 14% 4%,rgba(64,154,137,.20),transparent 34%),
      radial-gradient(circle at 87% 18%,rgba(80,92,167,.18),transparent 31%),
      linear-gradient(145deg,#02070d 0%,#07151a 52%,#03080e 100%);
    font-family:Inter,Segoe UI,sans-serif; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.22;
    background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
    background-size:46px 46px; }
  .shell { width:1400px; height:900px; padding:34px 48px 28px; position:relative; }
  header { display:grid; grid-template-columns:1fr 470px; align-items:end; gap:50px;
    border-bottom:1px solid var(--line); padding-bottom:18px; }
  .kicker { color:#78dcc8; text-transform:uppercase; letter-spacing:.22em;
    font:600 11px/1.2 ui-monospace,monospace; }
  h1 { margin:8px 0 0; font:500 47px/1.02 Georgia,serif; letter-spacing:-.035em; }
  .lede { color:var(--muted); font-size:14px; line-height:1.55; margin:0; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px; }
  .resident { height:295px; position:relative; display:grid; grid-template-columns:330px 1fr;
    background:linear-gradient(135deg,rgba(14,30,35,.95),rgba(5,14,20,.9));
    border:1px solid var(--line); border-radius:18px; overflow:hidden;
    box-shadow:0 24px 70px rgba(0,0,0,.22); }
  .resident canvas { width:330px; height:295px; object-fit:cover;
    background:radial-gradient(circle at 50% 30%,#18333a,#030912 72%); }
  .resident-1 { --accent:#62d9c0; }.resident-2 { --accent:#e3a16f; }
  .resident-3 { --accent:#829bff; }.resident-4 { --accent:#65d8e7; }
  .resident::after { content:""; position:absolute; inset:0; pointer-events:none;
    box-shadow:inset 4px 0 0 var(--accent); opacity:.9; }
  .copy { padding:72px 20px 16px; }
  .copy span { color:var(--accent); text-transform:uppercase; letter-spacing:.12em;
    font:600 8px/1.3 ui-monospace,monospace; }
  .copy h2 { margin:10px 0 7px; font:500 32px/1 Georgia,serif; }
  .copy p { color:#c4ceca; font-size:11px; margin:0 0 14px; }
  .copy small { display:block; color:var(--muted); font:9px/1.4 ui-monospace,monospace; }
  footer { margin-top:15px; display:flex; justify-content:space-between; align-items:center;
    color:var(--muted); font:11px/1.4 ui-monospace,monospace; }
  [data-status] { color:#9de3d4; }
</style>
</head>
<body>
<main class="shell">
  <header>
    <div>
      <div class="kicker">HoloScript H3V · native portrait anatomy</div>
      <h1>Agents with weight<br>behind the silhouette.</h1>
    </div>
    <p class="lede">Four source-authored residents, rendered through the HoloScript
      character compiler and browser WebGPU path. Six-ring deltoid transitions hold
      volume as the arms lower; bounded cheek, chin, and temple controls make each
      face read as a person rather than a recolored template.</p>
  </header>
  <section class="grid">${residentCards()}</section>
  <footer>
    <span data-status>Acquiring browser GPU…</span>
    <span>Fixed-light skin · secondary joint weights · no RTX timing claim</span>
  </footer>
</main>
<script>window.__H3V_PAYLOAD__=${safeInlineJson(payload)};</script>
<script>${browserBundle}</script>
<script>${browserApplication()}</script>
</body>
</html>`;
}

function candidateBrowsers(explicitPath) {
  if (explicitPath) return [explicitPath];
  const local = process.env.LOCALAPPDATA || '';
  const program = process.env.PROGRAMFILES || '';
  const programX86 = process.env['PROGRAMFILES(X86)'] || '';
  return [
    path.join(program, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(program, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'chrome.exe',
    'msedge.exe',
  ].filter(Boolean);
}

function resolveBrowser(explicitPath) {
  for (const candidate of candidateBrowsers(explicitPath)) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [candidate], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }
  throw new Error('No Chrome or Edge executable was found');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForDebuggerTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find(
        (candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl
      );
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for Chrome CDP: ${lastError?.message || 'none'}`);
}

function waitForEvent(client, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const cleanup = client.onEvent((message) => {
      if (message.method === method) {
        clearTimeout(timeout);
        cleanup();
        resolve(message.params || {});
      }
    });
  });
}

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const handlers = new Set();
  let nextId = 1;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out opening CDP socket')), 10_000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('CDP socket error'));
      },
      { once: true }
    );
  });
  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result || {});
      return;
    }
    for (const handler of handlers) handler(message);
  });
  return {
    send(method, params = {}, timeoutMs = 30_000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        pending.set(id, { method, resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    onEvent(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    },
  };
}

async function evaluate(client, expression, timeoutMs = 30_000) {
  const result = await client.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    timeoutMs
  );
  if (result.exceptionDetails) {
    const description =
      result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(`Browser evaluation failed: ${description}`);
  }
  return result.result?.value;
}

async function waitForReady(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await evaluate(client, 'window.__H3V__?.ready === true', 5_000).catch(
      () => false
    );
    if (ready) return;
    await delay(250);
  }
  throw new Error('Timed out waiting for the H3V browser witness');
}

async function runBrowserWitness({ browserPath, html, outputDir }) {
  mkdirSync(outputDir, { recursive: true });
  const loopbackRequests = [];
  const server = createServer((request, response) => {
    loopbackRequests.push(request.url || '/');
    if (request.url === '/' || request.url?.startsWith('/index.html')) {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(html);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'loopback server did not bind');
  const profileDir = path.join(os.tmpdir(), `hololand-h3v-${process.pid}-${Date.now()}`);
  mkdirSync(profileDir, { recursive: true });
  const debuggerPort = 21_000 + Math.floor(Math.random() * 20_000);
  const launchFlags = [
    '--headless=new',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--enable-unsafe-webgpu',
    `--remote-debugging-port=${debuggerPort}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1400,900',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-features=Translate,MediaRouter',
    'about:blank',
  ];
  const browser = spawn(browserPath, launchFlags, {
    stdio: 'ignore',
    windowsHide: true,
  });
  let client;
  const exceptions = [];
  const requestedUrls = [];
  try {
    const target = await waitForDebuggerTarget(debuggerPort, 25_000);
    client = await createCdpClient(target.webSocketDebuggerUrl);
    client.onEvent((message) => {
      if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push({
          text: message.params.exceptionDetails?.text || '',
          description: message.params.exceptionDetails?.exception?.description || '',
        });
      }
      if (message.method === 'Network.requestWillBeSent') {
        requestedUrls.push(message.params.request?.url || '');
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Network.enable');
    const version = await client.send('Browser.getVersion');
    const loaded = waitForEvent(client, 'Page.loadEventFired', 60_000);
    await client.send('Page.navigate', {
      url: `http://127.0.0.1:${address.port}/index.html`,
    });
    await loaded;
    await waitForReady(client, 180_000);
    const state = await evaluate(client, 'JSON.parse(JSON.stringify(window.__H3V__))', 60_000);
    assert(state.status === 'pass', `browser witness failed: ${state.errors?.join('\n')}`);
    assert(state.gpu?.navigatorGpu === true, 'navigator.gpu was not observed');
    assert(state.gpu?.adapterAcquired === true, 'browser adapter was not acquired');
    assert(state.gpu?.deviceCreated === true, 'browser device was not created');
    assert(state.residents.length === 4, 'four browser residents were not witnessed');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1400,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1400,
      screenHeight: 900,
    });
    await delay(100);
    const screenshot = await client.send(
      'Page.captureScreenshot',
      {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
        clip: { x: 0, y: 0, width: 1400, height: 900, scale: 1 },
      },
      60_000
    );
    const png = Buffer.from(screenshot.data, 'base64');
    const screenshotPath = path.join(outputDir, 'h3v-portrait-anatomy.png');
    writeFileSync(screenshotPath, png);
    const externalUrls = requestedUrls.filter(
      (url) =>
        url &&
        !url.startsWith('http://127.0.0.1:') &&
        !url.startsWith('data:') &&
        url !== 'about:blank'
    );
    assert(externalUrls.length === 0, `browser made external requests: ${externalUrls.join(', ')}`);
    assert(exceptions.length === 0, `browser exceptions: ${JSON.stringify(exceptions)}`);
    return {
      state,
      screenshot: {
        path: screenshotPath,
        width: 1400,
        height: 900,
        bytes: png.length,
        sha256: sha256(png),
        png,
      },
      browser: {
        executable: browserPath,
        product: version.product || '',
        userAgent: version.userAgent || '',
        jsVersion: version.jsVersion || '',
        launchFlags,
      },
      network: {
        loopbackRequestCount: loopbackRequests.length,
        observedRequestCount: requestedUrls.length,
        externalRequestCount: externalUrls.length,
      },
      exceptions,
    };
  } finally {
    client?.close();
    if (process.platform === 'win32' && browser.pid) {
      spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 15_000,
      });
    } else {
      browser.kill();
    }
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      browser.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    server.close();
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // Disposable browser-profile locks do not replace the render result.
    }
  }
}

function readNvidiaSmi() {
  const command = [
    '--query-gpu=name,driver_version,memory.total',
    '--format=csv,noheader,nounits',
  ];
  const result = spawnSync('nvidia-smi', command, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
  });
  return {
    command: `nvidia-smi ${command.join(' ')}`,
    status: result.status === 0 ? 'pass' : 'unavailable',
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function manifestBindings() {
  return [
    [SOURCE_REL, /sourceSha256:\s*"([0-9a-f]{64})"/u],
    [POLICY_REL, /policySha256:\s*"([0-9a-f]{64})"/u],
    [SEED_REL, /seedSha256:\s*"([0-9a-f]{64})"/u],
    [CHECKER_REL, /checkerSha256:\s*"([0-9a-f]{64})"/u],
    [TEST_REL, /testSha256:\s*"([0-9a-f]{64})"/u],
    [REPORT_REL, /reportSha256:\s*"([0-9a-f]{64})"/u],
    [HERO_REL, /heroSha256:\s*"([0-9a-f]{64})"/u],
    [EVIDENCE_REL, /evidenceSha256:\s*"([0-9a-f]{64})"/u],
  ];
}

function validateManifest(root) {
  const filePath = path.join(root, MANIFEST_REL);
  if (!existsSync(filePath)) return { status: 'missing', errors: ['manifest missing'] };
  const text = readFileSync(filePath, 'utf8');
  const errors = [];
  for (const [relativePath, pattern] of manifestBindings()) {
    const match = text.match(pattern);
    if (!match) {
      errors.push(`${relativePath} hash binding missing`);
      continue;
    }
    const absolute = path.join(root, relativePath);
    if (!existsSync(absolute)) errors.push(`${relativePath} missing`);
    else if (sha256PortableFile(absolute) !== match[1]) {
      errors.push(`${relativePath} hash drifted`);
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

export async function runCharacterAppearanceH3V(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const stack = await parseH3VStack(root, holoScriptRoot, outputDir);
  try {
    const validation = validateH3VContract(stack, root, holoScriptRoot);
    assert(validation.status === 'pass', validation.errors.join('\n'));
    const { payload, compilerRecords } = await buildCompiledPayload(
      stack,
      validation.plan,
      holoScriptRoot,
      outputDir
    );
    const browserBundle = await bundleBrowserRuntime(stack, holoScriptRoot);
    const html = buildHtml(payload, browserBundle);
    const browserWitness = await runBrowserWitness({
      browserPath: resolveBrowser(options.browser),
      html,
      outputDir,
    });
    const receipt = {
      schema: 'hololand.model-village.character-appearance-h3v-witness.v1',
      capturedAt: new Date().toISOString(),
      status: 'pass',
      milestone: 'MV_CHARACTER_APPEARANCE_H3V_PORTRAIT_ANATOMY',
      sourceAdmission: {
        holoScriptCommit: gitHead(holoScriptRoot),
        sourceSha256: sha256PortableFile(path.join(root, SOURCE_REL)),
        policySha256: sha256PortableFile(path.join(root, POLICY_REL)),
        seedSha256: sha256PortableFile(path.join(root, SEED_REL)),
        residentNames: EXPECTED_RESIDENTS,
      },
      compilerAdmission: {
        target: 'character-webgpu',
        residentCount: compilerRecords.length,
        repeatedCompileByteIdentity: true,
        secondaryJointWeightsSerialized: true,
        records: compilerRecords,
      },
      browserWebgpuAdmission: {
        runtime: {
          renderer: 'HoloScript CharacterRender.renderCharacter',
          backend: 'browser_native_webgpu',
          browserUsed: true,
          threeJsUsed: false,
          r3fUsed: false,
        },
        browser: browserWitness.browser,
        gpu: browserWitness.state.gpu,
        residents: browserWitness.state.residents,
        network: browserWitness.network,
        screenshot: {
          width: browserWitness.screenshot.width,
          height: browserWitness.screenshot.height,
          bytes: browserWitness.screenshot.bytes,
          sha256: browserWitness.screenshot.sha256,
        },
      },
      hostHardwareReadback: readNvidiaSmi(),
      boundaries: {
        browserWebgpuMeasured: true,
        browserAdapterAndDeviceMeasured: true,
        sourcePoseApplied: true,
        portraitShoulderVolumeReceipted: true,
        portraitFaceSilhouetteReceipted: true,
        fixedLightMaterialResponseRendered: true,
        gpuTimestampMeasured: false,
        freshRtxBenchmarkClaimed: false,
        questHeadsetMeasured: false,
        browserWebxrMeasured: false,
        physicallyCalibratedCameraClaimed: false,
        photorealismClaimed: false,
        fullWorldPerformanceClaimed: false,
      },
    };
    receipt.integrity = {
      canonicalSha256: sha256(canonicalJson(receipt)),
    };
    if (options.writeArtifacts) {
      writeFileSync(path.join(root, HERO_REL), browserWitness.screenshot.png);
      writeFileSync(path.join(root, EVIDENCE_REL), `${JSON.stringify(receipt, null, 2)}\n`);
    }
    if (!options.skipManifest) {
      const manifest = validateManifest(root);
      assert(manifest.status === 'pass', manifest.errors.join('\n'));
    }
    return {
      receipt,
      screenshotPath: browserWitness.screenshot.path,
      browserHtmlSha256: sha256(html),
    };
  } finally {
    stack.esbuild.stop?.();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCharacterAppearanceH3V(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H3V portrait anatomy: ${receipt.compilerAdmission.residentCount} residents; ` +
            `${receipt.browserWebgpuAdmission.residents.length} browser witnesses; ` +
            `GPU timestamp=${receipt.boundaries.gpuTimestampMeasured}; ` +
            `RTX benchmark=${receipt.boundaries.freshRtxBenchmarkClaimed}`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
