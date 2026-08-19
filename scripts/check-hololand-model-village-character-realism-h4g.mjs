#!/usr/bin/env node

// H4G proves one shared HoloScript WebGPU character world frame. Four resident
// color, motion/depth, and temporal graphs plus one 2x2 composite are encoded
// into one command buffer and submitted once. GPU timestamps cover all stages;
// CPU motion derivation/uploads, history copies, query mapping, evidence
// readback, HTML composition, and screenshot capture are outside the scope.

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { deriveH4AHarnessSource } from './check-hololand-model-village-character-appearance-h4a.mjs';
import { deriveH3YHarnessSource } from './check-hololand-model-village-character-appearance-h3y.mjs';
import { deriveH3ZHarnessSource } from './check-hololand-model-village-character-appearance-h3z.mjs';
import { deriveH4BHarnessSource } from './check-hololand-model-village-character-realism-h4b.mjs';
import { deriveH4CHarnessSource } from './check-hololand-model-village-character-realism-h4c.mjs';
import { deriveH4DHarnessSource } from './check-hololand-model-village-character-realism-h4d.mjs';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H4G',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h4g-shared-world-frame'],
});
const BASE_CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4g-shared-character-world-frame.holo';
const POLICY_REL =
  'source/proofs/model-village-character-realism-h4g-shared-character-world-frame-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-realism-h4g-shared-character-world-frame-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4g-shared-character-world-frame-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-realism-h4g.mjs';
const TEST_REL = 'scripts/__tests__/hololand-model-village-character-realism-h4g.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-realism-h4g-shared-character-world-frame-2026-08-01.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-realism-h4g-shared-character-world-frame-2026-08-01.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-realism-h4g-shared-character-world-frame-2026-08-01.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-realism-h4g';
const EXPECTED_COMMIT = '7a09fa27ba78694ad0751eabf9befea08aa973e3';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const FRAME_OFFSETS_SECONDS = [0, 0.84];
const WIDTH = 512;
const HEIGHT = 512;
const VIEWPORT_WIDTH = 1400;
const VIEWPORT_HEIGHT = 900;
const WARMUP_SHARED_FRAMES = 4;
const MEASURED_SHARED_FRAMES = 32;
const TOTAL_MEASURED_SAMPLES = MEASURED_SHARED_FRAMES;
const HASH_BINDINGS = [
  [
    'packages/engine/src/rendering/webgpu/CharacterWorldFrameGraph.ts',
    'fb2d81013309c36950da29ef685aeea954f0b79397392ba0e05595e67622a4f9',
  ],
  [
    'packages/engine/src/rendering/webgpu/CharacterTemporalFrameGraph.ts',
    '860101d4692b4763a3b60840d0d271c2b7df6120788821ee2d988f3b9ec679e3',
  ],
  [
    'packages/engine/src/character-render/CharacterTextureRenderer.ts',
    'b3d3d7046420fcbf892e9f5179bff29e5fc369e46b5a5c6636bd5adcdab2a73c',
  ],
  [
    'packages/engine/src/character-render/CharacterMotionTextureRasterizer.ts',
    '67813392d1365c875cd8a1bc6811cc69592802b8dc2b799d102621e0d98ff354',
  ],
];
const DURABLE_FILES = [
  SOURCE_REL,
  POLICY_REL,
  SEED_REL,
  CHECKER_REL,
  TEST_REL,
  REPORT_REL,
  HERO_REL,
  EVIDENCE_REL,
];

// The HEAD-equality assertion this replaced demanded one exact commit; eighteen gates
// demanded eighteen different ones, so the set could never be satisfied at once. See
// scripts/lib/model-village-upstream-commit-pin.mjs for the full reasoning.
function upstreamPinFailures(holoScriptRoot) {
  return validateUpstreamCommitPin(
    holoScriptRoot,
    EXPECTED_COMMIT,
    HASH_BINDINGS.map(([relative, sha256]) => ({ pathKey: relative, relative, sha256 })),
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

function portableSha256(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.holo', '.hsplus', '.hs', '.mjs', '.md', '.json'].includes(extension)) {
    return sha256(readFileSync(filePath, 'utf8').replaceAll('\r\n', '\n'));
  }
  return sha256File(filePath);
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

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function gitHead(root) {
  const require = createRequire(import.meta.url);
  const { execFileSync } = require('node:child_process');
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function validatePins(holoScriptRoot) {
  const errors = [];
  errors.push(...upstreamPinFailures(holoScriptRoot));
  for (const [relativePath, expected] of HASH_BINDINGS) {
    const absolute = path.join(holoScriptRoot, relativePath);
    if (!existsSync(absolute)) errors.push(`${relativePath} is missing`);
    else if (sha256File(absolute) !== expected) errors.push(`${relativePath} hash drifted`);
  }
  return errors;
}

function parseContracts(root, holoScriptRoot) {
  const require = createRequire(path.join(holoScriptRoot, 'package.json'));
  const core = require('@holoscript/core');
  const rows = [
    [
      'H4G .holo',
      new core.HoloCompositionParser().parse(readFileSync(path.join(root, SOURCE_REL), 'utf8')),
    ],
    [
      'H4G .hsplus',
      new core.HoloScriptPlusParser().parse(readFileSync(path.join(root, POLICY_REL), 'utf8')),
    ],
    [
      'H4G .hs',
      new core.HoloScriptCodeParser().parse(readFileSync(path.join(root, SEED_REL), 'utf8')),
    ],
  ];
  for (const [label, result] of rows) {
    assert(
      result.success && result.errors.length === 0,
      `${label} parse failed: ${result.errors.join('; ')}`
    );
  }
  return {
    holoObjectCount: rows[0][1].ast.objects?.length || 0,
    hsplusObjectCount: rows[1][1].ast.objects?.length || 0,
    hsObjectCount: rows[2][1].ast.objects?.length || 0,
  };
}

async function materializeCompiledFrame({ root, holoScriptRoot, outputDir, timeOffsetSeconds }) {
  const base = readFileSync(path.join(root, BASE_CHECKER_REL), 'utf8');
  const h4c = deriveH4CHarnessSource(
    deriveH4BHarnessSource(
      deriveH4AHarnessSource(deriveH3ZHarnessSource(deriveH3YHarnessSource(base)))
    ),
    timeOffsetSeconds
  );
  const source = deriveH4DHarnessSource(h4c);
  mkdirSync(outputDir, { recursive: true });
  const generatedPath = path.join(
    outputDir,
    `h4g-derived-payload-${String(timeOffsetSeconds).replace('.', '-')}.mjs`
  );
  writeFileSync(generatedPath, source);
  const harness = await import(`${pathToFileURL(generatedPath).href}?sha=${sha256(source)}`);
  const stack = await harness.parseH4AStack(root, holoScriptRoot, outputDir);
  try {
    const plan = stack.h4aContract?.objects || [];
    assert(plan.length === 4, 'H4G requires four source resident plans');
    const compiled = await harness.buildCompiledPayload(stack, plan, holoScriptRoot, outputDir);
    return { payload: compiled.payload, compilerRecords: compiled.compilerRecords };
  } finally {
    stack.esbuild.stop?.();
  }
}

function wgslRawPlugin() {
  return {
    name: 'h4g-wgsl-raw',
    setup(build) {
      build.onResolve({ filter: /\.wgsl/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
        namespace: 'h4g-wgsl-raw',
      }));
      build.onLoad({ filter: /.*/, namespace: 'h4g-wgsl-raw' }, (args) => ({
        contents: readFileSync(args.path, 'utf8'),
        loader: 'text',
      }));
    },
  };
}

async function bundleBrowserRuntime(holoScriptRoot) {
  const require = createRequire(path.join(holoScriptRoot, 'package.json'));
  const esbuildModule = await import(pathToFileURL(require.resolve('esbuild')).href);
  const esbuild = esbuildModule.default || esbuildModule;
  const result = await esbuild.build({
    stdin: {
      contents: `
        import { CharacterWorldFrameGraph } from './packages/engine/src/rendering/webgpu/CharacterWorldFrameGraph.ts';
        window.__H4G_RUNTIME__ = { CharacterWorldFrameGraph };
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h4g-browser-runtime.entry.ts',
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
  assert(result.outputFiles?.length === 1, 'H4G browser runtime bundle was not emitted');
  esbuild.stop?.();
  return result.outputFiles[0].text;
}

export function computeTimingStatistics(values) {
  assert(Array.isArray(values) && values.length > 0, 'timing values are required');
  assert(
    values.every((value) => Number.isFinite(value) && value > 0),
    'timings must be positive'
  );
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.ceil(fraction * sorted.length) - 1];
  const middle = Math.floor(sorted.length / 2);
  return {
    unit: 'nanoseconds',
    sampleCount: sorted.length,
    minimum: sorted[0],
    median: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95: percentile(0.95),
    maximum: sorted.at(-1),
  };
}

function validateSharedFrame(frame, label, { evidence = false } = {}) {
  const errors = [];
  if (
    frame?.residentCount !== 4 ||
    frame?.tileWidth !== WIDTH ||
    frame?.tileHeight !== HEIGHT ||
    frame?.outputWidth !== WIDTH * 2 ||
    frame?.outputHeight !== HEIGHT * 2 ||
    frame?.layout !== 'two-by-two'
  ) {
    errors.push(`${label}: resident, resolution, or layout contract drifted`);
  }
  if (frame?.fixedTopology !== true || frame?.persistentGpuResources !== true) {
    errors.push(`${label}: persistent fixed-topology resources missing`);
  }
  if (
    frame?.residentReceiptsShareCommandBuffer !== true ||
    frame?.composite?.inputTextureCount !== 4 ||
    frame?.composite?.zeroCopyResidentTextureInputs !== true ||
    frame?.composite?.persistentPipeline !== true ||
    frame?.composite?.persistentBindGroup !== true ||
    frame?.composite?.persistentOutputTexture !== true
  ) {
    errors.push(`${label}: shared zero-copy composite contract failed`);
  }
  if (
    frame?.intermediateFrameReadbackCount !== 0 ||
    frame?.evidenceFrameReadbackCount !== (evidence ? 1 : 0)
  ) {
    errors.push(`${label}: measured pixel readback detected`);
  }
  if (frame?.commandBufferCount !== 1 || frame?.queueSubmissionCount !== 1) {
    errors.push(`${label}: shared command/submission count drifted`);
  }
  if (
    frame?.gpuTimestampMeasured !== true ||
    frame?.timedScope !== 'four-character-color-motion-depth-temporal-through-composite-gpu-scope'
  ) {
    errors.push(`${label}: GPU timestamp scope missing`);
  }
  if (!(frame?.durations?.compositeNanoseconds > 0))
    errors.push(`${label}: compositeNanoseconds duration missing`);
  if (!(frame?.durations?.aggregateNanoseconds > 0))
    errors.push(`${label}: aggregateNanoseconds duration missing`);
  if (frame?.durations?.residents?.length !== 4 || frame?.residents?.length !== 4) {
    errors.push(`${label}: resident timing or receipt count drifted`);
  }
  for (const [index, resident] of (frame?.durations?.residents || []).entries()) {
    if (resident.id !== EXPECTED_RESIDENTS[index])
      errors.push(`${label}: resident ${index} timing id drifted`);
    for (const stage of [
      'characterColorNanoseconds',
      'motionDepthNanoseconds',
      'temporalResolveNanoseconds',
      'aggregateNanoseconds',
    ]) {
      if (!(resident[stage] > 0)) errors.push(`${label}: resident ${index} ${stage} missing`);
    }
  }
  for (const [index, resident] of (frame?.residents || []).entries()) {
    const temporal = resident.temporalFrame;
    if (resident.id !== EXPECTED_RESIDENTS[index])
      errors.push(`${label}: resident ${index} receipt id drifted`);
    if (
      temporal?.historyConsumed !== true ||
      temporal?.intermediateFrameReadbackCount !== 0 ||
      temporal?.evidenceFrameReadbackCount !== 0 ||
      temporal?.timestampMetadataReadbackCount !== 0
    ) {
      errors.push(`${label}: resident ${index} shared history/readback contract failed`);
    }
    if (!(temporal?.motionDerivation?.movingVertexCount > 0)) {
      errors.push(`${label}: resident ${index} motion missing`);
    }
    if (
      temporal?.resolve?.motionVectorsConsumed !== true ||
      temporal?.resolve?.disocclusionInputConsumed !== true
    ) {
      errors.push(`${label}: resident ${index} temporal motion/depth inputs were not consumed`);
    }
  }
  return errors;
}

export function validateH4GBrowserState(state) {
  const errors = [];
  if (
    state?.status !== 'pass' ||
    state?.gpu?.navigatorGpu !== true ||
    state?.gpu?.adapterAcquired !== true ||
    state?.gpu?.deviceCreated !== true ||
    state?.gpu?.timestampQuerySupported !== true ||
    state?.gpu?.timestampQueryEnabled !== true
  )
    errors.push('timestamp-capable browser WebGPU device admission failed');
  if (state?.residents?.length !== EXPECTED_RESIDENTS.length) errors.push('resident count drifted');
  if (
    canonicalJson((state?.residents || []).map((resident) => resident.displayLabel)) !==
    canonicalJson(EXPECTED_RESIDENTS)
  ) {
    errors.push('resident names or order drifted');
  }
  const measured = state?.measuredFrames || [];
  if (measured.length !== TOTAL_MEASURED_SAMPLES)
    errors.push(`expected ${TOTAL_MEASURED_SAMPLES} measured samples`);
  for (const [index, frame] of measured.entries())
    errors.push(...validateSharedFrame(frame, `measured sample ${index}`));
  if (state?.warmupFrameCount !== WARMUP_SHARED_FRAMES) errors.push('warmup count drifted');
  if (state?.finalEvidence) {
    errors.push(...validateSharedFrame(state.finalEvidence, 'final evidence', { evidence: true }));
  } else {
    errors.push('final evidence receipt missing');
  }
  if (!/^[a-f0-9]{64}$/.test(state?.outputDigest || '')) errors.push('output digest missing');
  for (const [stage, statistics] of Object.entries(state?.stageTimingStatistics || {})) {
    if (statistics?.sampleCount !== TOTAL_MEASURED_SAMPLES || !(statistics.p95 > 0)) {
      errors.push(`${stage}: timing statistics failed admission`);
    }
  }
  for (const residentName of EXPECTED_RESIDENTS) {
    const residentStatistics = state?.residentStageTimingStatistics?.[residentName];
    for (const stage of [
      'characterColorNanoseconds',
      'motionDepthNanoseconds',
      'temporalResolveNanoseconds',
      'aggregateNanoseconds',
    ]) {
      const statistics = residentStatistics?.[stage];
      if (statistics?.sampleCount !== TOTAL_MEASURED_SAMPLES || !(statistics.p95 > 0)) {
        errors.push(`${residentName}.${stage}: timing statistics failed admission`);
      }
    }
  }
  if (
    state?.boundaries?.boundedSharedCharacterCompositeRtxBenchmarkClaimed !== true ||
    state?.boundaries?.fullHoloLandWorldFrameClaimed !== false ||
    state?.boundaries?.productionWholeFrameTimeClaimed !== false ||
    state?.boundaries?.wallClockUsedAsGpuTime !== false ||
    state?.boundaries?.questHeadsetMeasured !== false ||
    state?.boundaries?.photorealismClaimed !== false
  )
    errors.push('benchmark boundary drifted');
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function safeInlineJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function browserApplication() {
  return String.raw`
(() => {
  const runtime = window.__H4G_RUNTIME__;
  const payload = window.__H4G_PAYLOAD__;
  const config = window.__H4G_CONFIG__;
  const state = {
    schema: 'hololand.model-village.character-realism-h4g-browser-state.v1',
    ready: false,
    status: 'booting',
    gpu: null,
    residents: [],
    warmupFrameCount: 0,
    measuredFrames: [],
    finalEvidence: null,
    outputDigest: null,
    stageTimingStatistics: null,
    residentStageTimingStatistics: null,
    combinedResidentStageTimingStatistics: null,
    boundaries: {
      boundedSharedCharacterCompositeRtxBenchmarkClaimed: true,
      fullHoloLandWorldFrameClaimed: false,
      productionWholeFrameTimeClaimed: false,
      wallClockUsedAsGpuTime: false,
      questHeadsetMeasured: false,
      photorealismClaimed: false,
    },
    errors: [],
  };
  window.__H4G__ = state;

  const hydrateSpec = (value, entityId) => ({
    entityId,
    jointCount: value.jointCount,
    mesh: {
      vertexCount: value.mesh.vertexCount,
      positions: new Float32Array(value.mesh.positions),
      normals: new Float32Array(value.mesh.normals),
      tangents: new Float32Array(value.mesh.tangents),
      indices: new Uint32Array(value.mesh.indices),
      jointIndices: new Uint32Array(value.mesh.jointIndices),
      jointWeights: new Float32Array(value.mesh.jointWeights),
      secondaryJointIndices: value.mesh.secondaryJointIndices ? new Uint32Array(value.mesh.secondaryJointIndices) : undefined,
      secondaryJointWeights: value.mesh.secondaryJointWeights ? new Float32Array(value.mesh.secondaryJointWeights) : undefined,
      uvs: new Float32Array(value.mesh.uvs),
    },
    jointMatrices: new Float32Array(value.jointMatrices),
    modelMatrix: new Float32Array(value.modelMatrix),
    materialGroups: value.materialGroups,
  });

  const stats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (fraction) => sorted[Math.ceil(fraction * sorted.length) - 1];
    const middle = Math.floor(sorted.length / 2);
    return {
      unit: 'nanoseconds',
      sampleCount: sorted.length,
      minimum: sorted[0],
      median: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      p95: percentile(0.95),
      maximum: sorted[sorted.length - 1],
    };
  };

  const digestPixels = async (pixels) => {
    const bytes = new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  };

  const drawCompositeTiles = (pixels) => {
    const tileWidth = config.width;
    const tileHeight = config.height;
    for (let index = 0; index < config.residentNames.length; index += 1) {
      const name = config.residentNames[index];
      const tileX = (index % 2) * tileWidth;
      const tileY = Math.floor(index / 2) * tileHeight;
      const data = new Uint8ClampedArray(tileWidth * tileHeight * 4);
      for (let row = 0; row < tileHeight; row += 1) {
        const sourceOffset = ((tileY + row) * pixels.width + tileX) * 4;
        data.set(
          pixels.data.subarray(sourceOffset, sourceOffset + tileWidth * 4),
          row * tileWidth * 4
        );
      }
      const canvas = document.querySelector('[data-resident="' + name + '"] canvas');
      canvas.width = tileWidth;
      canvas.height = tileHeight;
      canvas.getContext('2d').putImageData(new ImageData(data, tileWidth, tileHeight), 0, 0);
    }
  };

  const renderOptions = (frame, resident) => ({
    cameraPos: frame.camera,
    clear: frame.clear,
    heightScale: resident.heightScale,
    environmentLight: resident.environmentLight,
  });

  const JITTER = [
    [0, -1 / 6],
    [-1 / 4, 1 / 6],
    [1 / 4, -7 / 18],
    [-3 / 8, -1 / 18],
    [1 / 8, 5 / 18],
    [-1 / 8, -5 / 18],
    [3 / 8, 1 / 18],
    [-7 / 16, 7 / 18],
  ];

  const jittered = (matrix, sampleIndex) => {
    const value = new Float32Array(matrix);
    const jitter = JITTER[((sampleIndex % JITTER.length) + JITTER.length) % JITTER.length];
    value[12] += (jitter[0] * 2) / config.width;
    value[13] += (jitter[1] * 2) / config.height;
    return value;
  };

  async function boot() {
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('navigator.gpu.requestAdapter returned null');
    if (!adapter.features.has('timestamp-query')) throw new Error('timestamp-query is unavailable');
    const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query'] });
    const info = adapter.info || {};
    state.gpu = {
      navigatorGpu: true,
      adapterAcquired: true,
      deviceCreated: true,
      vendor: info.vendor || '',
      architecture: info.architecture || '',
      device: info.device || '',
      description: info.description || '',
      adapterFeatures: Array.from(adapter.features || []).sort(),
      deviceFeatures: Array.from(device.features || []).sort(),
      timestampQuerySupported: adapter.features.has('timestamp-query'),
      timestampQueryEnabled: device.features.has('timestamp-query'),
    };

    const residentSources = [];
    for (let residentIndex = 0; residentIndex < config.residentNames.length; residentIndex += 1) {
      const name = config.residentNames[residentIndex];
      const sourceResidents = [payload.previous.residents[residentIndex], payload.current.residents[residentIndex]];
      if (sourceResidents.some((resident) => resident.displayLabel !== name)) throw new Error('source resident order drifted');
      const specs = sourceResidents.map((resident) => hydrateSpec(resident.spec, 'h4g-' + name));
      const viewProjections = sourceResidents.map((resident) => new Float32Array(resident.viewProj));
      residentSources.push({ name, sourceResidents, specs, viewProjections });
      state.residents.push({ displayLabel: name });
    }

    const graph = new runtime.CharacterWorldFrameGraph(
      device,
      residentSources.map((resident) => ({ id: resident.name, initialSpec: resident.specs[0] })),
      {
        tileWidth: config.width,
        tileHeight: config.height,
        enableGpuTimestamps: true,
        label: 'h4g-shared-character-world-frame',
      }
    );
    const sharedStageSamples = { compositeNanoseconds: [], aggregateNanoseconds: [] };
    const residentStageSamples = Object.fromEntries(
      config.residentNames.map((name) => [
        name,
        {
          characterColorNanoseconds: [],
          motionDepthNanoseconds: [],
          temporalResolveNanoseconds: [],
          aggregateNanoseconds: [],
        },
      ])
    );
    const inputFor = (sequence) => {
      const currentIndex = (sequence + 1) % 2;
      const previousIndex = sequence % 2;
      const frames = [payload.previous, payload.current];
      return residentSources.map((resident) => ({
        id: resident.name,
        input: {
          currentSpec: resident.specs[currentIndex],
          previousSpec: resident.specs[previousIndex],
          currentViewProjection: jittered(resident.viewProjections[currentIndex], sequence + 1),
          previousViewProjection: jittered(resident.viewProjections[previousIndex], sequence),
          renderOptions: renderOptions(frames[currentIndex], resident.sourceResidents[currentIndex]),
          feedback: 0.75,
          historyValid: sequence > 0,
        },
      }));
    };

    let sequence = 0;
    for (let warmup = 0; warmup < config.warmupSharedFrames; warmup += 1) {
      await graph.execute({ residents: inputFor(sequence), capturePixels: false });
      state.warmupFrameCount += 1;
      sequence += 1;
    }
    for (let sample = 0; sample < config.measuredSharedFrames; sample += 1) {
      const result = await graph.execute({ residents: inputFor(sequence), capturePixels: false });
      state.measuredFrames.push(result.receipt);
      sharedStageSamples.compositeNanoseconds.push(result.receipt.durations.compositeNanoseconds);
      sharedStageSamples.aggregateNanoseconds.push(result.receipt.durations.aggregateNanoseconds);
      for (const resident of result.receipt.durations.residents) {
        for (const stage of Object.keys(residentStageSamples[resident.id])) {
          residentStageSamples[resident.id][stage].push(resident[stage]);
        }
      }
      sequence += 1;
    }
    const final = await graph.execute({ residents: inputFor(sequence), capturePixels: true });
    if (!final.pixels) throw new Error('shared final evidence pixels missing');
    state.finalEvidence = final.receipt;
    state.outputDigest = await digestPixels(final.pixels);
    drawCompositeTiles(final.pixels);
    graph.destroy();

    state.stageTimingStatistics = Object.fromEntries(
      Object.entries(sharedStageSamples).map(([stage, values]) => [stage, stats(values)])
    );
    state.residentStageTimingStatistics = Object.fromEntries(
      Object.entries(residentStageSamples).map(([name, stages]) => [
        name,
        Object.fromEntries(Object.entries(stages).map(([stage, values]) => [stage, stats(values)])),
      ])
    );
    state.combinedResidentStageTimingStatistics = Object.fromEntries(
      ['characterColorNanoseconds', 'motionDepthNanoseconds', 'temporalResolveNanoseconds', 'aggregateNanoseconds'].map((stage) => [
        stage,
        stats(config.residentNames.flatMap((name) => residentStageSamples[name][stage])),
      ])
    );
    const aggregate = state.stageTimingStatistics.aggregateNanoseconds;
    document.querySelector('[data-status]').textContent = 'RTX TIMESTAMPS VERIFIED';
    document.querySelector('[data-median]').textContent = (aggregate.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-p95]').textContent = (aggregate.p95 / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-color]').textContent = (state.combinedResidentStageTimingStatistics.characterColorNanoseconds.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-motion]').textContent = (state.combinedResidentStageTimingStatistics.motionDepthNanoseconds.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-resolve]').textContent = (state.combinedResidentStageTimingStatistics.temporalResolveNanoseconds.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-composite]').textContent = (state.stageTimingStatistics.compositeNanoseconds.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-adapter]').textContent = [state.gpu.vendor, state.gpu.architecture, state.gpu.device].filter(Boolean).join(' / ') || 'high-performance WebGPU adapter';
    state.status = 'pass';
  }

  boot().catch((error) => {
    state.status = 'fail';
    state.errors.push(error.stack || error.message || String(error));
  }).finally(() => { state.ready = true; });
})();`;
}

function buildHtml(payload, config, browserBundle) {
  const accents = ['#7dd3fc', '#f59e7a', '#a7f3d0', '#fcd34d'];
  const cards = EXPECTED_RESIDENTS.map(
    (name, index) => `
    <article class="resident" data-resident="${name}" style="--accent:${accents[index]}">
      <canvas aria-label="${name} HoloScript resident"></canvas>
      <div class="resident-label"><span>0${index + 1}</span><strong>${name}</strong><small>SHARED WORLD TILE</small></div>
    </article>`
  ).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#050b12;color:#f4f3ed;font-family:Inter,Segoe UI,sans-serif}
    body:before{content:"";position:fixed;inset:0;background:radial-gradient(circle at 18% 12%,#17384d99,transparent 36%),radial-gradient(circle at 80% 76%,#4a291f77,transparent 35%),linear-gradient(135deg,#07111c,#020609);z-index:-2}
    body:after{content:"";position:fixed;inset:0;opacity:.12;background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:48px 48px;z-index:-1}
    main{height:100%;padding:34px 38px;display:grid;grid-template-rows:96px 1fr;gap:22px}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #b7c8d333;padding-bottom:18px}
    .eyebrow{font:600 11px/1.2 ui-monospace,monospace;letter-spacing:.25em;color:#9fc5d7}.title{margin:8px 0 0;font:500 40px/1.05 Georgia,serif;letter-spacing:-.025em}.title em{font-weight:400;color:#e4af84}
    .live{margin-top:4px;padding:12px 16px;border:1px solid #7dd3fc66;background:#081922cc;color:#9ee7ff;font:700 11px ui-monospace,monospace;letter-spacing:.16em;box-shadow:0 0 28px #58c8ff20}
    .content{display:grid;grid-template-columns:1fr 370px;gap:24px;min-height:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;min-height:0}
    .resident{position:relative;overflow:hidden;border:1px solid #d8e5ed22;background:linear-gradient(145deg,#0d1b27e8,#050a10e8);box-shadow:0 20px 50px #0008}.resident:after{content:"";position:absolute;inset:0;border-top:2px solid var(--accent);pointer-events:none;box-shadow:inset 0 0 60px #0008}
    canvas{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.92) contrast(1.04)}.resident-label{position:absolute;left:15px;right:15px;bottom:14px;display:grid;grid-template-columns:34px 1fr auto;align-items:end;padding:10px 12px;background:#03080cdd;border-left:2px solid var(--accent);backdrop-filter:blur(8px)}.resident-label span,.resident-label small{font:600 9px ui-monospace,monospace;letter-spacing:.12em;color:#9bb0bc}.resident-label strong{font:500 22px Georgia,serif}.resident-label small{text-align:right;color:var(--accent)}
    aside{border:1px solid #d8e5ed22;background:#071019dd;padding:24px;display:flex;flex-direction:column;min-height:0}.scope-id{font:700 10px ui-monospace,monospace;letter-spacing:.2em;color:#e4af84}.telemetry h2{font:500 27px Georgia,serif;margin:10px 0 6px}.adapter{font:10px/1.5 ui-monospace,monospace;color:#8fa8b7;min-height:30px}.aggregate{margin:24px 0 18px;padding:18px 0;border-top:1px solid #ffffff18;border-bottom:1px solid #ffffff18}.aggregate label,.stage label{display:block;font:600 9px ui-monospace,monospace;letter-spacing:.12em;color:#8fa8b7}.aggregate strong{font:500 41px Georgia,serif;color:#f4d5b7}.aggregate small{display:block;margin-top:4px;color:#8fa8b7}.stages{display:grid;gap:12px}.stage{display:flex;justify-content:space-between;align-items:end;padding-bottom:9px;border-bottom:1px solid #ffffff10}.stage strong{font:600 14px ui-monospace,monospace}.boundary{margin-top:auto;padding-top:20px;color:#91a5b1;font:11px/1.55 ui-monospace,monospace}.boundary b{display:block;color:#d7e6ed;margin-bottom:7px}.samples{color:#e4af84;margin-top:10px}
  </style></head><body><main>
    <header><div><div class="eyebrow">HOLOLAND / STORMGLASS COMMONS / H4G</div><h1 class="title">Four minds. One <em>native world frame.</em></h1></div><div class="live" data-status>REQUESTING RTX TIMESTAMPS</div></header>
    <section class="content"><div class="grid">${cards}</div><aside class="telemetry">
      <div class="scope-id">4 x (COLOR + MOTION / DEPTH + TEMPORAL) -&gt; COMPOSITE</div><h2>Shared-submit telemetry</h2><div class="adapter" data-adapter>Discovering high-performance WebGPU adapter</div>
      <div class="aggregate"><label>SHARED AGGREGATE MEDIAN</label><strong data-median>-</strong><small>p95 <span data-p95>-</span></small></div>
      <div class="stages"><div class="stage"><label>RESIDENT COLOR MEDIAN</label><strong data-color>-</strong></div><div class="stage"><label>RESIDENT MOTION + DEPTH</label><strong data-motion>-</strong></div><div class="stage"><label>RESIDENT TEMPORAL RESOLVE</label><strong data-resolve>-</strong></div><div class="stage"><label>2 x 2 GPU COMPOSITE</label><strong data-composite>-</strong></div></div>
      <div class="boundary"><b>Exact measured scope</b>Twenty-six GPU timestamps cover all four resident graphs through the in-graph 2 x 2 composite inside one command buffer and one queue submission. CPU motion derivation/uploads, history copies, query mapping, final evidence readback, and HTML presentation are excluded.<div class="samples">32 shared samples / 4 residents / 512 x 512 tiles / 1024 x 1024 composite</div>No complete HoloLand world-frame, terrain, atmosphere, UI, Quest, or photorealism claim.</div>
    </aside></section>
  </main><script>window.__H4G_PAYLOAD__=${safeInlineJson(payload)};window.__H4G_CONFIG__=${safeInlineJson(config)};</script><script>${browserBundle}</script><script>${browserApplication()}</script></body></html>`;
}

function resolveBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Chrome or Edge executable was not found');
  return path.resolve(found);
}

async function loadPlaywright(holoScriptRoot) {
  const require = createRequire(path.join(holoScriptRoot, 'package.json'));
  const module = await import(pathToFileURL(require.resolve('playwright')).href);
  return module.default || module;
}

async function runBrowserWitness({ browserPath, html, outputDir, holoScriptRoot }) {
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
    } else if (request.url === '/favicon.ico') {
      response.writeHead(204, { 'cache-control': 'no-store' });
      response.end();
    } else {
      response.writeHead(404);
      response.end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'H4G loopback server did not bind');
  const playwright = await loadPlaywright(holoScriptRoot);
  const launchArgs = [
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--enable-unsafe-webgpu',
    '--enable-dawn-features=allow_unsafe_apis',
    '--disable-background-networking',
    '--disable-features=Translate,MediaRouter',
  ];
  const browser = await playwright.chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: launchArgs,
  });
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  });
  const page = await context.newPage();
  const exceptions = [];
  const requestedUrls = [];
  page.on('pageerror', (error) => exceptions.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') exceptions.push(message.text());
  });
  page.on('request', (request) => requestedUrls.push(request.url()));
  const screenshotPath = path.join(outputDir, 'h4g-shared-character-world-frame.png');
  try {
    await page.goto(`http://127.0.0.1:${address.port}/index.html`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await page.waitForFunction(() => globalThis.__H4G__?.ready === true, null, {
      timeout: 360_000,
    });
    const state = await page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__H4G__)));
    assert(state.status === 'pass', `H4G browser failed: ${state.errors?.join('\n')}`);
    const validation = validateH4GBrowserState(state);
    assert(validation.status === 'pass', validation.errors.join('\n'));
    await page.evaluate(async () => {
      await globalThis.document.fonts.ready;
      await new Promise((resolve) =>
        globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))
      );
    });
    await page.screenshot({ path: screenshotPath, type: 'png' });
    const screenshot = readFileSync(screenshotPath);
    const externalUrls = requestedUrls.filter(
      (url) =>
        url &&
        !url.startsWith('http://127.0.0.1:') &&
        !url.startsWith('data:') &&
        url !== 'about:blank'
    );
    assert(externalUrls.length === 0, `browser made external requests: ${externalUrls.join(', ')}`);
    assert(exceptions.length === 0, `browser exceptions: ${exceptions.join('\n')}`);
    return {
      state,
      screenshot: {
        path: screenshotPath,
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        bytes: screenshot.length,
        sha256: sha256(screenshot),
        png: screenshot,
      },
      browser: {
        executable: browserPath,
        product: `Chrome/${browser.version()}`,
        userAgent: await page.evaluate(() => globalThis.navigator.userAgent),
        launchArgs,
      },
      network: {
        loopbackRequestCount: loopbackRequests.length,
        observedRequestCount: requestedUrls.length,
        externalRequestCount: externalUrls.length,
      },
    };
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function parseManifestEntries(text) {
  const entries = [];
  const pattern =
    /object\s+"[^"]+"\s*\{[\s\S]*?path:\s*"([^"]+)"[\s\S]*?sha256:\s*"([a-f0-9]{64})"[\s\S]*?\}/g;
  let match;
  while ((match = pattern.exec(text))) entries.push({ path: match[1], sha256: match[2] });
  return entries;
}

function validateManifest(root) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) return { status: 'fail', errors: ['H4G manifest is missing'] };
  const entries = parseManifestEntries(readFileSync(manifestPath, 'utf8'));
  const errors = [];
  for (const relativePath of DURABLE_FILES) {
    const entry = entries.find((candidate) => candidate.path === relativePath);
    const absolute = path.join(root, relativePath);
    if (!entry) errors.push(`${relativePath} missing from manifest`);
    else if (!existsSync(absolute)) errors.push(`${relativePath} is missing`);
    else if (portableSha256(absolute) !== entry.sha256) errors.push(`${relativePath} hash drifted`);
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function reportMarkdown(receipt) {
  const shared = receipt.gpuTimestampAdmission.sharedStageTimingStatistics;
  const residents = receipt.gpuTimestampAdmission.residentStageTimingStatistics;
  const ms = (value) => (value / 1e6).toFixed(3);
  const row = (label, stat) =>
    `| ${label} | ${stat.sampleCount} | ${ms(stat.median)} ms | ${ms(stat.p95)} ms | ${ms(stat.minimum)} ms | ${ms(stat.maximum)} ms |`;
  return (
    `# Model Village Character Realism H4G - Shared Character World Frame\n\n` +
    `Status: **PASS**  \nCaptured: ${receipt.capturedAt}  \nHoloScript canon: \`${receipt.sourceAdmission.holoScriptCommit}\`\n\n` +
    `H4G renders the source-compiled OpenAI, Claude, Gemini, and Grok residents through one native HoloScript shared world-frame graph. Four resident color, motion/depth, and temporal paths feed an in-graph 2 x 2 composite before one command-buffer submission, with no intermediate pixel readback.\n\n` +
    `## Shared RTX GPU timestamp results\n\n| Stage | Samples | Median | p95 | Min | Max |\n|---|---:|---:|---:|---:|---:|\n` +
    row('compositeNanoseconds', shared.compositeNanoseconds) +
    '\n' +
    row('aggregateNanoseconds', shared.aggregateNanoseconds) +
    `\n\n## Per-resident RTX GPU timestamp results\n\n| Resident / stage | Samples | Median | p95 | Min | Max |\n|---|---:|---:|---:|---:|---:|\n` +
    EXPECTED_RESIDENTS.flatMap((name) =>
      Object.entries(residents[name]).map(([stage, stat]) => row(`${name} / ${stage}`, stat))
    ).join('\n') +
    `\n\nWorkload: 32 measured shared frames, four 512 x 512 resident tiles, one 1024 x 1024 composite, after four shared warmup frames. Timings are WebGPU timestamp-query deltas, not wall clock.\n\n` +
    `## Exact boundary\n\nThe aggregate scope begins with the first resident character-color pass and ends with the shared composite. CPU motion derivation, CPU-to-GPU uploads, post-timestamp history copies, timestamp mapping, final composite evidence readback, HTML presentation, and screenshot capture are excluded. This is not a complete HoloLand world-frame time, not terrain/atmosphere/UI, not a Quest measurement, and not a photorealism claim.\n`
  );
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: path.join(ROOT, OUTPUT_REL),
    browser: null,
    writeArtifacts: false,
    skipManifest: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export async function runCharacterRealismH4G(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validatePins(holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  const parsedFormats = parseContracts(root, holoScriptRoot);
  const compiled = [];
  for (let index = 0; index < FRAME_OFFSETS_SECONDS.length; index += 1) {
    compiled.push(
      await materializeCompiledFrame({
        root,
        holoScriptRoot,
        outputDir: path.join(outputDir, `frame-${index}`),
        timeOffsetSeconds: FRAME_OFFSETS_SECONDS[index],
      })
    );
  }
  const [previous, current] = compiled;
  const browserBundle = await bundleBrowserRuntime(holoScriptRoot);
  const html = buildHtml(
    { previous: previous.payload, current: current.payload },
    {
      width: WIDTH,
      height: HEIGHT,
      warmupSharedFrames: WARMUP_SHARED_FRAMES,
      measuredSharedFrames: MEASURED_SHARED_FRAMES,
      residentNames: EXPECTED_RESIDENTS,
    },
    browserBundle
  );
  const browserWitness = await runBrowserWitness({
    browserPath: resolveBrowser(options.browser),
    html,
    outputDir,
    holoScriptRoot,
  });
  const validation = validateH4GBrowserState(browserWitness.state);
  assert(validation.status === 'pass', validation.errors.join('\n'));
  const hostSharedStageStatistics = {
    compositeNanoseconds: computeTimingStatistics(
      browserWitness.state.measuredFrames.map((frame) => frame.durations.compositeNanoseconds)
    ),
    aggregateNanoseconds: computeTimingStatistics(
      browserWitness.state.measuredFrames.map((frame) => frame.durations.aggregateNanoseconds)
    ),
  };
  const residentStages = [
    'characterColorNanoseconds',
    'motionDepthNanoseconds',
    'temporalResolveNanoseconds',
    'aggregateNanoseconds',
  ];
  const hostResidentStageStatistics = Object.fromEntries(
    EXPECTED_RESIDENTS.map((name, residentIndex) => [
      name,
      Object.fromEntries(
        residentStages.map((stage) => [
          stage,
          computeTimingStatistics(
            browserWitness.state.measuredFrames.map(
              (frame) => frame.durations.residents[residentIndex][stage]
            )
          ),
        ])
      ),
    ])
  );
  const hostCombinedResidentStageStatistics = Object.fromEntries(
    residentStages.map((stage) => [
      stage,
      computeTimingStatistics(
        browserWitness.state.measuredFrames.flatMap((frame) =>
          frame.durations.residents.map((resident) => resident[stage])
        )
      ),
    ])
  );
  assert(
    canonicalJson(hostSharedStageStatistics) ===
      canonicalJson(browserWitness.state.stageTimingStatistics),
    'browser and host shared timing statistics drifted'
  );
  assert(
    canonicalJson(hostResidentStageStatistics) ===
      canonicalJson(browserWitness.state.residentStageTimingStatistics),
    'browser and host resident timing statistics drifted'
  );
  assert(
    canonicalJson(hostCombinedResidentStageStatistics) ===
      canonicalJson(browserWitness.state.combinedResidentStageTimingStatistics),
    'browser and host combined resident timing statistics drifted'
  );
  const receipt = {
    schema: 'hololand.model-village.character-realism-h4g-shared-world-frame-witness.v1',
    capturedAt: new Date().toISOString(),
    status: 'pass',
    milestone: 'MV_CHARACTER_REALISM_H4G_SHARED_CHARACTER_WORLD_FRAME',
    sourceAdmission: {
      holoScriptCommit: EXPECTED_COMMIT,
      sourceSha256: portableSha256(path.join(root, SOURCE_REL)),
      policySha256: portableSha256(path.join(root, POLICY_REL)),
      seedSha256: portableSha256(path.join(root, SEED_REL)),
      residentNames: EXPECTED_RESIDENTS,
      sourceFrameOffsetsSeconds: FRAME_OFFSETS_SECONDS,
      parsedFormats,
      runtimeHashBindings: Object.fromEntries(HASH_BINDINGS),
    },
    compilerAdmission: {
      target: 'character-webgpu',
      sourceCompiledStateCount: previous.compilerRecords.length + current.compilerRecords.length,
      residentCount: current.compilerRecords.length,
      repeatedCompileByteIdentity: [...previous.compilerRecords, ...current.compilerRecords].every(
        (record) => record.repeatedCompileByteIdentity === true
      ),
    },
    browserWebgpuAdmission: {
      runtime: {
        characterWorldFrameGraph: 'HoloScript CharacterWorldFrameGraph',
        backend: 'browser_native_webgpu',
        browserUsed: true,
        threeJsUsed: false,
        r3fUsed: false,
      },
      browser: browserWitness.browser,
      gpu: browserWitness.state.gpu,
      network: browserWitness.network,
      screenshot: {
        width: browserWitness.screenshot.width,
        height: browserWitness.screenshot.height,
        bytes: browserWitness.screenshot.bytes,
        sha256: browserWitness.screenshot.sha256,
      },
      sharedCompositeOutputDigest: browserWitness.state.outputDigest,
    },
    sharedWorldFrameGraphAdmission: {
      tileWidth: WIDTH,
      tileHeight: HEIGHT,
      outputWidth: WIDTH * 2,
      outputHeight: HEIGHT * 2,
      layout: 'two-by-two',
      residentCount: EXPECTED_RESIDENTS.length,
      warmupSharedFrames: WARMUP_SHARED_FRAMES,
      measuredSharedFrames: MEASURED_SHARED_FRAMES,
      totalMeasuredSampleCount: TOTAL_MEASURED_SAMPLES,
      fixedTopologySampleCount: TOTAL_MEASURED_SAMPLES,
      persistentGpuResourceSampleCount: TOTAL_MEASURED_SAMPLES,
      zeroCopyCompositeSampleCount: TOTAL_MEASURED_SAMPLES,
      sharedCommandAndSubmissionSampleCount: TOTAL_MEASURED_SAMPLES,
      intermediateFrameReadbackCount: 0,
      measuredFrameEvidenceReadbackCount: 0,
      finalCompositeEvidenceReadbackCount: 1,
      submissionScope: 'one-command-buffer-and-one-submission-for-four-residents-and-composite',
    },
    gpuTimestampAdmission: {
      classification: 'gpu-timestamp-query',
      queryCountPerSample: 26,
      timedScope: 'four-character-color-motion-depth-temporal-through-composite-gpu-scope',
      sampleCount: TOTAL_MEASURED_SAMPLES,
      sharedStageTimingStatistics: hostSharedStageStatistics,
      residentStageTimingStatistics: hostResidentStageStatistics,
      combinedResidentStageTimingStatistics: hostCombinedResidentStageStatistics,
      exclusions: [
        'cpu-motion-derivation',
        'cpu-to-gpu-uploads',
        'history-copies-after-q25',
        'timestamp-query-mapping',
        'final-evidence-readback',
        'html-composition',
        'screenshot-capture',
      ],
    },
    boundaries: browserWitness.state.boundaries,
  };
  if (options.writeArtifacts) {
    mkdirSync(path.dirname(path.join(root, EVIDENCE_REL)), { recursive: true });
    mkdirSync(path.dirname(path.join(root, REPORT_REL)), { recursive: true });
    writeFileSync(path.join(root, EVIDENCE_REL), `${JSON.stringify(receipt, null, 2)}\n`);
    writeFileSync(path.join(root, HERO_REL), browserWitness.screenshot.png);
    writeFileSync(path.join(root, REPORT_REL), reportMarkdown(receipt));
  }
  if (!options.skipManifest) {
    const manifestValidation = validateManifest(root);
    assert(manifestValidation.status === 'pass', manifestValidation.errors.join('\n'));
  }
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs();
  runCharacterRealismH4G(options)
    .then((receipt) => {
      if (options.json) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      else
        process.stdout.write(
          `PASS ${receipt.milestone} samples=${receipt.gpuTimestampAdmission.sampleCount} p95=${receipt.gpuTimestampAdmission.sharedStageTimingStatistics.aggregateNanoseconds.p95}ns\n`
        );
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message || String(error)}\n`);
      process.exitCode = 1;
    });
}
