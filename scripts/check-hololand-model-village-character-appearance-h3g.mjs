#!/usr/bin/env node
/* global document, performance, process, requestAnimationFrame, window */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  compileH3BNativeBundles,
  sha256,
} from './check-hololand-model-village-character-appearance-h3b.mjs';

import { validateUpstreamCommitPin } from './lib/model-village-upstream-commit-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3g-hair-response.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3g-hair-response-policy.hsplus';
const SEED_REL = 'source/proofs/model-village-character-appearance-h3g-hair-response-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3g-hair-response-manifest.holo';
const REPORT_REL =
  'docs/reports/model-village-character-appearance-h3g-hair-response-2026-07-28.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3g-hair-response-portraits-2026-07-28.png';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3g';
const EXPECTED_COMMIT = 'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2';
const EXPECTED_PERSONAS = ['hearth_keeper', 'path_tender', 'record_steward'];
const EXPECTED_REGIONS = ['sclera', 'iris', 'pupil', 'cornea'];
// Upstream carries the authored @hair(color) chroma over the melanin response at this
// weight when the source does not author one. H3G exists to prove HoloLand authors it,
// so every persona weight must differ from this value: a receipt carrying 0.55 is
// indistinguishable from a receipt that was never authored at all.
const UPSTREAM_UNAUTHORED_CHROMA_WEIGHT = 0.55;
// Authoring a chroma weight puts the material on the source-chroma receipt schema.
const EXPECTED_HAIR_MATERIAL_SCHEMA = 'holoscript.agent-avatar-hair-material.v2';
const HASH_BINDINGS = [
  ['inheritedH3FSource', 'inheritedH3FSourceSha256', 'hololand'],
  ['upstreamGroomBuilderPath', 'upstreamGroomBuilderSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
  ['upstreamNativeRendererPath', 'upstreamNativeRendererSha256', 'holoscript'],
  ['upstreamHairShaderPath', 'upstreamHairShaderSha256', 'holoscript'],
  ['upstreamDrawSpecPath', 'upstreamDrawSpecSha256', 'holoscript'],
  ['upstreamCompilerPath', 'upstreamCompilerSha256', 'holoscript'],
];

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
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

export async function parseH3GStack(root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3G .holo', source],
    ['H3G .hsplus', policy],
    ['H3G .hs', seed],
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

export function buildH3GPlan(contract) {
  return {
    milestone: contract.metadata.milestone,
    presentationProfile: contract.state.presentationProfile,
    nativeAdmission: contract.state.nativeAdmission,
    benchmark: contract.state.benchmark,
    personas: contract.objects
      .filter((object) => object.type === 'native_hair_response_civic_persona')
      .map((persona) => ({
        objectId: persona.objectId,
        personaId: persona.personaId,
        civicRole: persona.civicRole,
        displayLabel: persona.displayLabel,
        irisColor: persona.irisColor,
        hairColor: persona.hairColor,
        sourceColorInt: parseInt(String(persona.hairColor).replace('#', ''), 16),
        sourceColorWeight: persona.sourceColorWeight,
        nativeHairStyleId: persona.nativeHairStyleId,
        groomProfile: persona.groomProfile,
        cardWidth: persona.cardWidth,
        rootLift: persona.rootLift,
        tipTaper: persona.tipTaper,
        hairlineBias: persona.hairlineBias,
        coverageProfile: persona.coverageProfile,
        strandCoverage: persona.strandCoverage,
        edgeSoftness: persona.edgeSoftness,
        anisotropyStrength: persona.anisotropyStrength,
        longitudinalShift: persona.longitudinalShift,
      })),
    expressions: [],
  };
}

export function validateH3GContract(stack, root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state } = stack.contract;
  expect(metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3G_HAIR_RESPONSE', 'milestone drifted');
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'upstream commit pin drifted');
  for (const [key, expected] of [
    ['nativeCharacterCompilerClaimed', true],
    ['nativeNeutralAnatomicalFaceClaimed', true],
    ['nativeLayeredOcularProfileClaimed', true],
    ['nativeOrbitalProfileClaimed', true],
    ['nativeGroomProfileClaimed', true],
    ['nativeScalpTangentClaimed', true],
    ['nativeScalpAlignedCardsClaimed', true],
    ['nativeNeutralScalpAlignmentClaimed', true],
    ['nativeTipTaperClaimed', true],
    ['nativeHairlineRetractionClaimed', true],
    ['derivedGroomReceiptClaimed', true],
    ['nativeCardWidthUvClaimed', true],
    ['nativeHairCoverageProfileClaimed', true],
    ['nativeAlphaToCoverageRequestedClaimed', true],
    ['nativeTangentAnisotropyClaimed', true],
    ['nativeLongitudinalShiftClaimed', true],
    ['nativeSourceChromaWeightClaimed', true],
    ['unauthoredChromaBlendClaimed', false],
    ['derivedHairMaterialReceiptClaimed', true],
    ['presentationShaderOverrideUsed', false],
    ['presentationMaterialBridgeUsed', true],
    ['presentationAlphaMapUsed', true],
    ['externalHairTextureUsed', false],
    ['hairCardAlphaCoverageClaimed', true],
    ['strandAlphaCoverageClaimed', false],
    ['strandHairClaimed', false],
    ['scanDerivedGroomClaimed', false],
    ['productionGroomClaimed', false],
    ['anatomicalHairAccuracyClaimed', false],
    ['photorealismClaimed', false],
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
    state.hairResponseFoundation?.groomProfile === 'scalp-flow-v1' &&
      state.hairResponseFoundation?.coverageProfile === 'alpha-to-coverage-v1' &&
      state.hairResponseFoundation?.opaqueComparisonProfile === 'opaque-v1' &&
      state.hairResponseFoundation?.cardWidthUvAttribute === 'card-width' &&
      state.hairResponseFoundation?.tangentAttribute === 'strand-flow' &&
      state.hairResponseFoundation?.multisampleCount === 4 &&
      state.hairResponseFoundation?.alphaToCoverageRequested === true &&
      state.hairResponseFoundation?.analyticNativeCoverage === true &&
      state.hairResponseFoundation?.tangentAwareDualLobe === true &&
      state.hairResponseFoundation?.longitudinalLobeShift === true &&
      state.hairResponseFoundation?.hairMaterialReceiptSchema === EXPECTED_HAIR_MATERIAL_SCHEMA &&
      state.hairResponseFoundation?.sourceChromaWeightAuthored === true &&
      state.hairResponseFoundation?.sourceChromaWeightUpstreamDefaulted === false &&
      state.hairResponseFoundation?.derivedMaterialReceipt === true &&
      state.hairResponseFoundation?.presentationShaderOverride === false &&
      state.hairResponseFoundation?.presentationMaterialBridge === true &&
      state.hairResponseFoundation?.presentationAlphaMap === true &&
      state.hairResponseFoundation?.externalHairTexture === false &&
      state.hairResponseFoundation?.strandHair === false,
    'hair response foundation truth boundary drifted'
  );
  expect(
    state.nativeAdmission?.compilerTarget === 'character-webgpu' &&
      state.nativeAdmission?.fallbackAllowed === false &&
      state.nativeAdmission?.exactNineNativeBundlesRequired === true &&
      state.nativeAdmission?.exactEightOcularGroupsPerBundleRequired === true &&
      state.nativeAdmission?.mappedHairMaterialReceiptRequired === true &&
      state.nativeAdmission?.derivedHairMaterialReceiptRequired === true &&
      state.nativeAdmission?.opaqueCoverageComparisonRequired === true &&
      state.nativeAdmission?.cardWidthUvOperative === true &&
      state.nativeAdmission?.authoredStrandCoverageOperative === true &&
      state.nativeAdmission?.authoredEdgeSoftnessOperative === true &&
      state.nativeAdmission?.authoredAnisotropyStrengthOperative === true &&
      state.nativeAdmission?.authoredLongitudinalShiftOperative === true &&
      state.nativeAdmission?.authoredSourceColorWeightOperative === true &&
      state.nativeAdmission?.sourceChromaRoundTripRequired === true &&
      state.nativeAdmission?.hairMaterialReceiptSchemaRequired === EXPECTED_HAIR_MATERIAL_SCHEMA &&
      state.nativeAdmission?.alphaToCoverageRequestedRequired === true &&
      state.nativeAdmission?.multisampleCountRequired === 4,
    'hair response admission drifted'
  );
  const plan = buildH3GPlan(stack.contract);
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
    const hair = object?.traits?.find((trait) => trait.name === 'hair');
    expect(
      typeof persona.sourceColorWeight === 'number' &&
        hair?.config?.source_color_weight === persona.sourceColorWeight,
      `${persona.personaId} source-authored hair chroma weight missing or drifted`
    );
    expect(
      persona.sourceColorWeight !== UPSTREAM_UNAUTHORED_CHROMA_WEIGHT,
      `${persona.personaId} chroma weight equals the upstream unauthored default ` +
        `(${UPSTREAM_UNAUTHORED_CHROMA_WEIGHT}); an authored weight must be distinguishable ` +
        'from a defaulted one in the receipt'
    );
    expect(
      Number.isInteger(persona.sourceColorInt) &&
        persona.sourceColorInt >= 0 &&
        persona.sourceColorInt <= 0xffffff,
      `${persona.personaId} hair colour is not a parseable 0xRRGGBB source chroma`
    );
    expect(
      hair?.config?.groom_profile === 'scalp_flow_v1' &&
        hair?.config?.color === persona.hairColor &&
        hair?.config?.card_width === persona.cardWidth &&
        hair?.config?.root_lift === persona.rootLift &&
        hair?.config?.tip_taper === persona.tipTaper &&
        hair?.config?.hairline_bias === persona.hairlineBias &&
        hair?.config?.coverage_profile === 'alpha_to_coverage_v1' &&
        hair?.config?.strand_coverage === persona.strandCoverage &&
        hair?.config?.edge_softness === persona.edgeSoftness &&
        hair?.config?.anisotropy_strength === persona.anisotropyStrength &&
        hair?.config?.longitudinal_shift === persona.longitudinalShift,
      `${persona.personaId} source-authored hair response parameters drifted`
    );
  }
  const chromaWeights = plan.personas.map((persona) => persona.sourceColorWeight);
  expect(
    new Set(chromaWeights).size === chromaWeights.length,
    'chroma weights are not per-persona distinct; one shared constant cannot witness ' +
      'per-persona authoring'
  );
  const chromaRange = state.hairResponseFoundation?.sourceAuthoredChromaWeightRange;
  expect(
    Array.isArray(chromaRange) &&
      chromaRange.length === 2 &&
      Math.min(...chromaWeights) === chromaRange[0] &&
      Math.max(...chromaWeights) === chromaRange[1],
    'declared sourceAuthoredChromaWeightRange does not bound the authored persona weights'
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

async function exportBundle(core, ast, objectId, lodLevel) {
  return new core.ExportManager({
    useCircuitBreaker: false,
    useFallback: false,
    useMemoryMonitoring: false,
  }).export('character-webgpu', ast, {
    compilerOptions: {
      objectId,
      entityId: `model-village-h3g-${objectId.toLowerCase()}`,
      lodLevel,
    },
  });
}

function withoutHairResponse(ast) {
  const copy = structuredClone(ast);
  for (const object of copy.objects || []) {
    const hair = object.traits?.find((trait) => trait.name === 'hair');
    if (!hair) continue;
    for (const key of [
      'coverage_profile',
      'strand_coverage',
      'edge_softness',
      'anisotropy_strength',
      'longitudinal_shift',
    ]) {
      delete hair.config[key];
    }
  }
  return copy;
}

function ocularGroups(bundle) {
  return bundle.materialGroups.filter((group) => group.material.shadingModel === 'refractive-eye');
}

export async function compileH3GHairResponseBundles(stack, plan) {
  const native = await compileH3BNativeBundles(stack.core, stack.source.ast, plan);
  const comparisons = [];
  for (const record of native.records) {
    for (const tier of record.tiers) {
      const { bundle } = tier;
      const material = bundle.groom?.material;
      const hairGroup = bundle.materialGroups.find(
        (group) => group.material.shadingModel === 'marschner-hair'
      );
      const hairUvs = bundle.mesh.uvs || [];
      const cardUvVertices = [];
      if (hairGroup) {
        const cardVertexIndices = new Set();
        for (
          let index = hairGroup.indexStart;
          index < hairGroup.indexStart + hairGroup.indexCount;
          index += 1
        ) {
          const vertex = bundle.mesh.indices[index];
          if (hairUvs[vertex * 2 + 1] >= 0) cardVertexIndices.add(vertex);
        }
        for (const vertex of cardVertexIndices) {
          cardUvVertices.push([hairUvs[vertex * 2], hairUvs[vertex * 2 + 1]]);
        }
      }
      const cardUvMin = Math.min(...cardUvVertices.map(([u]) => u));
      const cardUvMax = Math.max(...cardUvVertices.map(([u]) => u));
      const groups = ocularGroups(bundle);
      const regionCounts = Object.fromEntries(
        EXPECTED_REGIONS.map((region) => [
          region,
          groups.filter((group) => group.material.eyeRegion === region).length,
        ])
      );
      if (
        bundle.face?.topology !== 'neutral-anatomical-v2' ||
        bundle.face?.ocularProfile !== 'layered-ocular-v1' ||
        bundle.face?.orbitalProfile !== 'recessed-lids-v1' ||
        bundle.groom?.schemaVersion !== 'holoscript.agent-avatar-groom-geometry.v1' ||
        bundle.groom?.profile !== 'scalp-flow-v1' ||
        bundle.groom?.scalpSurface !== 'neutral-anatomical-ellipsoid' ||
        bundle.groom?.rootLift !== record.rootLift ||
        bundle.groom?.tipTaper !== record.tipTaper ||
        bundle.groom?.hairlineBias !== record.hairlineBias ||
        material?.schemaVersion !== EXPECTED_HAIR_MATERIAL_SCHEMA ||
        material?.sourceColor !== record.sourceColorInt ||
        material?.sourceColorWeight !== record.sourceColorWeight ||
        hairGroup?.material.sourceColorWeight !== record.sourceColorWeight ||
        hairGroup?.material.color !== record.sourceColorInt ||
        !bundle.report?.mapped?.includes(`@hair(source_color_weight=${record.sourceColorWeight})`) ||
        material?.coverageProfile !== record.coverageProfile ||
        material?.strandCoverage !== record.strandCoverage ||
        material?.edgeSoftness !== record.edgeSoftness ||
        material?.anisotropyStrength !== record.anisotropyStrength ||
        material?.longitudinalShift !== record.longitudinalShift ||
        material?.tangentAttribute !== 'strand-flow' ||
        material?.cardUvAttribute !== 'card-width' ||
        material?.alphaToCoverageRequested !== true ||
        hairGroup?.material.coverageProfile !== record.coverageProfile ||
        hairGroup?.material.strandCoverage !== record.strandCoverage ||
        hairGroup?.material.edgeSoftness !== record.edgeSoftness ||
        hairGroup?.material.anisotropyStrength !== record.anisotropyStrength ||
        hairGroup?.material.longitudinalShift !== record.longitudinalShift ||
        hairUvs.length !== bundle.vertexCount * 2 ||
        cardUvVertices.length === 0 ||
        cardUvMin !== 0 ||
        cardUvMax !== 1 ||
        bundle.groom?.rootTangentRadialDotP95 > 0.01 ||
        groups.length !== 8 ||
        !EXPECTED_REGIONS.every((region) => regionCounts[region] === 2) ||
        !bundle.report?.mapped?.some((entry) =>
          entry.startsWith('@hair(groom_profile=scalp-flow-v1')
        ) ||
        !bundle.report?.mapped?.some((entry) =>
          entry.startsWith('@hair(coverage_profile=alpha-to-coverage-v1')
        ) ||
        bundle.report?.stubbed?.length !== 0
      ) {
        throw new Error(`${record.personaId} LOD${tier.level} hair response contract drifted`);
      }
      tier.ocularGroupCount = groups.length;
      tier.ocularRegions = regionCounts;
      tier.groom = bundle.groom;
      tier.hairMaterial = material;
      tier.cardUv = {
        attribute: 'card-width',
        vertexCount: cardUvVertices.length,
        min: cardUvMin,
        max: cardUvMax,
      };

      const opaque = await exportBundle(
        stack.core,
        withoutHairResponse(stack.source.ast),
        record.objectId,
        tier.level
      );
      if (!opaque.success || opaque.usedFallback) {
        throw new Error(`${record.personaId} LOD${tier.level} opaque comparison compile failed`);
      }
      const opaqueBundle = JSON.parse(opaque.output);
      if (
        opaqueBundle.groom?.profile !== 'scalp-flow-v1' ||
        opaqueBundle.groom?.material?.coverageProfile !== 'opaque-v1' ||
        opaqueBundle.groom?.material?.alphaToCoverageRequested !== false ||
        // The authored chroma weight is a colour decision, not a coverage decision:
        // dropping the coverage profile must not disturb it.
        opaqueBundle.groom?.material?.sourceColorWeight !== record.sourceColorWeight ||
        opaqueBundle.groom?.material?.sourceColor !== record.sourceColorInt ||
        sha256(JSON.stringify(canonical(opaqueBundle.mesh))) !==
          sha256(JSON.stringify(canonical(bundle.mesh)))
      ) {
        throw new Error(`${record.personaId} LOD${tier.level} opaque comparison failed`);
      }
      comparisons.push({
        personaId: record.personaId,
        level: tier.level,
        sourceAuthored: material,
        opaque: opaqueBundle.groom.material,
        geometrySha256: sha256(JSON.stringify(canonical(bundle.mesh))),
        geometryByteIdentical: true,
        cardUv: tier.cardUv,
      });
    }
  }
  return {
    native,
    comparisons,
  };
}

function browserBundle(bundle) {
  return {
    vertexCount: bundle.vertexCount,
    mesh: bundle.mesh,
    jointMatrices: bundle.jointMatrices,
    materialGroups: bundle.materialGroups,
    face: bundle.face,
    groom: bundle.groom,
  };
}

function h3gBrowserApplication(THREE, RoomEnvironment, payload) {
  const host = document.getElementById('portraits');
  const renderers = [];
  const hairBridges = [];
  const capBridges = [];
  const hairTextureCache = new Map();
  const gpu = {};

  function geometryFromBundle(bundle) {
    const positions = new Float32Array(bundle.mesh.positions);
    const normals = new Float32Array(bundle.mesh.normals);
    const tangents = new Float32Array(bundle.mesh.tangents);
    for (let vertex = 0; vertex < bundle.vertexCount; vertex += 1) {
      const joint = bundle.mesh.jointIndices[vertex];
      const weight = bundle.mesh.jointWeights[vertex];
      const offset = joint * 16;
      const position = vertex * 3;
      const x = positions[position];
      const y = positions[position + 1];
      const z = positions[position + 2];
      positions[position] =
        (bundle.jointMatrices[offset] * x +
          bundle.jointMatrices[offset + 4] * y +
          bundle.jointMatrices[offset + 8] * z +
          bundle.jointMatrices[offset + 12]) *
        weight;
      positions[position + 1] =
        (bundle.jointMatrices[offset + 1] * x +
          bundle.jointMatrices[offset + 5] * y +
          bundle.jointMatrices[offset + 9] * z +
          bundle.jointMatrices[offset + 13]) *
        weight;
      positions[position + 2] =
        (bundle.jointMatrices[offset + 2] * x +
          bundle.jointMatrices[offset + 6] * y +
          bundle.jointMatrices[offset + 10] * z +
          bundle.jointMatrices[offset + 14]) *
        weight;
      const nx = normals[position];
      const ny = normals[position + 1];
      const nz = normals[position + 2];
      const tx =
        bundle.jointMatrices[offset] * nx +
        bundle.jointMatrices[offset + 4] * ny +
        bundle.jointMatrices[offset + 8] * nz;
      const ty =
        bundle.jointMatrices[offset + 1] * nx +
        bundle.jointMatrices[offset + 5] * ny +
        bundle.jointMatrices[offset + 9] * nz;
      const tz =
        bundle.jointMatrices[offset + 2] * nx +
        bundle.jointMatrices[offset + 6] * ny +
        bundle.jointMatrices[offset + 10] * nz;
      const length = Math.hypot(tx, ty, tz) || 1;
      normals[position] = tx / length;
      normals[position + 1] = ty / length;
      normals[position + 2] = tz / length;
      const tangentOffset = vertex * 4;
      const tangentX = tangents[tangentOffset];
      const tangentY = tangents[tangentOffset + 1];
      const tangentZ = tangents[tangentOffset + 2];
      const skinnedTangentX =
        bundle.jointMatrices[offset] * tangentX +
        bundle.jointMatrices[offset + 4] * tangentY +
        bundle.jointMatrices[offset + 8] * tangentZ;
      const skinnedTangentY =
        bundle.jointMatrices[offset + 1] * tangentX +
        bundle.jointMatrices[offset + 5] * tangentY +
        bundle.jointMatrices[offset + 9] * tangentZ;
      const skinnedTangentZ =
        bundle.jointMatrices[offset + 2] * tangentX +
        bundle.jointMatrices[offset + 6] * tangentY +
        bundle.jointMatrices[offset + 10] * tangentZ;
      const tangentLength = Math.hypot(skinnedTangentX, skinnedTangentY, skinnedTangentZ) || 1;
      tangents[tangentOffset] = skinnedTangentX / tangentLength;
      tangents[tangentOffset + 1] = skinnedTangentY / tangentLength;
      tangents[tangentOffset + 2] = skinnedTangentZ / tangentLength;
      tangents[tangentOffset + 3] = 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('tangent', new THREE.BufferAttribute(tangents, 4));
    if (bundle.mesh.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bundle.mesh.uvs), 2));
    }
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
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-6, edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function hairTextures(record) {
    if (hairTextureCache.has(record.personaId)) {
      return hairTextureCache.get(record.personaId);
    }
    const width = 64;
    const height = 128;
    const color = new Uint8Array(width * height * 4);
    const coverage = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const v = y / (height - 1);
      for (let x = 0; x < width; x += 1) {
        const u = x / (width - 1);
        const index = (y * width + x) * 4;
        const edge = Math.abs(u * 2 - 1);
        const halfWidth = Math.min(0.98, record.strandCoverage + (1 - v) * 0.08);
        const analytic =
          y === 0 ? 1 : 1 - smoothstep(halfWidth - record.edgeSoftness, halfWidth, edge);
        const brokenEdge = Math.max(
          0,
          Math.min(1, analytic * (0.94 + 0.06 * Math.sin(x * 1.73 + y * 0.19)))
        );
        const fibre =
          0.84 +
          0.13 * Math.pow(0.5 + 0.5 * Math.sin(x * 1.31 + Math.sin(y * 0.07) * 2.4), 5) +
          0.05 * Math.sin(y * 0.34 + x * 0.13);
        const luminance = Math.round(Math.max(0.72, Math.min(1, fibre)) * 255);
        const alpha = Math.round(brokenEdge * 255);
        color[index] = luminance;
        color[index + 1] = luminance;
        color[index + 2] = luminance;
        color[index + 3] = 255;
        coverage[index] = alpha;
        coverage[index + 1] = alpha;
        coverage[index + 2] = alpha;
        coverage[index + 3] = 255;
      }
    }
    const map = new THREE.DataTexture(color, width, height, THREE.RGBAFormat);
    map.flipY = false;
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    const alphaMap = new THREE.DataTexture(coverage, width, height, THREE.RGBAFormat);
    alphaMap.flipY = false;
    alphaMap.wrapS = THREE.ClampToEdgeWrapping;
    alphaMap.wrapT = THREE.ClampToEdgeWrapping;
    alphaMap.minFilter = THREE.LinearMipmapLinearFilter;
    alphaMap.magFilter = THREE.LinearFilter;
    alphaMap.generateMipmaps = true;
    alphaMap.needsUpdate = true;
    const textures = { map, alphaMap };
    hairTextureCache.set(record.personaId, textures);
    return textures;
  }

  function materialFor(group, record, hairRegion) {
    const material = group.material;
    if (material.shadingModel === 'marschner-hair') {
      const textures = hairTextures(record);
      if (hairRegion === 'cap') {
        const cap = new THREE.MeshPhysicalMaterial({
          color: record.hairColor,
          roughness: 0.64,
          metalness: 0,
          map: textures.map,
          side: THREE.DoubleSide,
          anisotropy: 0,
          clearcoat: 0,
          clearcoatRoughness: 0.6,
          sheen: 0.26,
          sheenRoughness: 0.62,
          sheenColor: new THREE.Color(record.hairColor).lerp(new THREE.Color(0xffb98f), 0.24),
          emissive: record.hairColor,
          emissiveIntensity: 0.05,
          specularIntensity: 0.35,
          envMapIntensity: 0.58,
        });
        capBridges.push({
          personaId: record.personaId,
          materialType: cap.type,
          region: 'cap',
          anisotropy: cap.anisotropy,
          alphaToCoverage: cap.alphaToCoverage,
          proceduralMap: true,
          proceduralAlphaMap: false,
          externalTexture: false,
          customShader: false,
        });
        return cap;
      }
      const response = new THREE.MeshPhysicalMaterial({
        color: record.hairColor,
        roughness: 0.3,
        metalness: 0,
        map: textures.map,
        alphaMap: textures.alphaMap,
        alphaTest: 0.01,
        alphaToCoverage: true,
        side: THREE.DoubleSide,
        anisotropy: record.anisotropyStrength,
        anisotropyRotation: record.longitudinalShift * Math.PI,
        clearcoat: 0.18,
        clearcoatRoughness: 0.22,
        sheen: 0.62,
        sheenRoughness: 0.32,
        sheenColor: new THREE.Color(record.hairColor).lerp(new THREE.Color(0xffb98f), 0.35),
        emissive: record.hairColor,
        emissiveIntensity: 0.12,
        specularIntensity: 1.25,
        envMapIntensity: 1.15,
      });
      hairBridges.push({
        personaId: record.personaId,
        materialType: response.type,
        requestedHairColor: record.hairColor,
        resolvedColor: `#${response.color.getHexString()}`,
        resolvedEmissive: `#${response.emissive.getHexString()}`,
        // Source-authored chroma weight, carried from the .holo through the native
        // material receipt into the presentation payload. The physical-material bridge
        // does not itself evaluate the melanin/source mix — that is the native shader —
        // so this witnesses carriage, not a second implementation of the blend.
        authoredSourceColorWeight: record.sourceColorWeight,
        nativeSourceColorWeight: material.sourceColorWeight,
        coverageProfile: material.coverageProfile,
        strandCoverage: material.strandCoverage,
        edgeSoftness: material.edgeSoftness,
        anisotropyStrength: material.anisotropyStrength,
        longitudinalShift: material.longitudinalShift,
        alphaToCoverage: response.alphaToCoverage,
        alphaTest: response.alphaTest,
        anisotropy: response.anisotropy,
        anisotropyRotation: response.anisotropyRotation,
        proceduralMap: true,
        proceduralAlphaMap: true,
        externalTexture: false,
        customShader: false,
        nativeTangentAttribute:
          record.tiers[1].bundle.mesh.tangents.length === record.tiers[1].bundle.vertexCount * 4,
      });
      return response;
    }
    if (material.shadingModel === 'refractive-eye') {
      if (material.eyeRegion === 'cornea') {
        return new THREE.MeshPhysicalMaterial({
          color: material.color,
          roughness: 0.06,
          transparent: true,
          opacity: 0.08,
          ior: material.ior,
          clearcoat: 0.9,
          clearcoatRoughness: 0.04,
          envMapIntensity: 0.78,
          depthWrite: false,
        });
      }
      const isIris = material.eyeRegion === 'iris';
      const isPupil = material.eyeRegion === 'pupil';
      return new THREE.MeshPhysicalMaterial({
        color: material.color,
        roughness: isPupil ? 0.17 : isIris ? 0.3 : 0.4,
        metalness: 0,
        clearcoat: isPupil ? 0.64 : isIris ? 0.3 : 0.12,
        clearcoatRoughness: 0.14,
        envMapIntensity: 0.72,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: material.color,
      roughness: 0.6,
      metalness: 0,
      clearcoat: 0.04,
      clearcoatRoughness: 0.44,
      sheen: 0.08,
      sheenColor: 0xffd4c2,
      envMapIntensity: 0.6,
    });
  }

  function eyeHeight(bundle, geometry) {
    const positions = geometry.getAttribute('position');
    const groups = bundle.materialGroups.filter(
      (group) =>
        group.material.shadingModel === 'refractive-eye' && group.material.eyeRegion === 'sclera'
    );
    let sum = 0;
    let samples = 0;
    for (const group of groups) {
      for (
        let offset = group.indexStart;
        offset < group.indexStart + group.indexCount;
        offset += 1
      ) {
        sum += positions.getY(bundle.mesh.indices[offset]);
        samples += 1;
      }
    }
    return samples ? sum / samples : geometry.boundingBox.max.y * 0.82;
  }

  function buildPortrait(record) {
    const card = document.createElement('section');
    card.className = 'portrait';
    const canvas = document.createElement('canvas');
    const label = document.createElement('div');
    label.className = 'portrait-label';
    label.innerHTML = `<div><strong>${record.displayLabel}</strong><span>${record.civicRole} · ${record.nativeHairStyleId}</span></div><b>C ${record.strandCoverage.toFixed(2)} · A ${record.anisotropyStrength.toFixed(2)} · S ${record.longitudinalShift.toFixed(2)}</b>`;
    card.append(canvas, label);
    host.append(card);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(548, 554, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    if (!gpu.renderer) {
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      gpu.renderer = debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      gpu.vendor = debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR);
      gpu.version = gl.getParameter(gl.VERSION);
      gpu.samples = gl.getParameter(gl.SAMPLES);
      gpu.antialias = renderer.getContextAttributes()?.antialias === true;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030a13);
    scene.fog = new THREE.FogExp2(0x030a13, 0.34);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 1.08;
    scene.add(new THREE.HemisphereLight(0x9bcbd8, 0x160b08, 1.2));
    const key = new THREE.DirectionalLight(0xffd5bd, 3.65);
    key.position.set(1.5, 2.4, 2.3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x4eb9d0, 1.65);
    fill.position.set(-2.2, 1.7, 1.3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff8e58, 2.5);
    rim.position.set(0.5, 2.1, -1.8);
    scene.add(rim);
    const hairKey = new THREE.DirectionalLight(0xffc0a1, 2.2);
    hairKey.position.set(-0.35, 3.6, 1.1);
    scene.add(hairKey);

    const bundle = record.tiers[1].bundle;
    const geometry = geometryFromBundle(bundle);
    const mesh = new THREE.Mesh(
      geometry,
      geometry.userData.presentationGroups.map(({ group, hairRegion }) =>
        materialFor(group, record, hairRegion)
      )
    );
    scene.add(mesh);
    const eyeY = eyeHeight(bundle, geometry);
    const camera = new THREE.PerspectiveCamera(25, 548 / 554, 0.05, 20);
    camera.position.set(0, eyeY - 0.016, 0.62);
    camera.lookAt(0, eyeY - 0.027, 0.012);
    renderer.render(scene, camera);
    renderers.push({ renderer, scene, camera });
  }

  async function run() {
    payload.records.forEach(buildPortrait);
    const frameTimes = [];
    const submitTimes = [];
    let last = performance.now();
    for (let frame = 0; frame < 105; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const start = performance.now();
      renderers.forEach(({ renderer, scene, camera }) => renderer.render(scene, camera));
      const now = performance.now();
      if (frame >= 20) {
        frameTimes.push(now - last);
        submitTimes.push(now - start);
      }
      last = now;
    }
    const visualTier = payload.records[0].tiers[1].bundle;
    window.__H3G_RESULT__ = {
      gpu,
      frameP95Milliseconds: payload.percentile(frameTimes, 0.95),
      renderSubmitP95Milliseconds: payload.percentile(submitTimes, 0.95),
      rendererCount: renderers.length,
      orbitalProfile: visualTier.face.orbitalProfile,
      groomProfile: visualTier.groom.profile,
      scalpSurface: visualTier.groom.scalpSurface,
      rootTangentRadialDotP95: visualTier.groom.rootTangentRadialDotP95,
      frontalOcclusionVertexCount: visualTier.groom.frontalOcclusionVertexCount,
      coverageProfile: visualTier.groom.material.coverageProfile,
      alphaToCoverageRequested: visualTier.groom.material.alphaToCoverageRequested,
      tangentAttribute: visualTier.groom.material.tangentAttribute,
      cardUvAttribute: visualTier.groom.material.cardUvAttribute,
      hairBridges,
      capBridges,
      ocularMaterialGroupCount: visualTier.materialGroups.filter(
        (group) => group.material.shadingModel === 'refractive-eye'
      ).length,
      presentationShaderOverrideUsed: false,
      presentationMaterialBridgeUsed: true,
      presentationAlphaMapUsed: true,
      externalHairTextureUsed: false,
      visualHairLod: 1,
      sourceCommit: payload.sourceCommit,
    };
    window.__H3G_READY__ = true;
  }

  run().catch((error) => {
    window.__H3G_ERROR__ = error?.stack || error?.message || String(error);
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
  const bundlePath = path.join(options.outputDir, 'h3g-hair-response.bundle.js');
  const htmlPath = path.join(options.outputDir, 'h3g-hair-response.html');
  const payload = {
    sourceCommit: compiled.stack.contract.metadata.upstreamHoloScriptCommit,
    records: compiled.hairResponse.native.records.map((record) => ({
      ...record,
      tiers: record.tiers.map((tier) => ({
        ...tier,
        bundle: browserBundle(tier.bundle),
      })),
    })),
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `PAYLOAD.percentile = (values, quantile) => {
      const sorted = [...values].sort((a,b)=>a-b);
      return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] : 0;
    };`,
    `(${h3gBrowserApplication.toString()})(THREE, RoomEnvironment, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'h3g-hair-response.entry.js',
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
  <title>Stormglass Character Appearance H3G</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:radial-gradient(circle at 50% -12%,#163c4b 0,#06121c 43%,#02060b 100%);color:#eef8fa;font-family:Inter,Segoe UI,sans-serif}
    header{height:108px;padding:21px 38px 12px;border-bottom:1px solid rgba(126,207,220,.2)}
    .eyebrow{color:#75d1df;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.22em}
    h1{margin:7px 0 0;font:500 34px/1 Georgia,serif}
    .sub{position:absolute;right:40px;top:24px;color:#99b8c1;font:600 11px/1.65 ui-monospace,monospace;text-align:right}
    #portraits{display:flex;gap:18px;padding:16px 36px 0;justify-content:center}
    .portrait{position:relative;width:548px;height:566px;overflow:hidden;border:1px solid rgba(118,205,220,.24);border-radius:20px;background:rgba(5,15,24,.78);box-shadow:0 28px 70px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.03)}
    canvas{display:block;width:548px;height:554px}
    .portrait-label{position:absolute;left:16px;right:16px;bottom:14px;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid rgba(125,205,219,.22);border-radius:12px;background:rgba(3,10,16,.86);backdrop-filter:blur(9px)}
    .portrait-label strong{display:block;font:600 18px/1.15 Georgia,serif}
    .portrait-label span{display:block;margin-top:4px;color:#8cb2be;font:700 9px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
    .portrait-label b{color:#77cfdd;font:700 9px/1 ui-monospace,monospace;letter-spacing:.09em}
    footer{position:absolute;left:40px;right:40px;bottom:10px;display:flex;justify-content:space-between;color:#74929d;font:600 9px/1.4 ui-monospace,monospace;letter-spacing:.09em}
    .truth{color:#e9aa72;text-align:right}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">STORMGLASS COMMONS // NATIVE CHARACTER H3G</div>
    <h1>Hair Coverage + Tangent Response</h1>
    <div class="sub">@hair(coverage_profile: alpha_to_coverage_v1)<br>CARD-WIDTH UV · TANGENT HIGHLIGHT · 4X MSAA REQUEST</div>
  </header>
  <main id="portraits"></main>
  <footer>
    <div>HEARTHLIGHT BIOREALISM · SOURCE-DERIVED PHYSICAL MATERIAL BRIDGE · LOD1</div>
    <div class="truth">PROCEDURAL COVERAGE MAP · NO EXTERNAL HAIR TEXTURE · NO STRAND HAIR</div>
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
    await page.waitForFunction(() => window.__H3G_READY__ || window.__H3G_ERROR__, null, {
      timeout: 60_000,
    });
    const browserError = await page.evaluate(() => window.__H3G_ERROR__ || null);
    if (browserError) throw new Error(browserError);
    const result = await page.evaluate(() => window.__H3G_RESULT__);
    if (!/NVIDIA/i.test(result.gpu.renderer) || !/(Direct3D11|D3D11)/i.test(result.gpu.renderer)) {
      throw new Error(`hardware D3D11 renderer required, received ${result.gpu.renderer}`);
    }
    const validHairBridges =
      result.hairBridges?.length === 3 &&
      result.hairBridges.every(
        (bridge) =>
          bridge.materialType === 'MeshPhysicalMaterial' &&
          typeof bridge.authoredSourceColorWeight === 'number' &&
          bridge.nativeSourceColorWeight === bridge.authoredSourceColorWeight &&
          bridge.authoredSourceColorWeight !== UPSTREAM_UNAUTHORED_CHROMA_WEIGHT &&
          bridge.coverageProfile === 'alpha-to-coverage-v1' &&
          bridge.alphaToCoverage === true &&
          bridge.alphaTest === 0.01 &&
          bridge.anisotropy === bridge.anisotropyStrength &&
          Math.abs(bridge.anisotropyRotation - bridge.longitudinalShift * Math.PI) < 1e-9 &&
          bridge.proceduralMap === true &&
          bridge.proceduralAlphaMap === true &&
          bridge.externalTexture === false &&
          bridge.customShader === false &&
          bridge.nativeTangentAttribute === true
      );
    const validCapBridges =
      result.capBridges?.length === 3 &&
      result.capBridges.every(
        (bridge) =>
          bridge.materialType === 'MeshPhysicalMaterial' &&
          bridge.region === 'cap' &&
          bridge.anisotropy === 0 &&
          bridge.alphaToCoverage === false &&
          bridge.proceduralMap === true &&
          bridge.proceduralAlphaMap === false &&
          bridge.externalTexture === false &&
          bridge.customShader === false
      );
    if (
      result.gpu.antialias !== true ||
      result.gpu.samples < 2 ||
      result.orbitalProfile !== 'recessed-lids-v1' ||
      result.groomProfile !== 'scalp-flow-v1' ||
      result.scalpSurface !== 'neutral-anatomical-ellipsoid' ||
      result.rootTangentRadialDotP95 > 0.01 ||
      result.coverageProfile !== 'alpha-to-coverage-v1' ||
      result.alphaToCoverageRequested !== true ||
      result.tangentAttribute !== 'strand-flow' ||
      result.cardUvAttribute !== 'card-width' ||
      !validHairBridges ||
      !validCapBridges ||
      result.ocularMaterialGroupCount !== 8 ||
      result.presentationShaderOverrideUsed !== false ||
      result.presentationMaterialBridgeUsed !== true ||
      result.presentationAlphaMapUsed !== true ||
      result.externalHairTextureUsed !== false
    ) {
      throw new Error('browser hair response material contract drifted');
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
      'scripts/check-hololand-model-village-character-appearance-h3g.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3g.test.mjs',
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

export async function runCharacterAppearanceH3G(options = parseArgs([])) {
  const stack = await parseH3GStack(options.root, options.holoScriptRoot);
  const validation = validateH3GContract(stack, options.root, options.holoScriptRoot);
  if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
  const hairResponse = await compileH3GHairResponseBundles(stack, validation.plan);
  let visual = null;
  let surface = null;
  if (!options.compileOnly) {
    const modules = await loadWorkspaceModules(options.holoScriptRoot);
    surface = await buildBrowserSurface({ stack, hairResponse }, options, modules);
    visual = await captureBrowser(surface, options, modules);
  }
  const manifest = options.requireManifest
    ? validateManifest(options.root)
    : { status: 'not-required', errors: [] };
  if (manifest.status === 'fail' || manifest.status === 'missing') {
    throw new Error(manifest.errors.join('\n'));
  }
  const receipt = {
    schema: 'hololand.model-village.character-appearance-h3g-witness.v1',
    status: 'pass',
    generatedAt: new Date().toISOString(),
    source: {
      path: SOURCE_REL,
      sha256: sha256(stack.sourceText),
      upstreamHoloScriptCommit: stack.contract.metadata.upstreamHoloScriptCommit,
    },
    policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
    seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
    native: {
      bundleCount: hairResponse.native.records.flatMap((record) => record.tiers).length,
      topology: 'neutral-anatomical-v2',
      ocularProfile: 'layered-ocular-v1',
      orbitalProfile: 'recessed-lids-v1',
      groomProfile: 'scalp-flow-v1',
      scalpSurface: 'neutral-anatomical-ellipsoid',
      coverageProfile: 'alpha-to-coverage-v1',
      opaqueComparisonProfile: 'opaque-v1',
      hairMaterialReceiptSchema: EXPECTED_HAIR_MATERIAL_SCHEMA,
      sourceChromaWeightAuthored: true,
      upstreamUnauthoredChromaWeight: UPSTREAM_UNAUTHORED_CHROMA_WEIGHT,
      authoredSourceChromaWeights: Object.fromEntries(
        validation.plan.personas.map((persona) => [persona.personaId, persona.sourceColorWeight])
      ),
      multisampleCount: 4,
      alphaToCoverageRequested: true,
      tangentAttribute: 'strand-flow',
      cardUvAttribute: 'card-width',
      ocularRegions: EXPECTED_REGIONS,
      ocularGroupsPerBundle: 8,
      visualHairLod: 1,
      comparisons: hairResponse.comparisons,
      bundles: hairResponse.native.records.map((record) => ({
        personaId: record.personaId,
        tiers: record.tiers.map(({ bundle, ...tier }) => tier),
      })),
    },
    visual,
    surface,
    manifest,
    boundaries: {
      presentationShaderOverrideUsed: false,
      presentationMaterialBridgeUsed: true,
      presentationAlphaMapUsed: true,
      externalHairTextureUsed: false,
      hairCardAlphaCoverageClaimed: true,
      sourceChromaWeightAuthoredClaimed: true,
      unauthoredChromaBlendClaimed: false,
      strandAlphaCoverageClaimed: false,
      strandHairClaimed: false,
      productionGroomClaimed: false,
      anatomicalHairAccuracyClaimed: false,
      scanDerivedGroomClaimed: false,
      photorealismClaimed: false,
      biometricLikenessClaimed: false,
      canonicalWrites: 0,
      residentObservationWrites: 0,
      modelCalls: 0,
      externalNetworkRequests: visual?.externalRequests.length || 0,
    },
  };
  receipt.receiptSha256 = sha256(JSON.stringify(canonical(receipt)));
  mkdirSync(options.outputDir, { recursive: true });
  const receiptPath = path.join(options.outputDir, 'character-appearance-h3g-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receipt, receiptPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3G(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.error(`[H3G] PASS ${receipt.receiptSha256}`);
      console.error(`[H3G] receipt ${receiptPath}`);
    })
    .catch((error) => {
      console.error(`[H3G] FAIL ${error?.stack || error}`);
      process.exitCode = 1;
    });
}
