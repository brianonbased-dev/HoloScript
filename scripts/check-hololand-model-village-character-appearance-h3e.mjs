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
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3e-orbital-fit.holo';
const POLICY_REL = 'source/proofs/model-village-character-appearance-h3e-orbital-fit-policy.hsplus';
const SEED_REL = 'source/proofs/model-village-character-appearance-h3e-orbital-fit-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3e-orbital-fit-manifest.holo';
const REPORT_REL = 'docs/reports/model-village-character-appearance-h3e-orbital-fit-2026-07-28.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3e-orbital-fit-portraits-2026-07-28.png';
const OUTPUT_REL = '.tmp/hololand/model-village/character-appearance-h3e';
const EXPECTED_COMMIT = 'c273682f5a5140b0ff8cde5da89ca7bfb98c63b2';
const EXPECTED_PERSONAS = ['hearth_keeper', 'path_tender', 'record_steward'];
const EXPECTED_REGIONS = ['sclera', 'iris', 'pupil', 'cornea'];
const EXPECTED_ORBITAL_VERTEX_DELTA = 76;
const EXPECTED_ORBITAL_TRIANGLE_DELTA = 76;
const EXPECTED_ORBITAL_PROFILE = 'recessed-lids-v1';
// H3E's "legacy tearline comparison" is a comparison against a NAMED upstream profile, not
// against "whatever the builder does when the keys are missing". Asserting the name keeps the
// +76/+76 delta meaningful if the default ever moves.
const EXPECTED_LEGACY_COMPARISON_PROFILE = 'tearline-rim-v1';
// H4J-era upstream (b5d9c7588, cc254a641) grew the lid catalog from the two profiles that existed
// when H3E was authored to five. H3E stays on recessed-lids-v1 deliberately; the newer profiles are
// admitted BY NAME so that a SIXTH one is a decision someone has to make, not a silent inheritance.
const ADMITTED_ORBITAL_PROFILE_CATALOG = [
  'tearline-rim-v1',
  'recessed-lids-v1',
  'anatomical-lid-fold-v2',
  'anatomical-lid-blend-v3',
  'integrated-lid-rim-v4',
];
// Refinements that belong to the newer profiles. H3E claims a v1 construction, so seeing any of
// these on its own receipt means the authored selection was silently upgraded underneath it.
const REFUSED_LID_REFINEMENTS = [
  'lidFoldProfile',
  'lidTransitionProfile',
  'lidTransitionRows',
  'integratedLidProfile',
  'integratedLidVertexCount',
  'headStitchTriangleCount',
  'headSurfaceVertexRange',
];
const EXPECTED_ORBITAL_VERTICES_PER_PERSONA = 152;
const EXPECTED_ORBITAL_INDICES_PER_PERSONA = 432;
const EXPECTED_LEGACY_ORBITAL_VERTICES_PER_PERSONA = 76;
const EXPECTED_LEGACY_ORBITAL_INDICES_PER_PERSONA = 204;
// The contract claims the three authored parameters are OPERATIVE. A value that round-trips into
// the receipt proves only that it was recorded. Each probe perturbs exactly one parameter, inside
// the upstream clamp so the value survives unmodified, and requires the emitted mesh to move.
const OPERATIVE_ORBITAL_PROBES = [
  { key: 'eye_recess', receiptKey: 'eyeRecess', perturbed: 0.4 },
  { key: 'lid_opening', receiptKey: 'lidOpening', perturbed: 0.6 },
  { key: 'canthal_tilt', receiptKey: 'canthalTilt', perturbed: 0.22 },
];
const HASH_BINDINGS = [
  ['inheritedH3DSource', 'inheritedH3DSourceSha256', 'hololand'],
  ['upstreamFaceBuilderPath', 'upstreamFaceBuilderSha256', 'holoscript'],
  ['upstreamOcularBuilderPath', 'upstreamOcularBuilderSha256', 'holoscript'],
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

/**
 * The character-render bridge H3E already pins by path and sha256
 * (`upstreamCompositionBridgePath`). It is the surface that CONSTRUCTS the orbital geometry, and
 * since holoscript cc254a641 it returns the exact construction receipt. The character-webgpu
 * drawspec does not carry that receipt forward (see the report), so witnessing the pinned bridge
 * is the only way to read the numbers H3E's contract states.
 */
async function loadEngine(holoScriptRoot) {
  return import(pathToFileURL(path.join(holoScriptRoot, 'packages/engine/dist/index.js')).href);
}

/** The subset of the parsed composition the character-render bridge reads. */
function bridgeObject(object) {
  return {
    id: object.id,
    name: object.name,
    position: object.position
      ? { x: object.position.x, y: object.position.y, z: object.position.z }
      : undefined,
    template: object.template,
    traits: (object.traits || []).map((trait) => ({ name: trait.name, config: trait.config })),
    children: (object.children || []).map(bridgeObject),
  };
}

function bridgeComposition(ast) {
  return {
    name: ast.name,
    objects: (ast.objects || []).map(bridgeObject),
    templates: (ast.templates || []).map((template) => ({
      name: template.name,
      traits: (template.traits || []).map((trait) => ({ name: trait.name, config: trait.config })),
    })),
    spatialGroups: (ast.spatialGroups || []).map((group) => ({
      objects: (group.objects || []).map(bridgeObject),
    })),
  };
}

export async function parseH3EStack(root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3E .holo', source],
    ['H3E .hsplus', policy],
    ['H3E .hs', seed],
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

export function buildH3EPlan(contract) {
  return {
    milestone: contract.metadata.milestone,
    presentationProfile: contract.state.presentationProfile,
    nativeAdmission: contract.state.nativeAdmission,
    benchmark: contract.state.benchmark,
    personas: contract.objects
      .filter((object) => object.type === 'native_orbital_civic_persona')
      .map((persona) => ({
        objectId: persona.objectId,
        personaId: persona.personaId,
        civicRole: persona.civicRole,
        displayLabel: persona.displayLabel,
        irisColor: persona.irisColor,
        hairColor: persona.hairColor,
        nativeHairStyleId: persona.nativeHairStyleId,
        eyeRecess: persona.eyeRecess,
        lidOpening: persona.lidOpening,
        canthalTilt: persona.canthalTilt,
      })),
    expressions: [],
  };
}

export function validateH3EContract(stack, root = ROOT, holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const { metadata, state } = stack.contract;
  expect(metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3E_ORBITAL_FIT', 'milestone drifted');
  expect(metadata.artStyle === 'hearthlight_biorealism', 'art style drifted');
  expect(metadata.upstreamHoloScriptCommit === EXPECTED_COMMIT, 'upstream commit pin drifted');
  for (const [key, expected] of [
    ['nativeCharacterCompilerClaimed', true],
    ['nativeNeutralAnatomicalFaceClaimed', true],
    ['nativeLayeredOcularProfileClaimed', true],
    ['nativeOrbitalProfileClaimed', true],
    ['nativeUpperLidShellClaimed', true],
    ['nativeLowerLidShellClaimed', true],
    ['nativeGlobeRecessionClaimed', true],
    ['nativeCanthalShapingClaimed', true],
    ['nativeAlmondApertureClaimed', true],
    ['presentationShaderOverrideUsed', false],
    ['eyelidTextureMaskUsed', false],
    ['productionTearFilmClaimed', false],
    ['productionLashesClaimed', false],
    ['anatomicalEyeAccuracyClaimed', false],
    ['scanDerivedEyeClaimed', false],
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
    state.orbitalFoundation?.profile === 'recessed-lids-v1' &&
      state.orbitalFoundation?.inheritedOcularProfile === 'layered-ocular-v1' &&
      state.orbitalFoundation?.dedicatedOrbitalVerticesPerPersona === 152 &&
      state.orbitalFoundation?.dedicatedOrbitalIndicesPerPersona === 432 &&
      state.orbitalFoundation?.occludingSkinGeometry === true &&
      state.orbitalFoundation?.presentationShaderOverride === false &&
      state.orbitalFoundation?.eyelidTextureMask === false,
    'orbital foundation truth boundary drifted'
  );
  expect(
    JSON.stringify(state.orbitalFoundation?.admittedOrbitalProfileCatalog) ===
      JSON.stringify(ADMITTED_ORBITAL_PROFILE_CATALOG) &&
      state.orbitalFoundation?.authoredProfileSelection === EXPECTED_ORBITAL_PROFILE &&
      state.orbitalFoundation?.legacyComparisonProfile === EXPECTED_LEGACY_COMPARISON_PROFILE &&
      JSON.stringify(state.orbitalFoundation?.refusedLidRefinements) ===
        JSON.stringify(REFUSED_LID_REFINEMENTS),
    'admitted orbital profile catalog drifted'
  );
  expect(
    state.nativeAdmission?.compilerTarget === 'character-webgpu' &&
      state.nativeAdmission?.fallbackAllowed === false &&
      state.nativeAdmission?.exactNineNativeBundlesRequired === true &&
      state.nativeAdmission?.exactEightOcularGroupsPerBundleRequired === true &&
      state.nativeAdmission?.mappedOrbitalReceiptRequired === true &&
      state.nativeAdmission?.legacyTearlineComparisonRequired === true &&
      state.nativeAdmission?.authoredEyeRecessOperative === true &&
      state.nativeAdmission?.authoredLidOpeningOperative === true &&
      state.nativeAdmission?.authoredCanthalTiltOperative === true &&
      state.nativeAdmission?.orbitalGeometryReceiptWitnessRequired === true &&
      state.nativeAdmission?.authoredParameterPerturbationProofRequired === true,
    'native orbital admission drifted'
  );
  const plan = buildH3EPlan(stack.contract);
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
    expect(
      face?.config?.topology === 'neutral_anatomical_v2' &&
        face?.config?.ocular_profile === 'layered_ocular_v1' &&
        face?.config?.orbital_profile === 'recessed_lids_v1' &&
        face?.config?.eye_recess === persona.eyeRecess &&
        face?.config?.lid_opening === persona.lidOpening &&
        face?.config?.canthal_tilt === persona.canthalTilt,
      `${persona.personaId} source-authored orbital parameters drifted`
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
      entityId: `model-village-h3e-${objectId.toLowerCase()}`,
      lodLevel,
    },
  });
}

function withoutOrbitalFit(ast) {
  const copy = structuredClone(ast);
  for (const object of copy.objects || []) {
    const face = object.traits?.find((trait) => trait.name === 'face');
    if (!face) continue;
    for (const key of ['orbital_profile', 'eye_recess', 'lid_opening', 'canthal_tilt']) {
      delete face.config[key];
    }
  }
  return copy;
}

function ocularGroups(bundle) {
  return bundle.materialGroups.filter((group) => group.material.shadingModel === 'refractive-eye');
}

function withFaceOverride(ast, objectId, key, value) {
  const copy = structuredClone(ast);
  const object = (copy.objects || []).find((candidate) => candidate.name === objectId);
  const face = object?.traits?.find((trait) => trait.name === 'face');
  if (!face) throw new Error(`${objectId} has no @face trait to perturb`);
  face.config[key] = value;
  return copy;
}

function positionDigest(bundle) {
  return sha256(JSON.stringify(bundle.mesh.positions));
}

/**
 * Digest of only the vertices the orbital construction owns. Whole-mesh comparison is too coarse to
 * carry `authoredEyeRecessOperative`: the eye globe moves for other reasons, so a build in which the
 * authored recess reached the eyeball but NOT the lid shells would still look like it moved.
 */
function orbitalPositionDigest(bundle, range) {
  return sha256(
    JSON.stringify(
      bundle.mesh.positions.slice(range.vertexStart * 3, (range.vertexStart + range.vertexCount) * 3)
    )
  );
}

/**
 * Witness the orbital construction ITSELF, not just its echo.
 *
 * Before this, `dedicatedOrbitalVerticesPerPersona: 152` / `dedicatedOrbitalIndicesPerPersona: 432`
 * were prose: they appeared in the .holo, the .hsplus and the .hs and were read by nothing. The
 * pinned bridge reports both, so they become load-bearing here - and they also DERIVE the pinned
 * +76/+76 mesh delta from the named legacy profile, instead of the delta being a magic number.
 */
export async function witnessH3EOrbitalGeometry(
  stack,
  plan,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT
) {
  const engine = await loadEngine(holoScriptRoot);
  const catalog = [...engine.CharacterRender.AGENT_AVATAR_ORBITAL_PROFILES];
  if (JSON.stringify(catalog) !== JSON.stringify(ADMITTED_ORBITAL_PROFILE_CATALOG)) {
    throw new Error(
      `upstream orbital profile catalog drifted: admitted ${JSON.stringify(
        ADMITTED_ORBITAL_PROFILE_CATALOG
      )} but upstream now offers ${JSON.stringify(catalog)} - a new lid profile has to be ` +
        `admitted by name before H3E can claim its v1 selection is still the deliberate one`
    );
  }
  const composition = bridgeComposition(stack.source.ast);
  const build = (projected, objectId, lodLevel) =>
    engine.CharacterRender.buildCharacterHostFromComposition(projected, {
      entityId: `model-village-h3e-${objectId.toLowerCase()}`,
      objectId,
      lodLevel,
    });
  const receipts = [];
  for (const persona of plan.personas) {
    for (const level of [0, 1, 2]) {
      const orbital = build(composition, persona.objectId, level).orbital;
      if (!orbital) {
        throw new Error(
          `${persona.personaId} LOD${level} emitted no orbital geometry receipt: the authored ` +
            `@face(orbital_profile) did not reach a native orbital construction`
        );
      }
      const upgraded = REFUSED_LID_REFINEMENTS.filter((key) => key in orbital);
      if (
        orbital.profile !== EXPECTED_ORBITAL_PROFILE ||
        orbital.eyeRecess !== persona.eyeRecess ||
        orbital.lidOpening !== persona.lidOpening ||
        orbital.canthalTilt !== persona.canthalTilt ||
        orbital.vertexRange?.vertexCount !== EXPECTED_ORBITAL_VERTICES_PER_PERSONA ||
        orbital.indexRange?.indexCount !== EXPECTED_ORBITAL_INDICES_PER_PERSONA ||
        upgraded.length !== 0
      ) {
        throw new Error(
          `${persona.personaId} LOD${level} orbital construction drifted: ` +
            `profile=${orbital.profile} recess=${orbital.eyeRecess} opening=${orbital.lidOpening} ` +
            `tilt=${orbital.canthalTilt} vertices=${orbital.vertexRange?.vertexCount} ` +
            `indices=${orbital.indexRange?.indexCount} ` +
            `silentlyUpgraded=${JSON.stringify(upgraded)}`
        );
      }
      receipts.push({
        personaId: persona.personaId,
        level,
        profile: orbital.profile,
        eyeRecess: orbital.eyeRecess,
        lidOpening: orbital.lidOpening,
        canthalTilt: orbital.canthalTilt,
        dedicatedVertexStart: orbital.vertexRange.vertexStart,
        dedicatedVertexCount: orbital.vertexRange.vertexCount,
        dedicatedIndexCount: orbital.indexRange.indexCount,
      });
    }
  }
  // The legacy comparison is against a NAMED profile. Authoring it explicitly (rather than reading
  // whatever the builder falls back to) is what lets the +76/+76 delta be derived rather than
  // asserted, and it pins the fallback identity: dropping @face(orbital_profile) has to keep
  // landing on tearline-rim-v1, which is the baseline compileH3EOrbitalBundles measures against.
  const legacy = build(
    bridgeComposition(
      withFaceOverride(
        stack.source.ast,
        plan.personas[0].objectId,
        'orbital_profile',
        EXPECTED_LEGACY_COMPARISON_PROFILE.replaceAll('-', '_')
      )
    ),
    plan.personas[0].objectId,
    0
  ).orbital;
  if (
    legacy?.profile !== EXPECTED_LEGACY_COMPARISON_PROFILE ||
    legacy?.vertexRange?.vertexCount !== EXPECTED_LEGACY_ORBITAL_VERTICES_PER_PERSONA ||
    legacy?.indexRange?.indexCount !== EXPECTED_LEGACY_ORBITAL_INDICES_PER_PERSONA
  ) {
    throw new Error(
      `legacy tearline baseline drifted: profile=${legacy?.profile} ` +
        `vertices=${legacy?.vertexRange?.vertexCount} indices=${legacy?.indexRange?.indexCount}`
    );
  }
  const derivedVertexDelta =
    EXPECTED_ORBITAL_VERTICES_PER_PERSONA - EXPECTED_LEGACY_ORBITAL_VERTICES_PER_PERSONA;
  const derivedTriangleDelta =
    (EXPECTED_ORBITAL_INDICES_PER_PERSONA - EXPECTED_LEGACY_ORBITAL_INDICES_PER_PERSONA) / 3;
  if (
    derivedVertexDelta !== EXPECTED_ORBITAL_VERTEX_DELTA ||
    derivedTriangleDelta !== EXPECTED_ORBITAL_TRIANGLE_DELTA
  ) {
    throw new Error(
      `dedicated orbital counts no longer explain the pinned mesh delta: ` +
        `derived vertices=${derivedVertexDelta} triangles=${derivedTriangleDelta}`
    );
  }
  return {
    catalog,
    admittedCatalog: ADMITTED_ORBITAL_PROFILE_CATALOG,
    authoredProfile: EXPECTED_ORBITAL_PROFILE,
    legacyComparisonProfile: legacy.profile,
    legacyDedicatedVertexCount: legacy.vertexRange.vertexCount,
    legacyDedicatedIndexCount: legacy.indexRange.indexCount,
    derivedVertexDelta,
    derivedTriangleDelta,
    receipts,
  };
}

/**
 * `authoredEyeRecessOperative` / `authoredLidOpeningOperative` / `authoredCanthalTiltOperative` were
 * three booleans the contract asserted about ITSELF. Perturb one authored parameter at a time and
 * require the emitted mesh to move: the value has to reach geometry, not just the receipt.
 */
export async function proveAuthoredOrbitalParametersOperative(stack, plan, orbitalRange) {
  const objectId = plan.personas[0].objectId;
  const range = {
    vertexStart: orbitalRange.dedicatedVertexStart,
    vertexCount: orbitalRange.dedicatedVertexCount,
  };
  const baseline = await exportBundle(stack.core, stack.source.ast, objectId, 0);
  if (!baseline.success || baseline.usedFallback) {
    throw new Error('operativeness baseline compile failed');
  }
  const baseBundle = JSON.parse(baseline.output);
  const baseDigest = orbitalPositionDigest(baseBundle, range);
  const proofs = [];
  for (const probe of OPERATIVE_ORBITAL_PROBES) {
    const authored = baseBundle.face?.[probe.receiptKey];
    if (authored === probe.perturbed) {
      throw new Error(`${probe.key} probe is degenerate: authored value equals the perturbation`);
    }
    const result = await exportBundle(
      stack.core,
      withFaceOverride(stack.source.ast, objectId, probe.key, probe.perturbed),
      objectId,
      0
    );
    if (!result.success || result.usedFallback) {
      throw new Error(`${probe.key} perturbation compile failed`);
    }
    const bundle = JSON.parse(result.output);
    if (bundle.face?.[probe.receiptKey] !== probe.perturbed) {
      throw new Error(
        `${probe.key} was clamped or ignored before the receipt: authored ${probe.perturbed}, ` +
          `received ${bundle.face?.[probe.receiptKey]}`
      );
    }
    if (bundle.vertexCount !== baseBundle.vertexCount) {
      throw new Error(
        `${probe.key} changed orbital TOPOLOGY (${baseBundle.vertexCount} -> ` +
          `${bundle.vertexCount}); H3E authors a fit, not a resolution`
      );
    }
    if (orbitalPositionDigest(bundle, range) === baseDigest) {
      throw new Error(
        `${probe.key} is inert on the orbital construction: the authored value round-trips into ` +
          `the receipt but moves none of the ${range.vertexCount} dedicated orbital vertices, so ` +
          `H3E's authoredOperative claim is false`
      );
    }
    proofs.push({
      parameter: probe.key,
      authored,
      perturbed: probe.perturbed,
      vertexCountHeld: bundle.vertexCount,
      orbitalVertexRange: range,
      orbitalPositionsMoved: true,
    });
  }
  return proofs;
}

export async function compileH3EOrbitalBundles(stack, plan) {
  const native = await compileH3BNativeBundles(stack.core, stack.source.ast, plan);
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
        bundle.face?.eyeRecess !== record.eyeRecess ||
        bundle.face?.lidOpening !== record.lidOpening ||
        bundle.face?.canthalTilt !== record.canthalTilt ||
        groups.length !== 8 ||
        !EXPECTED_REGIONS.every((region) => regionCounts[region] === 2) ||
        !bundle.report?.mapped?.includes('@face(orbital_profile=recessed-lids-v1)') ||
        bundle.report?.stubbed?.length !== 0
      ) {
        throw new Error(`${record.personaId} LOD${tier.level} native orbital contract drifted`);
      }
      tier.ocularGroupCount = groups.length;
      tier.ocularRegions = regionCounts;
      tier.orbitalProfile = bundle.face.orbitalProfile;
      tier.eyeRecess = bundle.face.eyeRecess;
      tier.lidOpening = bundle.face.lidOpening;
      tier.canthalTilt = bundle.face.canthalTilt;
    }
  }

  const legacy = await exportBundle(
    stack.core,
    withoutOrbitalFit(stack.source.ast),
    plan.personas[0].objectId,
    0
  );
  if (!legacy.success || legacy.usedFallback) {
    throw new Error('legacy tearline comparison compile failed');
  }
  // "Legacy" is a named profile, not "whatever happens when the keys are missing". If upstream ever
  // changes what an unauthored orbital profile falls back to, the delta below would quietly start
  // measuring something else; this makes that a red instead.
  const namedLegacy = await exportBundle(
    stack.core,
    withFaceOverride(
      stack.source.ast,
      plan.personas[0].objectId,
      'orbital_profile',
      EXPECTED_LEGACY_COMPARISON_PROFILE.replaceAll('-', '_')
    ),
    plan.personas[0].objectId,
    0
  );
  const namedLegacyBundle = namedLegacy.success ? JSON.parse(namedLegacy.output) : null;
  const strippedLegacyBundle = JSON.parse(legacy.output);
  if (
    !namedLegacy.success ||
    namedLegacy.usedFallback ||
    namedLegacyBundle.face?.orbitalProfile !== EXPECTED_LEGACY_COMPARISON_PROFILE ||
    namedLegacyBundle.vertexCount !== strippedLegacyBundle.vertexCount ||
    namedLegacyBundle.mesh.indices.length !== strippedLegacyBundle.mesh.indices.length ||
    positionDigest(namedLegacyBundle) !== positionDigest(strippedLegacyBundle)
  ) {
    throw new Error(
      `unauthored orbital profile no longer falls back to ${EXPECTED_LEGACY_COMPARISON_PROFILE} ` +
        `geometry (named=${namedLegacyBundle?.vertexCount} stripped=${strippedLegacyBundle.vertexCount})`
    );
  }
  const legacyBundle = JSON.parse(legacy.output);
  const nativeBundle = native.records[0].tiers[0].bundle;
  const orbitalVertexDelta = nativeBundle.vertexCount - legacyBundle.vertexCount;
  const orbitalTriangleDelta =
    nativeBundle.mesh.indices.length / 3 - legacyBundle.mesh.indices.length / 3;
  if (
    orbitalVertexDelta !== EXPECTED_ORBITAL_VERTEX_DELTA ||
    orbitalTriangleDelta !== EXPECTED_ORBITAL_TRIANGLE_DELTA
  ) {
    throw new Error(
      `orbital topology delta drifted: vertices=${orbitalVertexDelta} triangles=${orbitalTriangleDelta}`
    );
  }
  return {
    native,
    orbitalVertexDelta,
    orbitalTriangleDelta,
    fittedVertexCount: nativeBundle.vertexCount,
    legacyVertexCount: legacyBundle.vertexCount,
  };
}

function browserBundle(bundle) {
  return {
    vertexCount: bundle.vertexCount,
    mesh: bundle.mesh,
    jointMatrices: bundle.jointMatrices,
    materialGroups: bundle.materialGroups,
    face: bundle.face,
  };
}

function h3eBrowserApplication(THREE, RoomEnvironment, payload) {
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
    label.innerHTML = `<div><strong>${record.displayLabel}</strong><span>${record.civicRole} · ${record.nativeHairStyleId}</span></div><b>R ${record.eyeRecess.toFixed(2)} · O ${record.lidOpening.toFixed(2)} · T ${record.canthalTilt.toFixed(2)}</b>`;
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
    window.__H3E_RESULT__ = {
      gpu,
      frameP95Milliseconds: payload.percentile(frameTimes, 0.95),
      renderSubmitP95Milliseconds: payload.percentile(submitTimes, 0.95),
      rendererCount: renderers.length,
      orbitalProfile: payload.records[0].tiers[2].bundle.face.orbitalProfile,
      ocularMaterialGroupCount: payload.records[0].tiers[2].bundle.materialGroups.filter(
        (group) => group.material.shadingModel === 'refractive-eye'
      ).length,
      presentationShaderOverrideUsed: false,
      eyelidTextureMaskUsed: false,
      visualHairLod: 2,
      sourceCommit: payload.sourceCommit,
    };
    window.__H3E_READY__ = true;
  }

  run().catch((error) => {
    window.__H3E_ERROR__ = error?.stack || error?.message || String(error);
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
  const bundlePath = path.join(options.outputDir, 'h3e-orbital-fit.bundle.js');
  const htmlPath = path.join(options.outputDir, 'h3e-orbital-fit.html');
  const payload = {
    sourceCommit: compiled.stack.contract.metadata.upstreamHoloScriptCommit,
    records: compiled.orbital.native.records.map((record) => ({
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
    `(${h3eBrowserApplication.toString()})(THREE, RoomEnvironment, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'h3e-orbital-fit.entry.js',
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
  <title>Stormglass Character Appearance H3E</title>
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
    <div class="eyebrow">STORMGLASS COMMONS // NATIVE CHARACTER H3E</div>
    <h1>Recessed Orbital Fit</h1>
    <div class="sub">@face(orbital_profile: recessed_lids_v1)<br>GLOBE RECESS · UPPER/LOWER SKIN SHELLS · CANTHAL SHAPING</div>
  </header>
  <main id="portraits"></main>
  <footer>
    <div>HEARTHLIGHT BIOREALISM · CHARACTER-WEBGPU SOURCE BUNDLES · LOD2</div>
    <div class="truth">NO EYELID TEXTURE MASK · NO TEAR FILM/LASH SYSTEM · NOT AN ANATOMICAL ACCURACY CLAIM</div>
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
    await page.waitForFunction(() => window.__H3E_READY__ || window.__H3E_ERROR__, null, {
      timeout: 60_000,
    });
    const browserError = await page.evaluate(() => window.__H3E_ERROR__ || null);
    if (browserError) throw new Error(browserError);
    const result = await page.evaluate(() => window.__H3E_RESULT__);
    if (!/NVIDIA/i.test(result.gpu.renderer) || !/(Direct3D11|D3D11)/i.test(result.gpu.renderer)) {
      throw new Error(`hardware D3D11 renderer required, received ${result.gpu.renderer}`);
    }
    if (
      result.orbitalProfile !== 'recessed-lids-v1' ||
      result.ocularMaterialGroupCount !== 8 ||
      result.presentationShaderOverrideUsed !== false ||
      result.eyelidTextureMaskUsed !== false
    ) {
      throw new Error('browser orbital material contract drifted');
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
      'scripts/check-hololand-model-village-character-appearance-h3e.mjs',
      /checkerSha256:\s*"([0-9a-f]{64})"/,
    ],
    [
      'scripts/__tests__/hololand-model-village-character-appearance-h3e.test.mjs',
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

export async function runCharacterAppearanceH3E(options = parseArgs([])) {
  const stack = await parseH3EStack(options.root, options.holoScriptRoot);
  const validation = validateH3EContract(stack, options.root, options.holoScriptRoot);
  if (validation.status !== 'pass') throw new Error(validation.errors.join('\n'));
  const orbital = await compileH3EOrbitalBundles(stack, validation.plan);
  const orbitalGeometry = await witnessH3EOrbitalGeometry(
    stack,
    validation.plan,
    options.holoScriptRoot
  );
  const operativeProof = await proveAuthoredOrbitalParametersOperative(
    stack,
    validation.plan,
    orbitalGeometry.receipts[0]
  );
  let visual = null;
  let surface = null;
  if (!options.compileOnly) {
    const modules = await loadWorkspaceModules(options.holoScriptRoot);
    surface = await buildBrowserSurface({ stack, orbital }, options, modules);
    visual = await captureBrowser(surface, options, modules);
  }
  const manifest = options.requireManifest
    ? validateManifest(options.root)
    : { status: 'not-required', errors: [] };
  if (manifest.status === 'fail' || manifest.status === 'missing') {
    throw new Error(manifest.errors.join('\n'));
  }
  const receipt = {
    schema: 'hololand.model-village.character-appearance-h3e-witness.v1',
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
      bundleCount: orbital.native.records.flatMap((record) => record.tiers).length,
      topology: 'neutral-anatomical-v2',
      ocularProfile: 'layered-ocular-v1',
      orbitalProfile: 'recessed-lids-v1',
      ocularRegions: EXPECTED_REGIONS,
      ocularGroupsPerBundle: 8,
      dedicatedOrbitalVerticesPerBundle: 152,
      dedicatedOrbitalIndicesPerBundle: 432,
      orbitalVertexDelta: orbital.orbitalVertexDelta,
      orbitalTriangleDelta: orbital.orbitalTriangleDelta,
      orbitalGeometry,
      authoredParameterOperativeProof: operativeProof,
      legacyVertexCount: orbital.legacyVertexCount,
      fittedVertexCount: orbital.fittedVertexCount,
      visualHairLod: 2,
      bundles: orbital.native.records.map((record) => ({
        personaId: record.personaId,
        tiers: record.tiers.map(({ bundle, ...tier }) => tier),
      })),
    },
    visual,
    surface,
    manifest,
    boundaries: {
      presentationShaderOverrideUsed: false,
      eyelidTextureMaskUsed: false,
      productionTearFilmClaimed: false,
      productionLashesClaimed: false,
      anatomicalEyeAccuracyClaimed: false,
      scanDerivedEyeClaimed: false,
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
  const receiptPath = path.join(options.outputDir, 'character-appearance-h3e-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { receipt, receiptPath };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCharacterAppearanceH3E(parseArgs())
    .then(({ receipt, receiptPath }) => {
      console.error(`[H3E] PASS ${receipt.receiptSha256}`);
      console.error(`[H3E] receipt ${receiptPath}`);
    })
    .catch((error) => {
      console.error(`[H3E] FAIL ${error?.stack || error}`);
      process.exitCode = 1;
    });
}
