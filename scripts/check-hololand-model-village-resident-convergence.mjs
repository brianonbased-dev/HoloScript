#!/usr/bin/env node
/* global console, crypto, document, process, requestAnimationFrame, TextEncoder, window */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalJson,
  validateCourtyardContract,
} from './check-hololand-model-village-receipt-loom-courtyard.mjs';
import {
  extractBaseBrowserApplication,
  validateMaterialConvergenceContract,
} from './check-hololand-model-village-material-convergence.mjs';
import {
  buildGeometryPlan,
  validateGeometryConvergenceContract,
} from './check-hololand-model-village-geometry-convergence.mjs';
import {
  buildAtmospherePlan,
  extractGeometryBrowserApplication,
  validateAtmosphereConvergenceContract,
} from './check-hololand-model-village-atmosphere-convergence.mjs';
import {
  serializeMaterialSet,
  synthesizeMaterialSet,
} from './lib/model-village-material-synthesis.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-resident-convergence.holo';
const ATMOSPHERE_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-atmosphere-convergence.holo';
const ATMOSPHERE_BRIDGE_RELATIVE =
  'scripts/check-hololand-model-village-atmosphere-convergence.mjs';
const GEOMETRY_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-geometry-convergence.holo';
const GEOMETRY_BRIDGE_RELATIVE =
  'scripts/check-hololand-model-village-geometry-convergence.mjs';
const MATERIAL_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-material-convergence.holo';
const BASE_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-courtyard.holo';
const BASE_BRIDGE_RELATIVE =
  'scripts/check-hololand-model-village-receipt-loom-courtyard.mjs';
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'resident-convergence-e',
);
const DISPLAY_NAMES = Object.freeze([
  'Claude',
  'OpenAI',
  'Gemini',
  'Grok',
  'GLM',
  'Brittney',
]);
const FAMILY_IDS = Object.freeze([
  'anthropic',
  'openai',
  'google',
  'xai',
  'ollama',
  'sovereign',
]);
const MATERIAL_SURFACES = Object.freeze([
  'agedTimber',
  'limePlaster',
  'handSplitSlate',
  'wetBasalt',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function pngDimensions(buffer) {
  if (
    buffer.length < 24
    || buffer.toString('ascii', 1, 4) !== 'PNG'
    || buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('Screenshot is not a valid PNG');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function stateProperties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value]),
  );
}

function flatten(node, result = []) {
  result.push(node);
  for (const child of node?.children || []) flatten(child, result);
  return result;
}

function resolveHoloScriptRoot(root, explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(root, '..', 'HoloScript'),
    'C:/Users/josep/Documents/GitHub/HoloScript',
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, 'packages', 'core', 'dist', 'index.js'))
      && existsSync(path.join(candidate, 'node_modules', 'three', 'build', 'three.module.js'))
      && existsSync(path.join(candidate, 'node_modules', 'esbuild', 'lib', 'main.js'))
      && existsSync(path.join(candidate, 'node_modules', 'playwright', 'index.mjs'))
    ) {
      return candidate;
    }
  }
  throw new Error(`Built HoloScript toolchain not found: ${candidates.join(', ')}`);
}

function resolveBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Chrome/Edge executable not found: ${candidates.join(', ')}`);
  return path.resolve(found);
}

function extractAtmosphereBrowserApplication(sourceText) {
  const startMarker = 'async function atmosphereConvergenceBrowserApplication(';
  const endMarker = '\n\nasync function buildSurface';
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Unable to extract immutable Atmosphere Convergence D browser application');
  }
  return sourceText.slice(start, end);
}

async function parseComposition(core, sourcePath) {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const parsed = new core.HoloCompositionParser().parse(sourceText);
  if (!parsed.success) {
    throw new Error(
      `${path.basename(sourcePath)} HoloCompositionParser failed: ${canonicalJson(parsed.errors)}`,
    );
  }
  const sceneIr = new core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(parsed.ast);
  return {
    sourcePath,
    sourceText,
    sourceHash: sha256(sourceText),
    sceneIr,
    sceneIrHash: sha256(canonicalJson(sceneIr)),
    contract: {
      metadata: parsed.ast.metadata,
      state: stateProperties(parsed.ast.state),
      environment: stateProperties(parsed.ast.environment),
      nodes: flatten(sceneIr)
        .filter((node) => node.type !== 'group')
        .map((node) => ({ id: node.id || null, type: node.type, props: node.props || {} })),
    },
  };
}

function residentNodes(contract) {
  return contract.nodes.filter(
    (node) => node.type === 'mesh'
      && node.props?.properties?.characterBundle
      && node.props?.properties?.publicDisplayName,
  );
}

export function buildResidentPlan(contract) {
  return residentNodes(contract).map((node) => ({
    id: node.id,
    publicDisplayName: node.props.properties.publicDisplayName,
    familyId: node.props.properties.familyId,
    slug: node.props.properties.slug,
    patternId: node.props.properties.patternId,
    glyphId: node.props.properties.glyphId,
    silhouetteId: node.props.properties.silhouetteId,
    accentColor: node.props.properties.accentColor,
    characterBundle: node.props.properties.characterBundle,
    characterBundleSha256: node.props.properties.characterBundleSha256,
    mantleTile: node.props.properties.mantleTile,
    captionOffset: node.props.properties.captionOffset,
    position: node.props.position,
    rotation: node.props.rotation,
    scale: node.props.scale,
  }));
}

export function validateResidentConvergenceContract(contract, root = REPO_ROOT) {
  const errors = [];
  const { metadata, state } = contract;
  if (metadata.worldName !== 'Stormglass Commons') {
    errors.push('worldName must be Stormglass Commons');
  }
  if (metadata.artStyle !== 'hearthlight_biorealism') {
    errors.push('artStyle must be hearthlight_biorealism');
  }
  if (metadata.milestone !== 'MV_V1_RESIDENT_CONVERGENCE_E') {
    errors.push('milestone must be MV_V1_RESIDENT_CONVERGENCE_E');
  }
  if (metadata.projectionRole !== 'public_postlock_family_embodiment') {
    errors.push('projectionRole must be public_postlock_family_embodiment');
  }
  if (metadata.inheritedWitnessesImmutable !== true) {
    errors.push('inheritedWitnessesImmutable must be true');
  }
  if (metadata.bridgeMayOwnPresentationOnly !== true) {
    errors.push('bridgeMayOwnPresentationOnly must be true');
  }
  if (metadata.externalAssetsRequired !== false) {
    errors.push('externalAssetsRequired must remain false');
  }
  if (!metadata.independentProjectDisclosure?.includes('not affiliated with or endorsed')) {
    errors.push('independentProjectDisclosure must deny provider affiliation or endorsement');
  }
  for (const [relativePath, expectedHash, label] of [
    [metadata.atmosphereSource, metadata.atmosphereSourceSha256, 'atmosphere source'],
    [metadata.atmosphereBridge, metadata.atmosphereBridgeSha256, 'atmosphere bridge'],
    [metadata.atmosphereTest, metadata.atmosphereTestSha256, 'atmosphere test'],
    [metadata.atmosphereReport, metadata.atmosphereReportSha256, 'atmosphere report'],
    [metadata.atmosphereHero, metadata.atmosphereHeroSha256, 'atmosphere hero'],
    [metadata.atmosphereManifest, metadata.atmosphereManifestSha256, 'atmosphere manifest'],
    [metadata.familyCatalog, metadata.familyCatalogSha256, 'family catalog'],
    [metadata.familyCatalogManifest, metadata.familyCatalogManifestSha256, 'family catalog manifest'],
    [
      metadata.publicEmbodimentsSource,
      metadata.publicEmbodimentsSourceSha256,
      'public embodiments source',
    ],
    [
      metadata.neutralProductionBodySource,
      metadata.neutralProductionBodySourceSha256,
      'neutral production body source',
    ],
  ]) {
    const filePath = path.resolve(root, relativePath || '');
    if (!existsSync(filePath)) {
      errors.push(`${label} file is missing: ${relativePath}`);
    } else if (!SHA256_PATTERN.test(expectedHash || '')) {
      errors.push(`${label} hash must be lowercase sha256`);
    } else if (sha256File(filePath) !== expectedHash) {
      errors.push(`${label} hash does not match ${relativePath}`);
    }
  }
  if (!SHA256_PATTERN.test(metadata.atmosphereBrowserApplicationSha256 || '')) {
    errors.push('atmosphereBrowserApplicationSha256 must be lowercase sha256');
  }
  if (state.authority !== 'read_only') errors.push('authority must be read_only');
  if (state.presentationProfile !== 'village_story_unblinded') {
    errors.push('presentationProfile must be village_story_unblinded');
  }
  if (!state.admittedPresentationProfiles?.includes('research_replay_postlock')) {
    errors.push('research_replay_postlock must remain admitted');
  }
  if (!state.deniedPresentationProfiles?.includes('research_live_blinded')) {
    errors.push('research_live_blinded must remain denied');
  }
  for (const key of [
    'separateFromLiveExperiment',
    'researchLiveIdentityNeutralPreserved',
    'publicFamilyIdentityPresented',
    'residentConvergenceClaimed',
    'productionResidentAssetsClaimed',
    'captionsAlwaysVisible',
    'facelessEmbodiments',
    'mantleDetachable',
  ]) {
    if (state[key] !== true) errors.push(`${key} must be true`);
  }
  for (const key of [
    'researchLiveBlindedCompatible',
    'canonicalWritesAllowed',
    'residentObservationWritesAllowed',
    'modelCallsAllowed',
    'networkFetchesAllowed',
    'exactModelRevisionPresented',
    'providerEndorsementClaimed',
    'modelBehaviorSimulated',
    'productionTailoringClaimed',
    'continuousClothSimulationClaimed',
    'collisionResolvedGarmentsClaimed',
    'gameplayPhysicsClaimed',
    'measuredRealTimePerformanceClaimed',
    'photorealismClaimed',
    'fullWorldConvergenceClaimed',
  ]) {
    if (state[key] !== false) errors.push(`${key} must remain false`);
  }
  if (state.sourceResidentAuthority !== 'holoscript') {
    errors.push('sourceResidentAuthority must be holoscript');
  }
  if (state.residentMaterializationBridge !== 'deterministic_local_presentation_only') {
    errors.push('residentMaterializationBridge must be deterministic_local_presentation_only');
  }
  if (state.neutralStagingFormsHidden !== 2) {
    errors.push('neutralStagingFormsHidden must be 2');
  }
  if (state.namedResidentCount !== DISPLAY_NAMES.length) {
    errors.push(`namedResidentCount must be ${DISPLAY_NAMES.length}`);
  }
  if (canonicalJson(state.publicDisplayNames) !== canonicalJson(DISPLAY_NAMES)) {
    errors.push('publicDisplayNames must preserve the requested six-family order');
  }
  if (canonicalJson(state.familyIds) !== canonicalJson(FAMILY_IDS)) {
    errors.push('familyIds must preserve the six-family provenance order');
  }
  if (state.generatedCaptionTextureCount !== DISPLAY_NAMES.length) {
    errors.push('generatedCaptionTextureCount must be 6');
  }
  if (state.generatedMantleTextureCount !== DISPLAY_NAMES.length) {
    errors.push('generatedMantleTextureCount must be 6');
  }
  const plan = buildResidentPlan(contract);
  if (plan.length !== DISPLAY_NAMES.length) {
    errors.push(`resident plan must carry ${DISPLAY_NAMES.length} family residents`);
  }
  if (
    canonicalJson(plan.map((resident) => resident.publicDisplayName))
    !== canonicalJson(DISPLAY_NAMES)
  ) {
    errors.push('resident nodes must preserve the requested display-name order');
  }
  if (
    canonicalJson(plan.map((resident) => resident.familyId))
    !== canonicalJson(FAMILY_IDS)
  ) {
    errors.push('resident nodes must preserve family provenance order');
  }
  if (new Set(plan.map((resident) => canonicalJson(resident.position))).size !== plan.length) {
    errors.push('resident positions must be unique');
  }
  for (const resident of plan) {
    if (!/^#[a-fA-F0-9]{6}$/.test(resident.accentColor || '')) {
      errors.push(`${resident.publicDisplayName} accentColor must be a six-digit hex color`);
    }
    if (
      !Array.isArray(resident.captionOffset)
      || resident.captionOffset.length !== 3
      || resident.captionOffset.some((value) => !Number.isFinite(value))
    ) {
      errors.push(`${resident.publicDisplayName} captionOffset must be a numeric vec3`);
    }
    const bundlePath = path.resolve(root, resident.characterBundle || '');
    if (!existsSync(bundlePath)) {
      errors.push(`${resident.publicDisplayName} character bundle is missing`);
      continue;
    }
    if (!SHA256_PATTERN.test(resident.characterBundleSha256 || '')) {
      errors.push(`${resident.publicDisplayName} character bundle hash must be lowercase sha256`);
    } else if (sha256File(bundlePath) !== resident.characterBundleSha256) {
      errors.push(`${resident.publicDisplayName} character bundle hash mismatch`);
    }
    const tilePath = path.resolve(root, resident.mantleTile || '');
    if (!existsSync(tilePath)) {
      errors.push(`${resident.publicDisplayName} mantle tile is missing`);
    }
    let bundle;
    try {
      bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    } catch (error) {
      errors.push(`${resident.publicDisplayName} character bundle is invalid JSON: ${error.message}`);
      continue;
    }
    if (bundle.format !== 'character-webgpu/drawspec') {
      errors.push(`${resident.publicDisplayName} bundle must be character-webgpu/drawspec`);
    }
    if (bundle.vertexCount !== state.perResidentVertexCount) {
      errors.push(`${resident.publicDisplayName} vertex count must match the shared contract`);
    }
    if (bundle.jointCount !== state.sharedRigJointCount) {
      errors.push(`${resident.publicDisplayName} joint count must match the shared contract`);
    }
    if (bundle.mesh?.indices?.length / 3 !== state.perResidentTriangleCount) {
      errors.push(`${resident.publicDisplayName} triangle count must match the shared contract`);
    }
    if (bundle.materialGroups?.length !== state.residentMaterialGroupCount) {
      errors.push(`${resident.publicDisplayName} material group count must be 4`);
    }
    if (bundle.mantle?.detachable !== true) {
      errors.push(`${resident.publicDisplayName} mantle must remain detachable`);
    }
  }
  return {
    schema: 'hololand.model-village.resident-convergence-contract.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    plan,
  };
}

function loadResidentBundles(root, plan) {
  return plan.map((resident) => {
    const bundlePath = path.resolve(root, resident.characterBundle);
    const tilePath = path.resolve(root, resident.mantleTile);
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    const tile = JSON.parse(readFileSync(tilePath, 'utf8'));
    return {
      ...resident,
      bundle: {
        format: bundle.format,
        entityId: bundle.entityId,
        jointCount: bundle.jointCount,
        vertexCount: bundle.vertexCount,
        mesh: bundle.mesh,
        materialGroups: bundle.materialGroups,
        mantle: bundle.mantle,
      },
      tile,
      tileSha256: sha256File(tilePath),
    };
  });
}

async function compileResidentConvergence(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileURL(corePath).href);
  const resident = await parseComposition(core, path.resolve(root, SOURCE_RELATIVE));
  const atmosphere = await parseComposition(
    core,
    path.resolve(root, ATMOSPHERE_SOURCE_RELATIVE),
  );
  const geometry = await parseComposition(core, path.resolve(root, GEOMETRY_SOURCE_RELATIVE));
  const material = await parseComposition(core, path.resolve(root, MATERIAL_SOURCE_RELATIVE));
  const base = await parseComposition(core, path.resolve(root, BASE_SOURCE_RELATIVE));
  const atmosphereBridgePath = path.resolve(root, ATMOSPHERE_BRIDGE_RELATIVE);
  const atmosphereBridgeText = readFileSync(atmosphereBridgePath, 'utf8');
  const geometryBridgePath = path.resolve(root, GEOMETRY_BRIDGE_RELATIVE);
  const geometryBridgeText = readFileSync(geometryBridgePath, 'utf8');
  const baseBridgePath = path.resolve(root, BASE_BRIDGE_RELATIVE);
  const baseBridgeText = readFileSync(baseBridgePath, 'utf8');
  const residentValidation = validateResidentConvergenceContract(resident.contract, root);
  const atmosphereValidation = validateAtmosphereConvergenceContract(
    atmosphere.contract,
    root,
  );
  const geometryValidation = validateGeometryConvergenceContract(
    geometry.contract,
    root,
  );
  const materialValidation = validateMaterialConvergenceContract(material.contract, root);
  const baseValidation = validateCourtyardContract(base.contract, root);
  for (const [label, validation] of [
    ['resident', residentValidation],
    ['atmosphere', atmosphereValidation],
    ['geometry', geometryValidation],
    ['material', materialValidation],
    ['base courtyard', baseValidation],
  ]) {
    if (validation.status !== 'pass') {
      throw new Error(`${label} source contract failed: ${validation.errors.join('; ')}`);
    }
  }
  const atmosphereBrowserApplication = extractAtmosphereBrowserApplication(
    atmosphereBridgeText,
  );
  if (
    sha256(atmosphereBrowserApplication)
    !== resident.contract.metadata.atmosphereBrowserApplicationSha256
  ) {
    throw new Error('Atmosphere browser application changed after Resident E was authored');
  }
  const geometryBrowserApplication = extractGeometryBrowserApplication(
    geometryBridgeText,
  );
  if (
    sha256(geometryBrowserApplication)
    !== atmosphere.contract.metadata.geometryBrowserApplicationSha256
  ) {
    throw new Error('Geometry browser application changed after Atmosphere D was authored');
  }
  const materialSets = Object.fromEntries(
    MATERIAL_SURFACES.map((surfaceKey) => [
      surfaceKey,
      serializeMaterialSet(synthesizeMaterialSet(
        material.contract.state.materialSurfaces[surfaceKey],
      )),
    ]),
  );
  const geometryPlan = buildGeometryPlan(geometry.contract.state);
  const geometryPlanCanonical = canonicalJson(geometryPlan);
  const atmospherePlan = buildAtmospherePlan(atmosphere.contract.state);
  const atmospherePlanCanonical = canonicalJson(atmospherePlan);
  const residentPlanCanonical = canonicalJson(residentValidation.plan);
  return {
    resident: {
      ...resident,
      validation: residentValidation,
      plan: residentValidation.plan,
      planCanonical: residentPlanCanonical,
      planHash: sha256(residentPlanCanonical),
      residents: loadResidentBundles(root, residentValidation.plan),
    },
    atmosphere: {
      ...atmosphere,
      validation: atmosphereValidation,
      plan: atmospherePlan,
      planCanonical: atmospherePlanCanonical,
      planHash: sha256(atmospherePlanCanonical),
      bridgePath: atmosphereBridgePath,
      bridgeHash: sha256(atmosphereBridgeText),
      browserApplication: atmosphereBrowserApplication,
      browserApplicationHash: sha256(atmosphereBrowserApplication),
    },
    geometry: {
      ...geometry,
      validation: geometryValidation,
      plan: geometryPlan,
      planCanonical: geometryPlanCanonical,
      planHash: sha256(geometryPlanCanonical),
      bridgePath: geometryBridgePath,
      bridgeHash: sha256(geometryBridgeText),
      browserApplication: geometryBrowserApplication,
      browserApplicationHash: sha256(geometryBrowserApplication),
    },
    material: {
      ...material,
      validation: materialValidation,
      sets: materialSets,
    },
    base: {
      ...base,
      validation: baseValidation,
      bridgePath: baseBridgePath,
      bridgeHash: sha256(baseBridgeText),
      browserApplication: extractBaseBrowserApplication(baseBridgeText),
    },
    corePath,
    coreHash: sha256File(corePath),
  };
}

async function residentConvergenceBrowserApplication(
  THREE,
  RoomEnvironment,
  payload,
  atmosphereApplication,
  geometryApplication,
  baseApplication,
) {
  const convergence = {
    schema: 'hololand.model-village.resident-convergence-browser.v1',
    ready: false,
    status: 'booting',
    error: null,
  };
  window.__MV_RESIDENT_CONVERGENCE__ = convergence;
  try {
    let capturedRenderer = null;
    let capturedScene = null;
    let capturedCamera = null;
    class CapturingRenderer extends THREE.WebGLRenderer {
      constructor(parameters) {
        super(parameters);
        capturedRenderer = this;
      }
    }
    class CapturingScene extends THREE.Scene {
      constructor() {
        super();
        capturedScene = this;
      }
    }
    class CapturingCamera extends THREE.PerspectiveCamera {
      constructor(...args) {
        super(...args);
        capturedCamera = this;
      }
    }
    const capturingThree = {
      ...THREE,
      WebGLRenderer: CapturingRenderer,
      Scene: CapturingScene,
      PerspectiveCamera: CapturingCamera,
    };
    await atmosphereApplication(
      capturingThree,
      RoomEnvironment,
      payload.atmospherePayload,
      geometryApplication,
      baseApplication,
    );
    const atmosphereSnapshot = window.__MV_ATMOSPHERE_CONVERGENCE_SNAPSHOT__?.();
    if (atmosphereSnapshot?.convergence?.status !== 'pass') {
      throw new Error(
        `Inherited Atmosphere Convergence D failed: ${
          atmosphereSnapshot?.convergence?.error || 'unknown'
        }`,
      );
    }
    if (!capturedRenderer || !capturedScene || !capturedCamera) {
      throw new Error('Resident bridge did not capture renderer, scene, and camera');
    }

    const hiddenNeutralNames = [];
    for (const name of payload.resident.hiddenNeutralNames) {
      const neutral = capturedScene.getObjectByName(name);
      if (neutral?.parent) {
        neutral.parent.remove(neutral);
        hiddenNeutralNames.push(name);
      }
    }

    const root = new THREE.Group();
    root.name = 'ResidentConvergenceE';
    capturedScene.add(root);
    const residentMeshes = [];
    const residentCaptions = [];
    const generatedTextures = [];
    const residentMaterials = [];

    function colorChannels(colorValue) {
      const color = new THREE.Color(colorValue);
      return [
        Math.round(color.r * 255),
        Math.round(color.g * 255),
        Math.round(color.b * 255),
      ];
    }

    function buildMantleTexture(resident) {
      const [red, green, blue] = colorChannels(resident.accentColor);
      const bytes = new Uint8Array(resident.tile.size * resident.tile.size * 4);
      for (let index = 0; index < resident.tile.values.length; index += 1) {
        const luminance = resident.tile.values[index];
        bytes[index * 4] = Math.min(255, Math.round(red * luminance));
        bytes[index * 4 + 1] = Math.min(255, Math.round(green * luminance));
        bytes[index * 4 + 2] = Math.min(255, Math.round(blue * luminance));
        bytes[index * 4 + 3] = 255;
      }
      const texture = new THREE.DataTexture(
        bytes,
        resident.tile.size,
        resident.tile.size,
        THREE.RGBAFormat,
      );
      texture.name = `ResidentConvergence:${resident.slug}:mantle`;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(resident.tile.repeat, resident.tile.repeat);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      generatedTextures.push(texture);
      return texture;
    }

    function buildCaptionTexture(resident) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(3, 9, 15, 0.88)';
      context.strokeStyle = resident.accentColor;
      context.lineWidth = 4;
      context.beginPath();
      context.roundRect(8, 8, 496, 112, 28);
      context.fill();
      context.stroke();
      context.fillStyle = '#dce9ec';
      context.font = '600 48px Georgia, serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(resident.publicDisplayName, 256, 60);
      context.fillStyle = resident.accentColor;
      context.fillRect(176, 102, 160, 4);
      const texture = new THREE.CanvasTexture(canvas);
      texture.name = `ResidentConvergence:${resident.slug}:caption`;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      generatedTextures.push(texture);
      return texture;
    }

    function materialFromGroup(group, index, mantleTexture, accentColor) {
      const source = group.material || {};
      const common = {
        color: source.color ?? 0x8da5ad,
        roughness: source.roughness ?? 0.72,
        metalness: source.metalness ?? 0,
        transparent: (source.opacity ?? 1) < 1,
        opacity: source.opacity ?? 1,
      };
      let material;
      if (index === 0) {
        material = new THREE.MeshPhysicalMaterial({
          ...common,
          roughness: 0.56,
          clearcoat: 0.08,
          clearcoatRoughness: 0.68,
          sheen: 0.16,
          sheenRoughness: 0.8,
          sheenColor: 0x6f9fb3,
        });
      } else if (index === 1) {
        material = new THREE.MeshPhysicalMaterial({
          ...common,
          roughness: 0.79,
          sheen: 0.48,
          sheenRoughness: 0.86,
          sheenColor: 0x6b96a5,
        });
      } else if (index === 2) {
        material = new THREE.MeshStandardMaterial({
          ...common,
          color: 0x02070c,
          roughness: 0.32,
          metalness: 0.02,
        });
      } else {
        material = new THREE.MeshPhysicalMaterial({
          ...common,
          color: accentColor,
          map: mantleTexture,
          roughness: 0.62,
          metalness: 0.01,
          clearcoat: 0.12,
          clearcoatRoughness: 0.58,
          sheen: 0.64,
          sheenRoughness: 0.76,
          sheenColor: accentColor,
        });
      }
      material.name = `ResidentConvergence:material:${index}`;
      residentMaterials.push(material);
      return material;
    }

    for (const resident of payload.resident.residents) {
      const geometry = new THREE.BufferGeometry();
      geometry.name = `ResidentConvergence:${resident.slug}:geometry`;
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(resident.bundle.mesh.positions, 3),
      );
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(resident.bundle.mesh.normals, 3),
      );
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(resident.bundle.mesh.uvs, 2),
      );
      geometry.setIndex(resident.bundle.mesh.indices);
      geometry.clearGroups();
      for (const [index, group] of resident.bundle.materialGroups.entries()) {
        geometry.addGroup(group.indexStart, group.indexCount, index);
      }
      geometry.computeBoundingSphere();
      const mantleTexture = buildMantleTexture(resident);
      const materials = resident.bundle.materialGroups.map((group, index) =>
        materialFromGroup(group, index, mantleTexture, resident.accentColor));
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.name = `ResidentConvergence:${resident.publicDisplayName}`;
      mesh.position.fromArray(resident.position);
      mesh.rotation.set(...resident.rotation);
      mesh.scale.fromArray(resident.scale);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.familyId = resident.familyId;
      mesh.userData.bundleSha256 = resident.characterBundleSha256;
      root.add(mesh);
      residentMeshes.push(mesh);

      const contactMaterial = new THREE.MeshBasicMaterial({
        color: 0x010407,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      });
      residentMaterials.push(contactMaterial);
      const contact = new THREE.Mesh(
        new THREE.CircleGeometry(0.72, 32),
        contactMaterial,
      );
      contact.name = `ResidentConvergence:${resident.slug}:contact`;
      contact.position.set(resident.position[0], resident.position[1] + 0.012, resident.position[2]);
      contact.rotation.x = -Math.PI / 2;
      contact.scale.set(1, 0.46, 1);
      root.add(contact);

      const captionMaterial = new THREE.SpriteMaterial({
        map: buildCaptionTexture(resident),
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      });
      residentMaterials.push(captionMaterial);
      const caption = new THREE.Sprite(captionMaterial);
      caption.name = `ResidentConvergence:${resident.slug}:caption`;
      caption.position.set(
        resident.position[0] + resident.captionOffset[0],
        resident.position[1] + resident.captionOffset[1],
        resident.position[2] + resident.captionOffset[2],
      );
      caption.scale.set(1.36, 0.34, 1);
      root.add(caption);
      residentCaptions.push(caption);
    }

    const warmRim = new THREE.DirectionalLight('#ffc47a', 0.22);
    warmRim.name = 'ResidentConvergence:WarmRim';
    warmRim.position.set(3.5, 6.5, 3.2);
    root.add(warmRim);
    const coolKey = new THREE.DirectionalLight('#86bac9', 0.18);
    coolKey.name = 'ResidentConvergence:CoolKey';
    coolKey.position.set(-6.0, 8.0, 8.0);
    root.add(coolKey);

    capturedCamera.position.fromArray(payload.resident.camera.position);
    capturedCamera.fov = payload.resident.camera.fov;
    capturedCamera.near = payload.resident.camera.near;
    capturedCamera.far = payload.resident.camera.far;
    capturedCamera.lookAt(...payload.resident.camera.target);
    capturedCamera.updateProjectionMatrix();
    capturedRenderer.shadowMap.needsUpdate = true;
    capturedRenderer.render(capturedScene, capturedCamera);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    capturedRenderer.render(capturedScene, capturedCamera);

    const planDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload.resident.planCanonical),
    );
    const browserPlanHash = [...new Uint8Array(planDigest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const uniqueMaterials = new Set();
    capturedScene.traverse((object) => {
      if (!object.material) return;
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) uniqueMaterials.add(material.uuid);
    });
    const rendererInfo = {
      calls: capturedRenderer.info.render.calls,
      triangles: capturedRenderer.info.render.triangles,
      points: capturedRenderer.info.render.points,
      lines: capturedRenderer.info.render.lines,
      geometries: capturedRenderer.info.memory.geometries,
      textures: capturedRenderer.info.memory.textures,
      materialCount: uniqueMaterials.size,
    };

    document.title = 'Receipt Loom Courtyard - Resident Convergence E';
    const eyebrow = document.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'STORMGLASS COMMONS // RESIDENT CONVERGENCE E';
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = 'The Six at the Receipt Loom';
    const subtitle = document.querySelector('header p');
    if (subtitle) {
      subtitle.textContent =
        'Six HoloScript-authored family embodiments - immutable blue-hour courtyard - local GPU WebGL2';
    }
    const truthLabels = document.querySelectorAll('.truth span');
    if (truthLabels.length >= 3) {
      truthLabels[0].textContent = 'PUBLIC STORY PROJECTION';
      truthLabels[1].textContent = '6 SOURCE-BOUND RESIDENTS';
      truthLabels[2].textContent = 'LIVE RESEARCH REMAINS BLINDED';
    }
    const legend = document.createElement('aside');
    legend.className = 'resident-convergence-legend';
    legend.innerHTML = `
      <div class="legend-kicker">THE SIX AT STORMGLASS</div>
      <div class="legend-grid">${payload.resident.residents.map((resident) => `
        <div class="legend-resident">
          <i style="--accent:${resident.accentColor}"></i>
          <span>${resident.publicDisplayName}</span>
        </div>`).join('')}
      </div>
      <p>Detachable family mantles · presentation only · no live research join</p>`;
    const style = document.createElement('style');
    style.textContent = `
      .resident-convergence-legend{position:fixed;right:30px;top:30px;z-index:5;width:300px;
        padding:16px 18px;border:1px solid rgba(161,201,210,.25);border-radius:14px;
        color:#dce9ec;background:linear-gradient(145deg,rgba(4,10,18,.91),rgba(9,23,34,.78));
        box-shadow:0 16px 48px rgba(0,0,0,.34);backdrop-filter:blur(14px)}
      .legend-kicker{color:#91c8d1;font:700 10px/1.2 ui-monospace,monospace;
        letter-spacing:.18em;margin-bottom:11px}
      .legend-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px 12px}
      .legend-resident{display:flex;align-items:center;gap:8px;font:600 13px/1.2 system-ui,sans-serif}
      .legend-resident i{display:block;width:9px;height:9px;border-radius:50%;background:var(--accent);
        box-shadow:0 0 12px color-mix(in srgb,var(--accent) 70%,transparent)}
      .resident-convergence-legend p{margin:12px 0 0;padding-top:10px;border-top:1px solid rgba(161,201,210,.14);
        color:#78939d;font:500 9px/1.45 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.07em}`;
    document.head.appendChild(style);
    document.body.appendChild(legend);

    convergence.ready = true;
    convergence.status = 'pass';
    convergence.sourceHash = payload.resident.sourceHash;
    convergence.sceneIrHash = payload.resident.sceneIrHash;
    convergence.planHash = browserPlanHash;
    convergence.atmosphereSourceHash = payload.atmospherePayload.atmosphere.sourceHash;
    convergence.atmosphereBridgeHash = payload.atmosphereBridgeHash;
    convergence.atmosphereBrowserApplicationHash =
      payload.atmosphereBrowserApplicationHash;
    convergence.inheritedAtmosphere = atmosphereSnapshot.convergence;
    convergence.detail = {
      residentCount: residentMeshes.length,
      hiddenNeutralCount: hiddenNeutralNames.length,
      hiddenNeutralNames,
      captionCount: residentCaptions.length,
      generatedTextureCount: generatedTextures.length,
      materialGroupCount: residentMeshes.reduce(
        (count, mesh) => count + mesh.geometry.groups.length,
        0,
      ),
      bundleHashes: Object.fromEntries(
        payload.resident.residents.map((resident) => [
          resident.publicDisplayName,
          resident.characterBundleSha256,
        ]),
      ),
      familyIds: payload.resident.residents.map((resident) => resident.familyId),
      displayNames: payload.resident.residents.map(
        (resident) => resident.publicDisplayName,
      ),
      rendererInfo,
    };
    convergence.presentation = {
      presentationProfile: 'village_story_unblinded',
      separateFromLiveExperiment: true,
      researchLiveIdentityNeutralPreserved: true,
      publicFamilyIdentityPresented: true,
      exactModelRevisionPresented: false,
      providerEndorsementClaimed: false,
      modelBehaviorSimulated: false,
      canonicalWritesAllowed: false,
      residentObservationWritesAllowed: false,
      modelCalls: 0,
      networkFetches: 0,
      continuousClothSimulationClaimed: false,
      productionTailoringClaimed: false,
      gameplayPhysicsClaimed: false,
      photorealismClaimed: false,
    };
    window.__MV_RESIDENT_CONVERGENCE_SNAPSHOT__ = () => ({
      base: atmosphereSnapshot.base,
      geometry: atmosphereSnapshot.geometry,
      atmosphere: atmosphereSnapshot.convergence,
      convergence,
    });
  } catch (error) {
    convergence.ready = true;
    convergence.status = 'fail';
    convergence.error = error?.stack || error?.message || String(error);
  }
}

function buildAtmospherePayload(compiled) {
  const geometryBudget = compiled.geometry.contract.state.qualityBudget;
  const atmosphereBudget = compiled.atmosphere.contract.state.qualityBudget;
  const geometryPayload = {
    schema: 'hololand.model-village.geometry-convergence-render-payload.v1',
    baseBridgeHash: compiled.base.bridgeHash,
    material: {
      sourceHash: compiled.material.sourceHash,
      bindings: compiled.material.contract.state.surfaceBindings,
      sets: compiled.material.sets,
    },
    geometry: {
      sourceHash: compiled.geometry.sourceHash,
      sceneIrHash: compiled.geometry.sceneIrHash,
      planHash: compiled.geometry.planHash,
      planCanonical: compiled.geometry.planCanonical,
      plan: compiled.geometry.plan,
      kitCount: compiled.geometry.contract.state.detailKitCount,
      inheritedWindowProxyNames:
        compiled.geometry.contract.state.geometryKits.windowDepth.inheritedProxyNames,
      camera: compiled.geometry.contract.state.inspectionCamera,
      width: geometryBudget.renderWidth,
      height: geometryBudget.renderHeight,
    },
    base: {
      schema: 'hololand.model-village.receipt-loom-courtyard-render-payload.v1',
      metadata: compiled.base.contract.metadata,
      state: compiled.base.contract.state,
      environment: compiled.base.contract.environment,
      nodes: compiled.base.contract.nodes,
      sourceHash: compiled.base.sourceHash,
      sceneIrHash: compiled.base.sceneIrHash,
    },
  };
  return {
    schema: 'hololand.model-village.atmosphere-convergence-render-payload.v1',
    geometryBridgeHash: compiled.geometry.bridgeHash,
    geometryBrowserApplicationHash: compiled.geometry.browserApplicationHash,
    geometryPayload,
    atmosphere: {
      sourceHash: compiled.atmosphere.sourceHash,
      sceneIrHash: compiled.atmosphere.sceneIrHash,
      planHash: compiled.atmosphere.planHash,
      planCanonical: compiled.atmosphere.planCanonical,
      plan: compiled.atmosphere.plan,
      kitCount: compiled.atmosphere.contract.state.atmosphereKitCount,
      palette: compiled.atmosphere.contract.state.atmospherePalette,
      fog: compiled.atmosphere.contract.state.fogProfile,
      light: compiled.atmosphere.contract.state.practicalLightProfile,
      opacity: compiled.atmosphere.contract.state.atmosphereOpacityProfile,
      camera: compiled.atmosphere.contract.state.inspectionCamera,
      width: atmosphereBudget.renderWidth,
      height: atmosphereBudget.renderHeight,
    },
  };
}

async function buildSurface(outputDir, holoScriptRoot, compiled) {
  const esbuildPath = path.join(holoScriptRoot, 'node_modules', 'esbuild', 'lib', 'main.js');
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const bundlePath = path.join(outputDir, 'resident-convergence-e.bundle.js');
  const htmlPath = path.join(outputDir, 'resident-convergence-e.html');
  const payload = {
    schema: 'hololand.model-village.resident-convergence-render-payload.v1',
    atmosphereBridgeHash: compiled.atmosphere.bridgeHash,
    atmosphereBrowserApplicationHash: compiled.atmosphere.browserApplicationHash,
    atmospherePayload: buildAtmospherePayload(compiled),
    resident: {
      sourceHash: compiled.resident.sourceHash,
      sceneIrHash: compiled.resident.sceneIrHash,
      planHash: compiled.resident.planHash,
      planCanonical: compiled.resident.planCanonical,
      residents: compiled.resident.residents,
      hiddenNeutralNames: ['CraftfolkResident01', 'CraftfolkResident02'],
      camera: compiled.resident.contract.state.inspectionCamera,
      qualityBudget: compiled.resident.contract.state.qualityBudget,
    },
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `const BASE_APPLICATION = ${compiled.base.browserApplication};`,
    `const GEOMETRY_APPLICATION = ${compiled.geometry.browserApplication};`,
    `const ATMOSPHERE_APPLICATION = ${compiled.atmosphere.browserApplication};`,
    `(${residentConvergenceBrowserApplication.toString()})(`,
    '  THREE, RoomEnvironment, PAYLOAD, ATMOSPHERE_APPLICATION,',
    '  GEOMETRY_APPLICATION, BASE_APPLICATION,',
    ');',
  ].join('\n');
  await esbuild.build({
    stdin: {
      contents: appSource,
      resolveDir: holoScriptRoot,
      sourcefile: 'resident-convergence-e.entry.js',
      loader: 'js',
    },
    outfile: bundlePath,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    minify: false,
    sourcemap: false,
    nodePaths: [path.join(holoScriptRoot, 'node_modules')],
    logLevel: 'silent',
  });
  writeFileSync(
    htmlPath,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt Loom Courtyard - Resident Convergence E</title>
</head>
<body>
  <script src="./resident-convergence-e.bundle.js"></script>
</body>
</html>
`,
    'utf8',
  );
  return {
    htmlPath,
    htmlHash: sha256File(htmlPath),
    bundlePath,
    bundleHash: sha256File(bundlePath),
    appSourceHash: sha256(appSource),
    esbuildPath,
    esbuildHash: sha256File(esbuildPath),
  };
}

function rendererIsSoftware(gl) {
  return [
    gl?.maskedRenderer,
    gl?.unmaskedRenderer,
    gl?.maskedVendor,
    gl?.unmaskedVendor,
  ].join(' ').toLowerCase().match(
    /swiftshader|llvmpipe|software rasterizer|lavapipe/,
  );
}

async function captureBrowser({
  browserPath,
  holoScriptRoot,
  htmlPath,
  heroPath,
  timeoutMs,
}) {
  const playwrightPath = path.join(holoScriptRoot, 'node_modules', 'playwright', 'index.mjs');
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const externalRequests = [];
  const consoleMessages = [];
  const pageErrors = [];
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-features=Translate,MediaRouter',
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('file:') && !url.startsWith('data:')) externalRequests.push(url);
    });
    page.on('console', (message) => {
      consoleMessages.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: 'load',
      timeout: timeoutMs,
    });
    await page.waitForFunction(
      () => window.__MV_RESIDENT_CONVERGENCE__?.ready === true,
      undefined,
      { timeout: timeoutMs },
    );
    const state = await page.evaluate(
      () => window.__MV_RESIDENT_CONVERGENCE_SNAPSHOT__?.()
        || { convergence: window.__MV_RESIDENT_CONVERGENCE__ },
    );
    if (state.convergence?.status !== 'pass') {
      throw new Error(
        `Browser resident witness failed: ${
          state.convergence?.error || state.convergence?.status
        }`,
      );
    }
    await page.screenshot({ path: heroPath, type: 'png' });
    return {
      browserVersion: await browser.version(),
      state,
      externalRequests,
      consoleMessages,
      pageErrors,
    };
  } finally {
    await browser.close();
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: REPO_ROOT,
    outputDir: DEFAULT_OUTPUT_DIR,
    heroOutput: null,
    holoScriptRoot: null,
    browser: null,
    timeoutMs: 60_000,
    clean: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--output') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--hero-output') options.heroOutput = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--no-clean') options.clean = false;
    else if (arg === '--help') {
      console.log(`Usage: node scripts/check-hololand-model-village-resident-convergence.mjs [options]
  --root <path>             HoloLand repository root
  --output <path>           Witness output directory
  --hero-output <path>      Optional durable 1600x900 PNG path
  --holoscript-root <path>  Built HoloScript checkout
  --browser <path>          Chrome or Edge executable
  --timeout-ms <number>     Browser timeout (default 60000)
  --no-clean                Preserve prior output directory contents`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function runResidentConvergenceCheck(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const browserPath = resolveBrowser(options.browser);
  if (options.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const compiled = await compileResidentConvergence(root, holoScriptRoot);
  const surface = await buildSurface(outputDir, holoScriptRoot, compiled);
  const heroPath = path.resolve(
    options.heroOutput || path.join(outputDir, 'resident-convergence-e-1600x900.png'),
  );
  mkdirSync(path.dirname(heroPath), { recursive: true });
  const browser = await captureBrowser({
    browserPath,
    holoScriptRoot,
    htmlPath: surface.htmlPath,
    heroPath,
    timeoutMs: options.timeoutMs || 60_000,
  });
  const heroBuffer = readFileSync(heroPath);
  const state = browser.state;
  const convergence = state.convergence;
  const base = state.base;
  const budget = compiled.resident.contract.state.qualityBudget;
  const rendererInfo = convergence.detail.rendererInfo;
  const expectedBundleHashes = Object.fromEntries(
    compiled.resident.residents.map((resident) => [
      resident.publicDisplayName,
      resident.characterBundleSha256,
    ]),
  );
  const checks = {
    residentContractPass: compiled.resident.validation.status === 'pass',
    atmosphereContractPass: compiled.atmosphere.validation.status === 'pass',
    geometryContractPass: compiled.geometry.validation.status === 'pass',
    materialContractPass: compiled.material.validation.status === 'pass',
    baseContractPass: compiled.base.validation.status === 'pass',
    sourceHashReachedBrowser:
      convergence.sourceHash === compiled.resident.sourceHash,
    sceneIrHashReachedBrowser:
      convergence.sceneIrHash === compiled.resident.sceneIrHash,
    residentPlanHashReachedBrowser:
      convergence.planHash === compiled.resident.planHash,
    immutableAtmosphereSourceReachedBrowser:
      convergence.atmosphereSourceHash === compiled.atmosphere.sourceHash,
    immutableAtmosphereBridgeReachedBrowser:
      convergence.atmosphereBridgeHash === compiled.atmosphere.bridgeHash,
    immutableAtmosphereApplicationReachedBrowser:
      convergence.atmosphereBrowserApplicationHash
        === compiled.atmosphere.browserApplicationHash,
    inheritedAtmospherePass: state.atmosphere?.status === 'pass',
    exactResidentCount:
      convergence.detail.residentCount === DISPLAY_NAMES.length,
    exactNeutralReplacement:
      convergence.detail.hiddenNeutralCount === 2
      && canonicalJson(convergence.detail.hiddenNeutralNames)
        === canonicalJson(['CraftfolkResident01', 'CraftfolkResident02']),
    exactCaptions: convergence.detail.captionCount === DISPLAY_NAMES.length,
    exactGeneratedTextures:
      convergence.detail.generatedTextureCount
        === compiled.resident.contract.state.generatedCaptionTextureCount
          + compiled.resident.contract.state.generatedMantleTextureCount,
    exactMaterialGroups:
      convergence.detail.materialGroupCount
        === DISPLAY_NAMES.length
          * compiled.resident.contract.state.residentMaterialGroupCount,
    exactDisplayNames:
      canonicalJson(convergence.detail.displayNames) === canonicalJson(DISPLAY_NAMES),
    exactFamilyIds:
      canonicalJson(convergence.detail.familyIds) === canonicalJson(FAMILY_IDS),
    exactBundleHashes:
      canonicalJson(convergence.detail.bundleHashes) === canonicalJson(expectedBundleHashes),
    webgl2: base.gl?.webgl2 === true,
    hardwareRenderer: !rendererIsSoftware(base.gl),
    d3d11Backend: /direct3d11|d3d11/i.test(base.gl?.unmaskedRenderer || ''),
    noExternalRequests: browser.externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    drawCallBudget: rendererInfo.calls <= budget.maxDrawCalls,
    triangleBudget: rendererInfo.triangles <= budget.maxTriangles,
    materialBudget: rendererInfo.materialCount <= budget.maxMaterials,
    textureBudget: rendererInfo.textures <= budget.maxTextures,
    residentMeshBudget:
      convergence.detail.residentCount <= budget.maxResidentMeshes,
    generatedTextureBudget:
      convergence.detail.generatedTextureCount
        <= budget.maxGeneratedResidentTextures,
    lockedResolution:
      pngDimensions(heroBuffer).width === budget.renderWidth
      && pngDimensions(heroBuffer).height === budget.renderHeight,
    liveResearchSeparation:
      convergence.presentation?.separateFromLiveExperiment === true
      && convergence.presentation?.researchLiveIdentityNeutralPreserved === true,
    identityBoundary:
      convergence.presentation?.publicFamilyIdentityPresented === true
      && convergence.presentation?.exactModelRevisionPresented === false
      && convergence.presentation?.providerEndorsementClaimed === false
      && convergence.presentation?.modelBehaviorSimulated === false,
    readOnlyBoundary:
      convergence.presentation?.canonicalWritesAllowed === false
      && convergence.presentation?.residentObservationWritesAllowed === false
      && convergence.presentation?.modelCalls === 0
      && convergence.presentation?.networkFetches === 0,
    boundedResidentBoundary:
      convergence.presentation?.continuousClothSimulationClaimed === false
      && convergence.presentation?.productionTailoringClaimed === false
      && convergence.presentation?.gameplayPhysicsClaimed === false
      && convergence.presentation?.photorealismClaimed === false,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const receiptCore = {
    schema: 'hololand.model-village.resident-convergence-witness.v1',
    status: failures.length === 0 ? 'pass' : 'fail',
    claim: {
      verified:
        'Six named HoloScript-owned family resident bundles replaced the two neutral staging forms inside the immutable A/B/C/D Receipt Loom courtyard and rendered with distinct silhouettes, woven mantles, glyph provenance, and captions on the local D3D11 GPU path.',
      bounded:
        'Resident Convergence E is a presentation-only village_story_unblinded projection. It is separate from live blinded research, makes no provider-endorsement or exact-model-revision claim, performs no model calls or writes, and does not prove model behavior, continuous cloth simulation, collision-resolved tailoring, gameplay physics, photorealism, measured real-time performance, or full-world convergence.',
    },
    sources: {
      residentOverlay: {
        path: SOURCE_RELATIVE,
        sha256: compiled.resident.sourceHash,
        sceneIrSha256: compiled.resident.sceneIrHash,
        planSha256: compiled.resident.planHash,
      },
      atmosphereOverlay: {
        path: ATMOSPHERE_SOURCE_RELATIVE,
        sha256: compiled.atmosphere.sourceHash,
        sceneIrSha256: compiled.atmosphere.sceneIrHash,
        planSha256: compiled.atmosphere.planHash,
      },
      atmosphereBridge: {
        path: ATMOSPHERE_BRIDGE_RELATIVE,
        sha256: compiled.atmosphere.bridgeHash,
        browserApplicationSha256: compiled.atmosphere.browserApplicationHash,
      },
      geometryOverlay: {
        path: GEOMETRY_SOURCE_RELATIVE,
        sha256: compiled.geometry.sourceHash,
        sceneIrSha256: compiled.geometry.sceneIrHash,
        planSha256: compiled.geometry.planHash,
      },
      materialOverlay: {
        path: MATERIAL_SOURCE_RELATIVE,
        sha256: compiled.material.sourceHash,
        sceneIrSha256: compiled.material.sceneIrHash,
      },
      baseCourtyard: {
        path: BASE_SOURCE_RELATIVE,
        sha256: compiled.base.sourceHash,
        sceneIrSha256: compiled.base.sceneIrHash,
      },
      residentBundles: Object.fromEntries(
        compiled.resident.residents.map((resident) => [
          resident.publicDisplayName,
          {
            path: resident.characterBundle,
            sha256: resident.characterBundleSha256,
            mantleTile: resident.mantleTile,
            mantleTileSha256: resident.tileSha256,
          },
        ]),
      ),
      checker: {
        path: path.relative(root, SCRIPT_PATH).replaceAll('\\', '/'),
        sha256: sha256File(SCRIPT_PATH),
      },
      holoScriptCore: {
        path: compiled.corePath,
        sha256: compiled.coreHash,
      },
    },
    residents: {
      count: convergence.detail.residentCount,
      displayNames: convergence.detail.displayNames,
      familyIds: convergence.detail.familyIds,
      bundleHashes: convergence.detail.bundleHashes,
      hiddenNeutralNames: convergence.detail.hiddenNeutralNames,
      captions: convergence.detail.captionCount,
      generatedTextures: convergence.detail.generatedTextureCount,
      materialGroups: convergence.detail.materialGroupCount,
      inspectionCamera: compiled.resident.contract.state.inspectionCamera,
    },
    bridge: {
      route:
        'HoloScript resident overlay -> six immutable character drawspecs -> immutable D application -> immutable C/B/A witnesses -> Three/WebGL2 presentation',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      esbuildSha256: surface.esbuildHash,
      inheritedSourcesImmutable: true,
      externalAssets: [],
    },
    render: {
      heroPath: path.relative(root, heroPath).replaceAll('\\', '/'),
      heroSha256: sha256(heroBuffer),
      heroBytes: heroBuffer.length,
      dimensions: pngDimensions(heroBuffer),
      browser: browser.browserVersion,
      renderer: base.gl,
      rendererInfo,
      externalRequests: browser.externalRequests,
      pageErrors: browser.pageErrors,
      consoleMessages: browser.consoleMessages,
    },
    presentation: convergence.presentation,
    checks,
    failures,
  };
  const receiptHash = sha256(canonicalJson(receiptCore));
  const receipt = { ...receiptCore, receiptHash };
  const receiptPath = path.join(outputDir, 'resident-convergence-e-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receipt, receiptPath, heroPath };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runResidentConvergenceCheck(parseArgs())
    .then(({ receipt, receiptPath, heroPath }) => {
      console.log(JSON.stringify({
        status: receipt.status,
        receiptHash: receipt.receiptHash,
        receiptPath,
        heroPath,
        gpu: receipt.render.renderer?.unmaskedRenderer,
        residents: receipt.residents.count,
        names: receipt.residents.displayNames,
        calls: receipt.render.rendererInfo.calls,
        triangles: receipt.render.rendererInfo.triangles,
        materials: receipt.render.rendererInfo.materialCount,
        textures: receipt.render.rendererInfo.textures,
        failures: receipt.failures,
      }, null, 2));
      if (receipt.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
