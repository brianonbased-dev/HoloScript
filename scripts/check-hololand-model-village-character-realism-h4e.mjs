#!/usr/bin/env node

// H4E measures the HoloScript texture-native temporal resolve in Chrome/WebGPU.
// GPU timestamps cover only the compute pass. Texture upload, queue wait,
// timestamp mapping, evidence readback, page composition, and screenshot capture
// are deliberately outside the measured scope.

import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H4E',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/holorepo-worktrees/holoscript-h4e-zero-copy'],
});
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4e-zero-copy-temporal-frame-graph.holo';
const POLICY_REL =
  'source/proofs/model-village-character-realism-h4e-zero-copy-temporal-frame-graph-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-realism-h4e-zero-copy-temporal-frame-graph-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4e-zero-copy-temporal-frame-graph-manifest.holo';
const CHECKER_REL =
  'scripts/check-hololand-model-village-character-realism-h4e.mjs';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-realism-h4e.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-realism-h4e-zero-copy-temporal-frame-graph-2026-07-31.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-realism-h4e-zero-copy-temporal-frame-graph-2026-07-31.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-realism-h4e-zero-copy-temporal-frame-graph-2026-07-31.json';
const INHERITED_HERO_REL =
  'docs/assets/model-village/model-village-character-realism-h4d-production-temporal-convergence-2026-07-30.png';
const OUTPUT_REL = '.tmp/hololand/model-village/character-realism-h4e';
const EXPECTED_COMMIT = 'b72544464b2054797c7a73a0de2150da45621b1a';
const WIDTH = 1400;
const HEIGHT = 900;
const WARMUP_FRAMES = 8;
const MEASURED_FRAMES = 40;
const STRESS_FRAMES = 24;
const FRAMES_PER_LOD = 3;
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const HASH_BINDINGS = [
  [
    'packages/engine/src/rendering/webgpu/TemporalFrameGraph.ts',
    '9e6c9851a952720efbf465347902214fdabc497b7baca69f6c914544d0394afa',
  ],
  [
    'packages/engine/src/rendering/webgpu/TemporalConvergence.ts',
    'd6eff9ce826a095ccdb6563f38200db571ee2f2d1e64d76d352a190db11ec61d',
  ],
  [
    'packages/engine/src/rendering/webgpu/index.ts',
    'f60574d1d06c6f02ef2b6e011fc0e49233c8bbff9bf84d6333da475fe6d49bf7',
  ],
];
const INHERITED_HERO_SHA256 =
  '7355653304de428f9cfd3bcf7110fb80f3ce0574a4dd4ad1cc17bb8314b10b85';
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

function validatePins(root, holoScriptRoot) {
  const errors = [];
  errors.push(...upstreamPinFailures(holoScriptRoot));
  for (const [relativePath, expected] of HASH_BINDINGS) {
    const absolute = path.join(holoScriptRoot, relativePath);
    if (!existsSync(absolute)) errors.push(`${relativePath} is missing`);
    else if (sha256File(absolute) !== expected) errors.push(`${relativePath} hash drifted`);
  }
  const inheritedHero = path.join(root, INHERITED_HERO_REL);
  if (!existsSync(inheritedHero)) errors.push(`${INHERITED_HERO_REL} is missing`);
  else if (sha256File(inheritedHero) !== INHERITED_HERO_SHA256) {
    errors.push(`${INHERITED_HERO_REL} hash drifted`);
  }
  return errors;
}

function parseContracts(root, holoScriptRoot) {
  const require = createRequire(path.join(holoScriptRoot, 'package.json'));
  const core = require('@holoscript/core');
  const rows = [
    [
      'H4E .holo',
      new core.HoloCompositionParser().parse(readFileSync(path.join(root, SOURCE_REL), 'utf8')),
    ],
    [
      'H4E .hsplus',
      new core.HoloScriptPlusParser().parse(readFileSync(path.join(root, POLICY_REL), 'utf8')),
    ],
    [
      'H4E .hs',
      new core.HoloScriptCodeParser().parse(readFileSync(path.join(root, SEED_REL), 'utf8')),
    ],
  ];
  for (const [label, result] of rows) {
    assert(result.success && result.errors.length === 0, `${label} parse failed`);
  }
  return {
    holoObjectCount: rows[0][1].ast.objects?.length || 0,
    hsplusObjectCount: rows[1][1].ast.objects?.length || 0,
    hsObjectCount: rows[2][1].ast.objects?.length || 0,
  };
}

function wgslRawPlugin() {
  return {
    name: 'h4e-wgsl-raw',
    setup(build) {
      build.onResolve({ filter: /\.wgsl/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
        namespace: 'h4e-wgsl-raw',
      }));
      build.onLoad({ filter: /.*/, namespace: 'h4e-wgsl-raw' }, (args) => ({
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
        import { TemporalFrameGraph } from './packages/engine/src/rendering/webgpu/TemporalFrameGraph.ts';
        import { TemporalConvergenceController } from './packages/engine/src/rendering/webgpu/TemporalConvergence.ts';
        window.__H4E_RUNTIME__ = { TemporalFrameGraph, TemporalConvergenceController };
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h4e-browser-runtime.entry.ts',
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
  assert(result.outputFiles?.length === 1, 'H4E browser runtime bundle was not emitted');
  esbuild.stop?.();
  return result.outputFiles[0].text;
}

export function buildLodStressSchedule(
  frameCount = STRESS_FRAMES,
  framesPerLod = FRAMES_PER_LOD
) {
  assert(frameCount > 0 && Number.isInteger(frameCount), 'frameCount must be positive');
  assert(framesPerLod > 0 && Number.isInteger(framesPerLod), 'framesPerLod must be positive');
  return Array.from({ length: frameCount }, (_, frameIndex) => ({
    frameIndex,
    lodLevel: Math.floor(frameIndex / framesPerLod) % 2 === 0 ? 0 : 2,
  }));
}

export function computeTimingStatistics(values) {
  assert(Array.isArray(values) && values.length > 0, 'timing values are required');
  assert(values.every((value) => Number.isFinite(value) && value > 0), 'timings must be positive');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.ceil(fraction * sorted.length) - 1];
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return {
    unit: 'nanoseconds',
    sampleCount: sorted.length,
    minimum: sorted[0],
    median,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p95: percentile(0.95),
    maximum: sorted.at(-1),
  };
}

function validateFrameReceipt(frame, label) {
  const errors = [];
  if (frame?.width !== WIDTH || frame?.height !== HEIGHT) {
    errors.push(`${label}: benchmark resolution drifted`);
  }
  if (frame?.zeroCopyTextureInputs !== true || frame?.zeroCopyHistory !== true) {
    errors.push(`${label}: texture history left GPU`);
  }
  if (frame?.intermediateFrameReadbackCount !== 0 || frame?.evidenceFrameReadbackCount !== 0) {
    errors.push(`${label}: measured frame readback detected`);
  }
  if (frame?.commandBufferCount !== 1 || frame?.queueSubmissionCount !== 1) {
    errors.push(`${label}: command/submission count drifted`);
  }
  if (
    frame?.gpuTimestampQuerySupported !== true ||
    frame?.gpuTimestampQueryEnabled !== true ||
    frame?.gpuTimestampMeasured !== true ||
    !(frame?.resolveDurationNanoseconds > 0)
  ) {
    errors.push(`${label}: GPU timestamp missing`);
  }
  if (
    frame?.timedScope !== 'temporal-resolve-compute-pass' ||
    frame?.readbackExcludedFromTimedScope !== true
  ) {
    errors.push(`${label}: timestamp scope drifted`);
  }
  if (
    frame?.resolve?.persistentPipelineConsumed !== true ||
    frame?.resolve?.zeroCopyTextureInputs !== true ||
    frame?.resolve?.intermediateCpuReadbackCount !== 0 ||
    frame?.resolve?.gpuTimestampWritesEncoded !== true
  ) {
    errors.push(`${label}: persistent texture resolve admission failed`);
  }
  return errors;
}

export function validateH4EBrowserState(state) {
  const errors = [];
  if (
    state?.status !== 'pass' ||
    state?.gpu?.navigatorGpu !== true ||
    state?.gpu?.adapterAcquired !== true ||
    state?.gpu?.deviceCreated !== true ||
    state?.gpu?.timestampQuerySupported !== true ||
    state?.gpu?.timestampQueryEnabled !== true
  ) {
    errors.push('timestamp-capable browser WebGPU device admission failed');
  }
  if (state?.measuredFrames?.length !== MEASURED_FRAMES) {
    errors.push(`expected ${MEASURED_FRAMES} measured frames`);
  }
  for (const [index, frame] of (state?.measuredFrames || []).entries()) {
    errors.push(...validateFrameReceipt(frame, `measured frame ${index}`));
  }
  if (state?.stressFrames?.length !== STRESS_FRAMES) {
    errors.push(`expected ${STRESS_FRAMES} LOD stress frames`);
  }
  const transitions = (state?.stressFrames || []).filter(
    (frame) => frame.plan?.invalidationReason === 'lod-change'
  );
  if (transitions.length !== 7) errors.push('expected seven deterministic LOD transitions');
  for (const [index, frame] of transitions.entries()) {
    if (frame.plan.historyValid !== false || frame.receipt.historyConsumed !== false) {
      errors.push(`LOD transition ${index}: stale history was consumed`);
    }
  }
  if (
    state?.timingStatistics?.sampleCount !== MEASURED_FRAMES ||
    !(state?.timingStatistics?.minimum > 0) ||
    !(state?.timingStatistics?.median > 0) ||
    !(state?.timingStatistics?.p95 > 0)
  ) {
    errors.push('GPU timing statistics failed admission');
  }
  if (
    state?.finalEvidence?.intermediateFrameReadbackCount !== 0 ||
    state?.finalEvidence?.evidenceFrameReadbackCount !== 1 ||
    state?.finalEvidence?.readbackExcludedFromTimedScope !== true
  ) {
    errors.push('final evidence readback boundary drifted');
  }
  if (
    state?.boundaries?.generalRtxPerformanceClaimed !== false ||
    state?.boundaries?.productionFrameTimeClaimed !== false ||
    state?.boundaries?.wallClockUsedAsGpuTime !== false
  ) {
    errors.push('benchmark scope was overclaimed');
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function safeInlineJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function browserApplication() {
  return String.raw`
(() => {
  const runtime = window.__H4E_RUNTIME__;
  const config = window.__H4E_CONFIG__;
  const state = {
    schema: 'hololand.model-village.character-realism-h4e-browser-state.v1',
    ready: false,
    status: 'booting',
    gpu: null,
    warmupFrames: [],
    measuredFrames: [],
    stressFrames: [],
    timingStatistics: null,
    finalEvidence: null,
    outputDigest: null,
    boundaries: {
      boundedRtxTemporalKernelBenchmarkClaimed: true,
      generalRtxPerformanceClaimed: false,
      productionFrameTimeClaimed: false,
      wallClockUsedAsGpuTime: false,
      questHeadsetMeasured: false,
      photorealismClaimed: false,
    },
    errors: [],
  };
  window.__H4E__ = state;

  const loadImage = async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    return image;
  };

  const makePlateCanvas = (image, lodLevel) => {
    const canvas = document.createElement('canvas');
    canvas.width = config.width;
    canvas.height = config.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (lodLevel === 0) {
      context.drawImage(image, 0, 0, config.width, config.height);
    } else {
      const reduced = document.createElement('canvas');
      reduced.width = Math.floor(config.width / 4);
      reduced.height = Math.floor(config.height / 4);
      reduced.getContext('2d', { alpha: false }).drawImage(
        image,
        0,
        0,
        reduced.width,
        reduced.height
      );
      context.imageSmoothingEnabled = false;
      context.drawImage(reduced, 0, 0, config.width, config.height);
    }
    return canvas;
  };

  const createColorTexture = (device, canvas, label) => {
    const texture = device.createTexture({
      label,
      size: [config.width, config.height],
      format: 'rgba8unorm',
      usage: 0x02 | 0x04 | 0x10,
    });
    device.queue.copyExternalImageToTexture(
      { source: canvas },
      { texture },
      [config.width, config.height]
    );
    return texture;
  };

  const createDepthTexture = (device) => {
    const texture = device.createTexture({
      label: 'h4e-current-depth',
      size: [config.width, config.height],
      format: 'r32float',
      usage: 0x01 | 0x02 | 0x04,
    });
    const bytesPerRow = Math.ceil((config.width * 4) / 256) * 256;
    const upload = new Float32Array((bytesPerRow / 4) * config.height);
    upload.fill(0.5);
    device.queue.writeTexture(
      { texture },
      upload,
      { bytesPerRow, rowsPerImage: config.height },
      [config.width, config.height]
    );
    return texture;
  };

  const browserStatistics = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = (fraction) => sorted[Math.ceil(fraction * sorted.length) - 1];
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
    return {
      unit: 'nanoseconds',
      sampleCount: sorted.length,
      minimum: sorted[0],
      median,
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      p95: percentile(0.95),
      maximum: sorted[sorted.length - 1],
    };
  };

  const digestPixels = async (pixels) => {
    const bytes = new Uint8Array(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
  };

  const drawFinalPlate = (pixels) => {
    const canvas = document.querySelector('[data-final-plate]');
    canvas.getContext('2d').putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
      0,
      0
    );
  };

  const updateInterface = () => {
    const stats = state.timingStatistics;
    document.querySelector('[data-status]').textContent = 'TIMESTAMP QUERY VERIFIED';
    document.querySelector('[data-median]').textContent = (stats.median / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-p95]').textContent = (stats.p95 / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-min]').textContent = (stats.minimum / 1e6).toFixed(3) + ' ms';
    document.querySelector('[data-transitions]').textContent =
      state.stressFrames.filter((frame) => frame.plan.invalidationReason === 'lod-change').length + '/7';
    document.querySelector('[data-adapter]').textContent =
      [state.gpu.vendor, state.gpu.architecture, state.gpu.device].filter(Boolean).join(' / ') ||
      'high-performance WebGPU adapter';
  };

  async function boot() {
    if (!navigator.gpu) throw new Error('navigator.gpu is unavailable');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('navigator.gpu.requestAdapter returned null');
    const timestampQuerySupported = adapter.features?.has?.('timestamp-query') === true;
    if (!timestampQuerySupported) throw new Error('timestamp-query is not supported by adapter');
    const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query'] });
    if (!device.features.has('timestamp-query')) {
      throw new Error('timestamp-query was not enabled on the browser device');
    }
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
      timestampQuerySupported,
      timestampQueryEnabled: device.features.has('timestamp-query'),
    };

    const image = await loadImage(config.inheritedHeroDataUrl);
    const lod0Canvas = makePlateCanvas(image, 0);
    const lod2Canvas = makePlateCanvas(image, 2);
    document.querySelector('[data-final-plate]').getContext('2d').drawImage(lod0Canvas, 0, 0);
    const lod0Texture = createColorTexture(device, lod0Canvas, 'h4e-lod0-current-color');
    const lod2Texture = createColorTexture(device, lod2Canvas, 'h4e-lod2-current-color');
    const depthTexture = createDepthTexture(device);
    const graph = new runtime.TemporalFrameGraph(device, {
      width: config.width,
      height: config.height,
      enableGpuTimestamps: true,
      label: 'hololand-h4e-temporal',
    });
    const controller = runtime.TemporalConvergenceController.fromProfile('browser-balanced');

    const execute = async (lodLevel, capturePixels = false) => {
      const plan = controller.beginFrame({
        cameraStateId: 'stormglass-h4e-camera',
        residentStateId: 'stormglass-h4e-resident-plate',
        lodLevel,
        motionVectorsAvailable: false,
      });
      const result = await graph.execute({
        currentColor: lodLevel === 0 ? lod0Texture : lod2Texture,
        currentDepth: depthTexture,
        feedback: plan.feedback,
        historyValid: plan.historyValid,
        disocclusionDepthThreshold: 0.01,
        capturePixels,
      });
      return { plan, result };
    };

    for (let frame = 0; frame < config.warmupFrames; frame += 1) {
      const { result } = await execute(0, false);
      state.warmupFrames.push(result.receipt);
    }
    for (let frame = 0; frame < config.measuredFrames; frame += 1) {
      const { result } = await execute(0, false);
      state.measuredFrames.push(result.receipt);
    }
    for (const scheduled of config.stressSchedule) {
      const { plan, result } = await execute(scheduled.lodLevel, false);
      state.stressFrames.push({
        frameIndex: scheduled.frameIndex,
        lodLevel: scheduled.lodLevel,
        plan,
        receipt: result.receipt,
      });
    }
    await execute(0, false);
    const final = await execute(0, true);
    if (!final.result.pixels) throw new Error('final evidence pixels were not captured');
    drawFinalPlate(final.result.pixels);
    state.finalEvidence = final.result.receipt;
    state.outputDigest = await digestPixels(final.result.pixels);
    state.timingStatistics = browserStatistics(
      state.measuredFrames.map((frame) => frame.resolveDurationNanoseconds)
    );
    updateInterface();

    graph.destroy();
    depthTexture.destroy();
    lod2Texture.destroy();
    lod0Texture.destroy();
    state.status = 'pass';
    state.ready = true;
    document.body.dataset.ready = 'true';
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

function buildHtml(config, browserBundle) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stormglass H4E Zero Copy Temporal Frame Graph</title>
<style>
  :root { color-scheme:dark; --ink:#f8f1e8; --muted:#a9b9b6; --mint:#78e5c8;
    --amber:#f0b979; --line:rgba(155,220,207,.27); }
  * { box-sizing:border-box; }
  body { margin:0; width:1400px; height:900px; overflow:hidden; color:var(--ink);
    background:#02070c; font-family:Segoe UI,Arial,sans-serif; }
  .plate { position:fixed; inset:0; width:1400px; height:900px; }
  .veil { position:fixed; inset:0; pointer-events:none;
    background:linear-gradient(180deg,#01070a 0%,#01070a 17%,rgba(2,8,11,.18) 24%,rgba(2,8,11,.08) 29%,rgba(2,7,10,.08) 66%,rgba(1,6,9,.91) 100%); }
  .shell { position:relative; width:1400px; height:900px; padding:28px 42px; }
  header { display:flex; align-items:flex-start; justify-content:space-between; }
  .kicker { color:var(--mint); text-transform:uppercase; letter-spacing:.2em;
    font:700 10px/1 ui-monospace,Consolas,monospace; }
  h1 { margin:9px 0 0; max-width:780px; font:500 43px/.98 Georgia,serif;
    letter-spacing:-.035em; text-shadow:0 3px 18px #000; }
  .live { min-width:280px; padding:14px 18px; border:1px solid var(--line);
    border-radius:999px; background:rgba(2,11,14,.75); backdrop-filter:blur(16px);
    color:var(--mint); text-align:center; letter-spacing:.13em;
    font:700 10px/1 ui-monospace,Consolas,monospace; }
  .instrument { position:absolute; right:42px; top:150px; width:350px; padding:22px;
    border:1px solid var(--line); border-radius:20px;
    background:linear-gradient(145deg,rgba(4,17,21,.92),rgba(3,9,14,.82));
    backdrop-filter:blur(18px); box-shadow:0 28px 80px rgba(0,0,0,.42); }
  .instrument h2 { margin:0 0 6px; font:500 22px/1.1 Georgia,serif; }
  .adapter { min-height:31px; color:var(--muted); font:9px/1.45 ui-monospace,Consolas,monospace; }
  .stats { display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:14px; }
  .stat { min-height:83px; padding:13px; border:1px solid rgba(132,201,189,.2);
    border-radius:12px; background:rgba(3,12,16,.72); }
  .stat span { color:var(--muted); text-transform:uppercase; letter-spacing:.12em;
    font:700 8px/1 ui-monospace,Consolas,monospace; }
  .stat strong { display:block; margin-top:10px; color:var(--mint);
    font:500 25px/1 Georgia,serif; }
  .scope { margin-top:15px; padding-top:13px; border-top:1px solid var(--line);
    color:#d1dad5; font-size:10px; line-height:1.55; }
  .rail { position:absolute; left:42px; right:42px; bottom:28px; display:grid;
    grid-template-columns:1fr 400px; gap:16px; }
  .residents,.proof { min-height:104px; border:1px solid var(--line); border-radius:16px;
    background:rgba(2,10,14,.86); backdrop-filter:blur(16px); }
  .residents { display:flex; align-items:center; gap:11px; padding:18px 20px; }
  .name { flex:1; padding:14px 10px; text-align:center; border-radius:11px;
    border:1px solid rgba(255,255,255,.12); color:#edf5f0;
    font:600 13px/1 Georgia,serif; }
  .name:nth-child(1) { box-shadow:inset 0 3px #69ddc3; }
  .name:nth-child(2) { box-shadow:inset 0 3px #e1a16e; }
  .name:nth-child(3) { box-shadow:inset 0 3px #8fa2ff; }
  .name:nth-child(4) { box-shadow:inset 0 3px #6bd7e4; }
  .proof { padding:17px 20px; }
  .proof b { color:var(--amber); text-transform:uppercase; letter-spacing:.13em;
    font:700 9px/1 ui-monospace,Consolas,monospace; }
  .proof p { margin:10px 0 0; color:var(--muted);
    font:9px/1.5 ui-monospace,Consolas,monospace; }
</style>
</head>
<body>
<canvas class="plate" data-final-plate width="1400" height="900"></canvas>
<div class="veil"></div>
<main class="shell">
  <header>
    <div>
      <div class="kicker">Stormglass Commons / H4E / owned-metal proof</div>
      <h1>Their history never leaves the GPU.</h1>
    </div>
    <div class="live" data-status>REQUESTING TIMESTAMP QUERY</div>
  </header>
  <aside class="instrument">
    <h2>Temporal resolve telemetry</h2>
    <div class="adapter" data-adapter>Discovering high-performance adapter</div>
    <div class="stats">
      <div class="stat"><span>median kernel</span><strong data-median>—</strong></div>
      <div class="stat"><span>p95 kernel</span><strong data-p95>—</strong></div>
      <div class="stat"><span>minimum</span><strong data-min>—</strong></div>
      <div class="stat"><span>LOD rejects</span><strong data-transitions>—</strong></div>
    </div>
    <div class="scope">40 measured frames · 1400 × 900 · one command buffer · one queue
      submission · persistent pipeline + color/depth history · zero intermediate frame readbacks</div>
  </aside>
  <section class="rail">
    <div class="residents">
      ${EXPECTED_RESIDENTS.map((name) => `<span class="name">${name}</span>`).join('')}
    </div>
    <div class="proof">
      <b>Exact scope: temporal resolve compute pass</b>
      <p>GPU timestamps only. Upload, query mapping, evidence readback, compositing, and
        screenshot capture are excluded. No whole-frame, Quest, or photorealism claim.</p>
    </div>
  </section>
</main>
<script>window.__H4E_CONFIG__=${safeInlineJson(config)};</script>
<script>${browserBundle}</script>
<script>${browserApplication()}</script>
</body>
</html>`;
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
      return;
    }
    if (request.url === '/favicon.ico') {
      response.writeHead(204, { 'cache-control': 'no-store' });
      response.end();
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
  assert(address && typeof address === 'object', 'H4E loopback server did not bind');
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
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  const page = await context.newPage();
  const exceptions = [];
  const requestedUrls = [];
  page.on('pageerror', (error) => exceptions.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') exceptions.push(message.text());
  });
  page.on('request', (request) => requestedUrls.push(request.url()));
  const screenshotPath = path.join(outputDir, 'h4e-zero-copy-temporal-frame-graph.png');
  try {
    await page.goto(`http://127.0.0.1:${address.port}/index.html`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await page.waitForFunction(() => window.__H4E__?.ready === true, null, {
      timeout: 240_000,
    });
    const state = await page.evaluate(() => JSON.parse(JSON.stringify(window.__H4E__)));
    assert(state.status === 'pass', `H4E browser failed: ${state.errors?.join('\n')}`);
    const validation = validateH4EBrowserState(state);
    assert(validation.status === 'pass', validation.errors.join('\n'));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
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
        width: WIDTH,
        height: HEIGHT,
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
      exceptions,
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
  if (!existsSync(manifestPath)) return { status: 'fail', errors: ['H4E manifest is missing'] };
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

export async function runCharacterRealismH4E(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validatePins(root, holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  const parsedFormats = parseContracts(root, holoScriptRoot);
  const inheritedHero = readFileSync(path.join(root, INHERITED_HERO_REL));
  const browserBundle = await bundleBrowserRuntime(holoScriptRoot);
  const html = buildHtml(
    {
      width: WIDTH,
      height: HEIGHT,
      warmupFrames: WARMUP_FRAMES,
      measuredFrames: MEASURED_FRAMES,
      stressSchedule: buildLodStressSchedule(),
      inheritedHeroDataUrl: `data:image/png;base64,${inheritedHero.toString('base64')}`,
    },
    browserBundle
  );
  const browserWitness = await runBrowserWitness({
    browserPath: resolveBrowser(options.browser),
    html,
    outputDir,
    holoScriptRoot,
  });
  const validation = validateH4EBrowserState(browserWitness.state);
  assert(validation.status === 'pass', validation.errors.join('\n'));
  const measuredDurations = browserWitness.state.measuredFrames.map(
    (frame) => frame.resolveDurationNanoseconds
  );
  const timingStatistics = computeTimingStatistics(measuredDurations);
  assert(
    canonicalJson(timingStatistics) === canonicalJson(browserWitness.state.timingStatistics),
    'browser and host timing statistics drifted'
  );
  const lodTransitions = browserWitness.state.stressFrames.filter(
    (frame) => frame.plan.invalidationReason === 'lod-change'
  );
  const receipt = {
    schema: 'hololand.model-village.character-realism-h4e-zero-copy-temporal-witness.v1',
    capturedAt: new Date().toISOString(),
    status: 'pass',
    milestone: 'MV_CHARACTER_REALISM_H4E_ZERO_COPY_TEMPORAL_FRAME_GRAPH',
    sourceAdmission: {
      holoScriptCommit: EXPECTED_COMMIT,
      sourceSha256: portableSha256(path.join(root, SOURCE_REL)),
      policySha256: portableSha256(path.join(root, POLICY_REL)),
      seedSha256: portableSha256(path.join(root, SEED_REL)),
      inheritedVisualPath: INHERITED_HERO_REL,
      inheritedVisualSha256: INHERITED_HERO_SHA256,
      residentNames: EXPECTED_RESIDENTS,
      parsedFormats,
      runtimeHashBindings: Object.fromEntries(HASH_BINDINGS),
    },
    browserWebgpuAdmission: {
      runtime: {
        temporalFrameGraph: 'HoloScript TemporalFrameGraph',
        convergenceController: 'HoloScript TemporalConvergenceController',
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
      outputDigest: browserWitness.state.outputDigest,
    },
    temporalFrameGraphAdmission: {
      width: WIDTH,
      height: HEIGHT,
      warmupFrameCount: browserWitness.state.warmupFrames.length,
      measuredFrameCount: browserWitness.state.measuredFrames.length,
      lodStressFrameCount: browserWitness.state.stressFrames.length,
      lodTransitionCount: lodTransitions.length,
      lodHistoryRejectedCount: lodTransitions.filter(
        (frame) => frame.receipt.historyConsumed === false
      ).length,
      persistentPipelineFrameCount: browserWitness.state.measuredFrames.filter(
        (frame) => frame.resolve.persistentPipelineConsumed === true
      ).length,
      zeroCopyMeasuredFrameCount: browserWitness.state.measuredFrames.filter(
        (frame) => frame.zeroCopyTextureInputs === true && frame.zeroCopyHistory === true
      ).length,
      singleCommandAndSubmissionFrameCount: browserWitness.state.measuredFrames.filter(
        (frame) => frame.commandBufferCount === 1 && frame.queueSubmissionCount === 1
      ).length,
      intermediateFrameReadbackCount: browserWitness.state.measuredFrames.reduce(
        (sum, frame) => sum + frame.intermediateFrameReadbackCount,
        0
      ),
      measuredFrameEvidenceReadbackCount: browserWitness.state.measuredFrames.reduce(
        (sum, frame) => sum + frame.evidenceFrameReadbackCount,
        0
      ),
      finalEvidenceReadbackCount: browserWitness.state.finalEvidence.evidenceFrameReadbackCount,
      sampleCount: 8,
      feedbackCeiling: 0.875,
      disocclusionDepthThreshold: 0.01,
    },
    gpuTimestampAdmission: {
      classification: 'gpu-timestamp-query',
      timedScope: 'temporal-resolve-compute-pass',
      timestampQuerySupported: true,
      timestampQueryEnabled: true,
      timestampMeasuredFrameCount: browserWitness.state.measuredFrames.filter(
        (frame) => frame.gpuTimestampMeasured === true
      ).length,
      readbackExcludedFromTimedScope: true,
      wallClockUsedAsGpuTime: false,
      statistics: timingStatistics,
      measuredDurationsNanoseconds: measuredDurations,
    },
    boundaries: {
      inheritedH4DVisualPlatePreserved: true,
      browserNativeWebgpuMeasured: true,
      zeroCopyTextureInputsMeasured: true,
      persistentGpuColorAndDepthHistoryMeasured: true,
      oneCommandBufferAndQueueSubmissionPerResolveMeasured: true,
      gpuTimestampQueryMeasured: true,
      exactTimedScope: 'temporal-resolve-compute-pass',
      uploadMeasured: false,
      timestampMappingMeasured: false,
      evidenceReadbackMeasured: false,
      screenshotCaptureMeasured: false,
      characterRasterMeasuredInThisBenchmark: false,
      motionRasterMeasuredInThisBenchmark: false,
      fullWorldPerformanceMeasured: false,
      generalRtxPerformanceClaimed: false,
      productionFrameTimeClaimed: false,
      wallClockUsedAsGpuTime: false,
      questHeadsetMeasured: false,
      browserWebxrMeasured: false,
      photorealismClaimed: false,
    },
  };
  receipt.integrity = { canonicalSha256: sha256(canonicalJson(receipt)) };
  if (options.writeArtifacts) {
    mkdirSync(path.dirname(path.join(root, HERO_REL)), { recursive: true });
    writeFileSync(path.join(root, HERO_REL), browserWitness.screenshot.png);
    writeFileSync(path.join(root, EVIDENCE_REL), `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (!options.skipManifest) {
    const manifest = validateManifest(root);
    assert(manifest.status === 'pass', manifest.errors.join('\n'));
  }
  return { receipt, screenshotPath: browserWitness.screenshot.path };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCharacterRealismH4E(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        const stats = receipt.gpuTimestampAdmission.statistics;
        console.log(
          `PASS H4E zero-copy temporal frame graph: ${stats.sampleCount} GPU timestamp frames; ` +
            `median ${(stats.median / 1e6).toFixed(3)} ms; p95 ${(stats.p95 / 1e6).toFixed(3)} ms; ` +
            `${receipt.temporalFrameGraphAdmission.lodHistoryRejectedCount}/` +
            `${receipt.temporalFrameGraphAdmission.lodTransitionCount} LOD histories rejected`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
