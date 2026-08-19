#!/usr/bin/env node

// H4D compiles two H4C absolute-time resident states, renders them through the
// native Chrome/WebGPU character path, rasterizes real character motion and
// depth, and resolves history through HoloScript TemporalConvergence v2.
// Readback proves device execution; this witness does not claim GPU timing or
// a zero-copy production frame graph.

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
import { resolveHoloScriptRoot } from './lib/model-village-holoscript-root.mjs';
import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT = resolveHoloScriptRoot({
  gate: 'H4D',
  // Kept, not deleted: sibling gates derive their runner source by string-substituting
  // this file and assert on this exact literal, so removing it breaks their anchors.
  // The path does not exist, so the resolver tries it and falls through to a real tree.
  candidates: ['C:/Users/josep/Documents/GitHub/.holorepo-worktrees/h4d-character-temporal-convergence'],
});
const BASE_CHECKER_REL =
  'scripts/check-hololand-model-village-character-appearance-h3x.mjs';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4d-production-temporal-convergence.holo';
const POLICY_REL =
  'source/proofs/model-village-character-realism-h4d-production-temporal-convergence-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-realism-h4d-production-temporal-convergence-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-realism-h4d-production-temporal-convergence-manifest.holo';
const CHECKER_REL =
  'scripts/check-hololand-model-village-character-realism-h4d.mjs';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-realism-h4d.test.mjs';
const REPORT_REL =
  'docs/reports/model-village-character-realism-h4d-production-temporal-convergence-2026-07-30.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-realism-h4d-production-temporal-convergence-2026-07-30.png';
const EVIDENCE_REL =
  'docs/assets/model-village/model-village-character-realism-h4d-production-temporal-convergence-2026-07-30.json';
const OUTPUT_REL = '.tmp/hololand/model-village/character-realism-h4d';
const EXPECTED_COMMIT = '623b2bf3c6f4e7ba0fa4ed62ce20061796664c28';
const EXPECTED_RESIDENTS = ['OpenAI', 'Claude', 'Gemini', 'Grok'];
const FRAME_OFFSETS_SECONDS = [0, 0.84];
const HASH_BINDINGS = [
  [
    'packages/engine/src/character-render/CharacterMotionVectors.ts',
    'b21581f573f446a39bb4f95432b306280876d69ae3107a1475f9a15d2d95d570',
  ],
  [
    'packages/engine/src/rendering/webgpu/TemporalConvergence.ts',
    '944a9d0d89819771bd1f1b11e3c7e221b9bfec39a9edcd44ec2327f91749ab7e',
  ],
  [
    'packages/engine/src/rendering/webgpu/TemporalInputs.ts',
    '9800e1d05fcd05b1ac3f7c10855bb94fb216098a1481d9a9a9343a2d8855bb14',
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

/**
 * Make the H4C derived harness expose its internal source-compiled payload.
 * Source custody remains in the H4A/H4C `.holo` stack; H4D consumes it.
 */
export function deriveH4DHarnessSource(h4cHarnessSource) {
  const anchor = 'async function buildCompiledPayload(';
  assert(h4cHarnessSource.includes(anchor), 'H4C compiled-payload anchor drifted');
  return h4cHarnessSource.replace(anchor, 'export async function buildCompiledPayload(');
}

function parseH4DContracts(stack, root) {
  const rows = [
    [
      'H4D .holo',
      new stack.toolchain.HoloCompositionParser().parse(
        readFileSync(path.join(root, SOURCE_REL), 'utf8')
      ),
    ],
    [
      'H4D .hsplus',
      new stack.toolchain.HoloScriptPlusParser().parse(
        readFileSync(path.join(root, POLICY_REL), 'utf8')
      ),
    ],
    [
      'H4D .hs',
      new stack.toolchain.HoloScriptCodeParser().parse(
        readFileSync(path.join(root, SEED_REL), 'utf8')
      ),
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

async function materializeCompiledFrame({
  root,
  holoScriptRoot,
  outputDir,
  timeOffsetSeconds,
  parseContracts,
}) {
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
    `h4d-derived-payload-${String(timeOffsetSeconds).replace('.', '-')}.mjs`
  );
  writeFileSync(generatedPath, source);
  const harness = await import(`${pathToFileURL(generatedPath).href}?sha=${sha256(source)}`);
  const stack = await harness.parseH4AStack(root, holoScriptRoot, outputDir);
  try {
    const contractParse = parseContracts ? parseH4DContracts(stack, root) : null;
    const plan = stack.h4aContract?.objects || [];
    assert(plan.length === 4, 'H4D requires four source resident plans');
    const compiled = await harness.buildCompiledPayload(
      stack,
      plan,
      holoScriptRoot,
      outputDir
    );
    return {
      timeOffsetSeconds,
      payload: compiled.payload,
      compilerRecords: compiled.compilerRecords,
      contractParse,
    };
  } finally {
    stack.esbuild.stop?.();
  }
}

function wgslRawPlugin() {
  return {
    name: 'h4d-wgsl-raw',
    setup(build) {
      build.onResolve({ filter: /\.wgsl/ }, (args) => ({
        path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/u, '')),
        namespace: 'h4d-wgsl-raw',
      }));
      build.onLoad({ filter: /.*/, namespace: 'h4d-wgsl-raw' }, (args) => ({
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
        import { renderCharacter } from './packages/engine/src/character-render/character-render.ts';
        import {
          deriveCharacterMotionVectorFrame,
          rasterizeCharacterMotionVectorsGPU,
        } from './packages/engine/src/character-render/CharacterMotionVectors.ts';
        import {
          TemporalConvergenceController,
          resolveTemporalFrameGPU,
        } from './packages/engine/src/rendering/webgpu/TemporalConvergence.ts';
        window.__H4D_RUNTIME__ = {
          renderCharacter,
          deriveCharacterMotionVectorFrame,
          rasterizeCharacterMotionVectorsGPU,
          TemporalConvergenceController,
          resolveTemporalFrameGPU,
        };
      `,
      resolveDir: holoScriptRoot,
      sourcefile: 'h4d-browser-runtime.entry.ts',
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
  assert(result.outputFiles?.length === 1, 'H4D browser runtime bundle was not emitted');
  esbuild.stop?.();
  return result.outputFiles[0].text;
}

export function buildReactiveMask(motionVectors) {
  const data = new Float32Array(motionVectors.width * motionVectors.height);
  for (let pixel = 0; pixel < data.length; pixel += 1) {
    const x = motionVectors.data[pixel * 2] || 0;
    const y = motionVectors.data[pixel * 2 + 1] || 0;
    data[pixel] = Math.min(0.35, Math.hypot(x, y) / 16);
  }
  return data;
}

export function validateH4DBrowserState(state) {
  const errors = [];
  if (
    state?.status !== 'pass' ||
    state?.gpu?.navigatorGpu !== true ||
    state?.gpu?.adapterAcquired !== true ||
    state?.gpu?.deviceCreated !== true
  ) {
    errors.push('browser WebGPU device admission failed');
  }
  if (state?.residents?.length !== 4) errors.push('exactly four residents are required');
  for (const resident of state?.residents || []) {
    const label = resident.displayLabel || 'unknown resident';
    if (
      resident.rasterReceipt?.deviceExecutionMeasured !== true ||
      resident.rasterReceipt?.movingPixelCount <= 0 ||
      resident.rasterReceipt?.motionVectorSpace !== 'current-minus-previous-pixels'
    ) {
      errors.push(`${label}: native motion raster receipt failed`);
    }
    if (
      resident.temporalReceipt?.deviceExecutionMeasured !== true ||
      resident.temporalReceipt?.motionVectorsConsumed !== true ||
      resident.temporalReceipt?.neighborhoodClamping !== true ||
      resident.temporalReceipt?.disocclusionInputConsumed !== true ||
      resident.temporalReceipt?.reactiveMaskConsumed !== true
    ) {
      errors.push(`${label}: temporal input consumption failed`);
    }
    if (
      resident.rasterReceipt?.gpuTimestampMeasured !== false ||
      resident.temporalReceipt?.gpuTimestampMeasured !== false
    ) {
      errors.push(`${label}: GPU timing boundary drifted`);
    }
    if (resident.controllerReceipt?.motionVectorResidentFramesAdmitted !== 1) {
      errors.push(`${label}: resident motion was not admitted through vectors`);
    }
    if (resident.resolvedDifference?.changedPixelCount <= 0) {
      errors.push(`${label}: accumulated result did not differ from the current frame`);
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function safeInlineJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
}

function browserApplication() {
  return String.raw`
(() => {
  const payload = window.__H4D_PAYLOAD__;
  const runtime = window.__H4D_RUNTIME__;
  const state = {
    schema: 'hololand.model-village.character-realism-h4d-browser-state.v1',
    ready: false,
    status: 'booting',
    gpu: null,
    residents: [],
    errors: [],
  };
  window.__H4D__ = state;

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

  const gridDigest = async (grid) => {
    const bytes = new Uint8Array(grid.data.buffer, grid.data.byteOffset, grid.data.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');
  };

  const imageDifference = (first, second) => {
    let changedPixelCount = 0;
    let absoluteChannelDifference = 0;
    for (let index = 0; index < first.data.length; index += 4) {
      const difference =
        Math.abs(first.data[index] - second.data[index]) +
        Math.abs(first.data[index + 1] - second.data[index + 1]) +
        Math.abs(first.data[index + 2] - second.data[index + 2]);
      absoluteChannelDifference += difference;
      if (difference > 0) changedPixelCount += 1;
    }
    return { changedPixelCount, absoluteChannelDifference };
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

  const reactiveMask = (motionVectors) => {
    const data = new Float32Array(motionVectors.width * motionVectors.height);
    for (let pixel = 0; pixel < data.length; pixel += 1) {
      const x = motionVectors.data[pixel * 2] || 0;
      const y = motionVectors.data[pixel * 2 + 1] || 0;
      data[pixel] = Math.min(0.35, Math.hypot(x, y) / 16);
    }
    return { width: motionVectors.width, height: motionVectors.height, data };
  };

  const renderOptions = (frame, resident) => ({
    size: frame.renderSize,
    viewProj: new Float32Array(resident.viewProj),
    cameraPos: frame.camera,
    clear: frame.clear,
    heightScale: resident.heightScale,
    environmentLight: resident.environmentLight,
  });

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
      adapterFeatures: Array.from(adapter.features || []).sort(),
      timestampQuerySupported: adapter.features?.has?.('timestamp-query') === true,
    };

    for (let index = 0; index < payload.current.residents.length; index += 1) {
      const currentResident = payload.current.residents[index];
      const previousResident = payload.previous.residents[index];
      if (currentResident.displayLabel !== previousResident.displayLabel) {
        throw new Error('resident order drifted between frames');
      }
      const label = currentResident.displayLabel;
      const previousSpec = hydrateSpec(previousResident.spec, 'h4d-' + label + '-previous');
      const currentSpec = hydrateSpec(currentResident.spec, 'h4d-' + label + '-current');
      const previousViewProjection = new Float32Array(previousResident.viewProj);
      const currentViewProjection = new Float32Array(currentResident.viewProj);
      const previousGrid = await runtime.renderCharacter(
        device,
        previousSpec,
        renderOptions(payload.previous, previousResident)
      );
      const currentGrid = await runtime.renderCharacter(
        device,
        currentSpec,
        renderOptions(payload.current, currentResident)
      );
      const previousMotionFrame = runtime.deriveCharacterMotionVectorFrame(
        previousSpec,
        previousSpec,
        {
          width: payload.current.renderSize,
          height: payload.current.renderSize,
          currentViewProjection: previousViewProjection,
          previousViewProjection,
        }
      );
      const currentMotionFrame = runtime.deriveCharacterMotionVectorFrame(
        currentSpec,
        previousSpec,
        {
          width: payload.current.renderSize,
          height: payload.current.renderSize,
          currentViewProjection,
          previousViewProjection,
        }
      );
      const previousRaster = await runtime.rasterizeCharacterMotionVectorsGPU(
        device,
        previousMotionFrame,
        previousSpec.mesh.indices
      );
      const currentRaster = await runtime.rasterizeCharacterMotionVectorsGPU(
        device,
        currentMotionFrame,
        currentSpec.mesh.indices
      );
      const controller = runtime.TemporalConvergenceController.fromProfile('browser-balanced');
      controller.beginFrame({
        cameraStateId: 'stormglass-h4d-camera',
        residentStateId: label + '-previous',
        lodLevel: 0,
        motionVectorsAvailable: false,
      });
      const framePlan = controller.beginFrame({
        cameraStateId: 'stormglass-h4d-camera',
        residentStateId: label + '-current',
        lodLevel: 0,
        motionVectorsAvailable: true,
      });
      const mask = reactiveMask(currentRaster.motionVectors);
      const resolved = await runtime.resolveTemporalFrameGPU(
        device,
        currentGrid,
        previousGrid,
        {
          feedback: framePlan.feedback,
          historyValid: framePlan.historyValid,
          motionVectors: currentRaster.motionVectors,
          currentDepth: currentRaster.depth,
          historyDepth: previousRaster.depth,
          reactiveMask: mask,
          disocclusionDepthThreshold: 0.01,
        }
      );
      const resolvedDifference = imageDifference(currentGrid, resolved.pixels);
      const sourceDifference = imageDifference(previousGrid, currentGrid);
      const controllerReceipt = controller.getReceipt();
      if (currentRaster.receipt.movingPixelCount <= 0) {
        throw new Error(label + ' produced no rasterized motion');
      }
      if (!resolved.receipt.motionVectorsConsumed || !resolved.receipt.disocclusionInputConsumed) {
        throw new Error(label + ' temporal inputs were not consumed');
      }
      if (resolvedDifference.changedPixelCount <= 0) {
        throw new Error(label + ' temporal history produced no accumulated delta');
      }
      drawGrid(
        document.querySelector('[data-resident="' + label + '"]'),
        resolved.pixels
      );
      document.querySelector('[data-metrics="' + label + '"]').textContent =
        currentRaster.receipt.movingPixelCount.toLocaleString() +
        ' moving px  /  ' +
        resolvedDifference.changedPixelCount.toLocaleString() +
        ' accumulated px';
      state.residents.push({
        displayLabel: label,
        previousDigest: await gridDigest(previousGrid),
        currentDigest: await gridDigest(currentGrid),
        resolvedDigest: await gridDigest(resolved.pixels),
        sourceDifference,
        resolvedDifference,
        motionFrameReceipt: currentMotionFrame.receipt,
        rasterReceipt: currentRaster.receipt,
        temporalReceipt: resolved.receipt,
        framePlan,
        controllerReceipt,
      });
    }
    state.status = 'pass';
    state.ready = true;
    document.body.dataset.ready = 'true';
    document.querySelector('[data-status]').textContent =
      'Motion-reprojected Chrome WebGPU history complete';
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
        <div class="portrait">
          <canvas data-resident="${name}" width="256" height="256"></canvas>
          <span class="history">HISTORY 0${index + 1}</span>
        </div>
        <div class="copy">
          <span class="family">model-family resident</span>
          <h2>${name}</h2>
          <p>Native gaze + breath, now carried through motion-aware history.</p>
          <small data-metrics="${name}">Awaiting velocity and resolve receipts</small>
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
<title>Stormglass H4D Temporal Convergence</title>
<style>
  :root { color-scheme:dark; --ink:#f4eadb; --muted:#91a8aa; --line:#29434a; }
  * { box-sizing:border-box; }
  body { margin:0; width:1400px; height:900px; overflow:hidden; color:var(--ink);
    background:
      radial-gradient(circle at 11% 7%,rgba(67,169,151,.19),transparent 34%),
      radial-gradient(circle at 91% 14%,rgba(206,119,76,.16),transparent 30%),
      linear-gradient(140deg,#02070c 0%,#08171b 53%,#04090e 100%);
    font-family:Segoe UI,Arial,sans-serif; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.2;
    background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
      linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
    background-size:44px 44px; }
  .shell { width:1400px; height:900px; padding:34px 48px 25px; position:relative; }
  header { display:grid; grid-template-columns:1fr 455px; align-items:end; gap:58px;
    border-bottom:1px solid var(--line); padding-bottom:18px; }
  .kicker { color:#79d8c6; text-transform:uppercase; letter-spacing:.22em;
    font:650 11px/1.2 ui-monospace,Consolas,monospace; }
  h1 { margin:8px 0 0; font:500 48px/.98 Georgia,serif; letter-spacing:-.04em; }
  .lede { color:var(--muted); font-size:14px; line-height:1.55; margin:0; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px; }
  .resident { height:294px; position:relative; display:grid; grid-template-columns:306px 1fr;
    background:linear-gradient(135deg,rgba(15,31,36,.96),rgba(5,13,19,.93));
    border:1px solid var(--line); border-radius:18px; overflow:hidden;
    box-shadow:0 25px 70px rgba(0,0,0,.24); }
  .resident-1 { --accent:#6bdbc5; }.resident-2 { --accent:#dfa06f; }
  .resident-3 { --accent:#879eff; }.resident-4 { --accent:#68d8e6; }
  .resident::after { content:""; position:absolute; inset:0; pointer-events:none;
    box-shadow:inset 4px 0 0 var(--accent); opacity:.95; }
  .portrait { position:relative; width:294px; height:294px; margin-left:4px;
    background:radial-gradient(circle at 50% 30%,#18333a,#030912 72%); }
  canvas { width:294px; height:294px; image-rendering:auto; }
  .history { position:absolute; left:18px; bottom:16px; padding:7px 10px;
    border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);
    background:rgba(3,10,14,.78); color:var(--accent); border-radius:999px;
    font:700 8px/1 ui-monospace,Consolas,monospace; letter-spacing:.14em; }
  .copy { padding:65px 22px 16px; }
  .family { color:var(--accent); text-transform:uppercase; letter-spacing:.14em;
    font:700 8px/1.3 ui-monospace,Consolas,monospace; }
  .copy h2 { margin:11px 0 8px; font:500 34px/1 Georgia,serif; }
  .copy p { color:#c4cfca; font-size:11px; line-height:1.5; margin:0 0 17px; }
  .copy small { display:block; color:var(--muted); font:9px/1.4 ui-monospace,Consolas,monospace; }
  footer { margin-top:15px; display:flex; justify-content:space-between; align-items:center;
    color:var(--muted); font:10px/1.4 ui-monospace,Consolas,monospace; }
  [data-status] { color:#9de3d4; }
  .proof { color:#d3aa7e; }
</style>
</head>
<body>
<main class="shell">
  <header>
    <div>
      <div class="kicker">Stormglass Commons / H4D</div>
      <h1>History learns<br>how they move.</h1>
    </div>
    <p class="lede">Four source-authored model-family residents, rendered through native
      Chrome WebGPU. Character velocity now reprojects prior color, rejects depth
      discontinuities, clamps neighborhoods, and yields to reactive motion.</p>
  </header>
  <section class="grid">${residentCards()}</section>
  <footer>
    <span data-status>Compiling resident history</span>
    <span class="proof">.HOLO SOURCE / MOTION + DEPTH / TEMPORAL RESOLVE v2</span>
    <span>readback witness / no GPU timing claim</span>
  </footer>
</main>
<script>window.__H4D_PAYLOAD__=${safeInlineJson(payload)};</script>
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
  assert(address && typeof address === 'object', 'H4D loopback server did not bind');
  const playwright = await loadPlaywright(holoScriptRoot);
  const launchArgs = [
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    '--enable-unsafe-webgpu',
    '--disable-background-networking',
    '--disable-features=Translate,MediaRouter',
  ];
  const browser = await playwright.chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: launchArgs,
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const exceptions = [];
  const requestedUrls = [];
  page.on('pageerror', (error) => exceptions.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') exceptions.push(message.text());
  });
  page.on('request', (request) => requestedUrls.push(request.url()));
  const screenshotPath = path.join(outputDir, 'h4d-production-temporal-convergence.png');
  try {
    await page.goto(`http://127.0.0.1:${address.port}/index.html`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await page.waitForFunction(() => window.__H4D__?.ready === true, null, {
      timeout: 180_000,
    });
    const state = await page.evaluate(() => JSON.parse(JSON.stringify(window.__H4D__)));
    assert(state.status === 'pass', `H4D browser failed: ${state.errors?.join('\n')}`);
    const validation = validateH4DBrowserState(state);
    assert(validation.status === 'pass', validation.errors.join('\n'));
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
        width: 1400,
        height: 900,
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
  if (!existsSync(manifestPath)) return { status: 'fail', errors: ['H4D manifest is missing'] };
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

export async function runCharacterRealismH4D(options = {}) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT);
  const outputDir = path.resolve(options.outputDir || path.join(root, OUTPUT_REL));
  const pinErrors = validatePins(holoScriptRoot);
  assert(pinErrors.length === 0, pinErrors.join('\n'));
  const compiledFrames = [];
  for (let frameIndex = 0; frameIndex < FRAME_OFFSETS_SECONDS.length; frameIndex += 1) {
    compiledFrames.push(
      await materializeCompiledFrame({
        root,
        holoScriptRoot,
        outputDir: path.join(outputDir, `frame-${frameIndex}`),
        timeOffsetSeconds: FRAME_OFFSETS_SECONDS[frameIndex],
        parseContracts: frameIndex === 0,
      })
    );
  }
  const [previous, current] = compiledFrames;
  assert(previous.payload.residents.length === 4, 'previous H4D frame resident count drifted');
  assert(current.payload.residents.length === 4, 'current H4D frame resident count drifted');
  const browserBundle = await bundleBrowserRuntime(holoScriptRoot);
  const html = buildHtml(
    { previous: previous.payload, current: current.payload },
    browserBundle
  );
  const browserWitness = await runBrowserWitness({
    browserPath: resolveBrowser(options.browser),
    html,
    outputDir,
    holoScriptRoot,
  });
  const stateValidation = validateH4DBrowserState(browserWitness.state);
  assert(stateValidation.status === 'pass', stateValidation.errors.join('\n'));
  const receipt = {
    schema: 'hololand.model-village.character-realism-h4d-production-temporal-witness.v1',
    capturedAt: new Date().toISOString(),
    status: 'pass',
    milestone: 'MV_CHARACTER_REALISM_H4D_PRODUCTION_TEMPORAL_CONVERGENCE',
    sourceAdmission: {
      holoScriptCommit: EXPECTED_COMMIT,
      sourceSha256: portableSha256(path.join(root, SOURCE_REL)),
      policySha256: portableSha256(path.join(root, POLICY_REL)),
      seedSha256: portableSha256(path.join(root, SEED_REL)),
      residentNames: EXPECTED_RESIDENTS,
      measuredFrameOffsetsSeconds: FRAME_OFFSETS_SECONDS,
      parsedFormats: previous.contractParse,
    },
    compilerAdmission: {
      target: 'character-webgpu',
      sourceCompiledStateCount:
        previous.compilerRecords.length + current.compilerRecords.length,
      residentCount: current.compilerRecords.length,
      previousRecords: previous.compilerRecords,
      currentRecords: current.compilerRecords,
    },
    browserWebgpuAdmission: {
      runtime: {
        characterRenderer: 'HoloScript CharacterRender.renderCharacter',
        motionDeriver: 'HoloScript deriveCharacterMotionVectorFrame',
        motionRasterizer: 'HoloScript rasterizeCharacterMotionVectorsGPU',
        temporalResolver: 'HoloScript resolveTemporalFrameGPU',
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
    temporalAdmission: {
      profile: 'browser-balanced',
      sampleCount: 8,
      feedbackCeiling: 0.875,
      motionVectorSpace: 'current-minus-previous-pixels',
      disocclusionDepthThreshold: 0.01,
      motionVectorFrameReceiptCount: browserWitness.state.residents.length,
      gpuMotionRasterReceiptCount: browserWitness.state.residents.length,
      gpuTemporalResolveReceiptCount: browserWitness.state.residents.length,
      motionReprojectedResidentCount: browserWitness.state.residents.filter(
        (resident) => resident.temporalReceipt.motionVectorsConsumed === true
      ).length,
      depthDisocclusionInputCount: browserWitness.state.residents.filter(
        (resident) => resident.temporalReceipt.disocclusionInputConsumed === true
      ).length,
      reactiveMaskInputCount: browserWitness.state.residents.filter(
        (resident) => resident.temporalReceipt.reactiveMaskConsumed === true
      ).length,
      minimumMovingPixelCount: Math.min(
        ...browserWitness.state.residents.map(
          (resident) => resident.rasterReceipt.movingPixelCount
        )
      ),
      minimumAccumulatedChangedPixelCount: Math.min(
        ...browserWitness.state.residents.map(
          (resident) => resident.resolvedDifference.changedPixelCount
        )
      ),
    },
    gpuTimingAdmission: {
      timestampQuerySupported:
        browserWitness.state.gpu.timestampQuerySupported === true,
      adapterFeatures: browserWitness.state.gpu.adapterFeatures || [],
      gpuTimestampMeasured: false,
      wallClockUsedAsGpuTime: false,
      reason: 'H4D proves WebGPU execution by readback; timestamp queries are not integrated',
    },
    boundaries: {
      inheritedH4CAppearanceAndNativePresencePreserved: true,
      browserNativeWebgpuMeasured: true,
      sourceCompiledPreviousAndCurrentStates: true,
      productionTemporalEntrypointsIntegrated: true,
      motionVectorsIntegrated: true,
      depthDisocclusionIntegrated: true,
      neighborhoodClampingIntegrated: true,
      reactiveMaskIntegrated: true,
      readbackBackedVerification: true,
      zeroCopyFrameGraphMeasured: false,
      productionFrameTimeMeasured: false,
      gpuTimestampMeasured: false,
      wallClockUsedAsGpuTime: false,
      freshRtxBenchmarkClaimed: false,
      questHeadsetMeasured: false,
      browserWebxrMeasured: false,
      photorealismClaimed: false,
      fullWorldPerformanceClaimed: false,
      nativeClothSimulationApplied: false,
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
  runCharacterRealismH4D(parseArgs())
    .then(({ receipt }) => {
      if (process.argv.includes('--json')) console.log(JSON.stringify(receipt, null, 2));
      else {
        console.log(
          `PASS H4D temporal convergence: ${receipt.temporalAdmission.motionReprojectedResidentCount} residents; ` +
            `${receipt.temporalAdmission.minimumMovingPixelCount} min moving px; ` +
            `GPU timestamp=${receipt.gpuTimingAdmission.gpuTimestampMeasured}`
        );
      }
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
