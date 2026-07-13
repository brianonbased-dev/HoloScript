#!/usr/bin/env node
/**
 * HoloGraph embodied navigation benchmark.
 *
 * This is intentionally a receipt harness, not a WebGPUCompiler feature patch:
 * it exercises the renderer-native projection contract from the HoloGraph
 * viewport runtime with a deterministic native software framebuffer. The
 * benchmark performs a multi-step navigation/edit/readback chain and records
 * exact HoloLlama endpoint/model metadata when a compatible endpoint is live.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const SCHEMA = 'holoscript.holograph-embodied-navigation-benchmark.v1';
const DEFAULT_OUT = resolve(ROOT, '.scratch', 'holograph-embodied-navigation-benchmark.json');
const DEFAULT_FRAME_DIR = resolve(ROOT, '.scratch', 'holograph-embodied-navigation-frames');
const DEFAULT_HOLOLLAMA_ENDPOINT =
  process.env.HOLOGRAPH_HOLOLLAMA_ENDPOINT ||
  process.env.HOLOLLAMA_ENDPOINT ||
  process.env.HOLOLLAMA_JETSON_ENDPOINT ||
  process.env.JETSON_HOLOLLAMA_ENDPOINT ||
  'http://192.168.0.119:18080';

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    out: DEFAULT_OUT,
    frameDir: DEFAULT_FRAME_DIR,
    holollamaEndpoint: DEFAULT_HOLOLLAMA_ENDPOINT,
    timeoutMs: 2500,
    json: false,
    requireHolollamaLive: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--out') {
      opts.out = resolve(next);
      i += 1;
    } else if (arg === '--frame-dir') {
      opts.frameDir = resolve(next);
      i += 1;
    } else if (arg === '--holollama-endpoint') {
      opts.holollamaEndpoint = String(next || '').replace(/\/+$/u, '');
      i += 1;
    } else if (arg === '--timeout-ms') {
      opts.timeoutMs = Number(next);
      i += 1;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--require-holollama-live') {
      opts.requireHolollamaLive = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number');
  }
  return opts;
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function round(value, places = 4) {
  const m = 10 ** places;
  return Math.round(value * m) / m;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function color(hex) {
  const v = Number.parseInt(String(hex).replace(/^#/u, ''), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a: 255 };
}

const EDGE_COLOR = color('#70707c');
const LABEL_COLOR = color('#f4f4f5');

function hueShift(c, degrees) {
  // Small deterministic hue-ish transform. Full HSV conversion is unnecessary
  // for the benchmark; the receipt only needs proof the visual state changed.
  const shift = ((degrees % 360) + 360) % 360;
  if (shift < 120) return { r: c.g, g: c.b, b: c.r, a: c.a };
  if (shift < 240) return { r: c.b, g: c.r, b: c.g, a: c.a };
  return { ...c };
}

export function buildBenchmarkScene() {
  return {
    canvas: { width: 256, height: 192 },
    camera: { centerWorld: { x: 0, y: 0 }, pixelsPerUnit: 18 },
    targetId: 'call:compile-to-webgpu',
    objects: [
      {
        id: 'module:core',
        name: '@holoscript/core',
        role: 'module',
        geometry: 'box',
        position: { x: -3.5, y: 2.3 },
        scale: { x: 1.4, y: 0.8 },
        color: color('#4cc9f0'),
        file: 'packages/core',
      },
      {
        id: 'call:compile-to-webgpu',
        name: 'compileToWebGPU',
        role: 'call',
        geometry: 'sphere',
        position: { x: 4.8, y: -2.7 },
        scale: { x: 1.0, y: 1.0 },
        color: color('#f72585'),
        file: 'packages/core/src/compiler/WebGPUCompiler.ts',
      },
      {
        id: 'import:holo-vm-renderer',
        name: 'NativeHoloRenderer',
        role: 'import',
        geometry: 'diamond',
        position: { x: 1.4, y: 2.8 },
        scale: { x: 1.1, y: 1.1 },
        color: color('#b9fbc0'),
        file: 'packages/holo-vm/src/render/native-renderer.ts',
      },
      {
        id: 'module:holollama',
        name: '@holoscript/holollama',
        role: 'module',
        geometry: 'box',
        position: { x: -4.6, y: -2.6 },
        scale: { x: 1.3, y: 0.9 },
        color: color('#fee440'),
        file: 'packages/holollama',
      },
      {
        id: 'structure:receipt',
        name: 'benchmark receipt',
        role: 'structure',
        geometry: 'box',
        position: { x: 0.2, y: -0.1 },
        scale: { x: 1.0, y: 0.7 },
        color: color('#9b5de5'),
        file: 'scripts/holo-ci',
      },
    ],
  };
}

function projectObject(object, camera, canvas) {
  const x = canvas.width / 2 + (object.position.x - camera.centerWorld.x) * camera.pixelsPerUnit;
  const y = canvas.height / 2 - (object.position.y - camera.centerWorld.y) * camera.pixelsPerUnit;
  return {
    x: round(x, 3),
    y: round(y, 3),
    inFrame: x >= 0 && y >= 0 && x < canvas.width && y < canvas.height,
    distanceToCenterPx: round(Math.hypot(x - canvas.width / 2, y - canvas.height / 2), 3),
  };
}

function visibleObjects(scene, state) {
  if (state.filter === 'all') return scene.objects;
  return scene.objects.filter((object) => object.role === state.filter);
}

function describeScene(scene, state) {
  const objects = visibleObjects(scene, state).map((object) => ({
    id: object.id,
    name: object.name,
    role: object.role,
    file: object.file,
    projection: projectObject(object, state.camera, scene.canvas),
  }));
  return {
    canonicalNames: {
      graphSurface: 'HoloGraph',
      embeddingTower: 'HoloEmbed',
      visionNavigator: 'HoloLlama',
    },
    projectionBridge: 'renderer-native',
    readbackMode: state.readbackMode,
    inspectorHidden: true,
    actionCount: state.actionCount,
    filter: state.filter,
    colorMode: state.colorMode,
    structureStyle: state.structureStyle,
    labelPolicy: state.labelPolicy,
    camera: {
      centerWorld: { ...state.camera.centerWorld },
      pixelsPerUnit: round(state.camera.pixelsPerUnit, 3),
    },
    objectCount: scene.objects.length,
    visibleObjects: objects.length,
    objects,
  };
}

function applyAction(scene, state, action) {
  const next = structuredClone(state);
  next.actionCount += 1;
  next.lastAction = action.type;
  let valid = true;
  let done = true;
  let reason = 'ok';

  if (action.type === 'focus_node') {
    const target = scene.objects.find((object) => object.id === action.id);
    if (!target) {
      valid = false;
      done = false;
      reason = 'target_not_found';
    } else {
      next.focusId = target.id;
      next.camera.centerWorld = { ...target.position };
    }
  } else if (action.type === 'zoom_in') {
    next.camera.pixelsPerUnit *= action.factor ?? 1.6;
  } else if (action.type === 'filter_call') {
    next.filter = 'call';
  } else if (action.type === 'filter_all') {
    next.filter = 'all';
  } else if (action.type === 'set_color_mode') {
    next.colorMode = action.mode || 'hue_by_role';
    next.hueShiftDegrees = action.hueShiftDegrees ?? 120;
  } else if (action.type === 'set_structure_style') {
    next.structureStyle = action.style || 'dependency-rings';
  } else if (action.type === 'set_label_policy') {
    next.labelPolicy = action.policy || 'target-first';
  } else if (action.type === 'screenshot_readback') {
    next.readbackMode = 'screenshot-only';
  } else {
    valid = false;
    done = false;
    reason = 'unknown_action';
  }

  return { state: next, valid, done, reason };
}

function makeFramebuffer(width, height, clear = { r: 18, g: 18, b: 22, a: 255 }) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clear.r;
    data[i + 1] = clear.g;
    data[i + 2] = clear.b;
    data[i + 3] = clear.a;
  }
  return { width, height, data, clear };
}

function drawRect(frame, cx, cy, halfW, halfH, c) {
  const x0 = clamp(Math.floor(cx - halfW), 0, frame.width - 1);
  const x1 = clamp(Math.ceil(cx + halfW), 0, frame.width - 1);
  const y0 = clamp(Math.floor(cy - halfH), 0, frame.height - 1);
  const y1 = clamp(Math.ceil(cy + halfH), 0, frame.height - 1);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * frame.width + x) * 4;
      frame.data[i] = c.r;
      frame.data[i + 1] = c.g;
      frame.data[i + 2] = c.b;
      frame.data[i + 3] = c.a;
    }
  }
}

function drawLine(frame, ax, ay, bx, by, c) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    drawRect(frame, x, y, 1, 1, c);
  }
}

function renderFrame(scene, state) {
  const frame = makeFramebuffer(scene.canvas.width, scene.canvas.height);
  const rendered = [];
  const objects = visibleObjects(scene, state);
  const projected = new Map();
  for (const object of objects) {
    projected.set(object.id, projectObject(object, state.camera, scene.canvas));
  }
  for (let index = 1; index < objects.length; index += 1) {
    const previous = projected.get(objects[index - 1].id);
    const current = projected.get(objects[index].id);
    if (!previous?.inFrame || !current?.inFrame) continue;
    drawLine(frame, previous.x, previous.y, current.x, current.y, EDGE_COLOR);
  }
  for (const object of objects) {
    const p = projectObject(object, state.camera, scene.canvas);
    if (!p.inFrame) continue;
    const base = state.colorMode === 'hue_by_role' ? hueShift(object.color, state.hueShiftDegrees) : object.color;
    const sizeBoost = state.structureStyle === 'dependency-rings' && object.id === state.focusId ? 1.4 : 1;
    drawRect(
      frame,
      p.x,
      p.y,
      Math.max(2, object.scale.x * state.camera.pixelsPerUnit * 0.28 * sizeBoost),
      Math.max(2, object.scale.y * state.camera.pixelsPerUnit * 0.28 * sizeBoost),
      base
    );
    rendered.push(object.id);
  }
  for (const object of objects) {
    const p = projected.get(object.id);
    if (!p?.inFrame) continue;
    const shouldDrawLabel =
      state.labelPolicy === 'all' ||
      (state.labelPolicy === 'target-first' && (object.id === scene.targetId || object.id === state.focusId));
    if (!shouldDrawLabel) continue;
    drawRect(frame, p.x + 18, p.y - 11, Math.max(8, object.name.length * 1.5), 3, LABEL_COLOR);
  }
  return { frame, rendered };
}

function sameColor(frame, i, c) {
  return frame.data[i] === c.r && frame.data[i + 1] === c.g && frame.data[i + 2] === c.b && frame.data[i + 3] === c.a;
}

function emptyCentroid() {
  return { x: null, y: null };
}

function centroidFrom(accumulator) {
  if (accumulator.count <= 0) return emptyCentroid();
  return {
    x: round(accumulator.x / accumulator.count, 3),
    y: round(accumulator.y / accumulator.count, 3),
  };
}

function distanceBetweenCentroids(a, b) {
  if (a.x === null || a.y === null || b.x === null || b.y === null) return null;
  return round(Math.hypot(a.x - b.x, a.y - b.y), 3);
}

function frameStats(renderedFrame) {
  const { frame, rendered } = renderedFrame;
  let nonblank = 0;
  let labelPixels = 0;
  let edgePixels = 0;
  let nodePixels = 0;
  const all = { x: 0, y: 0, count: 0 };
  const graphMass = { x: 0, y: 0, count: 0 };
  let hash = createHash('sha256');
  hash.update(frame.data);
  for (let i = 0; i < frame.data.length; i += 4) {
    if (sameColor(frame, i, frame.clear)) continue;
    const pixelIndex = i / 4;
    const x = pixelIndex % frame.width;
    const y = Math.floor(pixelIndex / frame.width);
    nonblank += 1;
    all.x += x;
    all.y += y;
    all.count += 1;
    const isLabel = sameColor(frame, i, LABEL_COLOR);
    const isEdge = sameColor(frame, i, EDGE_COLOR);
    if (isLabel) {
      labelPixels += 1;
    } else {
      if (isEdge) edgePixels += 1;
      else nodePixels += 1;
      graphMass.x += x;
      graphMass.y += y;
      graphMass.count += 1;
    }
  }
  const allCentroid = centroidFrom(all);
  const segmentedCentroid = centroidFrom(graphMass);
  return {
    sha256: `sha256:${hash.digest('hex')}`,
    nonblankPixels: nonblank,
    nonblankRatio: round(nonblank / (frame.width * frame.height), 6),
    visualOracle: {
      mode: 'segmented-node-edge-v1',
      allNonblankCentroid: allCentroid,
      segmentedGraphMassCentroid: segmentedCentroid,
      labelPixels,
      edgePixels,
      nodePixels,
      nodeEdgePixels: graphMass.count,
      labelExclusionRate: nonblank > 0 ? round(labelPixels / nonblank, 6) : 0,
      nodeEdgeSegmentationRate: nonblank > 0 ? round(graphMass.count / nonblank, 6) : 0,
      allVsSegmentedCentroidDeltaPx: distanceBetweenCentroids(allCentroid, segmentedCentroid),
    },
    renderedObjectIds: rendered,
    nonblank: nonblank > 0,
  };
}

function writePpm(file, frame) {
  const lines = [`P3`, `${frame.width} ${frame.height}`, '255'];
  for (let y = 0; y < frame.height; y += 1) {
    const row = [];
    for (let x = 0; x < frame.width; x += 1) {
      const i = (y * frame.width + x) * 4;
      row.push(`${frame.data[i]} ${frame.data[i + 1]} ${frame.data[i + 2]}`);
    }
    lines.push(row.join(' '));
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

async function fetchJson(url, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: response.ok, status: response.status, durationMs: Date.now() - startedAt, json };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeHoloLlamaMetadata(endpoint, timeoutMs, fetchImpl = fetch) {
  const origin = String(endpoint || '').replace(/\/+$/u, '');
  const modelsUrl = `${origin}/v1/models`;
  try {
    const models = await fetchJson(modelsUrl, timeoutMs, fetchImpl);
    const first = Array.isArray(models.json?.data) ? models.json.data[0] : null;
    return {
      endpoint: origin,
      endpointSha256: `sha256:${sha256(origin)}`,
      modelsUrl,
      reachable: Boolean(models.ok && first),
      status: models.status,
      durationMs: models.durationMs,
      model: first
        ? {
            id: first.id || first.model || 'unknown',
            ownedBy: first.owned_by || first.ownedBy || null,
            meta: first.meta || first.metadata || null,
          }
        : null,
      failure: first ? null : '/v1/models returned no model',
    };
  } catch (error) {
    return {
      endpoint: origin,
      endpointSha256: `sha256:${sha256(origin)}`,
      modelsUrl,
      reachable: false,
      status: null,
      durationMs: null,
      model: null,
      failure: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error),
    };
  }
}

export async function runBenchmark(options = {}) {
  const scene = buildBenchmarkScene();
  const frameDir = options.frameDir ?? DEFAULT_FRAME_DIR;
  const target = scene.objects.find((object) => object.id === scene.targetId);
  const actions = [
    { type: 'focus_node', id: scene.targetId },
    { type: 'zoom_in', factor: 1.7 },
    { type: 'set_color_mode', mode: 'hue_by_role', hueShiftDegrees: 120 },
    { type: 'set_structure_style', style: 'dependency-rings' },
    { type: 'filter_call' },
    { type: 'screenshot_readback' },
  ];
  let state = {
    camera: structuredClone(scene.camera),
    filter: 'all',
    colorMode: 'source',
    structureStyle: 'flat',
    labelPolicy: 'all',
    readbackMode: 'inspector-hidden',
    focusId: null,
    actionCount: 0,
    hueShiftDegrees: 0,
  };

  const initialProjection = projectObject(target, state.camera, scene.canvas);
  const steps = [];
  const frameReceipts = [];
  mkdirSync(frameDir, { recursive: true });

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const before = projectObject(target, state.camera, scene.canvas);
    const result = applyAction(scene, state, action);
    state = result.state;
    const after = projectObject(target, state.camera, scene.canvas);
    const renderedFrame = renderFrame(scene, state);
    const stats = frameStats(renderedFrame);
    const frameFile = resolve(frameDir, `step-${String(index + 1).padStart(2, '0')}-${action.type}.ppm`);
    writePpm(frameFile, renderedFrame.frame);
    frameReceipts.push({ action: action.type, file: frameFile, ...stats });
    steps.push({
      index: index + 1,
      action,
      valid: result.valid,
      done: result.done,
      reason: result.reason,
      projectionBridge: 'renderer-native',
      targetProjectionBefore: before,
      targetProjectionAfter: after,
      targetProjectionImprovementPx: round(before.distanceToCenterPx - after.distanceToCenterPx, 3),
      readbackMode: state.readbackMode,
      frame: stats,
      scene: describeScene(scene, state),
    });
  }

  const finalProjection = projectObject(target, state.camera, scene.canvas);
  const segmentedOracleFrames = frameReceipts.map((frame) => frame.visualOracle);
  const segmentedFrames = segmentedOracleFrames.filter((oracle) => oracle.nodeEdgePixels > 0);
  const segmentedDeltaFrames = segmentedOracleFrames.filter(
    (oracle) => (oracle.allVsSegmentedCentroidDeltaPx ?? 0) > 0
  );
  const segmentedPanDeltaPairs = [];
  for (let index = 1; index < segmentedOracleFrames.length; index += 1) {
    segmentedPanDeltaPairs.push(
      distanceBetweenCentroids(
        segmentedOracleFrames[index - 1].segmentedGraphMassCentroid,
        segmentedOracleFrames[index].segmentedGraphMassCentroid
      ) ?? 0
    );
  }
  const rates = {
    rendererNativeProjectionRate: round(
      steps.filter((step) => step.projectionBridge === 'renderer-native').length / steps.length,
      2
    ),
    validRate: round(steps.filter((step) => step.valid).length / steps.length, 2),
    actionRate: round(steps.length / actions.length, 2),
    doneRate: round(steps.filter((step) => step.done).length / steps.length, 2),
    nonblankFrameRate: round(frameReceipts.filter((frame) => frame.nonblank).length / frameReceipts.length, 2),
    nodeEdgeSegmentationRate: round(segmentedFrames.length / frameReceipts.length, 2),
    segmentedVisualDeltaRate: round(segmentedDeltaFrames.length / frameReceipts.length, 2),
    panCandidateSegmentedDeltaRate: round(
      segmentedPanDeltaPairs.filter((delta) => delta > 0).length / Math.max(1, segmentedPanDeltaPairs.length),
      2
    ),
  };
  const holollama = await probeHoloLlamaMetadata(
    options.holollamaEndpoint ?? DEFAULT_HOLOLLAMA_ENDPOINT,
    options.timeoutMs ?? 2500,
    options.fetchImpl ?? fetch
  );

  const ok =
    rates.rendererNativeProjectionRate === 1 &&
    rates.validRate === 1 &&
    rates.actionRate === 1 &&
    rates.doneRate === 1 &&
    rates.nonblankFrameRate === 1 &&
    finalProjection.distanceToCenterPx < initialProjection.distanceToCenterPx &&
    (!options.requireHolollamaLive || holollama.reachable);

  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    ok,
    benchmark: 'multi-step HoloGraph embodied navigation',
    receiptScope:
      'choose target, pan/zoom/focus, change hue/style/filter, re-render, screenshot-only readback',
    sovereignCompilerGuidance: 'W.GOLD.002: benchmark harness; no bridge compiler feature innovation',
    scene: {
      targetId: scene.targetId,
      objectCount: scene.objects.length,
      canvas: scene.canvas,
      sourceSha256: `sha256:${sha256(JSON.stringify(scene))}`,
    },
    holollama,
    rates,
    projection: {
      initial: initialProjection,
      final: finalProjection,
      totalTargetProjectionImprovementPx: round(
        initialProjection.distanceToCenterPx - finalProjection.distanceToCenterPx,
        3
      ),
    },
    segmentedVisualOracle: {
      mode: 'node-edge-pixels-excluding-label-blocks',
      frameCount: frameReceipts.length,
      finalGraphMassCentroid: segmentedOracleFrames.at(-1)?.segmentedGraphMassCentroid ?? emptyCentroid(),
      finalAllNonblankCentroid: segmentedOracleFrames.at(-1)?.allNonblankCentroid ?? emptyCentroid(),
      finalAllVsSegmentedCentroidDeltaPx:
        segmentedOracleFrames.at(-1)?.allVsSegmentedCentroidDeltaPx ?? null,
      averageLabelExclusionRate: round(
        segmentedOracleFrames.reduce((sum, oracle) => sum + oracle.labelExclusionRate, 0) /
          Math.max(1, segmentedOracleFrames.length),
        6
      ),
      averageNodeEdgeSegmentationRate: round(
        segmentedOracleFrames.reduce((sum, oracle) => sum + oracle.nodeEdgeSegmentationRate, 0) /
          Math.max(1, segmentedOracleFrames.length),
        6
      ),
      panCandidateSegmentedDeltaPx: segmentedPanDeltaPairs.map((delta) => round(delta, 3)),
      alignment: {
        cameraSpaceTargetProjection: finalProjection,
        segmentedGraphMassDistanceToViewportCenterPx: distanceBetweenCentroids(
          segmentedOracleFrames.at(-1)?.segmentedGraphMassCentroid ?? emptyCentroid(),
          { x: scene.canvas.width / 2, y: scene.canvas.height / 2 }
        ),
        holollamaMetadataAligned: Boolean(holollama.reachable && holollama.model?.id),
      },
    },
    readback: {
      mode: state.readbackMode,
      inspectorHidden: true,
      screenshotOnlyFrames: frameReceipts.length,
    },
    frames: frameReceipts,
    steps,
    failures: [
      ...(holollama.reachable ? [] : [`holollama_unreachable:${holollama.failure}`]),
      ...(rates.rendererNativeProjectionRate === 1 ? [] : ['renderer_native_projection_rate_below_1']),
      ...(rates.nonblankFrameRate === 1 ? [] : ['blank_frame_detected']),
      ...(rates.nodeEdgeSegmentationRate === 1 ? [] : ['node_edge_segmentation_rate_below_1']),
      ...(rates.segmentedVisualDeltaRate > 0 ? [] : ['segmented_visual_oracle_did_not_exclude_labels']),
      ...(finalProjection.distanceToCenterPx < initialProjection.distanceToCenterPx
        ? []
        : ['target_projection_did_not_improve']),
    ],
  };
}

async function main() {
  const options = parseArgs();
  const receipt = await runBenchmark(options);
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (options.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(
      `[holograph-navigation] ${receipt.ok ? 'PASS' : 'FAIL'} rendererNativeProjectionRate=${receipt.rates.rendererNativeProjectionRate.toFixed(2)} validRate=${receipt.rates.validRate.toFixed(2)} doneRate=${receipt.rates.doneRate.toFixed(2)} nonblankFrameRate=${receipt.rates.nonblankFrameRate.toFixed(2)} holollama=${receipt.holollama.model?.id || receipt.holollama.failure}`
    );
  }
  if (!receipt.ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[holograph-navigation] ${error.stack || error.message}`);
    process.exit(1);
  });
}
