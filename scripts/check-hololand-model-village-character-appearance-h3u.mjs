#!/usr/bin/env node
/* global WebSocket */

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseH3TStack } from './check-hololand-model-village-character-appearance-h3t.mjs';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H3U',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h3u-temporal-convergence'],
});
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3u-browser-quest-temporal-lod.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3u-browser-quest-temporal-lod-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3u-browser-quest-temporal-lod-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3u-browser-quest-temporal-lod-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3u.mjs';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h3u.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3u-browser-quest-temporal-lod-2026-07-29.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3u-browser-quest-temporal-lod-2026-07-29.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-appearance-h3u-browser-quest-temporal-lod-2026-07-29.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3u';
const EXPECTED_COMMIT = '0c1a5313d0ed207744bf115ee3697a74e59046d2';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const RENDER_SIZE = 256;
const CLEAR = [0.008, 0.031, 0.067, 1];
const LIGHT = [0.72, 0.28, 0.63];
const CAMERA = [0, 1.05, 6];
const HASH_BINDINGS = [
  ['inheritedH3TSource', 'inheritedH3TSourceSha256', 'hololand'],
  ['upstreamTemporalPath', 'upstreamTemporalSha256', 'holoscript'],
  ['upstreamRendererPath', 'upstreamRendererSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
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
    else if (arg === '--holoscript-root') {
      options.holoScriptRoot = path.resolve(argv[++index]);
    } else if (arg === '--browser') options.browser = argv[++index];
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

export async function parseH3UStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
  outputDir = path.join(root, OUTPUT_REL)
) {
  const stack = await parseH3TStack(root, holoScriptRoot, outputDir);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const manifestPath = path.join(root, MANIFEST_REL);
  const manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  const source = new stack.toolchain.HoloCompositionParser().parse(sourceText);
  const policy = new stack.toolchain.HoloScriptPlusParser().parse(policyText);
  const seed = new stack.toolchain.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3U .holo', source],
    ['H3U .hsplus', policy],
    ['H3U .hs', seed],
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
    throw new Error(`H3U manifest parse failed: ${JSON.stringify(manifest.errors)}`);
  }
  const objects = (source.ast.objects || []).map((object) => {
    const objectProperties = properties(object);
    const body = trait(object, 'body')?.config || {};
    const lod = trait(object, 'lod')?.config || {};
    return {
      objectId: object.name,
      ...objectProperties,
      height: body.height,
      lod,
    };
  });
  return {
    ...stack,
    h3uSource: source,
    h3uPolicy: policy,
    h3uSeed: seed,
    h3uManifest: manifest,
    h3uSourceText: sourceText,
    h3uPolicyText: policyText,
    h3uSeedText: seedText,
    h3uManifestText: manifestText,
    h3uContract: {
      metadata: source.ast.metadata,
      state: properties(source.ast.state),
      objects,
    },
  };
}

export function validateH3UContract(
  stack,
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT
) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state, objects } = stack.h3uContract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3U_BROWSER_QUEST_TEMPORAL_LOD',
    'milestone drifted'
  );
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'commit pin drifted');
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  for (const [pathKey, hashKey, owner] of HASH_BINDINGS) {
    const base = owner === 'holoscript' ? holoScriptRoot : root;
    const absolute = path.join(base, metadata[pathKey] || '');
    expect(existsSync(absolute), `${pathKey} does not exist`);
    if (existsSync(absolute)) {
      const observed =
        owner === 'holoscript' ? sha256File(absolute) : sha256PortableFile(absolute);
      expect(observed === metadata[hashKey], `${hashKey} drifted`);
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
    ['browserRendererEntrypoint', 'renderCharacter'],
    ['browserTemporalEntrypoint', 'resolveTemporalFrameGPU'],
    ['browserRendererBackend', 'webgpu'],
    ['browserWebgpuMeasured', true],
    ['browserAdapterRequired', true],
    ['browserDeviceRequired', true],
    ['browserProfile', 'browser-balanced'],
    ['browserSampleCount', 8],
    ['questBudgetProfile', 'quest-90hz-budget'],
    ['questBudgetSampleCount', 4],
    ['questProfileExecutedOnBrowserDevice', true],
    ['questHeadsetMeasured', false],
    ['questWebxrMeasured', false],
    ['lodSelectionMode', 'distance'],
    ['lodTransitionMode', 'dither'],
    ['lodTransitionDurationMilliseconds', 180],
    ['lodHysteresisBand', 0.65],
    ['historyInvalidationPolicy', 'invalidate-on-camera-resident-or-lod-change-v1'],
    ['cameraMotionInvalidationRequired', true],
    ['residentMotionInvalidationRequired', true],
    ['lodChangeInvalidationRequired', true],
    ['neighborhoodClampingRequired', true],
    ['motionVectorsConsumed', false],
    ['reactiveMaskConsumed', false],
    ['disocclusionInputConsumed', false],
    ['gpuTimestampFrameTimeClaimed', false],
    ['freshRtxBenchmarkClaimed', false],
    ['callbackCadenceCountsAsGpuTime', false],
    ['endToEndDisplayLatencyClaimed', false],
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
    JSON.stringify(state.authoredLodLevels) === JSON.stringify([0, 1, 2]),
    'authored LOD levels drifted'
  );
  expect(
    JSON.stringify(state.witnessedLodLevels) === JSON.stringify([0, 2]),
    'witnessed LOD levels drifted'
  );
  expect(objects.length === 4, 'exactly four residents are required');
  for (const [index, object] of (stack.h3uSource.ast.objects || []).entries()) {
    const values = properties(object);
    const body = trait(object, 'body')?.config;
    const face = trait(object, 'face')?.config;
    const skin = trait(object, 'subsurface_scattering')?.config;
    const lod = trait(object, 'lod')?.config;
    expect(values.displayLabel === EXPECTED_RESIDENTS[index], `resident ${index} label drifted`);
    expect(
      body?.upper_body_profile === 'coherent_hand_surface_v5',
      `${values.displayLabel} hand profile drifted`
    );
    expect(
      face?.topology === 'neutral_anatomical_v2' &&
        face?.facial_detail_profile === 'civic_landmarks_v1',
      `${values.displayLabel} face profile drifted`
    );
    expect(
      skin?.surface_response_profile === 'calibrated_skin_surface_v1',
      `${values.displayLabel} skin profile drifted`
    );
    expect(
      lod?.mode === 'distance' &&
        lod?.fade_mode === 'dither' &&
        lod?.fade_duration_ms === 180 &&
        lod?.hysteresis === 0.65 &&
        Array.isArray(lod?.levels) &&
        lod.levels.length === 3,
      `${values.displayLabel} LOD contract drifted`
    );
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    plan: objects,
  };
}

function typedArray(value) {
  return Array.from(value);
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
      uvs: typedArray(spec.mesh.uvs),
    },
    jointMatrices: typedArray(spec.jointMatrices),
    modelMatrix: typedArray(spec.modelMatrix),
    materialGroups: spec.materialGroups,
  };
}

function wgslRawPlugin() {
  return {
    name: 'h3u-wgsl-raw',
    setup(build) {
      build.onResolve({ filter: /\.wgsl\?raw$/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
        namespace: 'h3u-wgsl-raw',
      }));
      build.onLoad({ filter: /.*/, namespace: 'h3u-wgsl-raw' }, (args) => ({
        contents: readFileSync(args.path, 'utf8'),
        loader: 'text',
      }));
    },
  };
}

async function buildNodeHostRuntime(stack, holoScriptRoot, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const outfile = path.join(outputDir, 'h3u-host-runtime.mjs');
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
      sourcefile: 'h3u-host-runtime.entry.ts',
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
          framingMatrix,
          renderCharacter,
        } from './packages/engine/src/character-render/character-render.ts';
        import {
          jitterProjectionMatrix,
          resolveTemporalFrameGPU,
          TemporalConvergenceController,
          TEMPORAL_CONVERGENCE_PROFILES,
        } from './packages/engine/src/rendering/webgpu/TemporalConvergence.ts';
        window.__H3U_RUNTIME__ = {
          framingMatrix,
          renderCharacter,
          jitterProjectionMatrix,
          resolveTemporalFrameGPU,
          TemporalConvergenceController,
          TEMPORAL_CONVERGENCE_PROFILES,
        };
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h3u-browser-runtime.entry.ts',
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
    const lods = {};
    const record = {
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      modelFamilyId: resident.modelFamilyId,
      lods: [],
    };
    for (const lodLevel of [0, 2]) {
      const compile = () =>
        new stack.toolchain.CharacterWebGPUCompiler({
          objectId: resident.objectId,
          entityId: `model-village-h3u-${resident.modelFamilyId}-lod${lodLevel}`,
          lodLevel,
        }).compile(stack.h3uSource.ast);
      const first = await compile();
      const second = await compile();
      assert(first === second, `${resident.displayLabel} LOD${lodLevel} compile drifted`);
      const bundle = JSON.parse(first);
      assert(bundle.format === 'character-webgpu/drawspec', 'compiler output format drifted');
      assert(bundle.report?.stubbed?.length === 0, `${resident.displayLabel} compiler stubbed`);
      assert(
        bundle.lod?.transition?.selectionMode === 'distance' &&
          bundle.lod?.transition?.mode === 'dither' &&
          bundle.lod?.transition?.durationSeconds === 0.18 &&
          bundle.lod?.transition?.hysteresisBand === 0.65,
        `${resident.displayLabel} LOD transition receipt drifted`
      );
      const built = hostRuntime.buildCharacterHostFromComposition(stack.h3uSource.ast, {
        objectId: resident.objectId,
        entityId: `model-village-h3u-${resident.modelFamilyId}-lod${lodLevel}-host`,
        lodLevel,
      });
      assert(
        built.ok && built.host && built.report?.stubbed?.length === 0,
        `${resident.displayLabel} LOD${lodLevel} host bridge failed`
      );
      built.host.applyWorldState({
        position: { x: 0, y: 0, z: 0 },
        rotationY: -0.12,
      });
      const spec = built.host.getDrawSpec();
      assert(
        built.facialLandmarks?.vertexRange,
        `${resident.displayLabel} LOD${lodLevel} facial frame is missing`
      );
      const frame = hostRuntime.deriveCharacterDetailFrame(
        spec.mesh,
        [built.facialLandmarks.vertexRange],
        { padding: 3.05, minHalfExtent: 0.12 }
      );
      lods[lodLevel] = {
        spec: serializeSpec(spec),
        viewProj: typedArray(frame.matrix),
        frame: {
          schemaVersion: frame.schemaVersion,
          center: frame.center,
          halfExtent: frame.halfExtent,
          selectedVertexCount: frame.selectedVertexCount,
        },
      };
      record.lods.push({
        lodLevel,
        outputSha256: sha256(first),
        byteLength: Buffer.byteLength(first),
        repeatedCompileByteIdentity: true,
        vertexCount: spec.mesh.vertexCount,
        indexCount: spec.mesh.indices.length,
        materialGroupCount: spec.materialGroups.length,
        lodTransition: canonical(bundle.lod.transition),
      });
    }
    const l0 = record.lods.find((item) => item.lodLevel === 0);
    const l2 = record.lods.find((item) => item.lodLevel === 2);
    assert(l2.vertexCount < l0.vertexCount, `${resident.displayLabel} LOD2 did not reduce vertices`);
    record.vertexReductionRatio = 1 - l2.vertexCount / l0.vertexCount;
    residents.push({
      objectId: resident.objectId,
      displayLabel: resident.displayLabel,
      modelFamilyId: resident.modelFamilyId,
      accentColor: resident.accentColor,
      heightScale: resident.height / 1.82,
      lods,
    });
    compilerRecords.push(record);
  }
  return {
    payload: {
      schema: 'hololand.model-village.character-appearance-h3u-browser-payload.v1',
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
  const payload = window.__H3U_PAYLOAD__;
  const runtime = window.__H3U_RUNTIME__;
  const state = {
    schema: 'hololand.model-village.character-appearance-h3u-browser-state.v1',
    ready: false,
    status: 'booting',
    gpu: null,
    residents: [],
    boundaries: {
      questHeadsetMeasured: false,
      questWebxrMeasured: false,
      gpuTimestampMeasured: false,
      freshRtxBenchmarkClaimed: false,
      motionVectorsConsumed: false,
      reactiveMaskConsumed: false,
      disocclusionInputConsumed: false,
    },
    errors: [],
  };
  window.__H3U__ = state;

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
      uvs: new Float32Array(value.mesh.uvs),
    },
    jointMatrices: new Float32Array(value.jointMatrices),
    modelMatrix: new Float32Array(value.modelMatrix),
    materialGroups: value.materialGroups,
  });

  const cloneSpecWithOffset = (source, offset) => {
    const modelMatrix = new Float32Array(source.modelMatrix);
    modelMatrix[12] += offset;
    return { ...source, modelMatrix };
  };

  const changedPixels = (left, right) => {
    let changedPixelCount = 0;
    let absoluteChannelDiff = 0;
    let maximumPixelDelta = 0;
    for (let index = 0; index < left.data.length; index += 4) {
      const delta =
        Math.abs(left.data[index] - right.data[index]) +
        Math.abs(left.data[index + 1] - right.data[index + 1]) +
        Math.abs(left.data[index + 2] - right.data[index + 2]);
      if (delta > 0) changedPixelCount += 1;
      absoluteChannelDiff += delta;
      maximumPixelDelta = Math.max(maximumPixelDelta, delta);
    }
    return { changedPixelCount, absoluteChannelDiff, maximumPixelDelta };
  };

  const gridSha256 = async (grid) => {
    const digest = await crypto.subtle.digest('SHA-256', grid.data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const renderInput = async (device, spec, baseViewProj, heightScale, plan, cameraOffset) => {
    const matrix = new Float32Array(baseViewProj);
    matrix[12] += cameraOffset;
    const viewProj = runtime.jitterProjectionMatrix(
      matrix,
      plan.jitterPixels,
      payload.renderSize,
      payload.renderSize
    );
    return runtime.renderCharacter(device, spec, {
      size: payload.renderSize,
      viewProj,
      lightDir: payload.light,
      cameraPos: payload.camera,
      clear: payload.clear,
      heightScale,
    });
  };

  const runStage = async ({
    device,
    controller,
    signals,
    spec,
    baseViewProj,
    heightScale,
    cameraOffset,
    sampleCount,
    previous,
    precomputedInputs,
  }) => {
    const startedAt = performance.now();
    let history = null;
    let firstCurrent = null;
    let firstResolved = null;
    let finalCurrent = null;
    let finalResolved = null;
    let firstPlan = null;
    let finalPlan = null;
    const jitterSequence = [];
    const resolveReceipts = [];
    for (let frame = 0; frame < sampleCount; frame += 1) {
      const plan = controller.beginFrame(signals);
      const current = precomputedInputs
        ? precomputedInputs[frame % precomputedInputs.length]
        : await renderInput(device, spec, baseViewProj, heightScale, plan, cameraOffset);
      const resolved = await runtime.resolveTemporalFrameGPU(device, current, history, {
        feedback: plan.feedback,
        historyValid: plan.historyValid,
      });
      if (frame === 0) {
        firstCurrent = current;
        firstResolved = resolved.pixels;
        firstPlan = plan;
      }
      finalCurrent = current;
      finalResolved = resolved.pixels;
      finalPlan = plan;
      history = resolved.pixels;
      jitterSequence.push(plan.jitterPixels);
      resolveReceipts.push(resolved.receipt);
    }
    const historyDiscard = changedPixels(firstCurrent, firstResolved);
    if (historyDiscard.changedPixelCount !== 0) {
      throw new Error('invalidated temporal history changed the first resolved frame');
    }
    if (!finalPlan.converged) throw new Error('stable temporal window did not converge');
    const transitionDelta = previous ? changedPixels(previous, firstCurrent) : null;
    if (previous && transitionDelta.changedPixelCount <= 0) {
      throw new Error(signals.cameraStateId + '/' + signals.residentStateId + ' produced no pixels');
    }
    return {
      internal: { finalCurrent, finalResolved },
      receipt: {
        invalidated: firstPlan.invalidated,
        invalidationReason: firstPlan.invalidationReason,
        historyGeneration: firstPlan.historyGeneration,
        historyDiscardPixelDelta: historyDiscard.changedPixelCount,
        transitionDelta,
        sampleCount,
        jitterSequence,
        converged: finalPlan.converged,
        finalStableFrameCount: finalPlan.stableFrameCount,
        finalPixelSha256: await gridSha256(finalResolved),
        resolveReceiptCount: resolveReceipts.length,
        resolveSchema: resolveReceipts[0].schemaVersion,
        deviceExecutionMeasured: resolveReceipts.every((item) => item.deviceExecutionMeasured),
        neighborhoodClamping: resolveReceipts.every((item) => item.neighborhoodClamping),
        gpuTimestampMeasured: resolveReceipts.some((item) => item.gpuTimestampMeasured),
        browserObservedWallClockMilliseconds: performance.now() - startedAt,
        timingClassification:
          'browser_wall_clock_includes_render_resolve_submission_and_readback_not_gpu_timestamp_not_frame_time',
      },
    };
  };

  const drawGrid = (canvas, grid) => {
    canvas.width = grid.width;
    canvas.height = grid.height;
    const context = canvas.getContext('2d');
    context.putImageData(
      new ImageData(new Uint8ClampedArray(grid.data), grid.width, grid.height),
      0,
      0
    );
  };

  async function runProfile(device, resident, profile, inputStages) {
    const config = runtime.TEMPORAL_CONVERGENCE_PROFILES[profile];
    const controller = runtime.TemporalConvergenceController.fromProfile(profile);
    const stages = [];
    let previous = null;
    for (const input of inputStages) {
      const stage = await runStage({
        device,
        controller,
        signals: input.signals,
        spec: input.spec,
        baseViewProj: input.baseViewProj,
        heightScale: resident.heightScale,
        cameraOffset: input.cameraOffset,
        sampleCount: config.sampleCount,
        previous,
        precomputedInputs: input.precomputedInputs || null,
      });
      stages.push(stage);
      previous = stage.internal.finalResolved;
    }
    return { controller, stages, config };
  }

  async function boot() {
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    const adapterStartedAt = performance.now();
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
      adapterAndDeviceWallClockMilliseconds: performance.now() - adapterStartedAt,
      verifiedDeviceMethods: [
        'createShaderModule',
        'createRenderPipeline',
        'createComputePipeline',
        'createTexture',
        'createBuffer',
        'createCommandEncoder',
      ].filter((name) => typeof device[name] === 'function'),
    };

    for (const residentValue of payload.residents) {
      const resident = {
        ...residentValue,
        lods: {
          0: {
            spec: hydrateSpec(residentValue.lods[0].spec),
            viewProj: new Float32Array(residentValue.lods[0].viewProj),
          },
          2: {
            spec: hydrateSpec(residentValue.lods[2].spec),
            viewProj: new Float32Array(residentValue.lods[2].viewProj),
          },
        },
      };
      const idle = resident.lods[0].spec;
      const moved = cloneSpecWithOffset(resident.lods[0].spec, 0.05);
      const movedLod2 = cloneSpecWithOffset(resident.lods[2].spec, 0.05);
      const inputs = [
        {
          name: 'initial',
          signals: { cameraStateId: 'camera-a', residentStateId: 'idle', lodLevel: 0 },
          spec: idle,
          baseViewProj: resident.lods[0].viewProj,
          cameraOffset: 0,
        },
        {
          name: 'camera-motion',
          signals: { cameraStateId: 'camera-b', residentStateId: 'idle', lodLevel: 0 },
          spec: idle,
          baseViewProj: resident.lods[0].viewProj,
          cameraOffset: 0.035,
        },
        {
          name: 'resident-motion',
          signals: { cameraStateId: 'camera-b', residentStateId: 'step-a', lodLevel: 0 },
          spec: moved,
          baseViewProj: resident.lods[0].viewProj,
          cameraOffset: 0.035,
        },
        {
          name: 'lod-change',
          signals: { cameraStateId: 'camera-b', residentStateId: 'step-a', lodLevel: 2 },
          spec: movedLod2,
          baseViewProj: resident.lods[2].viewProj,
          cameraOffset: 0.035,
        },
      ];
      const browserProfile = await runProfile(device, resident, 'browser-balanced', inputs);
      const questInputs = inputs.map((input, index) => ({
        ...input,
        precomputedInputs: [browserProfile.stages[index].internal.finalCurrent],
      }));
      const questProfile = await runProfile(
        device,
        resident,
        'quest-90hz-budget',
        questInputs
      );
      const browserStages = browserProfile.stages.map((stage, index) => ({
        name: inputs[index].name,
        ...stage.receipt,
      }));
      const questStages = questProfile.stages.map((stage, index) => ({
        name: inputs[index].name,
        ...stage.receipt,
      }));
      const expectedReasons = ['initial', 'camera-motion', 'resident-motion', 'lod-change'];
      for (const [index, expected] of expectedReasons.entries()) {
        if (browserStages[index].invalidationReason !== expected) {
          throw new Error(resident.displayLabel + ' browser invalidation drifted: ' + expected);
        }
        if (questStages[index].invalidationReason !== expected) {
          throw new Error(resident.displayLabel + ' Quest budget invalidation drifted: ' + expected);
        }
      }
      const browserReceipt = browserProfile.controller.getReceipt();
      const questReceipt = questProfile.controller.getReceipt();
      if (
        browserReceipt.motionVectorsConsumed ||
        browserReceipt.reactiveMaskConsumed ||
        browserReceipt.disocclusionInputConsumed ||
        questReceipt.motionVectorsConsumed ||
        questReceipt.reactiveMaskConsumed ||
        questReceipt.disocclusionInputConsumed
      ) {
        throw new Error('unsupported temporal input was claimed');
      }
      drawGrid(
        document.querySelector('[data-resident="' + resident.displayLabel + '"]'),
        browserProfile.stages[0].internal.finalResolved
      );
      state.residents.push({
        displayLabel: resident.displayLabel,
        browserProfile: {
          profile: 'browser-balanced',
          config: browserProfile.config,
          controller: browserReceipt,
          stages: browserStages,
        },
        questBudgetProfile: {
          profile: 'quest-90hz-budget',
          executedOn: 'same_browser_gpu_device_not_quest_headset',
          config: questProfile.config,
          controller: questReceipt,
          stages: questStages,
        },
      });
    }
    state.status = 'pass';
    state.ready = true;
    document.body.dataset.ready = 'true';
    document.querySelector('[data-status]').textContent =
      'Chrome WebGPU witnessed · camera, resident, and LOD history resets admitted';
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
        <div class="index">0${index + 1}</div>
        <canvas data-resident="${name}" width="${RENDER_SIZE}" height="${RENDER_SIZE}"></canvas>
        <div class="copy">
          <span>symbolic model-family resident</span>
          <h2>${name}</h2>
          <p>LOD 0 hero · 8-sample stable window</p>
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
<title>Stormglass H3U Temporal LOD</title>
<style>
  :root { color-scheme: dark; --ink:#eef5f2; --muted:#9aaca9; --line:#29403e; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; overflow:hidden; color:var(--ink);
    background:
      radial-gradient(circle at 18% 6%, rgba(69,154,139,.17), transparent 34%),
      radial-gradient(circle at 85% 22%, rgba(66,92,154,.16), transparent 30%),
      linear-gradient(145deg,#02070d 0%,#07131a 52%,#03080e 100%);
    font-family:Inter,Segoe UI,sans-serif; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.25;
    background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);
    background-size:42px 42px; }
  .shell { width:1400px; height:900px; padding:44px 56px 36px; position:relative; }
  header { display:grid; grid-template-columns:1fr 420px; align-items:end; gap:48px;
    border-bottom:1px solid var(--line); padding-bottom:22px; }
  .kicker { color:#78dcc8; text-transform:uppercase; letter-spacing:.22em; font:600 12px/1.2 monospace; }
  h1 { margin:10px 0 0; font:500 54px/1.02 Georgia,serif; letter-spacing:-.035em; }
  .lede { color:var(--muted); font-size:15px; line-height:1.55; margin:0; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:24px; }
  .resident { height:278px; position:relative; display:grid; grid-template-columns:278px 1fr;
    background:linear-gradient(135deg,rgba(14,29,35,.94),rgba(5,14,20,.88));
    border:1px solid var(--line); border-radius:18px; overflow:hidden;
    box-shadow:0 24px 70px rgba(0,0,0,.22); }
  .resident canvas { width:278px; height:278px; image-rendering:auto;
    background:radial-gradient(circle at 50% 30%,#18333a,#030912 70%); }
  .resident-1 { --accent:#62d9c0; }.resident-2 { --accent:#e3a16f; }
  .resident-3 { --accent:#829bff; }.resident-4 { --accent:#65d8e7; }
  .resident::after { content:""; position:absolute; inset:0; pointer-events:none;
    box-shadow:inset 4px 0 0 var(--accent); opacity:.85; }
  .copy { padding:82px 24px 20px; }
  .copy span { color:var(--accent); text-transform:uppercase; letter-spacing:.14em;
    font:600 9px/1.3 monospace; }
  .copy h2 { margin:10px 0 8px; font:500 35px/1 Georgia,serif; }
  .copy p { color:var(--muted); font-size:12px; margin:0; }
  .index { position:absolute; right:18px; top:14px; color:rgba(255,255,255,.12);
    font:500 35px/1 monospace; }
  footer { margin-top:20px; display:flex; justify-content:space-between; align-items:center;
    color:var(--muted); font:12px/1.4 monospace; }
  [data-status] { color:#9de3d4; }
  .boundary { text-align:right; }
</style>
</head>
<body>
<main class="shell">
  <header>
    <div>
      <div class="kicker">HoloScript H3U · native browser WebGPU</div>
      <h1>Motion that knows when<br>to let go of history.</h1>
    </div>
    <p class="lede">Four source-authored residents. Deterministic LOD 0→2 geometry.
      Explicit camera, resident, and LOD invalidation. Neighborhood-clamped temporal
      resolve on the browser GPU—with the Quest budget kept honest as a profile, not a headset claim.</p>
  </header>
  <section class="grid">${residentCards()}</section>
  <footer>
    <span data-status>Acquiring browser GPU…</span>
    <span class="boundary">No motion vectors · no GPU timestamp · no Quest device claim</span>
  </footer>
</main>
<script>window.__H3U_PAYLOAD__=${safeInlineJson(payload)};</script>
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
    const ready = await evaluate(client, 'window.__H3U__?.ready === true', 5_000).catch(
      () => false
    );
    if (ready) return;
    await delay(250);
  }
  throw new Error('Timed out waiting for the H3U browser witness');
}

async function runBrowserWitness({ browserPath, html, outputDir }) {
  mkdirSync(outputDir, { recursive: true });
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url || '/');
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
  const profileDir = path.join(
    os.tmpdir(),
    `hololand-h3u-${process.pid}-${Date.now()}`
  );
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
  const consoleMessages = [];
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
      if (message.method === 'Runtime.consoleAPICalled') {
        consoleMessages.push({
          type: message.params.type,
          text: (message.params.args || [])
            .map((value) => value.value ?? value.description ?? '')
            .join(' '),
        });
      }
    });
    await client.send('Runtime.enable');
    await client.send('Page.enable');
    const version = await client.send('Browser.getVersion');
    const loaded = waitForEvent(client, 'Page.loadEventFired', 60_000);
    await client.send('Page.navigate', {
      url: `http://127.0.0.1:${address.port}/index.html`,
    });
    await loaded;
    await waitForReady(client, 360_000);
    const state = await evaluate(client, 'JSON.parse(JSON.stringify(window.__H3U__))', 60_000);
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
    const screenshotPath = path.join(outputDir, 'h3u-browser-temporal-lod.png');
    writeFileSync(screenshotPath, png);
    const externalRequests = requests.filter(
      (request) => !request.startsWith('/') && !request.startsWith('http://127.0.0.1:')
    );
    assert(externalRequests.length === 0, 'browser witness made an external request');
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
        loopbackRequestCount: requests.length,
        externalRequestCount: externalRequests.length,
      },
      consoleMessages,
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
      // The profile is disposable run debris. A Windows lock must not replace
      // the browser witness result; later OS temp maintenance may remove it.
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

export async function runCharacterAppearanceH3U(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const stack = await parseH3UStack(root, holoScriptRoot, outputDir);
  try {
    const validation = validateH3UContract(stack, root, holoScriptRoot);
    assert(validation.status === 'pass', validation.errors.join('\n'));
    mkdirSync(outputDir, { recursive: true });
    const { payload, compilerRecords } = await buildCompiledPayload(
      stack,
      validation.plan,
      holoScriptRoot,
      outputDir
    );
    const browserBundle = await bundleBrowserRuntime(stack, holoScriptRoot);
    const html = buildHtml(payload, browserBundle);
    const browserPath = resolveBrowser(options.browser);
    const browserWitness = await runBrowserWitness({
      browserPath,
      html,
      outputDir,
    });
    const receipt = {
      schema: 'hololand.model-village.character-appearance-h3u-witness.v1',
      capturedAt: new Date().toISOString(),
      status: 'pass',
      milestone: 'MV_CHARACTER_APPEARANCE_H3U_BROWSER_QUEST_TEMPORAL_LOD',
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
        witnessedLodLevels: [0, 2],
        repeatedCompileByteIdentity: true,
        records: compilerRecords,
      },
      browserWebgpuAdmission: {
        runtime: {
          renderer: 'HoloScript CharacterRender.renderCharacter',
          temporalResolve: 'HoloScript TemporalConvergence.resolveTemporalFrameGPU',
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
        questBudgetProfileExecutedOnBrowserDevice: true,
        questHeadsetMeasured: false,
        questWebxrMeasured: false,
        gpuTimestampMeasured: false,
        freshRtxBenchmarkClaimed: false,
        browserObservedWallClockIsGpuTime: false,
        frameTimeClaimed: false,
        endToEndDisplayLatencyClaimed: false,
        motionVectorsConsumed: false,
        reactiveMaskConsumed: false,
        disocclusionInputConsumed: false,
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
  runCharacterAppearanceH3U(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H3U browser temporal LOD: ${receipt.compilerAdmission.residentCount} residents; ` +
            `${receipt.browserWebgpuAdmission.residents.length} browser witnesses; ` +
            `GPU timestamp=${receipt.boundaries.gpuTimestampMeasured}; ` +
            `Quest headset=${receipt.boundaries.questHeadsetMeasured}`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
