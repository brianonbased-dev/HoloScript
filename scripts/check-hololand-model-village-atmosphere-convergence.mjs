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
  serializeMaterialSet,
  synthesizeMaterialSet,
} from './lib/model-village-material-synthesis.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-atmosphere-convergence.holo';
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
const SYNTHESIS_RELATIVE =
  'scripts/lib/model-village-material-synthesis.mjs';
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'atmosphere-convergence-d',
);
const MATERIAL_SURFACES = Object.freeze([
  'agedTimber',
  'limePlaster',
  'handSplitSlate',
  'wetBasalt',
]);
const KIT_KEYS = Object.freeze([
  'rainField',
  'mistSheets',
  'practicalLanterns',
  'wetPuddles',
  'chimneySmoke',
  'waterRipples',
  'windFoliage',
  'contactDepth',
  'cloudVeils',
]);
const EXPECTED_COUNTS = Object.freeze({
  rainField: 320,
  mistSheets: 10,
  practicalLanterns: 18,
  wetPuddles: 14,
  chimneySmoke: 12,
  waterRipples: 8,
  windFoliage: 48,
  contactDepth: 6,
  cloudVeils: 6,
});
const EXPECTED_INSTANCES = Object.values(EXPECTED_COUNTS)
  .reduce((sum, count) => sum + count, 0);
const EXPECTED_BATCHES = 11;
const EXPECTED_LIGHTS = 6;
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

function round(value) {
  return Number(value.toFixed(6));
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function placement(
  kit,
  batch,
  primitive,
  material,
  position,
  rotation,
  scale,
  options = {},
) {
  return {
    kit,
    batch,
    primitive,
    material,
    position: position.map(round),
    rotation: rotation.map(round),
    scale: scale.map(round),
    billboard: options.billboard === true,
    castShadow: options.castShadow === true,
    receiveShadow: options.receiveShadow === true,
  };
}

export function buildAtmospherePlan(state) {
  const kits = state.atmosphereKits;
  const plan = [];

  const rain = kits.rainField;
  const rainRandom = seeded(rain.seed);
  for (let index = 0; index < rain.instanceCount; index += 1) {
    const length = rain.streakLengthRange[0]
      + rainRandom() * (rain.streakLengthRange[1] - rain.streakLengthRange[0]);
    plan.push(placement(
      'rainField',
      'rain_streaks',
      rain.primitive,
      rain.material,
      [
        -13.5 + rainRandom() * rain.extent[0],
        0.6 + rainRandom() * rain.extent[1],
        -12 + rainRandom() * rain.extent[2],
      ],
      [0, 0, rain.slantRadians + (rainRandom() - 0.5) * 0.08],
      [0.014, length, 0.014],
    ));
  }

  const mist = kits.mistSheets;
  const mistRandom = seeded(mist.seed);
  for (let index = 0; index < mist.instanceCount; index += 1) {
    plan.push(placement(
      'mistSheets',
      'ground_mist_sheets',
      mist.primitive,
      mist.material,
      [
        -10 + mistRandom() * 20,
        0.7 + mistRandom() * 2.2,
        -9 + mistRandom() * 15,
      ],
      [0, 0, 0],
      [4.2 + mistRandom() * 4.1, 1.2 + mistRandom() * 1.5, 1],
      { billboard: true },
    ));
  }

  const lanternLocations = [
    [-8.4, 1.06, 1.5],
    [-4.6, 1.02, 2.25],
    [-2.0, 1.1, -0.8],
    [2.4, 1.04, 3.0],
    [4.7, 1.08, 0.9],
    [7.6, 1.06, 4.45],
  ];
  lanternLocations.forEach(([x, height, z]) => {
    plan.push(placement(
      'practicalLanterns',
      'lantern_posts',
      'cylinder',
      'lantern_copper',
      [x, height * 0.5, z],
      [0, 0, 0],
      [0.075, height, 0.075],
      { castShadow: true },
    ));
    plan.push(placement(
      'practicalLanterns',
      'lantern_glass',
      'icosahedron',
      'lantern_hearth_glass',
      [x, height + 0.14, z],
      [0, 0, 0],
      [0.18, 0.26, 0.18],
    ));
    plan.push(placement(
      'practicalLanterns',
      'lantern_caps',
      'cylinder',
      'lantern_copper',
      [x, height + 0.39, z],
      [0, 0, 0],
      [0.22, 0.09, 0.22],
      { castShadow: true },
    ));
  });

  const puddles = kits.wetPuddles;
  const puddleRandom = seeded(puddles.seed);
  for (let index = 0; index < puddles.instanceCount; index += 1) {
    const angle = puddleRandom() * Math.PI * 2;
    const radius = 1.7 + puddleRandom() * 8.4;
    plan.push(placement(
      'wetPuddles',
      'wet_puddles',
      puddles.primitive,
      puddles.material,
      [Math.cos(angle) * radius, 0.045 + puddleRandom() * 0.018, Math.sin(angle) * radius],
      [-Math.PI / 2, 0, puddleRandom() * Math.PI],
      [0.5 + puddleRandom() * 1.5, 0.24 + puddleRandom() * 0.68, 1],
      { receiveShadow: true },
    ));
  }

  const smoke = kits.chimneySmoke;
  const smokeRandom = seeded(smoke.seed);
  for (let index = 0; index < smoke.instanceCount; index += 1) {
    const normalized = index / Math.max(1, smoke.instanceCount - 1);
    plan.push(placement(
      'chimneySmoke',
      'chimney_smoke',
      smoke.primitive,
      smoke.material,
      [
        -3.75 + normalized * 1.25 + (smokeRandom() - 0.5) * 0.18,
        7.65 + index * 0.37,
        -4.85 - normalized * 0.72 + (smokeRandom() - 0.5) * 0.14,
      ],
      [0, 0, 0],
      [
        0.42 + normalized * 0.65,
        0.34 + normalized * 0.52,
        1,
      ],
      { billboard: true },
    ));
  }

  const ripples = kits.waterRipples;
  const rippleRandom = seeded(ripples.seed);
  for (let index = 0; index < ripples.instanceCount; index += 1) {
    const radius = 0.24 + index * 0.17 + rippleRandom() * 0.04;
    plan.push(placement(
      'waterRipples',
      'cistern_ripples',
      ripples.primitive,
      ripples.material,
      [5.8, 0.585 + index * 0.0015, 3.0],
      [-Math.PI / 2, 0, ripples.sealedPhase * Math.PI * 2],
      [radius, radius, 1],
    ));
  }

  const foliage = kits.windFoliage;
  const foliageRandom = seeded(foliage.seed);
  for (let index = 0; index < foliage.instanceCount; index += 1) {
    const side = index % 3;
    const x = side === 0
      ? -11.5 + foliageRandom() * 5.8
      : side === 1
        ? 5.8 + foliageRandom() * 6.0
        : -7.5 + foliageRandom() * 16;
    const z = side === 0
      ? -2 + foliageRandom() * 9
      : side === 1
        ? -3 + foliageRandom() * 10
        : 6.0 + foliageRandom() * 3.8;
    const height = 0.45 + foliageRandom() * 0.85;
    plan.push(placement(
      'windFoliage',
      'wind_foliage',
      foliage.primitive,
      foliage.material,
      [x, height * 0.5, z],
      [
        foliage.sealedWindPoseRadians + (foliageRandom() - 0.5) * 0.12,
        foliageRandom() * Math.PI * 2,
        -foliage.sealedWindPoseRadians + (foliageRandom() - 0.5) * 0.1,
      ],
      [0.035 + foliageRandom() * 0.03, height, 0.02],
      { castShadow: true },
    ));
  }

  const contactPositions = [
    [-2.15, 0.035, 2.35, 0.72, 0.48],
    [2.85, 0.035, 1.15, 0.78, 0.5],
    [0, 0.035, -0.25, 1.42, 0.88],
    [-5.7, 0.035, -4.1, 3.3, 2.35],
    [5.8, 0.035, 3.0, 2.4, 2.0],
    [-3.6, 0.035, 1.0, 1.35, 0.72],
  ];
  contactPositions.forEach(([x, y, z, width, depth]) => {
    plan.push(placement(
      'contactDepth',
      'contact_depth',
      'circle',
      kits.contactDepth.material,
      [x, y, z],
      [-Math.PI / 2, 0, 0],
      [width, depth, 1],
    ));
  });

  const cloud = kits.cloudVeils;
  const cloudRandom = seeded(cloud.seed);
  for (let index = 0; index < cloud.instanceCount; index += 1) {
    plan.push(placement(
      'cloudVeils',
      'cloud_veils',
      cloud.primitive,
      cloud.material,
      [
        -15 + index * 6 + (cloudRandom() - 0.5) * 2,
        7.2 + cloudRandom() * 3.6,
        -15 - index * 1.1,
      ],
      [0, 0, 0],
      [6.5 + cloudRandom() * 4.2, 1.8 + cloudRandom() * 1.6, 1],
      { billboard: true },
    ));
  }

  return plan;
}

export function extractGeometryBrowserApplication(sourceText) {
  const startMarker = 'async function geometryConvergenceBrowserApplication(';
  const endMarker = '\n\nasync function buildSurface';
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Unable to extract the sealed Geometry Convergence C browser application');
  }
  return sourceText.slice(start, end);
}

export function validateAtmosphereConvergenceContract(contract, root = REPO_ROOT) {
  const errors = [];
  const { metadata, state, nodes } = contract;
  if (metadata.worldName !== 'Stormglass Commons') {
    errors.push('worldName must be Stormglass Commons');
  }
  if (metadata.artStyle !== 'hearthlight_biorealism') {
    errors.push('artStyle must be hearthlight_biorealism');
  }
  if (metadata.milestone !== 'MV_V1_ATMOSPHERE_CONVERGENCE_D') {
    errors.push('milestone must be MV_V1_ATMOSPHERE_CONVERGENCE_D');
  }
  if (metadata.projectionRole !== 'read_only_atmosphere_development') {
    errors.push('projectionRole must be read_only_atmosphere_development');
  }
  if (metadata.inheritedSourcesImmutable !== true) {
    errors.push('inheritedSourcesImmutable must be true');
  }
  if (metadata.bridgeMayOwnPresentationOnly !== true) {
    errors.push('bridgeMayOwnPresentationOnly must be true');
  }
  if (metadata.externalAssetsRequired !== false) {
    errors.push('externalAssetsRequired must remain false');
  }
  for (const [relativePath, expectedHash, label] of [
    [metadata.geometrySource, metadata.geometrySourceSha256, 'geometry source'],
    [metadata.geometryBridge, metadata.geometryBridgeSha256, 'geometry bridge'],
    [metadata.geometryTest, metadata.geometryTestSha256, 'geometry test'],
    [metadata.geometryReport, metadata.geometryReportSha256, 'geometry report'],
    [metadata.geometryHero, metadata.geometryHeroSha256, 'geometry hero'],
    [metadata.geometryManifest, metadata.geometryManifestSha256, 'geometry manifest'],
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
  if (!SHA256_PATTERN.test(metadata.geometryBrowserApplicationSha256 || '')) {
    errors.push('geometryBrowserApplicationSha256 must be lowercase sha256');
  }
  if (state.authority !== 'read_only') errors.push('authority must be read_only');
  if (state.canonicalWritesAllowed !== false) {
    errors.push('canonicalWritesAllowed must remain false');
  }
  if (state.modelCallsAllowed !== false) errors.push('modelCallsAllowed must remain false');
  if (state.networkFetchesAllowed !== false) {
    errors.push('networkFetchesAllowed must remain false');
  }
  if (state.researchLiveBlindedCompatible !== true) {
    errors.push('atmosphere convergence must remain live-blinded compatible');
  }
  if (
    state.publicFamilyIdentityPresented !== false
    || state.exactModelIdentityPresented !== false
  ) {
    errors.push('atmosphere convergence must not expose public or exact model identity');
  }
  for (const key of [
    'productionResidentClaimed',
    'fullWorldConvergenceClaimed',
    'gameplayPhysicsClaimed',
    'scannedAssetClaimed',
    'measuredRealTimePerformanceClaimed',
    'photorealismClaimed',
    'continuousWeatherSimulationClaimed',
    'volumetricFogClaimed',
    'fluidSimulationClaimed',
    'physicallySimulatedRainClaimed',
    'productionFoliagePhysicsClaimed',
  ]) {
    if (state[key] !== false) errors.push(`${key} must remain false`);
  }
  if (state.atmosphereConvergenceClaimed !== true) {
    errors.push('atmosphereConvergenceClaimed must be true');
  }
  if (state.sourceAtmosphereAuthority !== 'holoscript') {
    errors.push('sourceAtmosphereAuthority must be holoscript');
  }
  if (state.atmosphereMaterializationBridge !== 'deterministic_local_presentation_only') {
    errors.push('atmosphereMaterializationBridge must be deterministic_local_presentation_only');
  }
  if (state.environmentMode !== 'stormglass_blue_hour_after_rain') {
    errors.push('environmentMode must be stormglass_blue_hour_after_rain');
  }
  if (state.atmosphereKitCount !== KIT_KEYS.length) {
    errors.push(`atmosphereKitCount must be ${KIT_KEYS.length}`);
  }
  if (state.atmosphereInstanceCount !== EXPECTED_INSTANCES) {
    errors.push(`atmosphereInstanceCount must be ${EXPECTED_INSTANCES}`);
  }
  if (state.atmosphereBatchCount !== EXPECTED_BATCHES) {
    errors.push(`atmosphereBatchCount must be ${EXPECTED_BATCHES}`);
  }
  if (state.practicalLightCount !== EXPECTED_LIGHTS) {
    errors.push(`practicalLightCount must be ${EXPECTED_LIGHTS}`);
  }
  if (state.generatedTextureCount !== 1) {
    errors.push('generatedTextureCount must be 1');
  }
  if (state.fogProfile?.model !== 'exponential_squared') {
    errors.push('fogProfile.model must be exponential_squared');
  }
  if (
    typeof state.fogProfile?.density !== 'number'
    || state.fogProfile.density <= 0
    || state.fogProfile.density > 0.03
  ) {
    errors.push('fogProfile.density must be within (0, 0.03]');
  }
  for (const [key, value] of Object.entries(state.atmosphereOpacityProfile || {})) {
    if (typeof value !== 'number' || value <= 0 || value > 1) {
      errors.push(`atmosphereOpacityProfile.${key} must be within (0, 1]`);
    }
  }
  if (Object.keys(state.atmosphereOpacityProfile || {}).length !== 7) {
    errors.push('atmosphereOpacityProfile must carry exactly seven bounded channels');
  }
  if (
    typeof state.practicalLightProfile?.glassEmissiveIntensity !== 'number'
    || state.practicalLightProfile.glassEmissiveIntensity <= 0
    || state.practicalLightProfile.glassEmissiveIntensity > 4
  ) {
    errors.push('glassEmissiveIntensity must be within (0, 4]');
  }
  if (
    !Array.isArray(state.inspectionCamera?.position)
    || state.inspectionCamera.position.length !== 3
    || !Array.isArray(state.inspectionCamera?.target)
    || state.inspectionCamera.target.length !== 3
    || state.inspectionCamera.fov < 30
    || state.inspectionCamera.fov > 55
  ) {
    errors.push('inspectionCamera must carry a bounded position, target, and 30-55 degree fov');
  }
  const kits = state.atmosphereKits || {};
  for (const kitKey of KIT_KEYS) {
    if (!kits[kitKey]) {
      errors.push(`missing atmosphere kit ${kitKey}`);
      continue;
    }
    if (kits[kitKey].instanceCount !== EXPECTED_COUNTS[kitKey]) {
      errors.push(`${kitKey} must declare ${EXPECTED_COUNTS[kitKey]} instances`);
    }
  }
  if (Object.keys(kits).sort().join(',') !== [...KIT_KEYS].sort().join(',')) {
    errors.push('atmosphereKits must contain exactly the nine accepted kits');
  }
  const kitNodes = nodes.filter(
    (node) => node.props?.properties?.presentationKit
      === 'deterministic_atmosphere_detail',
  );
  const nodeKeys = kitNodes.map((node) => node.props.properties.kitKey).sort();
  if (canonicalJson(nodeKeys) !== canonicalJson([...KIT_KEYS].sort())) {
    errors.push('the HoloScript scene must carry one authority node per atmosphere kit');
  }
  if (kitNodes.some((node) => node.props?.visible !== false)) {
    errors.push('atmosphere authority nodes must remain invisible');
  }
  let plan = [];
  try {
    plan = buildAtmospherePlan(state);
  } catch (error) {
    errors.push(`atmosphere plan failed: ${error.message}`);
  }
  const batchCount = new Set(plan.map((entry) => entry.batch)).size;
  if (plan.length !== EXPECTED_INSTANCES) {
    errors.push(`atmosphere plan must materialize ${EXPECTED_INSTANCES} instances`);
  }
  if (batchCount !== EXPECTED_BATCHES) {
    errors.push(`atmosphere plan must materialize ${EXPECTED_BATCHES} batches`);
  }
  for (const kitKey of KIT_KEYS) {
    const count = plan.filter((entry) => entry.kit === kitKey).length;
    if (count !== EXPECTED_COUNTS[kitKey]) {
      errors.push(`${kitKey} plan count must be ${EXPECTED_COUNTS[kitKey]}`);
    }
  }
  return {
    schema: 'hololand.model-village.atmosphere-convergence-contract.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    counts: {
      kits: Object.keys(kits).length,
      instances: plan.length,
      batches: batchCount,
      authorityNodes: kitNodes.length,
      practicalLights: state.practicalLightCount,
    },
    plan,
  };
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

async function compileAtmosphereConvergence(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileURL(corePath).href);
  const atmosphere = await parseComposition(core, path.resolve(root, SOURCE_RELATIVE));
  const geometry = await parseComposition(core, path.resolve(root, GEOMETRY_SOURCE_RELATIVE));
  const material = await parseComposition(core, path.resolve(root, MATERIAL_SOURCE_RELATIVE));
  const base = await parseComposition(core, path.resolve(root, BASE_SOURCE_RELATIVE));
  const geometryBridgePath = path.resolve(root, GEOMETRY_BRIDGE_RELATIVE);
  const geometryBridgeText = readFileSync(geometryBridgePath, 'utf8');
  const baseBridgePath = path.resolve(root, BASE_BRIDGE_RELATIVE);
  const baseBridgeText = readFileSync(baseBridgePath, 'utf8');
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
    ['atmosphere', atmosphereValidation],
    ['geometry', geometryValidation],
    ['material', materialValidation],
    ['base courtyard', baseValidation],
  ]) {
    if (validation.status !== 'pass') {
      throw new Error(`${label} source contract failed: ${validation.errors.join('; ')}`);
    }
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
  const atmospherePlan = atmosphereValidation.plan;
  const atmospherePlanCanonical = canonicalJson(atmospherePlan);
  return {
    atmosphere: {
      ...atmosphere,
      validation: atmosphereValidation,
      plan: atmospherePlan,
      planCanonical: atmospherePlanCanonical,
      planHash: sha256(atmospherePlanCanonical),
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

async function atmosphereConvergenceBrowserApplication(
  THREE,
  RoomEnvironment,
  payload,
  geometryApplication,
  baseApplication,
) {
  const convergence = {
    schema: 'hololand.model-village.atmosphere-convergence-browser.v1',
    ready: false,
    status: 'booting',
    error: null,
  };
  window.__MV_ATMOSPHERE_CONVERGENCE__ = convergence;
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
    await geometryApplication(
      capturingThree,
      RoomEnvironment,
      payload.geometryPayload,
      baseApplication,
    );
    const geometrySnapshot = window.__MV_GEOMETRY_CONVERGENCE_SNAPSHOT__?.();
    if (geometrySnapshot?.convergence?.status !== 'pass') {
      throw new Error(
        `Inherited Geometry Convergence C failed: ${
          geometrySnapshot?.convergence?.error || 'unknown'
        }`,
      );
    }
    if (!capturedRenderer || !capturedScene || !capturedCamera) {
      throw new Error('Atmosphere bridge did not capture renderer, scene, and camera');
    }

    const atmosphere = payload.atmosphere;
    const palette = atmosphere.palette;
    capturedScene.background = new THREE.Color(palette.background);
    capturedScene.fog = new THREE.FogExp2(palette.fog, atmosphere.fog.density);
    capturedRenderer.toneMappingExposure = atmosphere.fog.toneMappingExposure;

    const softCanvas = document.createElement('canvas');
    softCanvas.width = atmosphere.fog.generatedSoftTextureResolution;
    softCanvas.height = atmosphere.fog.generatedSoftTextureResolution;
    const context = softCanvas.getContext('2d');
    const gradient = context.createRadialGradient(
      softCanvas.width * 0.5,
      softCanvas.height * 0.5,
      0,
      softCanvas.width * 0.5,
      softCanvas.height * 0.5,
      softCanvas.width * 0.5,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0.94)');
    gradient.addColorStop(0.36, 'rgba(255,255,255,0.62)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.16)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, softCanvas.width, softCanvas.height);
    const softTexture = new THREE.CanvasTexture(softCanvas);
    softTexture.name = 'mv:atmosphere:soft-radial';
    softTexture.colorSpace = THREE.NoColorSpace;
    softTexture.needsUpdate = true;

    const materials = {
      sealed_rain: new THREE.MeshBasicMaterial({
        name: 'sealed_rain',
        color: palette.rain,
        transparent: true,
        opacity: atmosphere.opacity.rain,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
      ground_mist: new THREE.MeshBasicMaterial({
        name: 'ground_mist',
        color: palette.mist,
        map: softTexture,
        transparent: true,
        opacity: atmosphere.opacity.mist,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      lantern_copper: new THREE.MeshPhysicalMaterial({
        name: 'lantern_copper',
        color: palette.copper,
        roughness: 0.38,
        metalness: 0.68,
        clearcoat: 0.24,
        clearcoatRoughness: 0.32,
      }),
      lantern_hearth_glass: new THREE.MeshPhysicalMaterial({
        name: 'lantern_hearth_glass',
        color: palette.hearth,
        emissive: palette.hearth,
        emissiveIntensity: atmosphere.light.glassEmissiveIntensity,
        roughness: 0.16,
        metalness: 0,
        transparent: true,
        opacity: atmosphere.light.glassOpacity,
        transmission: 0,
        thickness: 0.08,
      }),
      rain_wet_puddle: new THREE.MeshPhysicalMaterial({
        name: 'rain_wet_puddle',
        color: palette.wet,
        roughness: 0.12,
        metalness: 0.02,
        clearcoat: 0.92,
        clearcoatRoughness: 0.08,
        transparent: true,
        opacity: atmosphere.opacity.puddle,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      soft_chimney_smoke: new THREE.MeshBasicMaterial({
        name: 'soft_chimney_smoke',
        color: palette.smoke,
        map: softTexture,
        transparent: true,
        opacity: atmosphere.opacity.smoke,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      cistern_ripple_highlight: new THREE.MeshBasicMaterial({
        name: 'cistern_ripple_highlight',
        color: palette.ripple,
        transparent: true,
        opacity: atmosphere.opacity.ripple,
        depthWrite: false,
      }),
      stormglass_wind_leaf: new THREE.MeshPhysicalMaterial({
        name: 'stormglass_wind_leaf',
        color: palette.foliage,
        roughness: 0.86,
        metalness: 0,
        clearcoat: 0.14,
        clearcoatRoughness: 0.48,
      }),
      soft_contact_depth: new THREE.MeshBasicMaterial({
        name: 'soft_contact_depth',
        color: palette.contact,
        transparent: true,
        opacity: atmosphere.opacity.contact,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
      storm_cloud_veil: new THREE.MeshBasicMaterial({
        name: 'storm_cloud_veil',
        color: palette.cloud,
        map: softTexture,
        transparent: true,
        opacity: atmosphere.opacity.cloud,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
    const geometries = {
      box: new THREE.BoxGeometry(1, 1, 1),
      plane: new THREE.PlaneGeometry(1, 1),
      circle: new THREE.CircleGeometry(0.5, 32),
      cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
      icosahedron: new THREE.IcosahedronGeometry(0.5, 1),
      torus: new THREE.TorusGeometry(0.5, 0.018, 8, 48),
    };
    const batches = new Map();
    for (const item of atmosphere.plan) {
      if (!batches.has(item.batch)) batches.set(item.batch, []);
      batches.get(item.batch).push(item);
    }
    const atmosphereRoot = new THREE.Group();
    atmosphereRoot.name = 'AtmosphereConvergenceD';
    capturedScene.add(atmosphereRoot);
    const matrix = new THREE.Matrix4();
    const positionValue = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scaleValue = new THREE.Vector3();
    const atmosphereMeshes = [];
    for (const [batchName, items] of batches) {
      const first = items[0];
      const geometry = geometries[first.primitive];
      const material = materials[first.material];
      if (!geometry || !material) {
        throw new Error(`Missing atmosphere geometry or material for ${batchName}`);
      }
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      mesh.name = `AtmosphereConvergence:${batchName}`;
      mesh.castShadow = items.some((item) => item.castShadow);
      mesh.receiveShadow = items.some((item) => item.receiveShadow);
      mesh.frustumCulled = false;
      mesh.renderOrder = first.kit === 'cloudVeils'
        ? 2
        : first.kit === 'mistSheets'
          ? 10
          : first.kit === 'chimneySmoke'
            ? 14
            : first.kit === 'rainField'
              ? 20
              : 5;
      items.forEach((item, index) => {
        positionValue.fromArray(item.position);
        if (item.billboard) {
          quaternion.copy(capturedCamera.quaternion);
        } else {
          euler.set(...item.rotation);
          quaternion.setFromEuler(euler);
        }
        scaleValue.fromArray(item.scale);
        matrix.compose(positionValue, quaternion, scaleValue);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      atmosphereRoot.add(mesh);
      atmosphereMeshes.push(mesh);
    }

    const practicalLightPositions = atmosphere.plan
      .filter((item) => item.batch === 'lantern_glass')
      .map((item) => item.position);
    for (const [index, position] of practicalLightPositions.entries()) {
      const light = new THREE.PointLight(
        palette.hearth,
        atmosphere.light.intensity,
        atmosphere.light.distance,
        atmosphere.light.decay,
      );
      light.name = `AtmosphereConvergence:PracticalLight:${index + 1}`;
      light.position.fromArray(position);
      light.castShadow = atmosphere.light.castShadow;
      atmosphereRoot.add(light);
    }
    const coolFill = new THREE.HemisphereLight('#6b93ac', '#071017', 0.28);
    coolFill.name = 'AtmosphereConvergence:CoolFill';
    capturedScene.add(coolFill);

    capturedCamera.position.fromArray(atmosphere.camera.position);
    capturedCamera.fov = atmosphere.camera.fov;
    capturedCamera.near = atmosphere.camera.near;
    capturedCamera.far = atmosphere.camera.far;
    capturedCamera.lookAt(...atmosphere.camera.target);
    capturedCamera.updateProjectionMatrix();
    capturedRenderer.shadowMap.needsUpdate = true;
    capturedRenderer.render(capturedScene, capturedCamera);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    capturedRenderer.render(capturedScene, capturedCamera);

    const planDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(atmosphere.planCanonical),
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
    const batchInstances = Object.fromEntries(
      [...batches.entries()].map(([name, items]) => [name, items.length]),
    );

    document.title = 'Receipt Loom Courtyard - Atmosphere Convergence D';
    const eyebrow = document.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'STORMGLASS COMMONS // ATMOSPHERE CONVERGENCE D';
    const subtitle = document.querySelector('header p');
    if (subtitle) {
      subtitle.textContent =
        'Hearthlight Biorealism - HoloScript-authored blue-hour atmosphere - local GPU WebGL2';
    }
    const truthLabels = document.querySelectorAll('.truth span');
    if (truthLabels.length >= 3) {
      truthLabels[0].textContent = 'SEALED BLUE-HOUR ATMOSPHERE';
      truthLabels[1].textContent = `${atmosphere.plan.length} AUTHORED INSTANCES`;
      truthLabels[2].textContent = `${practicalLightPositions.length} PRACTICAL LIGHTS`;
    }

    convergence.ready = true;
    convergence.status = 'pass';
    convergence.sourceHash = atmosphere.sourceHash;
    convergence.sceneIrHash = atmosphere.sceneIrHash;
    convergence.planHash = browserPlanHash;
    convergence.geometrySourceHash = payload.geometryPayload.geometry.sourceHash;
    convergence.geometryBridgeHash = payload.geometryBridgeHash;
    convergence.geometryBrowserApplicationHash = payload.geometryBrowserApplicationHash;
    convergence.inheritedGeometry = geometrySnapshot.convergence;
    convergence.detail = {
      kitCount: atmosphere.kitCount,
      instanceCount: atmosphere.plan.length,
      batchCount: batches.size,
      practicalLightCount: practicalLightPositions.length,
      generatedTextureCount: 1,
      batchInstances,
      fog: {
        model: 'FogExp2',
        color: `#${capturedScene.fog.color.getHexString()}`,
        density: capturedScene.fog.density,
      },
      toneMappingExposure: capturedRenderer.toneMappingExposure,
      rendererInfo,
    };
    convergence.presentation = {
      publicFamilyIdentityPresented: false,
      exactModelIdentityPresented: false,
      productionResidentClaimed: false,
      canonicalWritesAllowed: false,
      modelCalls: 0,
      continuousWeatherSimulationClaimed: false,
      volumetricFogClaimed: false,
      fluidSimulationClaimed: false,
      physicallySimulatedRainClaimed: false,
      productionFoliagePhysicsClaimed: false,
    };
    window.__MV_ATMOSPHERE_CONVERGENCE_SNAPSHOT__ = () => ({
      base: geometrySnapshot.base,
      geometry: geometrySnapshot.convergence,
      convergence,
    });
  } catch (error) {
    convergence.ready = true;
    convergence.status = 'fail';
    convergence.error = error?.stack || error?.message || String(error);
  }
}

async function buildSurface(outputDir, holoScriptRoot, compiled) {
  const esbuildPath = path.join(holoScriptRoot, 'node_modules', 'esbuild', 'lib', 'main.js');
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const bundlePath = path.join(outputDir, 'atmosphere-convergence-d.bundle.js');
  const htmlPath = path.join(outputDir, 'atmosphere-convergence-d.html');
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
  const payload = {
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
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `const BASE_APPLICATION = ${compiled.base.browserApplication};`,
    `const GEOMETRY_APPLICATION = ${compiled.geometry.browserApplication};`,
    `(${atmosphereConvergenceBrowserApplication.toString()})(`,
    '  THREE, RoomEnvironment, PAYLOAD, GEOMETRY_APPLICATION, BASE_APPLICATION,',
    ');',
  ].join('\n');
  await esbuild.build({
    stdin: {
      contents: appSource,
      resolveDir: holoScriptRoot,
      sourcefile: 'atmosphere-convergence-d.entry.js',
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
  <title>Receipt Loom Courtyard - Atmosphere Convergence D</title>
</head>
<body>
  <script src="./atmosphere-convergence-d.bundle.js"></script>
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
    baseBrowserApplicationHash: sha256(compiled.base.browserApplication),
    geometryBrowserApplicationHash: sha256(compiled.geometry.browserApplication),
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
      () => window.__MV_ATMOSPHERE_CONVERGENCE__?.ready === true,
      undefined,
      { timeout: timeoutMs },
    );
    const state = await page.evaluate(
      () => window.__MV_ATMOSPHERE_CONVERGENCE_SNAPSHOT__?.()
        || { convergence: window.__MV_ATMOSPHERE_CONVERGENCE__ },
    );
    if (state.convergence?.status !== 'pass') {
      throw new Error(
        `Browser atmosphere witness failed: ${
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
      console.log(`Usage: node scripts/check-hololand-model-village-atmosphere-convergence.mjs [options]
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

export async function runAtmosphereConvergenceCheck(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const browserPath = resolveBrowser(options.browser);
  if (options.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const compiled = await compileAtmosphereConvergence(root, holoScriptRoot);
  const surface = await buildSurface(outputDir, holoScriptRoot, compiled);
  const heroPath = path.resolve(
    options.heroOutput || path.join(outputDir, 'atmosphere-convergence-d-1600x900.png'),
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
  const geometry = state.geometry;
  const budget = compiled.atmosphere.contract.state.qualityBudget;
  const rendererInfo = convergence.detail.rendererInfo;
  const checks = {
    atmosphereContractPass: compiled.atmosphere.validation.status === 'pass',
    geometryContractPass: compiled.geometry.validation.status === 'pass',
    materialContractPass: compiled.material.validation.status === 'pass',
    baseContractPass: compiled.base.validation.status === 'pass',
    sourceHashReachedBrowser:
      convergence.sourceHash === compiled.atmosphere.sourceHash,
    sceneIrHashReachedBrowser:
      convergence.sceneIrHash === compiled.atmosphere.sceneIrHash,
    atmospherePlanHashReachedBrowser:
      convergence.planHash === compiled.atmosphere.planHash,
    immutableGeometrySourceReachedBrowser:
      convergence.geometrySourceHash === compiled.geometry.sourceHash,
    immutableGeometryBridgeReachedBrowser:
      convergence.geometryBridgeHash === compiled.geometry.bridgeHash,
    immutableGeometryApplicationReachedBrowser:
      convergence.geometryBrowserApplicationHash
        === compiled.geometry.browserApplicationHash,
    inheritedGeometryPass: geometry?.status === 'pass',
    atmosphereCounts:
      convergence.detail.kitCount === KIT_KEYS.length
      && convergence.detail.instanceCount === EXPECTED_INSTANCES
      && convergence.detail.batchCount === EXPECTED_BATCHES,
    practicalLightCoverage:
      convergence.detail.practicalLightCount === EXPECTED_LIGHTS,
    generatedTextureBounded:
      convergence.detail.generatedTextureCount === 1,
    exactRainCount:
      convergence.detail.batchInstances.rain_streaks === EXPECTED_COUNTS.rainField,
    exactMistCount:
      convergence.detail.batchInstances.ground_mist_sheets === EXPECTED_COUNTS.mistSheets,
    exactSmokeCount:
      convergence.detail.batchInstances.chimney_smoke === EXPECTED_COUNTS.chimneySmoke,
    exactRippleCount:
      convergence.detail.batchInstances.cistern_ripples === EXPECTED_COUNTS.waterRipples,
    exactFoliageCount:
      convergence.detail.batchInstances.wind_foliage === EXPECTED_COUNTS.windFoliage,
    exactContactCount:
      convergence.detail.batchInstances.contact_depth === EXPECTED_COUNTS.contactDepth,
    fogProfileApplied:
      convergence.detail.fog.model === 'FogExp2'
      && convergence.detail.fog.color
        === compiled.atmosphere.contract.state.atmospherePalette.fog
      && convergence.detail.fog.density
        === compiled.atmosphere.contract.state.fogProfile.density,
    webgl2: base.gl?.webgl2 === true,
    hardwareRenderer: !rendererIsSoftware(base.gl),
    d3d11Backend: /direct3d11|d3d11/i.test(base.gl?.unmaskedRenderer || ''),
    noExternalRequests: browser.externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    drawCallBudget: rendererInfo.calls <= budget.maxDrawCalls,
    triangleBudget: rendererInfo.triangles <= budget.maxTriangles,
    materialBudget: rendererInfo.materialCount <= budget.maxMaterials,
    textureBudget: rendererInfo.textures <= budget.maxTextures,
    atmosphereBatchBudget:
      convergence.detail.batchCount <= budget.maxAtmosphereBatches,
    practicalLightBudget:
      convergence.detail.practicalLightCount <= budget.maxPracticalLights,
    lockedResolution:
      pngDimensions(heroBuffer).width === budget.renderWidth
      && pngDimensions(heroBuffer).height === budget.renderHeight,
    neutralResidentBoundary:
      base.presentation?.neutralCraftfolkCount === 2
      && convergence.presentation?.publicFamilyIdentityPresented === false
      && convergence.presentation?.exactModelIdentityPresented === false
      && convergence.presentation?.productionResidentClaimed === false,
    readOnlyBoundary:
      convergence.presentation?.canonicalWritesAllowed === false
      && convergence.presentation?.modelCalls === 0,
    boundedAtmosphereBoundary:
      convergence.presentation?.continuousWeatherSimulationClaimed === false
      && convergence.presentation?.volumetricFogClaimed === false
      && convergence.presentation?.fluidSimulationClaimed === false
      && convergence.presentation?.physicallySimulatedRainClaimed === false
      && convergence.presentation?.productionFoliagePhysicsClaimed === false,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const receiptCore = {
    schema: 'hololand.model-village.atmosphere-convergence-witness.v1',
    status: failures.length === 0 ? 'pass' : 'fail',
    claim: {
      verified:
        'Nine HoloScript-owned atmosphere kits materialized as 442 deterministic instances in 11 batches with six practical lights, inherited the immutable A/B/C witnesses, and rendered on the local D3D11 GPU path.',
      bounded:
        'Atmosphere Convergence D is one sealed blue-hour presentation state with local soft-sheet mist and smoke, deterministic rain streaks, ripple highlights, wetness patches, restrained cloud veils, a shared foliage pose, and contact-depth patches. It does not claim volumetric fog, fluid simulation, physically simulated rain, continuous weather, production foliage physics, production residents, full-world convergence, photorealism, gameplay physics, or measured real-time performance.',
    },
    sources: {
      atmosphereOverlay: {
        path: SOURCE_RELATIVE,
        sha256: compiled.atmosphere.sourceHash,
        sceneIrSha256: compiled.atmosphere.sceneIrHash,
        planSha256: compiled.atmosphere.planHash,
      },
      geometryOverlay: {
        path: GEOMETRY_SOURCE_RELATIVE,
        sha256: compiled.geometry.sourceHash,
        sceneIrSha256: compiled.geometry.sceneIrHash,
        planSha256: compiled.geometry.planHash,
      },
      geometryBridge: {
        path: GEOMETRY_BRIDGE_RELATIVE,
        sha256: compiled.geometry.bridgeHash,
        browserApplicationSha256: compiled.geometry.browserApplicationHash,
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
      inheritedBridge: {
        path: BASE_BRIDGE_RELATIVE,
        sha256: compiled.base.bridgeHash,
        browserApplicationSha256: surface.baseBrowserApplicationHash,
      },
      materialSynthesis: {
        path: SYNTHESIS_RELATIVE,
        sha256: sha256File(path.resolve(root, SYNTHESIS_RELATIVE)),
      },
      checker: {
        path: path.relative(root, SCRIPT_PATH).replaceAll('\\', '/'),
        sha256: sha256File(SCRIPT_PATH),
      },
      holoScriptCore: {
        path: compiled.corePath,
        sha256: compiled.coreHash,
      },
    },
    atmosphere: {
      kits: Object.fromEntries(KIT_KEYS.map((kitKey) => [
        kitKey,
        {
          instances: EXPECTED_COUNTS[kitKey],
          seed: compiled.atmosphere.contract.state.atmosphereKits[kitKey].seed,
          physicalReading:
            compiled.atmosphere.contract.state.atmosphereKits[kitKey].physicalReading,
        },
      ])),
      instanceCount: convergence.detail.instanceCount,
      batchCount: convergence.detail.batchCount,
      practicalLightCount: convergence.detail.practicalLightCount,
      generatedTextureCount: convergence.detail.generatedTextureCount,
      batchInstances: convergence.detail.batchInstances,
      fog: convergence.detail.fog,
      toneMappingExposure: convergence.detail.toneMappingExposure,
      inspectionCamera: compiled.atmosphere.contract.state.inspectionCamera,
    },
    bridge: {
      route:
        'HoloScript atmosphere overlay -> deterministic sealed-state plan -> immutable C application -> immutable B material binding -> immutable A courtyard -> batched Three/WebGL2 presentation',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      esbuildSha256: surface.esbuildHash,
      inheritedSourcesImmutable: true,
      externalAssets: [],
    },
    render: {
      hero: {
        path: path.relative(root, heroPath).replaceAll('\\', '/'),
        sha256: sha256(heroBuffer),
        bytes: heroBuffer.length,
        ...pngDimensions(heroBuffer),
      },
      gl: base.gl,
      renderer: base.renderer,
      rendererInfo,
      inheritedGeometryRendererInfo: geometry.detail?.rendererInfo,
      browserVersion: browser.browserVersion,
      externalRequests: browser.externalRequests,
      consoleMessages: browser.consoleMessages,
      pageErrors: browser.pageErrors,
    },
    boundaries: {
      authority: 'read_only',
      canonicalWritesAllowed: false,
      modelCalls: 0,
      externalNetworkRequests: browser.externalRequests.length,
      publicFamilyIdentityPresented: false,
      exactModelIdentityPresented: false,
      neutralCraftfolkCount: base.presentation?.neutralCraftfolkCount,
      productionResidentClaimed: false,
      fullWorldConvergenceClaimed: false,
      gameplayPhysicsClaimed: false,
      scannedAssetClaimed: false,
      atmosphereConvergenceClaimed: true,
      measuredRealTimePerformanceClaimed: false,
      photorealismClaimed: false,
      continuousWeatherSimulationClaimed: false,
      volumetricFogClaimed: false,
      fluidSimulationClaimed: false,
      physicallySimulatedRainClaimed: false,
      productionFoliagePhysicsClaimed: false,
    },
    checks,
    failures,
    residue: [
      'replace the two neutral Craftfolk staging forms with receipted production resident assets before claiming resident convergence',
      'ship a bounded cloth, water, foliage, and contact-physics vertical slice before claiming gameplay or production physics',
      'measure a production frame-time distribution and quality-tier fallback before claiming performance convergence',
      'integrate the admitted cinematic observer and soundscape with the converged courtyard without weakening live-study identity neutrality',
      'scale the accepted architecture, material, and atmosphere grammar beyond one courtyard before claiming full-world convergence',
      'keep live research identity-blinded while public model-family embodiments remain a separate admitted presentation projection',
    ],
  };
  const receipt = {
    ...receiptCore,
    receipt: {
      algorithm: 'sha256-canonical-json',
      receiptHash: sha256(canonicalJson(receiptCore)),
    },
  };
  const receiptPath = path.join(outputDir, 'atmosphere-convergence-d-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (failures.length > 0) {
    throw new Error(
      `Atmosphere convergence witness failed: ${failures.join(', ')}. Receipt: ${receiptPath}`,
    );
  }
  return { receipt, receiptPath, heroPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isMain) {
  runAtmosphereConvergenceCheck(parseArgs())
    .then(({ receipt, receiptPath, heroPath }) => {
      console.log(JSON.stringify({
        status: receipt.status,
        receiptPath,
        receiptHash: receipt.receipt.receiptHash,
        heroPath,
        heroHash: receipt.render.hero.sha256,
        gl: receipt.render.gl,
        rendererInfo: receipt.render.rendererInfo,
        atmosphere: receipt.atmosphere,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
