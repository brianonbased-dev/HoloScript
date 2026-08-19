#!/usr/bin/env node
/* global console, document, performance, process, requestAnimationFrame, window */
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

import { canonicalJson } from './check-hololand-model-village-receipt-loom-courtyard.mjs';
import {
  runPhysicalConvergenceCheck,
} from './check-hololand-model-village-physical-convergence.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-performance-convergence.holo';
const POLICY_RELATIVE =
  'source/proofs/model-village-receipt-loom-performance-convergence-policy.hsplus';
const SEED_RELATIVE =
  'source/proofs/model-village-receipt-loom-performance-convergence-seed.hs';
const MANIFEST_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-performance-convergence-manifest.holo';
const FAMILY_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-family-mantle-catalog.holo';
const PHYSICAL_SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-physical-convergence.holo';
const PHYSICAL_POLICY_RELATIVE =
  'source/proofs/model-village-receipt-loom-physical-convergence-policy.hsplus';
const PHYSICAL_SEED_RELATIVE =
  'source/proofs/model-village-receipt-loom-physical-convergence-seed.hs';
const PHYSICAL_CHECKER_RELATIVE =
  'scripts/check-hololand-model-village-physical-convergence.mjs';
const PHYSICAL_TEST_RELATIVE =
  'scripts/__tests__/hololand-model-village-physical-convergence.test.mjs';
const PHYSICAL_REPORT_RELATIVE =
  'docs/reports/HOLOLAND_MODEL_VILLAGE_MV_V1_PHYSICAL_CONVERGENCE_F_2026-07-27.md';
const PHYSICAL_HERO_RELATIVE =
  'docs/assets/model-village/model-village-receipt-loom-physical-convergence-f-2026-07-27.png';
const PHYSICAL_CONTACT_SHEET_RELATIVE =
  'docs/assets/model-village/model-village-receipt-loom-physical-convergence-f-motion-2026-07-27.png';
const PHYSICAL_MANIFEST_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-physical-convergence-manifest.holo';
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'performance-convergence-g',
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
const FAMILY_SLUGS = Object.freeze([
  'claude',
  'openai',
  'gemini',
  'grok',
  'glm',
  'brittney',
]);
const HISTORY_RESET_EVENTS = Object.freeze([
  'camera_cut',
  'lod_change',
  'profile_change',
  'resize',
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

function resolveHoloScriptRoot(root, explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(root, '..', 'HoloScript'),
    'C:/Users/josep/Documents/GitHub/HoloScript',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (
      existsSync(path.join(resolved, 'packages', 'core', 'dist', 'index.js'))
      && existsSync(path.join(resolved, 'packages', 'engine', 'src', 'lod', 'LODManager.ts'))
      && existsSync(path.join(resolved, 'node_modules', 'three', 'examples', 'jsm', 'postprocessing', 'TAARenderPass.js'))
    ) {
      return resolved;
    }
  }
  throw new Error('Built HoloScript checkout with engine LOD and Three TAA is required');
}

function resolveBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const browser = candidates.map((candidate) => path.resolve(candidate))
    .find((candidate) => existsSync(candidate));
  if (!browser) throw new Error('Chrome or Edge executable is required');
  return browser;
}

async function parseComposition(core, sourcePath) {
  const sourceText = readFileSync(sourcePath, 'utf8');
  const parsed = new core.HoloCompositionParser().parse(sourceText);
  if (!parsed.success || parsed.errors.length > 0) {
    throw new Error(
      `${path.basename(sourcePath)} did not parse: ${JSON.stringify(parsed.errors)}`,
    );
  }
  const sceneIr = new core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(parsed.ast);
  return {
    sourceText,
    sourceHash: sha256(sourceText),
    sceneIrHash: sha256(canonicalJson(sceneIr)),
    contract: {
      metadata: parsed.ast.metadata,
      environment: stateProperties(parsed.ast.environment),
      state: stateProperties(parsed.ast.state),
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

export function buildPerformancePlan(contract) {
  return {
    milestone: contract.metadata.milestone,
    presentationProfile: contract.state.presentationProfile,
    measuredQualityProfile: contract.state.measuredQualityProfile,
    namedResidents: contract.state.publicDisplayNames.map((name, index) => ({
      order: index,
      publicDisplayName: name,
      familyId: contract.state.familyIds[index],
      slug: FAMILY_SLUGS[index],
      residentObjectName: `ResidentConvergence:${name}`,
    })),
    qualityProfile: contract.state.qualityProfile,
    lod: contract.state.lod,
    temporalAccumulation: contract.state.temporalAccumulation,
    comparison: contract.state.comparison,
    simulationContract: contract.state.simulationContract,
    inspectionCamera: contract.state.inspectionCamera,
    lodProbeDistancesMeters: contract.state.lodProbeDistancesMeters,
    boundaries: {
      separateFromLiveExperiment: contract.state.separateFromLiveExperiment,
      researchLiveIdentityNeutralPreserved:
        contract.state.researchLiveIdentityNeutralPreserved,
      canonicalWritesAllowed: contract.state.canonicalWritesAllowed,
      residentObservationWritesAllowed:
        contract.state.residentObservationWritesAllowed,
      modelCallsAllowed: contract.state.modelCallsAllowed,
      networkFetchesAllowed: contract.state.networkFetchesAllowed,
      concurrentPhysicsAndRenderPerformanceClaimed:
        contract.state.concurrentPhysicsAndRenderPerformanceClaimed,
      motionReprojectionClaimed: contract.state.motionReprojectionClaimed,
      dynamicResolutionClaimed: contract.state.dynamicResolutionClaimed,
      crossDevicePerformanceClaimed:
        contract.state.crossDevicePerformanceClaimed,
      headsetPerformanceClaimed: contract.state.headsetPerformanceClaimed,
      nativeWebGpuTaaClaimed: contract.state.nativeWebGpuTaaClaimed,
      productionTaaClaimed: contract.state.productionTaaClaimed,
      photorealismClaimed: contract.state.photorealismClaimed,
      fullWorldConvergenceClaimed:
        contract.state.fullWorldConvergenceClaimed,
    },
  };
}

function exactFileHash(root, relativePath, expectedHash, errors, label) {
  const filePath = path.resolve(root, relativePath);
  if (!existsSync(filePath)) {
    errors.push(`${label} is missing: ${relativePath}`);
    return;
  }
  const actual = sha256File(filePath);
  if (actual !== expectedHash) {
    errors.push(`${label} hash drifted: expected ${expectedHash}, got ${actual}`);
  }
}

export function validatePerformanceConvergenceContract(
  contract,
  root = REPO_ROOT,
  holoScriptRoot = resolveHoloScriptRoot(root),
) {
  const errors = [];
  const meta = contract.metadata;
  const state = contract.state;
  const profile = state.qualityProfile || {};
  const lod = state.lod || {};
  const temporal = state.temporalAccumulation || {};

  if (meta.milestone !== 'MV_V1_PERFORMANCE_CONVERGENCE_G') {
    errors.push('metadata.milestone must be MV_V1_PERFORMANCE_CONVERGENCE_G');
  }
  if (meta.worldName !== 'Stormglass Commons') {
    errors.push('metadata.worldName must remain Stormglass Commons');
  }
  if (meta.artStyle !== 'hearthlight_biorealism') {
    errors.push('metadata.artStyle must remain hearthlight_biorealism');
  }
  if (meta.inheritedWitnessesImmutable !== true) {
    errors.push('metadata.inheritedWitnessesImmutable must be true');
  }
  if (state.authority !== 'read_only') {
    errors.push('state.authority must be read_only');
  }
  if (state.presentationProfile !== 'village_story_unblinded') {
    errors.push('state.presentationProfile must be village_story_unblinded');
  }
  if (state.researchLiveBlindedCompatible !== false) {
    errors.push('state.researchLiveBlindedCompatible must be false');
  }
  for (const key of [
    'canonicalWritesAllowed',
    'residentObservationWritesAllowed',
    'modelCallsAllowed',
    'networkFetchesAllowed',
    'concurrentPhysicsAndRenderPerformanceClaimed',
    'motionReprojectionClaimed',
    'velocityBufferClaimed',
    'disocclusionRejectionClaimed',
    'dynamicResolutionClaimed',
    'crossDevicePerformanceClaimed',
    'headsetPerformanceClaimed',
    'nativeWebGpuTaaClaimed',
    'productionTaaClaimed',
    'photorealismClaimed',
    'fullWorldConvergenceClaimed',
  ]) {
    if (state[key] !== false) errors.push(`state.${key} must be false`);
  }
  if (
    state.performanceConvergenceClaimed !== true
    || state.authoredFamilyLodConvergenceClaimed !== true
    || state.staticTemporalAccumulationClaimed !== true
    || state.measuredLocalDesktopPerformanceClaimed !== true
  ) {
    errors.push('bounded G performance, family LOD, temporal, and local claims are required');
  }
  if (
    state.namedResidentCount !== DISPLAY_NAMES.length
    || canonicalJson(state.publicDisplayNames) !== canonicalJson(DISPLAY_NAMES)
    || canonicalJson(state.familyIds) !== canonicalJson(FAMILY_IDS)
  ) {
    errors.push('named resident roster drifted');
  }
  if (
    state.measuredQualityProfile !== 'desktop_cinematic_g1'
    || profile.id !== 'desktop_cinematic_g1'
    || profile.renderWidth !== 1600
    || profile.renderHeight !== 900
    || profile.devicePixelRatio !== 1
    || profile.warmupFrames !== 600
    || profile.measuredFrames !== 1800
  ) {
    errors.push('desktop_cinematic_g1 profile dimensions or sample counts drifted');
  }
  if (
    profile.settledPhysicalFrameOnly !== true
    || profile.continuousPhysicsDuringBenchmark !== false
  ) {
    errors.push('profile must remain a settled F presentation benchmark');
  }
  if (
    lod.runtimeClass !== 'LODManager'
    || lod.runtimePackage !== '@holoscript/engine'
    || lod.strategy !== 'distance'
    || lod.transition !== 'instant'
    || lod.hysteresis !== 0.08
    || lod.sourceAuthoredFamilyTiers !== 18
    || lod.sourceAuthoredResidentCount !== 6
    || lod.repeatedCompileByteIdentityRequired !== true
    || lod.compilerFallbackAllowed !== false
    || lod.lowerTierClothSimulationClaimed !== false
  ) {
    errors.push('HoloScript LODManager binding or bounded tier claim drifted');
  }
  const levels = lod.levels || [];
  if (
    levels.length !== 3
    || canonicalJson(levels.map((level) => level.level)) !== canonicalJson([0, 1, 2])
    || canonicalJson(levels.map((level) => level.distanceMeters))
      !== canonicalJson([0, 12, 28])
    || canonicalJson(levels.map((level) => level.garmentSegments))
      !== canonicalJson([24, 14, 8])
  ) {
    errors.push('source-authored LOD level contract drifted');
  }
  if (
    temporal.implementation !== 'three_taa_render_pass'
    || temporal.mode !== 'static_jittered_accumulation'
    || temporal.historySamples !== 32
    || temporal.accumulationEnabled !== true
    || temporal.resetOnCameraCut !== true
    || temporal.resetOnLodChange !== true
    || temporal.resetOnProfileChange !== true
    || temporal.resetOnResize !== true
    || temporal.motionReprojection !== false
    || temporal.velocityBuffer !== false
    || temporal.disocclusionRejection !== false
    || temporal.productionTaaClaimed !== false
  ) {
    errors.push('static temporal accumulation contract drifted');
  }

  for (const [relativeKey, hashKey, label] of [
    ['inheritedPhysicalSource', 'inheritedPhysicalSourceSha256', 'Physical F source'],
    ['inheritedPhysicalPolicy', 'inheritedPhysicalPolicySha256', 'Physical F policy'],
    ['inheritedPhysicalSeed', 'inheritedPhysicalSeedSha256', 'Physical F seed'],
    ['inheritedPhysicalChecker', 'inheritedPhysicalCheckerSha256', 'Physical F checker'],
    ['inheritedPhysicalTest', 'inheritedPhysicalTestSha256', 'Physical F test'],
    ['inheritedPhysicalReport', 'inheritedPhysicalReportSha256', 'Physical F report'],
    ['inheritedPhysicalHero', 'inheritedPhysicalHeroSha256', 'Physical F hero'],
    ['inheritedPhysicalContactSheet', 'inheritedPhysicalContactSheetSha256', 'Physical F contact sheet'],
    ['inheritedPhysicalManifest', 'inheritedPhysicalManifestSha256', 'Physical F manifest'],
    ['familyMantleSource', 'familyMantleSourceSha256', 'family mantle source'],
  ]) {
    if (!SHA256_PATTERN.test(meta[hashKey] || '')) {
      errors.push(`${hashKey} is not a SHA-256 digest`);
    } else {
      exactFileHash(root, meta[relativeKey], meta[hashKey], errors, label);
    }
  }
  for (const [relativeKey, hashKey, label] of [
    ['holoScriptLodManagerSource', 'holoScriptLodManagerSourceSha256', 'HoloScript LODManager'],
    ['holoScriptLodTypesSource', 'holoScriptLodTypesSourceSha256', 'HoloScript LOD types'],
    ['temporalPassSource', 'temporalPassSourceSha256', 'Three TAARenderPass'],
  ]) {
    if (!SHA256_PATTERN.test(meta[hashKey] || '')) {
      errors.push(`${hashKey} is not a SHA-256 digest`);
    } else {
      exactFileHash(
        holoScriptRoot,
        meta[relativeKey],
        meta[hashKey],
        errors,
        label,
      );
    }
  }

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    plan: buildPerformancePlan(contract),
  };
}

function seedNodesByType(seedAst, type) {
  return seedAst.filter((node) => node?.properties?.type === type);
}

function validatePolicyAndSeed(core, policyText, seedText) {
  const policyResult = new core.HoloScriptPlusParser().parse(policyText);
  const seedResult = new core.HoloScriptCodeParser().parse(seedText);
  const errors = [];
  if (!policyResult.success || policyResult.errors.length > 0) {
    errors.push(`hsplus policy parse failed: ${JSON.stringify(policyResult.errors)}`);
  }
  if (!seedResult.success || seedResult.errors.length > 0) {
    errors.push(`hs seed parse failed: ${JSON.stringify(seedResult.errors)}`);
  }
  if (errors.length > 0) {
    return { status: 'fail', errors, policyResult, seedResult };
  }
  const composition = policyResult.ast.children.find(
    (node) => node.type === 'composition',
  );
  const templates = Object.fromEntries(
    composition.children
      .filter((node) => node.type === 'template')
      .map((node) => [node.name, node.properties]),
  );
  const residents = seedNodesByType(seedResult.ast, 'resident_performance_seed')
    .map((node) => node.properties)
    .sort((left, right) => left.order - right.order);
  const levels = seedNodesByType(seedResult.ast, 'family_lod_level_seed')
    .map((node) => node.properties)
    .sort((left, right) => left.level - right.level);
  const probes = seedNodesByType(seedResult.ast, 'lod_distance_probe')
    .map((node) => node.properties);
  const resets = seedNodesByType(seedResult.ast, 'temporal_history_reset_seed')
    .map((node) => node.properties);
  if (
    templates.HoloScriptLodRuntimeBinding?.runtimeClass !== 'LODManager'
    || templates.StaticTemporalAccumulationContract?.productionTaaClaimed !== false
    || templates.DesktopCinematicProfile?.warmupFrames !== 600
    || templates.DesktopCinematicProfile?.measuredFrames !== 1800
  ) {
    errors.push('hsplus runtime, temporal, or benchmark policy drifted');
  }
  if (
    residents.length !== 6
    || canonicalJson(residents.map((resident) => resident.publicDisplayName))
      !== canonicalJson(DISPLAY_NAMES)
    || canonicalJson(levels.map((level) => level.distanceMeters))
      !== canonicalJson([0, 12, 28])
    || canonicalJson(probes.map((probe) => probe.expectedLevel).sort())
      !== canonicalJson([0, 1, 2])
    || canonicalJson(resets.map((reset) => reset.event).sort())
      !== canonicalJson([...HISTORY_RESET_EVENTS].sort())
  ) {
    errors.push('hs resident, LOD probe, or reset inputs drifted');
  }
  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    policyResult,
    seedResult,
    policy: { templates },
    seed: { residents, levels, probes, resets },
  };
}

export async function compileFamilyLodBundles(
  core,
  familySourceText,
  expectedLevels = [0, 1, 2],
) {
  const parsed = core.parseHolo(familySourceText);
  if (!parsed.success || parsed.errors.length > 0) {
    throw new Error(`family mantle source did not parse: ${JSON.stringify(parsed.errors)}`);
  }
  const records = [];
  for (let familyIndex = 0; familyIndex < DISPLAY_NAMES.length; familyIndex += 1) {
    const publicDisplayName = DISPLAY_NAMES[familyIndex];
    const slug = FAMILY_SLUGS[familyIndex];
    const tiers = [];
    for (const level of expectedLevels) {
      const compile = async () =>
        new core.ExportManager({
          useCircuitBreaker: false,
          useFallback: false,
          useMemoryMonitoring: false,
        }).export('character-webgpu', parsed.ast, {
          compilerOptions: {
            objectId: publicDisplayName,
            entityId: `model-village-${slug}-story-resident`,
            lodLevel: level,
          },
        });
      const first = await compile();
      const second = await compile();
      if (!first.success || !second.success) {
        throw new Error(`${publicDisplayName} LOD${level} compilation failed`);
      }
      if (first.usedFallback || second.usedFallback) {
        throw new Error(`${publicDisplayName} LOD${level} used compiler fallback`);
      }
      if (first.output !== second.output) {
        throw new Error(`${publicDisplayName} LOD${level} was not byte-identical`);
      }
      const bundle = JSON.parse(first.output);
      if (
        bundle.format !== 'character-webgpu/drawspec'
        || bundle.lod?.level !== level
        || bundle.materialGroups?.length !== 4
        || bundle.report?.objectId !== publicDisplayName
      ) {
        throw new Error(`${publicDisplayName} LOD${level} bundle contract drifted`);
      }
      tiers.push({
        level,
        sha256: sha256(first.output),
        bytes: Buffer.byteLength(first.output),
        vertexCount: bundle.vertexCount,
        triangleCount: bundle.mesh.indices.length / 3,
        garmentSegments: bundle.lod.garmentSegments,
        distance: bundle.lod.distance,
        mantleStyle: bundle.mantle?.style,
        bundle,
      });
    }
    if (
      !(tiers[0].vertexCount > tiers[1].vertexCount
        && tiers[1].vertexCount > tiers[2].vertexCount
        && tiers[0].triangleCount > tiers[1].triangleCount
        && tiers[1].triangleCount > tiers[2].triangleCount)
    ) {
      throw new Error(`${publicDisplayName} authored LOD tiers do not reduce topology`);
    }
    records.push({
      order: familyIndex,
      publicDisplayName,
      familyId: FAMILY_IDS[familyIndex],
      slug,
      repeatedCompileByteIdentical: true,
      fallbackUsed: false,
      tiers,
    });
  }
  return records;
}

function patchPhysicalBundle(bundleText) {
  const anchor = '      const plan = payload.physical.plan;\n';
  const occurrences = bundleText.split(anchor).length - 1;
  if (occurrences !== 1) {
    throw new Error(`physical bundle exposure anchor count is ${occurrences}, expected 1`);
  }
  return bundleText.replace(
    anchor,
    [
      '      window.__MV_PHYSICAL_CAPTURE__ = {',
      '        renderer: capturedRenderer,',
      '        scene: capturedScene,',
      '        camera: capturedCamera,',
      '        THREE,',
      '      };',
      anchor.trimEnd(),
      '',
    ].join('\n'),
  );
}

async function performanceConvergenceBrowserApplication(
  THREE,
  EffectComposer,
  TAARenderPass,
  OutputPass,
  LODManager,
  payload,
) {
  const convergence = {
    schema: 'hololand.model-village.performance-convergence-browser.v1',
    ready: false,
    status: 'booting',
    error: null,
  };
  window.__MV_PERFORMANCE_CONVERGENCE__ = convergence;
  try {
    const waitStarted = performance.now();
    while (
      (
        window.__MV_PHYSICAL_CONVERGENCE__?.ready !== true
        || !window.__MV_PHYSICAL_CAPTURE__
      )
      && performance.now() - waitStarted < 120000
    ) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (
      window.__MV_PHYSICAL_CONVERGENCE__?.status !== 'pass'
      || !window.__MV_PHYSICAL_CAPTURE__
    ) {
      throw new Error('immutable Physical Convergence F did not expose a passing surface');
    }
    const {
      renderer,
      scene,
      camera,
    } = window.__MV_PHYSICAL_CAPTURE__;
    const plan = payload.plan;
    const width = plan.qualityProfile.renderWidth;
    const height = plan.qualityProfile.renderHeight;
    renderer.setPixelRatio(plan.qualityProfile.devicePixelRatio);
    renderer.setSize(width, height, false);
    camera.position.fromArray(plan.inspectionCamera.position);
    camera.fov = plan.inspectionCamera.fov;
    camera.near = plan.inspectionCamera.near;
    camera.far = plan.inspectionCamera.far;
    camera.lookAt(...plan.inspectionCamera.target);
    camera.updateProjectionMatrix();

    function geometryFromBundle(bundle) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(bundle.mesh.positions), 3),
      );
      geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(new Float32Array(bundle.mesh.normals), 3),
      );
      geometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(bundle.mesh.uvs), 2),
      );
      geometry.setIndex(
        new THREE.BufferAttribute(new Uint32Array(bundle.mesh.indices), 1),
      );
      for (let index = 0; index < bundle.materialGroups.length; index += 1) {
        const group = bundle.materialGroups[index];
        geometry.addGroup(group.indexStart, group.indexCount, index);
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    }

    const lodManager = new LODManager({
      targetFrameRate: plan.qualityProfile.targetFramesPerSecond,
      autoUpdate: false,
      updateFrequency: 60,
      globalBias: 0,
      maxTransitionTime: 0,
      collectMetrics: true,
      cameraFOV: camera.fov,
      screenHeight: height,
      debug: false,
    });
    const residentRecords = [];
    for (const resident of payload.lodRecords) {
      const mesh = scene.getObjectByName(`ResidentConvergence:${resident.publicDisplayName}`);
      if (!mesh?.isMesh) {
        throw new Error(`resident mesh is missing: ${resident.publicDisplayName}`);
      }
      const tiers = [
        {
          level: 0,
          geometry: mesh.geometry,
          sha256: resident.tiers[0].sha256,
          vertexCount: resident.tiers[0].vertexCount,
          triangleCount: resident.tiers[0].triangleCount,
        },
        ...resident.tiers.slice(1).map((tier) => ({
          level: tier.level,
          geometry: geometryFromBundle(tier.bundle),
          sha256: tier.sha256,
          vertexCount: tier.vertexCount,
          triangleCount: tier.triangleCount,
        })),
      ];
      const config = {
        id: resident.publicDisplayName,
        strategy: plan.lod.strategy,
        transition: plan.lod.transition,
        transitionDuration: plan.lod.transitionDurationSeconds,
        hysteresis: plan.lod.hysteresis,
        bias: plan.lod.bias,
        fadeEnabled: plan.lod.fadeEnabled,
        enabled: true,
        levels: resident.tiers.map((tier) => ({
          level: tier.level,
          distance: tier.distance,
          polygonRatio:
            tier.triangleCount / resident.tiers[0].triangleCount,
          textureScale: 1,
          disabledFeatures: [],
          triangleCount: tier.triangleCount,
        })),
      };
      lodManager.register(
        resident.publicDisplayName,
        config,
        [mesh.position.x, mesh.position.y, mesh.position.z],
      );
      residentRecords.push({
        publicDisplayName: resident.publicDisplayName,
        mesh,
        tiers,
        currentLevel: 0,
      });
    }

    const historyResets = [];
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(plan.qualityProfile.devicePixelRatio);
    composer.setSize(width, height);
    const taaPass = new TAARenderPass(scene, camera, 0x000000, 0);
    taaPass.sampleLevel = plan.temporalAccumulation.sampleLevel;
    taaPass.accumulate = true;
    composer.addPass(taaPass);
    composer.addPass(new OutputPass());

    function resetHistory(event) {
      taaPass.accumulateIndex = -1;
      historyResets.push({
        event,
        frame: historyResets.length,
        timestampExcludedFromDigest: true,
      });
    }

    function applyLod(forcedLevel = null) {
      let changes = 0;
      for (const record of residentRecords) {
        lodManager.setForcedLevel(
          record.publicDisplayName,
          forcedLevel === null ? undefined : forcedLevel,
        );
      }
      lodManager.setCameraPosition([
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ]);
      lodManager.update(1 / plan.qualityProfile.targetFramesPerSecond);
      for (const record of residentRecords) {
        const level = lodManager.getCurrentLevel(record.publicDisplayName);
        if (level !== record.currentLevel) {
          record.mesh.geometry = record.tiers[level].geometry;
          record.currentLevel = level;
          changes += 1;
        }
      }
      if (changes > 0) resetHistory('lod_change');
      return changes;
    }

    function rendererInfo() {
      const materials = new Set();
      scene.traverse((object) => {
        if (!object.material) return;
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material.uuid);
        }
      });
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        materialCount: materials.size,
      };
    }

    function renderForcedLevel(level) {
      applyLod(level);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return {
        level,
        rendererInfo: rendererInfo(),
        residents: residentRecords.map((record) => ({
          publicDisplayName: record.publicDisplayName,
          level: record.currentLevel,
          sha256: record.tiers[record.currentLevel].sha256,
          vertexCount: record.tiers[record.currentLevel].vertexCount,
          triangleCount: record.tiers[record.currentLevel].triangleCount,
        })),
        dataUrl: renderer.domElement.toDataURL('image/png'),
      };
    }

    function meanAbsolutePixelDelta(left, right) {
      let sum = 0;
      for (let index = 0; index < left.length; index += 1) {
        sum += Math.abs(left[index] - right[index]);
      }
      return sum / Math.max(1, left.length);
    }

    function readStabilityPatch() {
      const gl = renderer.getContext();
      const patchWidth = 128;
      const patchHeight = 72;
      const pixels = new Uint8Array(patchWidth * patchHeight * 4);
      gl.readPixels(
        Math.floor((width - patchWidth) / 2),
        Math.floor((height - patchHeight) / 2),
        patchWidth,
        patchHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      return pixels;
    }

    async function settleTaa(capturePixels = false) {
      resetHistory('camera_cut');
      const deltas = [];
      let previous = null;
      for (
        let sample = 0;
        sample < plan.temporalAccumulation.historySamples;
        sample += 1
      ) {
        composer.render();
        if (capturePixels) {
          const pixels = readStabilityPatch();
          if (previous) deltas.push(meanAbsolutePixelDelta(previous, pixels));
          previous = pixels;
        }
        if (sample % 4 === 3) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      return {
        samples: plan.temporalAccumulation.historySamples,
        accumulateIndex: taaPass.accumulateIndex,
        deltas,
        firstWindowMean:
          deltas.slice(0, 4).reduce((sum, value) => sum + value, 0)
            / Math.max(1, Math.min(4, deltas.length)),
        lastWindowMean:
          deltas.slice(-4).reduce((sum, value) => sum + value, 0)
            / Math.max(1, Math.min(4, deltas.length)),
      };
    }

    function percentile(values, fraction) {
      const sorted = [...values].sort((left, right) => left - right);
      const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * fraction) - 1),
      );
      return sorted[index] ?? null;
    }

    function summarizeTimings(values) {
      return {
        samples: values.length,
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
        maximum: values.length > 0 ? Math.max(...values) : null,
      };
    }

    const physicalBefore =
      window.__MV_PHYSICAL_CONVERGENCE_SNAPSHOT__?.().physical?.detail
        ?.combinedDigest;
    applyLod(null);
    resetHistory('profile_change');
    resetHistory('resize');
    await settleTaa(false);

    const rafIntervals = [];
    const submitTimes = [];
    let lastRaf = null;
    const totalFrames =
      plan.qualityProfile.warmupFrames + plan.qualityProfile.measuredFrames;
    for (let frame = 0; frame < totalFrames; frame += 1) {
      const rafTime = await new Promise((resolve) => requestAnimationFrame(resolve));
      const submitStarted = performance.now();
      composer.render();
      const submitElapsed = performance.now() - submitStarted;
      if (frame >= plan.qualityProfile.warmupFrames) {
        if (lastRaf !== null) rafIntervals.push(rafTime - lastRaf);
        submitTimes.push(submitElapsed);
      }
      lastRaf = rafTime;
    }

    const forcedLodWitnesses = [0, 1, 2].map((level) =>
      renderForcedLevel(level));
    applyLod(null);
    const taaStability = await settleTaa(true);
    const taaDataUrl = renderer.domElement.toDataURL('image/png');
    const selectedLevels = residentRecords.map((record) => ({
      publicDisplayName: record.publicDisplayName,
      level: record.currentLevel,
      distance: lodManager.getState(record.publicDisplayName)?.cameraDistance,
    }));
    const droppedFrames = rafIntervals.filter(
      (value) => value > plan.qualityProfile.droppedFrameThresholdMilliseconds,
    ).length;
    const physicalAfter =
      window.__MV_PHYSICAL_CONVERGENCE_SNAPSHOT__?.().physical?.detail
        ?.combinedDigest;
    const detail = {
      profileId: plan.qualityProfile.id,
      runtimeClass: 'LODManager',
      lodManagerSourceHash: payload.lodManagerSourceHash,
      lodTypesSourceHash: payload.lodTypesSourceHash,
      taaPassSourceHash: payload.taaPassSourceHash,
      warmupFrames: plan.qualityProfile.warmupFrames,
      measuredFrames: plan.qualityProfile.measuredFrames,
      settledPhysicalFrameOnly: true,
      continuousPhysicsDuringBenchmark: false,
      raf: summarizeTimings(rafIntervals),
      renderSubmit: summarizeTimings(submitTimes),
      droppedFrames,
      droppedFrameRatio: droppedFrames / Math.max(1, rafIntervals.length),
      forcedLodWitnesses: forcedLodWitnesses.map((witness) => ({
        level: witness.level,
        rendererInfo: witness.rendererInfo,
        residents: witness.residents,
      })),
      selectedLevels,
      taa: {
        implementation: plan.temporalAccumulation.implementation,
        mode: plan.temporalAccumulation.mode,
        sampleLevel: plan.temporalAccumulation.sampleLevel,
        historySamples: plan.temporalAccumulation.historySamples,
        settledSamples: taaStability.samples,
        accumulateIndex: taaStability.accumulateIndex,
        firstWindowMeanPixelDelta: taaStability.firstWindowMean,
        lastWindowMeanPixelDelta: taaStability.lastWindowMean,
        stabilityConverged:
          taaStability.lastWindowMean <= 0.2
          && taaStability.lastWindowMean
            <= Math.max(0.2, taaStability.firstWindowMean * 1.1),
        motionReprojectionClaimed: false,
        productionTaaClaimed: false,
      },
      historyResets,
      physicalReplayDigestBefore: physicalBefore,
      physicalReplayDigestAfter: physicalAfter,
      comparisonDataUrls: [
        ...forcedLodWitnesses.map((witness) => witness.dataUrl),
        taaDataUrl,
      ],
      rendererInfo: rendererInfo(),
    };
    convergence.status = 'pass';
    convergence.ready = true;
    convergence.detail = detail;
    convergence.presentation = {
      ...plan.boundaries,
      presentationProfile: plan.presentationProfile,
      measuredQualityProfile: plan.measuredQualityProfile,
      staticTemporalAccumulationClaimed: true,
      modelCalls: 0,
      networkFetches: 0,
    };

    window.__MV_PERFORMANCE_CONVERGENCE_SNAPSHOT__ = () => ({
      performance: {
        ...convergence,
        detail: {
          ...convergence.detail,
          comparisonDataUrls: undefined,
        },
      },
      physical: window.__MV_PHYSICAL_CONVERGENCE_SNAPSHOT__?.().physical,
      base: window.__MV_PHYSICAL_CONVERGENCE_SNAPSHOT__?.().base,
    });
    window.__MV_PERFORMANCE_BUILD_COMPARISON__ = () => {
      document.body.innerHTML = '';
      document.body.style.cssText =
        'margin:0;width:2400px;height:600px;overflow:hidden;background:#030812;color:#e7f2f6;font-family:Inter,Segoe UI,sans-serif;';
      const title = document.createElement('div');
      title.textContent =
        'STORMGLASS COMMONS  /  SOURCE-AUTHORED FAMILY LOD + STATIC TAA32';
      title.style.cssText =
        'height:64px;box-sizing:border-box;padding:19px 28px;font-size:22px;letter-spacing:3px;background:linear-gradient(90deg,#07131f,#102938,#07131f);border-bottom:1px solid #31515d;';
      document.body.appendChild(title);
      const grid = document.createElement('div');
      grid.style.cssText =
        'display:grid;grid-template-columns:repeat(4,600px);height:536px;';
      const labels = [
        ...detail.forcedLodWitnesses.map((witness) => {
          const residentTriangles = witness.residents.reduce(
            (sum, resident) => sum + resident.triangleCount,
            0,
          );
          return `LOD${witness.level} / ${residentTriangles.toLocaleString()} resident tris`;
        }),
        'AUTO LOD + STATIC TAA32',
      ];
      detail.comparisonDataUrls.forEach((source, index) => {
        const panel = document.createElement('div');
        panel.style.cssText =
          'position:relative;border-right:1px solid #223b47;background:#020711;overflow:hidden;';
        const image = document.createElement('img');
        image.src = source;
        image.style.cssText = 'width:600px;height:338px;object-fit:cover;display:block;';
        const label = document.createElement('div');
        label.textContent = labels[index];
        label.style.cssText =
          'padding:15px 22px 8px;font-size:18px;font-weight:700;letter-spacing:1px;color:#f0dcc0;';
        const note = document.createElement('div');
        if (index < 3) {
          const witness = detail.forcedLodWitnesses[index];
          note.textContent =
            `${witness.rendererInfo.triangles.toLocaleString()} full-scene triangles · ${witness.rendererInfo.calls} shadow-inclusive calls`;
        } else {
          note.textContent =
            `TAA history ${detail.taa.settledSamples} · rAF p95 ${detail.raf.p95.toFixed(2)} ms · submit p95 ${detail.renderSubmit.p95.toFixed(2)} ms`;
        }
        note.style.cssText =
          'padding:0 22px;color:#9fb5be;font-size:14px;line-height:1.5;';
        panel.append(image, label, note);
        grid.appendChild(panel);
      });
      document.body.appendChild(grid);
      return {
        panels: 4,
        labels,
        width: 2400,
        height: 600,
      };
    };
  } catch (error) {
    convergence.status = 'fail';
    convergence.error = error?.stack || error?.message || String(error);
    convergence.ready = true;
  }
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

async function compilePerformanceConvergence(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileURL(corePath).href);
  const sourcePath = path.resolve(root, SOURCE_RELATIVE);
  const policyPath = path.resolve(root, POLICY_RELATIVE);
  const seedPath = path.resolve(root, SEED_RELATIVE);
  const familySourcePath = path.resolve(root, FAMILY_SOURCE_RELATIVE);
  const parsed = await parseComposition(core, sourcePath);
  const validation = validatePerformanceConvergenceContract(
    parsed.contract,
    root,
    holoScriptRoot,
  );
  if (validation.status !== 'pass') {
    throw new Error(`G contract failed:\n${validation.errors.join('\n')}`);
  }
  const policyText = readFileSync(policyPath, 'utf8');
  const seedText = readFileSync(seedPath, 'utf8');
  const stackValidation = validatePolicyAndSeed(core, policyText, seedText);
  if (stackValidation.status !== 'pass') {
    throw new Error(`G format stack failed:\n${stackValidation.errors.join('\n')}`);
  }
  const familySourceText = readFileSync(familySourcePath, 'utf8');
  const lodRecords = await compileFamilyLodBundles(core, familySourceText);
  const plan = buildPerformancePlan(parsed.contract);
  const planCanonical = canonicalJson(plan);
  const lodManagerPath = path.join(
    holoScriptRoot,
    parsed.contract.metadata.holoScriptLodManagerSource,
  );
  const lodTypesPath = path.join(
    holoScriptRoot,
    parsed.contract.metadata.holoScriptLodTypesSource,
  );
  const taaPassPath = path.join(
    holoScriptRoot,
    parsed.contract.metadata.temporalPassSource,
  );
  return {
    core,
    corePath,
    coreHash: sha256File(corePath),
    sourcePath,
    sourceText: parsed.sourceText,
    sourceHash: parsed.sourceHash,
    sceneIrHash: parsed.sceneIrHash,
    contract: parsed.contract,
    validation,
    plan,
    planCanonical,
    planHash: sha256(planCanonical),
    policyPath,
    policyText,
    policyHash: sha256(policyText),
    seedPath,
    seedText,
    seedHash: sha256(seedText),
    stackValidation,
    familySourcePath,
    familySourceText,
    familySourceHash: sha256(familySourceText),
    lodRecords,
    lodManagerPath,
    lodManagerHash: sha256File(lodManagerPath),
    lodTypesPath,
    lodTypesHash: sha256File(lodTypesPath),
    taaPassPath,
    taaPassHash: sha256File(taaPassPath),
  };
}

async function buildSurface(
  outputDir,
  holoScriptRoot,
  compiled,
  inheritedPhysical,
) {
  const physicalBundlePath = path.join(
    path.dirname(inheritedPhysical.receiptPath),
    'physical-convergence-f.bundle.js',
  );
  const physicalBundleText = readFileSync(physicalBundlePath, 'utf8');
  const exposedPhysicalBundleText = patchPhysicalBundle(physicalBundleText);
  const exposedPhysicalBundlePath = path.join(
    outputDir,
    'performance-convergence-g.physical.bundle.js',
  );
  writeFileSync(exposedPhysicalBundlePath, exposedPhysicalBundleText, 'utf8');

  const esbuildPath = path.join(
    holoScriptRoot,
    'node_modules',
    'esbuild',
    'lib',
    'main.js',
  );
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const bundlePath = path.join(outputDir, 'performance-convergence-g.bundle.js');
  const htmlPath = path.join(outputDir, 'performance-convergence-g.html');
  const browserLodRecords = compiled.lodRecords.map((record) => ({
    ...record,
    tiers: record.tiers.map((tier) => ({
      ...tier,
      bundle: tier.level === 0 ? undefined : tier.bundle,
    })),
  }));
  const payload = {
    schema: 'hololand.model-village.performance-convergence-render-payload.v1',
    sourceHash: compiled.sourceHash,
    sceneIrHash: compiled.sceneIrHash,
    planHash: compiled.planHash,
    policyHash: compiled.policyHash,
    seedHash: compiled.seedHash,
    inheritedPhysicalReceiptHash: inheritedPhysical.receipt.receiptHash,
    inheritedPhysicalReplayDigest:
      inheritedPhysical.receipt.physics.replay.combinedDigest,
    lodManagerSourceHash: compiled.lodManagerHash,
    lodTypesSourceHash: compiled.lodTypesHash,
    taaPassSourceHash: compiled.taaPassHash,
    plan: compiled.plan,
    lodRecords: browserLodRecords,
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';",
    "import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';",
    "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';",
    "import { LODManager } from './packages/engine/src/lod/LODManager.ts';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `(${performanceConvergenceBrowserApplication.toString()})(`,
    '  THREE, EffectComposer, TAARenderPass, OutputPass, LODManager, PAYLOAD,',
    ');',
  ].join('\n');
  await esbuild.build({
    stdin: {
      contents: appSource,
      resolveDir: holoScriptRoot,
      sourcefile: 'performance-convergence-g.entry.js',
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
  <title>Receipt Loom Courtyard - Performance / LOD / TAA Convergence G</title>
</head>
<body>
  <script src="./performance-convergence-g.physical.bundle.js"></script>
  <script src="./performance-convergence-g.bundle.js"></script>
</body>
</html>
`,
    'utf8',
  );
  return {
    htmlPath,
    htmlHash: sha256File(htmlPath),
    physicalBundlePath: exposedPhysicalBundlePath,
    physicalBundleHash: sha256File(exposedPhysicalBundlePath),
    bundlePath,
    bundleHash: sha256File(bundlePath),
    appSourceHash: sha256(appSource),
    esbuildPath,
    esbuildHash: sha256File(esbuildPath),
  };
}

async function captureBrowser({
  browserPath,
  holoScriptRoot,
  htmlPath,
  heroPath,
  comparisonPath,
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
      () => window.__MV_PERFORMANCE_CONVERGENCE__?.ready === true,
      undefined,
      { timeout: timeoutMs },
    );
    const state = await page.evaluate(
      () => window.__MV_PERFORMANCE_CONVERGENCE_SNAPSHOT__?.()
        || { performance: window.__MV_PERFORMANCE_CONVERGENCE__ },
    );
    if (state.performance?.status !== 'pass') {
      throw new Error(
        `browser G witness failed: ${
          state.performance?.error || state.performance?.status
        }`,
      );
    }
    await page.screenshot({ path: heroPath, type: 'png' });
    const comparison = await page.evaluate(
      () => window.__MV_PERFORMANCE_BUILD_COMPARISON__?.(),
    );
    await page.setViewportSize({ width: 2400, height: 600 });
    await page.screenshot({
      path: comparisonPath,
      type: 'png',
      fullPage: false,
    });
    return {
      browserVersion: await browser.version(),
      state,
      comparison,
      externalRequests,
      consoleMessages,
      pageErrors,
    };
  } finally {
    await browser.close();
  }
}

async function validateManifest(compiled, root, holoScriptRoot) {
  const manifestPath = path.resolve(root, MANIFEST_RELATIVE);
  if (!existsSync(manifestPath)) {
    return {
      status: 'fail',
      errors: [`G manifest is missing: ${MANIFEST_RELATIVE}`],
    };
  }
  const core = await import(
    pathToFileURL(path.join(holoScriptRoot, 'packages/core/dist/index.js')).href,
  );
  const parsed = await parseComposition(core, manifestPath);
  const errors = [];
  if (
    parsed.contract.metadata.milestone !== 'MV_V1_PERFORMANCE_CONVERGENCE_G'
    || parsed.contract.metadata.status !== 'pass'
    || parsed.contract.metadata.authority !== 'read_only_witness'
  ) {
    errors.push('manifest metadata does not describe the passing read-only G witness');
  }
  for (const binding of [
    parsed.contract.state.source,
    parsed.contract.state.policy,
    parsed.contract.state.seed,
    parsed.contract.state.checker,
    parsed.contract.state.test,
    parsed.contract.state.report,
    parsed.contract.state.hero,
    parsed.contract.state.comparison,
  ]) {
    if (!binding?.path || !binding?.sha256) {
      errors.push('manifest durable binding is incomplete');
    } else {
      exactFileHash(root, binding.path, binding.sha256, errors, binding.path);
    }
  }
  if (
    parsed.contract.state.profile?.id !== 'desktop_cinematic_g1'
    || parsed.contract.state.profile?.warmupFrames !== 600
    || parsed.contract.state.profile?.measuredFrames !== 1800
    || parsed.contract.state.boundaries?.motionReprojectionClaimed !== false
    || parsed.contract.state.boundaries?.productionTaaClaimed !== false
    || parsed.contract.state.boundaries?.separateFromLiveExperiment !== true
  ) {
    errors.push('manifest profile or truth boundary drifted');
  }
  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    sourceHash: parsed.sourceHash,
  };
}

function reportMarkdown(receipt) {
  const detail = receipt.performance;
  const temporal = receipt.temporalAccumulation;
  const renderer = receipt.render.renderer;
  const lodRows = receipt.lod.familyTiers.map((family) =>
    `| ${family.publicDisplayName} | ${family.tiers.map((tier) =>
      `${tier.triangleCount} / ${tier.sha256.slice(0, 10)}`).join(' | ')} |`,
  ).join('\n');
  return `# HoloLand Model Village MV-V1 Performance / LOD / TAA Convergence G

**Date:** 2026-07-27
**Status:** ${receipt.status.toUpperCase()}
**Receipt:** \`${receipt.receiptHash}\`

Performance Convergence G seals the immutable Physical F tableau and promotes
one measured local desktop profile. Six family residents now have three
source-authored HoloScript character tiers selected by HoloScript's engine
\`LODManager\`; the settled frame is accumulated through Three's static
32-sample TAA pass and measured for 600 warm-up plus 1,800 frames.

## Measured local profile

| Metric | p50 | p95 | p99 | Maximum |
|---|---:|---:|---:|---:|
| rAF cadence (ms) | ${detail.raf.p50.toFixed(3)} | ${detail.raf.p95.toFixed(3)} | ${detail.raf.p99.toFixed(3)} | ${detail.raf.maximum.toFixed(3)} |
| CPU render submit (ms) | ${detail.renderSubmit.p50.toFixed(3)} | ${detail.renderSubmit.p95.toFixed(3)} | ${detail.renderSubmit.p99.toFixed(3)} | ${detail.renderSubmit.maximum.toFixed(3)} |

- Warm-up / measured frames: ${detail.warmupFrames} / ${detail.measuredFrames}
- Dropped-frame ratio above ${receipt.profile.droppedFrameThresholdMilliseconds} ms: ${(detail.droppedFrameRatio * 100).toFixed(3)}%
- Browser: ${receipt.render.browser}
- GPU: ${renderer.unmaskedRenderer}
- API/backend: WebGL2 / D3D11

## Source-authored family LOD

| Resident | LOD0 tris / hash | LOD1 tris / hash | LOD2 tris / hash |
|---|---:|---:|---:|
${lodRows}

Every tier compiled twice byte-identically without fallback from the existing
family mantle catalog. LOD0 remains the physically settled F geometry; LOD1 and
LOD2 are static presentation tiers and do not claim tier-specific cloth
simulation.

## Static temporal accumulation

- Implementation: \`${temporal.implementation}\`
- History samples: ${temporal.settledSamples}
- Center-patch mean pixel delta, first window: ${temporal.firstWindowMeanPixelDelta.toFixed(6)}
- Center-patch mean pixel delta, final window: ${temporal.lastWindowMeanPixelDelta.toFixed(6)}
- History resets receipted: ${temporal.historyResets.length}

This is static jittered accumulation for a settled frame. It has no motion
vectors, reprojection, disocclusion rejection, reactive mask, or neighborhood
clamp and is not claimed as production motion-stable TAA.

## Physical preservation

Physical F replay digest before and after profile/LOD/TAA work:
\`${detail.physicalReplayDigestBefore}\`.

The benchmark does not run the CPU cloth solver concurrently. Physical F keeps
its separate 120 Hz solver receipt and local CPU timing witness.

## Visual receipts

- Hero: \`${receipt.render.hero.path}\`
- LOD/TAA comparison: \`${receipt.render.comparison.path}\`

## Truth boundary

The witness is a read-only public story projection, separate from live blinded
research. It performs no model calls, network fetches, canonical writes,
resident-observation writes, or wallet/seat identity mutation. It does not
claim cross-device, WebXR/headset, dynamic resolution, native WebGPU TAA,
concurrent physics/render performance, provider endorsement, model behavior,
photorealism, production TAA, or full-world convergence.

## Validation

${Object.entries(receipt.checks).map(([name, passed]) =>
    `- ${passed ? 'PASS' : 'FAIL'}: \`${name}\``).join('\n')}
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = argv[++index];
    else if (arg === '--output') options.outputDir = argv[++index];
    else if (arg === '--hero-output') options.heroOutput = argv[++index];
    else if (arg === '--comparison-output') options.comparisonOutput = argv[++index];
    else if (arg === '--report-output') options.reportOutput = argv[++index];
    else if (arg === '--holoscript-root') options.holoScriptRoot = argv[++index];
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--no-clean') options.clean = false;
    else if (arg === '--help') {
      console.log(`Usage: node scripts/check-hololand-model-village-performance-convergence.mjs [options]
  --root <path>                HoloLand repository root
  --output <path>              Ephemeral witness output directory
  --hero-output <path>         Optional durable 1600x900 hero PNG
  --comparison-output <path>   Optional durable 2400x600 comparison PNG
  --report-output <path>       Optional durable Markdown report
  --holoscript-root <path>     Built HoloScript checkout
  --browser <path>             Chrome or Edge executable
  --timeout-ms <number>        Browser timeout (default 180000)
  --skip-manifest              Bootstrap before immutable manifest exists
  --no-clean                   Preserve prior output directory contents`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function runPerformanceConvergenceCheck(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const browserPath = resolveBrowser(options.browser);
  if (options.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  const compiled = await compilePerformanceConvergence(root, holoScriptRoot);
  const inheritedOutputDir = path.join(outputDir, 'inherited-physical-f');
  const inheritedPhysical = await runPhysicalConvergenceCheck({
    root,
    outputDir: inheritedOutputDir,
    holoScriptRoot,
    browser: browserPath,
    timeoutMs: options.timeoutMs || 180000,
  });
  if (inheritedPhysical.receipt.status !== 'pass') {
    throw new Error('immutable Physical Convergence F did not pass');
  }
  const surface = await buildSurface(
    outputDir,
    holoScriptRoot,
    compiled,
    inheritedPhysical,
  );
  const heroPath = path.resolve(
    options.heroOutput
      || path.join(outputDir, 'performance-convergence-g-1600x900.png'),
  );
  const comparisonPath = path.resolve(
    options.comparisonOutput
      || path.join(outputDir, 'performance-convergence-g-comparison-2400x600.png'),
  );
  mkdirSync(path.dirname(heroPath), { recursive: true });
  mkdirSync(path.dirname(comparisonPath), { recursive: true });
  const browser = await captureBrowser({
    browserPath,
    holoScriptRoot,
    htmlPath: surface.htmlPath,
    heroPath,
    comparisonPath,
    timeoutMs: options.timeoutMs || 180000,
  });
  const heroBuffer = readFileSync(heroPath);
  const comparisonBuffer = readFileSync(comparisonPath);
  const heroDimensions = pngDimensions(heroBuffer);
  const comparisonDimensions = pngDimensions(comparisonBuffer);
  const state = browser.state;
  const performanceState = state.performance;
  const base = state.base;
  const detail = performanceState.detail;
  const budget = compiled.contract.state.qualityProfile;
  const lod0 = detail.forcedLodWitnesses.find((witness) => witness.level === 0);
  const lod2 = detail.forcedLodWitnesses.find((witness) => witness.level === 2);
  const manifest = options.skipManifest
    ? { status: 'skipped', errors: [], reason: 'bootstrap_skip_requested' }
    : await validateManifest(compiled, root, holoScriptRoot);
  const checks = {
    performanceContractPass: compiled.validation.status === 'pass',
    hsplusPolicyPass:
      compiled.stackValidation.status === 'pass'
      && compiled.stackValidation.policyResult.success === true,
    hsSeedPass:
      compiled.stackValidation.status === 'pass'
      && compiled.stackValidation.seedResult.success === true,
    manifestPass: manifest.status === 'pass' || manifest.status === 'skipped',
    inheritedPhysicalPass: inheritedPhysical.receipt.status === 'pass',
    exactInheritedPhysicalArtifacts:
      [
        PHYSICAL_SOURCE_RELATIVE,
        PHYSICAL_POLICY_RELATIVE,
        PHYSICAL_SEED_RELATIVE,
        PHYSICAL_CHECKER_RELATIVE,
        PHYSICAL_TEST_RELATIVE,
        PHYSICAL_REPORT_RELATIVE,
        PHYSICAL_HERO_RELATIVE,
        PHYSICAL_CONTACT_SHEET_RELATIVE,
        PHYSICAL_MANIFEST_RELATIVE,
      ].every((relativePath) => existsSync(path.resolve(root, relativePath))),
    physicalReplayDigestPreserved:
      detail.physicalReplayDigestBefore
        === inheritedPhysical.receipt.physics.replay.combinedDigest
      && detail.physicalReplayDigestAfter
        === inheritedPhysical.receipt.physics.replay.combinedDigest,
    exactFamilyTierCount:
      compiled.lodRecords.length === 6
      && compiled.lodRecords.every((record) => record.tiers.length === 3),
    repeatedFamilyCompileByteIdentity:
      compiled.lodRecords.every(
        (record) =>
          record.repeatedCompileByteIdentical === true
          && record.fallbackUsed === false,
      ),
    authoredFamilyTopologyReduces:
      compiled.lodRecords.every(
        (record) =>
          record.tiers[0].triangleCount > record.tiers[1].triangleCount
          && record.tiers[1].triangleCount > record.tiers[2].triangleCount,
      ),
    nativeLodManagerReachedBrowser:
      detail.runtimeClass === 'LODManager'
      && detail.lodManagerSourceHash === compiled.lodManagerHash
      && detail.lodTypesSourceHash === compiled.lodTypesHash,
    exactMeasuredFrameProtocol:
      detail.warmupFrames === budget.warmupFrames
      && detail.measuredFrames === budget.measuredFrames
      && detail.raf.samples >= budget.measuredFrames - 1
      && detail.renderSubmit.samples === budget.measuredFrames,
    rafP95Budget: detail.raf.p95 <= budget.maximumRafP95Milliseconds,
    rafP99Budget: detail.raf.p99 <= budget.maximumRafP99Milliseconds,
    renderSubmitP95Budget:
      detail.renderSubmit.p95 <= budget.maximumRenderSubmitP95Milliseconds,
    droppedFrameBudget:
      detail.droppedFrameRatio <= budget.maximumDroppedFrameRatio,
    lod0DrawCallRegression:
      lod0.rendererInfo.calls <= budget.maximumShadowInclusiveDrawCalls,
    lod0TriangleRegression:
      lod0.rendererInfo.triangles <= budget.maximumLod0Triangles,
    lod2TriangleReduction:
      (
        lod0.residents.reduce(
          (sum, resident) => sum + resident.triangleCount,
          0,
        )
        - lod2.residents.reduce(
          (sum, resident) => sum + resident.triangleCount,
          0,
        )
      )
        / lod0.residents.reduce(
          (sum, resident) => sum + resident.triangleCount,
          0,
        )
        >= budget.minimumResidentLod2TriangleReductionRatio,
    exactForcedLodSelection:
      detail.forcedLodWitnesses.every(
        (witness) =>
          witness.residents.length === 6
          && witness.residents.every((resident) => resident.level === witness.level),
      ),
    taaSourceReachedBrowser: detail.taaPassSourceHash === compiled.taaPassHash,
    staticTaaHistorySettled:
      detail.taa.settledSamples
        === compiled.contract.state.temporalAccumulation.historySamples
      && detail.taa.accumulateIndex
        >= compiled.contract.state.temporalAccumulation.historySamples,
    temporalStabilityConverged: detail.taa.stabilityConverged === true,
    historyResetCoverage:
      HISTORY_RESET_EVENTS.every((event) =>
        detail.historyResets.some((reset) => reset.event === event)),
    boundedTemporalClaim:
      detail.taa.motionReprojectionClaimed === false
      && detail.taa.productionTaaClaimed === false,
    settledPerformanceBoundary:
      detail.settledPhysicalFrameOnly === true
      && detail.continuousPhysicsDuringBenchmark === false,
    webgl2: base.gl?.webgl2 === true,
    hardwareRenderer: !rendererIsSoftware(base.gl),
    d3d11Backend: /direct3d11|d3d11/i.test(base.gl?.unmaskedRenderer || ''),
    noExternalRequests: browser.externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    lockedHeroResolution:
      heroDimensions.width === 1600 && heroDimensions.height === 900,
    lockedComparisonResolution:
      comparisonDimensions.width === 2400
      && comparisonDimensions.height === 600,
    comparisonHasFourPanels: browser.comparison?.panels === 4,
    liveResearchSeparation:
      performanceState.presentation?.separateFromLiveExperiment === true
      && performanceState.presentation?.researchLiveIdentityNeutralPreserved
        === true,
    readOnlyBoundary:
      performanceState.presentation?.canonicalWritesAllowed === false
      && performanceState.presentation?.residentObservationWritesAllowed === false
      && performanceState.presentation?.modelCalls === 0
      && performanceState.presentation?.networkFetches === 0,
    boundedPerformanceBoundary:
      performanceState.presentation
        ?.concurrentPhysicsAndRenderPerformanceClaimed === false
      && performanceState.presentation?.dynamicResolutionClaimed === false
      && performanceState.presentation?.crossDevicePerformanceClaimed === false
      && performanceState.presentation?.headsetPerformanceClaimed === false
      && performanceState.presentation?.nativeWebGpuTaaClaimed === false
      && performanceState.presentation?.productionTaaClaimed === false
      && performanceState.presentation?.photorealismClaimed === false
      && performanceState.presentation?.fullWorldConvergenceClaimed === false,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const receiptCore = {
    schema: 'hololand.model-village.performance-convergence-witness.v1',
    status: failures.length === 0 ? 'pass' : 'fail',
    claim: {
      verified:
        'One HoloScript-owned local desktop quality profile compiled all six family residents into source-authored LOD0/1/2 tiers, selected them through HoloScript engine LODManager, accumulated the settled frame through a 32-sample static Three TAA pass, and measured 600 warm-up plus 1,800 browser frames on the local D3D11 GPU path.',
      bounded:
        'Performance Convergence G benchmarks the settled Physical F presentation. It does not measure concurrent cloth simulation and rendering, motion-reprojected production TAA, dynamic resolution, WebXR/headset, cross-device, native WebGPU TAA, model behavior, provider endorsement, photorealism, or full-world convergence.',
    },
    sources: {
      performanceWorld: {
        path: SOURCE_RELATIVE,
        sha256: compiled.sourceHash,
        sceneIrSha256: compiled.sceneIrHash,
        planSha256: compiled.planHash,
      },
      behaviorPolicy: {
        path: POLICY_RELATIVE,
        sha256: compiled.policyHash,
        parser: 'HoloScriptPlusParser',
        nativeActionExecutionClaimed: false,
      },
      deterministicSeed: {
        path: SEED_RELATIVE,
        sha256: compiled.seedHash,
        parser: 'HoloScriptCodeParser',
      },
      inheritedPhysicalF: {
        sourcePath: PHYSICAL_SOURCE_RELATIVE,
        receiptHash: inheritedPhysical.receipt.receiptHash,
        replayCombinedSha256:
          inheritedPhysical.receipt.physics.replay.combinedDigest,
        immutable: true,
      },
      familyMantleCatalog: {
        path: FAMILY_SOURCE_RELATIVE,
        sha256: compiled.familySourceHash,
      },
      holoScriptLodManager: {
        path: compiled.lodManagerPath,
        sha256: compiled.lodManagerHash,
      },
      holoScriptLodTypes: {
        path: compiled.lodTypesPath,
        sha256: compiled.lodTypesHash,
      },
      temporalPass: {
        path: compiled.taaPassPath,
        sha256: compiled.taaPassHash,
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
    formatStack: {
      holo: {
        role: 'quality profile, LOD, temporal accumulation, camera, budget, and truth boundary',
        parser: 'HoloCompositionParser',
        parsed: true,
      },
      hsplus: {
        role: 'profile admission, LOD binding, history reset, benchmark acceptance, and firewall policy',
        parser: 'HoloScriptPlusParser',
        parsed: true,
        nativeActionExecutionClaimed: false,
      },
      hs: {
        role: 'flat profile, resident, LOD probe, and history-reset inputs',
        parser: 'HoloScriptCodeParser',
        parsed: true,
      },
      interchangeableFormatsClaimed: false,
    },
    profile: compiled.contract.state.qualityProfile,
    performance: {
      profileId: detail.profileId,
      warmupFrames: detail.warmupFrames,
      measuredFrames: detail.measuredFrames,
      settledPhysicalFrameOnly: detail.settledPhysicalFrameOnly,
      continuousPhysicsDuringBenchmark:
        detail.continuousPhysicsDuringBenchmark,
      raf: detail.raf,
      renderSubmit: detail.renderSubmit,
      droppedFrames: detail.droppedFrames,
      droppedFrameRatio: detail.droppedFrameRatio,
      physicalReplayDigestBefore: detail.physicalReplayDigestBefore,
      physicalReplayDigestAfter: detail.physicalReplayDigestAfter,
      timingExcludedFromPhysicalDigest: true,
    },
    lod: {
      runtimeClass: detail.runtimeClass,
      strategy: compiled.contract.state.lod.strategy,
      hysteresis: compiled.contract.state.lod.hysteresis,
      familyTiers: compiled.lodRecords.map((record) => ({
        publicDisplayName: record.publicDisplayName,
        familyId: record.familyId,
        repeatedCompileByteIdentical:
          record.repeatedCompileByteIdentical,
        fallbackUsed: record.fallbackUsed,
        tiers: record.tiers.map((tier) => ({
          level: tier.level,
          sha256: tier.sha256,
          bytes: tier.bytes,
          vertexCount: tier.vertexCount,
          triangleCount: tier.triangleCount,
          garmentSegments: tier.garmentSegments,
          distance: tier.distance,
          mantleStyle: tier.mantleStyle,
        })),
      })),
      forcedWitnesses: detail.forcedLodWitnesses,
      selectedLevels: detail.selectedLevels,
      staticSettledPresentationOnly: true,
      lowerTierClothSimulationClaimed: false,
    },
    temporalAccumulation: {
      ...detail.taa,
      historyResets: detail.historyResets,
      resetEventsRequired: HISTORY_RESET_EVENTS,
    },
    bridge: {
      route:
        'HoloScript G .holo/.hsplus/.hs -> immutable Physical F browser surface -> HoloScript engine LODManager -> source-authored family tiers -> Three static TAA accumulation -> local Chrome/WebGL2 D3D11 measurement',
      appSourceSha256: surface.appSourceHash,
      inheritedPhysicalBundleSha256: surface.physicalBundleHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      esbuildSha256: surface.esbuildHash,
      inheritedPhysicalSourcesImmutable: true,
      externalAssets: [],
    },
    render: {
      hero: {
        path: path.relative(root, heroPath).replaceAll('\\', '/'),
        sha256: sha256(heroBuffer),
        bytes: heroBuffer.length,
        dimensions: heroDimensions,
      },
      comparison: {
        path: path.relative(root, comparisonPath).replaceAll('\\', '/'),
        sha256: sha256(comparisonBuffer),
        bytes: comparisonBuffer.length,
        dimensions: comparisonDimensions,
        panels: browser.comparison?.panels,
      },
      browser: browser.browserVersion,
      renderer: base.gl,
      rendererInfo: detail.rendererInfo,
      externalRequests: browser.externalRequests,
      pageErrors: browser.pageErrors,
      consoleMessages: browser.consoleMessages,
    },
    presentation: performanceState.presentation,
    manifest,
    checks,
    failures,
  };
  const receiptHash = sha256(canonicalJson(receiptCore));
  const receipt = { ...receiptCore, receiptHash };
  const receiptPath = path.join(
    outputDir,
    'performance-convergence-g-witness.json',
  );
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (options.reportOutput) {
    mkdirSync(path.dirname(options.reportOutput), { recursive: true });
    writeFileSync(options.reportOutput, reportMarkdown(receipt), 'utf8');
  }
  return {
    receipt,
    receiptPath,
    heroPath,
    comparisonPath,
    reportPath: options.reportOutput || null,
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runPerformanceConvergenceCheck(parseArgs())
    .then(({ receipt, receiptPath, heroPath, comparisonPath, reportPath }) => {
      console.log(JSON.stringify({
        status: receipt.status,
        receiptHash: receipt.receiptHash,
        receiptPath,
        heroPath,
        comparisonPath,
        reportPath,
        gpu: receipt.render.renderer?.unmaskedRenderer,
        profile: receipt.performance.profileId,
        warmupFrames: receipt.performance.warmupFrames,
        measuredFrames: receipt.performance.measuredFrames,
        rafP95Milliseconds: receipt.performance.raf.p95,
        rafP99Milliseconds: receipt.performance.raf.p99,
        renderSubmitP95Milliseconds: receipt.performance.renderSubmit.p95,
        droppedFrameRatio: receipt.performance.droppedFrameRatio,
        lod0Triangles:
          receipt.lod.forcedWitnesses.find((witness) => witness.level === 0)
            ?.rendererInfo.triangles,
        lod2Triangles:
          receipt.lod.forcedWitnesses.find((witness) => witness.level === 2)
            ?.rendererInfo.triangles,
        taaHistorySamples: receipt.temporalAccumulation.settledSamples,
        temporalStabilityConverged:
          receipt.temporalAccumulation.stabilityConverged,
        failures: receipt.failures,
      }, null, 2));
      if (receipt.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
