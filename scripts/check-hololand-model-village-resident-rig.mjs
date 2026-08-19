#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-resident-shared-rig.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-resident-rig-manifest.holo';
const ASSET_REL =
  'assets/model-village/residents/stormglass-neutral-shared-rig.character.json';
const HERO_REL =
  'docs/assets/model-village/model-village-neutral-shared-rig-propose-2026-07-26.png';
const CONTACT_REL =
  'docs/assets/model-village/model-village-neutral-shared-rig-motion-contact-sheet-2026-07-26.png';
const DEFAULT_OUTPUT_REL =
  '.tmp/hololand/model-village/resident-rig-witness';
const ENTITY_ID = 'model-village-shared-neutral-resident';
const REQUIRED_CLIPS = Object.freeze({
  idle: 'neutral_fallback_no_action_receipt',
  listen: 'verified_observation_or_turn_receipt',
  propose: 'verified_proposal_or_admitted_action_receipt',
  settle: 'verified_action_or_public_state_receipt',
});
const REQUIRED_TRAITS = Object.freeze([
  '@body',
  '@subsurface_scattering',
  '@subsurface_scattering(scatter_color)',
  '@hair(color)',
  '@locomotion',
  '@skeleton(rig=humanoid_65)',
]);
const REQUIRED_MATERIALS = Object.freeze([
  'skin-sss',
  'marschner-hair',
  'refractive-eye',
]);
const IDENTITY_TERMS = Object.freeze([
  'Brittney',
  'Claude',
  'Gemini',
  'GLM',
  'Grok',
  'OpenAI',
  'Anthropic',
  'Google',
  'xAI',
]);
const CLEAR = Object.freeze([0.02, 0.04, 0.07, 1]);
const LIGHT = Object.freeze([0.35, 0.82, 0.45]);
const CAMERA = Object.freeze([0, 1.05, 6]);
const RENDER_SIZE = 384;

function parseArgs(argv) {
  const args = {
    holoscriptRoot:
      process.env.HOLOSCRIPT_ROOT ??
      'C:/Users/josep/Documents/GitHub/HoloScript',
    outputDir: path.join(REPO_ROOT, DEFAULT_OUTPUT_REL),
    writeArtifacts: false,
    skipManifest: false,
    skipGpu: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--holoscript-root') {
      args.holoscriptRoot = argv[++index];
    } else if (arg === '--output-dir') {
      args.outputDir = path.resolve(argv[++index]);
    } else if (arg === '--write-artifacts') {
      args.writeArtifacts = true;
    } else if (arg === '--skip-manifest') {
      args.skipManifest = true;
    } else if (arg === '--skip-gpu') {
      args.skipGpu = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-resident-rig.mjs [options]

Options:
  --holoscript-root <path>  HoloScript checkout containing built core/engine packages
  --output-dir <path>       Runtime receipt directory
  --write-artifacts         Refresh committed character bundle and GPU visual witnesses
  --skip-manifest           Bootstrap mode before the hash-pinned manifest exists
  --skip-gpu                Validate source/compiler/bundle only
  --json                    Emit the receipt as JSON`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function objectProperties(object) {
  return Object.fromEntries(
    (object?.properties ?? []).map((property) => [property.key, property.value])
  );
}

export function validateNeutralSource(sourceText) {
  const leaks = IDENTITY_TERMS.filter((term) => {
    const expression = new RegExp(`\\b${term}\\b`, 'i');
    return expression.test(sourceText);
  });
  assert(
    leaks.length === 0,
    `Shared resident source contains detachable identity term(s): ${leaks.join(', ')}`
  );
  return { identityNeutral: true, rejectedTerms: [...IDENTITY_TERMS] };
}

export function validateSemanticClips(ast, boneOrder) {
  const boneSet = new Set(boneOrder);
  const clips = (ast.objects ?? [])
    .map((object) => ({ object, props: objectProperties(object) }))
    .filter(({ props }) => props.type === 'model_village_semantic_clip');

  assert(
    clips.length === Object.keys(REQUIRED_CLIPS).length,
    `Expected exactly four semantic clips, found ${clips.length}`
  );

  const seen = new Set();
  const result = clips.map(({ object, props }) => {
    const { clipId, frames, receiptRequirement, permittedPresentationProfiles } = props;
    assert(
      Object.hasOwn(REQUIRED_CLIPS, clipId),
      `Unexpected semantic clip '${clipId}' on ${object.name}`
    );
    assert(!seen.has(clipId), `Duplicate semantic clip '${clipId}'`);
    seen.add(clipId);
    assert(
      receiptRequirement === REQUIRED_CLIPS[clipId],
      `${clipId} must require '${REQUIRED_CLIPS[clipId]}'`
    );
    assert(
      Array.isArray(permittedPresentationProfiles) &&
        permittedPresentationProfiles.includes('research_live_blinded'),
      `${clipId} must permit research_live_blinded`
    );
    assert(
      Array.isArray(frames) && frames.length === 2,
      `${clipId} must contain exactly two authored pose samples`
    );
    assert(
      frames[0].normalizedTime === 0 && frames[1].normalizedTime === 1,
      `${clipId} samples must be normalized at 0 and 1`
    );

    for (const [frameIndex, frame] of frames.entries()) {
      assert(
        Array.isArray(frame.rotations) && frame.rotations.length > 0,
        `${clipId} frame ${frameIndex} must author at least one rotation`
      );
      const frameBones = new Set();
      for (const rotation of frame.rotations) {
        assert(
          typeof rotation.bone === 'string' && boneSet.has(rotation.bone),
          `${clipId} frame ${frameIndex} references unknown bone '${rotation.bone}'`
        );
        assert(
          !frameBones.has(rotation.bone),
          `${clipId} frame ${frameIndex} repeats bone '${rotation.bone}'`
        );
        frameBones.add(rotation.bone);
        assert(
          Array.isArray(rotation.axis) &&
            rotation.axis.length === 3 &&
            rotation.axis.every(Number.isFinite),
          `${clipId} ${rotation.bone} must have a finite 3D axis`
        );
        const magnitude = Math.hypot(...rotation.axis);
        assert(
          Math.abs(magnitude - 1) < 1e-6,
          `${clipId} ${rotation.bone} axis must be unit length`
        );
        assert(
          Number.isFinite(rotation.degrees) && Math.abs(rotation.degrees) <= 120,
          `${clipId} ${rotation.bone} degrees must be finite and within +/-120`
        );
      }
    }

    return {
      clipId,
      objectName: object.name,
      durationSeconds: props.durationSeconds,
      loop: props.loop,
      receiptRequirement,
      permittedPresentationProfiles,
      frameCount: frames.length,
      frames,
      authoredClipHash: sha256(JSON.stringify(frames)),
    };
  });

  for (const required of Object.keys(REQUIRED_CLIPS)) {
    assert(seen.has(required), `Missing semantic clip '${required}'`);
  }
  return result.sort(
    (left, right) =>
      Object.keys(REQUIRED_CLIPS).indexOf(left.clipId) -
      Object.keys(REQUIRED_CLIPS).indexOf(right.clipId)
  );
}

export function validateCharacterBundle(bundle, boneOrder) {
  assert(
    bundle?.format === 'character-webgpu/drawspec',
    `Unexpected character bundle format '${bundle?.format}'`
  );
  assert(bundle.version === 1, `Unexpected character bundle version '${bundle.version}'`);
  assert(
    bundle.jointCount === boneOrder.length,
    `Bundle jointCount ${bundle.jointCount} does not match live palette ${boneOrder.length}`
  );
  assert(bundle.vertexCount > 1000, `Bundle has too few vertices: ${bundle.vertexCount}`);
  assert(Array.isArray(bundle.mesh?.positions), 'Bundle positions must be serialized');
  assert(Array.isArray(bundle.mesh?.normals), 'Bundle normals must be serialized');
  assert(Array.isArray(bundle.mesh?.tangents), 'Bundle tangents must be serialized');
  assert(Array.isArray(bundle.mesh?.indices), 'Bundle indices must be serialized');
  assert(Array.isArray(bundle.mesh?.jointIndices), 'Bundle jointIndices must be serialized');
  assert(Array.isArray(bundle.mesh?.jointWeights), 'Bundle jointWeights must be serialized');
  assert(
    bundle.mesh.positions.length === bundle.vertexCount * 3,
    'Bundle position count must equal vertexCount * 3'
  );
  assert(
    bundle.mesh.normals.length === bundle.vertexCount * 3,
    'Bundle normal count must equal vertexCount * 3'
  );
  assert(
    bundle.mesh.tangents.length === bundle.vertexCount * 4,
    'Bundle tangent count must equal vertexCount * 4'
  );
  assert(
    bundle.mesh.jointIndices.length === bundle.vertexCount,
    'Bundle joint-index count must equal vertexCount'
  );
  assert(
    bundle.mesh.jointWeights.length === bundle.vertexCount,
    'Bundle joint-weight count must equal vertexCount'
  );

  const materialModels = (bundle.materialGroups ?? []).map(
    (group) => group.material?.shadingModel
  );
  for (const required of REQUIRED_MATERIALS) {
    assert(materialModels.includes(required), `Missing material model '${required}'`);
  }
  for (const trait of REQUIRED_TRAITS) {
    assert(bundle.report?.mapped?.includes(trait), `Compiler did not map '${trait}'`);
  }
  assert(
    bundle.report?.warnings?.some((warning) =>
      warning.includes("@hair(style:'hooded') has no geometry channel yet")
    ),
    'Expected the compiler to disclose the hooded-hair geometry boundary'
  );

  return {
    format: bundle.format,
    version: bundle.version,
    jointCount: bundle.jointCount,
    vertexCount: bundle.vertexCount,
    indexCount: bundle.mesh.indices.length,
    triangleCount: bundle.mesh.indices.length / 3,
    materialGroupCount: bundle.materialGroups.length,
    materialModels,
    mappedTraits: bundle.report.mapped,
    compilerWarnings: bundle.report.warnings,
  };
}

function applyFrame(host, frame, skinMath) {
  host.setPose(new Map());
  for (const rotation of frame.rotations) {
    host.setBoneRotation(
      rotation.bone,
      skinMath.quatFromAxisAngle(
        rotation.axis[0],
        rotation.axis[1],
        rotation.axis[2],
        (rotation.degrees * Math.PI) / 180
      )
    );
  }
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

function crc32(buffer) {
  let checksum = ~0;
  for (let index = 0; index < buffer.length; index += 1) {
    checksum ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (0xedb88320 & -(checksum & 1));
    }
  }
  return ~checksum >>> 0;
}

function pngChunk(type, data) {
  const output = new Uint8Array(8 + data.length + 4);
  const view = new DataView(output.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) {
    output[4 + index] = type.charCodeAt(index);
  }
  output.set(data, 8);
  const checksumInput = new Uint8Array(4 + data.length);
  for (let index = 0; index < 4; index += 1) {
    checksumInput[index] = type.charCodeAt(index);
  }
  checksumInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(checksumInput));
  return output;
}

export function encodePng(grid) {
  const { width, height, data } = grid;
  assert(data.length === width * height * 4, 'RGBA grid has invalid byte length');
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(
      data.subarray(y * stride, y * stride + stride),
      y * (stride + 1) + 1
    );
  }
  const compressed = zlib.deflateSync(Buffer.from(raw));
  return Buffer.concat([
    Buffer.from(signature),
    Buffer.from(pngChunk('IHDR', header)),
    Buffer.from(pngChunk('IDAT', new Uint8Array(compressed))),
    Buffer.from(pngChunk('IEND', new Uint8Array(0))),
  ]);
}

function makeContactSheet(grids) {
  assert(grids.length === 4, 'Contact sheet requires four clip grids');
  const cellWidth = grids[0].width;
  const cellHeight = grids[0].height;
  const gap = 12;
  const border = 18;
  const width = border * 2 + cellWidth * 2 + gap;
  const height = border * 2 + cellHeight * 2 + gap;
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 7;
    data[index + 1] = 17;
    data[index + 2] = 31;
    data[index + 3] = 255;
  }
  grids.forEach((grid, gridIndex) => {
    const column = gridIndex % 2;
    const row = Math.floor(gridIndex / 2);
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

async function renderWitnesses(engine, gpu, ast, clips) {
  const built = engine.CharacterRender.buildCharacterHostFromComposition(ast, {
    entityId: ENTITY_ID,
  });
  assert(built.ok, 'Character host bridge did not resolve the authored resident');
  const context = new gpu.WebGPUContext({ fallbackToCPU: false });
  await context.initialize();
  assert(context.isSupported(), 'Native WebGPU device was not initialized');
  const device = context.getDevice();
  assert(
    typeof device.createShaderModule === 'function',
    'Initialized device is not a live GPUDevice'
  );

  const outputs = [];
  for (const clip of clips) {
    const frames = [];
    const timingsMs = [];
    for (const frame of clip.frames) {
      applyFrame(built.host, frame, engine.CharacterRender.SkinMath);
      const started = performance.now();
      const grid = await engine.CharacterRender.renderCharacter(
        device,
        built.host.getDrawSpec(),
        {
          size: RENDER_SIZE,
          clear: CLEAR,
          cameraPos: CAMERA,
          lightDir: LIGHT,
        }
      );
      timingsMs.push(performance.now() - started);
      frames.push(grid);
    }

    applyFrame(built.host, clip.frames[1], engine.CharacterRender.SkinMath);
    const replay = await engine.CharacterRender.renderCharacter(
      device,
      built.host.getDrawSpec(),
      {
        size: RENDER_SIZE,
        clear: CLEAR,
        cameraPos: CAMERA,
        lightDir: LIGHT,
      }
    );
    const changedPixels = changedPixelCount(frames[0].data, frames[1].data);
    const replayChangedPixels = changedPixelCount(frames[1].data, replay.data);
    const visiblePixels = visiblePixelCount(frames[1]);
    assert(
      changedPixels >= 24,
      `${clip.clipId} authored samples changed only ${changedPixels} pixels`
    );
    assert(
      replayChangedPixels === 0,
      `${clip.clipId} replay changed ${replayChangedPixels} pixels`
    );
    assert(
      visiblePixels >= RENDER_SIZE * 8,
      `${clip.clipId} rendered only ${visiblePixels} visible pixels`
    );

    outputs.push({
      clipId: clip.clipId,
      frames,
      evidence: {
        frameAHash: sha256(frames[0].data),
        frameBHash: sha256(frames[1].data),
        replayHash: sha256(replay.data),
        changedPixels,
        replayChangedPixels,
        visiblePixels,
        renderMs: timingsMs.map((value) => round(value)),
      },
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
    outputs,
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
  assert(parsed.errors?.length === 0, `Manifest parse errors: ${parsed.errors?.length}`);
  const metadata = parsed.ast.metadata ?? {};
  const state = objectProperties(parsed.ast.state);
  assert(metadata.schema === 'hololand.model-village.sovereign-resident-rig.v1', 'Bad manifest schema');
  assert(metadata.sourceSha256 === expected.sourceHash, 'Manifest source hash is stale');
  assert(metadata.bundleSha256 === expected.bundleHash, 'Manifest bundle hash is stale');
  assert(metadata.heroSha256 === expected.heroHash, 'Manifest hero hash is stale');
  assert(metadata.contactSheetSha256 === expected.contactHash, 'Manifest contact sheet hash is stale');
  assert(metadata.bundleBytes === expected.bundleBytes, 'Manifest bundle size is stale');
  assert(
    metadata.holoscriptEngineCommit ===
      '3614129c2fc123b7d1b47feda65888b4fb7f9b5b',
    'Manifest must pin the operative scatter-color engine commit'
  );
  assert(state.liveJointCount === expected.bundleSummary.jointCount, 'Manifest joint count is stale');
  assert(state.vertexCount === expected.bundleSummary.vertexCount, 'Manifest vertex count is stale');
  assert(state.indexCount === expected.bundleSummary.indexCount, 'Manifest index count is stale');
  assert(state.materialGroupCount === expected.bundleSummary.materialGroupCount, 'Manifest material count is stale');
  assert(state.semanticClipCount === 4, 'Manifest must pin four semantic clips');
  assert(state.completeMvP2Claimed === false, 'Manifest must not claim complete MV-P2');
  assert(state.authoredLod1Observed === false, 'Manifest must not claim authored LOD1');
  assert(state.authoredLod2Observed === false, 'Manifest must not claim authored LOD2');
  assert(
    state.hoodedGarmentGeometryObserved === false,
    'Manifest must disclose missing hooded garment geometry'
  );
  const evidenceByClip = new Map(
    (parsed.ast.objects ?? [])
      .map((object) => [objectProperties(object).clipId, objectProperties(object)])
      .filter(([clipId]) => typeof clipId === 'string')
  );
  for (const clip of expected.clips) {
    const evidence = evidenceByClip.get(clip.clipId);
    assert(evidence, `Manifest is missing evidence for '${clip.clipId}'`);
    assert(
      evidence.authoredClipSha256 === clip.authoredClipHash,
      `Manifest authored hash is stale for '${clip.clipId}'`
    );
    assert(
      evidence.replayChangedPixels === 0 &&
        evidence.frameBSha256 === evidence.replaySha256,
      `Manifest replay is not exact for '${clip.clipId}'`
    );
    const rendered = expected.render?.outputs.find(
      (output) => output.clipId === clip.clipId
    )?.evidence;
    if (rendered) {
      assert(
        evidence.frameASha256 === rendered.frameAHash &&
          evidence.frameBSha256 === rendered.frameBHash &&
          evidence.replaySha256 === rendered.replayHash &&
          evidence.changedPixels === rendered.changedPixels,
        `Manifest GPU evidence is stale for '${clip.clipId}'`
      );
    }
  }
  return { schema: metadata.schema, validated: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourcePath = path.join(REPO_ROOT, SOURCE_REL);
  const manifestPath = path.join(REPO_ROOT, MANIFEST_REL);
  const assetPath = path.join(REPO_ROOT, ASSET_REL);
  const heroPath = path.join(REPO_ROOT, HERO_REL);
  const contactPath = path.join(REPO_ROOT, CONTACT_REL);
  const canonicalPaths = [
    path.join(
      REPO_ROOT,
      'source/layers/vr/frontier/model-village/model-village.holo'
    ),
    path.join(
      REPO_ROOT,
      'source/layers/vr/frontier/model-village/model-village-observer-projection.holo'
    ),
  ].filter(fs.existsSync);
  const canonicalBefore = Object.fromEntries(
    canonicalPaths.map((filePath) => [path.relative(REPO_ROOT, filePath), sha256(fs.readFileSync(filePath))])
  );

  for (const relative of [
    'packages/core/dist/index.js',
    'packages/engine/dist/index.js',
    'packages/engine/dist/gpu/index.js',
  ]) {
    assert(
      fs.existsSync(path.join(args.holoscriptRoot, relative)),
      `Missing built HoloScript dependency: ${path.join(args.holoscriptRoot, relative)}`
    );
  }

  let fetchCalls = 0;
  const fetchTargets = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...requestArgs) => {
    fetchCalls += 1;
    fetchTargets.push(String(requestArgs[0]));
    throw new Error(`Network access denied during resident witness: ${String(requestArgs[0])}`);
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
    const neutralSource = validateNeutralSource(sourceText);
    const parsed = core.parseHolo(sourceText);
    assert(parsed.success, 'Resident source did not parse successfully');
    assert(parsed.errors?.length === 0, `Resident source has ${parsed.errors.length} parse errors`);
    const ast = parsed.ast;
    const boneOrder = engine.CharacterRender.BONE_ORDER;
    const clips = validateSemanticClips(ast, boneOrder);

    const exportManagerOptions = {
      useCircuitBreaker: false,
      useFallback: false,
      useMemoryMonitoring: false,
    };
    const firstManager = new core.ExportManager(exportManagerOptions);
    const secondManager = new core.ExportManager(exportManagerOptions);
    const compilerOptions = { compilerOptions: { entityId: ENTITY_ID } };
    const first = await firstManager.export('character-webgpu', ast, compilerOptions);
    const second = await secondManager.export('character-webgpu', ast, compilerOptions);
    assert(first.success && second.success, 'character-webgpu compilation failed');
    assert(first.usedFallback === false && second.usedFallback === false, 'Compiler used fallback');
    assert(first.output === second.output, 'Repeated character-webgpu compilation was not byte-identical');
    const bundleBytes = Buffer.from(first.output, 'utf8');
    const bundleHash = sha256(bundleBytes);
    const bundle = JSON.parse(first.output);
    const bundleSummary = validateCharacterBundle(bundle, boneOrder);

    let render = null;
    let heroPng = null;
    let contactPng = null;
    if (!args.skipGpu) {
      render = await renderWitnesses(engine, gpu, ast, clips);
      const hero = render.outputs.find((output) => output.clipId === 'propose').frames[1];
      heroPng = encodePng(hero);
      contactPng = encodePng(
        makeContactSheet(render.outputs.map((output) => output.frames[1]))
      );
    }

    if (args.writeArtifacts) {
      assert(!args.skipGpu, '--write-artifacts requires the GPU witness');
      fs.mkdirSync(path.dirname(assetPath), { recursive: true });
      fs.mkdirSync(path.dirname(heroPath), { recursive: true });
      fs.writeFileSync(assetPath, bundleBytes);
      fs.writeFileSync(heroPath, heroPng);
      fs.writeFileSync(contactPath, contactPng);
    } else {
      assert(fs.existsSync(assetPath), `Missing committed bundle: ${ASSET_REL}`);
      assert(
        sha256(fs.readFileSync(assetPath)) === bundleHash,
        'Committed character bundle is stale; run with --write-artifacts'
      );
      if (!args.skipGpu) {
        assert(fs.existsSync(heroPath), `Missing committed hero: ${HERO_REL}`);
        assert(fs.existsSync(contactPath), `Missing committed contact sheet: ${CONTACT_REL}`);
        assert(
          sha256(fs.readFileSync(heroPath)) === sha256(heroPng),
          'Committed hero differs from the deterministic GPU witness'
        );
        assert(
          sha256(fs.readFileSync(contactPath)) === sha256(contactPng),
          'Committed contact sheet differs from the deterministic GPU witness'
        );
      }
    }

    const heroHash = heroPng
      ? sha256(heroPng)
      : fs.existsSync(heroPath)
        ? sha256(fs.readFileSync(heroPath))
        : null;
    const contactHash = contactPng
      ? sha256(contactPng)
      : fs.existsSync(contactPath)
        ? sha256(fs.readFileSync(contactPath))
        : null;
    const expected = {
      sourceHash,
      bundleHash,
      bundleBytes: bundleBytes.length,
      heroHash,
      contactHash,
      bundleSummary,
      clips,
      render,
    };
    const manifest = args.skipManifest
      ? { validated: false, reason: 'bootstrap_skip_requested' }
      : validateManifest(core, fs.readFileSync(manifestPath, 'utf8'), expected);

    const externalFetchTargets = fetchTargets.filter((target) =>
      /^https?:\/\//i.test(target)
    );
    assert(
      externalFetchTargets.length === 0,
      `Witness attempted external fetch(es): ${externalFetchTargets.join(', ')}`
    );
    const canonicalAfter = Object.fromEntries(
      canonicalPaths.map((filePath) => [path.relative(REPO_ROOT, filePath), sha256(fs.readFileSync(filePath))])
    );
    assert(
      JSON.stringify(canonicalBefore) === JSON.stringify(canonicalAfter),
      'Resident witness mutated canonical experiment or observer source'
    );

    const receipt = {
      schema: 'hololand.model-village.resident-rig-witness.v1',
      generatedAt: new Date().toISOString(),
      milestone: 'MV-V2 Sovereign Resident Rig + Semantic Motion Witness',
      status: 'PASS',
      source: {
        path: SOURCE_REL,
        sha256: sourceHash,
        parseErrors: parsed.errors.length,
        identityNeutral: neutralSource.identityNeutral,
        compileTarget: 'character-webgpu',
      },
      compiler: {
        sourceRoot: path.resolve(args.holoscriptRoot),
        target: 'character-webgpu',
        success: true,
        fallbackUsed: false,
        repeatedCompileByteIdentical: true,
        bundlePath: ASSET_REL,
        bundleSha256: bundleHash,
        bundleBytes: bundleBytes.length,
        ...bundleSummary,
      },
      semanticMotion: clips.map((clip) => ({
        clipId: clip.clipId,
        durationSeconds: clip.durationSeconds,
        loop: clip.loop,
        receiptRequirement: clip.receiptRequirement,
        authoredClipHash: clip.authoredClipHash,
        ...(render
          ? render.outputs.find((output) => output.clipId === clip.clipId).evidence
          : { gpuWitnessSkipped: true }),
      })),
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
          }
        : { live: false, skippedByCaller: true },
      visuals: {
        heroPath: HERO_REL,
        heroSha256: heroHash,
        contactSheetPath: CONTACT_REL,
        contactSheetSha256: contactHash,
      },
      custody: {
        attemptedFetchCount: fetchCalls,
        deniedFetchTargets: fetchTargets,
        externalNetworkFetchCount: externalFetchTargets.length,
        externalDccRequired: false,
        providerAssetRequired: false,
        canonicalSourceHashesBefore: canonicalBefore,
        canonicalSourceHashesAfter: canonicalAfter,
      },
      manifest,
      claimBoundary: {
        proved:
          'Neutral .holo source compiles deterministically to a live 55-joint skinned CharacterDrawSpec, and four receipt-gated semantic pose samples render repeatable GPU pixels.',
        notProved: [
          'finished faceless Stormglass garment or hood geometry',
          'authored LOD1 or LOD2 resident meshes',
          'cloth simulation or authored textures',
          'observer runtime attachment',
          'six family mantles or unblinded resident bodies',
          'complete MV-P2 production readiness',
          'OS-level network air-gap',
          'real-time frame-rate performance',
        ],
      },
    };

    fs.mkdirSync(args.outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(args.outputDir, 'resident-rig-witness.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    if (args.json) {
      console.log(JSON.stringify(receipt, null, 2));
    } else {
      console.log(
        `PASS MV-V2 resident rig: ${bundleSummary.jointCount} joints, ` +
          `${bundleSummary.vertexCount} vertices, ${clips.length} semantic clips, ` +
          `${externalFetchTargets.length} external fetches`
      );
      console.log(`Receipt: ${path.join(args.outputDir, 'resident-rig-witness.json')}`);
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
      console.error(`FAIL MV-V2 resident rig: ${error.message}`);
      process.exit(1);
    });
}
