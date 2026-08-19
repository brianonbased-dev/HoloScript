#!/usr/bin/env node
/* global document, performance, process, requestAnimationFrame, window */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3j-civic-landmarks.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3j-civic-landmarks-policy.hsplus';
const SEED_REL = 'source/proofs/model-village-character-appearance-h3j-civic-landmarks-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3j-civic-landmarks-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3j-civic-landmarks-2026-07-28.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3j-civic-landmarks-portraits-2026-07-28.png';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3j';
const EXPECTED_COMMIT = 'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2';
const EXPECTED_PERSONAS = ['hearth_keeper', 'path_tender', 'record_steward'];
// H4J widened the hair receipt to holoscript.agent-avatar-hair-material.v2, which discloses
// sourceColorWeight: the share of the AUTHORED hair colour that survives the melanin response.
// Upstream used to impose DEFAULT_HAIR_SOURCE_COLOR_WEIGHT on every bundle - HoloLand chose the
// colour, the engine chose how much of it survived, and nothing in this composition authored or
// witnessed that. HoloScript b3d031dd4 made it authorable as @hair(source_color_weight), so H3J
// now AUTHORS three distinct weights, none equal to the upstream default, and requires each to
// round-trip into the receipt AND to appear in the compiler's mapped report. A weight equal to
// the default would pass by coincidence even if upstream silently discarded the key, so the
// distinctness and non-default checks below are what make this assertion mean anything.
const UPSTREAM_DEFAULT_HAIR_SOURCE_COLOR_WEIGHT = 0.55;
const EXPECTED_HAIR_RECEIPT_SCHEMA = 'holoscript.agent-avatar-hair-material.v2';
const HASH_BINDINGS = [
  ['inheritedH3ISource', 'inheritedH3ISourceSha256', 'hololand'],
  ['upstreamGarmentBuilderPath', 'upstreamGarmentBuilderSha256', 'holoscript'],
  ['upstreamGroomBuilderPath', 'upstreamGroomBuilderSha256', 'holoscript'],
  ['upstreamFaceBuilderPath', 'upstreamFaceBuilderSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamNativeRendererPath', 'upstreamNativeRendererSha256', 'holoscript'],
  ['upstreamDrawSpecPath', 'upstreamDrawSpecSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
];

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
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function properties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value])
  );
}

// Delegates to the shared validator. The private gitHasCommit() this replaced asserted
// "ancestor of HEAD", which accepted a commit that existed only on one laptop and
// rejected a reproducible one whenever a peer left the shared checkout on a branch.
function upstreamPinFailures(holoScriptRoot, metadata) {
  return validateUpstreamCommitPin(
    holoScriptRoot,
    metadata.upstreamHoloScriptCommit,
    HASH_BINDINGS
      .filter(([, , owner]) => owner === 'holoscript')
      .map(([pathKey, hashKey]) => ({
        pathKey,
        relative: metadata[pathKey],
        sha256: metadata[hashKey],
      })),
  ).errors;
}

async function loadCore(holoScriptRoot) {
  return import(pathToFileURL(path.join(holoScriptRoot, 'packages/core/dist/index.js')).href);
}

export async function parseH3JStack(root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3J .holo', source],
    ['H3J .hsplus', policy],
    ['H3J .hs', seed],
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
      state: properties(source.ast.state),
      environment: properties(source.ast.environment),
      objects: (source.ast.objects || []).map((object) => ({
        objectId: object.name,
        ...properties(object),
      })),
    },
  };
}

export function buildH3JPlan(contract) {
  return {
    milestone: contract.metadata.milestone,
    personas: contract.objects
      .filter((object) => object.type === 'native_civic_landmark_persona')
      .map((persona) => ({
        objectId: persona.objectId,
        personaId: persona.personaId,
        civicRole: persona.civicRole,
        displayLabel: persona.displayLabel,
        eyeScale: persona.eyeScale,
        browHeight: persona.browHeight,
        browThickness: persona.browThickness,
        earScale: persona.earScale,
        mouthDepth: persona.mouthDepth,
        clusterCount: persona.clusterCount,
        clusterSpread: persona.clusterSpread,
        hairSourceColorWeight: persona.hairSourceColorWeight,
        irisColor: persona.irisColor,
        hairColor: persona.hairColor,
        wardrobeColor: persona.wardrobeColor,
      })),
  };
}

export function validateH3JContract(stack, root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state } = stack.contract;
  expect(metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3J_CIVIC_LANDMARKS', 'milestone drifted');
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'upstream commit pin drifted');
  for (const [key, expected] of [
    ['nativeCharacterCompilerClaimed', true],
    ['nativeOpenCivicGarmentClaimed', true],
    ['nativeGarmentReceiptClaimed', true],
    ['nativeCivicLandmarksClaimed', true],
    ['nativeFacialLandmarkReceiptClaimed', true],
    ['nativeReducedOcularScaleClaimed', true],
    ['nativeRecessedLidsClaimed', true],
    ['nativeBrowsClaimed', true],
    ['nativeEarsClaimed', true],
    ['nativeLipsClaimed', true],
    ['nativeGroomClustersClaimed', true],
    ['nativeGroomReceiptClaimed', true],
    ['nativeLodTransitionReceiptClaimed', true],
    ['presentationShaderOverrideUsed', false],
    ['presentationMaterialBridgeUsed', true],
    ['presentationHairMaterialBridgeUsed', true],
    ['presentationSkinMicrodetailBridgeUsed', true],
    ['presentationWardrobeBridgeUsed', false],
    ['presentationNativeTorsoClipUsed', false],
    ['presentationTaaBridgeUsed', true],
    ['externalSkinTextureUsed', false],
    ['externalHairTextureUsed', false],
    ['externalWardrobeTextureUsed', false],
    ['strandHairClaimed', false],
    ['productionGroomClaimed', false],
    ['productionSkinTexturingClaimed', false],
    ['biometricLikenessClaimed', false],
    ['photorealismClaimed', false],
    ['motionReprojectionClaimed', false],
    ['nativeWebgpuTaaClaimed', false],
    ['questWebxrMeasured', false],
    ['vrPerformanceConvergenceClaimed', false],
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
    state.civicLandmarkFoundation?.garmentStyle === 'stormglass-open-civic-tunic' &&
      state.civicLandmarkFoundation?.garmentReceiptSchema ===
        'holoscript.agent-avatar-garment-geometry.v1' &&
      state.civicLandmarkFoundation?.faceProfile === 'civic-landmarks-v1' &&
      state.civicLandmarkFoundation?.faceReceiptSchema ===
        'holoscript.agent-avatar-facial-landmarks.v1' &&
      state.civicLandmarkFoundation?.groomProfile === 'scalp-flow-v1' &&
      state.civicLandmarkFoundation?.groomReceiptSchema ===
        'holoscript.agent-avatar-groom-geometry.v1' &&
      JSON.stringify(state.civicLandmarkFoundation?.eyeScaleRange) ===
        JSON.stringify([0.8, 0.84]) &&
      JSON.stringify(state.civicLandmarkFoundation?.browHeightRange) ===
        JSON.stringify([1.16, 1.3]) &&
      JSON.stringify(state.civicLandmarkFoundation?.browThicknessRange) ===
        JSON.stringify([0.17, 0.2]) &&
      JSON.stringify(state.civicLandmarkFoundation?.earScaleRange) === JSON.stringify([1, 1.08]) &&
      JSON.stringify(state.civicLandmarkFoundation?.mouthDepthRange) ===
        JSON.stringify([0.76, 0.94]) &&
      JSON.stringify(state.civicLandmarkFoundation?.clusterCountRange) ===
        JSON.stringify([12, 16]) &&
      JSON.stringify(state.civicLandmarkFoundation?.clusterSpreadRange) ===
        JSON.stringify([0.36, 0.48]) &&
      JSON.stringify(state.civicLandmarkFoundation?.hairSourceColorWeightRange) ===
        JSON.stringify([0.44, 0.68]) &&
      state.civicLandmarkFoundation?.openFaceRequired === true &&
      state.civicLandmarkFoundation?.nativeWardrobeRequired === true &&
      state.civicLandmarkFoundation?.presentationWardrobeBridge === false &&
      state.civicLandmarkFoundation?.nativeTorsoClip === false,
    'civic landmark foundation drifted'
  );
  // nativeLodTransitionReceiptClaimed has been true since H3J was authored, but nothing read
  // bundle.lod.transition. An authored claim with no witness is not a proof, so the authored
  // @lod(fade_mode/fade_duration_ms/hysteresis/mode) controls are now named here and required
  // to round-trip into the native receipt below.
  expect(
    state.lodTransitionFoundation?.receiptSchema === 'holoscript.character-lod-transition.v1' &&
      state.lodTransitionFoundation?.selectionMode === 'distance' &&
      state.lodTransitionFoundation?.fadeMode === 'dither' &&
      state.lodTransitionFoundation?.fadeDurationSeconds === 0.26 &&
      state.lodTransitionFoundation?.fadeDurationMilliseconds === 260 &&
      state.lodTransitionFoundation?.hysteresisBand === 0.65,
    'lod transition foundation drifted'
  );
  expect(
    state.temporalPresentationFoundation?.sharedRendererCount === 1 &&
      state.temporalPresentationFoundation?.sharedSceneCount === 1 &&
      state.temporalPresentationFoundation?.temporalComposerCount === 1 &&
      state.temporalPresentationFoundation?.temporalBridge === 'three-taarenderpass-v1' &&
      state.temporalPresentationFoundation?.temporalSampleLevel === 0 &&
      state.temporalPresentationFoundation?.accumulationFrames === 32 &&
      state.temporalPresentationFoundation?.internalRenderWidth === 1458 &&
      state.temporalPresentationFoundation?.internalRenderHeight === 486 &&
      state.temporalPresentationFoundation?.presentationWidth === 1800 &&
      state.temporalPresentationFoundation?.presentationHeight === 720 &&
      state.temporalPresentationFoundation?.internalRenderScale === 0.81 &&
      state.temporalPresentationFoundation?.historyPolicy === 'invalidate-on-camera-motion-v1' &&
      state.temporalPresentationFoundation?.motionVectorsAvailable === false &&
      state.temporalPresentationFoundation?.motionReprojection === false &&
      state.temporalPresentationFoundation?.nativeWebgpuTaa === false &&
      state.temporalPresentationFoundation?.presentationBridge === true,
    'temporal presentation foundation drifted'
  );
  expect(
    state.nativeAdmission?.compilerTarget === 'character-webgpu' &&
      state.nativeAdmission?.outputFormat === 'character-webgpu/drawspec' &&
      state.nativeAdmission?.fallbackAllowed === false &&
      state.nativeAdmission?.exactThreeNativeBundlesRequired === true &&
      state.nativeAdmission?.exactEightOcularGroupsPerBundleRequired === true &&
      state.nativeAdmission?.exactThreeFacialLandmarkReceiptsRequired === true &&
      state.nativeAdmission?.exactThreeGarmentReceiptsRequired === true &&
      state.nativeAdmission?.exactThreeClusteredGroomReceiptsRequired === true &&
      state.nativeAdmission?.exactThreeAuthoredHairChromaWeightsRequired === true &&
      state.nativeAdmission?.exactThreeLodTransitionReceiptsRequired === true &&
      state.nativeAdmission?.strippedFacialLandmarkDeltaRequired === true &&
      state.nativeAdmission?.strippedGarmentDeltaRequired === true &&
      state.nativeAdmission?.strippedClusterDeltaRequired === true &&
      state.nativeAdmission?.repeatedCompileByteIdentityRequired === true,
    'native admission drifted'
  );
  const plan = buildH3JPlan(stack.contract);
  expect(
    JSON.stringify(plan.personas.map((persona) => persona.personaId)) ===
      JSON.stringify(EXPECTED_PERSONAS),
    'persona order drifted'
  );
  expect(plan.personas.length === 3, 'persona count drifted');
  for (const persona of plan.personas) {
    const object = stack.source.ast.objects?.find(
      (candidate) => candidate.name === persona.objectId
    );
    const face = object?.traits?.find((trait) => trait.name === 'face');
    const hair = object?.traits?.find((trait) => trait.name === 'hair');
    const clothing = object?.traits?.find((trait) => trait.name === 'clothing');
    const lod = object?.traits?.find((trait) => trait.name === 'lod');
    expect(
      face?.config?.facial_detail_profile === 'civic_landmarks_v1' &&
        face?.config?.eye_scale === persona.eyeScale &&
        face?.config?.brow_height === persona.browHeight &&
        face?.config?.brow_thickness === persona.browThickness &&
        face?.config?.ear_scale === persona.earScale &&
        face?.config?.mouth_depth === persona.mouthDepth,
      `${persona.personaId} source-authored facial controls drifted`
    );
    expect(
      hair?.config?.groom_profile === 'scalp_flow_v1' &&
        hair?.config?.cluster_count === persona.clusterCount &&
        hair?.config?.cluster_spread === persona.clusterSpread,
      `${persona.personaId} source-authored groom clusters drifted`
    );
    expect(
      clothing?.config?.style === 'stormglass_open_civic_tunic' &&
        clothing?.config?.color === persona.wardrobeColor,
      `${persona.personaId} source-authored open garment drifted`
    );
    const chromaRange = state.civicLandmarkFoundation?.hairSourceColorWeightRange || [];
    expect(
      hair?.config?.source_color_weight === persona.hairSourceColorWeight &&
        typeof persona.hairSourceColorWeight === 'number' &&
        persona.hairSourceColorWeight >= chromaRange[0] &&
        persona.hairSourceColorWeight <= chromaRange[1] &&
        persona.hairSourceColorWeight !== UPSTREAM_DEFAULT_HAIR_SOURCE_COLOR_WEIGHT,
      `${persona.personaId} source-authored hair chroma weight drifted`
    );
    expect(
      lod?.config?.mode === state.lodTransitionFoundation?.selectionMode &&
        lod?.config?.fade_mode === state.lodTransitionFoundation?.fadeMode &&
        lod?.config?.fade_duration_ms === state.lodTransitionFoundation?.fadeDurationMilliseconds &&
        lod?.config?.hysteresis === state.lodTransitionFoundation?.hysteresisBand,
      `${persona.personaId} source-authored lod transition drifted`
    );
  }
  // Three DISTINCT weights: if upstream ever reverts to imposing one value, or silently drops the
  // authored key, at least two personas disagree with their own source and the compile check below
  // fails. A single shared weight - or one equal to the upstream default - could not do that.
  expect(
    new Set(plan.personas.map((persona) => persona.hairSourceColorWeight)).size ===
      plan.personas.length,
    'authored hair chroma weights are not distinct per persona'
  );
  for (const [pathKey, hashKey, owner] of HASH_BINDINGS) {
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
  return { status: errors.length ? 'fail' : 'pass', errors, plan };
}

async function exportBundle(core, ast, objectId) {
  return new core.ExportManager({
    useCircuitBreaker: false,
    useFallback: false,
    useMemoryMonitoring: false,
  }).export('character-webgpu', ast, {
    compilerOptions: {
      objectId,
      entityId: `model-village-h3j-${objectId.toLowerCase()}`,
      lodLevel: 0,
    },
  });
}

function withoutTraitControls(ast, traitName, keys) {
  const copy = structuredClone(ast);
  for (const object of copy.objects || []) {
    const trait = object.traits?.find((candidate) => candidate.name === traitName);
    if (!trait) continue;
    for (const key of keys) delete trait.config[key];
  }
  return copy;
}

function withoutFacialLandmarks(ast) {
  return withoutTraitControls(ast, 'face', [
    'facial_detail_profile',
    'eye_scale',
    'brow_height',
    'brow_thickness',
    'ear_scale',
    'mouth_depth',
  ]);
}

function withoutGroomClusters(ast) {
  return withoutTraitControls(ast, 'hair', ['cluster_count', 'cluster_spread']);
}

function withoutOpenGarment(ast) {
  const copy = structuredClone(ast);
  for (const object of copy.objects || []) {
    object.traits = object.traits?.filter((trait) => trait.name !== 'clothing');
  }
  return copy;
}

function meshSha(bundle) {
  return sha256(JSON.stringify(canonical(bundle.mesh)));
}

export async function compileH3JCivicBundles(stack, plan) {
  const records = [];
  const lodFoundation = stack.contract.state.lodTransitionFoundation;
  for (const persona of plan.personas) {
    const authoredResult = await exportBundle(stack.core, stack.source.ast, persona.objectId);
    const repeatResult = await exportBundle(stack.core, stack.source.ast, persona.objectId);
    const facialResult = await exportBundle(
      stack.core,
      withoutFacialLandmarks(stack.source.ast),
      persona.objectId
    );
    const clusterResult = await exportBundle(
      stack.core,
      withoutGroomClusters(stack.source.ast),
      persona.objectId
    );
    const garmentResult = await exportBundle(
      stack.core,
      withoutOpenGarment(stack.source.ast),
      persona.objectId
    );
    for (const [label, result] of [
      ['authored', authoredResult],
      ['repeat', repeatResult],
      ['facial baseline', facialResult],
      ['cluster baseline', clusterResult],
      ['garment baseline', garmentResult],
    ]) {
      if (!result.success || result.usedFallback) {
        throw new Error(`${persona.personaId} ${label} compile failed`);
      }
    }
    if (authoredResult.output !== repeatResult.output) {
      throw new Error(`${persona.personaId} repeated compile was not byte-identical`);
    }
    const bundle = JSON.parse(authoredResult.output);
    const facialBaseline = JSON.parse(facialResult.output);
    const clusterBaseline = JSON.parse(clusterResult.output);
    const garmentBaseline = JSON.parse(garmentResult.output);
    const eyeGroups = bundle.materialGroups.filter(
      (group) => group.material.shadingModel === 'refractive-eye'
    );
    const hairGroups = bundle.materialGroups.filter(
      (group) => group.material.shadingModel === 'marschner-hair'
    );
    const clothGroups = bundle.materialGroups.filter(
      (group) => group.material.shadingModel === 'woven-cloth'
    );
    if (
      bundle.format !== 'character-webgpu/drawspec' ||
      bundle.facialLandmarks?.schemaVersion !== 'holoscript.agent-avatar-facial-landmarks.v1' ||
      bundle.facialLandmarks?.profile !== 'civic-landmarks-v1' ||
      bundle.facialLandmarks?.eyeScale !== persona.eyeScale ||
      bundle.facialLandmarks?.browHeight !== persona.browHeight ||
      bundle.facialLandmarks?.browThickness !== persona.browThickness ||
      bundle.facialLandmarks?.earScale !== persona.earScale ||
      bundle.facialLandmarks?.mouthDepth !== persona.mouthDepth ||
      bundle.garment?.schemaVersion !== 'holoscript.agent-avatar-garment-geometry.v1' ||
      bundle.garment?.style !== 'stormglass_open_civic_tunic' ||
      bundle.garment?.faceCoverage !== 'open-v-collar' ||
      bundle.garment?.visorVertexCount !== 0 ||
      bundle.garment?.visorTriangleCount !== 0 ||
      bundle.garment?.clothVertexCount <= 0 ||
      bundle.groom?.schemaVersion !== 'holoscript.agent-avatar-groom-geometry.v1' ||
      bundle.groom?.profile !== 'scalp-flow-v1' ||
      bundle.groom?.clusterCount !== persona.clusterCount ||
      bundle.groom?.clusterSpread !== persona.clusterSpread ||
      bundle.groom?.material?.schemaVersion !== EXPECTED_HAIR_RECEIPT_SCHEMA ||
      bundle.groom?.material?.sourceColorWeight !== persona.hairSourceColorWeight ||
      hairGroups[0]?.material?.sourceColorWeight !== persona.hairSourceColorWeight ||
      !bundle.report?.mapped?.includes(
        `@hair(source_color_weight=${persona.hairSourceColorWeight})`
      ) ||
      bundle.lod?.transition?.schemaVersion !== lodFoundation?.receiptSchema ||
      bundle.lod?.transition?.selectionMode !== lodFoundation?.selectionMode ||
      bundle.lod?.transition?.mode !== lodFoundation?.fadeMode ||
      bundle.lod?.transition?.durationSeconds !== lodFoundation?.fadeDurationSeconds ||
      bundle.lod?.transition?.hysteresisBand !== lodFoundation?.hysteresisBand ||
      bundle.face?.eyeScale !== persona.eyeScale ||
      bundle.face?.orbitalProfile !== 'recessed-lids-v1' ||
      bundle.face?.ocularProfile !== 'layered-ocular-v1' ||
      eyeGroups.length !== 8 ||
      hairGroups.length !== 1 ||
      clothGroups.length !== 1 ||
      bundle.report?.stubbed?.length !== 0
    ) {
      throw new Error(`${persona.personaId} native civic receipt contract drifted`);
    }
    const authoredMeshSha = meshSha(bundle);
    const facialBaselineMeshSha = meshSha(facialBaseline);
    const clusterBaselineMeshSha = meshSha(clusterBaseline);
    const garmentBaselineMeshSha = meshSha(garmentBaseline);
    if (
      facialBaseline.facialLandmarks !== undefined ||
      facialBaseline.vertexCount >= bundle.vertexCount ||
      facialBaselineMeshSha === authoredMeshSha ||
      clusterBaseline.groom?.clusterCount !== undefined ||
      clusterBaselineMeshSha === authoredMeshSha ||
      garmentBaseline.garment !== undefined ||
      garmentBaseline.vertexCount >= bundle.vertexCount ||
      garmentBaselineMeshSha === authoredMeshSha
    ) {
      throw new Error(`${persona.personaId} stripped-control causal delta failed`);
    }
    records.push({
      ...persona,
      bundle,
      geometrySha256: authoredMeshSha,
      repeatedCompileSha256: sha256(authoredResult.output),
      comparisons: {
        facialLandmarks: {
          baselineReceiptAbsent: true,
          vertexDelta: bundle.vertexCount - facialBaseline.vertexCount,
          geometryChanged: true,
          baselineGeometrySha256: facialBaselineMeshSha,
        },
        groomClusters: {
          baselineReceiptClusterAbsent: true,
          vertexDelta: bundle.vertexCount - clusterBaseline.vertexCount,
          geometryChanged: true,
          baselineGeometrySha256: clusterBaselineMeshSha,
        },
        openGarment: {
          baselineReceiptAbsent: true,
          vertexDelta: bundle.vertexCount - garmentBaseline.vertexCount,
          geometryChanged: true,
          baselineGeometrySha256: garmentBaselineMeshSha,
        },
      },
    });
  }
  return { records };
}

function browserBundle(bundle) {
  return {
    vertexCount: bundle.vertexCount,
    mesh: bundle.mesh,
    jointMatrices: bundle.jointMatrices,
    materialGroups: bundle.materialGroups,
    face: bundle.face,
    facialLandmarks: bundle.facialLandmarks,
    garment: bundle.garment,
    groom: bundle.groom,
    skin: bundle.skin,
  };
}

function h3jBrowserApplication(
  THREE,
  RoomEnvironment,
  EffectComposer,
  TAARenderPass,
  OutputPass,
  payload
) {
  const host = document.getElementById('portraits');
  const gpu = {};
  const materialReceipts = [];
  const sharedCanvas = document.createElement('canvas');
  sharedCanvas.className = 'shared-stage-canvas';
  sharedCanvas.setAttribute('aria-label', 'Three native civic landmark residents');
  host.append(sharedCanvas);
  const renderer = new THREE.WebGLRenderer({
    canvas: sharedCanvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setSize(1458, 486, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const timerExtension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  gpu.renderer = debug
    ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  gpu.vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  gpu.version = gl.getParameter(gl.VERSION);
  gpu.samples = gl.getParameter(gl.SAMPLES);
  gpu.antialias = renderer.getContextAttributes()?.antialias === true;
  gpu.timerQueryAvailable = Boolean(timerExtension);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030a13);
  scene.fog = new THREE.FogExp2(0x030a13, 0.18);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.72;
  scene.add(new THREE.HemisphereLight(0x9bcbd8, 0x160b08, 0.62));
  const key = new THREE.DirectionalLight(0xffd5bd, 1.85);
  key.position.set(1.6, 2.6, 2.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x4eb9d0, 0.72);
  fill.position.set(-2.2, 1.9, 1.3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff8e58, 1.18);
  rim.position.set(0.5, 2.2, -1.8);
  scene.add(rim);
  const hairKey = new THREE.DirectionalLight(0xffc0a1, 0.78);
  hairKey.position.set(-0.35, 3.8, 1.1);
  scene.add(hairKey);

  const camera = new THREE.PerspectiveCamera(24, 1458 / 486, 0.05, 20);
  const composer = new EffectComposer(renderer);
  composer.setSize(1458, 486);
  const taa = new TAARenderPass(scene, camera, 0x030a13, 1);
  taa.sampleLevel = 0;
  taa.accumulate = false;
  composer.addPass(taa);
  composer.addPass(new OutputPass());

  function dataTexture(kind, colorHex) {
    const width = kind === 'skin' ? 128 : 96;
    const height = kind === 'hair' || kind === 'hair-alpha' ? 128 : 96;
    const data = new Uint8Array(width * height * 4);
    const base = new THREE.Color(colorHex);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const u = x / (width - 1);
        const v = y / (height - 1);
        let value = 1;
        let alpha = 1;
        if (kind === 'hair' || kind === 'hair-alpha') {
          const edge = Math.abs(u * 2 - 1);
          alpha = 1 - THREE.MathUtils.smoothstep(edge, 0.7 + (1 - v) * 0.12, 0.96);
          value = 0.79 + 0.17 * Math.pow(0.5 + 0.5 * Math.sin(x * 1.37 + y * 0.21), 5);
        } else if (kind === 'skin') {
          value = 0.72 + 0.17 * Math.sin(x * 1.73 + y * 0.61) + 0.1 * Math.sin(x * 0.43 - y * 1.37);
        } else {
          value =
            0.82 +
            (x % 6 === 0 ? 0.12 : 0) +
            (y % 6 === 0 ? 0.09 : 0) +
            0.025 * Math.sin(x * 1.7 + y * 0.47);
        }
        data[index] = Math.round(
          Math.min(
            1,
            Math.max(0, kind === 'hair' ? value : kind === 'hair-alpha' ? alpha : base.r * value)
          ) * 255
        );
        data[index + 1] = Math.round(
          Math.min(
            1,
            Math.max(0, kind === 'hair' ? value : kind === 'hair-alpha' ? alpha : base.g * value)
          ) * 255
        );
        data[index + 2] = Math.round(
          Math.min(
            1,
            Math.max(0, kind === 'hair' ? value : kind === 'hair-alpha' ? alpha : base.b * value)
          ) * 255
        );
        data[index + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
      }
    }
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.wrapS =
      kind === 'hair' || kind === 'hair-alpha' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    texture.wrapT =
      kind === 'hair' || kind === 'hair-alpha' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  function geometryFromBundle(bundle) {
    const positions = new Float32Array(bundle.mesh.positions);
    const normals = new Float32Array(bundle.mesh.normals);
    for (let vertex = 0; vertex < bundle.vertexCount; vertex += 1) {
      const joint = bundle.mesh.jointIndices[vertex];
      const weight = bundle.mesh.jointWeights[vertex];
      const matrix = joint * 16;
      const position = vertex * 3;
      const x = positions[position];
      const y = positions[position + 1];
      const z = positions[position + 2];
      positions[position] =
        (bundle.jointMatrices[matrix] * x +
          bundle.jointMatrices[matrix + 4] * y +
          bundle.jointMatrices[matrix + 8] * z +
          bundle.jointMatrices[matrix + 12]) *
        weight;
      positions[position + 1] =
        (bundle.jointMatrices[matrix + 1] * x +
          bundle.jointMatrices[matrix + 5] * y +
          bundle.jointMatrices[matrix + 9] * z +
          bundle.jointMatrices[matrix + 13]) *
        weight;
      positions[position + 2] =
        (bundle.jointMatrices[matrix + 2] * x +
          bundle.jointMatrices[matrix + 6] * y +
          bundle.jointMatrices[matrix + 10] * z +
          bundle.jointMatrices[matrix + 14]) *
        weight;
      const nx = normals[position];
      const ny = normals[position + 1];
      const nz = normals[position + 2];
      const tx =
        bundle.jointMatrices[matrix] * nx +
        bundle.jointMatrices[matrix + 4] * ny +
        bundle.jointMatrices[matrix + 8] * nz;
      const ty =
        bundle.jointMatrices[matrix + 1] * nx +
        bundle.jointMatrices[matrix + 5] * ny +
        bundle.jointMatrices[matrix + 9] * nz;
      const tz =
        bundle.jointMatrices[matrix + 2] * nx +
        bundle.jointMatrices[matrix + 6] * ny +
        bundle.jointMatrices[matrix + 10] * nz;
      const length = Math.hypot(tx, ty, tz) || 1;
      normals[position] = tx / length;
      normals[position + 1] = ty / length;
      normals[position + 2] = tz / length;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const uvs = new Float32Array(bundle.mesh.uvs || bundle.vertexCount * 2);
    const skinVertices = new Set();
    for (const group of bundle.materialGroups) {
      if (group.material.shadingModel !== 'skin-sss') continue;
      for (
        let offset = group.indexStart;
        offset < group.indexStart + group.indexCount;
        offset += 1
      ) {
        skinVertices.add(bundle.mesh.indices[offset]);
      }
    }
    let skinMinY = Number.POSITIVE_INFINITY;
    let skinMaxY = Number.NEGATIVE_INFINITY;
    for (const vertex of skinVertices) {
      const y = positions[vertex * 3 + 1];
      skinMinY = Math.min(skinMinY, y);
      skinMaxY = Math.max(skinMaxY, y);
    }
    for (const vertex of skinVertices) {
      const position = vertex * 3;
      const uv = vertex * 2;
      uvs[uv] = 0.5 + Math.atan2(positions[position + 2], positions[position]) / (Math.PI * 2);
      uvs[uv + 1] = (positions[position + 1] - skinMinY) / Math.max(1e-6, skinMaxY - skinMinY);
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(bundle.mesh.indices), 1));
    const presentationGroups = [];
    for (const group of bundle.materialGroups) {
      if (
        group.material.shadingModel === 'marschner-hair' &&
        bundle.groom.scalpCapTriangleCount > 0
      ) {
        const capIndexCount = bundle.groom.scalpCapTriangleCount * 3;
        geometry.addGroup(group.indexStart, capIndexCount, presentationGroups.length);
        presentationGroups.push({ group, hairRegion: 'cap' });
        geometry.addGroup(
          group.indexStart + capIndexCount,
          group.indexCount - capIndexCount,
          presentationGroups.length
        );
        presentationGroups.push({ group, hairRegion: 'cards' });
      } else {
        geometry.addGroup(group.indexStart, group.indexCount, presentationGroups.length);
        presentationGroups.push({ group, hairRegion: null });
      }
    }
    geometry.userData.presentationGroups = presentationGroups;
    geometry.userData.groupBounds = bundle.materialGroups.map((group) => {
      const bounds = {
        shadingModel: group.material.shadingModel,
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        minZ: Number.POSITIVE_INFINITY,
        maxZ: Number.NEGATIVE_INFINITY,
      };
      for (
        let offset = group.indexStart;
        offset < group.indexStart + group.indexCount;
        offset += 1
      ) {
        const vertex = bundle.mesh.indices[offset] * 3;
        bounds.minX = Math.min(bounds.minX, positions[vertex]);
        bounds.maxX = Math.max(bounds.maxX, positions[vertex]);
        bounds.minY = Math.min(bounds.minY, positions[vertex + 1]);
        bounds.maxY = Math.max(bounds.maxY, positions[vertex + 1]);
        bounds.minZ = Math.min(bounds.minZ, positions[vertex + 2]);
        bounds.maxZ = Math.max(bounds.maxZ, positions[vertex + 2]);
      }
      return bounds;
    });
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function materialFor(group, record, hairRegion) {
    const material = group.material;
    if (material.shadingModel === 'marschner-hair') {
      const map = dataTexture('hair', record.hairColor);
      if (hairRegion === 'cap') {
        return new THREE.MeshPhysicalMaterial({
          color: record.hairColor,
          map,
          roughness: 0.62,
          sheen: 0.16,
          sheenRoughness: 0.72,
          sheenColor: new THREE.Color(record.hairColor),
          specularIntensity: 0.24,
          envMapIntensity: 0.34,
          side: THREE.DoubleSide,
        });
      }
      const response = new THREE.MeshPhysicalMaterial({
        color: record.hairColor,
        map,
        alphaMap: dataTexture('hair-alpha', 0xffffff),
        alphaTest: 0.02,
        alphaToCoverage: true,
        roughness: 0.58,
        anisotropy: material.anisotropyStrength,
        anisotropyRotation: material.longitudinalShift * Math.PI,
        sheen: 0.22,
        sheenRoughness: 0.62,
        sheenColor: new THREE.Color(record.hairColor),
        specularIntensity: 0.28,
        envMapIntensity: 0.4,
        side: THREE.DoubleSide,
      });
      return response;
    }
    if (material.shadingModel === 'refractive-eye') {
      if (material.eyeRegion === 'cornea') {
        return new THREE.MeshPhysicalMaterial({
          color: material.color,
          roughness: 0.04,
          transparent: true,
          opacity: 0.08,
          ior: material.ior,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          envMapIntensity: 0.84,
          depthWrite: false,
        });
      }
      const isIris = material.eyeRegion === 'iris';
      const isPupil = material.eyeRegion === 'pupil';
      return new THREE.MeshPhysicalMaterial({
        color: material.color,
        roughness: isPupil ? 0.15 : isIris ? 0.27 : 0.5,
        clearcoat: isPupil ? 0.72 : isIris ? 0.38 : 0.1,
        clearcoatRoughness: 0.12,
        envMapIntensity: 0.76,
      });
    }
    if (material.shadingModel === 'skin-sss') {
      const skinMap = dataTexture('skin', material.color);
      skinMap.colorSpace = THREE.NoColorSpace;
      skinMap.repeat.set(12, 18);
      const skin = new THREE.MeshPhysicalMaterial({
        color: material.color,
        roughness: 0.7,
        bumpMap: skinMap,
        bumpScale: (material.microdetailStrength || 0.07) * 0.04,
        clearcoat: 0.035,
        clearcoatRoughness: 0.6,
        sheen: 0.14,
        sheenRoughness: 0.7,
        sheenColor: new THREE.Color(material.color).lerp(new THREE.Color(0xffd6c5), 0.28),
        specularIntensity: 0.46,
        envMapIntensity: 0.5,
      });
      materialReceipts.push({
        personaId: record.personaId,
        role: 'skin',
        nativeGeometry: true,
        proceduralMaterialBridge: true,
        nativeTorsoClipUsed: false,
        externalTexture: false,
      });
      return skin;
    }
    if (material.shadingModel === 'woven-cloth') {
      const cloth = new THREE.MeshPhysicalMaterial({
        color: material.color,
        map: dataTexture('cloth', material.color),
        roughness: 0.8,
        sheen: 0.36,
        sheenRoughness: 0.7,
        sheenColor: new THREE.Color(material.color).lerp(new THREE.Color(0x9fc3c8), 0.28),
        envMapIntensity: 0.46,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: true,
      });
      materialReceipts.push({
        personaId: record.personaId,
        role: 'garment',
        nativeGeometry: true,
        nativeStyle: record.bundle.garment.style,
        faceCoverage: record.bundle.garment.faceCoverage,
        presentationWardrobeGeometryBridge: false,
        proceduralMaterialBridge: true,
        externalTexture: false,
      });
      return cloth;
    }
    return new THREE.MeshPhysicalMaterial({
      color: material.color,
      roughness: 0.58,
      clearcoat: 0.04,
      envMapIntensity: 0.62,
      side: THREE.DoubleSide,
    });
  }

  const meshes = [];
  let eyeYTotal = 0;
  for (let recordIndex = 0; recordIndex < payload.records.length; recordIndex += 1) {
    const record = payload.records[recordIndex];
    const bundle = record.bundle;
    const geometry = geometryFromBundle(bundle);
    const mesh = new THREE.Mesh(
      geometry,
      geometry.userData.presentationGroups.map(({ group, hairRegion }) =>
        materialFor(group, record, hairRegion)
      )
    );
    mesh.position.x = (recordIndex - 1) * 0.5;
    mesh.rotation.y = recordIndex === 0 ? 0.035 : recordIndex === 2 ? -0.035 : 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    const eyeGroups = bundle.materialGroups.filter(
      (group) =>
        group.material.shadingModel === 'refractive-eye' && group.material.eyeRegion === 'sclera'
    );
    let eyeSum = 0;
    let eyeSamples = 0;
    for (const group of eyeGroups) {
      for (
        let offset = group.indexStart;
        offset < group.indexStart + group.indexCount;
        offset += 1
      ) {
        eyeSum += geometry.getAttribute('position').getY(bundle.mesh.indices[offset]);
        eyeSamples += 1;
      }
    }
    eyeYTotal += eyeSamples ? eyeSum / eyeSamples : 1.65;
    const card = document.createElement('section');
    card.className = 'portrait';
    card.style.left = `${recordIndex * 596}px`;
    const label = document.createElement('div');
    label.className = 'portrait-label';
    label.innerHTML = `<div><strong>${record.displayLabel}</strong><span>${record.civicRole} &middot; ${record.clusterCount} groom clusters</span></div><b>OPEN CIVIC &middot; EYE ${record.eyeScale}</b>`;
    card.append(label);
    host.append(card);
  }

  const meanEyeY = eyeYTotal / payload.records.length;
  const baseCamera = new THREE.Vector3(0, meanEyeY + 0.015, 1.2);
  camera.position.copy(baseCamera);
  camera.lookAt(0, meanEyeY - 0.005, 0.01);

  function percentile(values, quantile) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))]
      : 0;
  }

  function sampledPixels() {
    const sample = [];
    const pixels = new Uint8Array(1458 * 486 * 4);
    gl.readPixels(0, 0, 1458, 486, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let index = 0; index < pixels.length; index += 80) {
      sample.push(pixels[index], pixels[index + 1], pixels[index + 2]);
    }
    return sample;
  }

  function pixelDelta(before, after) {
    let absolute = 0;
    let changed = 0;
    for (let index = 0; index < before.length; index += 1) {
      const delta = Math.abs(before[index] - after[index]);
      absolute += delta;
      if (delta > 1) changed += 1;
    }
    return {
      meanAbsoluteChannelDelta: absolute / Math.max(1, before.length),
      changedChannelRatio: changed / Math.max(1, before.length),
      sampledChannelCount: before.length,
    };
  }

  async function run() {
    const frameTimes = [];
    const submitTimes = [];
    const stableSubmitTimes = [];
    const invalidatedSubmitTimes = [];
    const gpuSamples = [];
    const pendingQueries = [];
    let historyInvalidationFrameCount = 0;
    let stableSnapshotA = null;
    let stableSnapshotB = null;
    let last = performance.now();
    const pollGpuQueries = () => {
      if (!timerExtension) return;
      const disjoint = gl.getParameter(timerExtension.GPU_DISJOINT_EXT);
      for (let index = pendingQueries.length - 1; index >= 0; index -= 1) {
        const pending = pendingQueries[index];
        if (!gl.getQueryParameter(pending.query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const nanoseconds = gl.getQueryParameter(pending.query, gl.QUERY_RESULT);
        gl.deleteQuery(pending.query);
        pendingQueries.splice(index, 1);
        if (!disjoint) {
          gpuSamples.push({
            phase: pending.phase,
            milliseconds: nanoseconds / 1_000_000,
          });
        }
      }
    };
    for (let frame = 0; frame < 150; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      pollGpuQueries();
      const moving = frame >= 24 && frame < 32;
      const cameraOffset = moving ? Math.sin(((frame - 24) / 8) * Math.PI) * 0.028 : 0;
      camera.position.x = cameraOffset;
      camera.lookAt(0, meanEyeY - 0.005, 0.01);
      if (moving) historyInvalidationFrameCount += 1;
      taa.accumulate = !moving;
      let query = null;
      if (timerExtension && frame >= 18 && pendingQueries.length < 8) {
        query = gl.createQuery();
        gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, query);
      }
      const start = performance.now();
      composer.render(1 / 60);
      if (query) {
        gl.endQuery(timerExtension.TIME_ELAPSED_EXT);
        pendingQueries.push({
          query,
          phase: moving ? 'history-invalidated' : 'stable',
        });
      }
      const now = performance.now();
      if (frame >= 20) {
        frameTimes.push(now - last);
        submitTimes.push(now - start);
        (moving ? invalidatedSubmitTimes : stableSubmitTimes).push(now - start);
      }
      if (frame === 146) stableSnapshotA = sampledPixels();
      if (frame === 147) stableSnapshotB = sampledPixels();
      last = now;
    }
    gl.flush();
    for (let attempt = 0; attempt < 30 && pendingQueries.length; attempt += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      pollGpuQueries();
    }
    for (const pending of pendingQueries) gl.deleteQuery(pending.query);
    const stableGpu = gpuSamples
      .filter((sample) => sample.phase === 'stable')
      .map((sample) => sample.milliseconds);
    const invalidatedGpu = gpuSamples
      .filter((sample) => sample.phase === 'history-invalidated')
      .map((sample) => sample.milliseconds);
    window.__H3J_RESULT__ = {
      gpu,
      frameP95Milliseconds: percentile(frameTimes, 0.95),
      renderSubmitP95Milliseconds: percentile(submitTimes, 0.95),
      stableSubmitP95Milliseconds: percentile(stableSubmitTimes, 0.95),
      invalidatedSubmitP95Milliseconds: percentile(invalidatedSubmitTimes, 0.95),
      stableGpuP95Milliseconds: percentile(stableGpu, 0.95),
      invalidatedGpuP95Milliseconds: percentile(invalidatedGpu, 0.95),
      gpuTimerSampleCount: gpuSamples.length,
      rendererCount: 1,
      sharedSceneCount: 1,
      composerCount: 1,
      residentMeshCount: meshes.length,
      internalRenderWidth: 1458,
      internalRenderHeight: 486,
      presentationWidth: 1800,
      presentationHeight: 720,
      internalRenderScale: 0.81,
      historyPolicy: 'invalidate-on-camera-motion-v1',
      historyInvalidationFrameCount,
      taaBridge: 'three-taarenderpass-v1',
      taaSampleLevel: taa.sampleLevel,
      taaAccumulationTargetFrames: 32,
      finalTaaAccumulationIndex: taa.accumulateIndex,
      temporalPixelDelta: pixelDelta(stableSnapshotA, stableSnapshotB),
      motionReprojection: false,
      nativeWebgpuTaa: false,
      facialLandmarkReceipts: payload.records.map((record) => record.bundle.facialLandmarks),
      garmentReceipts: payload.records.map((record) => record.bundle.garment),
      groomReceipts: payload.records.map((record) => record.bundle.groom),
      ocularMaterialGroupCounts: payload.records.map(
        (record) =>
          record.bundle.materialGroups.filter(
            (group) => group.material.shadingModel === 'refractive-eye'
          ).length
      ),
      materialReceipts,
      groupBounds: meshes.map((mesh) => mesh.geometry.userData.groupBounds),
      presentationShaderOverrideUsed: false,
      presentationMaterialBridgeUsed: true,
      presentationHairMaterialBridgeUsed: true,
      presentationSkinMicrodetailBridgeUsed: true,
      presentationWardrobeBridgeUsed: false,
      presentationNativeTorsoClipUsed: false,
      presentationTaaBridgeUsed: true,
      externalSkinTextureUsed: false,
      externalHairTextureUsed: false,
      externalWardrobeTextureUsed: false,
      sourceCommit: payload.sourceCommit,
    };
    window.__H3J_READY__ = true;
  }

  run().catch((error) => {
    window.__H3J_ERROR__ = error?.stack || error?.message || String(error);
  });
}

async function loadWorkspaceModules(holoScriptRoot) {
  const workspaceRequire = createRequire(path.join(holoScriptRoot, 'package.json'));
  const importResolved = async (name) => import(pathToFileURL(workspaceRequire.resolve(name)).href);
  const playwrightModule = await importResolved('playwright');
  return {
    esbuild: await importResolved('esbuild'),
    chromium: (playwrightModule.default || playwrightModule).chromium,
  };
}

async function buildBrowserSurface(compiled, options, modules) {
  mkdirSync(options.outputDir, { recursive: true });
  const bundlePath = path.join(options.outputDir, 'h3j-civic-landmarks.bundle.js');
  const htmlPath = path.join(options.outputDir, 'h3j-civic-landmarks.html');
  const payload = {
    sourceCommit: compiled.stack.contract.metadata.upstreamHoloScriptCommit,
    records: compiled.civic.records.map((record) => ({
      ...record,
      bundle: browserBundle(record.bundle),
    })),
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    "import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';",
    "import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';",
    "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `(${h3jBrowserApplication.toString()})(THREE, RoomEnvironment, EffectComposer, TAARenderPass, OutputPass, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'h3j-civic-landmarks.entry.js',
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
  <title>Stormglass Character Appearance H3J Civic Landmarks</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:radial-gradient(circle at 50% -12%,#163c4b 0,#06121c 43%,#02060b 100%);color:#eef8fa;font-family:Inter,Segoe UI,sans-serif}
    header{height:104px;padding:20px 38px 12px;border-bottom:1px solid rgba(126,207,220,.2)}
    .eyebrow{color:#75d1df;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.22em}
    h1{margin:7px 0 0;font:500 33px/1 Georgia,serif}
    .sub{position:absolute;right:40px;top:22px;color:#99b8c1;font:600 11px/1.65 ui-monospace,monospace;text-align:right}
    #portraits{position:relative;width:1800px;height:600px;margin:8px auto 0}
    .shared-stage-canvas{position:absolute;inset:0 auto auto 0;display:block;width:1800px;height:600px;border:1px solid rgba(118,205,220,.24);border-radius:20px;background:#030a13;box-shadow:0 28px 70px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.03)}
    .portrait{position:absolute;top:0;width:584px;height:600px;overflow:hidden;border:1px solid rgba(118,205,220,.18);border-radius:20px;pointer-events:none}
    .portrait-label{position:absolute;left:16px;right:16px;bottom:14px;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid rgba(125,205,219,.22);border-radius:12px;background:rgba(3,10,16,.86);backdrop-filter:blur(9px)}
    .portrait-label strong{display:block;font:600 18px/1.15 Georgia,serif}
    .portrait-label span{display:block;margin-top:4px;color:#8cb2be;font:700 9px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
    .portrait-label b{color:#77cfdd;font:700 9px/1 ui-monospace,monospace;letter-spacing:.09em}
    footer{position:absolute;left:40px;right:40px;bottom:7px;display:flex;justify-content:space-between;color:#74929d;font:600 9px/1.4 ui-monospace,monospace;letter-spacing:.09em}
    .truth{color:#e9aa72;text-align:right}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">STORMGLASS COMMONS // NATIVE CHARACTER H3J</div>
    <h1>Open Civic Landmark Convergence</h1>
    <div class="sub">@face(civic_landmarks) + @hair(clusters) + @clothing(open_civic)<br>ONE RENDERER &middot; THREE NATIVE RESIDENTS &middot; 32-FRAME ACCUMULATION</div>
  </header>
  <main id="portraits"></main>
  <footer>
    <div>HEARTHLIGHT BIOREALISM &middot; NATIVE FACE / GROOM / GARMENT RECEIPTS</div>
    <div class="truth">BOUNDED MATERIAL + TAA BRIDGES &middot; NO EXTERNAL TEXTURES &middot; NOT PHOTOREAL</div>
  </footer>
  <script src="${path.basename(bundlePath)}"></script>
</body>
</html>`;
  writeFileSync(htmlPath, html, 'utf8');
  return {
    bundlePath,
    htmlPath,
    bundleSha256: sha256File(bundlePath),
    htmlSha256: sha256(html),
  };
}

async function startServer(root) {
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const absolute = path.resolve(root, pathname.replace(/^\/+/, ''));
      if (!absolute.startsWith(path.resolve(root)) || !existsSync(absolute)) {
        response.writeHead(404).end();
        return;
      }
      const content = readFileSync(absolute);
      response.writeHead(200, {
        'Content-Type': absolute.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'text/javascript; charset=utf-8',
        'Content-Length': content.length,
      });
      response.end(content);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function captureBrowser(surface, options, modules) {
  const { server, url } = await startServer(options.outputDir);
  const externalRequests = [];
  const pageErrors = [];
  let browser;
  try {
    browser = await modules.chromium.launch({
      executablePath: options.browser,
      headless: true,
      args: [
        '--use-angle=d3d11',
        '--ignore-gpu-blocklist',
        '--enable-gpu',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    const page = await browser.newPage({
      viewport: { width: 1800, height: 720 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      if (requestUrl.hostname !== '127.0.0.1') externalRequests.push(request.url());
    });
    await page.goto(`${url}/${path.basename(surface.htmlPath)}`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await page.waitForFunction(() => window.__H3J_READY__ || window.__H3J_ERROR__, null, {
      timeout: 60_000,
    });
    const browserError = await page.evaluate(() => window.__H3J_ERROR__ || null);
    if (browserError) throw new Error(browserError);
    const result = await page.evaluate(() => window.__H3J_RESULT__);
    const timerIsValid =
      result.gpu.timerQueryAvailable !== true ||
      (result.gpuTimerSampleCount >= 24 &&
        result.stableGpuP95Milliseconds > 0 &&
        result.invalidatedGpuP95Milliseconds > 0 &&
        result.stableGpuP95Milliseconds < 11.1 &&
        result.invalidatedGpuP95Milliseconds < 11.1);
    const facialReceiptsValid =
      result.facialLandmarkReceipts?.length === 3 &&
      result.facialLandmarkReceipts.every(
        (receipt) =>
          receipt.schemaVersion === 'holoscript.agent-avatar-facial-landmarks.v1' &&
          receipt.profile === 'civic-landmarks-v1' &&
          receipt.eyeScale >= 0.8 &&
          receipt.eyeScale <= 0.84
      );
    const garmentReceiptsValid =
      result.garmentReceipts?.length === 3 &&
      result.garmentReceipts.every(
        (receipt) =>
          receipt.schemaVersion === 'holoscript.agent-avatar-garment-geometry.v1' &&
          receipt.style === 'stormglass_open_civic_tunic' &&
          receipt.faceCoverage === 'open-v-collar' &&
          receipt.visorVertexCount === 0 &&
          receipt.clothVertexCount > 0
      );
    const groomReceiptsValid =
      result.groomReceipts?.length === 3 &&
      result.groomReceipts.every(
        (receipt) =>
          receipt.schemaVersion === 'holoscript.agent-avatar-groom-geometry.v1' &&
          receipt.profile === 'scalp-flow-v1' &&
          receipt.clusterCount >= 12 &&
          receipt.clusterCount <= 16
      );
    const nativeGarmentMaterials =
      result.materialReceipts?.filter((receipt) => receipt.role === 'garment') || [];
    const garmentMaterialsValid =
      nativeGarmentMaterials.length === 3 &&
      nativeGarmentMaterials.every(
        (receipt) =>
          receipt.nativeGeometry === true &&
          receipt.nativeStyle === 'stormglass_open_civic_tunic' &&
          receipt.faceCoverage === 'open-v-collar' &&
          receipt.presentationWardrobeGeometryBridge === false &&
          receipt.externalTexture === false
      );
    if (
      !/NVIDIA/i.test(result.gpu.renderer) ||
      !/(Direct3D11|D3D11)/i.test(result.gpu.renderer) ||
      result.gpu.antialias !== true ||
      result.gpu.samples < 2 ||
      !timerIsValid ||
      result.rendererCount !== 1 ||
      result.sharedSceneCount !== 1 ||
      result.composerCount !== 1 ||
      result.residentMeshCount !== 3 ||
      result.internalRenderWidth !== 1458 ||
      result.internalRenderHeight !== 486 ||
      result.presentationWidth !== 1800 ||
      result.presentationHeight !== 720 ||
      result.internalRenderScale !== 0.81 ||
      result.historyPolicy !== 'invalidate-on-camera-motion-v1' ||
      result.historyInvalidationFrameCount !== 8 ||
      result.taaBridge !== 'three-taarenderpass-v1' ||
      result.taaSampleLevel !== 0 ||
      result.taaAccumulationTargetFrames !== 32 ||
      result.finalTaaAccumulationIndex !== 32 ||
      result.temporalPixelDelta?.meanAbsoluteChannelDelta > 0.1 ||
      result.temporalPixelDelta?.changedChannelRatio > 0.001 ||
      result.motionReprojection !== false ||
      result.nativeWebgpuTaa !== false ||
      !facialReceiptsValid ||
      !garmentReceiptsValid ||
      !groomReceiptsValid ||
      !result.ocularMaterialGroupCounts?.every((count) => count === 8) ||
      !garmentMaterialsValid ||
      result.presentationShaderOverrideUsed !== false ||
      result.presentationMaterialBridgeUsed !== true ||
      result.presentationHairMaterialBridgeUsed !== true ||
      result.presentationSkinMicrodetailBridgeUsed !== true ||
      result.presentationWardrobeBridgeUsed !== false ||
      result.presentationNativeTorsoClipUsed !== false ||
      result.presentationTaaBridgeUsed !== true ||
      result.externalSkinTextureUsed !== false ||
      result.externalHairTextureUsed !== false ||
      result.externalWardrobeTextureUsed !== false
    ) {
      throw new Error('browser civic landmark contract drifted');
    }
    if (externalRequests.length || pageErrors.length) {
      throw new Error(
        `browser purity failure: external=${externalRequests.length} pageErrors=${pageErrors.length}`
      );
    }
    mkdirSync(path.dirname(options.heroOutput), { recursive: true });
    await page.screenshot({
      path: options.heroOutput,
      type: 'png',
      fullPage: false,
    });
    return {
      ...result,
      browserVersion: browser.version(),
      externalRequests,
      pageErrors,
      screenshot: {
        path: path.relative(options.root, options.heroOutput).replaceAll('\\', '/'),
        sha256: sha256File(options.heroOutput),
        bytes: statSync(options.heroOutput).size,
        width: 1800,
        height: 720,
      },
    };
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    outputDir: path.join(ROOT, OUTPUT_REL),
    heroOutput: path.join(ROOT, HERO_REL),
    browser: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    compileOnly: false,
    requireManifest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--compile-only') options.compileOnly = true;
    else if (arg === '--require-manifest') options.requireManifest = true;
    else if (arg === '--browser') options.browser = argv[++index];
    else if (arg === '--output-dir') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--hero-output') options.heroOutput = path.resolve(argv[++index]);
  }
  return options;
}

function validateManifest(root) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) return { status: 'missing', errors: ['manifest missing'] };
  const text = readFileSync(manifestPath, 'utf8');
  const bindings = [
    [SOURCE_REL, /sourceSha256:\s*"([0-9a-f]{64})"/],
    [POLICY_REL, /policySha256:\s*"([0-9a-f]{64})"/],
    [SEED_REL, /seedSha256:\s*"([0-9a-f]{64})"/],
    [
      'scripts/check-hololand-model-village-character-appearance-h3j.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3j.test.mjs',
      /testSha256:\s*"([0-9a-f]{64})"/,
    ],
    [REPORT_REL, /reportSha256:\s*"([0-9a-f]{64})"/],
    [HERO_REL, /heroSha256:\s*"([0-9a-f]{64})"/],
  ];
  const errors = [];
  for (const [relative, pattern] of bindings) {
    const match = text.match(pattern);
    const absolute = path.join(root, relative);
    if (!match || !existsSync(absolute) || match[1] !== sha256File(absolute)) {
      errors.push(`${relative} manifest binding drifted`);
    }
  }
  return { status: errors.length ? 'fail' : 'pass', errors };
}

export async function runCharacterAppearanceH3J(options = parseArgs([])) {
  const stack = await parseH3JStack(options.root, options.holoScriptRoot);
  const validation = validateH3JContract(stack, options.root, options.holoScriptRoot);
  if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
  const civic = await compileH3JCivicBundles(stack, validation.plan);
  let visual = null;
  let surface = null;
  if (!options.compileOnly) {
    const modules = await loadWorkspaceModules(options.holoScriptRoot);
    surface = await buildBrowserSurface({ stack, civic }, options, modules);
    visual = await captureBrowser(surface, options, modules);
  }
  const manifest = options.requireManifest
    ? validateManifest(options.root)
    : { status: 'not-required', errors: [] };
  if (manifest.status === 'fail' || manifest.status === 'missing') {
    throw new Error(manifest.errors.join('\n'));
  }
  const receipt = {
    schema: 'hololand.model-village.character-appearance-h3j-witness.v1',
    status: 'pass',
    generatedAt: new Date().toISOString(),
    source: {
      path: SOURCE_REL,
      sha256: sha256(stack.sourceText),
      upstreamHoloScriptCommit: stack.contract.metadata.upstreamHoloScriptCommit,
    },
    policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
    seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
    admission: {
      compilerTarget: 'character-webgpu',
      nativeBundleCount: civic.records.length,
      fallbackUsed: false,
      stubCount: civic.records.reduce(
        (sum, record) => sum + record.bundle.report.stubbed.length,
        0
      ),
      facialLandmarkReceiptCount: civic.records.filter(
        (record) =>
          record.bundle.facialLandmarks?.schemaVersion ===
          'holoscript.agent-avatar-facial-landmarks.v1'
      ).length,
      garmentReceiptCount: civic.records.filter(
        (record) =>
          record.bundle.garment?.schemaVersion === 'holoscript.agent-avatar-garment-geometry.v1'
      ).length,
      clusteredGroomReceiptCount: civic.records.filter(
        (record) => record.bundle.groom?.clusterCount >= 2
      ).length,
      authoredHairChromaWeightCount: civic.records.filter(
        (record) =>
          record.bundle.groom?.material?.sourceColorWeight === record.hairSourceColorWeight &&
          record.hairSourceColorWeight !== UPSTREAM_DEFAULT_HAIR_SOURCE_COLOR_WEIGHT
      ).length,
      lodTransitionReceiptCount: civic.records.filter(
        (record) =>
          record.bundle.lod?.transition?.schemaVersion === 'holoscript.character-lod-transition.v1'
      ).length,
      repeatedCompileByteIdentity: true,
      strippedFacialLandmarkDelta: civic.records.every(
        (record) => record.comparisons.facialLandmarks.geometryChanged
      ),
      strippedGarmentDelta: civic.records.every(
        (record) => record.comparisons.openGarment.geometryChanged
      ),
      strippedClusterDelta: civic.records.every(
        (record) => record.comparisons.groomClusters.geometryChanged
      ),
    },
    records: civic.records.map((record) => ({
      objectId: record.objectId,
      personaId: record.personaId,
      displayLabel: record.displayLabel,
      vertexCount: record.bundle.vertexCount,
      geometrySha256: record.geometrySha256,
      repeatedCompileSha256: record.repeatedCompileSha256,
      facialLandmarks: record.bundle.facialLandmarks,
      garment: record.bundle.garment,
      groom: {
        schemaVersion: record.bundle.groom.schemaVersion,
        profile: record.bundle.groom.profile,
        clusterCount: record.bundle.groom.clusterCount,
        clusterSpread: record.bundle.groom.clusterSpread,
        emittedGuideCount: record.bundle.groom.emittedGuideCount,
        cardCount: record.bundle.groom.cardCount,
        materialSchemaVersion: record.bundle.groom.material?.schemaVersion,
        authoredSourceColorWeight: record.hairSourceColorWeight,
        receivedSourceColorWeight: record.bundle.groom.material?.sourceColorWeight,
      },
      lodTransition: record.bundle.lod?.transition,
      comparisons: record.comparisons,
    })),
    visual,
    surface,
    manifest,
    boundaries: {
      presentationMaterialBridgeUsed: true,
      presentationWardrobeBridgeUsed: false,
      presentationNativeTorsoClipUsed: false,
      motionReprojectionClaimed: false,
      nativeWebgpuTaaClaimed: false,
      questWebxrMeasured: false,
      productionGroomClaimed: false,
      photorealismClaimed: false,
      biometricLikenessClaimed: false,
      externalNetworkRequests: visual?.externalRequests.length ?? 0,
    },
  };
  const receiptHash = sha256(JSON.stringify(canonical(receipt)));
  const finalReceipt = { ...receipt, receiptSha256: receiptHash };
  const receiptDir = path.join(options.outputDir, 'final');
  mkdirSync(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, 'character-appearance-h3j-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
  return { receipt: finalReceipt, receiptPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3J(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.log(
        JSON.stringify(
          {
            status: receipt.status,
            receiptSha256: receipt.receiptSha256,
            receiptPath,
            nativeBundleCount: receipt.admission.nativeBundleCount,
            hero: receipt.visual?.screenshot ?? null,
            gpu: receipt.visual
              ? {
                  renderer: receipt.visual.gpu.renderer,
                  stableGpuP95Milliseconds: receipt.visual.stableGpuP95Milliseconds,
                  invalidatedGpuP95Milliseconds: receipt.visual.invalidatedGpuP95Milliseconds,
                  renderSubmitP95Milliseconds: receipt.visual.renderSubmitP95Milliseconds,
                  frameP95Milliseconds: receipt.visual.frameP95Milliseconds,
                }
              : null,
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
