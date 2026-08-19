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
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3f-native-groom.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3f-native-groom-policy.hsplus';
const SEED_REL = 'source/proofs/model-village-character-appearance-h3f-native-groom-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3f-native-groom-manifest.holo';
const REPORT_REL = 'docs/reports/model-village-character-appearance-h3f-native-groom-2026-07-28.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3f-native-groom-portraits-2026-07-28.png';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3f';
const EXPECTED_COMMIT = 'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2';
const EXPECTED_PERSONAS = ['hearth_keeper', 'path_tender', 'record_steward'];
const EXPECTED_REGIONS = ['sclera', 'iris', 'pupil', 'cornea'];
// H4J-era upstream added a hair-material record to the derived groom receipt
// that did not exist at the originally pinned commit. H3F is the pre-coverage,
// pre-chroma-weight gate: it authors hair colour and groom geometry only.
// `sourceColorWeight` is therefore expected to be the UNAUTHORED upstream
// default, and the checker requires that no `@hair(source_color_weight)` was
// mapped. That pair is the H3F/H3G boundary, made checkable.
const EXPECTED_HAIR_MATERIAL_SCHEMA = 'holoscript.agent-avatar-hair-material.v2';
const EXPECTED_HAIR_SHADING_MODEL = 'marschner-hair';
const EXPECTED_HAIR_COVERAGE_PROFILE = 'opaque-v1';
const EXPECTED_HAIR_STRAND_COVERAGE = 1;
const UPSTREAM_UNAUTHORED_SOURCE_COLOR_WEIGHT = 0.55;
const HASH_BINDINGS = [
  ['inheritedH3ESource', 'inheritedH3ESourceSha256', 'hololand'],
  ['upstreamGroomBuilderPath', 'upstreamGroomBuilderSha256', 'holoscript'],
  ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', 'holoscript'],
  ['upstreamCompositionBridgePath', 'upstreamCompositionBridgeSha256', 'holoscript'],
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

export async function parseH3FStack(root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3F .holo', source],
    ['H3F .hsplus', policy],
    ['H3F .hs', seed],
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

export function buildH3FPlan(contract) {
  return {
    milestone: contract.metadata.milestone,
    presentationProfile: contract.state.presentationProfile,
    nativeAdmission: contract.state.nativeAdmission,
    benchmark: contract.state.benchmark,
    personas: contract.objects
      .filter((object) => object.type === 'native_groom_civic_persona')
      .map((persona) => ({
        objectId: persona.objectId,
        personaId: persona.personaId,
        civicRole: persona.civicRole,
        displayLabel: persona.displayLabel,
        irisColor: persona.irisColor,
        hairColor: persona.hairColor,
        hairColorInt: Number.parseInt(String(persona.hairColor).replace('#', ''), 16),
        nativeHairStyleId: persona.nativeHairStyleId,
        groomProfile: persona.groomProfile,
        cardWidth: persona.cardWidth,
        rootLift: persona.rootLift,
        tipTaper: persona.tipTaper,
        hairlineBias: persona.hairlineBias,
      })),
    expressions: [],
  };
}

export function validateH3FContract(stack, root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state } = stack.contract;
  expect(metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3F_NATIVE_GROOM', 'milestone drifted');
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
    ['presentationShaderOverrideUsed', false],
    ['hairAlphaMaskUsed', false],
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
    state.groomFoundation?.profile === 'scalp-flow-v1' &&
      state.groomFoundation?.legacyComparisonProfile === 'radial-cards-v1' &&
      state.groomFoundation?.scalpSurface === 'neutral-anatomical-ellipsoid' &&
      state.groomFoundation?.rootTangentRadialDotP95Maximum === 0.01 &&
      state.groomFoundation?.scalpTangentRoots === true &&
      state.groomFoundation?.scalpAlignedCardBasis === true &&
      state.groomFoundation?.smoothTipTaper === true &&
      state.groomFoundation?.retractedFrontHairline === true &&
      state.groomFoundation?.derivedReceipt === true &&
      state.groomFoundation?.presentationShaderOverride === false &&
      state.groomFoundation?.hairAlphaMask === false &&
      state.groomFoundation?.strandAlphaCoverage === false,
    'groom foundation truth boundary drifted'
  );
  expect(
    state.nativeAdmission?.compilerTarget === 'character-webgpu' &&
      state.nativeAdmission?.fallbackAllowed === false &&
      state.nativeAdmission?.exactNineNativeBundlesRequired === true &&
      state.nativeAdmission?.neutralScalpSurfaceRequired === true &&
      state.nativeAdmission?.exactEightOcularGroupsPerBundleRequired === true &&
      state.nativeAdmission?.mappedGroomReceiptRequired === true &&
      state.nativeAdmission?.derivedGroomReceiptRequired === true &&
      state.nativeAdmission?.legacyRadialComparisonRequired === true &&
      state.nativeAdmission?.lowerRootRadialDotRequired === true &&
      state.nativeAdmission?.lowerFrontalOcclusionRequired === true &&
      state.nativeAdmission?.authoredCardWidthOperative === true &&
      state.nativeAdmission?.authoredRootLiftOperative === true &&
      state.nativeAdmission?.authoredTipTaperOperative === true &&
      state.nativeAdmission?.authoredHairlineBiasOperative === true &&
      state.nativeAdmission?.compiledHairMaterialWitnessRequired === true &&
      state.nativeAdmission?.compiledOpaqueCoverageRequired === true &&
      state.nativeAdmission?.compiledAlphaToCoverageForbidden === true &&
      state.nativeAdmission?.authoredHairColorReachesMaterialRequired === true &&
      state.nativeAdmission?.unauthoredSourceColorWeightRequired === true,
    'native groom admission drifted'
  );
  expect(
    state.groomMaterialFoundation?.schemaVersion === EXPECTED_HAIR_MATERIAL_SCHEMA &&
      state.groomMaterialFoundation?.shadingModel === EXPECTED_HAIR_SHADING_MODEL &&
      state.groomMaterialFoundation?.coverageProfile === EXPECTED_HAIR_COVERAGE_PROFILE &&
      state.groomMaterialFoundation?.strandCoverage === EXPECTED_HAIR_STRAND_COVERAGE &&
      state.groomMaterialFoundation?.alphaToCoverageRequested === false &&
      state.groomMaterialFoundation?.authoredSourceColorReachesMaterial === true &&
      state.groomMaterialFoundation?.sourceColorWeightAuthoredHere === false &&
      state.groomMaterialFoundation?.upstreamUnauthoredSourceColorWeight ===
        UPSTREAM_UNAUTHORED_SOURCE_COLOR_WEIGHT,
    'groom material truth boundary drifted'
  );
  const plan = buildH3FPlan(stack.contract);
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
      hair?.config?.groom_profile === 'scalp_flow_v1' &&
        hair?.config?.card_width === persona.cardWidth &&
        hair?.config?.root_lift === persona.rootLift &&
        hair?.config?.tip_taper === persona.tipTaper &&
        hair?.config?.hairline_bias === persona.hairlineBias,
      `${persona.personaId} source-authored groom parameters drifted`
    );
  }
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
      entityId: `model-village-h3f-${objectId.toLowerCase()}`,
      lodLevel,
    },
  });
}

function withoutScalpFlowGroom(ast) {
  const copy = structuredClone(ast);
  for (const object of copy.objects || []) {
    const hair = object.traits?.find((trait) => trait.name === 'hair');
    if (!hair) continue;
    for (const key of ['groom_profile', 'card_width', 'root_lift', 'tip_taper', 'hairline_bias']) {
      delete hair.config[key];
    }
  }
  return copy;
}

function ocularGroups(bundle) {
  return bundle.materialGroups.filter((group) => group.material.shadingModel === 'refractive-eye');
}

/**
 * H3F's central truth boundary is "opaque procedural cards, no alpha mask, no
 * strand coverage, no authored chroma weight". Upstream now emits every one of
 * those as a machine-readable field on the derived groom receipt, so the
 * boundary is checked against the COMPILED bundle instead of against the
 * source's own booleans. Returns a list of failure strings.
 */
function hairMaterialFailures(bundle, record) {
  const material = bundle.groom?.material;
  if (!material) return ['derived groom receipt carries no hair material record'];
  const failures = [];
  const need = (condition, message) => {
    if (!condition) failures.push(message);
  };
  need(
    material.schemaVersion === EXPECTED_HAIR_MATERIAL_SCHEMA,
    `hair material schema ${material.schemaVersion} != ${EXPECTED_HAIR_MATERIAL_SCHEMA}`
  );
  need(
    material.shadingModel === EXPECTED_HAIR_SHADING_MODEL,
    `hair shading model ${material.shadingModel} != ${EXPECTED_HAIR_SHADING_MODEL}`
  );
  need(
    material.coverageProfile === EXPECTED_HAIR_COVERAGE_PROFILE,
    `hair coverage profile ${material.coverageProfile} != ${EXPECTED_HAIR_COVERAGE_PROFILE}`
  );
  need(
    material.strandCoverage === EXPECTED_HAIR_STRAND_COVERAGE,
    `hair strand coverage ${material.strandCoverage} != ${EXPECTED_HAIR_STRAND_COVERAGE}`
  );
  need(
    material.alphaToCoverageRequested === false,
    'hair material requested alpha-to-coverage, which H3F does not admit'
  );
  need(
    material.sourceColor === record.hairColorInt,
    `hair material sourceColor ${material.sourceColor} != authored ${record.hairColorInt}`
  );
  need(
    material.sourceColorWeight === UPSTREAM_UNAUTHORED_SOURCE_COLOR_WEIGHT,
    `hair source colour weight ${material.sourceColorWeight} != unauthored upstream default ` +
      `${UPSTREAM_UNAUTHORED_SOURCE_COLOR_WEIGHT}`
  );
  need(
    !(bundle.report?.mapped || []).some((entry) => entry.startsWith('@hair(source_color_weight')),
    'H3F mapped an authored @hair(source_color_weight); that control belongs to H3G'
  );
  return failures;
}

export async function compileH3FGroomBundles(stack, plan) {
  const native = await compileH3BNativeBundles(stack.core, stack.source.ast, plan);
  const comparisons = [];
  for (const record of native.records) {
    for (const tier of record.tiers) {
      const { bundle } = tier;
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
        bundle.groom?.rootTangentRadialDotP95 > 0.01 ||
        groups.length !== 8 ||
        !EXPECTED_REGIONS.every((region) => regionCounts[region] === 2) ||
        !bundle.report?.mapped?.some((entry) =>
          entry.startsWith('@hair(groom_profile=scalp-flow-v1')
        ) ||
        bundle.report?.stubbed?.length !== 0
      ) {
        throw new Error(`${record.personaId} LOD${tier.level} native groom contract drifted`);
      }
      const materialFailures = hairMaterialFailures(bundle, record);
      if (materialFailures.length) {
        throw new Error(
          `${record.personaId} LOD${tier.level} hair material boundary drifted: ` +
            materialFailures.join('; ')
        );
      }
      tier.ocularGroupCount = groups.length;
      tier.hairMaterial = bundle.groom.material;
      tier.ocularRegions = regionCounts;
      tier.groom = bundle.groom;

      const legacy = await exportBundle(
        stack.core,
        withoutScalpFlowGroom(stack.source.ast),
        record.objectId,
        tier.level
      );
      if (!legacy.success || legacy.usedFallback) {
        throw new Error(`${record.personaId} LOD${tier.level} legacy groom compile failed`);
      }
      const legacyBundle = JSON.parse(legacy.output);
      if (
        legacyBundle.groom?.profile !== 'radial-cards-v1' ||
        !(
          bundle.groom.rootTangentRadialDotP95 < legacyBundle.groom.rootTangentRadialDotP95 &&
          bundle.groom.frontalOcclusionVertexCount < legacyBundle.groom.frontalOcclusionVertexCount
        )
      ) {
        throw new Error(`${record.personaId} LOD${tier.level} groom comparison failed`);
      }
      comparisons.push({
        personaId: record.personaId,
        level: tier.level,
        scalpFlow: bundle.groom,
        legacyRadial: legacyBundle.groom,
        vertexDelta: bundle.groom.vertexCount - legacyBundle.groom.vertexCount,
        triangleDelta: bundle.groom.triangleCount - legacyBundle.groom.triangleCount,
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

function h3fBrowserApplication(THREE, RoomEnvironment, payload) {
  const host = document.getElementById('portraits');
  const renderers = [];
  const gpu = {};

  function geometryFromBundle(bundle) {
    const positions = new Float32Array(bundle.mesh.positions);
    const normals = new Float32Array(bundle.mesh.normals);
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
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    if (bundle.mesh.uvs) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bundle.mesh.uvs), 2));
    }
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(bundle.mesh.indices), 1));
    bundle.materialGroups.forEach((group, index) => {
      geometry.addGroup(group.indexStart, group.indexCount, index);
    });
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  function materialFor(group, record) {
    const material = group.material;
    if (material.shadingModel === 'marschner-hair') {
      return new THREE.MeshStandardMaterial({
        color: record.hairColor,
        roughness: 0.7,
        metalness: 0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.58,
      });
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
          // Stamped at construction so the alpha-mask scan can tell THIS material -- a
          // refractive cornea, which H3D REQUIRES to be transparent -- apart from hair
          // rendered with a transparency cheat. Marking it here rather than sniffing
          // (ior === 1.376 && opacity < 1) downstream means nothing can masquerade as a
          // cornea by copying its numbers: only this factory sets the role.
          userData: { h3fMaterialRole: 'refractive-cornea' },
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
    label.innerHTML = `<div><strong>${record.displayLabel}</strong><span>${record.civicRole} · ${record.nativeHairStyleId}</span></div><b>W ${record.cardWidth.toFixed(4)} · T ${record.tipTaper.toFixed(2)} · H ${record.hairlineBias.toFixed(2)}</b>`;
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
    renderer.toneMappingExposure = 0.96;
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
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030a13);
    scene.fog = new THREE.FogExp2(0x030a13, 0.34);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
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

    const bundle = record.tiers[2].bundle;
    const geometry = geometryFromBundle(bundle);
    const mesh = new THREE.Mesh(
      geometry,
      bundle.materialGroups.map((group) => materialFor(group, record))
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
    const visualTier = payload.records[0].tiers[2].bundle;
    const sceneMaterials = [];
    // Keep each material's owning mesh alongside it. Without this the alpha-mask scan below
    // can say only THAT something in the scene was transparent, never WHICH thing -- and
    // "the hair is alpha-masked" and "the cornea is refractive, as required" are then
    // indistinguishable.
    const sceneMaterialOwners = [];
    for (const { scene } of renderers) {
      scene.traverse((node) => {
        if (!node.isMesh) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (!material) continue;
          sceneMaterials.push(material);
          sceneMaterialOwners.push({
            mesh: node.name || '(unnamed)',
            material: material.name || '(unnamed)',
            type: material.type ?? null,
            shadingModel:
              material.userData?.shadingModel ?? material.shadingModel ?? null,
            role: material.userData?.h3fMaterialRole ?? null,
            eyeRegion: material.userData?.eyeRegion ?? null,
            opacity: material.opacity ?? null,
            ior: material.ior ?? null,
            transmission: material.transmission ?? null,
            transparent: material.transparent === true,
            alphaTest: material.alphaTest ?? 0,
            alphaToCoverage: material.alphaToCoverage === true,
            alphaMap: Boolean(material.alphaMap),
          });
        }
      });
    }
    window.__H3F_RESULT__ = {
      gpu,
      frameP95Milliseconds: payload.percentile(frameTimes, 0.95),
      renderSubmitP95Milliseconds: payload.percentile(submitTimes, 0.95),
      rendererCount: renderers.length,
      orbitalProfile: visualTier.face.orbitalProfile,
      groomProfile: visualTier.groom.profile,
      scalpSurface: visualTier.groom.scalpSurface,
      rootTangentRadialDotP95: visualTier.groom.rootTangentRadialDotP95,
      frontalOcclusionVertexCount: visualTier.groom.frontalOcclusionVertexCount,
      ocularMaterialGroupCount: visualTier.materialGroups.filter(
        (group) => group.material.shadingModel === 'refractive-eye'
      ).length,
      hairMaterial: visualTier.groom.material,
      // Measured from the materials this page actually built, not asserted as a
      // literal: a swapped-in ShaderMaterial or any alpha-masked hair material
      // now shows up here instead of being reported absent by construction.
      presentationShaderOverrideUsed: sceneMaterials.some(
        (material) => material?.isShaderMaterial === true || material?.isRawShaderMaterial === true
      ),
      // The scan stays broad -- every mesh material in the scene, so a swapped-in material
      // still shows up -- but the refractive corneas this page itself built are excluded,
      // because H3D REQUIRES them to be transparent. Excluding them is not a loosening:
      // their count is asserted below, so an extra "cornea" cannot smuggle a masked
      // material through, and an alpha-masked HAIR material still fails exactly as before.
      hairAlphaMaskUsed: sceneMaterials.some(
        (material) =>
          material?.userData?.h3fMaterialRole !== 'refractive-cornea' &&
          (material?.transparent === true ||
            (material?.alphaTest ?? 0) > 0 ||
            material?.alphaToCoverage === true ||
            Boolean(material?.alphaMap))
      ),
      alphaMaskOffenders: sceneMaterialOwners.filter(
        (owner) =>
          owner.role !== 'refractive-cornea' &&
          (owner.transparent || owner.alphaTest > 0 || owner.alphaToCoverage || owner.alphaMap)
      ),
      corneaMaterialCount: sceneMaterials.filter(
        (material) => material?.userData?.h3fMaterialRole === 'refractive-cornea'
      ).length,
      visualHairLod: 2,
      sourceCommit: payload.sourceCommit,
    };
    window.__H3F_READY__ = true;
  }

  run().catch((error) => {
    window.__H3F_ERROR__ = error?.stack || error?.message || String(error);
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
  const bundlePath = path.join(options.outputDir, 'h3f-native-groom.bundle.js');
  const htmlPath = path.join(options.outputDir, 'h3f-native-groom.html');
  const payload = {
    sourceCommit: compiled.stack.contract.metadata.upstreamHoloScriptCommit,
    records: compiled.groom.native.records.map((record) => ({
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
    `(${h3fBrowserApplication.toString()})(THREE, RoomEnvironment, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'h3f-native-groom.entry.js',
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
  <title>Stormglass Character Appearance H3F</title>
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
    <div class="eyebrow">STORMGLASS COMMONS // NATIVE CHARACTER H3F</div>
    <h1>Scalp-Flow Groom</h1>
    <div class="sub">@hair(groom_profile: scalp_flow_v1)<br>SCALP-TANGENT ROOTS · TIP TAPER · RETRACTED HAIRLINE</div>
  </header>
  <main id="portraits"></main>
  <footer>
    <div>HEARTHLIGHT BIOREALISM · CHARACTER-WEBGPU SOURCE BUNDLES · LOD2</div>
    <div class="truth">NO HAIR ALPHA MASK · NO STRAND HAIR · NOT A PHOTOREALISM CLAIM</div>
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
    await page.waitForFunction(() => window.__H3F_READY__ || window.__H3F_ERROR__, null, {
      timeout: 60_000,
    });
    const browserError = await page.evaluate(() => window.__H3F_ERROR__ || null);
    if (browserError) throw new Error(browserError);
    const result = await page.evaluate(() => window.__H3F_RESULT__);
    if (!/NVIDIA/i.test(result.gpu.renderer) || !/(Direct3D11|D3D11)/i.test(result.gpu.renderer)) {
      throw new Error(`hardware D3D11 renderer required, received ${result.gpu.renderer}`);
    }
    // Eleven separate propositions. They used to collapse into one opaque
    // "contract drifted", which named neither the term that failed nor the value it saw --
    // so a red run said only that something in the browser was wrong. The compile layer
    // above already reports each mismatch by name; this now matches that idiom.
    const browserContract = [
      ['orbitalProfile', result.orbitalProfile, 'recessed-lids-v1'],
      ['groomProfile', result.groomProfile, 'scalp-flow-v1'],
      ['scalpSurface', result.scalpSurface, 'neutral-anatomical-ellipsoid'],
      ['ocularMaterialGroupCount', result.ocularMaterialGroupCount, 8],
      ['presentationShaderOverrideUsed', result.presentationShaderOverrideUsed, false],
      [
        `hairAlphaMaskUsed [offenders: ${JSON.stringify(result.alphaMaskOffenders ?? [])}]`,
        result.hairAlphaMaskUsed,
        false,
      ],
      ['hairMaterial.coverageProfile', result.hairMaterial?.coverageProfile, EXPECTED_HAIR_COVERAGE_PROFILE],
      ['hairMaterial.strandCoverage', result.hairMaterial?.strandCoverage, EXPECTED_HAIR_STRAND_COVERAGE],
      ['hairMaterial.alphaToCoverageRequested', result.hairMaterial?.alphaToCoverageRequested, false],
      ['hairMaterial.sourceColorWeight', result.hairMaterial?.sourceColorWeight, UPSTREAM_UNAUTHORED_SOURCE_COLOR_WEIGHT],
    ];
    const drifted = browserContract
      .filter(([, actual, expected]) => actual !== expected)
      .map(([name, actual, expected]) => `${name}=${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
    // A threshold, not an equality, so it is checked apart from the table above.
    if (!(result.rootTangentRadialDotP95 <= 0.01)) {
      drifted.push(`rootTangentRadialDotP95=${result.rootTangentRadialDotP95} (expected <= 0.01)`);
    }
    // Binds the cornea exclusion above. Exactly two refractive corneas per rendered avatar
    // may be exempt from the alpha-mask scan -- one per eye. Without this an extra material
    // stamped as a cornea would be silently exempt, turning a narrowed check into a hole.
    const expectedCorneaMaterials = result.rendererCount * 2;
    if (result.corneaMaterialCount !== expectedCorneaMaterials) {
      drifted.push(
        `corneaMaterialCount=${result.corneaMaterialCount} ` +
          `(expected ${expectedCorneaMaterials}: two per rendered avatar)`
      );
    }
    if (drifted.length) {
      throw new Error(`browser groom material contract drifted: ${drifted.join('; ')}`);
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
      'scripts/check-hololand-model-village-character-appearance-h3f.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3f.test.mjs',
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

export async function runCharacterAppearanceH3F(options = parseArgs([])) {
  const stack = await parseH3FStack(options.root, options.holoScriptRoot);
  const validation = validateH3FContract(stack, options.root, options.holoScriptRoot);
  if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
  const groom = await compileH3FGroomBundles(stack, validation.plan);
  let visual = null;
  let surface = null;
  if (!options.compileOnly) {
    const modules = await loadWorkspaceModules(options.holoScriptRoot);
    surface = await buildBrowserSurface({ stack, groom }, options, modules);
    visual = await captureBrowser(surface, options, modules);
  }
  const manifest = options.requireManifest
    ? validateManifest(options.root)
    : { status: 'not-required', errors: [] };
  if (manifest.status === 'fail' || manifest.status === 'missing') {
    throw new Error(manifest.errors.join('\n'));
  }
  const receipt = {
    schema: 'hololand.model-village.character-appearance-h3f-witness.v1',
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
      bundleCount: groom.native.records.flatMap((record) => record.tiers).length,
      topology: 'neutral-anatomical-v2',
      ocularProfile: 'layered-ocular-v1',
      orbitalProfile: 'recessed-lids-v1',
      groomProfile: 'scalp-flow-v1',
      scalpSurface: 'neutral-anatomical-ellipsoid',
      hairMaterialSchemaVersion: EXPECTED_HAIR_MATERIAL_SCHEMA,
      hairCoverageProfile: EXPECTED_HAIR_COVERAGE_PROFILE,
      hairStrandCoverage: EXPECTED_HAIR_STRAND_COVERAGE,
      hairAlphaToCoverageRequested: false,
      hairSourceColorWeightAuthoredHere: false,
      hairSourceColorWeight: UPSTREAM_UNAUTHORED_SOURCE_COLOR_WEIGHT,
      legacyComparisonProfile: 'radial-cards-v1',
      ocularRegions: EXPECTED_REGIONS,
      ocularGroupsPerBundle: 8,
      visualHairLod: 2,
      comparisons: groom.comparisons,
      bundles: groom.native.records.map((record) => ({
        personaId: record.personaId,
        tiers: record.tiers.map(({ bundle, ...tier }) => tier),
      })),
    },
    visual,
    surface,
    manifest,
    boundaries: {
      presentationShaderOverrideUsed: visual ? visual.presentationShaderOverrideUsed : false,
      hairAlphaMaskUsed: visual ? visual.hairAlphaMaskUsed : false,
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
  const receiptPath = path.join(options.outputDir, 'character-appearance-h3f-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receipt, receiptPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3F(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.error(`[H3F] PASS ${receipt.receiptSha256}`);
      console.error(`[H3F] receipt ${receiptPath}`);
    })
    .catch((error) => {
      console.error(`[H3F] FAIL ${error?.stack || error}`);
      process.exitCode = 1;
    });
}
