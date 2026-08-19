#!/usr/bin/env node
/* global document, performance, process, requestAnimationFrame, window */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3b-native-channels.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3b-native-channels-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3b-native-channels-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3b-native-channels-manifest.holo';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h3b.test.mjs';
const REPORT_REL =
  'docs/reports/HOLOLAND_MODEL_VILLAGE_CHARACTER_APPEARANCE_H3B_2026-07-27.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3b-native-personas-2026-07-27.png';
const EXPRESSION_REL =
  'docs/assets/model-village/model-village-character-appearance-h3b-native-expressions-2026-07-27.png';
const LOD_REL =
  'docs/assets/model-village/model-village-character-appearance-h3b-native-lods-2026-07-27.png';
const TAA_REL =
  'docs/assets/model-village/model-village-character-appearance-h3b-taa-convergence-2026-07-27.png';
const DEFAULT_OUTPUT = path.join(
  ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'character-appearance-h3b',
);
const PERSONAS = Object.freeze([
  {
    objectId: 'HearthKeeper',
    personaId: 'hearth_keeper',
    displayLabel: 'Hearth Keeper',
    civicRole: 'keeper',
    hairStyle: 'cropped_coils',
  },
  {
    objectId: 'PathTender',
    personaId: 'path_tender',
    displayLabel: 'Path Tender',
    civicRole: 'wayfinder',
    hairStyle: 'swept_ridge',
  },
  {
    objectId: 'RecordSteward',
    personaId: 'record_steward',
    displayLabel: 'Record Steward',
    civicRole: 'archivist',
    hairStyle: 'long',
  },
]);
const EXPRESSIONS = Object.freeze([
  'neutral',
  'soft_smile',
  'blink',
  'viseme_aa',
  'viseme_ee',
  'viseme_oh',
]);
const RESET_EVENTS = Object.freeze([
  'camera_cut',
  'lod_change',
  'expression_change',
  'persona_change',
  'profile_change',
  'resize',
]);
const SOURCE_HASH_PAIRS = Object.freeze([
  ['appearancePlan', 'appearancePlanSha256', 'hololand'],
  ['inheritedH3ASource', 'inheritedH3ASourceSha256', 'hololand'],
  ['inheritedH3APolicy', 'inheritedH3APolicySha256', 'hololand'],
  ['inheritedH3ASeed', 'inheritedH3ASeedSha256', 'hololand'],
  ['inheritedH3AManifest', 'inheritedH3AManifestSha256', 'hololand'],
  ['inheritedH3AReport', 'inheritedH3AReportSha256', 'hololand'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  [
    'upstreamCompositionBridgePath',
    'upstreamCompositionBridgeSha256',
    'holoscript',
  ],
  ['upstreamHairBuilderPath', 'upstreamHairBuilderSha256', 'holoscript'],
  ['upstreamMorphBuilderPath', 'upstreamMorphBuilderSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
  ['upstreamLodManagerPath', 'upstreamLodManagerSha256', 'holoscript'],
  ['temporalPassPath', 'temporalPassSha256', 'holoscript'],
]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value]),
  );
}

function stateProperties(node) {
  return properties(node);
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[
    Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(sorted.length * quantile) - 1),
    )
  ];
}

function summarize(values) {
  return {
    samples: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    maximum: values.length ? Math.max(...values) : 0,
  };
}

function pngDimensions(buffer) {
  if (
    buffer.length < 24 ||
    buffer.subarray(1, 4).toString('ascii') !== 'PNG'
  ) {
    throw new Error('Expected PNG buffer');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function loadCore(holoScriptRoot) {
  return import(
    pathToFileURL(path.join(holoScriptRoot, 'packages/core/dist/index.js')).href
  );
}

export async function parseH3BStack(
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3B .holo', source],
    ['H3B .hsplus', policy],
    ['H3B .hs', seed],
  ]) {
    if (!parsed.success || parsed.errors.length) {
      throw new Error(`${label} parse failed: ${JSON.stringify(parsed.errors)}`);
    }
  }
  return {
    core,
    source,
    policy,
    seed,
    sourceText,
    policyText,
    seedText,
    contract: {
      metadata: source.ast.metadata,
      state: stateProperties(source.ast.state),
      environment: stateProperties(source.ast.environment),
      objects: (source.ast.objects || []).map((object) => ({
        objectId: object.name,
        ...properties(object),
      })),
    },
  };
}

export function buildH3BPlan(contract) {
  const personas = contract.objects
    .filter((object) => object.type === 'native_neutral_civic_persona')
    .map((persona) => ({
      objectId: persona.objectId,
      personaId: persona.personaId,
      civicRole: persona.civicRole,
      displayLabel: persona.displayLabel,
      dermalAtlasCell: persona.dermalAtlasCell,
      irisColor: persona.irisColor,
      hairColor: persona.hairColor,
      nativeHairStyleId: persona.nativeHairStyleId,
      h3aShadowStyleId: persona.h3aShadowStyleId,
      nativeStyleParityClaimed: persona.nativeStyleParityClaimed,
      nativeStyleSubstitutionReason: persona.nativeStyleSubstitutionReason,
    }));
  const expressions = contract.objects
    .filter((object) => object.type === 'native_morph_expression_probe')
    .map((expression) => ({
      expressionId: expression.expressionId,
      weights: expression.weights,
    }));
  return {
    milestone: contract.metadata.milestone,
    presentationProfile: contract.state.presentationProfile,
    nativeAdmission: contract.state.nativeAdmission,
    atlas: contract.state.atlas,
    studioPresentation: contract.state.studioPresentation,
    lod: contract.state.lod,
    temporalAccumulation: contract.state.temporalAccumulation,
    benchmark: contract.state.benchmark,
    goldenTargets: contract.state.goldenTargets,
    personas,
    expressions,
  };
}

// Delegates to the shared validator. The private gitHasCommit() this replaced asserted
// "ancestor of HEAD", which accepted a commit that existed only on one laptop and
// rejected a reproducible one whenever a peer left the shared checkout on a branch.
function upstreamPinFailures(holoScriptRoot, metadata) {
  return validateUpstreamCommitPin(
    holoScriptRoot,
    metadata.upstreamHoloScriptCommit,
    SOURCE_HASH_PAIRS
      .filter(([, , owner]) => owner === 'holoscript')
      .map(([pathKey, hashKey]) => ({
        pathKey,
        relative: metadata[pathKey],
        sha256: metadata[hashKey],
      })),
  ).errors;
}

export function validateH3BContract(
  contract,
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state } = contract;
  expect(
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3B_NATIVE_CHANNEL_ADMISSION',
    'milestone drifted',
  );
  expect(
    metadata.artStyle === 'hearthlight_biorealism',
    'art style drifted',
  );
  for (const [key, expected] of [
    ['nativeCharacterCompilerClaimed', true],
    ['nativeHairStyleChannelClaimed', true],
    ['nativeHairLodChannelClaimed', true],
    ['nativeMorphTargetChannelClaimed', true],
    ['nativeSkinSssMaterialSerialized', true],
    ['nativeSubsurfaceScatteringClaimedByBrowser', false],
    ['nativeChannelH3BAdmitted', true],
    ['fullH3Claimed', false],
    ['productionFaceCompleteClaimed', false],
    ['productionHairCompleteClaimed', false],
    ['normalsRecomputedAfterMorphClaimed', false],
    ['motionReprojectionClaimed', false],
    ['productionTaaClaimed', false],
    ['photorealismClaimed', false],
    ['fullWorldConvergenceClaimed', false],
    ['familyIdentityVisible', false],
    ['adapterFamilyBinding', 'absent'],
    ['researchSeatBinding', 'absent'],
    ['liveResearchJoinAllowed', false],
    ['canonicalWritesAllowed', false],
    ['residentObservationWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['biometricPersistenceAllowed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  expect(
    state.nativeAdmission?.compilerTarget === 'character-webgpu' &&
      state.nativeAdmission?.fallbackAllowed === false &&
      state.nativeAdmission?.authoredHairStyleGeometryOperative === true &&
      state.nativeAdmission?.authoredHairLodTopologyOperative === true &&
      state.nativeAdmission?.authoredMorphFacsSubsetOperative === true &&
      state.nativeAdmission?.authoredLocomotionPoseMaterialized === true &&
      state.nativeAdmission?.morphTopology === 'procedural-head-v1' &&
      state.nativeAdmission?.normalsRecomputedAfterMorph === false &&
      state.nativeAdmission?.productionFacialTopologyOperative === false &&
      state.nativeAdmission?.fullH3Admitted === false,
    'native admission truth boundary drifted',
  );
  expect(
    state.lod?.runtimeClass === 'LODManager' &&
      state.lod?.runtimePackage === '@holoscript/engine' &&
      state.lod?.sourceAuthoredHairTopologyRequired === true &&
      state.lod?.monotonicHairTopologyReductionRequired === true &&
      state.lod?.secondLodAuthorityAllowed === false &&
      canonicalJson(state.lod?.levels) === '[0,1,2]' &&
      canonicalJson(state.lod?.distancesMeters) === '[0,8,20]',
    'native hair LOD contract drifted',
  );
  expect(
    state.studioPresentation?.role ===
      'source_declared_compatibility_visualization' &&
      state.studioPresentation?.wardrobeMode ===
        'source_declared_bridge_proxy' &&
      state.studioPresentation?.wardrobeGeometry ===
        'tailored_civic_tabard' &&
      state.studioPresentation?.wardrobeTextureAlgorithm ===
        'deterministic_woven_canvas_v1' &&
      state.studioPresentation?.wardrobeNativeChannelClaimed === false,
    'studio presentation boundary drifted',
  );
  const temporal = state.temporalAccumulation || {};
  expect(
    temporal.implementation === 'three_taa_render_pass' &&
      temporal.mode === 'static_jittered_accumulation' &&
      temporal.historySamples === 32 &&
      temporal.accumulationEnabled === true &&
      canonicalJson(temporal.resetEvents) === canonicalJson(RESET_EVENTS) &&
      temporal.motionReprojection === false &&
      temporal.velocityBuffer === false &&
      temporal.disocclusionRejection === false &&
      temporal.productionTaaClaimed === false,
    'bounded temporal accumulation contract drifted',
  );
  const personas = contract.objects.filter(
    (object) => object.type === 'native_neutral_civic_persona',
  );
  expect(personas.length === 3, `expected three personas, found ${personas.length}`);
  expect(
    canonicalJson(personas.map((persona) => persona.personaId)) ===
      canonicalJson(PERSONAS.map((persona) => persona.personaId)),
    'persona ids or order drifted',
  );
  expect(
    canonicalJson(personas.map((persona) => persona.nativeHairStyleId)) ===
      canonicalJson(PERSONAS.map((persona) => persona.hairStyle)),
    'native hair styles drifted',
  );
  expect(
    personas.every(
      (persona) =>
        typeof persona.hairColor === 'string' &&
        /^#[0-9a-f]{6}$/i.test(persona.hairColor),
    ),
    'source-authored hair colors are missing',
  );
  expect(
    personas[2]?.h3aShadowStyleId === 'braided_crown' &&
      personas[2]?.nativeHairStyleId === 'long' &&
      personas[2]?.nativeStyleParityClaimed === false &&
      personas[2]?.nativeStyleSubstitutionReason ===
        'braided_crown_not_yet_in_native_catalog',
    'record steward substitution must remain explicit',
  );
  const expressions = contract.objects.filter(
    (object) => object.type === 'native_morph_expression_probe',
  );
  expect(
    canonicalJson(expressions.map((expression) => expression.expressionId)) ===
      canonicalJson(EXPRESSIONS),
    'native expression probes drifted',
  );
  for (const [pathKey, hashKey, owner] of SOURCE_HASH_PAIRS) {
    const base = owner === 'hololand' ? root : holoScriptRoot;
    const relative = metadata[pathKey];
    const expectedHash = metadata[hashKey];
    const absolute = path.resolve(base, relative || '');
    expect(Boolean(relative && expectedHash), `${pathKey} binding missing`);
    expect(existsSync(absolute), `${pathKey} file missing`);
    if (existsSync(absolute)) {
      expect(sha256File(absolute) === expectedHash, `${pathKey} hash drifted`);
    }
  }
  for (const failure of upstreamPinFailures(holoScriptRoot, metadata)) expect(false, failure);
  const bridgePath = path.resolve(
    holoScriptRoot,
    metadata.upstreamCompositionBridgePath || '',
  );
  if (existsSync(bridgePath)) {
    const bridge = readFileSync(bridgePath, 'utf8');
    expect(
      bridge.includes('hair_guides') &&
        bridge.includes('hair_cards_per_guide') &&
        bridge.includes('hair_segments'),
      'upstream authored hair LOD channel is absent',
    );
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

function cloneAst(ast) {
  return JSON.parse(JSON.stringify(ast));
}

function withMorphWeights(ast, objectId, weights) {
  const copy = cloneAst(ast);
  const object = copy.objects.find((candidate) => candidate.name === objectId);
  const morph = object?.traits?.find((trait) => trait.name === 'morph');
  if (!object || !morph) {
    throw new Error(`native morph trait missing for ${objectId}`);
  }
  morph.config = { ...(morph.config || {}), targets: { ...weights } };
  return copy;
}

async function exportBundle(core, ast, objectId, lodLevel) {
  return new core.ExportManager({
    useCircuitBreaker: false,
    useFallback: false,
    useMemoryMonitoring: false,
  }).export('character-webgpu', ast, {
    compilerOptions: {
      objectId,
      entityId: `model-village-h3b-${objectId.toLowerCase()}`,
      lodLevel,
    },
  });
}

function hairGroup(bundle) {
  return bundle.materialGroups.find(
    (group) => group.material.shadingModel === 'marschner-hair',
  );
}

/**
 * Compile the native persona and expression bundles shared by the H3B..H3I gates.
 *
 * `options.morphSchemaVersion` is the native facial morph receipt schema the CALLING gate has
 * admitted in its own source contract. It defaults to v1, so every gate that has not admitted a
 * newer morph semantics keeps failing closed exactly as before — admitting a later schema is a
 * per-gate authored decision, never a widening of the set this shared helper accepts.
 */
export async function compileH3BNativeBundles(core, sourceAst, plan, options = {}) {
  const expectedMorphSchemaVersion =
    options.morphSchemaVersion ?? 'holoscript.native-facial-morph.v1';
  const records = [];
  for (const persona of plan.personas) {
    const tiers = [];
    for (const level of [0, 1, 2]) {
      const first = await exportBundle(core, sourceAst, persona.objectId, level);
      const replay = await exportBundle(core, sourceAst, persona.objectId, level);
      if (!first.success || !replay.success || first.usedFallback || replay.usedFallback) {
        throw new Error(`${persona.objectId} LOD${level} native compile failed`);
      }
      if (first.output !== replay.output) {
        throw new Error(`${persona.objectId} LOD${level} compile was not byte-identical`);
      }
      const bundle = JSON.parse(first.output);
      const hair = hairGroup(bundle);
      if (
        bundle.format !== 'character-webgpu/drawspec' ||
        bundle.lod?.level !== level ||
        !hair ||
        bundle.report?.stubbed?.length !== 0 ||
        !bundle.report?.mapped?.includes(
          `@hair(style=${persona.nativeHairStyleId})`,
        ) ||
        !bundle.report?.mapped?.some((entry) =>
          entry.startsWith('@lod(hair_guides='),
        )
      ) {
        throw new Error(`${persona.objectId} LOD${level} native contract drifted`);
      }
      tiers.push({
        level,
        sha256: sha256(first.output),
        bytes: Buffer.byteLength(first.output),
        vertexCount: bundle.vertexCount,
        triangleCount: bundle.mesh.indices.length / 3,
        hairTriangleCount: hair.indexCount / 3,
        lod: bundle.lod,
        report: bundle.report,
        morph: bundle.morph,
        bundle,
      });
    }
    if (
      !(tiers[0].vertexCount > tiers[1].vertexCount &&
        tiers[1].vertexCount > tiers[2].vertexCount &&
        tiers[0].hairTriangleCount > tiers[1].hairTriangleCount &&
        tiers[1].hairTriangleCount > tiers[2].hairTriangleCount)
    ) {
      throw new Error(`${persona.objectId} hair topology is not monotonic`);
    }
    records.push({ ...persona, tiers });
  }

  const expressionRecord = plan.personas[1];
  const expressionBundles = [];
  for (const expression of plan.expressions) {
    const ast = withMorphWeights(
      sourceAst,
      expressionRecord.objectId,
      expression.weights,
    );
    const first = await exportBundle(core, ast, expressionRecord.objectId, 0);
    const replay = await exportBundle(core, ast, expressionRecord.objectId, 0);
    if (!first.success || first.usedFallback || first.output !== replay.output) {
      throw new Error(`${expression.expressionId} native compile failed`);
    }
    const bundle = JSON.parse(first.output);
    if (
      bundle.morph?.schemaVersion !== expectedMorphSchemaVersion ||
      bundle.morph?.ignoredTargets?.length !== 0 ||
      bundle.morph?.normalsRecomputed !== false
    ) {
      throw new Error(
        `${expression.expressionId} morph receipt drifted ` +
          `(schema ${bundle.morph?.schemaVersion} vs admitted ${expectedMorphSchemaVersion}, ` +
          `ignored ${JSON.stringify(bundle.morph?.ignoredTargets)}, ` +
          `normalsRecomputed ${bundle.morph?.normalsRecomputed})`,
      );
    }
    if (
      expression.expressionId !== 'neutral' &&
      bundle.morph.changedVertexCount <= 0
    ) {
      throw new Error(`${expression.expressionId} did not deform native vertices`);
    }
    expressionBundles.push({
      expressionId: expression.expressionId,
      weights: expression.weights,
      sha256: sha256(first.output),
      bytes: Buffer.byteLength(first.output),
      morph: bundle.morph,
      bundle,
    });
  }
  return { records, expressionRecord, expressionBundles };
}

function browserBundle(bundle) {
  return {
    format: bundle.format,
    vertexCount: bundle.vertexCount,
    mesh: {
      positions: bundle.mesh.positions,
      normals: bundle.mesh.normals,
      uvs: bundle.mesh.uvs,
      indices: bundle.mesh.indices,
      jointIndices: bundle.mesh.jointIndices,
      jointWeights: bundle.mesh.jointWeights,
    },
    jointMatrices: bundle.jointMatrices,
    materialGroups: bundle.materialGroups,
    lod: bundle.lod,
    morph: bundle.morph,
  };
}

function h3bBrowserApplication(
  THREE,
  RoomEnvironment,
  EffectComposer,
  TAARenderPass,
  OutputPass,
  LODManager,
  payload,
) {
  const root = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(payload.plan.benchmark.devicePixelRatio);
  renderer.setSize(
    payload.plan.benchmark.renderWidth,
    payload.plan.benchmark.renderHeight,
    false,
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030913');
  scene.fog = new THREE.FogExp2('#06111d', 0.045);
  const camera = new THREE.PerspectiveCamera(
    38,
    payload.plan.benchmark.renderWidth / payload.plan.benchmark.renderHeight,
    0.05,
    60,
  );
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight('#7ca9c0', '#18110d', 1.3));
  const key = new THREE.DirectionalLight('#e7f4ff', 4.2);
  key.position.set(-3.5, 6.5, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const warm = new THREE.PointLight('#f0a45d', 72, 8, 2);
  warm.position.set(3.5, 2.4, 3.5);
  scene.add(warm);
  const rim = new THREE.SpotLight('#49b8d0', 55, 12, Math.PI / 5, 0.55, 1.5);
  rim.position.set(0, 4.5, -4);
  rim.target.position.set(0, 1.2, 0);
  scene.add(rim, rim.target);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(7, 96),
    new THREE.MeshStandardMaterial({
      color: '#07131d',
      roughness: 0.82,
      metalness: 0.12,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.014, 12, 128),
    new THREE.MeshStandardMaterial({
      color: '#5aa8b8',
      emissive: '#153e48',
      emissiveIntensity: 1.2,
      roughness: 0.35,
      metalness: 0.48,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.012;
  scene.add(ring);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 7),
    new THREE.MeshBasicMaterial({
      color: '#07101a',
    }),
  );
  backdrop.position.set(0, 2.35, -2.7);
  backdrop.receiveShadow = true;
  scene.add(backdrop);
  for (const x of [-2.7, 0, 2.7]) {
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.018, 10, 96, Math.PI),
      new THREE.MeshStandardMaterial({
        color: '#315464',
        emissive: '#102d3a',
        emissiveIntensity: 0.55,
        roughness: 0.48,
        metalness: 0.4,
      }),
    );
    rib.position.set(x, 1.52, -2.58);
    rib.rotation.z = Math.PI / 2;
    scene.add(rib);
  }

  const atlasTextures = {};
  const loader = new THREE.TextureLoader();
  const textureReady = Promise.all(
    Object.entries(payload.atlasDataUrls).map(
      ([kind, url]) =>
        new Promise((resolve, reject) => {
          loader.load(
            url,
            (texture) => {
              texture.colorSpace =
                kind === 'albedo'
                  ? THREE.SRGBColorSpace
                  : THREE.NoColorSpace;
              texture.wrapS = THREE.RepeatWrapping;
              texture.wrapT = THREE.ClampToEdgeWrapping;
              texture.anisotropy = Math.min(
                8,
                renderer.capabilities.getMaxAnisotropy(),
              );
              atlasTextures[kind] = texture;
              resolve();
            },
            undefined,
            reject,
          );
        }),
    ),
  );

  const historyResets = [];
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(payload.plan.benchmark.devicePixelRatio);
  composer.setSize(
    payload.plan.benchmark.renderWidth,
    payload.plan.benchmark.renderHeight,
  );
  const taaPass = new TAARenderPass(scene, camera, 0x000000, 0);
  taaPass.sampleLevel = payload.plan.temporalAccumulation.sampleLevel;
  taaPass.accumulate = true;
  composer.addPass(taaPass);
  composer.addPass(new OutputPass());
  const lodManager = new LODManager({
    targetFrameRate: 60,
    autoUpdate: false,
    updateFrequency: 60,
    globalBias: 0,
    maxTransitionTime: 0,
    collectMetrics: true,
    cameraFOV: camera.fov,
    screenHeight: payload.plan.benchmark.renderHeight,
    debug: false,
  });
  for (const record of payload.records) {
    const highestTriangleCount = Math.max(
      1,
      ...record.tiers.map((tier) => tier.triangleCount),
    );
    lodManager.register(
      record.personaId,
      {
        id: record.personaId,
        strategy: 'distance',
        transition: 'instant',
        transitionDuration: 0,
        levels: record.tiers.map((tier) => ({
          level: tier.level,
          distance: payload.plan.lod.distancesMeters[tier.level],
          polygonRatio: tier.triangleCount / highestTriangleCount,
          textureScale: tier.level === 0 ? 1 : tier.level === 1 ? 0.75 : 0.5,
          disabledFeatures: tier.level === 2 ? ['reflections'] : [],
          triangleCount: tier.triangleCount,
        })),
        hysteresis: 0.08,
        bias: 0,
        fadeEnabled: false,
        maxLevel: 2,
        enabled: true,
      },
      [0, 0, 0],
    );
  }

  function resetHistory(event) {
    taaPass.accumulateIndex = -1;
    historyResets.push({
      event,
      sequence: historyResets.length,
      timestampExcludedFromDigest: true,
    });
  }

  function atlasCellTexture(kind, column) {
    const texture = atlasTextures[kind].clone();
    texture.repeat.set(1 / 3, 1);
    texture.offset.set(column / 3, 0);
    texture.needsUpdate = true;
    return texture;
  }

  function geometryFromBundle(bundle) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(bundle.mesh.positions);
    const normals = new Float32Array(bundle.mesh.normals);
    for (let vertex = 0; vertex < bundle.vertexCount; vertex += 1) {
      const joint = bundle.mesh.jointIndices[vertex];
      const weight = bundle.mesh.jointWeights[vertex];
      const offset = joint * 16;
      const x = positions[vertex * 3];
      const y = positions[vertex * 3 + 1];
      const z = positions[vertex * 3 + 2];
      positions[vertex * 3] =
        (bundle.jointMatrices[offset] * x +
          bundle.jointMatrices[offset + 4] * y +
          bundle.jointMatrices[offset + 8] * z +
          bundle.jointMatrices[offset + 12]) *
        weight;
      positions[vertex * 3 + 1] =
        (bundle.jointMatrices[offset + 1] * x +
          bundle.jointMatrices[offset + 5] * y +
          bundle.jointMatrices[offset + 9] * z +
          bundle.jointMatrices[offset + 13]) *
        weight;
      positions[vertex * 3 + 2] =
        (bundle.jointMatrices[offset + 2] * x +
          bundle.jointMatrices[offset + 6] * y +
          bundle.jointMatrices[offset + 10] * z +
          bundle.jointMatrices[offset + 14]) *
        weight;
      const nx = normals[vertex * 3];
      const ny = normals[vertex * 3 + 1];
      const nz = normals[vertex * 3 + 2];
      const posedX =
        bundle.jointMatrices[offset] * nx +
        bundle.jointMatrices[offset + 4] * ny +
        bundle.jointMatrices[offset + 8] * nz;
      const posedY =
        bundle.jointMatrices[offset + 1] * nx +
        bundle.jointMatrices[offset + 5] * ny +
        bundle.jointMatrices[offset + 9] * nz;
      const posedZ =
        bundle.jointMatrices[offset + 2] * nx +
        bundle.jointMatrices[offset + 6] * ny +
        bundle.jointMatrices[offset + 10] * nz;
      const length = Math.hypot(posedX, posedY, posedZ) || 1;
      normals[vertex * 3] = posedX / length;
      normals[vertex * 3 + 1] = posedY / length;
      normals[vertex * 3 + 2] = posedZ / length;
    }
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(normals, 3),
    );
    if (bundle.mesh.uvs?.length) {
      geometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(bundle.mesh.uvs), 2),
      );
    }
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

  function wardrobeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = payload.plan.studioPresentation.wardrobeColor;
    context.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 4) {
      context.fillStyle = x % 8 === 0 ? '#527c89' : '#3f626d';
      context.fillRect(x, 0, 1, 128);
    }
    for (let y = 0; y < 128; y += 4) {
      context.fillStyle = y % 8 === 0 ? '#6c8c92' : '#35525d';
      context.globalAlpha = 0.35;
      context.fillRect(0, y, 128, 1);
    }
    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    return texture;
  }

  const sharedWardrobeTexture = wardrobeTexture();

  function materialFromGroup(group, persona, column) {
    const model = group.material.shadingModel;
    if (model === 'skin-sss') {
      return new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        map: atlasCellTexture('albedo', column),
        normalMap: atlasCellTexture('normal', column),
        normalScale: new THREE.Vector2(0.23, 0.23),
        roughnessMap: atlasCellTexture('surfaceMask', column),
        roughness: 0.52,
        metalness: 0,
        clearcoat: 0.035,
        clearcoatRoughness: 0.68,
        sheen: 0.12,
        sheenColor: new THREE.Color('#c8876b'),
        envMapIntensity: 0.75,
      });
    }
    if (model === 'marschner-hair') {
      return new THREE.MeshPhysicalMaterial({
        color: persona.hairColor,
        roughness: 0.57,
        metalness: 0,
        sheen: 0.82,
        sheenRoughness: 0.42,
        sheenColor: new THREE.Color('#c17b50'),
        clearcoat: 0.025,
        side: THREE.DoubleSide,
        envMapIntensity: 0.95,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: persona.irisColor,
      roughness: 0.07,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
      ior: 1.376,
      envMapIntensity: 1.35,
    });
  }

  function buildWardrobe() {
    const group = new THREE.Group();
    const cloth = new THREE.MeshPhysicalMaterial({
      color: payload.plan.studioPresentation.wardrobeColor,
      map: sharedWardrobeTexture,
      roughness: 0.78,
      metalness: 0.02,
      sheen: 0.42,
      sheenRoughness: 0.66,
      sheenColor: new THREE.Color('#8eb5bd'),
      envMapIntensity: 0.52,
    });
    const leather = new THREE.MeshStandardMaterial({
      color: '#3d281e',
      roughness: 0.6,
      metalness: 0.04,
    });
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.235, 0.54, 7, 24),
      cloth,
    );
    torso.scale.set(1.15, 1, 0.72);
    torso.position.set(0, 1.0, -0.03);
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.145, 0.024, 10, 40, Math.PI),
      leather,
    );
    collar.rotation.z = Math.PI;
    collar.position.set(0, 1.31, 0.09);
    group.add(collar);
    return group;
  }

  function buildPersona(personaRecord, tier, column) {
    const group = new THREE.Group();
    const bundle = tier.bundle;
    const materials = bundle.materialGroups.map((materialGroup) =>
      materialFromGroup(materialGroup, personaRecord, column),
    );
    const mesh = new THREE.Mesh(geometryFromBundle(bundle), materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh, buildWardrobe());
    group.rotation.y = -0.18;
    return group;
  }

  function disposeActive(active) {
    if (!active) return;
    scene.remove(active);
    active.traverse((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [];
      for (const material of materials) {
        material.map?.dispose?.();
        material.normalMap?.dispose?.();
        material.roughnessMap?.dispose?.();
        material.dispose?.();
      }
    });
  }

  let active = null;
  let activeView = {
    mode: 'lineup',
    personaIndex: 1,
    expressionId: 'neutral',
    lod: 0,
  };

  function tierFor(personaRecord, level) {
    lodManager.setForcedLevel(personaRecord.personaId, level);
    lodManager.update([
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ]);
    const selectedLevel = lodManager.getCurrentLevel(personaRecord.personaId);
    return personaRecord.tiers.find((tier) => tier.level === selectedLevel);
  }

  function expressionFor(expressionId) {
    return payload.expressionBundles.find(
      (expression) => expression.expressionId === expressionId,
    );
  }

  function setView(next) {
    const previous = activeView;
    activeView = { ...activeView, ...next };
    if (previous.lod !== activeView.lod) resetHistory('lod_change');
    if (previous.expressionId !== activeView.expressionId) {
      resetHistory('expression_change');
    }
    if (previous.personaIndex !== activeView.personaIndex) {
      resetHistory('persona_change');
    }
    disposeActive(active);
    active = new THREE.Group();
    if (activeView.mode === 'lineup') {
      const positions = [-0.78, 0, 0.78];
      payload.records.forEach((record, index) => {
        const resident = buildPersona(
          record,
          tierFor(record, activeView.lod),
          index,
        );
        resident.position.x = positions[index];
        resident.scale.setScalar(0.92);
        active.add(resident);
      });
      camera.position.set(0, 1.36, 4.15);
      camera.lookAt(0, 1.18, 0);
    } else {
      const record = payload.records[activeView.personaIndex];
      let tier = tierFor(record, activeView.lod);
      if (
        activeView.expressionId !== 'neutral' &&
        activeView.personaIndex === 1
      ) {
        const expression = expressionFor(activeView.expressionId);
        tier = { ...tier, bundle: expression.bundle };
      }
      active.add(buildPersona(record, tier, activeView.personaIndex));
      camera.position.set(0, 1.5, 1.55);
      camera.lookAt(0, 1.48, 0.03);
    }
    scene.add(active);
    resetHistory('camera_cut');
    renderer.render(scene, camera);
  }

  function readPatch() {
    const gl = renderer.getContext();
    const width = 128;
    const height = 72;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(
      Math.floor((payload.plan.benchmark.renderWidth - width) / 2),
      Math.floor((payload.plan.benchmark.renderHeight - height) / 2),
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    return pixels;
  }

  function meanAbsolutePixelDelta(left, right) {
    let sum = 0;
    for (let index = 0; index < left.length; index += 1) {
      sum += Math.abs(left[index] - right[index]);
    }
    return sum / Math.max(1, left.length);
  }

  async function settle(samples = 32, capturePixels = false) {
    taaPass.accumulateIndex = -1;
    const deltas = [];
    let previous = null;
    for (let sample = 0; sample < samples; sample += 1) {
      composer.render();
      if (capturePixels) {
        const pixels = readPatch();
        if (previous) deltas.push(meanAbsolutePixelDelta(previous, pixels));
        previous = pixels;
      }
      if (sample % 4 === 3) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    const windowMean = (values) =>
      values.reduce((sum, value) => sum + value, 0) /
      Math.max(1, values.length);
    return {
      samples,
      accumulateIndex: taaPass.accumulateIndex,
      deltas,
      firstWindowMean: windowMean(deltas.slice(0, 4)),
      lastWindowMean: windowMean(deltas.slice(-4)),
    };
  }

  window.__h3bSetView = async (view) => {
    setView(view);
    return { ...activeView };
  };
  window.__h3bSettle = settle;

  async function run() {
    await textureReady;
    resetHistory('profile_change');
    resetHistory('resize');
    setView(activeView);
    await settle(payload.plan.temporalAccumulation.historySamples, false);
    const nextFrame = () =>
      new Promise((resolve) =>
        requestAnimationFrame((timestamp) => resolve(timestamp)),
      );
    let previous = await nextFrame();
    for (
      let index = 0;
      index < payload.plan.benchmark.warmupFrames;
      index += 1
    ) {
      composer.render();
      previous = await nextFrame();
    }
    const raf = [];
    const submit = [];
    for (
      let index = 0;
      index < payload.plan.benchmark.measuredFrames;
      index += 1
    ) {
      const started = performance.now();
      composer.render();
      submit.push(performance.now() - started);
      const now = await nextFrame();
      raf.push(now - previous);
      previous = now;
    }
    const stability = await settle(
      payload.plan.temporalAccumulation.historySamples,
      true,
    );
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const unmaskedRenderer = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const backend = /D3D11|Direct3D11/i.test(unmaskedRenderer)
      ? 'D3D11'
      : /D3D12|Direct3D12/i.test(unmaskedRenderer)
        ? 'D3D12'
        : /Vulkan/i.test(unmaskedRenderer)
          ? 'Vulkan'
          : 'unknown';
    const droppedFrames = raf.filter(
      (value) =>
        value > payload.plan.benchmark.maximumRafP95Milliseconds,
    ).length;
    window.__H3B = {
      benchmark: {
        raf: payload.summarize(raf),
        renderSubmit: payload.summarize(submit),
        droppedFrames,
        droppedFrameRatio: droppedFrames / Math.max(1, raf.length),
      },
      taa: {
        samples: stability.samples,
        accumulateIndex: stability.accumulateIndex,
        firstWindowMeanPixelDelta: stability.firstWindowMean,
        lastWindowMeanPixelDelta: stability.lastWindowMean,
        stabilityConverged:
          stability.lastWindowMean <= 0.2 &&
          stability.lastWindowMean <=
            Math.max(0.2, stability.firstWindowMean * 1.1),
        motionReprojectionClaimed: false,
        productionTaaClaimed: false,
      },
      renderer: {
        unmaskedRenderer,
        version: gl.getParameter(gl.VERSION),
        backend,
        software: /SwiftShader|llvmpipe|software/i.test(unmaskedRenderer),
      },
      historyResets,
      lodManagerRuntimeClass: lodManager.constructor.name,
      jointPaletteMaterialized: payload.records.every((record) =>
        record.tiers.every(
          (tier) =>
            tier.bundle.jointMatrices.length > 0 &&
            tier.bundle.mesh.jointIndices.length === tier.bundle.vertexCount,
        ),
      ),
      sourceCommit: payload.sourceCommit,
    };
    window.__H3B_READY__ = true;
  }

  run().catch((error) => {
    window.__H3B_ERROR__ = error?.stack || error?.message || String(error);
  });
}

async function loadWorkspaceModules(holoScriptRoot) {
  const workspaceRequire = createRequire(path.join(holoScriptRoot, 'package.json'));
  const importResolved = async (name) =>
    import(pathToFileURL(workspaceRequire.resolve(name)).href);
  const sharpModule = await importResolved('sharp');
  const playwrightModule = await importResolved('playwright');
  return {
    sharp: sharpModule.default || sharpModule,
    esbuild: await importResolved('esbuild'),
    playwright: (playwrightModule.default || playwrightModule).chromium,
  };
}

async function buildBrowserSurface(compiled, options, modules) {
  mkdirSync(options.outputDir, { recursive: true });
  const bundlePath = path.join(
    options.outputDir,
    'character-appearance-h3b.bundle.js',
  );
  const htmlPath = path.join(
    options.outputDir,
    'character-appearance-h3b.html',
  );
  const atlasDataUrls = Object.fromEntries(
    Object.entries(compiled.plan.atlas)
      .filter(([key]) => ['albedo', 'normal', 'surfaceMask'].includes(key))
      .map(([key, relative]) => [
        key,
        `data:image/png;base64,${readFileSync(path.join(options.root, relative)).toString('base64')}`,
      ]),
  );
  const payload = {
    sourceCommit: compiled.contract.metadata.upstreamHoloScriptCommit,
    plan: compiled.plan,
    atlasDataUrls,
    records: compiled.native.records.map((record) => ({
      ...record,
      tiers: record.tiers.map((tier) => ({
        ...tier,
        bundle: browserBundle(tier.bundle),
      })),
    })),
    expressionBundles: compiled.native.expressionBundles.map((expression) => ({
      ...expression,
      bundle: browserBundle(expression.bundle),
    })),
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    "import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';",
    "import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';",
    "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';",
    "import { LODManager } from './packages/engine/src/lod/LODManager.ts';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `PAYLOAD.summarize = (values) => ({
      samples: values.length,
      p50: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.50)-1)] : 0,
      p95: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.95)-1)] : 0,
      p99: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.99)-1)] : 0,
      maximum: values.length ? Math.max(...values) : 0,
    });`,
    `(${h3bBrowserApplication.toString()})(THREE, RoomEnvironment, EffectComposer, TAARenderPass, OutputPass, LODManager, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'character-appearance-h3b.entry.js',
        loader: 'js',
      },
      outfile: bundlePath,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['chrome120'],
      minify: false,
      sourcemap: false,
      nodePaths: [path.join(options.holoScriptRoot, 'node_modules')],
      logLevel: 'silent',
    });
  } finally {
    modules.esbuild.stop?.();
  }
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Stormglass Character Appearance H3B</title>
  <style>
    html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#030913}
    canvas{display:block}
    .hud{position:fixed;inset:0;pointer-events:none;color:#eef8fa;font-family:Inter,Segoe UI,sans-serif}
    .eyebrow{position:absolute;left:38px;top:30px;color:#75ceda;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.2em}
    h1{position:absolute;left:36px;top:46px;margin:0;font:600 37px/1.05 Georgia,serif;text-shadow:0 2px 20px #000}
    .sub{position:absolute;left:39px;top:95px;color:#a8c0ca;font:600 12px/1.5 ui-monospace,monospace}
    .card{position:absolute;right:30px;top:28px;width:326px;padding:16px 19px;border:1px solid #365462;border-radius:13px;background:rgba(4,12,21,.88);box-shadow:0 14px 50px rgba(0,0,0,.35)}
    .label{color:#6ed0df;font:700 10px/1.4 ui-monospace,monospace;letter-spacing:.17em;text-transform:uppercase}
    .value{margin-top:6px;color:#edf7fa;font:600 12px/1.52 ui-monospace,monospace}
    .rule{height:1px;background:#29424d;margin:11px 0}
    .bounded{color:#efb074}
    .foot{position:absolute;left:39px;bottom:25px;color:#8fa9b4;font:600 10px/1.45 ui-monospace,monospace;letter-spacing:.1em}
    .truth{position:absolute;right:30px;bottom:25px;color:#8fb0bc;font:600 10px/1.45 ui-monospace,monospace;text-align:right}
  </style>
</head>
<body>
  <div id="app"></div>
  <div class="hud">
    <div class="eyebrow">STORMGLASS COMMONS // NATIVE CHARACTER H3B</div>
    <h1>Native Civic Personas</h1>
    <div class="sub">@hair(style) · @morph · @lod hair topology · static TAA32</div>
    <div class="card">
      <div class="label">Sovereign admission</div>
      <div class="value">character-webgpu drawspec<br>9 deterministic native LOD bundles<br>6 procedural-head morph probes</div>
      <div class="rule"></div>
      <div class="label">Visual profile</div>
      <div class="value">PBR studio interpretation<br>local dermal atlas · hardware WebGL2<br>single HoloScript LOD authority</div>
      <div class="rule"></div>
      <div class="label bounded">Truth boundary</div>
      <div class="value bounded">procedural-head-v1 · normals unchanged<br>static accumulation, not motion TAA<br>not a production human face</div>
    </div>
    <div class="foot">HEARTHLIGHT BIOREALISM · SOURCE COMMIT ${compiled.contract.metadata.upstreamHoloScriptCommit.slice(0, 12)}</div>
    <div class="truth">NO FAMILY/RESEARCH SEAT BINDING<br>NO MODEL CALLS · NO CANONICAL WRITES</div>
  </div>
  <script src="${path.basename(bundlePath)}"></script>
</body>
</html>`;
  writeFileSync(htmlPath, html, 'utf8');
  return {
    bundlePath,
    htmlPath,
    appSourceHash: sha256(appSource),
    bundleHash: sha256File(bundlePath),
    htmlHash: sha256(html),
  };
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function startServer(root) {
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://127.0.0.1').pathname,
      );
      const absolute = path.resolve(root, pathname.replace(/^\/+/, ''));
      const allowed =
        absolute === root ||
        absolute.startsWith(`${root}${path.sep}`);
      if (!allowed || !existsSync(absolute) || statSync(absolute).isDirectory()) {
        response.writeHead(404);
        response.end('not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType(absolute) });
      response.end(readFileSync(absolute));
    } catch (error) {
      response.writeHead(500);
      response.end(error?.message || String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function labeledPanel(sharp, buffer, width, height, title, detail) {
  const base = await sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const overlay = Buffer.from(`<svg width="${width}" height="${height}">
    <rect x="0" y="${height - 76}" width="${width}" height="76" fill="#020813" fill-opacity="0.90"/>
    <text x="22" y="${height - 43}" fill="#f2f8fa" font-size="23" font-family="Segoe UI, sans-serif" font-weight="700">${escapeXml(title)}</text>
    <text x="22" y="${height - 18}" fill="#72cfdd" font-size="14" font-family="Consolas, monospace">${escapeXml(detail)}</text>
  </svg>`);
  return sharp(base).composite([{ input: overlay }]).png().toBuffer();
}

async function sheet(sharp, panels, columns, width, height, outputPath) {
  const columnWidth = Math.floor(width / columns);
  const rows = Math.ceil(panels.length / columns);
  const rowHeight = Math.floor(height / rows);
  const prepared = [];
  for (let index = 0; index < panels.length; index += 1) {
    prepared.push({
      input: await labeledPanel(
        sharp,
        panels[index].buffer,
        columnWidth,
        rowHeight,
        panels[index].title,
        panels[index].detail,
      ),
      left: (index % columns) * columnWidth,
      top: Math.floor(index / columns) * rowHeight,
    });
  }
  const output = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#030913',
    },
  })
    .composite(prepared)
    .png()
    .toBuffer();
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
  return output;
}

async function captureBrowser(compiled, surface, options, modules) {
  const phasePath = path.join(options.outputDir, 'browser-phase.json');
  const markPhase = (phase, detail = {}) =>
    writeFileSync(
      phasePath,
      `${JSON.stringify({ phase, ...detail }, null, 2)}\n`,
    );
  markPhase('server_start');
  const server = await startServer(options.root);
  const address = server.address();
  const port = typeof address === 'object' ? address.port : 0;
  const relativeHtml = path
    .relative(options.root, surface.htmlPath)
    .replaceAll('\\', '/');
  const url = `http://127.0.0.1:${port}/${relativeHtml}`;
  markPhase('browser_launch', { url });
  let browser;
  try {
    browser = await modules.playwright.launch({
      ...(options.browser ? { executablePath: options.browser } : {}),
      headless: true,
      timeout: Math.min(options.timeoutMs, 45_000),
      args: [
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-features=Translate,MediaRouter',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      ],
    });
  } catch (error) {
    await new Promise((resolve) => server.close(resolve));
    throw error;
  }
  markPhase('browser_launched', { version: browser.version() });
  const context = await browser.newContext({
    viewport: {
      width: compiled.plan.benchmark.renderWidth,
      height: compiled.plan.benchmark.renderHeight,
    },
    deviceScaleFactor: compiled.plan.benchmark.devicePixelRatio,
  });
  markPhase('context_created');
  const page = await context.newPage();
  markPhase('page_created');
  const requests = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.setDefaultTimeout(options.timeoutMs);
  try {
    markPhase('page_navigation');
    await page.goto(url, { waitUntil: 'load' });
    markPhase('page_loaded');
    await page.waitForFunction(
      () => window.__H3B_READY__ === true || Boolean(window.__H3B_ERROR__),
      null,
      { timeout: options.timeoutMs },
    );
    markPhase('page_ready');
    const bootError = await page.evaluate(() => window.__H3B_ERROR__ || null);
    if (bootError) throw new Error(bootError);
    const witness = await page.evaluate(() => window.__H3B);
    await page.evaluate(() => {
      const hud = document.querySelector('.hud');
      if (hud) hud.style.display = 'none';
    });

    const screenshot = () => page.screenshot({ type: 'png' });
    const settle = (samples = 32) =>
      page.evaluate((count) => window.__h3bSettle(count, false), samples);
    const setView = (view) =>
      page.evaluate((next) => window.__h3bSetView(next), view);

    const heroPanels = [];
    for (let index = 0; index < compiled.plan.personas.length; index += 1) {
      const persona = compiled.plan.personas[index];
      await setView({
        mode: 'persona',
        personaIndex: index,
        expressionId: 'neutral',
        lod: 0,
      });
      await settle(32);
      heroPanels.push({
        buffer: await screenshot(),
        title: persona.displayLabel,
        detail: `${persona.civicRole} · ${persona.nativeHairStyleId} · native LOD0`,
      });
    }
    const heroPath = options.heroOutput || path.join(options.outputDir, 'h3b-hero.png');
    const heroBuffer = await sheet(
      modules.sharp,
      heroPanels,
      3,
      2400,
      900,
      heroPath,
    );

    const expressionPanels = [];
    for (const expression of compiled.native.expressionBundles) {
      await setView({
        mode: 'persona',
        personaIndex: 1,
        expressionId: expression.expressionId,
        lod: 0,
      });
      await settle(32);
      expressionPanels.push({
        buffer: await screenshot(),
        title: expression.expressionId.replaceAll('_', ' ').toUpperCase(),
        detail: `${expression.morph.changedVertexCount} changed vertices · ${expression.morph.positionDigest}`,
      });
    }
    const expressionPath =
      options.expressionOutput || path.join(options.outputDir, 'h3b-expressions.png');
    const expressionBuffer = await sheet(
      modules.sharp,
      expressionPanels,
      3,
      2400,
      900,
      expressionPath,
    );

    const lodPanels = [];
    for (const level of [0, 1, 2]) {
      await setView({
        mode: 'lineup',
        expressionId: 'neutral',
        lod: level,
      });
      await settle(32);
      const tiers = compiled.native.records.map((record) => record.tiers[level]);
      lodPanels.push({
        buffer: await screenshot(),
        title: `NATIVE LOD${level}`,
        detail: `${tiers.reduce((sum, tier) => sum + tier.triangleCount, 0)} tris · ${tiers.map((tier) => tier.lod.hairGuides).join('/')} hair guides`,
      });
    }
    const lodPath = options.lodOutput || path.join(options.outputDir, 'h3b-lods.png');
    const lodBuffer = await sheet(
      modules.sharp,
      lodPanels,
      3,
      2400,
      600,
      lodPath,
    );

    await setView({
      mode: 'persona',
      personaIndex: 1,
      expressionId: 'soft_smile',
      lod: 0,
    });
    const taaPanels = [];
    for (const samples of [1, 8, 16, 32]) {
      const temporal = await settle(samples);
      taaPanels.push({
        buffer: await screenshot(),
        title: `TAA ${samples}`,
        detail: `static jitter samples · history ${temporal.accumulateIndex}`,
      });
    }
    const taaPath = options.taaOutput || path.join(options.outputDir, 'h3b-taa.png');
    const taaBuffer = await sheet(
      modules.sharp,
      taaPanels,
      4,
      2400,
      600,
      taaPath,
    );
    const finalWitness = await page.evaluate(() => window.__H3B);
    return {
      witness: {
        ...witness,
        historyResets: finalWitness.historyResets,
      },
      requests,
      pageErrors,
      consoleErrors,
      browserVersion: browser.version(),
      heroPath,
      heroBuffer,
      expressionPath,
      expressionBuffer,
      lodPath,
      lodBuffer,
      taaPath,
      taaBuffer,
    };
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function manifestBindings(root) {
  return [
    SOURCE_REL,
    POLICY_REL,
    SEED_REL,
    'scripts/check-hololand-model-village-character-appearance-h3b.mjs',
    TEST_REL,
    REPORT_REL,
    HERO_REL,
    EXPRESSION_REL,
    LOD_REL,
    TAA_REL,
  ].map((relative) => ({
    path: relative,
    absolute: path.resolve(root, relative),
  }));
}

async function validateManifest(root, holoScriptRoot) {
  const manifestPath = path.resolve(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) {
    return { status: 'fail', errors: ['H3B manifest is missing'] };
  }
  const core = await loadCore(holoScriptRoot);
  const parsed = new core.HoloCompositionParser().parse(
    readFileSync(manifestPath, 'utf8'),
  );
  const errors = [...parsed.errors.map((error) => JSON.stringify(error))];
  if (!parsed.success) errors.push('H3B manifest parse failed');
  const state = stateProperties(parsed.ast?.state);
  for (const binding of [
    state.source,
    state.policy,
    state.seed,
    state.checker,
    state.test,
    state.report,
    state.hero,
    state.expressions,
    state.lods,
    state.taaConvergence,
  ]) {
    if (!binding?.path || !binding?.sha256) {
      errors.push('manifest durable binding incomplete');
      continue;
    }
    const absolute = path.resolve(root, binding.path);
    if (!existsSync(absolute) || sha256File(absolute) !== binding.sha256) {
      errors.push(`manifest binding drifted: ${binding.path}`);
    }
  }
  if (
    state.boundaries?.nativeChannelH3BAdmitted !== true ||
    state.boundaries?.fullH3Claimed !== false ||
    state.boundaries?.motionReprojectionClaimed !== false ||
    state.boundaries?.productionTaaClaimed !== false ||
    state.boundaries?.liveResearchJoinAllowed !== false ||
    state.boundaries?.canonicalWritesAllowed !== false
  ) {
    errors.push('manifest truth boundary drifted');
  }
  return {
    status: errors.length ? 'fail' : 'pass',
    errors,
    sourceHash: sha256File(manifestPath),
  };
}

function reportMarkdown(receipt) {
  const lodRows = [0, 1, 2]
    .map((level) => {
      const tiers = receipt.lod.personas.map((persona) => persona.tiers[level]);
      return `| LOD${level} | ${tiers.reduce((sum, tier) => sum + tier.triangleCount, 0)} | ${tiers.reduce((sum, tier) => sum + tier.hairTriangleCount, 0)} | ${tiers.map((tier) => tier.lod.hairGuides).join(' / ')} | ${tiers.map((tier) => tier.lod.hairSegments).join(' / ')} |`;
    })
    .join('\n');
  const expressionRows = receipt.morph.expressions
    .map(
      (expression) =>
        `| ${expression.expressionId} | ${expression.morph.changedVertexCount} | \`${expression.morph.positionDigest}\` | ${expression.morph.appliedTargets.map((target) => target.target).join(', ')} |`,
    )
    .join('\n');
  return `# HoloLand Model Village Character Appearance H3B

**Date:** 2026-07-27

**Status:** ${receipt.status.toUpperCase()}

**Receipt:** \`${receipt.receiptHash}\`

H3B admits HoloScript's native character channels into HoloLand. Three
family-neutral civic personas compile through the sovereign
\`character-webgpu\` target with operative source-authored hair styles,
procedural-head morph probes, and per-tier native hair topology. The same local
hardware browser witness presents those exact bundles through a PBR studio
interpretation and a bounded static TAA32 pass.

## Visual result

![H3B native personas](../assets/model-village/model-village-character-appearance-h3b-native-personas-2026-07-27.png)

![H3B native expressions](../assets/model-village/model-village-character-appearance-h3b-native-expressions-2026-07-27.png)

![H3B native LODs](../assets/model-village/model-village-character-appearance-h3b-native-lods-2026-07-27.png)

![H3B static TAA convergence](../assets/model-village/model-village-character-appearance-h3b-taa-convergence-2026-07-27.png)

## Native source-authored hair LOD

| Tier | Three-persona triangles | Hair triangles | Hair guides by persona | Curve segments by persona |
|---|---:|---:|---:|---:|
${lodRows}

The HoloLand bridge does not decimate hair. Each tier's \`hair_guides\`,
\`hair_cards_per_guide\`, and \`hair_segments\` values are authored in the H3B
\`.holo\`, selected by the HoloScript composition bridge, and serialized in the
native bundle receipt. HoloScript \`LODManager\` remains the sole runtime
selector.

## Native procedural-head morph receipts

| Probe | Changed vertices | Position digest | Applied native targets |
|---|---:|---|---|
${expressionRows}

The current substrate is explicitly \`procedural-head-v1\`. It does not
recompute normals after deformation and is not a complete production face.

## Measured local browser profile

- Browser: ${receipt.render.browser}
- Renderer: ${receipt.render.renderer.unmaskedRenderer}
- Backend: ${receipt.render.renderer.backend}
- Protocol: ${receipt.performance.measuredFrames} measured frames after ${receipt.performance.warmupFrames} warm-up
- Three native LOD0 personas simultaneous
- rAF p95: ${receipt.performance.raf.p95.toFixed(2)} ms
- Render-submit p95: ${receipt.performance.renderSubmit.p95.toFixed(2)} ms
- Dropped-frame ratio: ${(receipt.performance.droppedFrameRatio * 100).toFixed(3)}%

## Static temporal convergence

- Implementation: \`${receipt.temporal.implementation}\`
- Settled history: ${receipt.temporal.samples} samples
- First-window center-patch mean delta: ${receipt.temporal.firstWindowMeanPixelDelta.toFixed(6)}
- Final-window center-patch mean delta: ${receipt.temporal.lastWindowMeanPixelDelta.toFixed(6)}
- History reset events receipted: ${receipt.temporal.historyResets.map((reset) => reset.event).join(', ')}

This remains static jittered accumulation for settled frames. It has no motion
vectors, reprojection, disocclusion rejection, reactive mask, neighborhood
clamp, or production motion-stable TAA claim.

## Boundaries and next lane

Record Steward uses native \`long\` hair because H3A's \`braided_crown\` is not
yet in the admitted native style catalog; parity is explicitly false. H3B does
not replace the public first release, bind any persona to Claude/OpenAI/Gemini/
Grok or a research seat, admit live research, persist biometrics, call models,
or write canonical village state.

The next production-detail lane is facial topology, morph-normal/tangent
reconstruction, eye/tearline refinement, hands, and native wardrobe integration.
H3B does not claim photorealism, headset performance, or full-world convergence.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    browser: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    outputDir: DEFAULT_OUTPUT,
    heroOutput: null,
    expressionOutput: null,
    lodOutput: null,
    taaOutput: null,
    reportOutput: null,
    skipManifest: false,
    clean: true,
    timeoutMs: 180000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') {
      options.holoScriptRoot = path.resolve(argv[++index]);
    } else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--output') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--hero-output') {
      options.heroOutput = path.resolve(argv[++index]);
    } else if (arg === '--expression-output') {
      options.expressionOutput = path.resolve(argv[++index]);
    } else if (arg === '--lod-output') {
      options.lodOutput = path.resolve(argv[++index]);
    } else if (arg === '--taa-output') {
      options.taaOutput = path.resolve(argv[++index]);
    } else if (arg === '--report-output') {
      options.reportOutput = path.resolve(argv[++index]);
    } else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--no-clean') options.clean = false;
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-character-appearance-h3b.mjs [options]

  --hero-output <path>        Durable 2400x900 native persona sheet
  --expression-output <path>  Durable 2400x900 native expression sheet
  --lod-output <path>         Durable 2400x600 native LOD sheet
  --taa-output <path>         Durable 2400x600 static TAA convergence sheet
  --report-output <path>      Durable Markdown report
  --skip-manifest             Bootstrap before the immutable manifest exists
  --output <dir>              Ephemeral browser witness directory
  --timeout-ms <number>       Browser operation timeout`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }
  return options;
}

export async function runCharacterAppearanceH3B(options = parseArgs([])) {
  const root = path.resolve(options.root || ROOT);
  const holoScriptRoot = path.resolve(
    options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT,
  );
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT);
  const normalized = { ...options, root, holoScriptRoot, outputDir };
  if (normalized.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });
  console.error('[H3B] parse and validate source stack');
  const stack = await parseH3BStack(root, holoScriptRoot);
  const validation = validateH3BContract(stack.contract, root, holoScriptRoot);
  if (validation.status !== 'pass') {
    throw new Error(`H3B contract failed:\n${validation.errors.join('\n')}`);
  }
  const plan = buildH3BPlan(stack.contract);
  console.error('[H3B] compile 9 native LOD bundles and 6 morph probes');
  const native = await compileH3BNativeBundles(stack.core, stack.source.ast, plan);
  const compiled = { ...stack, plan, native };
  console.error('[H3B] bundle browser surface');
  const modules = await loadWorkspaceModules(holoScriptRoot);
  const surface = await buildBrowserSurface(compiled, normalized, modules);
  console.error('[H3B] launch local GPU witness and capture sheets');
  const browser = await captureBrowser(compiled, surface, normalized, modules);
  console.error('[H3B] validate receipts and write durable outputs');
  const manifest = normalized.skipManifest
    ? { status: 'skipped', errors: [], reason: 'bootstrap_skip_requested' }
    : await validateManifest(root, holoScriptRoot);
  const externalRequests = browser.requests.filter(
    (url) => !url.startsWith('http://127.0.0.1:'),
  );
  const checks = {
    formatStackPass:
      stack.source.success && stack.policy.success && stack.seed.success,
    h3bContractPass: validation.status === 'pass',
    manifestPass: ['pass', 'skipped'].includes(manifest.status),
    exactThreePersonas: plan.personas.length === 3,
    exactNineNativeBundles:
      native.records.length === 3 &&
      native.records.every((record) => record.tiers.length === 3),
    repeatedCompileByteIdentity: native.records.every((record) =>
      record.tiers.every((tier) => tier.sha256.length === 64),
    ),
    noCompilerFallback: native.records.every((record) =>
      record.tiers.every((tier) => tier.report.stubbed.length === 0),
    ),
    nativeHairStylesMapped: native.records.every((record) =>
      record.tiers.every((tier) =>
        tier.report.mapped.includes(
          `@hair(style=${record.nativeHairStyleId})`,
        ),
      ),
    ),
    nativeHairLodMapped: native.records.every((record) =>
      record.tiers.every((tier) =>
        tier.report.mapped.some((entry) =>
          entry.startsWith('@lod(hair_guides='),
        ),
      ),
    ),
    monotonicNativeHairTopology: native.records.every(
      (record) =>
        record.tiers[0].hairTriangleCount >
          record.tiers[1].hairTriangleCount &&
        record.tiers[1].hairTriangleCount >
          record.tiers[2].hairTriangleCount,
    ),
    exactSixNativeExpressions: native.expressionBundles.length === 6,
    nativeMorphReceipts: native.expressionBundles.every(
      (expression) =>
        expression.morph.schemaVersion ===
          'holoscript.native-facial-morph.v1' &&
        expression.morph.ignoredTargets.length === 0 &&
        expression.morph.normalsRecomputed === false,
    ),
    nonNeutralMorphsDeformVertices: native.expressionBundles
      .filter((expression) => expression.expressionId !== 'neutral')
      .every((expression) => expression.morph.changedVertexCount > 0),
    exactFrameProtocol:
      browser.witness.benchmark.raf.samples ===
        plan.benchmark.measuredFrames &&
      browser.witness.benchmark.renderSubmit.samples ===
        plan.benchmark.measuredFrames,
    rafP95Budget:
      browser.witness.benchmark.raf.p95 <=
      plan.benchmark.maximumRafP95Milliseconds,
    renderSubmitP95Budget:
      browser.witness.benchmark.renderSubmit.p95 <=
      plan.benchmark.maximumRenderSubmitP95Milliseconds,
    droppedFrameBudget:
      browser.witness.benchmark.droppedFrameRatio <=
      plan.benchmark.maximumDroppedFrameRatio,
    hardwareRenderer:
      browser.witness.renderer.software === false &&
      /NVIDIA|GeForce|RTX/i.test(
        browser.witness.renderer.unmaskedRenderer,
      ),
    d3d11Backend: browser.witness.renderer.backend === 'D3D11',
    nativeLodManagerReachedBrowser:
      browser.witness.lodManagerRuntimeClass === 'LODManager',
    nativeJointPaletteMaterialized:
      browser.witness.jointPaletteMaterialized === true,
    staticTaaHistorySettled:
      browser.witness.taa.samples ===
        plan.temporalAccumulation.historySamples &&
      browser.witness.taa.accumulateIndex >=
        plan.temporalAccumulation.historySamples,
    temporalStabilityConverged:
      browser.witness.taa.stabilityConverged === true,
    historyResetCoverage: RESET_EVENTS.every((event) =>
      browser.witness.historyResets.some((reset) => reset.event === event),
    ),
    boundedTemporalClaim:
      browser.witness.taa.motionReprojectionClaimed === false &&
      browser.witness.taa.productionTaaClaimed === false,
    noExternalRequests: externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    noConsoleErrors: browser.consoleErrors.length === 0,
    lockedHeroResolution:
      pngDimensions(browser.heroBuffer).width === 2400 &&
      pngDimensions(browser.heroBuffer).height === 900,
    lockedExpressionResolution:
      pngDimensions(browser.expressionBuffer).width === 2400 &&
      pngDimensions(browser.expressionBuffer).height === 900,
    lockedLodResolution:
      pngDimensions(browser.lodBuffer).width === 2400 &&
      pngDimensions(browser.lodBuffer).height === 600,
    lockedTaaResolution:
      pngDimensions(browser.taaBuffer).width === 2400 &&
      pngDimensions(browser.taaBuffer).height === 600,
    boundedClaims:
      stack.contract.state.fullH3Claimed === false &&
      stack.contract.state.productionFaceCompleteClaimed === false &&
      stack.contract.state.productionHairCompleteClaimed === false &&
      stack.contract.state.photorealismClaimed === false,
    readOnlyBoundary:
      stack.contract.state.liveResearchJoinAllowed === false &&
      stack.contract.state.canonicalWritesAllowed === false &&
      stack.contract.state.modelCallsAllowed === false &&
      stack.contract.state.biometricPersistenceAllowed === false,
  };
  const failures = [
    ...Object.entries(checks)
      .filter(([, value]) => value !== true)
      .map(([name]) => name),
    ...manifest.errors.map((error) => `manifest:${error}`),
  ];
  const receiptCore = {
    schema: 'hololand.model-village.character-appearance-h3b-witness.v1',
    status: failures.length ? 'fail' : 'pass',
    claim: {
      verified:
        'Three family-neutral civic personas compile through HoloScript character-webgpu with operative native hair styles, source-authored native hair LOD topology, native procedural-head morph receipts, and a measured local hardware PBR/static-TAA browser witness.',
      bounded:
        'H3B is native channel admission, not full H3. Procedural-head-v1 does not recompute normals, Record Steward substitutes long for the unwired braided crown target, and static TAA32 is not motion-reprojected production TAA.',
    },
    sources: {
      source: { path: SOURCE_REL, sha256: sha256(stack.sourceText) },
      policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
      seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
      checker: {
        path: path.relative(root, SCRIPT_PATH).replaceAll('\\', '/'),
        sha256: sha256File(SCRIPT_PATH),
      },
      upstream: Object.fromEntries(
        SOURCE_HASH_PAIRS.filter(([, , owner]) => owner === 'holoscript').map(
          ([pathKey, hashKey]) => [
            pathKey,
            {
              path: stack.contract.metadata[pathKey],
              sha256: stack.contract.metadata[hashKey],
            },
          ],
        ),
      ),
    },
    plan,
    nativeCompiler: {
      target: plan.nativeAdmission.compilerTarget,
      outputFormat: plan.nativeAdmission.outputFormat,
      sourceCommit: stack.contract.metadata.upstreamHoloScriptCommit,
      repeatedCompileByteIdentity: true,
      fallbackUsed: false,
    },
    lod: {
      runtimeClass: 'LODManager',
      personas: native.records.map((record) => ({
        personaId: record.personaId,
        objectId: record.objectId,
        nativeHairStyleId: record.nativeHairStyleId,
        nativeStyleParityClaimed: record.nativeStyleParityClaimed,
        tiers: record.tiers.map(({ bundle, ...tier }) => tier),
      })),
    },
    morph: {
      topology: 'procedural-head-v1',
      normalsRecomputed: false,
      expressions: native.expressionBundles.map(({ bundle, ...expression }) => expression),
    },
    performance: {
      warmupFrames: plan.benchmark.warmupFrames,
      measuredFrames: plan.benchmark.measuredFrames,
      simultaneousPersonaCount: plan.benchmark.simultaneousPersonaCount,
      ...browser.witness.benchmark,
    },
    temporal: {
      implementation: plan.temporalAccumulation.implementation,
      mode: plan.temporalAccumulation.mode,
      ...browser.witness.taa,
      historyResets: browser.witness.historyResets,
    },
    render: {
      hero: {
        path: path.relative(root, browser.heroPath).replaceAll('\\', '/'),
        sha256: sha256(browser.heroBuffer),
        bytes: browser.heroBuffer.length,
        dimensions: [2400, 900],
      },
      expressions: {
        path: path
          .relative(root, browser.expressionPath)
          .replaceAll('\\', '/'),
        sha256: sha256(browser.expressionBuffer),
        bytes: browser.expressionBuffer.length,
        dimensions: [2400, 900],
      },
      lods: {
        path: path.relative(root, browser.lodPath).replaceAll('\\', '/'),
        sha256: sha256(browser.lodBuffer),
        bytes: browser.lodBuffer.length,
        dimensions: [2400, 600],
      },
      taaConvergence: {
        path: path.relative(root, browser.taaPath).replaceAll('\\', '/'),
        sha256: sha256(browser.taaBuffer),
        bytes: browser.taaBuffer.length,
        dimensions: [2400, 600],
      },
      browser: browser.browserVersion,
      renderer: browser.witness.renderer,
      externalRequests,
      pageErrors: browser.pageErrors,
      consoleErrors: browser.consoleErrors,
    },
    bridge: {
      route:
        'HoloScript H3B .holo/.hsplus/.hs -> sovereign character-webgpu native drawspecs -> source-authored hair LOD + procedural-head morphs -> HoloScript LODManager -> Three PBR/WebGL2 D3D11 presentation -> static TAA32 measurement',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      externalAssets: [],
      secondLodAuthority: false,
    },
    boundaries: {
      nativeChannelH3BAdmitted: true,
      fullH3Claimed: false,
      publicFirstReleaseReplacementClaimed: false,
      nativeSubsurfaceScatteringClaimedByBrowser: false,
      productionFaceCompleteClaimed: false,
      productionHairCompleteClaimed: false,
      normalsRecomputedAfterMorphClaimed: false,
      motionReprojectionClaimed: false,
      productionTaaClaimed: false,
      adapterFamilyBinding: 'absent',
      researchSeatBinding: 'absent',
      liveResearchJoinAllowed: false,
      faceTrackingEnabledByDefault: false,
      eyeTrackingEnabledByDefault: false,
      biometricPersistenceAllowed: false,
      canonicalWritesAllowed: false,
      residentObservationWritesAllowed: false,
      modelCalls: 0,
      networkFetches: 0,
      photorealismClaimed: false,
      headsetPerformanceClaimed: false,
      fullWorldConvergenceClaimed: false,
    },
    manifest,
    checks,
    failures,
  };
  const receiptHash = sha256(canonicalJson(receiptCore));
  const receipt = { ...receiptCore, receiptHash };
  const receiptPath = path.join(
    outputDir,
    'character-appearance-h3b-witness.json',
  );
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (normalized.reportOutput) {
    mkdirSync(path.dirname(normalized.reportOutput), { recursive: true });
    writeFileSync(normalized.reportOutput, reportMarkdown(receipt), 'utf8');
  }
  return {
    receipt,
    receiptPath,
    heroPath: browser.heroPath,
    expressionPath: browser.expressionPath,
    lodPath: browser.lodPath,
    taaPath: browser.taaPath,
    reportPath: normalized.reportOutput,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  runCharacterAppearanceH3B(parseArgs())
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            status: result.receipt.status,
            receiptHash: result.receipt.receiptHash,
            receiptPath: result.receiptPath,
            heroPath: result.heroPath,
            expressionPath: result.expressionPath,
            lodPath: result.lodPath,
            taaPath: result.taaPath,
            reportPath: result.reportPath,
            renderer: result.receipt.render.renderer.unmaskedRenderer,
            rafP95Milliseconds: result.receipt.performance.raf.p95,
            renderSubmitP95Milliseconds:
              result.receipt.performance.renderSubmit.p95,
            droppedFrameRatio:
              result.receipt.performance.droppedFrameRatio,
            fullH3Claimed: result.receipt.boundaries.fullH3Claimed,
            failures: result.receipt.failures,
          },
          null,
          2,
        ),
      );
      if (result.receipt.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
