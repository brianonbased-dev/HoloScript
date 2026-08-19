#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';
const SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3a-neutral-personas.holo';
const POLICY_REL =
  'source/proofs/model-village-character-appearance-h3a-neutral-personas-policy.hsplus';
const SEED_REL =
  'source/proofs/model-village-character-appearance-h3a-neutral-personas-seed.hs';
const MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-character-appearance-h3a-neutral-personas-manifest.holo';
const TEST_REL =
  'scripts/__tests__/hololand-model-village-character-appearance-h3a.test.mjs';
const REPORT_REL =
  'docs/reports/HOLOLAND_MODEL_VILLAGE_CHARACTER_APPEARANCE_H3A_2026-07-27.md';
const HERO_REL =
  'docs/assets/model-village/model-village-character-appearance-h3a-neutral-personas-2026-07-27.png';
const EXPRESSION_REL =
  'docs/assets/model-village/model-village-character-appearance-h3a-expression-preview-2026-07-27.png';
const LOD_REL =
  'docs/assets/model-village/model-village-character-appearance-h3a-lods-2026-07-27.png';
const ACCESSIBILITY_REL =
  'docs/assets/model-village/model-village-character-appearance-h3a-accessibility-2026-07-27.png';
const ATLAS_RELS = Object.freeze({
  albedo:
    'assets/model-village/materials/stormglass-neutral-persona-dermal-albedo-2k.png',
  normal:
    'assets/model-village/materials/stormglass-neutral-persona-dermal-normal-2k.png',
  surfaceMask:
    'assets/model-village/materials/stormglass-neutral-persona-dermal-surface-mask-1k.png',
});
const DEFAULT_OUTPUT = path.join(
  ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'character-appearance-h3a',
);
const PERSONA_IDS = Object.freeze([
  'hearth_keeper',
  'path_tender',
  'record_steward',
]);
const CIVIC_ROLES = Object.freeze(['keeper', 'wayfinder', 'archivist']);
const HAIR_STYLES = Object.freeze([
  'cropped_coils',
  'swept_ridge',
  'braided_crown',
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
]);
const ALLOWED_HAIR_GEOMETRY = new Set([
  'hair_cap',
  'hair_coil',
  'hair_swept_lock',
  'hair_braid_crown',
  'hair_braid',
]);

const SUCCESSOR_CHECKER_REL =
  'scripts/check-hololand-model-village-character-appearance-h3b.mjs';
const SUPERSESSION_PERSONA_TYPES = new Set([
  'neutral_civic_persona_target', // H3A
  'native_neutral_civic_persona', // H3B
]);

function supersessionPersonas(contract) {
  return (contract.objects || []).filter((object) =>
    SUPERSESSION_PERSONA_TYPES.has(object.type),
  );
}

/**
 * The ten properties H3A holds and refuses to be retired into H3B without.
 *
 * Each entry carries a MUTATION, not a hash. A property counts as "asserted by gate G"
 * only when applying that mutation to G's own parsed contract makes G's contract
 * validator emit an error it was not already emitting. Presence is therefore measured by
 * execution, and a value that merely sits in a source file unread does not count -- H3B
 * literally carries atlas, benchmark, civicRole, the tracking defaults and the promotion
 * booleans, and enforces none of them. That gap is exactly what "does not assert" means,
 * and it is why reading H3B's text would have given the wrong answer.
 *
 * This replaces the successor CONTENT HASH pin. That pin was circular -- H3A recorded
 * H3B's source hash while H3B recorded H3A's, so neither file could be edited without
 * invalidating the other and the pair had no fixed point -- and it measured the wrong
 * thing in both directions: it fired on a whitespace change, and it stayed silent when
 * H3B actually gained one of these properties, which is the only event that should ever
 * reopen the retirement question.
 */
export const SUPERSESSION_PROPERTIES = Object.freeze([
  {
    id: 'dermalAtlasCustody',
    label: 'the deterministic dermal atlas custody contract',
    mutate(contract) {
      contract.state.atlas = { ...(contract.state.atlas || {}) };
      contract.state.atlas.algorithm = 'unpinned_third_party_atlas';
      contract.state.atlas.externalUris = ['https://example.invalid/skin.png'];
      contract.state.atlas.albedoSize = [64, 64];
      contract.state.atlas.normalSize = [64, 64];
      contract.state.atlas.surfaceMaskSize = [64, 64];
    },
  },
  {
    id: 'absolutePersonaTriangleBudgets',
    label: 'the absolute per-persona triangle budgets',
    mutate(contract) {
      contract.state.lod = { ...(contract.state.lod || {}) };
      contract.state.lod.maximumPersonaTriangles = [9999999, 9999999, 9999999];
    },
  },
  {
    id: 'benchmarkProtocolShape',
    label: 'the benchmark protocol shape',
    mutate(contract) {
      contract.state.benchmark = { ...(contract.state.benchmark || {}) };
      contract.state.benchmark.warmupFrames = 1;
      contract.state.benchmark.measuredFrames = 1;
      contract.state.benchmark.simultaneousPersonaCount = 1;
    },
  },
  {
    id: 'civicRoleBinding',
    label: 'the civic-role binding',
    mutate(contract) {
      for (const persona of supersessionPersonas(contract)) {
        persona.civicRole = 'unbound';
      }
    },
  },
  {
    id: 'silhouetteAndAtlasCellUniqueness',
    label: 'silhouette and dermal-atlas-cell uniqueness',
    mutate(contract) {
      for (const persona of supersessionPersonas(contract)) {
        persona.silhouetteProfile = 'identical_profile';
        persona.dermalAtlasCell = [0, 0];
      }
    },
  },
  {
    id: 'h2LineagePins',
    label: 'the H2 lineage pins',
    mutate(contract) {
      contract.metadata.inheritedH2SourceSha256 = '0'.repeat(64);
      contract.metadata.inheritedH2ManifestSha256 = '0'.repeat(64);
      contract.metadata.inheritedH2ReportSha256 = '0'.repeat(64);
    },
  },
  {
    id: 'faceAndEyeTrackingDefaults',
    label: 'the face and eye tracking defaults',
    mutate(contract) {
      contract.state.faceTrackingEnabledByDefault = true;
      contract.state.eyeTrackingEnabledByDefault = true;
    },
  },
  {
    id: 'sharedMotionAndCapabilityInvariants',
    label: 'the shared motion and capability invariants',
    mutate(contract) {
      contract.state.sharedMotionQualityInvariant = false;
      contract.state.sharedCapabilityInvariant = false;
    },
  },
  {
    id: 'promotionReplacementBoundary',
    label: 'the promotion and replacement boundary',
    mutate(contract) {
      contract.state.productionProfilePromotionClaimed = true;
      contract.state.publicFirstReleaseReplacementClaimed = true;
    },
  },
  {
    id: 'accessibilityEvidence',
    label: 'the accessibility evidence',
    mutate(contract) {
      contract.state.goldenTargets = (contract.state.goldenTargets || []).filter(
        (target) => !String(target.id).includes('accessibility'),
      );
    },
  },
]);

export const SUPERSESSION_PROPERTY_IDS = Object.freeze(
  SUPERSESSION_PROPERTIES.map((property) => property.id),
);

function sha256(value) {
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

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))
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

function contractFromParsed(parsed) {
  return {
    metadata: parsed.ast.metadata,
    state: properties(parsed.ast.state),
    environment: properties(parsed.ast.environment),
    objects: (parsed.ast.objects || []).map((object) => ({
      name: object.name,
      ...properties(object),
    })),
  };
}

async function loadCore(holoScriptRoot) {
  return import(
    pathToFileURL(path.join(holoScriptRoot, 'packages/core/dist/index.js')).href
  );
}

async function parseStack(root, holoScriptRoot) {
  const core = await loadCore(holoScriptRoot);
  const sourceText = readFileSync(path.join(root, SOURCE_REL), 'utf8');
  const policyText = readFileSync(path.join(root, POLICY_REL), 'utf8');
  const seedText = readFileSync(path.join(root, SEED_REL), 'utf8');
  const source = new core.HoloCompositionParser().parse(sourceText);
  const policy = new core.HoloScriptPlusParser().parse(policyText);
  const seed = new core.HoloScriptCodeParser().parse(seedText);
  for (const [label, parsed] of [
    ['H3A .holo', source],
    ['H3A .hsplus', policy],
    ['H3A .hs', seed],
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
    contract: contractFromParsed(source),
  };
}

export function buildH3APlan(contract) {
  const personas = contract.objects
    .filter((object) => object.type === 'neutral_civic_persona_target')
    .map((persona) => ({
      name: persona.displayLabel,
      personaId: persona.personaId,
      civicRole: persona.civicRole,
      adapterFamilyBinding: persona.adapterFamilyBinding,
      silhouetteProfile: persona.silhouetteProfile,
      dermalAtlasCell: persona.dermalAtlasCell,
      skinBaseColor: persona.skinBaseColor,
      skinUndertoneColor: persona.skinUndertoneColor,
      skinScatterColor: persona.skinScatterColor,
      irisColor: persona.irisColor,
      hairColor: persona.hairColor,
      hairStyleId: persona.hairStyleId,
      faceScale: persona.faceScale,
      jawScale: persona.jawScale,
      noseScale: persona.noseScale,
      eyeSpacing: persona.eyeSpacing,
      hairParts: persona.hairParts,
    }));
  const expressions = contract.objects
    .filter((object) => object.type === 'neutral_persona_expression_target')
    .map((expression) => ({
      expressionId: expression.expressionId,
      nativeMorphTargetClaimed: expression.nativeMorphTargetClaimed,
      eyelidScale: expression.eyelidScale,
      browRotationDegrees: expression.browRotationDegrees,
      mouthWidthScale: expression.mouthWidthScale,
      mouthHeightScale: expression.mouthHeightScale,
      mouthCornerLift: expression.mouthCornerLift,
      jawDrop: expression.jawDrop,
    }));
  return {
    milestone: contract.metadata.milestone,
    presentationProfile: contract.state.presentationProfile,
    upstreamNativeAdmission: contract.state.upstreamNativeAdmission,
    sharedSurface: contract.state.sharedSurface,
    atlas: contract.state.atlas,
    lod: contract.state.lod,
    benchmark: contract.state.benchmark,
    resetEvents: contract.state.resetEvents,
    goldenTargets: contract.state.goldenTargets,
    personas,
    expressions,
  };
}

export function validateH3AContract(
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
    metadata.milestone === 'MV_CHARACTER_APPEARANCE_H3A_SHADOW_TARGET',
    'milestone must be MV_CHARACTER_APPEARANCE_H3A_SHADOW_TARGET',
  );
  expect(
    metadata.artStyle === 'hearthlight_biorealism',
    'art style must remain hearthlight_biorealism',
  );
  expect(
    state.fullH3PromotionStatus ===
      'historical_boundary_satisfied_native_channels_carried_by_h3b',
    'H3A must state the resolved historical boundary and name its successor gate',
  );
  for (const [key, expected] of [
    ['productionProfilePromotionClaimed', false],
    ['publicFirstReleaseReplacementClaimed', false],
    ['familyIdentityVisible', false],
    ['adapterFamilyBinding', 'absent'],
    ['sharedMotionQualityInvariant', true],
    ['sharedCapabilityInvariant', true],
    ['researchSeatBinding', 'absent'],
    ['liveResearchJoinAllowed', false],
    ['canonicalWritesAllowed', false],
    ['residentObservationWritesAllowed', false],
    ['modelCallsAllowed', false],
    ['networkFetchesAllowed', false],
    ['faceTrackingEnabledByDefault', false],
    ['eyeTrackingEnabledByDefault', false],
    ['biometricPersistenceAllowed', false],
    ['sourceOwnedHairGeometryBridgePreview', true],
    ['nativeHairStyleChannelClaimed', false],
    ['sourceOwnedExpressionDeltaBridgePreview', true],
    ['nativeMorphTargetChannelClaimed', false],
    ['nativeSubsurfaceScatteringClaimedByBrowser', false],
    ['productionFaceCompleteClaimed', false],
    ['photorealismClaimed', false],
    ['fullWorldConvergenceClaimed', false],
  ]) {
    expect(state[key] === expected, `${key} must equal ${expected}`);
  }
  // The frozen historical record. This is H3A's reason to exist, preserved verbatim:
  // at this commit upstream genuinely had neither channel. It is never re-derived from
  // upstream source text, because that text has legitimately moved on.
  const historical = state.upstreamNativeAdmission?.historical;
  expect(
    historical?.holoScriptCommit === '9153ab98a87decffc38876070ca8bfc04b179f01' &&
      historical?.authoredHairStyleGeometryOperative === false &&
      historical?.authoredMorphFacsOperative === false &&
      historical?.characterHostHairStyleReport === 'has_no_geometry_channel_yet' &&
      historical?.characterHostMorphReport === 'no_facs_morph_target_channel_yet',
    'frozen historical native-gap record drifted',
  );
  // The current admission. Both channels are now operative upstream; H3A still does
  // not claim them (its preview stays source-owned) and delegates coverage to H3B.
  const current = state.upstreamNativeAdmission?.current;
  expect(
    current?.hairColorOperative === true &&
      current?.defaultProceduralHairOperative === true &&
      current?.authoredHairStyleGeometryOperative === true &&
      current?.authoredMorphFacsOperative === true &&
      current?.h3aClaimsNativeChannels === false &&
      current?.nativeChannelCoverageGate === 'H3B' &&
      state.upstreamNativeAdmission?.fullH3Admitted === false,
    'current native admission must record the closed gap and delegate coverage to H3B',
  );
  expect(
    state.atlas?.algorithm === 'stormglass_neutral_dermal_atlas_v1' &&
      canonicalJson(state.atlas?.albedoSize) === canonicalJson([2048, 2048]) &&
      canonicalJson(state.atlas?.normalSize) === canonicalJson([2048, 2048]) &&
      canonicalJson(state.atlas?.surfaceMaskSize) === canonicalJson([1024, 1024]) &&
      canonicalJson(state.atlas?.externalUris) === '[]',
    'neutral dermal atlas contract drifted',
  );
  expect(
    canonicalJson(state.lod?.maximumPersonaTriangles) ===
      canonicalJson([12000, 5000, 1800]) &&
      state.lod?.secondLodAuthorityAllowed === false,
    'H3A LOD contract drifted',
  );
  expect(
    state.benchmark?.warmupFrames === 300 &&
      state.benchmark?.measuredFrames === 600 &&
      state.benchmark?.simultaneousPersonaCount === 3,
    'benchmark must be three personas over 300 plus 600 frames',
  );
  expect(
    canonicalJson(state.resetEvents) === canonicalJson(RESET_EVENTS),
    'history reset contract drifted',
  );
  // Accessibility evidence is one of the ten properties H3A refuses to be retired
  // without, so the contract has to bind it. Before this it was produced by the runner
  // and pinned by the manifest but never asserted here, which made that leg of the
  // refusal unfalsifiable -- deleting the target from the source changed nothing.
  const accessibilityTarget = (state.goldenTargets || []).find(
    (target) => target.id === 'h3a_accessibility',
  );
  expect(
    Boolean(accessibilityTarget) &&
      accessibilityTarget.width === 2400 &&
      accessibilityTarget.height === 600 &&
      String(accessibilityTarget.output || '').includes('h3a-accessibility'),
    'H3A must keep the accessibility golden target',
  );

  const personas = contract.objects.filter(
    (object) => object.type === 'neutral_civic_persona_target',
  );
  expect(personas.length === 3, `expected three neutral personas, found ${personas.length}`);
  expect(
    canonicalJson(personas.map((persona) => persona.personaId)) ===
      canonicalJson(PERSONA_IDS),
    'persona IDs or order drifted',
  );
  expect(
    canonicalJson(personas.map((persona) => persona.civicRole)) ===
      canonicalJson(CIVIC_ROLES),
    'civic roles drifted',
  );
  expect(
    canonicalJson(personas.map((persona) => persona.hairStyleId)) ===
      canonicalJson(HAIR_STYLES),
    'hair style targets drifted',
  );
  expect(
    new Set(personas.map((persona) => persona.silhouetteProfile)).size === 3,
    'persona silhouettes must be unique',
  );
  expect(
    new Set(personas.map((persona) => canonicalJson(persona.dermalAtlasCell)))
      .size === 3,
    'dermal atlas cells must be unique',
  );
  for (const persona of personas) {
    expect(
      persona.adapterFamilyBinding === 'absent',
      `${persona.personaId} must not bind an adapter family`,
    );
    expect(
      Array.isArray(persona.hairParts) && persona.hairParts.length >= 4,
      `${persona.personaId} needs at least four source-owned hair parts`,
    );
    for (const part of persona.hairParts || []) {
      expect(
        ALLOWED_HAIR_GEOMETRY.has(part.geometryProfile),
        `${part.id} has unsupported hair geometry`,
      );
      expect(
        Array.isArray(part.position) &&
          part.position.length === 3 &&
          part.position.every(Number.isFinite),
        `${part.id} position must be finite`,
      );
      expect(
        Array.isArray(part.dimensions) &&
          part.dimensions.length === 3 &&
          part.dimensions.every((value) => Number.isFinite(value) && value > 0),
        `${part.id} dimensions must be positive`,
      );
      expect(
        [0, 1, 2].includes(part.visibleThroughLod),
        `${part.id} visibleThroughLod must be 0, 1, or 2`,
      );
    }
  }

  const expressions = contract.objects.filter(
    (object) => object.type === 'neutral_persona_expression_target',
  );
  expect(expressions.length === 6, `expected six expressions, found ${expressions.length}`);
  expect(
    canonicalJson(expressions.map((expression) => expression.expressionId)) ===
      canonicalJson(EXPRESSIONS),
    'expression targets or order drifted',
  );
  expect(
    expressions.every(
      (expression) => expression.nativeMorphTargetClaimed === false,
    ),
    'bridge expressions must never claim native morph targets',
  );

  for (const [pathKey, hashKey] of [
    ['appearancePlan', 'appearancePlanSha256'],
    ['inheritedH2Source', 'inheritedH2SourceSha256'],
    ['inheritedH2Manifest', 'inheritedH2ManifestSha256'],
    ['inheritedH2Report', 'inheritedH2ReportSha256'],
  ]) {
    const relative = metadata[pathKey];
    const expectedHash = metadata[hashKey];
    const absolute = path.resolve(root, relative || '');
    expect(Boolean(relative && expectedHash && existsSync(absolute)), `${pathKey} missing`);
    if (relative && expectedHash && existsSync(absolute)) {
      expect(sha256File(absolute) === expectedHash, `${pathKey} hash drifted`);
    }
  }
  for (const [pathKey, hashKey] of [
    ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256'],
    ['upstreamHairBuilderPath', 'upstreamHairBuilderSha256'],
  ]) {
    const relative = metadata[pathKey];
    const expectedHash = metadata[hashKey];
    const absolute = path.resolve(holoScriptRoot, relative || '');
    expect(Boolean(relative && expectedHash && existsSync(absolute)), `${pathKey} missing`);
    if (relative && expectedHash && existsSync(absolute)) {
      expect(sha256File(absolute) === expectedHash, `${pathKey} hash drifted`);
    }
  }
  // H3A's founding evidence used to be a grep for two upstream stub strings asserting the
  // channels were ABSENT. Upstream closed the gap in H4J (0275f8d4c), so that grep now
  // measures the wrong thing. It is replaced -- not deleted -- by two stronger checks:
  //   1. the frozen historical record above, which preserves what H3A was for;
  //   2. proveUpstreamNativeChannels(), which EXECUTES both channels every run.
  // The retired grep matched source text; the replacement compiles real geometry. If either
  // channel regresses upstream, the executed proof fails and this gate goes red.
  //
  // The pointer to the successor stays honest -- H3A must name H3B and H3B's source must
  // exist -- but H3A no longer records H3B's CONTENT HASH. That pin was circular against
  // H3B's own inheritedH3A* pins, and it could not answer the only question worth asking:
  // has H3B taken over the properties H3A is retained for? proveSupersessionBoundary()
  // answers that by execution instead.
  expect(
    metadata.successorGate === 'H3B',
    'H3A must name the successor gate that carries the native channels',
  );
  expect(
    Boolean(metadata.successorSource) &&
      existsSync(path.resolve(root, metadata.successorSource || '')),
    'successor gate source missing',
  );
  // The refusal itself is now a declared, checkable claim rather than manifest prose.
  const supersession = state.supersessionBoundary || {};
  expect(
    typeof supersession.retirementRefused === 'boolean',
    'supersessionBoundary.retirementRefused must be true or false',
  );
  expect(
    canonicalJson(supersession.refusedProperties) ===
      canonicalJson(SUPERSESSION_PROPERTY_IDS),
    'supersessionBoundary.refusedProperties must name exactly the properties this gate probes',
  );
  expect(
    typeof supersession.refusedReason === 'string' &&
      supersession.refusedReason.trim().length > 0,
    'supersessionBoundary.refusedReason must state why H3A is retained',
  );
  return { status: errors.length ? 'fail' : 'pass', errors };
}

/**
 * EXECUTED proof of the retire-vs-restate decision.
 *
 * For each of the ten properties H3A is retained for, this mutates BOTH contracts and
 * asks each gate's own validator whether it notices. H3A must notice every one (or its
 * refusal has gone stale and is silently over-claiming); and the direction of the
 * successor result is governed by the declared retirementRefused:
 *
 *   retirementRefused: true  -> H3B must assert NONE of them. If H3B has gained one, the
 *                               gate goes red naming it, because retirement is now
 *                               partly justified and must be re-decided by a human.
 *   retirementRefused: false -> H3B must assert ALL of them. This is what makes "H3A can
 *                               be retired" a claim the gate can refuse rather than a
 *                               comment nobody checks.
 *
 * Comparison is against each gate's own pre-existing errors, so unrelated drift in H3B
 * (stale upstream pins, say) cannot masquerade as H3B having gained a property.
 */
export async function proveSupersessionBoundary({
  contract,
  root = ROOT,
  holoScriptRoot = DEFAULT_HOLOSCRIPT_ROOT,
}) {
  const failures = [];
  const witness = [];
  const declared = contract.state.supersessionBoundary || {};
  const retirementRefused = declared.retirementRefused;
  const successorGate = contract.metadata.successorGate || 'the successor gate';

  let successorModule;
  let successorContract;
  try {
    successorModule = await import(
      pathToFileURL(path.join(root, SUCCESSOR_CHECKER_REL)).href
    );
    successorContract = (
      await successorModule.parseH3BStack(root, holoScriptRoot)
    ).contract;
  } catch (error) {
    return {
      status: 'fail',
      retirementRefused,
      witness,
      failures: [
        `could not load or parse ${successorGate} to test the supersession boundary: ${error.message}`,
      ],
    };
  }

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const newErrors = (before, after) =>
    after.filter((error) => !before.includes(error));
  const baselineSelf = validateH3AContract(
    clone(contract),
    root,
    holoScriptRoot,
  ).errors;
  const baselineSuccessor = successorModule.validateH3BContract(
    clone(successorContract),
    root,
    holoScriptRoot,
  ).errors;

  for (const property of SUPERSESSION_PROPERTIES) {
    const mutatedSelf = clone(contract);
    property.mutate(mutatedSelf);
    const selfNoticed = newErrors(
      baselineSelf,
      validateH3AContract(mutatedSelf, root, holoScriptRoot).errors,
    );
    const mutatedSuccessor = clone(successorContract);
    property.mutate(mutatedSuccessor);
    const successorNoticed = newErrors(
      baselineSuccessor,
      successorModule.validateH3BContract(
        mutatedSuccessor,
        root,
        holoScriptRoot,
      ).errors,
    );
    const heldByH3A = selfNoticed.length > 0;
    const assertedBySuccessor = successorNoticed.length > 0;
    witness.push({
      property: property.id,
      label: property.label,
      heldByH3A,
      assertedBySuccessor,
      h3aWitness: selfNoticed[0] || null,
      successorWitness: successorNoticed[0] || null,
    });
    if (!heldByH3A) {
      failures.push(
        `H3A no longer asserts ${property.id} (${property.label}); the refusal to retire is stale and must be re-decided`,
      );
    }
    if (retirementRefused === true && assertedBySuccessor) {
      failures.push(
        `${successorGate} now asserts ${property.id} (${property.label}); H3A retirement must be re-evaluated`,
      );
    }
    if (retirementRefused === false && !assertedBySuccessor) {
      failures.push(
        `retirementRefused is false but ${successorGate} does not assert ${property.id} (${property.label}); H3A cannot be retired`,
      );
    }
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    retirementRefused,
    witness,
    failures,
  };
}

/**
 * EXECUTED proof that the two channels H3A was authored against are now operative.
 *
 * Compiles H3A's own authored hair styles and expression targets through the same public
 * surface H3B is proved on (ExportManager -> 'character-webgpu'). Requires, for every
 * H3A hair style: a native @hair(style=<id>) mapping, zero stubs, and real hair geometry;
 * and for every non-neutral H3A expression: native @morph targets applied with no ignored
 * targets. Returns a witness so the receipt records what was actually compiled.
 */
export async function proveUpstreamNativeChannels(core, plan) {
  const failures = [];
  const styleWitness = [];
  const expressionWitness = [];

  const compile = (objectId, traits) =>
    new core.ExportManager({
      useCircuitBreaker: false,
      useFallback: false,
      useMemoryMonitoring: false,
    }).export(
      'character-webgpu',
      {
        name: 'H3A upstream native channel proof',
        templates: [{ name: 'CivicPersona', traits: [] }],
        objects: [
          {
            name: objectId,
            template: 'CivicPersona',
            position: { x: 0, y: 0, z: 0 },
            traits: [
              { name: 'skeleton', config: { rig: 'humanoid_65' } },
              { name: 'body', config: { height: 1.72 } },
              ...traits,
            ],
          },
        ],
      },
      { compilerOptions: { objectId, entityId: `h3a-native-proof-${objectId}`, lodLevel: 0 } },
    );

  // Channel 1: authored hair-style geometry.
  const styleGeometry = new Map();
  for (const persona of plan.personas) {
    const objectId = `HairProof_${persona.personaId}`;
    const result = await compile(objectId, [
      { name: 'hair', config: { style: persona.hairStyleId, color: persona.hairColor } },
    ]);
    if (!result.success || result.usedFallback) {
      failures.push(`native hair style ${persona.hairStyleId} failed to compile`);
      continue;
    }
    const bundle = JSON.parse(result.output);
    const hair = bundle.materialGroups.find(
      (group) => group.material.shadingModel === 'marschner-hair',
    );
    const mapped = bundle.report?.mapped || [];
    const hairTriangles = hair ? hair.indexCount / 3 : 0;
    if (!mapped.includes(`@hair(style=${persona.hairStyleId})`)) {
      failures.push(`@hair(style=${persona.hairStyleId}) is not natively mapped upstream`);
    }
    if ((bundle.report?.stubbed || []).length !== 0) {
      failures.push(`native hair style ${persona.hairStyleId} reported stubs`);
    }
    if (!(hairTriangles > 0)) {
      failures.push(`native hair style ${persona.hairStyleId} produced no hair geometry`);
    }
    styleGeometry.set(persona.hairStyleId, hairTriangles);
    styleWitness.push({
      hairStyleId: persona.hairStyleId,
      mapped: mapped.filter((entry) => entry.startsWith('@hair')),
      hairTriangles,
      vertexCount: bundle.vertexCount,
    });
  }
  // Distinct styles must yield distinct geometry, not one shared default.
  if (styleGeometry.size > 1 && new Set(styleGeometry.values()).size === 1) {
    failures.push('every authored hair style produced identical geometry (default fallback)');
  }

  // Channel 2: authored FACS / morph targets.
  const H3A_EXPRESSION_FACS = {
    neutral: {},
    soft_smile: { smile: 0.55 },
    blink: { blink_left: 1, blink_right: 1 },
    viseme_aa: { viseme_aa: 0.9, jaw_open: 0.6 },
    viseme_ee: { viseme_ee: 0.85 },
    viseme_oh: { viseme_oh: 0.8, jaw_open: 0.35 },
  };
  for (const expression of plan.expressions) {
    const targets = H3A_EXPRESSION_FACS[expression.expressionId];
    if (!targets) {
      failures.push(`no FACS mapping recorded for expression ${expression.expressionId}`);
      continue;
    }
    if (expression.expressionId === 'neutral') continue;
    const objectId = `MorphProof_${expression.expressionId}`;
    const result = await compile(objectId, [
      { name: 'hair', config: { style: plan.personas[0].hairStyleId } },
      { name: 'morph', config: { targets } },
    ]);
    if (!result.success || result.usedFallback) {
      failures.push(`native morph ${expression.expressionId} failed to compile`);
      continue;
    }
    const bundle = JSON.parse(result.output);
    const mapped = (bundle.report?.mapped || []).filter((entry) => entry.startsWith('@morph'));
    if (mapped.length === 0) {
      failures.push(`@morph for ${expression.expressionId} is not natively mapped upstream`);
    }
    if ((bundle.morph?.ignoredTargets || []).length !== 0) {
      failures.push(`native morph ${expression.expressionId} ignored authored targets`);
    }
    if (!(bundle.morph?.changedVertexCount > 0)) {
      failures.push(`native morph ${expression.expressionId} deformed no vertices`);
    }
    expressionWitness.push({
      expressionId: expression.expressionId,
      authoredTargets: targets,
      mapped,
      changedVertexCount: bundle.morph?.changedVertexCount ?? 0,
      ignoredTargets: bundle.morph?.ignoredTargets ?? [],
    });
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    failures,
    styleWitness,
    expressionWitness,
  };
}

function hexRgb(hex) {
  const packed = Number.parseInt(hex.replace('#', ''), 16);
  return [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
}

function noise2d(x, y, seed) {
  let value =
    Math.imul((x + seed) | 0, 374761393) ^
    Math.imul((y - seed) | 0, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function dermalSample(persona, x, y, width, height, seed) {
  const [br, bg, bb] = hexRgb(persona.skinBaseColor);
  const [ur, ug, ub] = hexRgb(persona.skinUndertoneColor);
  const nx = x / Math.max(1, width - 1);
  const ny = y / Math.max(1, height - 1);
  const pore =
    noise2d(Math.floor(x * 0.83), Math.floor(y * 0.83), seed) * 0.55 +
    noise2d(Math.floor(x * 0.19), Math.floor(y * 0.19), seed + 101) * 0.45;
  const mottling = noise2d(
    Math.floor(x * 0.035),
    Math.floor(y * 0.035),
    seed + 907,
  );
  const cheek = Math.exp(
    -(
      ((nx - 0.5) * (nx - 0.5)) / 0.12 +
      ((ny - 0.56) * (ny - 0.56)) / 0.045
    ),
  );
  const blend = 0.12 + mottling * 0.15 + cheek * 0.08;
  const grain = (pore - 0.5) * 5.5;
  return {
    color: [
      Math.max(0, Math.min(255, Math.round(br * (1 - blend) + ur * blend + grain))),
      Math.max(0, Math.min(255, Math.round(bg * (1 - blend) + ug * blend + grain))),
      Math.max(0, Math.min(255, Math.round(bb * (1 - blend) + ub * blend + grain))),
    ],
    height: pore * 0.65 + mottling * 0.25 + cheek * 0.1,
    roughness: 0.42 + pore * 0.11 + (1 - cheek) * 0.04,
    ao: 0.96 - Math.abs(pore - 0.5) * 0.06,
  };
}

export function generateDermalAtlasBuffers(PNG, atlas, personas) {
  const build = (width, height, kind) => {
    const png = new PNG({ width, height });
    const cellWidth = width / 3;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const column = Math.min(2, Math.floor((x / width) * 3));
        const localX = x - column * cellWidth;
        const persona = personas[column];
        const sample = dermalSample(
          persona,
          localX,
          y,
          cellWidth,
          height,
          atlas.seed + column * 1009,
        );
        const offset = (y * width + x) * 4;
        if (kind === 'albedo') {
          [png.data[offset], png.data[offset + 1], png.data[offset + 2]] =
            sample.color;
        } else if (kind === 'normal') {
          const right = dermalSample(
            persona,
            Math.min(cellWidth - 1, localX + 1),
            y,
            cellWidth,
            height,
            atlas.seed + column * 1009,
          ).height;
          const down = dermalSample(
            persona,
            localX,
            Math.min(height - 1, y + 1),
            cellWidth,
            height,
            atlas.seed + column * 1009,
          ).height;
          const dx = (right - sample.height) * 2.4;
          const dy = (down - sample.height) * 2.4;
          const length = Math.hypot(dx, dy, 1);
          png.data[offset] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
          png.data[offset + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
          png.data[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
        } else {
          png.data[offset] = Math.round(sample.ao * 255);
          png.data[offset + 1] = Math.round(sample.roughness * 255);
          png.data[offset + 2] = 0;
        }
        png.data[offset + 3] = 255;
      }
    }
    return PNG.sync.write(png, {
      colorType: 6,
      inputColorType: 6,
      inputHasAlpha: true,
      deflateLevel: 9,
      deflateStrategy: 3,
    });
  };
  return {
    albedo: build(atlas.albedoSize[0], atlas.albedoSize[1], 'albedo'),
    normal: build(atlas.normalSize[0], atlas.normalSize[1], 'normal'),
    surfaceMask: build(
      atlas.surfaceMaskSize[0],
      atlas.surfaceMaskSize[1],
      'surfaceMask',
    ),
  };
}

function h3aBrowserApplication(
  THREE,
  RoundedBoxGeometry,
  RoomEnvironment,
  PAYLOAD,
) {
  const root = document.getElementById('app');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06101d');
  scene.fog = new THREE.FogExp2('#071321', 0.042);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(
    PAYLOAD.benchmark.renderWidth,
    PAYLOAD.benchmark.renderHeight,
    false,
  );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  root.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    31,
    PAYLOAD.benchmark.renderWidth / PAYLOAD.benchmark.renderHeight,
    0.03,
    60,
  );
  camera.position.set(0, 1.44, 4.2);
  camera.lookAt(0, 1.32, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight('#8ac9dc', '#101421', 0.82));
  const key = new THREE.DirectionalLight('#ffd6ae', 4.1);
  key.position.set(3.5, 5.0, 4.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#59cfe0', 3.1);
  rim.position.set(-4.0, 3.0, -2.4);
  scene.add(rim);
  const faceFill = new THREE.PointLight('#efb995', 2.0, 5.0);
  faceFill.position.set(0, 1.8, 2.4);
  scene.add(faceFill);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(2.55, 2.75, 0.12, 72),
    new THREE.MeshStandardMaterial({
      color: '#243845',
      roughness: 0.54,
      metalness: 0.28,
    }),
  );
  platform.position.y = 0.25;
  platform.receiveShadow = true;
  scene.add(platform);
  for (const [radius, color] of [
    [2.25, '#6ed3e2'],
    [1.82, '#d99b68'],
    [1.40, '#3d8294'],
  ]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.012, 8, 96),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.48,
        roughness: 0.35,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.32;
    scene.add(ring);
  }

  const textureLoader = new THREE.TextureLoader();
  const loadTexture = (url, color = false) =>
    new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
          resolve(texture);
        },
        undefined,
        reject,
      );
    });

  const textureForPersona = (texture, column) => {
    const clone = texture.clone();
    clone.wrapS = clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(1 / 3, 1);
    clone.offset.set(column / 3, 0);
    clone.needsUpdate = true;
    return clone;
  };

  const radians = (value) => (value * Math.PI) / 180;
  const applyTransform = (object, part) => {
    object.position.set(...part.position);
    object.rotation.set(...part.rotationDegrees.map(radians));
    object.castShadow = true;
    object.receiveShadow = true;
    return object;
  };

  function trianglesFor(object) {
    let triangles = 0;
    object.traverse((child) => {
      const geometry = child.geometry;
      if (!geometry) return;
      triangles += geometry.index
        ? geometry.index.count / 3
        : geometry.getAttribute('position').count / 3;
    });
    return triangles;
  }

  function materialGroupCount(object) {
    const materials = new Set();
    object.traverse((child) => {
      if (!child.material) return;
      for (const material of Array.isArray(child.material)
        ? child.material
        : [child.material]) {
        materials.add(material.uuid);
      }
    });
    return materials.size;
  }

  function disposeGroup(group) {
    if (!group) return;
    scene.remove(group);
    group.traverse((child) => {
      child.geometry?.dispose?.();
      for (const material of Array.isArray(child.material)
        ? child.material
        : child.material
          ? [child.material]
          : []) {
        for (const key of [
          'map',
          'normalMap',
          'roughnessMap',
          'metalnessMap',
          'aoMap',
        ]) {
          material[key]?.dispose?.();
        }
        material.dispose?.();
      }
    });
  }

  function hairPart(part, material, lod) {
    const radial = PAYLOAD.lod.hairRadialSegments[lod];
    const [a, b, c] = part.dimensions;
    let geometry;
    if (part.geometryProfile === 'hair_cap') {
      geometry = new THREE.SphereGeometry(
        1,
        radial,
        Math.max(5, Math.round(radial * 0.52)),
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.54,
      );
      geometry.scale(a, b, c);
    } else if (part.geometryProfile === 'hair_coil') {
      const group = new THREE.Group();
      const tuftCount = lod === 0 ? 5 : lod === 1 ? 4 : 3;
      const tuftRadius = Math.max(0.010, Math.min(a, b) * 0.62);
      const offsets = [
        [-0.48, -0.02, 0.00],
        [0.00, 0.34, 0.08],
        [0.48, -0.02, 0.00],
        [-0.24, -0.30, 0.12],
        [0.26, -0.28, 0.10],
      ];
      for (let index = 0; index < tuftCount; index += 1) {
        const tuft = new THREE.Mesh(
          new THREE.SphereGeometry(
            tuftRadius * (index % 2 === 0 ? 1 : 0.9),
            Math.max(6, radial),
            Math.max(4, Math.floor(radial * 0.6)),
          ),
          material,
        );
        tuft.position.set(
          offsets[index][0] * a,
          offsets[index][1] * b,
          offsets[index][2] * c,
        );
        tuft.scale.z = c / Math.max(a, 0.001);
        tuft.rotation.set(index * 0.21, index * 0.34, index * 0.17);
        tuft.castShadow = true;
        group.add(tuft);
      }
      applyTransform(group, part);
      return group;
    } else if (part.geometryProfile === 'hair_swept_lock') {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-a / 2, -b * 0.18, 0),
        new THREE.Vector3(-a * 0.18, b * 0.30, c * 0.08),
        new THREE.Vector3(a * 0.18, b * 0.38, c * 0.12),
        new THREE.Vector3(a / 2, -b * 0.10, 0),
      ]);
      geometry = new THREE.TubeGeometry(
        curve,
        Math.max(6, radial),
        Math.max(0.007, Math.min(b, c) * 0.36),
        Math.max(5, Math.floor(radial / 2)),
        false,
      );
    } else if (part.geometryProfile === 'hair_braid_crown') {
      geometry = new THREE.TorusGeometry(
        a,
        b,
        Math.max(4, Math.floor(radial / 2)),
        radial * 2,
      );
      geometry.scale(1, c / Math.max(a, 0.001), 1);
    } else if (part.geometryProfile === 'hair_braid') {
      const group = new THREE.Group();
      const count = lod === 0 ? 6 : lod === 1 ? 4 : 3;
      for (let index = 0; index < count; index += 1) {
        const bead = new THREE.Mesh(
          new THREE.SphereGeometry(
            a,
            Math.max(6, radial),
            Math.max(4, Math.floor(radial / 2)),
          ),
          material,
        );
        bead.scale.set(1, 0.82, c / Math.max(a, 0.001));
        bead.position.y = b / 2 - (index / Math.max(1, count - 1)) * b;
        bead.position.x = Math.sin(index * 1.7) * a * 0.2;
        bead.castShadow = true;
        group.add(bead);
      }
      applyTransform(group, part);
      return group;
    } else {
      throw new Error(`Unsupported H3A hair geometry ${part.geometryProfile}`);
    }
    return applyTransform(new THREE.Mesh(geometry, material), part);
  }

  function buildPersona(persona, expression, lod, textures) {
    const group = new THREE.Group();
    const column = persona.dermalAtlasCell[0];
    const skinMaterial = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: textureForPersona(textures.albedo, column),
      normalMap: textureForPersona(textures.normal, column),
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: PAYLOAD.sharedSurface.skinRoughness,
      roughnessMap: textureForPersona(textures.surfaceMask, column),
      metalness: 0,
      clearcoat: PAYLOAD.sharedSurface.skinClearcoat,
      clearcoatRoughness: 0.72,
      sheen: 0.08,
      sheenColor: new THREE.Color(persona.skinUndertoneColor),
      envMapIntensity: 0.58,
    });
    const hairMaterial = new THREE.MeshPhysicalMaterial({
      color: persona.hairColor,
      roughness: 0.64,
      metalness: 0,
      sheen: 0.38,
      sheenRoughness: 0.58,
      sheenColor: new THREE.Color('#b67f60'),
      clearcoat: 0.025,
      envMapIntensity: 0.52,
    });
    const clothMaterial = new THREE.MeshStandardMaterial({
      color: '#426979',
      roughness: 0.72,
      metalness: 0.03,
      envMapIntensity: 0.65,
    });
    const leatherMaterial = new THREE.MeshStandardMaterial({
      color: '#5c3a2b',
      roughness: 0.62,
      metalness: 0.02,
    });
    const scleraMaterial = new THREE.MeshPhysicalMaterial({
      color: '#e6ddd2',
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      ior: PAYLOAD.sharedSurface.corneaIor,
      envMapIntensity: 1.15,
    });
    const irisMaterial = new THREE.MeshPhysicalMaterial({
      color: persona.irisColor,
      roughness: 0.17,
      clearcoat: 0.8,
      emissive: '#000000',
      emissiveIntensity: 0,
    });
    const pupilMaterial = new THREE.MeshStandardMaterial({
      color: '#090c10',
      roughness: 0.2,
    });
    const lipMaterial = new THREE.MeshPhysicalMaterial({
      color: persona.skinScatterColor,
      roughness: 0.38,
      clearcoat: 0.14,
    });

    const chest = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        0.235,
        0.20,
        Math.max(2, 4 - lod),
        Math.max(10, 20 - lod * 5),
      ),
      clothMaterial,
    );
    chest.scale.set(1.15, 1.08, 0.74);
    chest.position.set(0, 1.02, -0.035);
    chest.castShadow = chest.receiveShadow = true;
    group.add(chest);
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(
        0.16,
        0.032,
        Math.max(4, 7 - lod),
        Math.max(12, 28 - lod * 8),
        Math.PI,
      ),
      leatherMaterial,
    );
    collar.rotation.z = Math.PI;
    collar.position.set(0, 1.30, 0.105);
    group.add(collar);
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.075,
        0.09,
        0.18,
        PAYLOAD.lod.faceRadialSegments[lod],
      ),
      skinMaterial,
    );
    neck.position.set(0, 1.36, 0);
    neck.castShadow = true;
    group.add(neck);

    const headGeometry = new THREE.SphereGeometry(
      1,
      PAYLOAD.lod.faceRadialSegments[lod],
      PAYLOAD.lod.faceHeightSegments[lod],
    );
    const headPositions = headGeometry.getAttribute('position');
    const jawWidthRatio = Math.min(
      1,
      persona.jawScale[0] / persona.faceScale[0],
    );
    const jawDepthRatio = Math.min(
      1,
      persona.jawScale[2] / persona.faceScale[2],
    );
    for (let index = 0; index < headPositions.count; index += 1) {
      const y = headPositions.getY(index);
      if (y >= 0) continue;
      const weight = Math.min(1, Math.pow(-y, 1.35));
      headPositions.setX(
        index,
        headPositions.getX(index) *
          (1 - (1 - jawWidthRatio) * weight * 0.88),
      );
      headPositions.setZ(
        index,
        headPositions.getZ(index) *
          (1 - (1 - jawDepthRatio) * weight * 0.72),
      );
    }
    headPositions.needsUpdate = true;
    headGeometry.computeVertexNormals();
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.scale.set(...persona.faceScale);
    head.position.set(0, 1.565, 0);
    head.castShadow = head.receiveShadow = true;
    group.add(head);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(
          1,
          Math.max(8, PAYLOAD.lod.faceRadialSegments[lod] / 2),
          Math.max(6, PAYLOAD.lod.faceHeightSegments[lod] / 2),
        ),
        skinMaterial,
      );
      ear.scale.set(0.024, 0.040, 0.016);
      ear.position.set(side * persona.faceScale[0] * 0.96, 1.57, -0.004);
      ear.castShadow = true;
      group.add(ear);
    }
    const nose = new THREE.Mesh(
      new RoundedBoxGeometry(
        persona.noseScale[0],
        persona.noseScale[1],
        persona.noseScale[2],
        lod === 0 ? 2 : 1,
        Math.min(persona.noseScale[0], persona.noseScale[2]) * 0.42,
      ),
      skinMaterial,
    );
    nose.rotation.x = -0.10;
    nose.position.set(0, 1.548, persona.faceScale[2] * 0.94);
    nose.castShadow = true;
    group.add(nose);

    const eyeY = 1.602;
    const eyeZ = persona.faceScale[2] * 0.925;
    const eyeX = persona.eyeSpacing / 2;
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.027,
          Math.max(8, PAYLOAD.lod.faceRadialSegments[lod] / 2),
          Math.max(6, PAYLOAD.lod.faceHeightSegments[lod] / 2),
        ),
        scleraMaterial,
      );
      eye.scale.set(1.05, 0.62 * expression.eyelidScale, 0.55);
      eye.position.set(side * eyeX, eyeY, eyeZ);
      eye.castShadow = true;
      group.add(eye);
      if (expression.eyelidScale > 0.18) {
        const iris = new THREE.Mesh(
          new THREE.CircleGeometry(
            0.0105,
            Math.max(8, PAYLOAD.lod.faceRadialSegments[lod]),
          ),
          irisMaterial,
        );
        iris.position.set(side * eyeX, eyeY, eyeZ + 0.017);
        group.add(iris);
        const pupil = new THREE.Mesh(
          new THREE.CircleGeometry(0.0045, Math.max(8, PAYLOAD.lod.faceRadialSegments[lod])),
          pupilMaterial,
        );
        pupil.position.set(side * eyeX, eyeY, eyeZ + 0.018);
        group.add(pupil);
      }
      const brow = new THREE.Mesh(
        new RoundedBoxGeometry(
          0.052,
          0.008,
          0.010,
          lod === 0 ? 2 : 1,
          0.005,
        ),
        hairMaterial,
      );
      brow.position.set(side * eyeX, eyeY + 0.044, eyeZ + 0.010);
      brow.rotation.z = radians(
        side * (-4 + expression.browRotationDegrees),
      );
      group.add(brow);
    }

    const mouthWidth = 0.060 * expression.mouthWidthScale;
    const mouthY = 1.484 - expression.jawDrop * 0.18;
    const mouthZ = persona.faceScale[2] * 0.944;
    const mouthOpen =
      expression.jawDrop > 0.006 || expression.mouthHeightScale > 1.25;
    if (mouthOpen) {
      const mouthInterior = new THREE.Mesh(
        new THREE.CircleGeometry(1, Math.max(10, PAYLOAD.lod.faceRadialSegments[lod])),
        pupilMaterial,
      );
      mouthInterior.scale.set(
        mouthWidth * 0.62,
        Math.max(0.010, expression.jawDrop * 0.92),
        1,
      );
      mouthInterior.position.set(0, mouthY, mouthZ + 0.002);
      group.add(mouthInterior);
      const lipRim = new THREE.Mesh(
        new THREE.TorusGeometry(
          1,
          0.12,
          lod === 0 ? 7 : 5,
          Math.max(12, PAYLOAD.lod.faceRadialSegments[lod]),
        ),
        lipMaterial,
      );
      lipRim.scale.set(
        mouthWidth * 0.68,
        Math.max(0.012, expression.jawDrop * 1.02),
        0.040,
      );
      lipRim.position.set(0, mouthY, mouthZ + 0.005);
      lipRim.castShadow = true;
      group.add(lipRim);
      if (expression.mouthWidthScale > 1.25) {
        const teeth = new THREE.Mesh(
          new RoundedBoxGeometry(
            mouthWidth * 0.78,
            0.008,
            0.004,
            1,
            0.003,
          ),
          scleraMaterial,
        );
        teeth.position.set(0, mouthY + 0.006, mouthZ + 0.008);
        group.add(teeth);
      }
    } else {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-mouthWidth, expression.mouthCornerLift * 0.82, mouthZ),
        new THREE.Vector3(-mouthWidth * 0.5, expression.mouthCornerLift * 0.25, mouthZ),
        new THREE.Vector3(0, -0.002, mouthZ),
        new THREE.Vector3(mouthWidth * 0.5, expression.mouthCornerLift * 0.25, mouthZ),
        new THREE.Vector3(mouthWidth, expression.mouthCornerLift * 0.82, mouthZ),
      ]);
      const mouth = new THREE.Mesh(
        new THREE.TubeGeometry(
          curve,
          lod === 0 ? 16 : lod === 1 ? 10 : 6,
          0.0045 * expression.mouthHeightScale,
          lod === 0 ? 6 : 4,
          false,
        ),
        lipMaterial,
      );
      mouth.position.y = mouthY;
      mouth.castShadow = true;
      group.add(mouth);
    }

    for (const side of [-1, 1]) {
      const sleeve = new THREE.Mesh(
        new THREE.CapsuleGeometry(
          0.07,
          0.20,
          Math.max(2, 5 - lod),
          Math.max(8, 16 - lod * 4),
        ),
        clothMaterial,
      );
      sleeve.position.set(side * 0.31, 1.04, 0);
      sleeve.rotation.z = side * -0.10;
      sleeve.castShadow = true;
      group.add(sleeve);
      const hand = new THREE.Mesh(
        new THREE.CapsuleGeometry(
          0.047,
          0.082,
          Math.max(2, 5 - lod),
          Math.max(8, 16 - lod * 4),
        ),
        skinMaterial,
      );
      hand.position.set(side * 0.33, 0.84, 0.018);
      hand.rotation.z = side * -0.08;
      hand.castShadow = true;
      group.add(hand);
      if (lod === 0) {
        for (let finger = 0; finger < 3; finger += 1) {
          const digit = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.009, 0.044, 3, 8),
            skinMaterial,
          );
          digit.position.set(
            side * (0.31 + finger * 0.018),
            0.778,
            0.035 + finger * 0.004,
          );
          digit.rotation.z = side * -0.05;
          digit.castShadow = true;
          group.add(digit);
        }
      }
    }

    for (const part of persona.hairParts.filter(
      (candidate) => candidate.visibleThroughLod >= lod,
    )) {
      group.add(hairPart(part, hairMaterial, lod));
    }
    group.rotation.y = -0.05;
    return {
      group,
      triangles: trianglesFor(group),
      materialGroups: materialGroupCount(group),
      hairPartCount: persona.hairParts.filter(
        (part) => part.visibleThroughLod >= lod,
      ).length,
    };
  }

  let active = null;
  let activeView = {
    mode: 'lineup',
    index: null,
    expression: 'neutral',
    lod: 0,
  };
  let loadedTextures;

  const expressionById = (id) =>
    PAYLOAD.expressions.find((expression) => expression.expressionId === id) ||
    PAYLOAD.expressions[0];

  function setView(view) {
    activeView = { ...activeView, ...view };
    disposeGroup(active);
    active = new THREE.Group();
    const expression = expressionById(activeView.expression);
    if (activeView.mode === 'lineup') {
      const xPositions = [-0.78, 0, 0.78];
      PAYLOAD.personas.forEach((persona, index) => {
        const built = buildPersona(
          persona,
          expression,
          activeView.lod,
          loadedTextures,
        );
        built.group.position.x = xPositions[index];
        built.group.scale.setScalar(0.92);
        active.add(built.group);
      });
      camera.position.set(0, 1.42, 4.25);
      camera.lookAt(0, 1.30, 0);
    } else {
      const persona = PAYLOAD.personas[activeView.index || 0];
      const built = buildPersona(
        persona,
        expression,
        activeView.lod,
        loadedTextures,
      );
      active.add(built.group);
      camera.position.set(0, 1.54, 1.68);
      camera.lookAt(0, 1.54, 0);
    }
    scene.add(active);
    renderer.render(scene, camera);
  }

  window.__h3aSetView = setView;

  async function run() {
    loadedTextures = {
      albedo: await loadTexture(PAYLOAD.atlasDataUrls.albedo, true),
      normal: await loadTexture(PAYLOAD.atlasDataUrls.normal, false),
      surfaceMask: await loadTexture(PAYLOAD.atlasDataUrls.surfaceMask, false),
    };

    const neutral = expressionById('neutral');
    const lodSummaries = [];
    for (let lod = 0; lod < 3; lod += 1) {
      for (const persona of PAYLOAD.personas) {
        const built = buildPersona(persona, neutral, lod, loadedTextures);
        lodSummaries.push({
          personaId: persona.personaId,
          name: persona.name,
          lod,
          triangles: built.triangles,
          materialGroups: built.materialGroups,
          hairPartCount: built.hairPartCount,
        });
        disposeGroup(built.group);
      }
    }

    setView(activeView);
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame((timestamp) => resolve(timestamp)));
    let previous = await nextFrame();
    for (let index = 0; index < PAYLOAD.benchmark.warmupFrames; index += 1) {
      renderer.render(scene, camera);
      previous = await nextFrame();
    }
    const raf = [];
    const submit = [];
    let droppedFrames = 0;
    for (let index = 0; index < PAYLOAD.benchmark.measuredFrames; index += 1) {
      const started = performance.now();
      renderer.render(scene, camera);
      submit.push(performance.now() - started);
      const now = await nextFrame();
      const delta = now - previous;
      raf.push(delta);
      if (delta > PAYLOAD.benchmark.maximumRafP95Milliseconds) droppedFrames += 1;
      previous = now;
    }
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const unmaskedRenderer = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const backend = /D3D11/i.test(unmaskedRenderer)
      ? 'D3D11'
      : /D3D12/i.test(unmaskedRenderer)
        ? 'D3D12'
        : /Vulkan/i.test(unmaskedRenderer)
          ? 'Vulkan'
          : 'unknown';
    window.__H3A = {
      lodSummaries,
      benchmark: {
        raf: PAYLOAD.summarize(raf),
        renderSubmit: PAYLOAD.summarize(submit),
        droppedFrames,
        droppedFrameRatio: droppedFrames / PAYLOAD.benchmark.measuredFrames,
      },
      renderer: {
        unmaskedRenderer,
        version: gl.getParameter(gl.VERSION),
        backend,
        software: /SwiftShader|llvmpipe|software/i.test(unmaskedRenderer),
      },
      resetEvents: PAYLOAD.resetEvents,
      nativeAdmission: PAYLOAD.upstreamNativeAdmission,
    };
    window.__H3A_READY__ = true;
  }

  run().catch((error) => {
    window.__H3A_ERROR__ = error?.stack || error?.message || String(error);
  });
}

function parseArgs(argv) {
  const options = {
    root: ROOT,
    holoScriptRoot: DEFAULT_HOLOSCRIPT_ROOT,
    browser: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    outputDir: DEFAULT_OUTPUT,
    writeArtifacts: false,
    skipManifest: false,
    heroOutput: null,
    expressionOutput: null,
    lodOutput: null,
    accessibilityOutput: null,
    reportOutput: null,
    timeoutMs: 60000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root')
      options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--output') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--write-artifacts') options.writeArtifacts = true;
    else if (arg === '--skip-manifest') options.skipManifest = true;
    else if (arg === '--hero-output')
      options.heroOutput = path.resolve(argv[++index]);
    else if (arg === '--expression-output')
      options.expressionOutput = path.resolve(argv[++index]);
    else if (arg === '--lod-output')
      options.lodOutput = path.resolve(argv[++index]);
    else if (arg === '--accessibility-output')
      options.accessibilityOutput = path.resolve(argv[++index]);
    else if (arg === '--report-output')
      options.reportOutput = path.resolve(argv[++index]);
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/check-hololand-model-village-character-appearance-h3a.mjs [options]

  --write-artifacts              Write deterministic dermal atlases
  --skip-manifest                Bootstrap before the immutable manifest exists
  --hero-output <path>           Durable 2400x900 neutral persona sheet
  --expression-output <path>     Durable 2400x900 expression preview sheet
  --lod-output <path>            Durable 2400x600 LOD comparison
  --accessibility-output <path>  Durable 2400x600 accessibility comparison
  --report-output <path>         Durable Markdown report
  --output <dir>                 Ephemeral browser witness directory
  --timeout-ms <number>          Browser operation timeout`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }
  return options;
}

async function loadWorkspaceModules(holoScriptRoot) {
  const workspaceRequire = createRequire(path.join(holoScriptRoot, 'package.json'));
  const importResolved = async (name) =>
    import(pathToFileURL(workspaceRequire.resolve(name)).href);
  const png = await importResolved('pngjs');
  const sharpModule = await importResolved('sharp');
  const playwrightModule = await importResolved('playwright');
  return {
    PNG: png.PNG || png.default?.PNG,
    sharp: sharpModule.default || sharpModule,
    esbuild: await importResolved('esbuild'),
    playwright: playwrightModule.chromium
      ? playwrightModule
      : playwrightModule.default,
  };
}

function writeBuffers(buffers, destinations) {
  for (const [kind, destination] of Object.entries(destinations)) {
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, buffers[kind]);
  }
}

async function buildBrowserSurface(plan, atlases, options, modules) {
  mkdirSync(options.outputDir, { recursive: true });
  const bundlePath = path.join(
    options.outputDir,
    'character-appearance-h3a.bundle.js',
  );
  const htmlPath = path.join(options.outputDir, 'index.html');
  const atlasDataUrls = Object.fromEntries(
    Object.entries(atlases).map(([kind, buffer]) => [
      kind,
      `data:image/png;base64,${buffer.toString('base64')}`,
    ]),
  );
  const payload = {
    ...plan,
    atlasDataUrls,
  };
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `PAYLOAD.summarize = (values) => ({
      samples: values.length,
      p50: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.50)-1)] : 0,
      p95: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.95)-1)] : 0,
      p99: values.length ? [...values].sort((a,b)=>a-b)[Math.max(0, Math.ceil(values.length*0.99)-1)] : 0,
      maximum: values.length ? Math.max(...values) : 0,
    });`,
    `(${h3aBrowserApplication.toString()})(THREE, RoundedBoxGeometry, RoomEnvironment, PAYLOAD);`,
  ].join('\n');
  try {
    await modules.esbuild.build({
      stdin: {
        contents: appSource,
        resolveDir: options.holoScriptRoot,
        sourcefile: 'character-appearance-h3a.entry.js',
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
  <title>Stormglass Character Appearance H3A</title>
  <style>
    html,body,#app{margin:0;width:100%;height:100%;overflow:hidden;background:#06101d}
    canvas{display:block}
    .hud{position:fixed;inset:0;pointer-events:none;color:#eef8fa;font-family:Inter,Segoe UI,sans-serif}
    .eyebrow{position:absolute;left:42px;top:34px;color:#79d4e2;font:700 12px/1.2 ui-monospace,monospace;letter-spacing:.22em}
    h1{position:absolute;left:40px;top:50px;margin:0;font:600 39px/1.05 Georgia,serif;text-shadow:0 2px 18px #000}
    .sub{position:absolute;left:42px;top:100px;color:#a9c3cf;font:500 13px/1.5 ui-monospace,monospace}
    .card{position:absolute;right:34px;top:30px;width:330px;padding:17px 20px;border:1px solid #355464;border-radius:14px;background:rgba(5,14,24,.88)}
    .label{color:#6ed0df;font:700 10px/1.4 ui-monospace,monospace;letter-spacing:.18em;text-transform:uppercase}
    .value{margin-top:6px;color:#edf7fa;font:600 13px/1.5 ui-monospace,monospace}
    .blocked{color:#efaa72}
    .rule{height:1px;background:#27414e;margin:12px 0}
    .foot{position:absolute;left:42px;bottom:28px;color:#91abb7;font:600 10px/1.4 ui-monospace,monospace;letter-spacing:.12em}
    .truth{position:absolute;right:34px;bottom:28px;color:#8fb3bf;font:600 10px/1.4 ui-monospace,monospace;text-align:right}
  </style>
</head>
<body>
  <div id="app"></div>
  <div class="hud">
    <div class="eyebrow">STORMGLASS COMMONS // CHARACTER APPEARANCE H3A</div>
    <h1>Neutral Civic Personas</h1>
    <div class="sub">Hearth Keeper · Path Tender · Record Steward</div>
    <div class="card">
      <div class="label">Read-only shadow target</div>
      <div class="value">3 civic silhouettes<br>dermal · eye · hand · hair targets<br>6 source-owned expression deltas</div>
      <div class="rule"></div>
      <div class="label blocked">Native admission blocked</div>
      <div class="value">@hair(style) geometry unwired<br>@morph / FACS channel unwired<br>Full H3 is not claimed</div>
      <div class="rule"></div>
      <div class="label">Measured local witness</div>
      <div class="value">300 warm-up + 600 frames<br>3 neutral personas simultaneous</div>
    </div>
    <div class="foot">HEARTHLIGHT BIOREALISM · ACES / SRGB · SOURCE-OWNED SHADOW PREVIEW</div>
    <div class="truth">NO FAMILY BINDING · NO TRACKING · NO BIOMETRIC STORAGE<br>NO MODEL CALLS · NO CANONICAL WRITES</div>
  </div>
  <script src="./character-appearance-h3a.bundle.js"></script>
</body>
</html>`;
  writeFileSync(htmlPath, html, 'utf8');
  return {
    htmlPath,
    bundlePath,
    appSourceHash: sha256(appSource),
    bundleHash: sha256File(bundlePath),
    htmlHash: sha256(html),
  };
}

async function serveDirectory(directory) {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const absolute = path.resolve(directory, relative);
    if (!absolute.startsWith(path.resolve(directory)) || !existsSync(absolute)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': absolute.endsWith('.js') ? 'text/javascript' : 'text/html',
      'Cache-Control': 'no-store',
    });
    response.end(readFileSync(absolute));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}/`,
  };
}

function labelSvg(width, height, title, subtitle, accent = '#72d2e0') {
  const safe = (value) =>
    String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  return Buffer.from(`<svg width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#06101d"/>
    <text x="24" y="38" fill="#f3f7f8" font-family="Segoe UI, sans-serif" font-size="25" font-weight="700">${safe(title)}</text>
    <text x="24" y="68" fill="${accent}" font-family="Consolas, monospace" font-size="14">${safe(subtitle)}</text>
  </svg>`);
}

async function panel(modules, image, width, imageHeight, title, subtitle, footer = 90) {
  const resized = await modules.sharp(image)
    .resize(width, imageHeight, { fit: 'fill' })
    .png()
    .toBuffer();
  return modules.sharp({
    create: {
      width,
      height: imageHeight + footer,
      channels: 4,
      background: '#06101d',
    },
  })
    .composite([
      { input: resized, left: 0, top: 0 },
      { input: labelSvg(width, footer, title, subtitle), left: 0, top: imageHeight },
    ])
    .png()
    .toBuffer();
}

async function horizontalSheet(modules, panels, destination, width, height) {
  const panelWidth = Math.floor(width / panels.length);
  const output = await modules.sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#06101d',
    },
  })
    .composite(
      panels.map((input, index) => ({
        input,
        left: index * panelWidth,
        top: 0,
      })),
    )
    .png()
    .toBuffer();
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, output);
  return output;
}

async function gridSheet(modules, panels, destination, width = 2400, height = 900) {
  const panelWidth = Math.floor(width / 3);
  const panelHeight = Math.floor(height / 2);
  const output = await modules.sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#06101d',
    },
  })
    .composite(
      panels.map((input, index) => ({
        input,
        left: (index % 3) * panelWidth,
        top: Math.floor(index / 3) * panelHeight,
      })),
    )
    .png()
    .toBuffer();
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, output);
  return output;
}

async function deuteranopiaBuffer(modules, source) {
  const { data, info } = await modules.sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    data[offset] = Math.round(0.625 * red + 0.375 * green);
    data[offset + 1] = Math.round(0.7 * red + 0.3 * green);
    data[offset + 2] = Math.round(0.3 * green + 0.7 * blue);
  }
  return modules.sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toBuffer();
}

async function runBrowser(surface, plan, options, modules) {
  const served = await serveDirectory(options.outputDir);
  const requests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const browser = await modules.playwright.chromium.launch({
    headless: true,
    executablePath: options.browser,
    timeout: options.timeoutMs,
    args: [
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
  try {
    const page = await browser.newPage({
      viewport: {
        width: plan.benchmark.renderWidth,
        height: plan.benchmark.renderHeight,
      },
      deviceScaleFactor: 1,
    });
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(served.url, {
      waitUntil: 'load',
      timeout: options.timeoutMs,
    });
    await page.waitForFunction(
      () => window.__H3A_READY__ === true || Boolean(window.__H3A_ERROR__),
      null,
      { timeout: options.timeoutMs },
    );
    const browserError = await page.evaluate(() => window.__H3A_ERROR__ || null);
    if (browserError) throw new Error(browserError);
    const witness = await page.evaluate(() => window.__H3A);
    const canvas = page.locator('canvas');

    const heroPanels = [];
    for (let index = 0; index < plan.personas.length; index += 1) {
      await page.evaluate(
        ({ personaIndex }) =>
          window.__h3aSetView({
            mode: 'persona',
            index: personaIndex,
            expression: 'neutral',
            lod: 0,
          }),
        { personaIndex: index },
      );
      const screenshot = await canvas.screenshot({ type: 'png' });
      const persona = plan.personas[index];
      heroPanels.push(
        await panel(
          modules,
          screenshot,
          800,
          810,
          persona.name,
          `${persona.civicRole} · ${persona.silhouetteProfile}`,
        ),
      );
    }
    const heroPath =
      options.heroOutput ||
      path.join(options.outputDir, 'character-appearance-h3a-hero.png');
    const heroBuffer = await horizontalSheet(
      modules,
      heroPanels,
      heroPath,
      2400,
      900,
    );

    const expressionPanels = [];
    for (const expression of plan.expressions) {
      await page.evaluate(
        ({ expressionId }) =>
          window.__h3aSetView({
            mode: 'persona',
            index: 0,
            expression: expressionId,
            lod: 0,
          }),
        { expressionId: expression.expressionId },
      );
      const screenshot = await canvas.screenshot({ type: 'png' });
      expressionPanels.push(
        await panel(
          modules,
          screenshot,
          800,
          360,
          expression.expressionId.toUpperCase().replaceAll('_', ' '),
          'source delta bridge preview · native @morph carried by H3B',
        ),
      );
    }
    const expressionPath =
      options.expressionOutput ||
      path.join(options.outputDir, 'character-appearance-h3a-expressions.png');
    const expressionBuffer = await gridSheet(
      modules,
      expressionPanels,
      expressionPath,
    );

    const lodPanels = [];
    for (let lod = 0; lod < 3; lod += 1) {
      await page.evaluate(
        ({ level }) =>
          window.__h3aSetView({
            mode: 'lineup',
            index: null,
            expression: 'neutral',
            lod: level,
          }),
        { level: lod },
      );
      const screenshot = await canvas.screenshot({ type: 'png' });
      const records = witness.lodSummaries.filter((entry) => entry.lod === lod);
      lodPanels.push(
        await panel(
          modules,
          screenshot,
          800,
          510,
          `LOD${lod}`,
          `${records.reduce((sum, record) => sum + record.triangles, 0).toLocaleString()} triangles · 3 personas`,
        ),
      );
    }
    const lodPath =
      options.lodOutput ||
      path.join(options.outputDir, 'character-appearance-h3a-lods.png');
    const lodBuffer = await horizontalSheet(
      modules,
      lodPanels,
      lodPath,
      2400,
      600,
    );

    await page.evaluate(() =>
      window.__h3aSetView({
        mode: 'lineup',
        index: null,
        expression: 'neutral',
        lod: 0,
      }),
    );
    const color = await canvas.screenshot({ type: 'png' });
    const gray = await modules.sharp(color).grayscale().png().toBuffer();
    const cvd = await deuteranopiaBuffer(modules, color);
    const accessibilityPanels = [
      await panel(
        modules,
        color,
        800,
        510,
        'COLOR',
        'civic silhouette · dermal target · eye target',
      ),
      await panel(
        modules,
        gray,
        800,
        510,
        'GRAYSCALE',
        'hair geometry keeps silhouettes distinct',
      ),
      await panel(
        modules,
        cvd,
        800,
        510,
        'DEUTERANOPIA',
        'identity is civic and non-family-bound',
      ),
    ];
    const accessibilityPath =
      options.accessibilityOutput ||
      path.join(options.outputDir, 'character-appearance-h3a-accessibility.png');
    const accessibilityBuffer = await horizontalSheet(
      modules,
      accessibilityPanels,
      accessibilityPath,
      2400,
      600,
    );
    return {
      witness,
      heroBuffer,
      expressionBuffer,
      lodBuffer,
      accessibilityBuffer,
      heroPath,
      expressionPath,
      lodPath,
      accessibilityPath,
      browserVersion: await browser.version(),
      requests,
      pageErrors,
      consoleErrors,
    };
  } finally {
    await browser.close();
    await new Promise((resolve) => served.server.close(resolve));
  }
}

async function validateManifest(root, holoScriptRoot, contract) {
  const manifestPath = path.join(root, MANIFEST_REL);
  if (!existsSync(manifestPath)) {
    return { status: 'fail', errors: [`missing ${MANIFEST_REL}`] };
  }
  const core = await loadCore(holoScriptRoot);
  const parsed = new core.HoloCompositionParser().parse(
    readFileSync(manifestPath, 'utf8'),
  );
  const errors = [];
  if (!parsed.success || parsed.errors.length) {
    return {
      status: 'fail',
      errors: parsed.errors.map((error) => JSON.stringify(error)),
    };
  }
  const state = properties(parsed.ast.state);
  if (
    parsed.ast.metadata.milestone !==
      'MV_CHARACTER_APPEARANCE_H3A_SHADOW_TARGET' ||
    parsed.ast.metadata.status !== 'pass' ||
    parsed.ast.metadata.authority !== 'read_only_witness'
  ) {
    errors.push('manifest metadata drifted');
  }
  for (const binding of [
    state.source,
    state.policy,
    state.seed,
    state.checker,
    state.test,
    state.report,
    state.albedoAtlas,
    state.normalAtlas,
    state.surfaceMaskAtlas,
    state.hero,
    state.expressionPreview,
    state.lodComparison,
    state.accessibilityComparison,
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
  // The manifest's copy of the refusal must agree with the contract's. Before this the
  // manifest carried retirementRefused and its reason and NOTHING read either one, so the
  // whole retire-vs-restate decision was documentation.
  if (
    state.successor?.gate !== contract?.metadata?.successorGate ||
    state.successor?.source !== contract?.metadata?.successorSource ||
    state.successor?.retirementRefused !==
      contract?.state?.supersessionBoundary?.retirementRefused ||
    canonicalJson(state.successor?.refusedProperties) !==
      canonicalJson(SUPERSESSION_PROPERTY_IDS)
  ) {
    errors.push('manifest supersession record disagrees with the H3A contract');
  }
  if (
    state.boundaries?.fullH3Claimed !== false ||
    state.boundaries?.nativeHairStyleChannelClaimed !== false ||
    state.boundaries?.nativeMorphTargetChannelClaimed !== false ||
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
  const perLod = [0, 1, 2]
    .map((lod) => {
      const records = receipt.lod.summaries.filter((entry) => entry.lod === lod);
      return `| LOD${lod} | ${records.reduce((sum, item) => sum + item.triangles, 0)} | ${Math.max(...records.map((item) => item.triangles))} | ${records.map((item) => item.hairPartCount).join(' / ')} |`;
    })
    .join('\n');
  return `# HoloLand Model Village Character Appearance H3A

**Date:** 2026-07-27

**Status:** ${receipt.status.toUpperCase()}

**Receipt:** \`${receipt.receiptHash}\`

H3A is a read-only neutral-persona visual target, not full H3. It makes three
civic silhouettes, deterministic dermal materials, restrained eye targets,
soft-faceted faces and hands, source-owned hair geometry, and six expression
deltas operative in a browser shadow consumer.

## Visual result

![H3A neutral personas](../assets/model-village/model-village-character-appearance-h3a-neutral-personas-2026-07-27.png)

![H3A expression preview](../assets/model-village/model-village-character-appearance-h3a-expression-preview-2026-07-27.png)

![H3A LOD comparison](../assets/model-village/model-village-character-appearance-h3a-lods-2026-07-27.png)

![H3A accessibility](../assets/model-village/model-village-character-appearance-h3a-accessibility-2026-07-27.png)

## Source-authored LOD

| Tier | Three persona triangles | Largest persona | Hair parts by persona |
|---|---:|---:|---:|
${perLod}

## Deterministic dermal atlas custody

- 2K albedo: \`${receipt.atlases.albedo.sha256}\`
- 2K normal: \`${receipt.atlases.normal.sha256}\`
- 1K AO/roughness/metalness mask: \`${receipt.atlases.surfaceMask.sha256}\`
- Repeated generation: byte-identical
- External asset requests: ${receipt.render.externalRequests.length}

## Measured local browser profile

- Browser: ${receipt.render.browser}
- Renderer: ${receipt.render.renderer.unmaskedRenderer}
- Backend: ${receipt.render.renderer.backend}
- Protocol: ${receipt.performance.measuredFrames} measured frames after ${receipt.performance.warmupFrames} warm-up
- Three personas simultaneous at LOD0
- rAF p95: ${receipt.performance.raf.p95.toFixed(2)} ms
- Render-submit p95: ${receipt.performance.renderSubmit.p95.toFixed(2)} ms
- Dropped-frame ratio: ${(receipt.performance.droppedFrameRatio * 100).toFixed(3)}%

## Native admission boundary (historical, resolved)

H3A was authored against upstream HoloScript commit
\`${receipt.nativeAdmission.historical.holoScriptCommit}\`, which reported authored
\`@hair(style)\` geometry as having no geometry channel and \`@morph\` as having no
FACS/morph-target channel. That record is frozen above and is no longer re-derived.

Upstream closed both gaps in \`${receipt.nativeAdmission.current.gapClosedByUpstreamCommit}\`.
This run **executed** both channels against commit
\`${receipt.nativeAdmission.current.holoScriptCommit}\` rather than asserting them:

| Authored hair style | Native mapping | Hair triangles |
|---|---|---:|
${receipt.nativeAdmission.executedProof.hairStyles
  .map((entry) => `| ${entry.hairStyleId} | ${entry.mapped.join(', ')} | ${entry.hairTriangles} |`)
  .join('\n')}

| Expression | Native morph mapping | Vertices deformed |
|---|---|---:|
${receipt.nativeAdmission.executedProof.expressions
  .map((entry) => `| ${entry.expressionId} | ${entry.mapped.join(', ')} | ${entry.changedVertexCount} |`)
  .join('\n')}

H3A still does **not** claim the native channels: its preview geometry remains
source-owned, and native channel coverage is carried by
\`${receipt.successor.gate}\` (\`${receipt.successor.source}\`). Full H3 is not admitted here.

## Retire-vs-restate, measured

H3A is retained rather than retired because it holds properties
\`${receipt.successor.gate}\` does not assert. This run did not take that on trust. It
mutated each property in **both** contracts and asked each gate's own validator whether
it noticed, comparing against that gate's pre-existing errors so unrelated drift cannot
be mistaken for supersession.

| Property | H3A asserts | \`${receipt.successor.gate}\` asserts |
|---|:--:|:--:|
${receipt.successor.properties
  .map(
    (entry) =>
      `| ${entry.label} | ${entry.heldByH3A ? 'yes' : 'NO'} | ${entry.assertedBySuccessor ? 'YES' : 'no'} |`,
  )
  .join('\n')}

Retirement refused: **${receipt.successor.retirementRefused}**. Several of these keys do
appear in \`${receipt.successor.gate}\`'s source text, but its gate never reads them, so
they can drift without anything going red -- which is why this table is built by
execution and not by reading the successor's source. If the successor ever begins
asserting one of these, this gate goes red naming that property and the retire-vs-restate
decision is reopened.

No persona binds Claude, OpenAI, Gemini, Grok, GLM, Brittney, or any adapter
family. The live blinded research profile cannot admit these civic personas
until assignment invariance is separately re-proved. Face and eye tracking are
off, biometric persistence is forbidden, and this lane performs no model calls,
network fetches, canonical writes, resident-observation writes, or seat joins.

This does not claim a complete production face, native hair-style behavior,
native morph/FACS behavior, production motion, photorealism, headset
performance, live research participation, or full-world convergence.
`;
}

export async function runCharacterAppearanceH3A(
  options = parseArgs([]),
) {
  const root = options.root || ROOT;
  const holoScriptRoot = options.holoScriptRoot || DEFAULT_HOLOSCRIPT_ROOT;
  if (options.outputDir === DEFAULT_OUTPUT && existsSync(options.outputDir)) {
    rmSync(options.outputDir, { recursive: true, force: true });
  }
  mkdirSync(options.outputDir, { recursive: true });
  const stack = await parseStack(root, holoScriptRoot);
  const validation = validateH3AContract(
    stack.contract,
    root,
    holoScriptRoot,
  );
  const plan = buildH3APlan(stack.contract);
  const nativeChannels = await proveUpstreamNativeChannels(stack.core, plan);
  const supersession = await proveSupersessionBoundary({
    contract: stack.contract,
    root,
    holoScriptRoot,
  });
  const modules = await loadWorkspaceModules(holoScriptRoot);
  const firstAtlases = generateDermalAtlasBuffers(
    modules.PNG,
    plan.atlas,
    plan.personas,
  );
  const secondAtlases = generateDermalAtlasBuffers(
    modules.PNG,
    plan.atlas,
    plan.personas,
  );
  const repeatedAtlasIdentity = Object.keys(firstAtlases).every((key) =>
    firstAtlases[key].equals(secondAtlases[key]),
  );
  writeBuffers(
    firstAtlases,
    Object.fromEntries(
      Object.keys(firstAtlases).map((kind) => [
        kind,
        path.join(options.outputDir, path.basename(ATLAS_RELS[kind])),
      ]),
    ),
  );
  if (options.writeArtifacts) {
    writeBuffers(
      firstAtlases,
      Object.fromEntries(
        Object.entries(ATLAS_RELS).map(([kind, relative]) => [
          kind,
          path.join(root, relative),
        ]),
      ),
    );
  }
  const surface = await buildBrowserSurface(
    plan,
    firstAtlases,
    options,
    modules,
  );
  const browser = await runBrowser(surface, plan, options, modules);
  const manifest = options.skipManifest
    ? { status: 'skipped', errors: [], reason: 'bootstrap_skip_requested' }
    : await validateManifest(root, holoScriptRoot, stack.contract);
  const externalRequests = browser.requests.filter(
    (url) => !url.startsWith('http://127.0.0.1:'),
  );
  const lodSummaries = browser.witness.lodSummaries;
  const checks = {
    formatStackPass:
      stack.source.success && stack.policy.success && stack.seed.success,
    h3aContractPass: validation.status === 'pass',
    manifestPass: ['pass', 'skipped'].includes(manifest.status),
    repeatedAtlasByteIdentity: repeatedAtlasIdentity,
    exactThreePersonas: plan.personas.length === 3,
    exactSixExpressions: plan.expressions.length === 6,
    exactNineLodWitnesses: lodSummaries.length === 9,
    personaTriangleBudgets: lodSummaries.every(
      (entry) => entry.triangles <= plan.lod.maximumPersonaTriangles[entry.lod],
    ),
    monotonicPerPersonaTopology: plan.personas.every((persona) => {
      const rows = lodSummaries
        .filter((entry) => entry.personaId === persona.personaId)
        .sort((left, right) => left.lod - right.lod);
      return (
        rows.length === 3 &&
        rows[0].triangles > rows[1].triangles &&
        rows[1].triangles > rows[2].triangles
      );
    }),
    sourceOwnedHairPreview: plan.personas.every(
      (persona) => persona.hairParts.length >= 4,
    ),
    sourceOwnedExpressionPreview: plan.expressions.every(
      (expression) => expression.nativeMorphTargetClaimed === false,
    ),
    // The historical gap record stays frozen; the current record must say the gap closed;
    // and full H3 is still NOT admitted by H3A (H3B carries the native channels).
    historicalNativeGapRecordFrozen:
      plan.upstreamNativeAdmission.historical
        ?.authoredHairStyleGeometryOperative === false &&
      plan.upstreamNativeAdmission.historical?.authoredMorphFacsOperative ===
        false,
    currentNativeChannelsAdmitted:
      plan.upstreamNativeAdmission.current
        ?.authoredHairStyleGeometryOperative === true &&
      plan.upstreamNativeAdmission.current?.authoredMorphFacsOperative ===
        true &&
      plan.upstreamNativeAdmission.current?.h3aClaimsNativeChannels === false &&
      plan.upstreamNativeAdmission.fullH3Admitted === false,
    // EXECUTED, not asserted: both channels compiled real output this run.
    upstreamNativeChannelsProven: nativeChannels.status === 'pass',
    // EXECUTED, not asserted: every property H3A is retained for was mutated in both
    // contracts this run, H3A noticed all ten, and H3B noticed none of them.
    supersessionBoundaryProven: supersession.status === 'pass',
    exactFrameProtocol:
      browser.witness.benchmark.raf.samples === plan.benchmark.measuredFrames &&
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
      /NVIDIA|GeForce|RTX/i.test(browser.witness.renderer.unmaskedRenderer),
    d3d11Backend: browser.witness.renderer.backend === 'D3D11',
    noExternalRequests: externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    noConsoleErrors: browser.consoleErrors.length === 0,
    exactHistoryResetContract:
      canonicalJson(browser.witness.resetEvents) === canonicalJson(RESET_EVENTS),
    identityBoundary:
      stack.contract.state.familyIdentityVisible === false &&
      stack.contract.state.adapterFamilyBinding === 'absent' &&
      stack.contract.state.researchSeatBinding === 'absent',
    readOnlyBoundary:
      stack.contract.state.canonicalWritesAllowed === false &&
      stack.contract.state.residentObservationWritesAllowed === false &&
      stack.contract.state.modelCallsAllowed === false,
    boundedClaims:
      stack.contract.state.productionFaceCompleteClaimed === false &&
      stack.contract.state.nativeHairStyleChannelClaimed === false &&
      stack.contract.state.nativeMorphTargetChannelClaimed === false &&
      stack.contract.state.photorealismClaimed === false,
  };
  const failures = [
    ...validation.errors.map((error) => `contract:${error}`),
    ...nativeChannels.failures.map((error) => `nativeChannel:${error}`),
    ...supersession.failures.map((error) => `supersession:${error}`),
    ...Object.entries(checks)
      .filter(([, value]) => value !== true)
      .map(([name]) => name),
    ...manifest.errors.map((error) => `manifest:${error}`),
  ];
  const receiptCore = {
    schema: 'hololand.model-village.character-appearance-h3a-witness.v1',
    status: failures.length ? 'fail' : 'pass',
    claim: {
      verified:
        'HoloScript owns three family-neutral civic persona targets, deterministic local dermal maps, source-authored hair geometry preview parts, source-authored expression preview deltas, three LODs, and a measured read-only hardware browser shadow witness.',
      bounded:
        'H3A is not full H3. The browser preview is not the native @hair(style) or @morph/FACS channel, cannot replace the public first release, and cannot enter live blinded research.',
    },
    sources: {
      source: { path: SOURCE_REL, sha256: sha256(stack.sourceText) },
      policy: { path: POLICY_REL, sha256: sha256(stack.policyText) },
      seed: { path: SEED_REL, sha256: sha256(stack.seedText) },
      checker: {
        path: path.relative(root, SCRIPT_PATH).replaceAll('\\', '/'),
        sha256: sha256File(SCRIPT_PATH),
      },
      inheritedH2: {
        path: stack.contract.metadata.inheritedH2Source,
        sha256: stack.contract.metadata.inheritedH2SourceSha256,
        immutable: true,
      },
    },
    nativeAdmission: {
      ...plan.upstreamNativeAdmission,
      characterHostPath: stack.contract.metadata.upstreamCharacterHostPath,
      characterHostSha256:
        stack.contract.metadata.upstreamCharacterHostSha256,
      hairBuilderPath: stack.contract.metadata.upstreamHairBuilderPath,
      hairBuilderSha256: stack.contract.metadata.upstreamHairBuilderSha256,
      // Executed evidence that the historical gap is closed, replacing the retired
      // source-text grep. Recorded so the claim is auditable from the receipt alone.
      executedProof: {
        status: nativeChannels.status,
        failures: nativeChannels.failures,
        hairStyles: nativeChannels.styleWitness,
        expressions: nativeChannels.expressionWitness,
      },
    },
    successor: {
      gate: stack.contract.metadata.successorGate,
      source: stack.contract.metadata.successorSource,
      // No content hash: pinning the successor's bytes was circular against H3B's own
      // lineage pins and never answered whether H3B had superseded anything. The
      // measured property table below answers exactly that.
      retirementRefused: supersession.retirementRefused,
      retirementRefusedReason:
        stack.contract.state.supersessionBoundary?.refusedReason,
      properties: supersession.witness,
      proofStatus: supersession.status,
    },
    plan,
    atlases: Object.fromEntries(
      Object.entries(firstAtlases).map(([kind, buffer]) => [
        kind,
        {
          path: ATLAS_RELS[kind],
          sha256: sha256(buffer),
          bytes: buffer.length,
          dimensions:
            kind === 'surfaceMask'
              ? plan.atlas.surfaceMaskSize
              : plan.atlas[`${kind}Size`],
        },
      ]),
    ),
    lod: { summaries: lodSummaries },
    performance: {
      warmupFrames: plan.benchmark.warmupFrames,
      measuredFrames: plan.benchmark.measuredFrames,
      simultaneousPersonaCount: plan.benchmark.simultaneousPersonaCount,
      ...browser.witness.benchmark,
    },
    render: {
      hero: {
        path: path.relative(root, browser.heroPath).replaceAll('\\', '/'),
        sha256: sha256(browser.heroBuffer),
        bytes: browser.heroBuffer.length,
        dimensions: [2400, 900],
      },
      expressionPreview: {
        path: path.relative(root, browser.expressionPath).replaceAll('\\', '/'),
        sha256: sha256(browser.expressionBuffer),
        bytes: browser.expressionBuffer.length,
        dimensions: [2400, 900],
      },
      lodComparison: {
        path: path.relative(root, browser.lodPath).replaceAll('\\', '/'),
        sha256: sha256(browser.lodBuffer),
        bytes: browser.lodBuffer.length,
        dimensions: [2400, 600],
      },
      accessibilityComparison: {
        path: path
          .relative(root, browser.accessibilityPath)
          .replaceAll('\\', '/'),
        sha256: sha256(browser.accessibilityBuffer),
        bytes: browser.accessibilityBuffer.length,
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
        'HoloScript H3A .holo/.hsplus/.hs + immutable H2 + pinned upstream native-gap evidence -> deterministic dermal atlas -> source-owned Three/WebGL2 D3D11 shadow preview',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      externalAssets: [],
    },
    boundaries: {
      fullH3Claimed: false,
      nativeHairStyleChannelClaimed: false,
      nativeMorphTargetChannelClaimed: false,
      publicFirstReleaseReplacementClaimed: false,
      adapterFamilyBinding: 'absent',
      liveResearchJoinAllowed: false,
      researchSeatBinding: 'absent',
      faceTrackingEnabledByDefault: false,
      eyeTrackingEnabledByDefault: false,
      biometricPersistenceAllowed: false,
      canonicalWritesAllowed: false,
      residentObservationWritesAllowed: false,
      modelCalls: 0,
      networkFetches: 0,
      productionFaceCompleteClaimed: false,
      photorealismClaimed: false,
      fullWorldConvergenceClaimed: false,
    },
    manifest,
    checks,
    failures,
  };
  const receiptHash = sha256(canonicalJson(receiptCore));
  const receipt = { ...receiptCore, receiptHash };
  const receiptPath = path.join(
    options.outputDir,
    'character-appearance-h3a-witness.json',
  );
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (options.reportOutput) {
    mkdirSync(path.dirname(options.reportOutput), { recursive: true });
    writeFileSync(options.reportOutput, reportMarkdown(receipt), 'utf8');
  }
  return {
    receipt,
    receiptPath,
    heroPath: browser.heroPath,
    expressionPath: browser.expressionPath,
    lodPath: browser.lodPath,
    accessibilityPath: browser.accessibilityPath,
    reportPath: options.reportOutput,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCharacterAppearanceH3A(parseArgs(process.argv.slice(2)))
    .then((result) => {
      const summary = {
        status: result.receipt.status,
        receiptHash: result.receipt.receiptHash,
        receiptPath: result.receiptPath,
        heroPath: result.heroPath,
        expressionPath: result.expressionPath,
        lodPath: result.lodPath,
        accessibilityPath: result.accessibilityPath,
        reportPath: result.reportPath,
        renderer: result.receipt.render.renderer.unmaskedRenderer,
        rafP95Milliseconds: result.receipt.performance.raf.p95,
        renderSubmitP95Milliseconds:
          result.receipt.performance.renderSubmit.p95,
        droppedFrameRatio: result.receipt.performance.droppedFrameRatio,
        largestPersonaTriangles: [0, 1, 2].map((lod) =>
          Math.max(
            ...result.receipt.lod.summaries
              .filter((entry) => entry.lod === lod)
              .map((entry) => entry.triangles),
          ),
        ),
        fullH3Admitted: result.receipt.nativeAdmission.fullH3Admitted,
        failures: result.receipt.failures,
      };
      console.log(JSON.stringify(summary, null, 2));
      if (result.receipt.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
}
