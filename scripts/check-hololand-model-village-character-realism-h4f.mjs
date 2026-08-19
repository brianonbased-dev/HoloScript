#!/usr/bin/env node

// H4F proves the HoloScript end-to-end per-character WebGPU frame graph.
// Character color, motion/depth, and temporal resolve are encoded into one
// command buffer and submitted once. GPU timestamps cover those three stages
// and their aggregate; CPU motion derivation/uploads, history copies, query
// mapping, evidence readback, HTML composition, and screenshot capture are out.

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
  gate: 'H4F',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h4f-character-temporal'],
});
const BASE_CHECKER_REL = 'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4f-character-temporal-frame-graph.holo';
const POLICY_REL =
  'source/proofs/model-village-character-realism-h4f-character-temporal-frame-graph-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-realism-h4f-character-temporal-frame-graph-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4f-character-temporal-frame-graph-manifest.holo';
const CHECKER_REL = 'scripts/check-hololand-model-village-character-realism-h4f.mjs';
const TEST_REL = 'scripts/__tests__/hololand-model-village-character-realism-h4f.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-realism-h4f-character-temporal-frame-graph-2026-07-31.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-realism-h4f-character-temporal-frame-graph-2026-07-31.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-realism-h4f-character-temporal-frame-graph-2026-07-31.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-realism-h4f';
const EXPECTED_COMMIT = '345b85c87ef5a97bcad11cd39be8ece59358a319';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const FRAME_OFFSETS_SECONDS = [0, 0.84];
const WIDTH = 512;
const HEIGHT = 512;
const VIEWPORT_WIDTH = 1400;
const VIEWPORT_HEIGHT = 900;
const WARMUP_FRAMES_PER_RESIDENT = 4;
const MEASURED_FRAMES_PER_RESIDENT = 16;
const TOTAL_MEASURED_SAMPLES = EXPECTED_RESIDENTS.length * MEASURED_FRAMES_PER_RESIDENT;
const HASH_BINDINGS = [
  [
    'packages/engine/src/rendering/webgpu/CharacterTemporalFrameGraph.ts',
    'a4c636c38cf120c131cb1cc77a1e8f76b2200c33a4068f880887089cc0fea486',
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
      'H4F .holo',
      new core.HoloCompositionParser().parse(readFileSync(path.join(root, SOURCE_REL), 'utf8')),
    ],
    [
      'H4F .hsplus',
      new core.HoloScriptPlusParser().parse(readFileSync(path.join(root, POLICY_REL), 'utf8')),
    ],
    [
      'H4F .hs',
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
    `h4f-derived-payload-${String(timeOffsetSeconds).replace('.', '-')}.mjs`
  );
  writeFileSync(generatedPath, source);
  const harness = await import(`${pathToFileURL(generatedPath).href}?sha=${sha256(source)}`);
  const stack = await harness.parseH4AStack(root, holoScriptRoot, outputDir);
  try {
    const plan = stack.h4aContract?.objects || [];
    assert(plan.length === 4, 'H4F requires four source resident plans');
    const compiled = await harness.buildCompiledPayload(stack, plan, holoScriptRoot, outputDir);
    return { payload: compiled.payload, compilerRecords: compiled.compilerRecords };
  } finally {
    stack.esbuild.stop?.();
  }
}

function wgslRawPlugin() {
  return {
    name: 'h4f-wgsl-raw',
    setup(build) {
      build.onResolve({ filter: /\.wgsl/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
        namespace: 'h4f-wgsl-raw',
      }));
      build.onLoad({ filter: /.*/, namespace: 'h4f-wgsl-raw' }, (args) => ({
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
        import { CharacterTemporalFrameGraph } from './packages/engine/src/rendering/webgpu/CharacterTemporalFrameGraph.ts';
        window.__H4F_RUNTIME__ = { CharacterTemporalFrameGraph };
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h4f-browser-runtime.entry.ts',
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
  assert(result.outputFiles?.length === 1, 'H4F browser runtime bundle was not emitted');
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

function validateMeasuredFrame(frame, label) {
  const errors = [];
  if (frame?.width !== WIDTH || frame?.height !== HEIGHT)
    errors.push(`${label}: resolution drifted`);
  if (frame?.fixedTopology !== true || frame?.persistentGpuResources !== true) {
    errors.push(`${label}: persistent fixed-topology resources missing`);
  }
  if (
    frame?.zeroCopyColorToTemporalResolve !== true ||
    frame?.zeroCopyMotionDepthToTemporalResolve !== true ||
    frame?.zeroCopyResolveToHistory !== true
  )
    errors.push(`${label}: zero-copy character stage contract failed`);
  if (frame?.intermediateFrameReadbackCount !== 0 || frame?.evidenceFrameReadbackCount !== 0) {
    errors.push(`${label}: measured pixel readback detected`);
  }
  if (frame?.commandBufferCount !== 1 || frame?.queueSubmissionCount !== 1) {
    errors.push(`${label}: command/submission count drifted`);
  }
  if (
    frame?.gpuTimestampMeasured !== true ||
    frame?.timedScope !== 'character-color-through-temporal-resolve-gpu-scope'
  )
    errors.push(`${label}: GPU timestamp scope missing`);
  for (const [stage, duration] of Object.entries(frame?.durations || {})) {
    if (!(duration > 0)) errors.push(`${label}: ${stage} duration missing`);
  }
  if (frame?.historyConsumed !== true) errors.push(`${label}: temporal history was not consumed`);
  if (!(frame?.motionDerivation?.movingVertexCount > 0))
    errors.push(`${label}: resident motion missing`);
  if (
    frame?.resolve?.motionVectorsConsumed !== true ||
    frame?.resolve?.disocclusionInputConsumed !== true
  ) {
    errors.push(`${label}: temporal motion/depth inputs were not consumed`);
  }
  return errors;
}

export function validateH4FBrowserState(state) {
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
  const measured = (state?.residents || []).flatMap((resident) => resident.measuredFrames || []);
  if (measured.length !== TOTAL_MEASURED_SAMPLES)
    errors.push(`expected ${TOTAL_MEASURED_SAMPLES} measured samples`);
  for (const [index, frame] of measured.entries())
    errors.push(...validateMeasuredFrame(frame, `measured sample ${index}`));
  for (const [index, resident] of (state?.residents || []).entries()) {
    if (resident.warmupFrameCount !== WARMUP_FRAMES_PER_RESIDENT)
      errors.push(`resident ${index}: warmup count drifted`);
    if (resident.measuredFrames?.length !== MEASURED_FRAMES_PER_RESIDENT)
      errors.push(`resident ${index}: sample count drifted`);
    if (
      resident.finalEvidence?.evidenceFrameReadbackCount !== 1 ||
      resident.finalEvidence?.intermediateFrameReadbackCount !== 0
    ) {
      errors.push(`resident ${index}: final evidence readback boundary drifted`);
    }
    if (!/^[a-f0-9]{64}$/.test(resident.outputDigest || ''))
      errors.push(`resident ${index}: output digest missing`);
  }
  for (const [stage, statistics] of Object.entries(state?.stageTimingStatistics || {})) {
    if (statistics?.sampleCount !== TOTAL_MEASURED_SAMPLES || !(statistics.p95 > 0)) {
      errors.push(`${stage}: timing statistics failed admission`);
    }
  }
  if (
    state?.boundaries?.boundedPerCharacterRtxBenchmarkClaimed !== true ||
    state?.boundaries?.fourCharactersInOneSubmissionClaimed !== false ||
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
  const runtime = window.__H4F_RUNTIME__;
  const payload = window.__H4F_PAYLOAD__;
  const config = window.__H4F_CONFIG__;
  const state = {
    schema: 'hololand.model-village.character-realism-h4f-browser-state.v1',
    ready: false,
    status: 'booting',
    gpu: null,
    residents: [],
    stageTimingStatistics: null,
    boundaries: {
      boundedPerCharacterRtxBenchmarkClaimed: true,
      fourCharactersInOneSubmissionClaimed: false,
      productionWholeFrameTimeClaimed: false,
      wallClockUsedAsGpuTime: false,
      questHeadsetMeasured: false,
      photorealismClaimed: false,
    },
    errors: [],
  };
  window.__H4F__ = state;

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

  const drawPixels = (name, pixels) => {
    const canvas = document.querySelector('[data-resident="' + name + '"] canvas');
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas.getContext('2d').putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0
    );
  };

  const renderOptions = (frame, resident) => ({
    cameraPos: frame.camera,
    clear: frame.clear,
    heightScale: resident.heightScale,
    environmentLight: resident.environmentLight,
  });

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

    const stageSamples = {
      characterColorNanoseconds: [],
      motionDepthNanoseconds: [],
      temporalResolveNanoseconds: [],
      aggregateNanoseconds: [],
    };

    for (let residentIndex = 0; residentIndex < config.residentNames.length; residentIndex += 1) {
      const name = config.residentNames[residentIndex];
      const sourceResidents = [payload.previous.residents[residentIndex], payload.current.residents[residentIndex]];
      if (sourceResidents.some((resident) => resident.displayLabel !== name)) throw new Error('source resident order drifted');
      const specs = sourceResidents.map((resident) => hydrateSpec(resident.spec, 'h4f-' + name));
      const viewProjections = sourceResidents.map((resident) => new Float32Array(resident.viewProj));
      const frames = [payload.previous, payload.current];
      const graph = new runtime.CharacterTemporalFrameGraph(device, specs[0], {
        width: config.width,
        height: config.height,
        enableGpuTimestamps: true,
        label: 'h4f-' + name.toLowerCase(),
      });
      const residentState = { displayLabel: name, warmupFrameCount: 0, measuredFrames: [], finalEvidence: null, outputDigest: null };
      let sequence = 0;
      for (let warmup = 0; warmup < config.warmupFramesPerResident; warmup += 1) {
        const currentIndex = (sequence + 1) % 2;
        const previousIndex = sequence % 2;
        await graph.execute({
          currentSpec: specs[currentIndex], previousSpec: specs[previousIndex],
          currentViewProjection: viewProjections[currentIndex], previousViewProjection: viewProjections[previousIndex],
          renderOptions: renderOptions(frames[currentIndex], sourceResidents[currentIndex]),
          feedback: 0.75, historyValid: sequence > 0, capturePixels: false,
        });
        residentState.warmupFrameCount += 1;
        sequence += 1;
      }
      for (let sample = 0; sample < config.measuredFramesPerResident; sample += 1) {
        const currentIndex = (sequence + 1) % 2;
        const previousIndex = sequence % 2;
        const result = await graph.execute({
          currentSpec: specs[currentIndex], previousSpec: specs[previousIndex],
          currentViewProjection: viewProjections[currentIndex], previousViewProjection: viewProjections[previousIndex],
          renderOptions: renderOptions(frames[currentIndex], sourceResidents[currentIndex]),
          feedback: 0.75, historyValid: true, capturePixels: false,
        });
        residentState.measuredFrames.push(result.receipt);
        for (const stage of Object.keys(stageSamples)) stageSamples[stage].push(result.receipt.durations[stage]);
        sequence += 1;
      }
      const currentIndex = (sequence + 1) % 2;
      const previousIndex = sequence % 2;
      const final = await graph.execute({
        currentSpec: specs[currentIndex], previousSpec: specs[previousIndex],
        currentViewProjection: viewProjections[currentIndex], previousViewProjection: viewProjections[previousIndex],
        renderOptions: renderOptions(frames[currentIndex], sourceResidents[currentIndex]),
        feedback: 0.75, historyValid: true, capturePixels: true,
      });
      if (!final.pixels) throw new Error(name + ' final evidence pixels missing');
      residentState.finalEvidence = final.receipt;
      residentState.outputDigest = await digestPixels(final.pixels);
      drawPixels(name, final.pixels);
      graph.destroy();
      state.residents.push(residentState);
    }

    state.stageTimingStatistics = Object.fromEntries(
      Object.entries(stageSamples).map(([stage, values]) => [stage, stats(values)])
    );
    const aggregate = state.stageTimingStatistics.aggregateNanoseconds;
    document.querySelector('[data-status]').textContent = 'RTX TIMESTAMPS VERIFIED';
    document.querySelector('[data-median]').textContent = (aggregate.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-p95]').textContent = (aggregate.p95 / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-color]').textContent = (state.stageTimingStatistics.characterColorNanoseconds.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-motion]').textContent = (state.stageTimingStatistics.motionDepthNanoseconds.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-resolve]').textContent = (state.stageTimingStatistics.temporalResolveNanoseconds.median / 1e6).toFixed(3) + ' ms';
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
      <div class="resident-label"><span>0${index + 1}</span><strong>${name}</strong><small>LIVE CHARACTER GRAPH</small></div>
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
    <header><div><div class="eyebrow">HOLOLAND / STORMGLASS COMMONS / H4F</div><h1 class="title">Four minds. One <em>native character path.</em></h1></div><div class="live" data-status>REQUESTING RTX TIMESTAMPS</div></header>
    <section class="content"><div class="grid">${cards}</div><aside class="telemetry">
      <div class="scope-id">CHARACTER COLOR → MOTION / DEPTH → TEMPORAL</div><h2>One-submit telemetry</h2><div class="adapter" data-adapter>Discovering high-performance WebGPU adapter</div>
      <div class="aggregate"><label>AGGREGATE MEDIAN</label><strong data-median>—</strong><small>p95 <span data-p95>—</span></small></div>
      <div class="stages"><div class="stage"><label>CHARACTER COLOR</label><strong data-color>—</strong></div><div class="stage"><label>MOTION + DEPTH</label><strong data-motion>—</strong></div><div class="stage"><label>TEMPORAL RESOLVE</label><strong data-resolve>—</strong></div></div>
      <div class="boundary"><b>Exact measured scope</b>Per resident: six GPU timestamps inside one command buffer and one queue submission. CPU motion derivation/uploads, history copies, query mapping, evidence readback, and this composition are excluded.<div class="samples">64 samples · 4 residents · 512 × 512 each</div>No whole-world, four-character single-submit, Quest, or photorealism claim.</div>
    </aside></section>
  </main><script>window.__H4F_PAYLOAD__=${safeInlineJson(payload)};window.__H4F_CONFIG__=${safeInlineJson(config)};</script><script>${browserBundle}</script><script>${browserApplication()}</script></body></html>`;
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
  assert(address && typeof address === 'object', 'H4F loopback server did not bind');
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
  const screenshotPath = path.join(outputDir, 'h4f-character-temporal-frame-graph.png');
  try {
    await page.goto(`http://127.0.0.1:${address.port}/index.html`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await page.waitForFunction(() => window.__H4F__?.ready === true, null, { timeout: 360_000 });
    const state = await page.evaluate(() => JSON.parse(JSON.stringify(window.__H4F__)));
    assert(state.status === 'pass', `H4F browser failed: ${state.errors?.join('\n')}`);
    const validation = validateH4FBrowserState(state);
    assert(validation.status === 'pass', validation.errors.join('\n'));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
        userAgent: await page.evaluate(() => navigator.userAgent),
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
  if (!existsSync(manifestPath)) return { status: 'fail', errors: ['H4F manifest is missing'] };
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
  const timings = receipt.gpuTimestampAdmission.stageTimingStatistics;
  const ms = (value) => (value / 1e6).toFixed(3);
  return (
    `# Model Village Character Realism H4F — Character Temporal Frame Graph\n\n` +
    `Status: **PASS**  \nCaptured: ${receipt.capturedAt}  \nHoloScript canon: \`${receipt.sourceAdmission.holoScriptCommit}\`\n\n` +
    `H4F renders the source-compiled OpenAI, Claude, Gemini, and Grok residents through the native HoloScript character color, motion/depth, and temporal-resolve graph. Each per-character frame uses one command buffer and one queue submission with no intermediate pixel readback.\n\n` +
    `## RTX GPU timestamp results\n\n| Stage | Samples | Median | p95 | Min | Max |\n|---|---:|---:|---:|---:|---:|\n` +
    Object.entries(timings)
      .map(
        ([stage, stat]) =>
          `| ${stage} | ${stat.sampleCount} | ${ms(stat.median)} ms | ${ms(stat.p95)} ms | ${ms(stat.minimum)} ms | ${ms(stat.maximum)} ms |`
      )
      .join('\n') +
    `\n\nWorkload: 64 measured per-character samples (16 per resident), 512 × 512, after four warmup frames per resident. Timings are WebGPU timestamp-query deltas, not wall clock.\n\n` +
    `## Exact boundary\n\nThe aggregate scope begins with the character-color render pass and ends with temporal resolve. CPU motion derivation, CPU-to-GPU uploads, post-timestamp history copies, timestamp mapping, final evidence readback, HTML composition, and screenshot capture are excluded. This is not a whole-world frame time, not one submission for all four characters, not a Quest measurement, and not a photorealism claim.\n`
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

export async function runCharacterRealismH4F(options = {}) {
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
      warmupFramesPerResident: WARMUP_FRAMES_PER_RESIDENT,
      measuredFramesPerResident: MEASURED_FRAMES_PER_RESIDENT,
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
  const validation = validateH4FBrowserState(browserWitness.state);
  assert(validation.status === 'pass', validation.errors.join('\n'));
  const hostStageStatistics = {};
  for (const stage of [
    'characterColorNanoseconds',
    'motionDepthNanoseconds',
    'temporalResolveNanoseconds',
    'aggregateNanoseconds',
  ]) {
    hostStageStatistics[stage] = computeTimingStatistics(
      browserWitness.state.residents.flatMap((resident) =>
        resident.measuredFrames.map((frame) => frame.durations[stage])
      )
    );
  }
  assert(
    canonicalJson(hostStageStatistics) ===
      canonicalJson(browserWitness.state.stageTimingStatistics),
    'browser and host timing statistics drifted'
  );
  const receipt = {
    schema: 'hololand.model-village.character-realism-h4f-character-temporal-witness.v1',
    capturedAt: new Date().toISOString(),
    status: 'pass',
    milestone: 'MV_CHARACTER_REALISM_H4F_CHARACTER_TEMPORAL_FRAME_GRAPH',
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
        characterTemporalFrameGraph: 'HoloScript CharacterTemporalFrameGraph',
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
      residentOutputDigests: Object.fromEntries(
        browserWitness.state.residents.map((resident) => [
          resident.displayLabel,
          resident.outputDigest,
        ])
      ),
    },
    characterFrameGraphAdmission: {
      width: WIDTH,
      height: HEIGHT,
      residentCount: EXPECTED_RESIDENTS.length,
      warmupFramesPerResident: WARMUP_FRAMES_PER_RESIDENT,
      measuredFramesPerResident: MEASURED_FRAMES_PER_RESIDENT,
      totalMeasuredSampleCount: TOTAL_MEASURED_SAMPLES,
      fixedTopologySampleCount: TOTAL_MEASURED_SAMPLES,
      persistentGpuResourceSampleCount: TOTAL_MEASURED_SAMPLES,
      zeroCopyStageSampleCount: TOTAL_MEASURED_SAMPLES,
      singleCommandAndSubmissionSampleCount: TOTAL_MEASURED_SAMPLES,
      intermediateFrameReadbackCount: 0,
      measuredFrameEvidenceReadbackCount: 0,
      finalEvidenceReadbackCount: EXPECTED_RESIDENTS.length,
      submissionScope: 'one-command-buffer-and-one-submission-per-resident-character-frame',
    },
    gpuTimestampAdmission: {
      classification: 'gpu-timestamp-query',
      queryCountPerSample: 6,
      timedScope: 'character-color-through-temporal-resolve-gpu-scope',
      sampleCount: TOTAL_MEASURED_SAMPLES,
      stageTimingStatistics: hostStageStatistics,
      exclusions: [
        'cpu-motion-derivation',
        'cpu-to-gpu-uploads',
        'history-copies-after-q5',
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
  runCharacterRealismH4F(options)
    .then((receipt) => {
      if (options.json) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
      else
        process.stdout.write(
          `PASS ${receipt.milestone} samples=${receipt.gpuTimestampAdmission.sampleCount} p95=${receipt.gpuTimestampAdmission.stageTimingStatistics.aggregateNanoseconds.p95}ns\n`
        );
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message || String(error)}\n`);
      process.exitCode = 1;
    });
}
