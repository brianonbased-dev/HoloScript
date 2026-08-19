#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  encodePng,
  objectProperties,
  sha256,
  validateNeutralSource,
} from './check-hololand-model-village-resident-rig.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-resident-production-body.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-resident-production-body-manifest.holo';
const ASSET_RELS = [0, 1, 2].map(
  (level) =>
    `assets/model-village/residents/stormglass-neutral-production-body-lod${level}.character.json`
);
const HERO_REL =
  'docs/assets/model-village/model-village-neutral-production-body-hero-2026-07-26.png';
const MOTION_REL =
  'docs/assets/model-village/model-village-neutral-production-body-continuous-motion-2026-07-26.png';
const LOD_REL =
  'docs/assets/model-village/model-village-neutral-production-body-lods-2026-07-26.png';
const DEFAULT_OUTPUT_REL = '.tmp/hololand/model-village/production-body-witness';
const ENTITY_ID = 'model-village-shared-neutral-production-body';
const REQUIRED_CLIPS = Object.freeze({
  idle: 'neutral_fallback_no_action_receipt',
  listen: 'verified_observation_or_turn_receipt',
  propose: 'verified_proposal_or_admitted_action_receipt',
  settle: 'verified_action_or_public_state_receipt',
});
const REQUIRED_LODS = Object.freeze([
  { level: 0, distance: 0, garmentSegments: 24 },
  { level: 1, distance: 12, garmentSegments: 14 },
  { level: 2, distance: 28, garmentSegments: 8 },
]);
const REQUIRED_MODELS = Object.freeze(['skin-sss', 'woven-cloth', 'lambert']);
const SAMPLE_TIMES = Object.freeze([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
const SHEET_TIMES = Object.freeze([0.125, 0.5, 0.875]);
const CLEAR = Object.freeze([0.02, 0.04, 0.07, 1]);
const LIGHT = Object.freeze([0.38, 0.84, 0.42]);
const CAMERA = Object.freeze([0, 1.05, 6]);
const RENDER_SIZE = 320;
const FRAME_HEIGHT_SCALE = 1.25;

function parseArgs(argv) {
  const args = {
    holoscriptRoot: process.env.HOLOSCRIPT_ROOT ?? 'C:/Users/josep/Documents/GitHub/HoloScript',
    outputDir: path.join(REPO_ROOT, DEFAULT_OUTPUT_REL),
    writeArtifacts: false,
    skipManifest: false,
    skipGpu: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--holoscript-root') args.holoscriptRoot = argv[++index];
    else if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index]);
    else if (arg === '--write-artifacts') args.writeArtifacts = true;
    else if (arg === '--skip-manifest') args.skipManifest = true;
    else if (arg === '--skip-gpu') args.skipGpu = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-production-body.mjs [options]

Options:
  --holoscript-root <path>  HoloScript checkout containing built core/engine packages
  --output-dir <path>       Runtime receipt directory
  --write-artifacts         Refresh committed LOD bundles and native GPU witnesses
  --skip-manifest           Bootstrap mode before the hash-pinned manifest exists
  --skip-gpu                Validate source/compiler/LOD/motion data only
  --json                    Emit the receipt as JSON`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asQuaternion(rotation, skinMath) {
  return skinMath.quatFromAxisAngle(
    rotation.axis[0],
    rotation.axis[1],
    rotation.axis[2],
    (rotation.degrees * Math.PI) / 180
  );
}

function nlerpQuaternion(left, right, amount) {
  let rx = right.x;
  let ry = right.y;
  let rz = right.z;
  let rw = right.w;
  if (left.x * rx + left.y * ry + left.z * rz + left.w * rw < 0) {
    rx = -rx;
    ry = -ry;
    rz = -rz;
    rw = -rw;
  }
  const x = left.x + (rx - left.x) * amount;
  const y = left.y + (ry - left.y) * amount;
  const z = left.z + (rz - left.z) * amount;
  const w = left.w + (rw - left.w) * amount;
  const length = Math.hypot(x, y, z, w) || 1;
  return { x: x / length, y: y / length, z: z / length, w: w / length };
}

const smoothstep = (value) => value * value * (3 - 2 * value);

export function validateContinuousClips(ast, boneOrder) {
  const boneSet = new Set(boneOrder);
  const clips = (ast.objects ?? [])
    .map((object) => ({ object, props: objectProperties(object) }))
    .filter(({ props }) => props.type === 'model_village_semantic_clip');
  assert(clips.length === 4, `Expected exactly four semantic clips, found ${clips.length}`);

  const seen = new Set();
  const validated = clips.map(({ object, props }) => {
    const { clipId, frames, interpolation, receiptRequirement } = props;
    assert(Object.hasOwn(REQUIRED_CLIPS, clipId), `Unexpected semantic clip '${clipId}'`);
    assert(!seen.has(clipId), `Duplicate semantic clip '${clipId}'`);
    seen.add(clipId);
    assert(
      receiptRequirement === REQUIRED_CLIPS[clipId],
      `${clipId} must require '${REQUIRED_CLIPS[clipId]}'`
    );
    assert(
      interpolation === 'quaternion_nlerp_smoothstep',
      `${clipId} must author quaternion_nlerp_smoothstep`
    );
    assert(Array.isArray(frames) && frames.length === 3, `${clipId} must author three keyframes`);
    assert(
      frames[0].normalizedTime === 0 && frames[2].normalizedTime === 1,
      `${clipId} must span normalized time 0..1`
    );
    assert(
      frames[1].normalizedTime > 0 && frames[1].normalizedTime < 1,
      `${clipId} middle keyframe must be internal`
    );
    assert(
      frames[1].easing === 'smoothstep' && frames[2].easing === 'smoothstep',
      `${clipId} arriving segments must author smoothstep easing`
    );
    for (const [frameIndex, frame] of frames.entries()) {
      const used = new Set();
      assert(
        Array.isArray(frame.rotations) && frame.rotations.length > 0,
        `${clipId} frame ${frameIndex} has no rotations`
      );
      for (const rotation of frame.rotations) {
        assert(boneSet.has(rotation.bone), `${clipId} references unknown bone '${rotation.bone}'`);
        assert(!used.has(rotation.bone), `${clipId} repeats bone '${rotation.bone}'`);
        used.add(rotation.bone);
        assert(
          Array.isArray(rotation.axis) &&
            rotation.axis.length === 3 &&
            rotation.axis.every(Number.isFinite) &&
            Math.abs(Math.hypot(...rotation.axis) - 1) < 1e-6,
          `${clipId} ${rotation.bone} axis must be a finite unit vector`
        );
        assert(
          Number.isFinite(rotation.degrees) && Math.abs(rotation.degrees) <= 120,
          `${clipId} ${rotation.bone} exceeds the +/-120 degree gate`
        );
      }
    }
    return {
      clipId,
      objectName: object.name,
      durationSeconds: props.durationSeconds,
      loop: props.loop,
      receiptRequirement,
      frames,
      authoredClipHash: sha256(JSON.stringify(frames)),
    };
  });
  return validated.sort(
    (left, right) =>
      Object.keys(REQUIRED_CLIPS).indexOf(left.clipId) -
      Object.keys(REQUIRED_CLIPS).indexOf(right.clipId)
  );
}

export function sampleContinuousClip(clip, normalizedTime, skinMath) {
  const time = Math.max(0, Math.min(1, normalizedTime));
  const upperIndex = clip.frames.findIndex((frame) => frame.normalizedTime >= time);
  if (upperIndex <= 0) {
    return new Map(
      clip.frames[0].rotations.map((rotation) => [rotation.bone, asQuaternion(rotation, skinMath)])
    );
  }
  const rightFrame = clip.frames[upperIndex];
  const leftFrame = clip.frames[upperIndex - 1];
  const span = rightFrame.normalizedTime - leftFrame.normalizedTime;
  const amount = smoothstep(span > 0 ? (time - leftFrame.normalizedTime) / span : 0);
  const left = new Map(
    leftFrame.rotations.map((rotation) => [rotation.bone, asQuaternion(rotation, skinMath)])
  );
  const right = new Map(
    rightFrame.rotations.map((rotation) => [rotation.bone, asQuaternion(rotation, skinMath)])
  );
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  return new Map(
    [...new Set([...left.keys(), ...right.keys()])].map((bone) => [
      bone,
      nlerpQuaternion(left.get(bone) ?? identity, right.get(bone) ?? identity, amount),
    ])
  );
}

export function validateLodBundles(bundles) {
  assert(bundles.length === 3, `Expected three LOD bundles, found ${bundles.length}`);
  const summaries = bundles.map((bundle, index) => {
    const required = REQUIRED_LODS[index];
    assert(bundle.format === 'character-webgpu/drawspec', `LOD${index} has bad format`);
    assert(bundle.version === 1, `LOD${index} has bad version`);
    assert(bundle.lod?.level === required.level, `LOD${index} level metadata is stale`);
    assert(bundle.lod?.distance === required.distance, `LOD${index} distance metadata is stale`);
    assert(
      bundle.lod?.garmentSegments === required.garmentSegments,
      `LOD${index} garment topology metadata is stale`
    );
    const models = (bundle.materialGroups ?? []).map((group) => group.material?.shadingModel);
    assert(
      JSON.stringify(models) === JSON.stringify(REQUIRED_MODELS),
      `LOD${index} material models are ${models.join(', ')}`
    );
    for (const mapped of ['@clothing(style=stormglass_hooded_tunic)', `@lod(level=${index})`]) {
      assert(bundle.report?.mapped?.includes(mapped), `LOD${index} did not map '${mapped}'`);
    }
    assert(
      !models.includes('marschner-hair') && !models.includes('refractive-eye'),
      `LOD${index} leaked human hair/eye material into the faceless body`
    );
    return {
      level: index,
      distance: bundle.lod.distance,
      garmentSegments: bundle.lod.garmentSegments,
      jointCount: bundle.jointCount,
      vertexCount: bundle.vertexCount,
      indexCount: bundle.mesh.indices.length,
      triangleCount: bundle.mesh.indices.length / 3,
      materialModels: models,
      mappedTraits: bundle.report.mapped,
      compilerWarnings: bundle.report.warnings,
    };
  });
  for (let index = 1; index < summaries.length; index += 1) {
    assert(
      summaries[index - 1].vertexCount > summaries[index].vertexCount,
      `LOD${index} must reduce vertex count`
    );
    assert(
      summaries[index - 1].triangleCount > summaries[index].triangleCount,
      `LOD${index} must reduce triangle count`
    );
  }
  return summaries;
}

function changedPixelCount(left, right) {
  assert(left.length === right.length, 'Pixel grids must have equal lengths');
  let changed = 0;
  for (let index = 0; index < left.length; index += 4) {
    if (
      left[index] !== right[index] ||
      left[index + 1] !== right[index + 1] ||
      left[index + 2] !== right[index + 2] ||
      left[index + 3] !== right[index + 3]
    ) {
      changed += 1;
    }
  }
  return changed;
}

function visiblePixelCount(grid) {
  const background = CLEAR.map((channel) => Math.round(channel * 255));
  let visible = 0;
  for (let index = 0; index < grid.data.length; index += 4) {
    const distance =
      Math.abs(grid.data[index] - background[0]) +
      Math.abs(grid.data[index + 1] - background[1]) +
      Math.abs(grid.data[index + 2] - background[2]);
    if (distance > 8) visible += 1;
  }
  return visible;
}

function makeSheet(grids, columns, rows, gap = 10, border = 16) {
  assert(grids.length === columns * rows, 'Sheet grid count does not match shape');
  const cellWidth = grids[0].width;
  const cellHeight = grids[0].height;
  const width = border * 2 + cellWidth * columns + gap * (columns - 1);
  const height = border * 2 + cellHeight * rows + gap * (rows - 1);
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 7;
    data[index + 1] = 17;
    data[index + 2] = 31;
    data[index + 3] = 255;
  }
  grids.forEach((grid, gridIndex) => {
    const column = gridIndex % columns;
    const row = Math.floor(gridIndex / columns);
    const offsetX = border + column * (cellWidth + gap);
    const offsetY = border + row * (cellHeight + gap);
    for (let y = 0; y < cellHeight; y += 1) {
      const sourceStart = y * cellWidth * 4;
      const targetStart = ((offsetY + y) * width + offsetX) * 4;
      data.set(grid.data.subarray(sourceStart, sourceStart + cellWidth * 4), targetStart);
    }
  });
  return { width, height, data };
}

async function renderGrid(engine, device, host, clip, time) {
  host.setPose(sampleContinuousClip(clip, time, engine.CharacterRender.SkinMath));
  const started = performance.now();
  const grid = await engine.CharacterRender.renderCharacter(device, host.getDrawSpec(), {
    size: RENDER_SIZE,
    clear: CLEAR,
    cameraPos: CAMERA,
    lightDir: LIGHT,
    heightScale: FRAME_HEIGHT_SCALE,
  });
  return { grid, renderMs: performance.now() - started };
}

async function renderWitnesses(engine, gpu, ast, clips) {
  const context = new gpu.WebGPUContext({ fallbackToCPU: false });
  await context.initialize();
  assert(context.isSupported(), 'Native WebGPU device was not initialized');
  const device = context.getDevice();
  assert(typeof device.createShaderModule === 'function', 'No live GPUDevice');

  const hosts = REQUIRED_LODS.map(({ level }) => {
    const built = engine.CharacterRender.buildCharacterHostFromComposition(ast, {
      entityId: ENTITY_ID,
      lodLevel: level,
    });
    assert(built.ok && built.host, `LOD${level} host did not resolve`);
    return built.host;
  });

  const motion = [];
  const sheetGrids = [];
  for (const clip of clips) {
    const samples = [];
    for (const time of SAMPLE_TIMES) {
      const rendered = await renderGrid(engine, device, hosts[0], clip, time);
      samples.push({
        time,
        grid: rendered.grid,
        hash: sha256(rendered.grid.data),
        visiblePixels: visiblePixelCount(rendered.grid),
        renderMs: round(rendered.renderMs),
      });
    }
    const adjacentChangedPixels = samples
      .slice(1)
      .map((sample, index) => changedPixelCount(samples[index].grid.data, sample.grid.data));
    assert(
      adjacentChangedPixels.every((count) => count >= 24),
      `${clip.clipId} has a frozen adjacent motion sample: ${adjacentChangedPixels.join(', ')}`
    );
    const replay = await renderGrid(engine, device, hosts[0], clip, 0.375);
    const replayChangedPixels = changedPixelCount(samples[3].grid.data, replay.grid.data);
    assert(replayChangedPixels === 0, `${clip.clipId} replay changed pixels`);
    for (const time of SHEET_TIMES) {
      sheetGrids.push(samples.find((sample) => sample.time === time).grid);
    }
    motion.push({
      clipId: clip.clipId,
      sampleCount: samples.length,
      sampleTimes: [...SAMPLE_TIMES],
      sampleHashes: samples.map((sample) => sample.hash),
      adjacentChangedPixels,
      replayTime: 0.375,
      replayChangedPixels,
      visiblePixels: samples.map((sample) => sample.visiblePixels),
      renderMs: samples.map((sample) => sample.renderMs),
    });
  }

  const propose = clips.find((clip) => clip.clipId === 'propose');
  const lodGrids = [];
  const lodRender = [];
  for (let level = 0; level < hosts.length; level += 1) {
    const rendered = await renderGrid(engine, device, hosts[level], propose, 0.875);
    const replay = await renderGrid(engine, device, hosts[level], propose, 0.875);
    const replayChangedPixels = changedPixelCount(rendered.grid.data, replay.grid.data);
    assert(replayChangedPixels === 0, `LOD${level} replay changed pixels`);
    lodGrids.push(rendered.grid);
    lodRender.push({
      level,
      hash: sha256(rendered.grid.data),
      visiblePixels: visiblePixelCount(rendered.grid),
      replayChangedPixels,
      renderMs: round(rendered.renderMs),
    });
  }

  const adapter = context.getAdapter();
  const adapterInfo = adapter.info
    ? Object.fromEntries(
        ['vendor', 'architecture', 'device', 'description'].map((key) => [
          key,
          adapter.info[key] ?? '',
        ])
      )
    : {};
  return {
    motion,
    lodRender,
    heroPng: encodePng(lodGrids[0]),
    motionPng: encodePng(makeSheet(sheetGrids, 3, 4)),
    lodPng: encodePng(makeSheet(lodGrids, 3, 1)),
    adapterInfo,
    gpuDeviceMethodsVerified: [
      'createShaderModule',
      'createRenderPipeline',
      'createTexture',
      'createBuffer',
      'createCommandEncoder',
    ].filter((method) => typeof device[method] === 'function'),
  };
}

function validateManifest(core, manifestText, expected) {
  const parsed = core.parseHolo(manifestText);
  assert(parsed.errors?.length === 0, `Manifest has ${parsed.errors?.length} parse errors`);
  const metadata = parsed.ast.metadata ?? {};
  const state = objectProperties(parsed.ast.state);
  assert(
    metadata.schema === 'hololand.model-village.production-body.v1',
    'Bad production-body manifest schema'
  );
  assert(metadata.sourceSha256 === expected.sourceHash, 'Manifest source hash is stale');
  assert(metadata.heroSha256 === expected.heroHash, 'Manifest hero hash is stale');
  assert(metadata.motionSheetSha256 === expected.motionHash, 'Manifest motion hash is stale');
  assert(metadata.lodSheetSha256 === expected.lodHash, 'Manifest LOD image hash is stale');
  for (let level = 0; level < 3; level += 1) {
    assert(
      metadata[`lod${level}BundleSha256`] === expected.bundleHashes[level],
      `Manifest LOD${level} bundle hash is stale`
    );
    assert(
      state[`lod${level}VertexCount`] === expected.lodSummaries[level].vertexCount,
      `Manifest LOD${level} vertex count is stale`
    );
    assert(
      state[`lod${level}TriangleCount`] === expected.lodSummaries[level].triangleCount,
      `Manifest LOD${level} triangle count is stale`
    );
  }
  assert(state.hoodedGarmentGeometryObserved === true, 'Manifest must witness garment geometry');
  assert(state.facelessVisorObserved === true, 'Manifest must witness the faceless visor');
  assert(
    state.continuousSemanticMotionObserved === true,
    'Manifest must witness continuous motion'
  );
  assert(state.authoredLod1Observed === true, 'Manifest must witness authored LOD1');
  assert(state.authoredLod2Observed === true, 'Manifest must witness authored LOD2');
  assert(state.clothSimulationObserved === false, 'Manifest must not claim cloth simulation');
  assert(state.authoredTexturesObserved === false, 'Manifest must not claim authored textures');
  assert(
    state.observerRuntimeAttachmentObserved === false,
    'Manifest must not claim observer attachment'
  );
  assert(state.completeMvP2Claimed === false, 'Manifest must not claim complete MV-P2');
  return { schema: metadata.schema, validated: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourcePath = path.join(REPO_ROOT, SOURCE_REL);
  const manifestPath = path.join(REPO_ROOT, MANIFEST_REL);
  const assetPaths = ASSET_RELS.map((relative) => path.join(REPO_ROOT, relative));
  const heroPath = path.join(REPO_ROOT, HERO_REL);
  const motionPath = path.join(REPO_ROOT, MOTION_REL);
  const lodPath = path.join(REPO_ROOT, LOD_REL);

  for (const relative of [
    'packages/core/dist/index.js',
    'packages/engine/dist/index.js',
    'packages/engine/dist/gpu/index.js',
  ]) {
    assert(
      fs.existsSync(path.join(args.holoscriptRoot, relative)),
      `Missing built HoloScript dependency: ${relative}`
    );
  }

  const guardedPaths = [
    'source/layers/vr/frontier/model-village/model-village.holo',
    'source/layers/vr/frontier/model-village/model-village-observer-projection.holo',
    'source/layers/vr/frontier/model-village/model-village-resident-shared-rig.holo',
  ]
    .map((relative) => path.join(REPO_ROOT, relative))
    .filter(fs.existsSync);
  const guardedBefore = Object.fromEntries(
    guardedPaths.map((filePath) => [
      path.relative(REPO_ROOT, filePath),
      sha256(fs.readFileSync(filePath)),
    ])
  );

  let fetchCalls = 0;
  const fetchTargets = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...requestArgs) => {
    fetchCalls += 1;
    fetchTargets.push(String(requestArgs[0]));
    throw new Error(
      `Network access denied during production-body witness: ${String(requestArgs[0])}`
    );
  };

  try {
    const core = await import(
      pathToFileURL(path.join(args.holoscriptRoot, 'packages/core/dist/index.js')).href
    );
    const engine = await import(
      pathToFileURL(path.join(args.holoscriptRoot, 'packages/engine/dist/index.js')).href
    );
    const gpu = args.skipGpu
      ? null
      : await import(
          pathToFileURL(path.join(args.holoscriptRoot, 'packages/engine/dist/gpu/index.js')).href
        );
    const sourceText = fs.readFileSync(sourcePath, 'utf8');
    const sourceHash = sha256(sourceText);
    validateNeutralSource(sourceText);
    const parsed = core.parseHolo(sourceText);
    assert(parsed.success && parsed.errors?.length === 0, 'Production-body source did not parse');
    const clips = validateContinuousClips(parsed.ast, engine.CharacterRender.BONE_ORDER);

    const bundleBytes = [];
    const bundles = [];
    const bundleHashes = [];
    for (const { level } of REQUIRED_LODS) {
      const compile = async () =>
        new core.ExportManager({
          useCircuitBreaker: false,
          useFallback: false,
          useMemoryMonitoring: false,
        }).export('character-webgpu', parsed.ast, {
          compilerOptions: { entityId: ENTITY_ID, lodLevel: level },
        });
      const first = await compile();
      const second = await compile();
      assert(first.success && second.success, `LOD${level} compilation failed`);
      assert(!first.usedFallback && !second.usedFallback, `LOD${level} used fallback`);
      assert(first.output === second.output, `LOD${level} compile was not byte-identical`);
      const bytes = Buffer.from(first.output, 'utf8');
      bundleBytes.push(bytes);
      bundleHashes.push(sha256(bytes));
      bundles.push(JSON.parse(first.output));
    }
    const lodSummaries = validateLodBundles(bundles);

    const render = args.skipGpu ? null : await renderWitnesses(engine, gpu, parsed.ast, clips);
    const heroPng = render?.heroPng ?? (fs.existsSync(heroPath) ? fs.readFileSync(heroPath) : null);
    const motionPng =
      render?.motionPng ?? (fs.existsSync(motionPath) ? fs.readFileSync(motionPath) : null);
    const lodPng = render?.lodPng ?? (fs.existsSync(lodPath) ? fs.readFileSync(lodPath) : null);

    if (args.writeArtifacts) {
      assert(render, '--write-artifacts requires the GPU witness');
      for (let level = 0; level < 3; level += 1) {
        fs.mkdirSync(path.dirname(assetPaths[level]), { recursive: true });
        fs.writeFileSync(assetPaths[level], bundleBytes[level]);
      }
      fs.mkdirSync(path.dirname(heroPath), { recursive: true });
      fs.writeFileSync(heroPath, render.heroPng);
      fs.writeFileSync(motionPath, render.motionPng);
      fs.writeFileSync(lodPath, render.lodPng);
    } else {
      for (let level = 0; level < 3; level += 1) {
        assert(fs.existsSync(assetPaths[level]), `Missing committed LOD${level} bundle`);
        assert(
          sha256(fs.readFileSync(assetPaths[level])) === bundleHashes[level],
          `Committed LOD${level} bundle is stale`
        );
      }
      if (render) {
        assert(sha256(fs.readFileSync(heroPath)) === sha256(render.heroPng), 'Hero PNG is stale');
        assert(
          sha256(fs.readFileSync(motionPath)) === sha256(render.motionPng),
          'Motion PNG is stale'
        );
        assert(sha256(fs.readFileSync(lodPath)) === sha256(render.lodPng), 'LOD PNG is stale');
      }
    }

    const expected = {
      sourceHash,
      bundleHashes,
      lodSummaries,
      heroHash: heroPng ? sha256(heroPng) : null,
      motionHash: motionPng ? sha256(motionPng) : null,
      lodHash: lodPng ? sha256(lodPng) : null,
    };
    const manifest = args.skipManifest
      ? { validated: false, reason: 'bootstrap_skip_requested' }
      : validateManifest(core, fs.readFileSync(manifestPath, 'utf8'), expected);
    const externalFetchTargets = fetchTargets.filter((target) => /^https?:\/\//i.test(target));
    assert(externalFetchTargets.length === 0, 'Production-body witness attempted external fetches');
    const guardedAfter = Object.fromEntries(
      guardedPaths.map((filePath) => [
        path.relative(REPO_ROOT, filePath),
        sha256(fs.readFileSync(filePath)),
      ])
    );
    assert(
      JSON.stringify(guardedBefore) === JSON.stringify(guardedAfter),
      'Production-body witness mutated the experiment, observer, or MV-V2 source'
    );

    const receipt = {
      schema: 'hololand.model-village.production-body-witness.v1',
      generatedAt: new Date().toISOString(),
      milestone: 'MV-V3 Stormglass Production Body + Authored LOD + Continuous Motion',
      status: 'PASS',
      source: {
        path: SOURCE_REL,
        sha256: sourceHash,
        parseErrors: parsed.errors.length,
        identityNeutral: true,
        compileTarget: 'character-webgpu',
      },
      compiler: {
        sourceRoot: path.resolve(args.holoscriptRoot),
        target: 'character-webgpu',
        fallbackUsed: false,
        repeatedCompileByteIdentical: true,
        lods: lodSummaries.map((summary, level) => ({
          ...summary,
          bundlePath: ASSET_RELS[level],
          bundleSha256: bundleHashes[level],
          bundleBytes: bundleBytes[level].length,
        })),
      },
      semanticMotion: {
        interpolation: 'quaternion_nlerp_smoothstep',
        authoredKeyframesPerClip: 3,
        renderedSamplesPerClip: render ? SAMPLE_TIMES.length : 0,
        clips: clips.map((clip) => ({
          clipId: clip.clipId,
          durationSeconds: clip.durationSeconds,
          loop: clip.loop,
          receiptRequirement: clip.receiptRequirement,
          authoredClipHash: clip.authoredClipHash,
          ...(render
            ? render.motion.find((motion) => motion.clipId === clip.clipId)
            : { gpuWitnessSkipped: true }),
        })),
      },
      gpu: render
        ? {
            live: true,
            api: 'WebGPU',
            implementation: 'local Node WebGPU/Dawn device',
            adapterInfo: render.adapterInfo,
            verifiedDeviceMethods: render.gpuDeviceMethodsVerified,
            renderSize: RENDER_SIZE,
            clear: CLEAR,
            camera: CAMERA,
            light: LIGHT,
            frameHeightScale: FRAME_HEIGHT_SCALE,
            lodRender: render.lodRender,
          }
        : { live: false, skippedByCaller: true },
      visuals: {
        heroPath: HERO_REL,
        heroSha256: expected.heroHash,
        motionSheetPath: MOTION_REL,
        motionSheetSha256: expected.motionHash,
        lodSheetPath: LOD_REL,
        lodSheetSha256: expected.lodHash,
      },
      custody: {
        attemptedFetchCount: fetchCalls,
        deniedFetchTargets: fetchTargets,
        externalNetworkFetchCount: externalFetchTargets.length,
        externalDccRequired: false,
        providerAssetRequired: false,
        guardedSourceHashesBefore: guardedBefore,
        guardedSourceHashesAfter: guardedAfter,
      },
      manifest,
      claimBoundary: {
        proved:
          'Identity-neutral .holo source drives an operative faceless hooded garment, woven-cloth shader, three distinct authored LOD topologies, and continuously interpolated receipt-gated semantic motion on native WebGPU.',
        notProved: [
          'cloth simulation',
          'authored texture maps or UV-mapped fabric',
          'production animation retargeting or motion-capture quality',
          'observer runtime attachment',
          'six detachable public family mantles',
          'complete MV-P2 production readiness',
          'OS-level network air-gap',
          'real-time frame-rate performance',
        ],
      },
    };
    fs.mkdirSync(args.outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(args.outputDir, 'production-body-witness.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log(
        `PASS MV-V3 production body: LOD triangles ${lodSummaries
          .map((summary) => summary.triangleCount)
          .join(
            ' > '
          )}, ${clips.length} continuous clips, ${externalFetchTargets.length} external fetches`
      );
      console.log(`Receipt: ${path.join(args.outputDir, 'production-body-witness.json')}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`FAIL MV-V3 production body: ${error.message}`);
      process.exit(1);
    });
}
