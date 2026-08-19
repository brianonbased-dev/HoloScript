#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  encodePng,
  objectProperties,
  sha256,
} from './check-hololand-model-village-resident-rig.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-openai-cloth-mantle.holo';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-openai-cloth-mantle-manifest.holo';
const OBSERVER_REL =
  'source/layers/vr/frontier/model-village/model-village-observer-projection.holo';
const PUBLIC_CATALOG_REL =
  'source/layers/vr/frontier/model-village/model-village-public-embodiments.holo';
const BUNDLE_REL =
  'assets/model-village/residents/stormglass-openai-cloth-mantle-lod0.character.json';
const HERO_REL =
  'docs/assets/model-village/model-village-openai-cloth-mantle-hero-2026-07-26.png';
const CLOTH_REL =
  'docs/assets/model-village/model-village-openai-cloth-motion-2026-07-26.png';
const STATES_REL =
  'docs/assets/model-village/model-village-openai-mantle-states-2026-07-26.png';
const DEFAULT_OUTPUT_REL = '.tmp/hololand/model-village/cloth-mantle-witness';
const ENTITY_ID = 'model-village-openai-story-resident';
const PROFILE = 'village_story_unblinded';
const DENIED_PROFILE = 'research_live_blinded';
const RENDER_SIZE = 384;
const CLEAR = Object.freeze([0.02, 0.04, 0.07, 1]);
const CAMERA = Object.freeze([0, 1.05, 6]);
const LIGHT = Object.freeze([0.4, 0.86, 0.36]);
const FRAME_HEIGHT_SCALE = 1.25;
const SAMPLE_TIMES = Object.freeze([0, 0.2, 0.4, 0.6, 0.8]);
const REQUIRED_RECEIPTS = Object.freeze([
  'terminal_commitment',
  'verified_family_binding_receipt',
  'verified_unblinding_receipt',
  'verified_family_embodiment_manifest',
]);
const REQUIRED_MODELS = Object.freeze([
  'skin-sss',
  'woven-cloth',
  'lambert',
  'woven-cloth',
]);
const BINDING_RECEIPT_FIXTURE = Object.freeze({
  fixtureId: 'verified-openai-story-target',
  verified: true,
  terminalCommitment: true,
  unblinded: true,
  familyEmbodimentManifestVerified: true,
  presentationProfile: PROFILE,
  familyId: 'openai',
  residentTargetObject: 'ObserverResident01',
  seatId: 'seat-01',
  canonicalAssignment: false,
});

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
      console.log(`Usage: node scripts/check-hololand-model-village-cloth-mantle.mjs [options]

Options:
  --holoscript-root <path>  HoloScript checkout containing built core/engine packages
  --output-dir <path>       Runtime receipt directory
  --write-artifacts         Refresh the compiled bundle and native GPU witnesses
  --skip-manifest           Bootstrap before the hash-pinned manifest exists
  --skip-gpu                Validate source/compiler/material/attachment data only
  --json                    Emit the receipt as JSON`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function equalArrays(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const width = border * 2 + columns * cellWidth + (columns - 1) * gap;
  const height = border * 2 + rows * cellHeight + (rows - 1) * gap;
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

function flattenObjects(ast) {
  const direct = [...(ast.objects ?? [])];
  const walkGroup = (group) => {
    direct.push(...(group.objects ?? []));
    for (const child of group.groups ?? []) walkGroup(child);
  };
  for (const group of ast.spatialGroups ?? []) walkGroup(group);
  return direct;
}

export function validateStoryPolicy(ast) {
  const metadata = ast.metadata ?? {};
  const state = objectProperties(ast.state);
  assert(metadata.presentationProfile === PROFILE, `Presentation profile must be ${PROFILE}`);
  assert(metadata.namedFamily === 'OpenAI', 'Named family must be OpenAI');
  assert(metadata.exactModelRevision === 'absent', 'Exact model revision must remain absent');
  assert(metadata.researchLiveBlindedAllowed === false, 'Live blinded research must be denied');
  assert(metadata.canonicalWriteAuthority === false, 'Overlay must not have canonical authority');
  assert(metadata.causalEffect === false, 'Overlay must be non-causal');
  assert(metadata.providerEndorsementClaimed === false, 'Overlay must not claim endorsement');
  assert(
    metadata.independentProjectDisclosure ===
      'HoloLand-authored visual interpretation; not affiliated with or endorsed by OpenAI.',
    'Independent-project disclosure is missing'
  );
  assert(state.publicDisplayName === 'OpenAI', 'State display name must be OpenAI');
  assert(state.familyId === 'openai', 'State family id must be openai');
  assert(state.modelFamily === 'gpt', 'State model family must match the public catalog');
  assert(state.agentSurfaceId === 'codex-hardware', 'State agent surface is stale');
  assert(state.familyMantleId === 'stormglass-mantle-openai-v1', 'Mantle id is stale');
  assert(state.familyMantlePatternId === 'recursive_cell_interlock', 'Mantle pattern is stale');
  assert(state.familyMantleGlyphId === 'recursive_interlock_glyph', 'Mantle glyph is stale');
  assert(state.familyMantleAccentColor === '#D6D1C7', 'Mantle accent is stale');
  assert(state.exactModelRevision === 'absent', 'State exact model revision must be absent');
  assert(state.researchLiveBlindedAllowed === false, 'State must deny live blinded research');
  assert(state.mantleDetachable === true, 'Mantle must be detachable');
  assert(state.clothSolver === 'xpbd', 'Cloth solver must be xpbd');
  assert(state.fixedStepHz === 120, 'Cloth fixed step must be 120 Hz');
  assert(state.namedFamilyMantlesBuilt === 1, 'This phase must claim exactly one named mantle');
  assert(state.targetNamedFamilyMantles === 6, 'Target family mantle count must remain six');
  assert(state.completeMvP2Claimed === false, 'Source must not claim complete MV-P2');
  assert(
    equalArrays(state.requiresReceipts, REQUIRED_RECEIPTS),
    'State receipt requirements are incomplete or reordered'
  );
  assert(
    state.prohibitedPresentationProfiles?.includes(DENIED_PROFILE),
    'Live blinded profile must be explicitly prohibited'
  );

  const character = (ast.objects ?? []).find((object) => object.name === 'OpenAI');
  assert(character, 'OpenAI character object is missing');
  const characterProps = objectProperties(character);
  assert(characterProps.publicDisplayName === 'OpenAI', 'Character display name must be OpenAI');
  assert(characterProps.familyId === 'openai', 'Character family id must be openai');
  assert(
    characterProps.detachablePresentationOverlay === true,
    'Character must be a detachable presentation overlay'
  );
  assert(
    characterProps.researchLiveBlindedAllowed === false,
    'Character must deny live blinded presentation'
  );
  assert(characterProps.causalEffect === false, 'Character must be non-causal');
  return { metadata, state, character };
}

export function resolveStoryAttachment(ast, observerAst, bindingReceipt = BINDING_RECEIPT_FIXTURE) {
  const attachment = (ast.objects ?? []).find(
    (object) => object.name === 'OpenAIObserverStoryAttachment'
  );
  assert(attachment, 'OpenAI observer story attachment is missing');
  const props = objectProperties(attachment);
  assert(props.type === 'model_village_story_observer_attachment', 'Bad attachment type');
  assert(props.presentationProfile === PROFILE, 'Attachment must be story-only');
  assert(props.targetSource === OBSERVER_REL, 'Attachment target source is stale');
  assert(
    props.targetObjectSource === 'verified_family_binding_receipt.residentTargetObject',
    'Attachment object must come from a verified receipt'
  );
  assert(
    props.targetSeatIdSource === 'verified_family_binding_receipt.seatId',
    'Attachment seat must come from a verified receipt'
  );
  assert(
    props.publicGalleryPlacementSource === 'public_gallery_layout_manifest',
    'Story gallery placement source is stale'
  );
  assert(
    props.postlockPlacementSource === 'verified_family_binding_receipt',
    'Post-lock placement source is stale'
  );
  for (const field of [
    'researchResidentBinding',
    'researchSeatBinding',
    'researchPersonaBinding',
    'adapterAssignmentBinding',
  ]) {
    assert(props[field] === 'none', `${field} must remain none`);
  }
  assert(props.publicDisplayName === 'OpenAI', 'Attachment display name must be OpenAI');
  assert(props.familyId === 'openai', 'Attachment family id must be openai');
  assert(
    equalArrays(props.requiresReceipts, REQUIRED_RECEIPTS),
    'Attachment receipt requirements are incomplete or reordered'
  );
  assert(
    props.deniedPresentationProfiles?.includes(DENIED_PROFILE),
    'Attachment must deny live blinded presentation'
  );
  assert(props.researchLiveBlindedAllowed === false, 'Attachment leaked to live research');
  assert(props.mayWriteCanonicalWorld === false, 'Attachment may not write canonical world');
  assert(
    props.mayWriteResidentObservation === false,
    'Attachment may not write resident observations'
  );
  assert(props.causalEffect === false, 'Attachment must be non-causal');

  assert(bindingReceipt.verified === true, 'Binding receipt fixture is not verified');
  assert(bindingReceipt.terminalCommitment === true, 'Binding receipt lacks terminal commitment');
  assert(bindingReceipt.unblinded === true, 'Binding receipt is not unblinded');
  assert(
    bindingReceipt.familyEmbodimentManifestVerified === true,
    'Binding receipt lacks a verified embodiment manifest'
  );
  assert(bindingReceipt.presentationProfile === PROFILE, 'Binding receipt is not story-only');
  assert(bindingReceipt.familyId === props.familyId, 'Binding receipt family does not match');
  assert(bindingReceipt.canonicalAssignment === false, 'Fixture may not claim canonical assignment');
  const targetObject = bindingReceipt.residentTargetObject;
  const targetSeatId = bindingReceipt.seatId;
  const target = flattenObjects(observerAst).find((object) => object.name === targetObject);
  assert(target, `Observer target '${targetObject}' is missing`);
  const targetProps = objectProperties(target);
  assert(Array.isArray(targetProps.position) && targetProps.position.length === 3, 'Bad target pose');
  assert(targetProps.properties?.seatId === targetSeatId, 'Target seat does not match');
  assert(targetProps.properties?.familyMantleVisible === false, 'Live observer target is not blind');
  assert(
    targetProps.properties?.publicEmbodimentOverlayLoaded === false,
    'Live observer target already loaded a public overlay'
  );
  assert(targetProps.properties?.causalEffect === false, 'Observer target must be non-causal');
  return {
    attachmentId: props.attachmentId,
    targetObjectSource: props.targetObjectSource,
    targetSeatIdSource: props.targetSeatIdSource,
    targetObject,
    targetSeatId,
    targetPosition: targetProps.position,
    presentationProfile: props.presentationProfile,
    requiresReceipts: props.requiresReceipts,
    receiptFixtureId: bindingReceipt.fixtureId,
    canonicalAssignment: false,
  };
}

export function validatePublicCatalogAlignment(ast, publicCatalogAst) {
  const story = validateStoryPolicy(ast);
  const catalogObject = flattenObjects(publicCatalogAst).find(
    (object) => object.name === 'OpenAIEmbodiment'
  );
  assert(catalogObject, 'OpenAI public-catalog object is missing');
  const catalog = objectProperties(catalogObject).properties;
  assert(catalog, 'OpenAI public-catalog properties are missing');
  const expected = {
    publicDisplayName: story.state.publicDisplayName,
    familyId: story.state.familyId,
    agentSurfaceId: story.state.agentSurfaceId,
    modelFamily: story.state.modelFamily,
    familyMantleId: story.state.familyMantleId,
    familyMantlePatternId: story.state.familyMantlePatternId,
    familyMantleGlyphId: story.state.familyMantleGlyphId,
    familyMantleAccentColor: story.state.familyMantleAccentColor,
  };
  for (const [field, value] of Object.entries(expected)) {
    assert(catalog[field] === value, `OpenAI story ${field} drifted from the keyed public catalog`);
  }
  for (const field of [
    'researchResidentBinding',
    'researchSeatBinding',
    'researchPersonaBinding',
    'researchRoleBinding',
    'adapterAssignmentBinding',
  ]) {
    assert(catalog[field] === 'none', `Public catalog ${field} must remain none`);
  }
  return expected;
}

function readMap(repoRoot, relativePath, expectedKind, expectedCount) {
  assert(typeof relativePath === 'string' && !path.isAbsolute(relativePath), 'Map path is not local');
  const absolutePath = path.resolve(repoRoot, relativePath);
  assert(
    absolutePath.startsWith(`${path.resolve(repoRoot)}${path.sep}`),
    `Map escaped repository custody: ${relativePath}`
  );
  assert(fs.existsSync(absolutePath), `Missing local map: ${relativePath}`);
  const bytes = fs.readFileSync(absolutePath);
  const parsed = JSON.parse(bytes.toString('utf8'));
  assert(parsed.schema === 'hololand.local-material-tile.v1', `Bad map schema: ${relativePath}`);
  assert(parsed.kind === expectedKind, `Bad map kind: ${relativePath}`);
  assert(parsed.size === 4, `Map must be 4x4: ${relativePath}`);
  assert(
    Array.isArray(parsed.values) &&
      parsed.values.length === expectedCount &&
      parsed.values.every(Number.isFinite),
    `Bad map values: ${relativePath}`
  );
  return { relativePath, absolutePath, bytes, parsed, sha256: sha256(bytes) };
}

export function loadMantleTextureTile(repoRoot, mantle) {
  const albedo = readMap(repoRoot, mantle.albedoMap, 'albedo-luminance', 16);
  const normal = readMap(repoRoot, mantle.normalMap, 'normal-xy', 32);
  const roughness = readMap(repoRoot, mantle.roughnessMap, 'roughness', 16);
  assert(
    albedo.parsed.tileId === normal.parsed.tileId &&
      albedo.parsed.tileId === roughness.parsed.tileId,
    'Material maps do not share one tile id'
  );
  assert(
    albedo.parsed.values.every((value) => value >= 0 && value <= 2),
    'Albedo luminance is outside 0..2'
  );
  assert(
    normal.parsed.values.every((value) => value >= 0 && value <= 1),
    'Normal XY is outside 0..1'
  );
  assert(
    roughness.parsed.values.every((value) => value >= 0.08 && value <= 1),
    'Roughness is outside 0.08..1'
  );
  const tile = {
    size: 4,
    albedo: albedo.parsed.values,
    normalXY: normal.parsed.values,
    roughness: roughness.parsed.values,
    repeat: albedo.parsed.repeat,
    normalScale: normal.parsed.normalScale,
  };
  assert(tile.repeat >= 1 && tile.repeat <= 16, 'Texture repeat is outside 1..16');
  assert(tile.normalScale >= 0 && tile.normalScale <= 2, 'Normal scale is outside 0..2');
  return {
    tileId: albedo.parsed.tileId,
    tile,
    maps: [albedo, normal, roughness].map((map) => ({
      path: map.relativePath,
      kind: map.parsed.kind,
      sha256: map.sha256,
      bytes: map.bytes.length,
      valueCount: map.parsed.values.length,
    })),
  };
}

export function validateMantleBundle(bundle) {
  assert(bundle.format === 'character-webgpu/drawspec', 'Bad character bundle format');
  assert(bundle.version === 1, 'Bad character bundle version');
  assert(bundle.vertexCount > 0, 'Character bundle has no vertices');
  assert(
    Array.isArray(bundle.mesh?.uvs) && bundle.mesh.uvs.length === bundle.vertexCount * 2,
    'Compiled bundle does not carry one UV pair per vertex'
  );
  assert(new Set(bundle.mesh.uvs).size > 8, 'Compiled UV field is degenerate');
  const models = (bundle.materialGroups ?? []).map((group) => group.material?.shadingModel);
  assert(equalArrays(models, REQUIRED_MODELS), `Material models are ${models.join(', ')}`);
  assert(bundle.cloth?.solver === 'xpbd', 'Compiled cloth solver is not xpbd');
  assert(bundle.cloth?.fixedStepHz === 120, 'Compiled cloth fixed step is not 120 Hz');
  assert(bundle.cloth?.iterations === 5, 'Compiled cloth iteration count is stale');
  assert(bundle.cloth?.maxDisplacement === 0.18, 'Compiled cloth displacement bound is stale');
  assert(bundle.mantle?.style === 'openai_recursive_interlock', 'Compiled mantle style is stale');
  assert(bundle.mantle?.detachable === true, 'Compiled mantle is not detachable');
  assert(
    bundle.report?.mapped?.includes('@cloth_simulation(solver=xpbd)'),
    'Compiler did not map @cloth_simulation'
  );
  assert(
    bundle.report?.mapped?.includes('@clothing(mantle_style=openai_recursive_interlock)'),
    'Compiler did not map the OpenAI mantle'
  );
  assert(bundle.report?.stubbed?.length === 0, 'Compiled mantle source contains stubbed traits');
  return {
    jointCount: bundle.jointCount,
    vertexCount: bundle.vertexCount,
    indexCount: bundle.mesh.indices.length,
    triangleCount: bundle.mesh.indices.length / 3,
    uvCount: bundle.mesh.uvs.length / 2,
    uvDistinctValues: new Set(bundle.mesh.uvs).size,
    materialModels: models,
    cloth: bundle.cloth,
    mantle: bundle.mantle,
    mappedTraits: bundle.report.mapped,
    compilerWarnings: bundle.report.warnings,
  };
}

function detachedAst(ast) {
  const clone = structuredClone(ast);
  const character = (clone.objects ?? []).find((object) => object.name === 'OpenAI');
  const clothing = character?.traits?.find((trait) => trait.name === 'clothing');
  assert(clothing, 'Cannot detach mantle: @clothing is missing');
  for (const key of [
    'mantle_style',
    'mantle_color',
    'mantle_detachable',
    'mantle_albedo_map',
    'mantle_normal_map',
    'mantle_roughness_map',
  ]) {
    delete clothing.config[key];
  }
  return clone;
}

async function renderGrid(engine, device, host, timeSeconds) {
  host.applyLocomotion('idle', 0.35, 1);
  const cloth = host.sampleClothSimulation(timeSeconds);
  const started = performance.now();
  const grid = await engine.CharacterRender.renderCharacter(device, host.getDrawSpec(), {
    size: RENDER_SIZE,
    clear: CLEAR,
    cameraPos: CAMERA,
    lightDir: LIGHT,
    heightScale: FRAME_HEIGHT_SCALE,
  });
  return { cloth, grid, renderMs: performance.now() - started };
}

async function renderWitnesses(engine, gpu, ast, texture, attachment) {
  const context = new gpu.WebGPUContext({ fallbackToCPU: false });
  await context.initialize();
  assert(context.isSupported(), 'Native WebGPU device was not initialized');
  const device = context.getDevice();
  assert(typeof device.createShaderModule === 'function', 'No live GPUDevice');

  const built = engine.CharacterRender.buildCharacterHostFromComposition(ast, {
    entityId: ENTITY_ID,
    lodLevel: 0,
  });
  assert(built.ok && built.host, 'OpenAI cloth-mantle host did not resolve');
  assert(built.cloth?.solver === 'xpbd', 'Runtime host did not resolve cloth');
  assert(built.mantle?.style === 'openai_recursive_interlock', 'Runtime host did not resolve mantle');
  built.host.setMantleTextureTile(texture.tile);

  built.host.applyWorldState({
    position: {
      x: attachment.targetPosition[0],
      y: attachment.targetPosition[1],
      z: attachment.targetPosition[2],
    },
  });
  const attachedMatrix = Array.from(built.host.getDrawSpec().modelMatrix);
  assert(
    Math.abs(attachedMatrix[12] - attachment.targetPosition[0]) < 1e-6 &&
      Math.abs(attachedMatrix[13] - attachment.targetPosition[1]) < 1e-6 &&
      Math.abs(attachedMatrix[14] - attachment.targetPosition[2]) < 1e-6,
    'Runtime host did not attach to the observer target pose'
  );
  built.host.applyWorldState({ position: { x: 0, y: 0, z: 0 }, rotationY: -0.12 });

  const samples = [];
  for (const time of SAMPLE_TIMES) {
    const rendered = await renderGrid(engine, device, built.host, time);
    assert(rendered.cloth, `No cloth receipt at ${time}s`);
    assert(
      rendered.cloth.fixedSteps === Math.round(time * 120),
      `Bad cloth fixed-step count at ${time}s`
    );
    assert(
      rendered.cloth.maxDisplacement <= 0.180001,
      `Cloth exceeded authored displacement bound at ${time}s`
    );
    samples.push({
      time,
      cloth: rendered.cloth,
      grid: rendered.grid,
      hash: sha256(rendered.grid.data),
      visiblePixels: visiblePixelCount(rendered.grid),
      renderMs: round(rendered.renderMs),
    });
  }
  assert(samples[0].cloth.maxDisplacement === 0, 'Cloth rest sample moved');
  assert(
    samples.slice(1).every((sample) => sample.cloth.maxDisplacement > 0.001),
    'Cloth did not visibly leave the rest state'
  );
  assert(
    new Set(samples.map((sample) => sample.cloth.positionDigest)).size === samples.length,
    'Cloth samples did not produce distinct position digests'
  );
  const adjacentChangedPixels = samples
    .slice(1)
    .map((sample, index) => changedPixelCount(samples[index].grid.data, sample.grid.data));
  assert(
    adjacentChangedPixels.every((count) => count >= 12),
    `Cloth render froze between samples: ${adjacentChangedPixels.join(', ')}`
  );

  const replay = await renderGrid(engine, device, built.host, 0.6);
  const replayChangedPixels = changedPixelCount(samples[3].grid.data, replay.grid.data);
  assert(replay.cloth.positionDigest === samples[3].cloth.positionDigest, 'Cloth digest replay drifted');
  assert(replayChangedPixels === 0, 'Cloth GPU replay changed pixels');

  built.host.setMantleTextureTile(undefined);
  const flat = await renderGrid(engine, device, built.host, 0.6);
  const textureChangedPixels = changedPixelCount(samples[3].grid.data, flat.grid.data);
  assert(textureChangedPixels >= 16, 'Local UV material maps did not change rendered pixels');
  built.host.setMantleTextureTile(texture.tile);

  const detachedBuild = engine.CharacterRender.buildCharacterHostFromComposition(detachedAst(ast), {
    entityId: `${ENTITY_ID}-detached`,
    lodLevel: 0,
  });
  assert(detachedBuild.ok && detachedBuild.host, 'Detached neutral host did not resolve');
  assert(!detachedBuild.mantle, 'Detached host retained mantle metadata');
  detachedBuild.host.applyWorldState({
    position: { x: 0, y: 0, z: 0 },
    rotationY: -0.12,
  });
  const detached = await renderGrid(engine, device, detachedBuild.host, 0.6);
  const detachedChangedPixels = changedPixelCount(samples[3].grid.data, detached.grid.data);
  assert(detachedChangedPixels >= 64, 'Detaching the mantle did not change rendered pixels');
  const detachedModels = detachedBuild.host
    .getDrawSpec()
    .materialGroups.map((group) => group.material.shadingModel);
  assert(
    equalArrays(detachedModels, ['skin-sss', 'woven-cloth', 'lambert']),
    'Detached host did not return to the neutral material groups'
  );

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
    samples,
    adjacentChangedPixels,
    replayChangedPixels,
    textureChangedPixels,
    detachedChangedPixels,
    detachedVertexCount: detachedBuild.host.getDrawSpec().mesh.vertexCount,
    detachedMaterialModels: detachedModels,
    attachedMatrixTranslation: attachedMatrix.slice(12, 15),
    heroPng: encodePng(samples[4].grid),
    clothPng: encodePng(makeSheet(samples.slice(1).map((sample) => sample.grid), 4, 1)),
    statesPng: encodePng(makeSheet([samples[3].grid, flat.grid, detached.grid], 3, 1)),
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
    metadata.schema === 'hololand.model-village.cloth-mantle.v1',
    'Bad cloth-mantle manifest schema'
  );
  assert(metadata.sourceSha256 === expected.sourceHash, 'Manifest source hash is stale');
  assert(metadata.bundleSha256 === expected.bundleHash, 'Manifest bundle hash is stale');
  assert(metadata.heroSha256 === expected.heroHash, 'Manifest hero hash is stale');
  assert(metadata.clothSheetSha256 === expected.clothHash, 'Manifest cloth sheet hash is stale');
  assert(metadata.statesSheetSha256 === expected.statesHash, 'Manifest states sheet hash is stale');
  assert(equalArrays(metadata.materialMapSha256, expected.mapHashes), 'Manifest map hashes are stale');
  assert(state.publicDisplayName === 'OpenAI', 'Manifest display name must be OpenAI');
  assert(state.presentationProfile === PROFILE, 'Manifest must be story-only');
  assert(state.researchLiveBlindedAllowed === false, 'Manifest leaked to live research');
  assert(state.clothSimulationObserved === true, 'Manifest must witness cloth simulation');
  assert(state.localUvMaterialMapsObserved === true, 'Manifest must witness local UV maps');
  assert(state.observerStoryAttachmentObserved === true, 'Manifest must witness attachment');
  assert(state.mantleDetachmentObserved === true, 'Manifest must witness detachment');
  assert(state.namedFamilyMantlesObserved === 1, 'Manifest must claim exactly one named mantle');
  assert(state.completeMvP2Claimed === false, 'Manifest must not claim complete MV-P2');
  return { schema: metadata.schema, validated: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourcePath = path.join(REPO_ROOT, SOURCE_REL);
  const manifestPath = path.join(REPO_ROOT, MANIFEST_REL);
  const observerPath = path.join(REPO_ROOT, OBSERVER_REL);
  const publicCatalogPath = path.join(REPO_ROOT, PUBLIC_CATALOG_REL);
  const bundlePath = path.join(REPO_ROOT, BUNDLE_REL);
  const heroPath = path.join(REPO_ROOT, HERO_REL);
  const clothPath = path.join(REPO_ROOT, CLOTH_REL);
  const statesPath = path.join(REPO_ROOT, STATES_REL);

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
    OBSERVER_REL,
    PUBLIC_CATALOG_REL,
    'source/layers/vr/frontier/model-village/model-village-resident-production-body.holo',
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
    throw new Error(`Network access denied during cloth-mantle witness: ${requestArgs[0]}`);
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
    const parsed = core.parseHolo(sourceText);
    assert(parsed.success && parsed.errors?.length === 0, 'Cloth-mantle source did not parse');
    const story = validateStoryPolicy(parsed.ast);
    const publicCatalogParsed = core.parseHolo(fs.readFileSync(publicCatalogPath, 'utf8'));
    assert(
      publicCatalogParsed.success && publicCatalogParsed.errors?.length === 0,
      'Public embodiment catalog did not parse'
    );
    validatePublicCatalogAlignment(parsed.ast, publicCatalogParsed.ast);

    const observerText = fs.readFileSync(observerPath, 'utf8');
    const observerParsed = core.parseHolo(observerText);
    assert(
      observerParsed.success && observerParsed.errors?.length === 0,
      'Observer projection did not parse'
    );
    const attachment = resolveStoryAttachment(parsed.ast, observerParsed.ast);

    const built = engine.CharacterRender.buildCharacterHostFromComposition(parsed.ast, {
      entityId: ENTITY_ID,
      lodLevel: 0,
    });
    assert(built.ok && built.host, 'Character host did not resolve');
    assert(built.cloth?.solver === 'xpbd', 'Source cloth trait did not map');
    assert(built.mantle?.style === 'openai_recursive_interlock', 'Source mantle trait did not map');
    assert(built.mantle.detachable === true, 'Source mantle did not stay detachable');
    const texture = loadMantleTextureTile(REPO_ROOT, built.mantle);

    const compile = async () =>
      new core.ExportManager({
        useCircuitBreaker: false,
        useFallback: false,
        useMemoryMonitoring: false,
      }).export('character-webgpu', parsed.ast, {
        compilerOptions: { entityId: ENTITY_ID, lodLevel: 0 },
      });
    const first = await compile();
    const second = await compile();
    assert(first.success && second.success, 'Character mantle compilation failed');
    assert(!first.usedFallback && !second.usedFallback, 'Character mantle compilation used fallback');
    assert(first.output === second.output, 'Character mantle compile was not byte-identical');
    const bundleBytes = Buffer.from(first.output, 'utf8');
    const bundleHash = sha256(bundleBytes);
    const bundle = JSON.parse(first.output);
    const compilerSummary = validateMantleBundle(bundle);
    assert(
      bundle.mantle.albedoMap === built.mantle.albedoMap &&
        bundle.mantle.normalMap === built.mantle.normalMap &&
        bundle.mantle.roughnessMap === built.mantle.roughnessMap,
      'Compiled mantle material refs drifted'
    );

    const render = args.skipGpu
      ? null
      : await renderWitnesses(engine, gpu, parsed.ast, texture, attachment);
    const heroPng = render?.heroPng ?? (fs.existsSync(heroPath) ? fs.readFileSync(heroPath) : null);
    const clothPng =
      render?.clothPng ?? (fs.existsSync(clothPath) ? fs.readFileSync(clothPath) : null);
    const statesPng =
      render?.statesPng ?? (fs.existsSync(statesPath) ? fs.readFileSync(statesPath) : null);

    if (args.writeArtifacts) {
      assert(render, '--write-artifacts requires the GPU witness');
      fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
      fs.writeFileSync(bundlePath, bundleBytes);
      fs.mkdirSync(path.dirname(heroPath), { recursive: true });
      fs.writeFileSync(heroPath, render.heroPng);
      fs.writeFileSync(clothPath, render.clothPng);
      fs.writeFileSync(statesPath, render.statesPng);
    } else {
      assert(fs.existsSync(bundlePath), 'Missing committed cloth-mantle bundle');
      assert(sha256(fs.readFileSync(bundlePath)) === bundleHash, 'Committed bundle is stale');
      if (render) {
        assert(sha256(fs.readFileSync(heroPath)) === sha256(render.heroPng), 'Hero PNG is stale');
        assert(
          sha256(fs.readFileSync(clothPath)) === sha256(render.clothPng),
          'Cloth sheet PNG is stale'
        );
        assert(
          sha256(fs.readFileSync(statesPath)) === sha256(render.statesPng),
          'Mantle states PNG is stale'
        );
      }
    }

    const expected = {
      sourceHash,
      bundleHash,
      mapHashes: texture.maps.map((map) => map.sha256),
      heroHash: heroPng ? sha256(heroPng) : null,
      clothHash: clothPng ? sha256(clothPng) : null,
      statesHash: statesPng ? sha256(statesPng) : null,
    };
    const manifest = args.skipManifest
      ? { validated: false, reason: 'bootstrap_skip_requested' }
      : validateManifest(core, fs.readFileSync(manifestPath, 'utf8'), expected);

    const externalFetchTargets = fetchTargets.filter((target) => /^https?:\/\//i.test(target));
    assert(externalFetchTargets.length === 0, 'Cloth-mantle witness attempted external fetches');
    const guardedAfter = Object.fromEntries(
      guardedPaths.map((filePath) => [
        path.relative(REPO_ROOT, filePath),
        sha256(fs.readFileSync(filePath)),
      ])
    );
    assert(
      JSON.stringify(guardedBefore) === JSON.stringify(guardedAfter),
      'Cloth-mantle witness mutated experiment, observer, or neutral-body source'
    );

    const receipt = {
      schema: 'hololand.model-village.cloth-mantle-witness.v1',
      generatedAt: new Date().toISOString(),
      milestone: 'MV-V4 OpenAI Detachable Cloth Mantle + Local UV Maps + Story Attachment',
      status: 'PASS',
      source: {
        path: SOURCE_REL,
        sha256: sourceHash,
        parseErrors: parsed.errors.length,
        presentationProfile: story.metadata.presentationProfile,
        publicDisplayName: story.state.publicDisplayName,
        familyId: story.state.familyId,
        modelFamily: story.state.modelFamily,
        embodimentTitle: story.state.embodimentTitle,
        agentSurfaceId: story.state.agentSurfaceId,
        exactModelRevision: story.state.exactModelRevision,
        researchLiveBlindedAllowed: false,
        causalEffect: false,
      },
      compiler: {
        sourceRoot: path.resolve(args.holoscriptRoot),
        target: 'character-webgpu',
        fallbackUsed: false,
        repeatedCompileByteIdentical: true,
        ...compilerSummary,
        bundlePath: BUNDLE_REL,
        bundleSha256: bundleHash,
        bundleBytes: bundleBytes.length,
      },
      materialMaps: {
        tileId: texture.tileId,
        size: texture.tile.size,
        repeat: texture.tile.repeat,
        normalScale: texture.tile.normalScale,
        maps: texture.maps,
        localCustody: true,
        externalTextureFetchCount: 0,
      },
      cloth: render
        ? {
            solver: 'xpbd',
            fixedStepHz: 120,
            sampleTimes: [...SAMPLE_TIMES],
            samples: render.samples.map((sample) => ({
              time: sample.time,
              fixedSteps: sample.cloth.fixedSteps,
              iterations: sample.cloth.iterations,
              dynamicVertexCount: sample.cloth.dynamicVertexCount,
              maxDisplacement: sample.cloth.maxDisplacement,
              rmsDisplacement: sample.cloth.rmsDisplacement,
              positionDigest: sample.cloth.positionDigest,
              pixelSha256: sample.hash,
              visiblePixels: sample.visiblePixels,
              renderMs: sample.renderMs,
            })),
            adjacentChangedPixels: render.adjacentChangedPixels,
            replayChangedPixels: render.replayChangedPixels,
          }
        : { solver: 'xpbd', fixedStepHz: 120, gpuWitnessSkipped: true },
      detachableMantle: render
        ? {
            style: 'openai_recursive_interlock',
            texturedToFlatChangedPixels: render.textureChangedPixels,
            attachedToDetachedChangedPixels: render.detachedChangedPixels,
            attachedVertexCount: compilerSummary.vertexCount,
            detachedVertexCount: render.detachedVertexCount,
            detachedMaterialModels: render.detachedMaterialModels,
          }
        : { style: 'openai_recursive_interlock', gpuWitnessSkipped: true },
      observerStoryAttachment: {
        ...attachment,
        runtimePoseApplied: Boolean(render),
        runtimeMatrixTranslation: render?.attachedMatrixTranslation ?? null,
        canonicalWriteAuthority: false,
        causalEffect: false,
        researchLiveBlindedAllowed: false,
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
          }
        : { live: false, skippedByCaller: true },
      visuals: {
        heroPath: HERO_REL,
        heroSha256: expected.heroHash,
        clothSheetPath: CLOTH_REL,
        clothSheetSha256: expected.clothHash,
        statesSheetPath: STATES_REL,
        statesSheetSha256: expected.statesHash,
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
          'Story-only OpenAI .holo source drives a detachable sovereign mantle, compact local UV material tiles, deterministic fixed-step cloth motion, native WebGPU pixels, and a receipt-gated read-only attachment to the existing observer projection.',
        notProved: [
          'permission to reveal OpenAI identity during live blinded research',
          'exact OpenAI model revision or a canonical claim that OpenAI is assigned to seat-01',
          'the remaining five named family mantles',
          'production high-resolution texture assets',
          'cloth self-collision, body collision, or imported production garment topology',
          'full six-resident observer runtime integration',
          'complete MV-P2 production readiness',
          'OS-level network air-gap',
          'real-time headset frame-rate performance',
        ],
      },
    };

    fs.mkdirSync(args.outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(args.outputDir, 'cloth-mantle-witness.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else {
      const maxDisplacement = render
        ? Math.max(...render.samples.map((sample) => sample.cloth.maxDisplacement))
        : 0;
      console.log(
        `PASS MV-V4 OpenAI cloth mantle: ${compilerSummary.triangleCount} triangles, ` +
          `${round(maxDisplacement)}m max displacement, ${externalFetchTargets.length} external fetches`
      );
      console.log(`Receipt: ${path.join(args.outputDir, 'cloth-mantle-witness.json')}`);
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
      console.error(`FAIL MV-V4 cloth mantle: ${error.message}`);
      process.exit(1);
    });
}
