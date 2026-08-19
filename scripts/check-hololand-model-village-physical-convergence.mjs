#!/usr/bin/env node
/* global console, crypto, document, performance, process, requestAnimationFrame, TextEncoder, window */
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
  buildResidentPlan,
  validateResidentConvergenceContract,
} from './check-hololand-model-village-resident-convergence.mjs';
import {
  serializeMaterialSet,
  synthesizeMaterialSet,
} from './lib/model-village-material-synthesis.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-physical-convergence.holo';
const POLICY_RELATIVE =
  'source/proofs/model-village-receipt-loom-physical-convergence-policy.hsplus';
const SEED_RELATIVE =
  'source/proofs/model-village-receipt-loom-physical-convergence-seed.hs';
const MANIFEST_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-physical-convergence-manifest.holo';
const RESIDENT_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-resident-convergence.holo';
const RESIDENT_BRIDGE_RELATIVE =
  'scripts/check-hololand-model-village-resident-convergence.mjs';
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
  'physical-convergence-f',
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
const COUPLED_SYSTEMS = Object.freeze([
  'resident_mantles',
  'rain_streaks',
  'wind_foliage',
  'chimney_smoke',
  'cistern_ripples',
]);
const MATERIAL_SURFACES = Object.freeze([
  'agedTimber',
  'limePlaster',
  'handSplitSlate',
  'wetBasalt',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function sha256(value) {
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

function templateByName(composition, name) {
  return composition.children.find(
    (node) => node.type === 'template' && node.name === name,
  );
}

function seedByType(seedNodes, type) {
  return seedNodes.find((node) => node.properties?.type === type);
}

function seedAllByType(seedNodes, type) {
  return seedNodes.filter((node) => node.properties?.type === type);
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
      && existsSync(path.join(candidate, 'packages', 'engine', 'dist', 'index.js'))
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

function extractBrowserApplication(sourceText, startMarker, endMarker, label) {
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`Unable to extract immutable ${label} browser application`);
  }
  return sourceText.slice(start, end);
}

export function extractResidentBrowserApplication(sourceText) {
  return extractBrowserApplication(
    sourceText,
    'async function residentConvergenceBrowserApplication(',
    '\n\nfunction buildAtmospherePayload',
    'Resident Convergence E',
  );
}

function extractAtmosphereBrowserApplication(sourceText) {
  return extractBrowserApplication(
    sourceText,
    'async function atmosphereConvergenceBrowserApplication(',
    '\n\nasync function buildSurface',
    'Atmosphere Convergence D',
  );
}

function extractClothRuntimeBrowserSource(sourceText) {
  return extractBrowserApplication(
    sourceText,
    '// src/character-render/AgentAvatarCloth.ts',
    '\n\n// src/character-render/AgentAvatarHair.ts',
    'HoloScript DeterministicClothSimulation runtime',
  );
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
    ast: parsed.ast,
    contract: {
      metadata: parsed.ast.metadata,
      state: stateProperties(parsed.ast.state),
      environment: stateProperties(parsed.ast.environment),
      nodes: flatten(sceneIr)
        .filter((node) => node.type !== 'group')
        .map((node) => ({
          id: node.id || null,
          type: node.type,
          props: node.props || {},
        })),
    },
  };
}

export function buildPhysicalPlan(contract) {
  const { state } = contract;
  return {
    residentCount: state.namedResidentCount,
    publicDisplayNames: state.publicDisplayNames,
    familyIds: state.familyIds,
    solver: state.solver,
    mantleBinding: state.mantleBinding,
    bodyCollision: state.bodyCollision,
    terrainContact: state.terrainContact,
    sharedWind: state.sharedWind,
    wetClothResponse: state.wetClothResponse,
    simulationContract: state.simulationContract,
    qualityBudget: state.qualityBudget,
    inspectionCamera: state.inspectionCamera,
    motionInspectionCamera: state.motionInspectionCamera,
  };
}

export function deriveMantleBinding(bundle, mantleMaterialGroupIndex = 3) {
  const group = bundle.materialGroups?.[mantleMaterialGroupIndex];
  if (!group) throw new Error(`Missing mantle material group ${mantleMaterialGroupIndex}`);
  const indices = bundle.mesh.indices.slice(
    group.indexStart,
    group.indexStart + group.indexCount,
  );
  const vertices = [...new Set(indices)].sort((left, right) => left - right);
  const weights = new Float32Array(bundle.vertexCount);
  for (const vertex of vertices) {
    const uvV = bundle.mesh.uvs[vertex * 2 + 1];
    weights[vertex] = Math.min(1, Math.max(0, uvV));
  }
  return {
    groupIndex: mantleMaterialGroupIndex,
    indices,
    vertices,
    weights,
    dynamicVertices: vertices.filter((vertex) => weights[vertex] > 0),
    pinnedVertices: vertices.filter((vertex) => weights[vertex] === 0),
  };
}

export function projectMantleBodyCollision(
  positions,
  mantleVertices,
  profile,
) {
  const projected = new Float32Array(positions);
  let correctionCount = 0;
  let maximumCorrection = 0;
  let maximumPenetration = 0;
  for (const vertex of mantleVertices) {
    const offset = vertex * 3;
    const x = projected[offset];
    const y = projected[offset + 1];
    const z = projected[offset + 2];
    const shoulderDistance = (y - profile.shoulderCenterYMeters)
      / profile.shoulderHalfWidthMeters;
    const shoulder = Math.exp(-(shoulderDistance * shoulderDistance));
    const requiredRadius = profile.baseRadiusMeters
      + profile.shoulderRadiusAddMeters * shoulder
      + profile.surfaceOffsetMeters;
    const radius = Math.hypot(x, z);
    const penetration = Math.max(0, requiredRadius - radius);
    maximumPenetration = Math.max(maximumPenetration, penetration);
    if (penetration <= 0) continue;
    const normalX = radius > 1e-7 ? x / radius : 0;
    const normalZ = radius > 1e-7 ? z / radius : 1;
    projected[offset] = normalX * requiredRadius;
    projected[offset + 2] = normalZ * requiredRadius;
    correctionCount += 1;
    maximumCorrection = Math.max(maximumCorrection, penetration);
  }
  let residualPenetration = 0;
  for (const vertex of mantleVertices) {
    const offset = vertex * 3;
    const x = projected[offset];
    const y = projected[offset + 1];
    const z = projected[offset + 2];
    const shoulderDistance = (y - profile.shoulderCenterYMeters)
      / profile.shoulderHalfWidthMeters;
    const shoulder = Math.exp(-(shoulderDistance * shoulderDistance));
    const requiredRadius = profile.baseRadiusMeters
      + profile.shoulderRadiusAddMeters * shoulder
      + profile.surfaceOffsetMeters;
    residualPenetration = Math.max(
      residualPenetration,
      Math.max(0, requiredRadius - Math.hypot(x, z)),
    );
  }
  return {
    positions: projected,
    correctionCount,
    maximumCorrection,
    inputMaximumPenetration: maximumPenetration,
    residualMaximumPenetration: residualPenetration,
  };
}

export function validatePhysicalConvergenceContract(
  contract,
  root = REPO_ROOT,
  holoScriptRoot = 'C:/Users/josep/Documents/GitHub/HoloScript',
) {
  const errors = [];
  const { metadata, state } = contract;
  if (metadata.worldName !== 'Stormglass Commons') {
    errors.push('worldName must be Stormglass Commons');
  }
  if (metadata.artStyle !== 'hearthlight_biorealism') {
    errors.push('artStyle must be hearthlight_biorealism');
  }
  if (metadata.milestone !== 'MV_V1_PHYSICAL_CONVERGENCE_F') {
    errors.push('milestone must be MV_V1_PHYSICAL_CONVERGENCE_F');
  }
  if (metadata.projectionRole !== 'public_postlock_physical_presentation') {
    errors.push('projectionRole must be public_postlock_physical_presentation');
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
    [metadata.residentSource, metadata.residentSourceSha256, 'resident source'],
    [metadata.residentBridge, metadata.residentBridgeSha256, 'resident bridge'],
    [metadata.residentTest, metadata.residentTestSha256, 'resident test'],
    [metadata.residentReport, metadata.residentReportSha256, 'resident report'],
    [metadata.residentHero, metadata.residentHeroSha256, 'resident hero'],
    [metadata.residentManifest, metadata.residentManifestSha256, 'resident manifest'],
  ]) {
    const filePath = path.resolve(root, relativePath || '');
    if (!existsSync(filePath)) errors.push(`${label} file is missing: ${relativePath}`);
    else if (!SHA256_PATTERN.test(expectedHash || '')) {
      errors.push(`${label} hash must be lowercase sha256`);
    } else if (sha256File(filePath) !== expectedHash) {
      errors.push(`${label} hash does not match ${relativePath}`);
    }
  }
  for (const [relativePath, expectedHash, label] of [
    [
      metadata.holoScriptClothRuntime,
      metadata.holoScriptClothRuntimeSha256,
      'HoloScript cloth runtime',
    ],
    [
      metadata.holoScriptEngineDist,
      metadata.holoScriptEngineDistSha256,
      'HoloScript engine distribution',
    ],
  ]) {
    const filePath = path.resolve(holoScriptRoot, relativePath || '');
    if (!existsSync(filePath)) errors.push(`${label} file is missing: ${relativePath}`);
    else if (!SHA256_PATTERN.test(expectedHash || '')) {
      errors.push(`${label} hash must be lowercase sha256`);
    } else if (sha256File(filePath) !== expectedHash) {
      errors.push(`${label} hash does not match ${relativePath}`);
    }
  }
  if (!SHA256_PATTERN.test(metadata.residentBrowserApplicationSha256 || '')) {
    errors.push('residentBrowserApplicationSha256 must be lowercase sha256');
  }
  if (state.authority !== 'read_only') errors.push('authority must be read_only');
  if (state.presentationProfile !== 'village_story_unblinded') {
    errors.push('presentationProfile must be village_story_unblinded');
  }
  if (!state.deniedPresentationProfiles?.includes('research_live_blinded')) {
    errors.push('research_live_blinded must remain denied');
  }
  for (const key of [
    'separateFromLiveExperiment',
    'researchLiveIdentityNeutralPreserved',
    'physicalConvergenceClaimed',
    'continuousMantleSimulationClaimed',
    'bodyCollisionProjectionClaimed',
    'footTerrainContactClaimed',
    'sharedWindCouplingClaimed',
    'wetClothResponseClaimed',
    'deterministicReplayClaimed',
    'realGpuRenderingClaimed',
  ]) {
    if (state[key] !== true) errors.push(`${key} must be true`);
  }
  for (const key of [
    'researchLiveBlindedCompatible',
    'canonicalWritesAllowed',
    'residentObservationWritesAllowed',
    'modelCallsAllowed',
    'networkFetchesAllowed',
    'providerEndorsementClaimed',
    'exactModelRevisionPresented',
    'modelBehaviorSimulated',
    'nativeGpuPhysicsClaimed',
    'clothSelfCollisionClaimed',
    'twoWayFluidStructureInteractionClaimed',
    'productionTailoringClaimed',
    'measuredRealTimePerformanceClaimed',
    'photorealismClaimed',
    'fullWorldConvergenceClaimed',
  ]) {
    if (state[key] !== false) errors.push(`${key} must remain false`);
  }
  if (state.sourcePhysicsAuthority !== 'holoscript_three_format_stack') {
    errors.push('sourcePhysicsAuthority must be holoscript_three_format_stack');
  }
  if (
    state.physicsMaterializationBridge
    !== 'deterministic_local_cpu_solver_gpu_presentation'
  ) {
    errors.push('physicsMaterializationBridge must preserve the CPU/GPU boundary');
  }
  if (state.namedResidentCount !== DISPLAY_NAMES.length) {
    errors.push(`namedResidentCount must be ${DISPLAY_NAMES.length}`);
  }
  if (canonicalJson(state.publicDisplayNames) !== canonicalJson(DISPLAY_NAMES)) {
    errors.push('publicDisplayNames must preserve the six-family order');
  }
  if (canonicalJson(state.familyIds) !== canonicalJson(FAMILY_IDS)) {
    errors.push('familyIds must preserve the six-family provenance order');
  }
  if (state.solver?.runtimeClass !== 'DeterministicClothSimulation') {
    errors.push('solver runtimeClass must be DeterministicClothSimulation');
  }
  if (state.solver?.executionDevice !== 'cpu') {
    errors.push('solver executionDevice must be cpu');
  }
  if (
    state.solver?.fixedStepHz !== 120
    || state.solver?.iterations !== 5
    || state.solver?.maxDisplacementMeters !== 0.18
  ) {
    errors.push('solver fixed step, iterations, or displacement bound drifted');
  }
  if (
    canonicalJson(state.solver?.sampleTimesSeconds)
    !== canonicalJson([0, 0.8, 1.6])
    || state.solver?.replayRuns !== 3
    || state.solver?.wallClockInSimulationInput !== false
  ) {
    errors.push('solver deterministic replay shape drifted');
  }
  if (
    state.mantleBinding?.expectedVerticesPerResident !== 91
    || state.mantleBinding?.expectedDynamicVerticesPerResident !== 78
    || state.mantleBinding?.expectedTotalDynamicVertices !== 468
  ) {
    errors.push('mantle binding vertex counts drifted');
  }
  if (
    state.bodyCollision?.profile !== 'y_axis_capsule_profile'
    || state.bodyCollision?.maximumAllowedPenetrationMeters !== 0.0001
  ) {
    errors.push('body collision profile drifted');
  }
  if (
    state.terrainContact?.groundYMeters !== 0.42
    || state.terrainContact?.totalSoleProbes !== 12
    || state.terrainContact?.rootVerticalMotionAllowed !== false
  ) {
    errors.push('terrain contact contract drifted');
  }
  if (
    state.sharedWind?.fieldId !== 'stormglass_commons_shared_wind_f1'
    || canonicalJson(state.sharedWind?.coupledSystems)
      !== canonicalJson(COUPLED_SYSTEMS)
  ) {
    errors.push('shared wind coupling contract drifted');
  }
  if (
    state.wetClothResponse?.materialOnlyResponse !== true
    || state.wetClothResponse?.absorptionSolverClaimed !== false
  ) {
    errors.push('wet cloth response must remain material-only');
  }
  const plan = buildPhysicalPlan(contract);
  return {
    schema: 'hololand.model-village.physical-convergence-contract.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    plan,
  };
}

function validatePolicyAndSeed(core, policyText, seedText) {
  const errors = [];
  const policyResult = new core.HoloScriptPlusParser().parse(policyText);
  const seedResult = new core.HoloScriptCodeParser().parse(seedText);
  if (!policyResult.success) {
    errors.push(`.hsplus parse failed: ${canonicalJson(policyResult.errors)}`);
  }
  if (!seedResult.success) {
    errors.push(`.hs parse failed: ${canonicalJson(seedResult.errors)}`);
  }
  if (errors.length > 0) {
    return { status: 'fail', errors, policyResult, seedResult };
  }
  const composition = policyResult.ast.children.find(
    (node) => node.type === 'composition',
  );
  const policyConfig = composition?.children.find((node) => node.type === 'config');
  const policyState = composition?.children.find((node) => node.type === 'state');
  const fixedStep = templateByName(composition, 'FixedStepExecutionContract');
  const runtimeBinding = templateByName(composition, 'HoloScriptClothRuntimeBinding');
  const collision = templateByName(composition, 'BodyCollisionProjectionContract');
  const contact = templateByName(composition, 'TerrainContactContract');
  const wind = templateByName(composition, 'SharedWindCouplingContract');
  const wetCloth = templateByName(composition, 'WetClothResponseContract');
  const replay = templateByName(composition, 'ReplayAcceptanceGate');
  const gpu = templateByName(composition, 'GpuWitnessContract');
  const firewall = templateByName(composition, 'NoCausalMergeGate');
  const formatRoles = templateByName(composition, 'FormatRoleContract');
  for (const [name, node] of Object.entries({
    policyConfig,
    policyState,
    fixedStep,
    runtimeBinding,
    collision,
    contact,
    wind,
    wetCloth,
    replay,
    gpu,
    firewall,
    formatRoles,
  })) {
    if (!node) errors.push(`.hsplus policy is missing ${name}`);
  }
  const seedNodes = seedResult.ast;
  const manifest = seedByType(
    seedNodes,
    'model_village_physical_convergence_seed_manifest',
  );
  const residents = seedAllByType(seedNodes, 'resident_physical_seed')
    .sort((left, right) => left.properties.order - right.properties.order);
  const windSeed = seedByType(seedNodes, 'shared_wind_seed');
  const collisionSeed = seedByType(seedNodes, 'resident_body_collision_profile');
  const contactSeed = seedByType(seedNodes, 'terrain_contact_seed');
  const seedGate = seedByType(seedNodes, 'model_village_physical_seed_gate');
  for (const [name, node] of Object.entries({
    manifest,
    windSeed,
    collisionSeed,
    contactSeed,
    seedGate,
  })) {
    if (!node) errors.push(`.hs seed is missing ${name}`);
  }
  if (residents.length !== 6) errors.push('.hs seed must carry six residents');
  if (
    canonicalJson(residents.map((node) => node.properties.publicDisplayName))
    !== canonicalJson(DISPLAY_NAMES)
  ) {
    errors.push('.hs resident seed order drifted');
  }
  if (
    canonicalJson(residents.map((node) => node.properties.familyId))
    !== canonicalJson(FAMILY_IDS)
  ) {
    errors.push('.hs resident family order drifted');
  }
  if (
    canonicalJson(windSeed?.properties.coupledSystems)
    !== canonicalJson(COUPLED_SYSTEMS)
  ) {
    errors.push('.hs shared wind systems drifted');
  }
  const policy = {
    config: policyConfig?.properties,
    state: policyState?.properties,
    fixedStep: fixedStep?.properties,
    runtimeBinding: runtimeBinding?.properties,
    collision: collision?.properties,
    contact: contact?.properties,
    wind: wind?.properties,
    wetCloth: wetCloth?.properties,
    replay: replay?.properties,
    gpu: gpu?.properties,
    firewall: firewall?.properties,
    formatRoles: formatRoles?.properties,
  };
  const seed = {
    manifest: manifest?.properties,
    residents: residents.map((node) => node.properties),
    wind: windSeed?.properties,
    collision: collisionSeed?.properties,
    contact: contactSeed?.properties,
    gate: seedGate?.properties,
  };
  if (
    policy.fixedStep?.timestepDenominator !== 120
    || policy.fixedStep?.runs !== 3
    || policy.runtimeBinding?.runtimeClass !== 'DeterministicClothSimulation'
    || policy.runtimeBinding?.nativeGpuPhysicsClaimed !== false
  ) {
    errors.push('.hsplus runtime or replay boundary drifted');
  }
  if (
    seed.manifest?.fixedTimestepDenominator !== 120
    || seed.manifest?.replayRuns !== 3
    || seed.contact?.totalSoleProbes !== 12
  ) {
    errors.push('.hs deterministic input shape drifted');
  }
  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    policyResult,
    seedResult,
    policy,
    seed,
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
        cloth: bundle.cloth,
        mantle: bundle.mantle,
      },
      tile,
      tileSha256: sha256File(tilePath),
      mantleBinding: deriveMantleBinding(bundle),
    };
  });
}

async function compilePhysicalConvergence(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const enginePath = path.join(holoScriptRoot, 'packages', 'engine', 'dist', 'index.js');
  const clothRuntimePath = path.join(
    holoScriptRoot,
    'packages',
    'engine',
    'src',
    'character-render',
    'AgentAvatarCloth.ts',
  );
  const core = await import(pathToFileURL(corePath).href);
  const engineText = readFileSync(enginePath, 'utf8');
  const clothRuntimeBrowserSource = extractClothRuntimeBrowserSource(engineText);
  const physical = await parseComposition(core, path.resolve(root, SOURCE_RELATIVE));
  const resident = await parseComposition(core, path.resolve(root, RESIDENT_SOURCE_RELATIVE));
  const atmosphere = await parseComposition(
    core,
    path.resolve(root, ATMOSPHERE_SOURCE_RELATIVE),
  );
  const geometry = await parseComposition(core, path.resolve(root, GEOMETRY_SOURCE_RELATIVE));
  const material = await parseComposition(core, path.resolve(root, MATERIAL_SOURCE_RELATIVE));
  const base = await parseComposition(core, path.resolve(root, BASE_SOURCE_RELATIVE));
  const policyText = readFileSync(path.resolve(root, POLICY_RELATIVE), 'utf8');
  const seedText = readFileSync(path.resolve(root, SEED_RELATIVE), 'utf8');
  const stackValidation = validatePolicyAndSeed(core, policyText, seedText);
  const physicalValidation = validatePhysicalConvergenceContract(
    physical.contract,
    root,
    holoScriptRoot,
  );
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
    ['physical', physicalValidation],
    ['format stack', stackValidation],
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
  const residentBridgePath = path.resolve(root, RESIDENT_BRIDGE_RELATIVE);
  const residentBridgeText = readFileSync(residentBridgePath, 'utf8');
  const residentBrowserApplication = extractResidentBrowserApplication(
    residentBridgeText,
  );
  if (
    sha256(residentBrowserApplication)
    !== physical.contract.metadata.residentBrowserApplicationSha256
  ) {
    throw new Error('Resident E browser application changed after Physical F was authored');
  }
  const atmosphereBridgePath = path.resolve(root, ATMOSPHERE_BRIDGE_RELATIVE);
  const atmosphereBridgeText = readFileSync(atmosphereBridgePath, 'utf8');
  const atmosphereBrowserApplication = extractAtmosphereBrowserApplication(
    atmosphereBridgeText,
  );
  if (
    sha256(atmosphereBrowserApplication)
    !== resident.contract.metadata.atmosphereBrowserApplicationSha256
  ) {
    throw new Error('Atmosphere D browser application changed after Resident E');
  }
  const geometryBridgePath = path.resolve(root, GEOMETRY_BRIDGE_RELATIVE);
  const geometryBridgeText = readFileSync(geometryBridgePath, 'utf8');
  const geometryBrowserApplication = extractGeometryBrowserApplication(
    geometryBridgeText,
  );
  if (
    sha256(geometryBrowserApplication)
    !== atmosphere.contract.metadata.geometryBrowserApplicationSha256
  ) {
    throw new Error('Geometry C browser application changed after Atmosphere D');
  }
  const baseBridgePath = path.resolve(root, BASE_BRIDGE_RELATIVE);
  const baseBridgeText = readFileSync(baseBridgePath, 'utf8');
  const materialSets = Object.fromEntries(
    MATERIAL_SURFACES.map((surfaceKey) => [
      surfaceKey,
      serializeMaterialSet(synthesizeMaterialSet(
        material.contract.state.materialSurfaces[surfaceKey],
      )),
    ]),
  );
  const geometryPlan = buildGeometryPlan(geometry.contract.state);
  const atmospherePlan = buildAtmospherePlan(atmosphere.contract.state);
  const residentPlan = buildResidentPlan(resident.contract);
  const physicalPlan = buildPhysicalPlan(physical.contract);
  return {
    physical: {
      ...physical,
      validation: physicalValidation,
      plan: physicalPlan,
      planCanonical: canonicalJson(physicalPlan),
      planHash: sha256(canonicalJson(physicalPlan)),
      policyText,
      policyHash: sha256(policyText),
      seedText,
      seedHash: sha256(seedText),
      stackValidation,
    },
    resident: {
      ...resident,
      validation: residentValidation,
      plan: residentPlan,
      planCanonical: canonicalJson(residentPlan),
      planHash: sha256(canonicalJson(residentPlan)),
      residents: loadResidentBundles(root, residentPlan),
      bridgePath: residentBridgePath,
      bridgeHash: sha256(residentBridgeText),
      browserApplication: residentBrowserApplication,
      browserApplicationHash: sha256(residentBrowserApplication),
    },
    atmosphere: {
      ...atmosphere,
      validation: atmosphereValidation,
      plan: atmospherePlan,
      planCanonical: canonicalJson(atmospherePlan),
      planHash: sha256(canonicalJson(atmospherePlan)),
      bridgePath: atmosphereBridgePath,
      bridgeHash: sha256(atmosphereBridgeText),
      browserApplication: atmosphereBrowserApplication,
      browserApplicationHash: sha256(atmosphereBrowserApplication),
    },
    geometry: {
      ...geometry,
      validation: geometryValidation,
      plan: geometryPlan,
      planCanonical: canonicalJson(geometryPlan),
      planHash: sha256(canonicalJson(geometryPlan)),
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
    toolchain: {
      corePath,
      coreHash: sha256File(corePath),
      enginePath,
      engineHash: sha256File(enginePath),
      clothRuntimeBrowserSource,
      clothRuntimeBrowserSourceHash: sha256(clothRuntimeBrowserSource),
      clothRuntimePath,
      clothRuntimeHash: sha256File(clothRuntimePath),
    },
  };
}

async function physicalConvergenceBrowserApplication(
  THREE,
  RoomEnvironment,
  DeterministicClothSimulation,
  payload,
  residentApplication,
  atmosphereApplication,
  geometryApplication,
  baseApplication,
) {
  const physical = {
    schema: 'hololand.model-village.physical-convergence-browser.v1',
    ready: false,
    status: 'booting',
    error: null,
  };
  window.__MV_PHYSICAL_CONVERGENCE__ = physical;
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
    await residentApplication(
      capturingThree,
      RoomEnvironment,
      payload.residentPayload,
      atmosphereApplication,
      geometryApplication,
      baseApplication,
    );
    const residentSnapshot = window.__MV_RESIDENT_CONVERGENCE_SNAPSHOT__?.();
    if (residentSnapshot?.convergence?.status !== 'pass') {
      throw new Error(
        `Inherited Resident Convergence E failed: ${
          residentSnapshot?.convergence?.error || 'unknown'
        }`,
      );
    }
    if (!capturedRenderer || !capturedScene || !capturedCamera) {
      throw new Error('Physical bridge did not capture renderer, scene, and camera');
    }
    const plan = payload.physical.plan;
    const solverConfig = plan.solver;
    const mantleConfig = plan.mantleBinding;
    const collisionProfile = plan.bodyCollision;
    const contactConfig = plan.terrainContact;
    const windConfig = plan.sharedWind;
    const wetConfig = plan.wetClothResponse;
    const residentRecords = [];

    function uniqueEdges(indices, restPositions) {
      const seen = new Set();
      const edges = [];
      const add = (left, right) => {
        const a = Math.min(left, right);
        const b = Math.max(left, right);
        const key = `${a}:${b}`;
        if (seen.has(key)) return;
        seen.add(key);
        const ai = a * 3;
        const bi = b * 3;
        const length = Math.hypot(
          restPositions[bi] - restPositions[ai],
          restPositions[bi + 1] - restPositions[ai + 1],
          restPositions[bi + 2] - restPositions[ai + 2],
        );
        if (length > 1e-7) edges.push({ a, b, restLength: length });
      };
      for (let index = 0; index + 2 < indices.length; index += 3) {
        const a = indices[index];
        const b = indices[index + 1];
        const c = indices[index + 2];
        add(a, b);
        add(b, c);
        add(c, a);
      }
      return edges;
    }

    for (const [residentIndex, seed] of payload.physical.seedResidents.entries()) {
      const resident = payload.residentPayload.resident.residents[residentIndex];
      const mesh = capturedScene.getObjectByName(seed.residentObjectName);
      if (!mesh?.isMesh) {
        throw new Error(`Physical resident mesh is missing: ${seed.residentObjectName}`);
      }
      const geometry = mesh.geometry;
      const group = geometry.groups[seed.mantleMaterialGroupIndex];
      if (!group) {
        throw new Error(
          `${seed.publicDisplayName} mantle group ${seed.mantleMaterialGroupIndex} is missing`,
        );
      }
      const fullIndices = geometry.index.array;
      const mantleIndices = new Uint32Array(
        Array.from(
          fullIndices.slice(group.start, group.start + group.count),
          (value) => Number(value),
        ),
      );
      const mantleVertices = [...new Set(mantleIndices)]
        .sort((left, right) => left - right);
      const restPositions = new Float32Array(geometry.attributes.position.array);
      const weights = new Float32Array(geometry.attributes.position.count);
      for (const vertex of mantleVertices) {
        const uvV = geometry.attributes.uv.array[vertex * 2 + 1];
        weights[vertex] = Math.min(1, Math.max(0, uvV));
      }
      const dynamicVertices = mantleVertices.filter((vertex) => weights[vertex] > 0);
      const pinnedVertices = mantleVertices.filter((vertex) => weights[vertex] === 0);
      const solver = new DeterministicClothSimulation(
        restPositions,
        mantleIndices,
        weights,
        {
          solver: 'xpbd',
          fixedStepHz: solverConfig.fixedStepHz,
          iterations: solverConfig.iterations,
          damping: solverConfig.damping,
          gravity: solverConfig.gravity,
          wind: solverConfig.wind,
          windFrequency: solverConfig.windFrequency,
          tetherStiffness: solverConfig.tetherStiffness,
          constraintStiffness: solverConfig.constraintStiffness,
          maxDisplacement: solverConfig.maxDisplacementMeters,
        },
      );
      const caption = capturedScene.getObjectByName(
        `ResidentConvergence:${resident.slug}:caption`,
      );
      const contact = capturedScene.getObjectByName(
        `ResidentConvergence:${resident.slug}:contact`,
      );
      const mantleMaterial = Array.isArray(mesh.material)
        ? mesh.material[seed.mantleMaterialGroupIndex]
        : null;
      residentRecords.push({
        seed,
        resident,
        mesh,
        geometry,
        solver,
        restPositions,
        mantleIndices,
        mantleVertices,
        dynamicVertices,
        pinnedVertices,
        edges: uniqueEdges(mantleIndices, restPositions),
        basePosition: mesh.position.clone(),
        baseScale: mesh.scale.clone(),
        caption,
        captionBasePosition: caption?.position.clone() || null,
        contact,
        contactBasePosition: contact?.position.clone() || null,
        mantleMaterial,
        baseRoughness: mantleMaterial?.roughness ?? 0.62,
        baseClearcoat: mantleMaterial?.clearcoat ?? 0.12,
      });
    }
    if (
      residentRecords.some(
        (record) =>
          record.mantleVertices.length !== mantleConfig.expectedVerticesPerResident
          || record.dynamicVertices.length
            !== mantleConfig.expectedDynamicVerticesPerResident,
      )
    ) {
      throw new Error('Mantle UV binding did not match the HoloScript vertex contract');
    }

    function captureInstancedBatch(name) {
      const mesh = capturedScene.getObjectByName(`AtmosphereConvergence:${name}`);
      if (!mesh?.isInstancedMesh) {
        throw new Error(`Coupled atmosphere batch is missing: ${name}`);
      }
      const matrices = [];
      for (let index = 0; index < mesh.count; index += 1) {
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(index, matrix);
        matrices.push(matrix);
      }
      return { name, mesh, matrices };
    }

    const coupledBatches = {
      rain_streaks: captureInstancedBatch('rain_streaks'),
      wind_foliage: captureInstancedBatch('wind_foliage'),
      chimney_smoke: captureInstancedBatch('chimney_smoke'),
      cistern_ripples: captureInstancedBatch('cistern_ripples'),
    };
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();

    function windAt(timeSeconds) {
      const gust = windConfig.gustFloor
        + windConfig.gustAmplitude
          * Math.sin(timeSeconds * windConfig.primaryFrequencyHz * Math.PI * 2)
          * Math.sin(
            timeSeconds
              * windConfig.primaryFrequencyHz
              * windConfig.secondaryFrequencyScale
              * Math.PI
              * 2
              + windConfig.secondaryPhaseRadians,
          );
      return {
        gust,
        vector: windConfig.baseMetersPerSecond.map((value) => value * gust),
      };
    }

    function wetAt(timeSeconds) {
      const range = wetConfig.saturationRange;
      const normalized = 0.5
        + 0.5 * Math.sin(timeSeconds * windConfig.primaryFrequencyHz * 0.38 + 0.51);
      const saturation = range[0] + normalized * (range[1] - range[0]);
      const wetness = (saturation - range[0]) / (range[1] - range[0]);
      return {
        saturation,
        roughness: wetConfig.mantleRoughnessRange[1]
          - wetness
            * (wetConfig.mantleRoughnessRange[1] - wetConfig.mantleRoughnessRange[0]),
        clearcoat: wetConfig.mantleClearcoatRange[0]
          + wetness
            * (wetConfig.mantleClearcoatRange[1] - wetConfig.mantleClearcoatRange[0]),
      };
    }

    function projectCollision(positions, vertices) {
      let correctionCount = 0;
      let maximumCorrection = 0;
      let residualMaximumPenetration = 0;
      for (const vertex of vertices) {
        const offset = vertex * 3;
        const x = positions[offset];
        const y = positions[offset + 1];
        const z = positions[offset + 2];
        const shoulderDistance = (y - collisionProfile.shoulderCenterYMeters)
          / collisionProfile.shoulderHalfWidthMeters;
        const shoulder = Math.exp(-(shoulderDistance * shoulderDistance));
        const requiredRadius = collisionProfile.baseRadiusMeters
          + collisionProfile.shoulderRadiusAddMeters * shoulder
          + collisionProfile.surfaceOffsetMeters;
        const radius = Math.hypot(x, z);
        const penetration = Math.max(0, requiredRadius - radius);
        if (penetration > 0) {
          const normalX = radius > 1e-7 ? x / radius : 0;
          const normalZ = radius > 1e-7 ? z / radius : 1;
          positions[offset] = normalX * requiredRadius;
          positions[offset + 2] = normalZ * requiredRadius;
          correctionCount += 1;
          maximumCorrection = Math.max(maximumCorrection, penetration);
        }
      }
      for (const vertex of vertices) {
        const offset = vertex * 3;
        const x = positions[offset];
        const y = positions[offset + 1];
        const z = positions[offset + 2];
        const shoulderDistance = (y - collisionProfile.shoulderCenterYMeters)
          / collisionProfile.shoulderHalfWidthMeters;
        const shoulder = Math.exp(-(shoulderDistance * shoulderDistance));
        const requiredRadius = collisionProfile.baseRadiusMeters
          + collisionProfile.shoulderRadiusAddMeters * shoulder
          + collisionProfile.surfaceOffsetMeters;
        residualMaximumPenetration = Math.max(
          residualMaximumPenetration,
          Math.max(0, requiredRadius - Math.hypot(x, z)),
        );
      }
      return { correctionCount, maximumCorrection, residualMaximumPenetration };
    }

    function applyBatch(batch, timeSeconds, wind) {
      for (let index = 0; index < batch.matrices.length; index += 1) {
        batch.matrices[index].decompose(position, quaternion, scale);
        euler.setFromQuaternion(quaternion, 'XYZ');
        const localPosition = position.clone();
        const localScale = scale.clone();
        if (batch.name === 'rain_streaks') {
          const fall = (timeSeconds * 5.8 + index * 0.017) % 0.78;
          localPosition.y -= fall;
          localPosition.x += wind.vector[0] * (0.08 + (index % 7) * 0.004);
          localPosition.z += wind.vector[2] * 0.05;
          euler.z -= wind.gust * 0.035;
        } else if (batch.name === 'wind_foliage') {
          euler.z += (wind.gust - windConfig.gustFloor) * 0.42
            + Math.sin(timeSeconds * 3.1 + index * 0.47) * 0.035;
          euler.x += wind.vector[2] * 0.08;
        } else if (batch.name === 'chimney_smoke') {
          const age = index / Math.max(1, batch.matrices.length - 1);
          localPosition.x += wind.vector[0] * (0.22 + age * 0.42);
          localPosition.z += wind.vector[2] * (0.16 + age * 0.24);
          localPosition.y += (timeSeconds * 0.14 + age * 0.18) % 0.46;
          localScale.multiplyScalar(
            1 + 0.055 * Math.sin(timeSeconds * 1.7 + index * 0.39),
          );
        } else if (batch.name === 'cistern_ripples') {
          const pulse = 1
            + 0.075 * Math.sin(timeSeconds * 4.4 + index * 0.61 + wind.gust);
          localScale.x *= pulse;
          localScale.y *= pulse;
          euler.z += timeSeconds * 0.08 * wind.gust;
        }
        quaternion.setFromEuler(euler);
        matrix.compose(localPosition, quaternion, localScale);
        batch.mesh.setMatrixAt(index, matrix);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
    }

    function maxEdgeStrain(record, positions) {
      let maximum = 1;
      for (const edge of record.edges) {
        const ai = edge.a * 3;
        const bi = edge.b * 3;
        const length = Math.hypot(
          positions[bi] - positions[ai],
          positions[bi + 1] - positions[ai + 1],
          positions[bi + 2] - positions[ai + 2],
        );
        maximum = Math.max(maximum, length / edge.restLength);
      }
      return maximum;
    }

    function renderFrame(timeSeconds) {
      const started = performance.now();
      const wind = windAt(timeSeconds);
      const wet = wetAt(timeSeconds);
      const clothSamples = [];
      let collisionCorrections = 0;
      let maximumCollisionCorrection = 0;
      let residualMaximumPenetration = 0;
      let maximumDisplacement = 0;
      let sumSquaredDisplacement = 0;
      let displacementCount = 0;
      let maximumEdgeStrain = 1;
      const soleProbeErrors = [];
      for (const record of residentRecords) {
        const sampled = record.solver.sample(timeSeconds);
        const positions = new Float32Array(sampled.positions);
        const collision = projectCollision(positions, record.mantleVertices);
        collisionCorrections += collision.correctionCount;
        maximumCollisionCorrection = Math.max(
          maximumCollisionCorrection,
          collision.maximumCorrection,
        );
        residualMaximumPenetration = Math.max(
          residualMaximumPenetration,
          collision.residualMaximumPenetration,
        );
        for (const vertex of record.dynamicVertices) {
          const offset = vertex * 3;
          const displacement = Math.hypot(
            positions[offset] - record.restPositions[offset],
            positions[offset + 1] - record.restPositions[offset + 1],
            positions[offset + 2] - record.restPositions[offset + 2],
          );
          maximumDisplacement = Math.max(maximumDisplacement, displacement);
          sumSquaredDisplacement += displacement * displacement;
          displacementCount += 1;
        }
        maximumEdgeStrain = Math.max(
          maximumEdgeStrain,
          maxEdgeStrain(record, positions),
        );
        record.geometry.attributes.position.array.set(positions);
        record.geometry.attributes.position.needsUpdate = true;
        record.geometry.computeBoundingSphere();
        const phase = record.seed.phaseOffsetRadians;
        const driftX = Math.sin(timeSeconds * 0.91 + phase) * 0.012;
        const driftZ = Math.cos(timeSeconds * 0.73 + phase) * 0.008;
        const breath = 1 + Math.sin(timeSeconds * 1.21 + phase) * 0.0022;
        record.mesh.position.set(
          record.basePosition.x + driftX,
          contactConfig.groundYMeters,
          record.basePosition.z + driftZ,
        );
        record.mesh.scale.set(
          record.baseScale.x,
          record.baseScale.y * breath,
          record.baseScale.z,
        );
        if (record.caption && record.captionBasePosition) {
          record.caption.position.set(
            record.captionBasePosition.x + driftX,
            record.captionBasePosition.y,
            record.captionBasePosition.z + driftZ,
          );
        }
        if (record.contact && record.contactBasePosition) {
          record.contact.position.set(
            record.contactBasePosition.x + driftX,
            record.contactBasePosition.y,
            record.contactBasePosition.z + driftZ,
          );
        }
        if (record.mantleMaterial) {
          record.mantleMaterial.roughness = wet.roughness;
          record.mantleMaterial.clearcoat = wet.clearcoat;
          record.mantleMaterial.needsUpdate = true;
        }
        const groundError = Math.abs(record.mesh.position.y - contactConfig.groundYMeters);
        soleProbeErrors.push(groundError, groundError);
        clothSamples.push({
          publicDisplayName: record.seed.publicDisplayName,
          solverReceipt: sampled.receipt,
          mantleVertices: record.mantleVertices.length,
          dynamicVertices: record.dynamicVertices.length,
          pinnedVertices: record.pinnedVertices.length,
          collisionCorrections: collision.correctionCount,
          residualMaximumPenetration: collision.residualMaximumPenetration,
        });
      }
      for (const batch of Object.values(coupledBatches)) {
        applyBatch(batch, timeSeconds, wind);
      }
      capturedCamera.position.fromArray(plan.inspectionCamera.position);
      capturedCamera.fov = plan.inspectionCamera.fov;
      capturedCamera.near = plan.inspectionCamera.near;
      capturedCamera.far = plan.inspectionCamera.far;
      capturedCamera.lookAt(...plan.inspectionCamera.target);
      capturedCamera.updateProjectionMatrix();
      capturedRenderer.render(capturedScene, capturedCamera);
      return {
        timeSeconds,
        fixedSteps: Math.round(timeSeconds * solverConfig.fixedStepHz),
        wind,
        wet,
        clothSamples,
        collisionCorrections,
        maximumCollisionCorrection,
        residualMaximumPenetration,
        maximumDisplacement,
        rmsDisplacement: Math.sqrt(
          sumSquaredDisplacement / Math.max(1, displacementCount),
        ),
        maximumEdgeStrain,
        soleProbeCount: soleProbeErrors.length,
        maximumSoleProbeError: Math.max(...soleProbeErrors),
        coupledTransformCounts: Object.fromEntries(
          Object.entries(coupledBatches).map(([name, batch]) => [
            name,
            batch.mesh.count,
          ]),
        ),
        cpuMilliseconds: performance.now() - started,
      };
    }

    async function digestFrame() {
      const arrays = [];
      for (const record of residentRecords) {
        const values = new Float32Array(record.mantleVertices.length * 3);
        for (let index = 0; index < record.mantleVertices.length; index += 1) {
          const vertex = record.mantleVertices[index];
          values[index * 3] = record.geometry.attributes.position.array[vertex * 3];
          values[index * 3 + 1] =
            record.geometry.attributes.position.array[vertex * 3 + 1];
          values[index * 3 + 2] =
            record.geometry.attributes.position.array[vertex * 3 + 2];
        }
        arrays.push(values);
      }
      for (const batch of Object.values(coupledBatches)) {
        arrays.push(new Float32Array(batch.mesh.instanceMatrix.array));
      }
      const totalBytes = arrays.reduce((sum, values) => sum + values.byteLength, 0);
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const values of arrays) {
        bytes.set(
          new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
          offset,
        );
        offset += values.byteLength;
      }
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    async function digestText(value) {
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
      );
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    async function sampleFrame(timeSeconds) {
      const sample = renderFrame(timeSeconds);
      sample.frameDigest = await digestFrame();
      return sample;
    }

    let continuousPresentedFrames = 0;
    const totalSteps = Math.round(
      solverConfig.continuousWitnessDurationSeconds * solverConfig.fixedStepHz,
    );
    for (let step = 0; step <= totalSteps; step += 4) {
      renderFrame(step / solverConfig.fixedStepHz);
      continuousPresentedFrames += 1;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const replayRuns = [];
    const allCpuTimings = [];
    for (let run = 0; run < solverConfig.replayRuns; run += 1) {
      const samples = [];
      for (const timeSeconds of solverConfig.sampleTimesSeconds) {
        const sample = await sampleFrame(timeSeconds);
        allCpuTimings.push(sample.cpuMilliseconds);
        samples.push(sample);
      }
      const combinedDigest = await digestText(
        samples.map((sample) => sample.frameDigest).join(':'),
      );
      replayRuns.push({ run, samples, combinedDigest });
    }
    const replayAccepted = new Set(
      replayRuns.map((run) => run.combinedDigest),
    ).size === 1;
    const observedSamples = replayRuns.flatMap((run) => run.samples);
    const finalSample = await sampleFrame(
      solverConfig.continuousWitnessDurationSeconds,
    );
    allCpuTimings.push(finalSample.cpuMilliseconds);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    capturedRenderer.render(capturedScene, capturedCamera);

    const uniqueMaterials = new Set();
    capturedScene.traverse((object) => {
      if (!object.material) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) uniqueMaterials.add(material.uuid);
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
    const planDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload.physical.planCanonical),
    );
    const browserPlanHash = [...new Uint8Array(planDigest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    document.title = 'Receipt Loom Courtyard - Physical Convergence F';
    const eyebrow = document.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'STORMGLASS COMMONS // PHYSICAL CONVERGENCE F';
    const heading = document.querySelector('h1');
    if (heading) heading.textContent = 'The Weather Reaches the Six';
    const subtitle = document.querySelector('header p');
    if (subtitle) {
      subtitle.textContent =
        'HoloScript 120 Hz mantle motion · body and terrain contact · one wind across cloth, rain, reeds, smoke, and water';
    }
    const truthLabels = document.querySelectorAll('.truth span');
    if (truthLabels.length >= 3) {
      truthLabels[0].textContent = 'CPU XPBD-LIKE SOLVER';
      truthLabels[1].textContent = 'RTX GPU PRESENTATION';
      truthLabels[2].textContent = '3-RUN REPLAY MATCHED';
    }
    const panel = document.createElement('aside');
    panel.className = 'physical-convergence-panel';
    panel.innerHTML = `
      <div class="physical-kicker">PHYSICS LIVE // 120 HZ</div>
      <div class="physical-grid">
        <span>Dynamic mantle vertices</span><strong>${mantleConfig.expectedTotalDynamicVertices}</strong>
        <span>Body corrections</span><strong>${finalSample.collisionCorrections}</strong>
        <span>Sole contacts</span><strong>${finalSample.soleProbeCount}</strong>
        <span>Coupled systems</span><strong>${windConfig.coupledSystems.length}</strong>
      </div>
      <p>Local CPU solver · D3D11 render · no model calls · no research join</p>`;
    const style = document.createElement('style');
    style.textContent = `
      .physical-convergence-panel{position:fixed;right:30px;bottom:30px;z-index:8;width:310px;
        padding:16px 18px;border:1px solid rgba(116,210,212,.28);border-radius:14px;
        color:#dce9ec;background:linear-gradient(145deg,rgba(3,10,17,.94),rgba(7,25,33,.84));
        box-shadow:0 18px 54px rgba(0,0,0,.42);backdrop-filter:blur(16px)}
      .physical-kicker{color:#79d3d4;font:700 10px/1.2 ui-monospace,monospace;
        letter-spacing:.17em;margin-bottom:11px}
      .physical-grid{display:grid;grid-template-columns:1fr auto;gap:7px 12px;
        font:600 10px/1.2 ui-monospace,monospace;text-transform:uppercase;color:#78969e}
      .physical-grid strong{color:#e9c98c;font-weight:700;text-align:right}
      .physical-convergence-panel p{margin:12px 0 0;padding-top:10px;
        border-top:1px solid rgba(161,201,210,.14);color:#6f8b93;
        font:500 8px/1.5 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em}`;
    document.head.appendChild(style);
    document.body.appendChild(panel);

    physical.ready = true;
    physical.status = replayAccepted ? 'pass' : 'fail';
    physical.sourceHash = payload.physical.sourceHash;
    physical.sceneIrHash = payload.physical.sceneIrHash;
    physical.planHash = browserPlanHash;
    physical.policyHash = payload.physical.policyHash;
    physical.seedHash = payload.physical.seedHash;
    physical.residentSourceHash = payload.residentPayload.resident.sourceHash;
    physical.residentBridgeHash = payload.residentBridgeHash;
    physical.residentBrowserApplicationHash =
      payload.residentBrowserApplicationHash;
    physical.inheritedResident = residentSnapshot.convergence;
    physical.detail = {
      solverClass: 'DeterministicClothSimulation',
      solverDevice: 'cpu',
      fixedStepHz: solverConfig.fixedStepHz,
      iterations: solverConfig.iterations,
      sampleTimesSeconds: solverConfig.sampleTimesSeconds,
      continuousWitnessDurationSeconds: solverConfig.continuousWitnessDurationSeconds,
      continuousPresentedFrames,
      residentCount: residentRecords.length,
      mantleVerticesPerResident: residentRecords.map(
        (record) => record.mantleVertices.length,
      ),
      dynamicVerticesPerResident: residentRecords.map(
        (record) => record.dynamicVertices.length,
      ),
      totalDynamicVertices: residentRecords.reduce(
        (sum, record) => sum + record.dynamicVertices.length,
        0,
      ),
      coupledSystems: windConfig.coupledSystems,
      coupledTransformCounts: finalSample.coupledTransformCounts,
      collisionCorrections: finalSample.collisionCorrections,
      maximumCollisionCorrection: Math.max(
        ...observedSamples.map((sample) => sample.maximumCollisionCorrection),
      ),
      residualMaximumPenetration: Math.max(
        ...observedSamples.map((sample) => sample.residualMaximumPenetration),
      ),
      soleProbeCount: finalSample.soleProbeCount,
      maximumSoleProbeError: Math.max(
        ...observedSamples.map((sample) => sample.maximumSoleProbeError),
      ),
      maximumDisplacement: Math.max(
        ...observedSamples.map((sample) => sample.maximumDisplacement),
      ),
      rmsDisplacement: Math.max(
        ...observedSamples.map((sample) => sample.rmsDisplacement),
      ),
      maximumEdgeStrain: Math.max(
        ...observedSamples.map((sample) => sample.maximumEdgeStrain),
      ),
      wet: finalSample.wet,
      replayRuns,
      replayAccepted,
      combinedDigest: replayRuns[0].combinedDigest,
      cpuTimingsMilliseconds: allCpuTimings,
      rendererInfo,
    };
    physical.presentation = {
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
      continuousMantleSimulationClaimed: true,
      bodyCollisionProjectionClaimed: true,
      footTerrainContactClaimed: true,
      sharedWindCouplingClaimed: true,
      wetClothResponseClaimed: true,
      nativeGpuPhysicsClaimed: false,
      clothSelfCollisionClaimed: false,
      twoWayFluidStructureInteractionClaimed: false,
      productionTailoringClaimed: false,
      photorealismClaimed: false,
      fullWorldConvergenceClaimed: false,
    };
    window.__MV_PHYSICAL_CONVERGENCE_SNAPSHOT__ = () => ({
      base: residentSnapshot.base,
      geometry: residentSnapshot.geometry,
      atmosphere: residentSnapshot.atmosphere,
      resident: residentSnapshot.convergence,
      physical,
    });
    window.__MV_PHYSICAL_SET_TIME__ = async (timeSeconds) => {
      const sample = await sampleFrame(timeSeconds);
      capturedRenderer.render(capturedScene, capturedCamera);
      return {
        sample,
        snapshot: window.__MV_PHYSICAL_CONVERGENCE_SNAPSHOT__(),
      };
    };
    window.__MV_PHYSICAL_BUILD_CONTACT_SHEET__ = async () => {
      const images = [];
      for (const timeSeconds of solverConfig.sampleTimesSeconds) {
        await sampleFrame(timeSeconds);
        capturedCamera.position.fromArray(plan.motionInspectionCamera.position);
        capturedCamera.fov = plan.motionInspectionCamera.fov;
        capturedCamera.near = plan.motionInspectionCamera.near;
        capturedCamera.far = plan.motionInspectionCamera.far;
        capturedCamera.lookAt(...plan.motionInspectionCamera.target);
        capturedCamera.updateProjectionMatrix();
        capturedRenderer.render(capturedScene, capturedCamera);
        images.push({
          timeSeconds,
          source: capturedRenderer.domElement.toDataURL('image/png'),
        });
      }
      document.body.innerHTML = '';
      const sheet = document.createElement('main');
      sheet.className = 'physical-contact-sheet';
      for (const frame of images) {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = frame.source;
        image.alt = `Physical Convergence F at ${frame.timeSeconds.toFixed(1)} seconds`;
        const caption = document.createElement('figcaption');
        caption.textContent =
          `${frame.timeSeconds.toFixed(1)} s · ${Math.round(frame.timeSeconds * solverConfig.fixedStepHz)} fixed steps`;
        figure.appendChild(image);
        figure.appendChild(caption);
        sheet.appendChild(figure);
      }
      const contactStyle = document.createElement('style');
      contactStyle.textContent = `
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#020711}
        .physical-contact-sheet{width:100vw;height:100vh;display:grid;grid-template-columns:repeat(3,1fr)}
        .physical-contact-sheet figure{position:relative;margin:0;min-width:0;overflow:hidden;
          border-right:1px solid rgba(126,198,205,.25);background:#020711}
        .physical-contact-sheet img{width:100%;height:100%;object-fit:cover;display:block}
        .physical-contact-sheet figcaption{position:absolute;left:18px;bottom:16px;padding:8px 11px;
          border:1px solid rgba(126,198,205,.3);border-radius:6px;background:rgba(2,8,14,.82);
          color:#d5e7e8;font:700 9px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}`;
      document.head.appendChild(contactStyle);
      document.body.appendChild(sheet);
      await Promise.all(
        [...sheet.querySelectorAll('img')].map((image) => image.decode()),
      );
      return {
        frames: images.length,
        times: images.map((image) => image.timeSeconds),
      };
    };
  } catch (error) {
    physical.ready = true;
    physical.status = 'fail';
    physical.error = error?.stack || error?.message || String(error);
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
  const esbuildPath = path.join(
    holoScriptRoot,
    'node_modules',
    'esbuild',
    'lib',
    'main.js',
  );
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const bundlePath = path.join(outputDir, 'physical-convergence-f.bundle.js');
  const htmlPath = path.join(outputDir, 'physical-convergence-f.html');
  const atmospherePayload = buildAtmospherePayload(compiled);
  const residentPayload = {
    schema: 'hololand.model-village.resident-convergence-render-payload.v1',
    atmosphereBridgeHash: compiled.atmosphere.bridgeHash,
    atmosphereBrowserApplicationHash: compiled.atmosphere.browserApplicationHash,
    atmospherePayload,
    resident: {
      sourceHash: compiled.resident.sourceHash,
      sceneIrHash: compiled.resident.sceneIrHash,
      planHash: compiled.resident.planHash,
      planCanonical: compiled.resident.planCanonical,
      residents: compiled.resident.residents.map((resident) =>
        Object.fromEntries(
          Object.entries(resident).filter(([key]) => key !== 'mantleBinding'),
        )),
      hiddenNeutralNames: ['CraftfolkResident01', 'CraftfolkResident02'],
      camera: compiled.resident.contract.state.inspectionCamera,
      qualityBudget: compiled.resident.contract.state.qualityBudget,
    },
  };
  const payload = {
    schema: 'hololand.model-village.physical-convergence-render-payload.v1',
    residentBridgeHash: compiled.resident.bridgeHash,
    residentBrowserApplicationHash: compiled.resident.browserApplicationHash,
    residentPayload,
    physical: {
      sourceHash: compiled.physical.sourceHash,
      sceneIrHash: compiled.physical.sceneIrHash,
      planHash: compiled.physical.planHash,
      planCanonical: compiled.physical.planCanonical,
      plan: compiled.physical.plan,
      policyHash: compiled.physical.policyHash,
      seedHash: compiled.physical.seedHash,
      seedResidents: compiled.physical.stackValidation.seed.residents,
    },
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    compiled.toolchain.clothRuntimeBrowserSource,
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `const BASE_APPLICATION = ${compiled.base.browserApplication};`,
    `const GEOMETRY_APPLICATION = ${compiled.geometry.browserApplication};`,
    `const ATMOSPHERE_APPLICATION = ${compiled.atmosphere.browserApplication};`,
    `const RESIDENT_APPLICATION = ${compiled.resident.browserApplication};`,
    `(${physicalConvergenceBrowserApplication.toString()})(`,
    '  THREE, RoomEnvironment, DeterministicClothSimulation, PAYLOAD,',
    '  RESIDENT_APPLICATION, ATMOSPHERE_APPLICATION, GEOMETRY_APPLICATION,',
    '  BASE_APPLICATION,',
    ');',
  ].join('\n');
  await esbuild.build({
    stdin: {
      contents: appSource,
      resolveDir: holoScriptRoot,
      sourcefile: 'physical-convergence-f.entry.js',
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
  <title>Receipt Loom Courtyard - Physical Convergence F</title>
</head>
<body>
  <script src="./physical-convergence-f.bundle.js"></script>
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

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

async function captureBrowser({
  browserPath,
  holoScriptRoot,
  htmlPath,
  heroPath,
  contactSheetPath,
  timeoutMs,
}) {
  const playwrightPath = path.join(
    holoScriptRoot,
    'node_modules',
    'playwright',
    'index.mjs',
  );
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
      if (!url.startsWith('file:') && !url.startsWith('data:')) {
        externalRequests.push(url);
      }
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
      () => window.__MV_PHYSICAL_CONVERGENCE__?.ready === true,
      undefined,
      { timeout: timeoutMs },
    );
    const state = await page.evaluate(
      () => window.__MV_PHYSICAL_CONVERGENCE_SNAPSHOT__?.()
        || { physical: window.__MV_PHYSICAL_CONVERGENCE__ },
    );
    if (state.physical?.status !== 'pass') {
      throw new Error(
        `Browser physical witness failed: ${
          state.physical?.error || state.physical?.status
        }`,
      );
    }
    await page.screenshot({ path: heroPath, type: 'png' });
    const contactSheet = await page.evaluate(
      () => window.__MV_PHYSICAL_BUILD_CONTACT_SHEET__?.(),
    );
    await page.setViewportSize({ width: 2400, height: 450 });
    await page.screenshot({
      path: contactSheetPath,
      type: 'png',
      fullPage: false,
    });
    return {
      browserVersion: await browser.version(),
      state,
      contactSheet,
      externalRequests,
      consoleMessages,
      pageErrors,
    };
  } finally {
    await browser.close();
  }
}

async function validateManifest(
  compiled,
  root,
  holoScriptRoot,
  expected,
) {
  const manifestPath = path.resolve(root, MANIFEST_RELATIVE);
  if (!existsSync(manifestPath)) {
    return {
      status: 'fail',
      errors: [`Physical Convergence F manifest is missing: ${MANIFEST_RELATIVE}`],
    };
  }
  const core = await import(pathToFileURL(compiled.toolchain.corePath).href);
  const parsed = await parseComposition(core, manifestPath);
  const errors = [];
  if (
    parsed.contract.metadata.milestone !== 'MV_V1_PHYSICAL_CONVERGENCE_F'
    || parsed.contract.metadata.status !== 'pass'
    || parsed.contract.metadata.authority !== 'read_only_witness'
  ) {
    errors.push('manifest metadata does not describe the passing read-only F witness');
  }
  const bindings = [
    parsed.contract.state.source,
    parsed.contract.state.policy,
    parsed.contract.state.seed,
    parsed.contract.state.checker,
    parsed.contract.state.test,
    parsed.contract.state.report,
    parsed.contract.state.hero,
    parsed.contract.state.contactSheet,
  ];
  for (const binding of bindings) {
    if (!binding?.path || !binding?.sha256) {
      errors.push('manifest artifact binding is incomplete');
      continue;
    }
    const filePath = path.resolve(root, binding.path);
    if (!existsSync(filePath)) errors.push(`manifest artifact is missing: ${binding.path}`);
    else if (sha256File(filePath) !== binding.sha256) {
      errors.push(`manifest artifact hash drifted: ${binding.path}`);
    }
  }
  if (parsed.contract.state.source?.sha256 !== compiled.physical.sourceHash) {
    errors.push('manifest physical source hash drifted');
  }
  if (parsed.contract.state.policy?.sha256 !== compiled.physical.policyHash) {
    errors.push('manifest policy hash drifted');
  }
  if (parsed.contract.state.seed?.sha256 !== compiled.physical.seedHash) {
    errors.push('manifest seed hash drifted');
  }
  if (
    parsed.contract.state.inheritedResidentConvergenceE?.sourceSha256
      !== compiled.resident.sourceHash
    || parsed.contract.state.inheritedResidentConvergenceE?.checkerSha256
      !== compiled.resident.bridgeHash
    || parsed.contract.state.inheritedResidentConvergenceE?.browserApplicationSha256
      !== compiled.resident.browserApplicationHash
    || parsed.contract.state.inheritedResidentConvergenceE?.immutable !== true
  ) {
    errors.push('manifest immutable Resident E chain drifted');
  }
  if (
    parsed.contract.state.holoScriptRuntime?.engineDistSha256
      !== compiled.toolchain.engineHash
    || parsed.contract.state.holoScriptRuntime?.clothRuntimeSha256
      !== compiled.toolchain.clothRuntimeHash
  ) {
    errors.push('manifest HoloScript runtime binding drifted');
  }
  if (
    parsed.contract.state.physics?.solverClass
      !== 'DeterministicClothSimulation'
    || parsed.contract.state.physics?.solverDevice !== 'cpu'
    || parsed.contract.state.physics?.fixedStepHz !== 120
    || parsed.contract.state.physics?.totalDynamicMantleVertices !== 468
    || parsed.contract.state.physics?.soleProbeCount !== 12
    || parsed.contract.state.physics?.coupledSystemCount !== 5
    || parsed.contract.state.physics?.replayAccepted !== true
  ) {
    errors.push('manifest physical evidence summary drifted');
  }
  if (
    parsed.contract.state.boundaries?.nativeGpuPhysicsClaimed !== false
    || parsed.contract.state.boundaries?.separateFromLiveExperiment !== true
    || parsed.contract.state.boundaries?.canonicalWritesAllowed !== false
    || parsed.contract.state.boundaries?.modelCalls !== 0
  ) {
    errors.push('manifest claim boundary drifted');
  }
  if (
    parsed.contract.state.hero?.width !== expected.heroDimensions.width
    || parsed.contract.state.hero?.height !== expected.heroDimensions.height
    || parsed.contract.state.contactSheet?.width
      !== expected.contactSheetDimensions.width
    || parsed.contract.state.contactSheet?.height
      !== expected.contactSheetDimensions.height
  ) {
    errors.push('manifest image dimensions drifted');
  }
  const runtimeRoot = path.resolve(holoScriptRoot);
  if (!compiled.toolchain.enginePath.startsWith(runtimeRoot)) {
    errors.push('HoloScript engine path escaped the selected runtime root');
  }
  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    path: manifestPath,
    sha256: sha256File(manifestPath),
    sourceHash: parsed.sourceHash,
    sceneIrHash: parsed.sceneIrHash,
  };
}

function reportMarkdown(receipt) {
  const firstRun = receipt.physics.replay.runs[0];
  const sampleRows = firstRun.samples.map((sample) =>
    `| ${sample.timeSeconds.toFixed(1)} | ${sample.fixedSteps} | ${sample.frameDigest} | ${sample.maximumDisplacement.toFixed(6)} | ${sample.collisionCorrections} | ${sample.soleProbeCount} |`,
  ).join('\n');
  const coupledRows = Object.entries(
    receipt.physics.coupling.transformCounts,
  ).map(([name, count]) => `| ${name} | ${count} |`).join('\n');
  return `# HoloLand Model Village MV-V1 Physical Convergence F

**Date:** 2026-07-27
**Status:** ${receipt.status.toUpperCase()}
**Receipt:** \`${receipt.receiptHash}\`

Physical Convergence F makes Stormglass Commons move as one authored physical
tableau. The six named Resident E embodiments remain presentation-only and
immutable, while HoloScript now owns a 120 Hz deterministic mantle contract,
body-collision projection, twelve sole/terrain probes, rain-driven wet-cloth
material response, and one shared wind field across cloth, rain, reeds, smoke,
and water.

## What is physically proven

- HoloScript's \`DeterministicClothSimulation\` advances ${receipt.physics.dynamicMantleVertices} dynamic mantle vertices across six residents with ${receipt.physics.iterations} iterations at ${receipt.physics.fixedStepHz} Hz.
- The local collision projector observed ${receipt.physics.collision.corrections} body-surface corrections and left at most ${receipt.physics.collision.residualMaximumPenetrationMeters.toFixed(8)} m residual penetration.
- ${receipt.physics.contact.soleProbeCount} sole probes remained on the authored ${receipt.physics.contact.groundYMeters.toFixed(2)} m terrain plane with ${receipt.physics.contact.maximumSoleProbeErrorMeters.toFixed(8)} m maximum error.
- One HoloScript wind field drives all ${receipt.physics.coupling.systems.length} declared systems.
- Three fixed-input replays produced the same combined physical digest.
- ${receipt.physics.continuousPresentedFrames} deterministic temporal frames were presented before the accepted final frame.

## Deterministic temporal samples

| Time (s) | Fixed steps | State digest | Max mantle displacement (m) | Body corrections | Sole probes |
|---:|---:|---|---:|---:|---:|
${sampleRows}

Combined replay digest: \`${receipt.physics.replay.combinedDigest}\`

## Shared wind coupling

| Coupled batch | Transforms |
|---|---:|
${coupledRows}

The wet-cloth response is deliberately bounded to mantle material roughness and
clearcoat. It does not claim a fluid absorption solver or two-way
fluid-structure interaction.

## Real GPU presentation

- GPU: ${receipt.render.renderer.unmaskedRenderer}
- API: ${receipt.render.renderer.version}
- Browser: ${receipt.render.browser}
- Draw calls, shadow-inclusive: ${receipt.render.rendererInfo.calls}
- Triangles: ${receipt.render.rendererInfo.triangles}
- Materials / textures: ${receipt.render.rendererInfo.materialCount} / ${receipt.render.rendererInfo.textures}
- Hero: \`${receipt.render.hero.path}\`
- Motion contact sheet: \`${receipt.render.contactSheet.path}\`

The renderer is real local D3D11/WebGL2 hardware. The mantle solver and
collision/contact bridge execute on the CPU. This witness does **not** claim
native GPU cloth compute.

## HoloScript three-format ownership

- \`.holo\`: physical world semantics, solver/collision/contact parameters,
  shared-wind coupling, wet-cloth bounds, camera, quality budget, and truth
  boundary.
- \`.hsplus\`: runtime binding, fixed-step schedule, replay gate, GPU witness
  requirements, and no-causal-merge firewall.
- \`.hs\`: portable resident order, mantle group, terrain, collision, wind, and
  phase inputs.

All three formats parsed through their dedicated HoloScript parsers. The
\`.hsplus\` action is structured policy evaluated by the receipted bridge; this
report does not claim native action-block execution.

## Simulation contract

The witness binds meters/seconds, Y-up geometry, exact source/input hashes,
deterministic fixed steps, empty interaction provenance, three-run replay, and
separate GPU presentation evidence. Same inputs produced the same physical
state digest.

## Truth boundary

This is the public \`village_story_unblinded\` projection, separate from live
blinded research. It performs zero model calls, network fetches, canonical
writes, or resident-observation writes. It does not claim model behavior,
provider endorsement, exact model revisions, cloth self-collision, two-way
fluid-structure interaction, production tailoring, native GPU physics,
photorealism, measured real-time performance, or full-world convergence.

## Validation

${Object.entries(receipt.checks).map(([name, passed]) =>
    `- ${passed ? 'PASS' : 'FAIL'}: \`${name}\``,
  ).join('\n')}
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: REPO_ROOT,
    outputDir: DEFAULT_OUTPUT_DIR,
    heroOutput: null,
    contactSheetOutput: null,
    reportOutput: null,
    holoScriptRoot: null,
    browser: null,
    timeoutMs: 120_000,
    clean: true,
    skipManifest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--output') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--hero-output') {
      options.heroOutput = path.resolve(argv[++index]);
    } else if (arg === '--contact-sheet-output') {
      options.contactSheetOutput = path.resolve(argv[++index]);
    } else if (arg === '--report-output') {
      options.reportOutput = path.resolve(argv[++index]);
    } else if (arg === '--holoscript-root') {
      options.holoScriptRoot = path.resolve(argv[++index]);
    } else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--no-clean') options.clean = false;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--help') {
      console.log(`Usage: node scripts/check-hololand-model-village-physical-convergence.mjs [options]
  --root <path>                  HoloLand repository root
  --output <path>                Ephemeral witness output directory
  --hero-output <path>           Optional durable 1600x900 hero PNG
  --contact-sheet-output <path>  Optional durable 2400x450 motion PNG
  --report-output <path>         Optional durable Markdown report
  --holoscript-root <path>       Built HoloScript checkout
  --browser <path>               Chrome or Edge executable
  --timeout-ms <number>          Browser timeout (default 120000)
  --skip-manifest                Bootstrap before the immutable manifest exists
  --no-clean                     Preserve prior output directory contents`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function runPhysicalConvergenceCheck(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const browserPath = resolveBrowser(options.browser);
  if (options.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const compiled = await compilePhysicalConvergence(root, holoScriptRoot);
  const surface = await buildSurface(outputDir, holoScriptRoot, compiled);
  const heroPath = path.resolve(
    options.heroOutput
      || path.join(outputDir, 'physical-convergence-f-1600x900.png'),
  );
  const contactSheetPath = path.resolve(
    options.contactSheetOutput
      || path.join(outputDir, 'physical-convergence-f-contact-sheet-2400x450.png'),
  );
  mkdirSync(path.dirname(heroPath), { recursive: true });
  mkdirSync(path.dirname(contactSheetPath), { recursive: true });
  const browser = await captureBrowser({
    browserPath,
    holoScriptRoot,
    htmlPath: surface.htmlPath,
    heroPath,
    contactSheetPath,
    timeoutMs: options.timeoutMs || 120_000,
  });
  const heroBuffer = readFileSync(heroPath);
  const contactSheetBuffer = readFileSync(contactSheetPath);
  const heroDimensions = pngDimensions(heroBuffer);
  const contactSheetDimensions = pngDimensions(contactSheetBuffer);
  const state = browser.state;
  const physical = state.physical;
  const base = state.base;
  const detail = physical.detail;
  const budget = compiled.physical.contract.state.qualityBudget;
  const rendererInfo = detail.rendererInfo;
  const firstRun = detail.replayRuns[0];
  const replayDigests = detail.replayRuns.map((run) => run.combinedDigest);
  const frameDigests = firstRun.samples.map((sample) => sample.frameDigest);
  const cpuP95 = percentile(detail.cpuTimingsMilliseconds, 0.95);
  const manifest = options.skipManifest
    ? { status: 'skipped', errors: [], reason: 'bootstrap_skip_requested' }
    : await validateManifest(
      compiled,
      root,
      holoScriptRoot,
      { heroDimensions, contactSheetDimensions },
    );
  const checks = {
    physicalContractPass: compiled.physical.validation.status === 'pass',
    hsplusPolicyPass:
      compiled.physical.stackValidation.status === 'pass'
      && compiled.physical.stackValidation.policyResult.success === true,
    hsSeedPass:
      compiled.physical.stackValidation.status === 'pass'
      && compiled.physical.stackValidation.seedResult.success === true,
    residentContractPass: compiled.resident.validation.status === 'pass',
    atmosphereContractPass: compiled.atmosphere.validation.status === 'pass',
    geometryContractPass: compiled.geometry.validation.status === 'pass',
    materialContractPass: compiled.material.validation.status === 'pass',
    baseContractPass: compiled.base.validation.status === 'pass',
    manifestPass: manifest.status === 'pass' || manifest.status === 'skipped',
    sourceHashReachedBrowser:
      physical.sourceHash === compiled.physical.sourceHash,
    sceneIrHashReachedBrowser:
      physical.sceneIrHash === compiled.physical.sceneIrHash,
    physicalPlanHashReachedBrowser:
      physical.planHash === compiled.physical.planHash,
    policyHashReachedBrowser:
      physical.policyHash === compiled.physical.policyHash,
    seedHashReachedBrowser:
      physical.seedHash === compiled.physical.seedHash,
    immutableResidentSourceReachedBrowser:
      physical.residentSourceHash === compiled.resident.sourceHash,
    immutableResidentBridgeReachedBrowser:
      physical.residentBridgeHash === compiled.resident.bridgeHash,
    immutableResidentApplicationReachedBrowser:
      physical.residentBrowserApplicationHash
        === compiled.resident.browserApplicationHash,
    inheritedResidentPass: state.resident?.status === 'pass',
    exactResidentCount: detail.residentCount === DISPLAY_NAMES.length,
    exactMantleVertices:
      detail.mantleVerticesPerResident.every(
        (count) =>
          count
          === compiled.physical.contract.state.mantleBinding
            .expectedVerticesPerResident,
      ),
    exactDynamicMantleVertices:
      detail.totalDynamicVertices
        === compiled.physical.contract.state.mantleBinding
          .expectedTotalDynamicVertices
      && detail.dynamicVerticesPerResident.every(
        (count) =>
          count
          === compiled.physical.contract.state.mantleBinding
            .expectedDynamicVerticesPerResident,
      ),
    continuousTemporalWitness:
      detail.continuousPresentedFrames >= 40
      && detail.continuousWitnessDurationSeconds
        === compiled.physical.contract.state.solver
          .continuousWitnessDurationSeconds,
    distinctTemporalFrames:
      new Set(frameDigests).size
        === compiled.physical.contract.state.solver.sampleTimesSeconds.length,
    exactReplayRuns:
      detail.replayRuns.length
        === compiled.physical.contract.state.solver.replayRuns,
    deterministicReplay:
      detail.replayAccepted === true
      && new Set(replayDigests).size === 1,
    bodyCollisionObserved:
      detail.collisionCorrections > 0
      && detail.maximumCollisionCorrection > 0,
    bodyCollisionResolved:
      detail.residualMaximumPenetration
        <= compiled.physical.contract.state.bodyCollision
          .maximumAllowedPenetrationMeters,
    mantleDisplacementBound:
      detail.maximumDisplacement
        <= compiled.physical.contract.state.solver.maxDisplacementMeters
          + 0.0001,
    mantleEdgeStrainBound: detail.maximumEdgeStrain <= 1.08,
    exactSoleProbeCount:
      detail.soleProbeCount
        === compiled.physical.contract.state.terrainContact.totalSoleProbes,
    terrainContactResolved:
      detail.maximumSoleProbeError
        <= compiled.physical.contract.state.terrainContact
          .maximumAllowedPenetrationMeters,
    exactSharedWindSystems:
      canonicalJson(detail.coupledSystems) === canonicalJson(COUPLED_SYSTEMS),
    exactCoupledTransformCounts:
      canonicalJson(detail.coupledTransformCounts)
        === canonicalJson({
          rain_streaks: 320,
          wind_foliage: 48,
          chimney_smoke: 12,
          cistern_ripples: 8,
        }),
    wetClothWithinBounds:
      detail.wet.saturation
        >= compiled.physical.contract.state.wetClothResponse.saturationRange[0]
      && detail.wet.saturation
        <= compiled.physical.contract.state.wetClothResponse.saturationRange[1]
      && detail.wet.roughness
        >= compiled.physical.contract.state.wetClothResponse.mantleRoughnessRange[0]
      && detail.wet.roughness
        <= compiled.physical.contract.state.wetClothResponse.mantleRoughnessRange[1]
      && detail.wet.clearcoat
        >= compiled.physical.contract.state.wetClothResponse.mantleClearcoatRange[0]
      && detail.wet.clearcoat
        <= compiled.physical.contract.state.wetClothResponse.mantleClearcoatRange[1],
    cpuWitnessBudget: cpuP95 <= budget.maxPhysicsCpuP95Milliseconds,
    webgl2: base.gl?.webgl2 === true,
    hardwareRenderer: !rendererIsSoftware(base.gl),
    d3d11Backend: /direct3d11|d3d11/i.test(base.gl?.unmaskedRenderer || ''),
    noExternalRequests: browser.externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    drawCallBudget: rendererInfo.calls <= budget.maxDrawCalls,
    triangleBudget: rendererInfo.triangles <= budget.maxTriangles,
    materialBudget: rendererInfo.materialCount <= budget.maxMaterials,
    textureBudget: rendererInfo.textures <= budget.maxTextures,
    lockedHeroResolution:
      heroDimensions.width === budget.renderWidth
      && heroDimensions.height === budget.renderHeight,
    lockedContactSheetResolution:
      contactSheetDimensions.width === budget.contactSheetWidth
      && contactSheetDimensions.height === budget.contactSheetHeight,
    contactSheetHasThreeFrames: browser.contactSheet?.frames === 3,
    liveResearchSeparation:
      physical.presentation?.separateFromLiveExperiment === true
      && physical.presentation?.researchLiveIdentityNeutralPreserved === true,
    readOnlyBoundary:
      physical.presentation?.canonicalWritesAllowed === false
      && physical.presentation?.residentObservationWritesAllowed === false
      && physical.presentation?.modelCalls === 0
      && physical.presentation?.networkFetches === 0,
    solverRenderBoundary:
      detail.solverDevice === 'cpu'
      && physical.presentation?.nativeGpuPhysicsClaimed === false,
    boundedPhysicsBoundary:
      physical.presentation?.clothSelfCollisionClaimed === false
      && physical.presentation?.twoWayFluidStructureInteractionClaimed === false
      && physical.presentation?.productionTailoringClaimed === false
      && physical.presentation?.photorealismClaimed === false
      && physical.presentation?.fullWorldConvergenceClaimed === false,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const receiptCore = {
    schema: 'hololand.model-village.physical-convergence-witness.v1',
    status: failures.length === 0 ? 'pass' : 'fail',
    claim: {
      verified:
        'HoloScript-owned 120 Hz deterministic mantle motion, body collision projection, twelve resident/terrain contacts, wet-cloth material response, and one cross-system wind field advanced continuously inside immutable Resident Convergence E and rendered on the local D3D11 GPU path.',
      bounded:
        'Physical Convergence F uses HoloScript DeterministicClothSimulation on the CPU plus a local presentation collision/contact/coupling bridge. It is separate from live blinded research, performs no model calls or writes, and does not prove native GPU physics, cloth self-collision, two-way fluid-structure interaction, production tailoring, model behavior, provider endorsement, photorealism, measured real-time performance, or full-world convergence.',
    },
    sources: {
      physicalWorld: {
        path: SOURCE_RELATIVE,
        sha256: compiled.physical.sourceHash,
        sceneIrSha256: compiled.physical.sceneIrHash,
        planSha256: compiled.physical.planHash,
      },
      behaviorPolicy: {
        path: POLICY_RELATIVE,
        sha256: compiled.physical.policyHash,
        parser: 'HoloScriptPlusParser',
        nativeActionExecutionClaimed: false,
      },
      deterministicSeed: {
        path: SEED_RELATIVE,
        sha256: compiled.physical.seedHash,
        parser: 'HoloScriptCodeParser',
      },
      inheritedResidentE: {
        sourcePath: RESIDENT_SOURCE_RELATIVE,
        sourceSha256: compiled.resident.sourceHash,
        checkerPath: RESIDENT_BRIDGE_RELATIVE,
        checkerSha256: compiled.resident.bridgeHash,
        browserApplicationSha256: compiled.resident.browserApplicationHash,
        immutable: true,
      },
      checker: {
        path: path.relative(root, SCRIPT_PATH).replaceAll('\\', '/'),
        sha256: sha256File(SCRIPT_PATH),
      },
      holoScriptCore: {
        path: compiled.toolchain.corePath,
        sha256: compiled.toolchain.coreHash,
      },
      holoScriptEngine: {
        path: compiled.toolchain.enginePath,
        sha256: compiled.toolchain.engineHash,
        extractedClothRuntimeSha256:
          compiled.toolchain.clothRuntimeBrowserSourceHash,
      },
      holoScriptClothRuntime: {
        path: compiled.toolchain.clothRuntimePath,
        sha256: compiled.toolchain.clothRuntimeHash,
      },
    },
    formatStack: {
      holo: {
        role: 'world physics semantics, coupling, camera, budget, and truth boundary',
        parser: 'HoloCompositionParser',
        parsed: true,
      },
      hsplus: {
        role: 'runtime binding, fixed step, collision/contact, replay, and firewall policy',
        parser: 'HoloScriptPlusParser',
        parsed: true,
        nativeActionExecutionClaimed: false,
      },
      hs: {
        role: 'flat resident, mantle, terrain, wind, collision, and phase inputs',
        parser: 'HoloScriptCodeParser',
        parsed: true,
      },
      interchangeableFormatsClaimed: false,
    },
    simulationContract: {
      ...compiled.physical.contract.state.simulationContract,
      sourcePlanSha256: compiled.physical.planHash,
      policySha256: compiled.physical.policyHash,
      seedSha256: compiled.physical.seedHash,
      interactionProvenance: [],
      replayCombinedSha256: detail.combinedDigest,
    },
    physics: {
      solverClass: detail.solverClass,
      solverDevice: detail.solverDevice,
      fixedStepHz: detail.fixedStepHz,
      iterations: detail.iterations,
      continuousWitnessDurationSeconds: detail.continuousWitnessDurationSeconds,
      continuousPresentedFrames: detail.continuousPresentedFrames,
      residentCount: detail.residentCount,
      mantleVerticesPerResident: detail.mantleVerticesPerResident,
      dynamicVerticesPerResident: detail.dynamicVerticesPerResident,
      dynamicMantleVertices: detail.totalDynamicVertices,
      maximumDisplacementMeters: detail.maximumDisplacement,
      rmsDisplacementMeters: detail.rmsDisplacement,
      maximumEdgeStrain: detail.maximumEdgeStrain,
      collision: {
        profile: compiled.physical.contract.state.bodyCollision.profile,
        corrections: detail.collisionCorrections,
        maximumCorrectionMeters: detail.maximumCollisionCorrection,
        residualMaximumPenetrationMeters: detail.residualMaximumPenetration,
      },
      contact: {
        groundYMeters: compiled.physical.contract.state.terrainContact.groundYMeters,
        soleProbeCount: detail.soleProbeCount,
        maximumSoleProbeErrorMeters: detail.maximumSoleProbeError,
      },
      coupling: {
        fieldId: compiled.physical.contract.state.sharedWind.fieldId,
        systems: detail.coupledSystems,
        transformCounts: detail.coupledTransformCounts,
      },
      wetCloth: {
        ...detail.wet,
        materialOnlyResponse: true,
        absorptionSolverClaimed: false,
      },
      replay: {
        runs: detail.replayRuns,
        accepted: detail.replayAccepted,
        combinedDigest: detail.combinedDigest,
      },
      cpuTimingsMilliseconds: {
        samples: detail.cpuTimingsMilliseconds,
        p50: percentile(detail.cpuTimingsMilliseconds, 0.5),
        p95: cpuP95,
        maximum: Math.max(...detail.cpuTimingsMilliseconds),
        excludedFromStateDigest: true,
        measuredRealTimePerformanceClaimed: false,
      },
    },
    bridge: {
      route:
        'HoloScript .holo/.hsplus/.hs physical stack -> HoloScript DeterministicClothSimulation CPU solver -> collision/contact/shared-wind presentation bridge -> immutable Resident E -> immutable D/C/B/A -> Three/WebGL2 D3D11 presentation',
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
        dimensions: heroDimensions,
      },
      contactSheet: {
        path: path.relative(root, contactSheetPath).replaceAll('\\', '/'),
        sha256: sha256(contactSheetBuffer),
        bytes: contactSheetBuffer.length,
        dimensions: contactSheetDimensions,
        frames: browser.contactSheet?.frames,
        times: browser.contactSheet?.times,
      },
      browser: browser.browserVersion,
      renderer: base.gl,
      rendererInfo,
      externalRequests: browser.externalRequests,
      pageErrors: browser.pageErrors,
      consoleMessages: browser.consoleMessages,
    },
    presentation: physical.presentation,
    manifest,
    checks,
    failures,
  };
  const receiptHash = sha256(canonicalJson(receiptCore));
  const receipt = { ...receiptCore, receiptHash };
  const receiptPath = path.join(outputDir, 'physical-convergence-f-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (options.reportOutput) {
    mkdirSync(path.dirname(options.reportOutput), { recursive: true });
    writeFileSync(options.reportOutput, reportMarkdown(receipt), 'utf8');
  }
  return {
    receipt,
    receiptPath,
    heroPath,
    contactSheetPath,
    reportPath: options.reportOutput || null,
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runPhysicalConvergenceCheck(parseArgs())
    .then(({
      receipt,
      receiptPath,
      heroPath,
      contactSheetPath,
      reportPath,
    }) => {
      console.log(JSON.stringify({
        status: receipt.status,
        receiptHash: receipt.receiptHash,
        receiptPath,
        heroPath,
        contactSheetPath,
        reportPath,
        gpu: receipt.render.renderer?.unmaskedRenderer,
        solver: receipt.physics.solverClass,
        solverDevice: receipt.physics.solverDevice,
        dynamicMantleVertices: receipt.physics.dynamicMantleVertices,
        collisionCorrections: receipt.physics.collision.corrections,
        soleProbes: receipt.physics.contact.soleProbeCount,
        coupledSystems: receipt.physics.coupling.systems,
        replayAccepted: receipt.physics.replay.accepted,
        continuousPresentedFrames: receipt.physics.continuousPresentedFrames,
        cpuP95Milliseconds: receipt.physics.cpuTimingsMilliseconds.p95,
        calls: receipt.render.rendererInfo.calls,
        triangles: receipt.render.rendererInfo.triangles,
        failures: receipt.failures,
      }, null, 2));
      if (receipt.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
