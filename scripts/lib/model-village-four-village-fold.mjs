import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  canonicalJson,
  digest,
  sha256,
} from './model-village-live-physics.mjs';

export { canonicalJson, digest, sha256 };

export const FOLD_SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-resident-motion-four-village-fold.holo';
export const FOLD_MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-resident-motion-four-village-fold-manifest.holo';
export const FOLD_POLICY_REL =
  'source/proofs/model-village-resident-motion-four-village-fold.hsplus';
export const FOLD_SEED_REL =
  'source/proofs/model-village-resident-motion-four-village-fold-seed.hs';
export const PUBLIC_CATALOG_REL =
  'source/layers/vr/frontier/model-village/model-village-public-embodiments.holo';
export const BLINDED_CATALOG_REL =
  'source/layers/vr/frontier/model-village/model-village-resident-kit.holo';

export const STORY_PROFILE = 'village_story_unblinded';
export const BLINDED_PROFILE = 'research_live_blinded';
export const DISCLOSURE =
  'HoloLand-authored visual interpretations; not affiliated with or endorsed by the named model providers.';
export const PROTECTED_HASH_FIELDS = [
  'canonical_scene_hash',
  'canonical_pose_hash',
  'logical_clock_hash',
  'public_state_hash',
  'executed_schedule_hash',
  'resident_observation_hash',
  'action_receipt_root',
];

const GENESIS_PHASES = [
  'source_glyphs',
  'terrain_weave',
  'institution_lights',
  'six_seat_ring',
  'manifest_seal',
];
const GENESIS_PHASE_END_STEPS = [47, 95, 143, 191, 239];
const SAMPLE_STEPS = [0, 119, 239, 359, 539, 719];
const BLINDED_FORBIDDEN_FIELDS = [
  'publicEmbodimentId',
  'publicDisplayName',
  'embodimentTitle',
  'familyId',
  'agentSurfaceId',
  'modelFamily',
  'familyMantleId',
  'adapterIdentity',
  'exactModelRevision',
  'conditionIdentity',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function propertyMap(node) {
  if (!node) return {};
  if (!Array.isArray(node.properties)) return node.properties ?? {};
  return Object.fromEntries(node.properties.map(({ key, value }) => [key, value]));
}

function templateByName(composition, name) {
  return composition.children.find((node) => node.type === 'template' && node.name === name);
}

function spatialObjects(composition, groupName) {
  const group = (composition.spatialGroups ?? []).find((entry) => entry.name === groupName);
  return group?.objects ?? [];
}

function requireFile(paths, key) {
  assert(fs.existsSync(paths[key]), `Required ${key} path is missing: ${paths[key]}`);
}

function parseOrThrow(Parser, text, label) {
  const result = new Parser().parse(text);
  assert(
    result.success,
    `${label} parse failed: ${canonicalJson(result.errors ?? [])}`
  );
  return result.ast;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function timingSummary(values) {
  return {
    sampleCount: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values.length > 0 ? Math.max(...values) : null,
  };
}

function normalizeNumber(value) {
  assert(Number.isFinite(value), `Non-finite motion value: ${value}`);
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeVector(vector) {
  assert(Array.isArray(vector) && vector.length === 3, 'Expected a finite vec3');
  return vector.map(normalizeNumber);
}

function lerp(left, right, amount) {
  return normalizeNumber(left + (right - left) * amount);
}

function interpolatePosition(left, right, amount) {
  return left.map((value, index) => lerp(value, right[index], amount));
}

function headingBetween(left, right, fallback) {
  const deltaX = right[0] - left[0];
  const deltaZ = right[2] - left[2];
  if (Math.abs(deltaX) + Math.abs(deltaZ) < 1e-9) return normalizeNumber(fallback);
  return normalizeNumber(Math.atan2(deltaX, deltaZ));
}

function genesisPhase(step) {
  const index = GENESIS_PHASE_END_STEPS.findIndex((endStep) => step <= endStep);
  return GENESIS_PHASES[index === -1 ? GENESIS_PHASES.length - 1 : index];
}

function scriptedFoldFocus(step) {
  if (step < 240) return 'overview';
  if (step < 360) return 'fold-01';
  if (step < 480) return 'fold-02';
  if (step < 600) return 'fold-03';
  return 'fold-04';
}

function routeMarks(step) {
  if (step < 360) return [];
  if (step < 480) return ['fold-01'];
  if (step < 600) return ['fold-01', 'fold-02'];
  if (step < 719) return ['fold-01', 'fold-02', 'fold-03'];
  return ['fold-01', 'fold-02', 'fold-03', 'fold-04'];
}

function actorStateAtStep(track, waypoints, actor, step) {
  const points = track.waypointIds.map((id) => {
    const waypoint = waypoints.get(id);
    assert(waypoint, `Track ${track.trackId} references missing waypoint ${id}`);
    return waypoint;
  });
  assert(points.length === 3, `Track ${track.trackId} must have three waypoints`);
  assert(track.phaseEndSteps.length === 3, `Track ${track.trackId} phase drifted`);

  let position = points[0].position;
  let socialStage = 'arrive';
  let heading = track.startHeadingRadians;
  if (step >= 240 && step <= track.phaseEndSteps[1]) {
    const denominator = track.phaseEndSteps[1] - 239;
    const amount = Math.min(1, Math.max(0, (step - 239) / denominator));
    position = interpolatePosition(points[0].position, points[1].position, amount);
    heading = headingBetween(points[0].position, points[1].position, heading);
    socialStage = 'walk';
  } else if (step > track.phaseEndSteps[1]) {
    const denominator = track.phaseEndSteps[2] - track.phaseEndSteps[1];
    const amount = Math.min(
      1,
      Math.max(0, (step - track.phaseEndSteps[1]) / denominator)
    );
    position = interpolatePosition(points[1].position, points[2].position, amount);
    heading = headingBetween(points[1].position, points[2].position, heading);
    socialStage = amount >= 1 ? points[2].socialStage : 'walk';
  }
  return {
    actorId: actor.actorId,
    trackId: track.trackId,
    position: normalizeVector(position),
    headingRadians: normalizeNumber(heading),
    socialStage,
    visible: step >= 240,
  };
}

export async function loadFoldContracts({ repoRoot, holoScriptRoot }) {
  const paths = {
    source: path.join(repoRoot, FOLD_SOURCE_REL),
    manifest: path.join(repoRoot, FOLD_MANIFEST_REL),
    policy: path.join(repoRoot, FOLD_POLICY_REL),
    seed: path.join(repoRoot, FOLD_SEED_REL),
    publicCatalog: path.join(repoRoot, PUBLIC_CATALOG_REL),
    blindedCatalog: path.join(repoRoot, BLINDED_CATALOG_REL),
    core: path.join(holoScriptRoot, 'packages/core/dist/index.js'),
  };
  for (const key of Object.keys(paths)) requireFile(paths, key);

  const core = await import(`${pathToFileURL(paths.core).href}?mv-s4=${Date.now()}`);
  assert(typeof core.HoloCompositionParser === 'function', 'Holo parser unavailable');
  assert(typeof core.HoloScriptPlusParser === 'function', 'HoloScript+ parser unavailable');
  assert(typeof core.HoloScriptCodeParser === 'function', 'HoloScript parser unavailable');

  const texts = {
    source: fs.readFileSync(paths.source, 'utf8'),
    manifest: fs.readFileSync(paths.manifest, 'utf8'),
    policy: fs.readFileSync(paths.policy, 'utf8'),
    seed: fs.readFileSync(paths.seed, 'utf8'),
    publicCatalog: fs.readFileSync(paths.publicCatalog, 'utf8'),
    blindedCatalog: fs.readFileSync(paths.blindedCatalog, 'utf8'),
  };
  const sourceAst = parseOrThrow(
    core.HoloCompositionParser,
    texts.source,
    'MV-S4 .holo'
  );
  const manifestAst = parseOrThrow(
    core.HoloCompositionParser,
    texts.manifest,
    'MV-S4 manifest .holo'
  );
  const policyProgram = parseOrThrow(
    core.HoloScriptPlusParser,
    texts.policy,
    'MV-S4 .hsplus'
  );
  const seedNodes = parseOrThrow(
    core.HoloScriptCodeParser,
    texts.seed,
    'MV-S4 .hs'
  );
  const publicAst = parseOrThrow(
    core.HoloCompositionParser,
    texts.publicCatalog,
    'public embodiment .holo'
  );
  const blindedAst = parseOrThrow(
    core.HoloCompositionParser,
    texts.blindedCatalog,
    'blinded resident .holo'
  );

  const policyComposition = policyProgram.children.find(
    (node) => node.type === 'composition'
  );
  assert(policyComposition, 'MV-S4 policy composition unavailable');
  const policyConfig = policyComposition.children.find((node) => node.type === 'config');
  const policyState = policyComposition.children.find((node) => node.type === 'state');
  const fixedStep = templateByName(policyComposition, 'FixedStepMotionContract');
  const socialStaging = templateByName(policyComposition, 'ResidentSocialStagingContract');
  const projectionGate = templateByName(policyComposition, 'ProfileProjectionGate');
  const navigationGate = templateByName(policyComposition, 'FoldNavigationGate');
  const noFeedbackGate = templateByName(policyComposition, 'NoFeedbackGate');
  const replayGate = templateByName(policyComposition, 'ReplayAcceptanceGate');
  const gpuWitness = templateByName(policyComposition, 'GpuWitnessContract');
  const formatRoles = templateByName(policyComposition, 'FormatRoleContract');
  for (const [name, node] of Object.entries({
    policyConfig,
    policyState,
    fixedStep,
    socialStaging,
    projectionGate,
    navigationGate,
    noFeedbackGate,
    replayGate,
    gpuWitness,
    formatRoles,
  })) {
    assert(node, `MV-S4 policy node ${name} is missing`);
  }

  const seedManifest = seedNodes.find(
    (node) => node.properties?.type === 'model_village_resident_motion_fold_seed_manifest'
  );
  const waypoints = seedNodes
    .filter((node) => node.properties?.type === 'resident_motion_waypoint')
    .map((node) => ({
      waypointId: node.properties.waypointId,
      position: normalizeVector(node.position),
      socialStage: node.properties.socialStage,
    }));
  const tracks = seedNodes
    .filter((node) => node.properties?.type === 'profile_local_resident_motion_track')
    .map((node) => ({
      trackId: node.properties.trackId,
      presentationProfile: node.properties.presentationProfile,
      catalogSlot: node.properties.catalogSlot,
      waypointIds: node.properties.waypointIds,
      phaseEndSteps: node.properties.phaseEndSteps,
      startHeadingRadians: node.properties.startHeadingRadians,
    }));
  const seedGate = seedNodes.find(
    (node) => node.properties?.type === 'model_village_resident_motion_fold_seed_gate'
  );
  assert(seedManifest && seedGate, 'MV-S4 seed manifest or acceptance gate is missing');

  const folds = spatialObjects(sourceAst, 'FourVillageFold').map((node) => {
    const properties = propertyMap(node);
    return {
      objectId: node.name,
      label: properties.label,
      position: normalizeVector(properties.position),
      scale: normalizeVector(properties.scale),
      visualCharacter: properties.visualCharacter,
      routeAccent: properties.routeAccent,
      routeId: properties.routeId,
      traits: node.traits ?? [],
    };
  });
  const worldObjects = Object.fromEntries(
    (sourceAst.objects ?? []).map((node) => [node.name, propertyMap(node)])
  );

  const publicObjects = spatialObjects(publicAst, 'PublicFamilyEmbodimentCatalog');
  const blindedObjects = spatialObjects(blindedAst, 'ResidentLineup');
  assert(publicObjects.length === 6, 'Public embodiment catalog must contain six actors');
  assert(blindedObjects.length === 6, 'Blinded resident catalog must contain six actors');

  const policy = {
    config: propertyMap(policyConfig),
    state: propertyMap(policyState),
    fixedStep: propertyMap(fixedStep),
    socialStaging: propertyMap(socialStaging),
    projectionGate: propertyMap(projectionGate),
    navigationGate: propertyMap(navigationGate),
    noFeedbackGate: propertyMap(noFeedbackGate),
    replayGate: propertyMap(replayGate),
    gpuWitness: propertyMap(gpuWitness),
    formatRoles: propertyMap(formatRoles),
  };
  const seed = {
    manifest: seedManifest.properties,
    gate: seedGate.properties,
    waypoints,
    tracks,
  };

  const worldState = propertyMap(sourceAst.state);
  const worldEnvironment = propertyMap(sourceAst.environment);
  assert(sourceAst.metadata?.milestone === 'MV-S4', 'MV-S4 world milestone drifted');
  assert(worldState.foldCount === 4, 'MV-S4 world fold count drifted');
  assert(folds.length === 4, 'MV-S4 Fold topology must contain four villages');
  assert(policy.fixedStep.steps === 720, 'MV-S4 fixed-step count drifted');
  assert(policy.fixedStep.runs === 3, 'MV-S4 replay count drifted');
  assert(waypoints.length === 12, 'MV-S4 waypoint count drifted');
  assert(
    tracks.filter((track) => track.presentationProfile === STORY_PROFILE).length === 6,
    'MV-S4 story track count drifted'
  );
  assert(
    tracks.filter((track) => track.presentationProfile === BLINDED_PROFILE).length === 6,
    'MV-S4 blinded track count drifted'
  );
  assert(
    policy.formatRoles.holoParser === 'HoloCompositionParser'
      && policy.formatRoles.hsplusParser === 'HoloScriptPlusParser'
      && policy.formatRoles.hsParser === 'HoloScriptCodeParser',
    'MV-S4 format parser contract drifted'
  );

  return {
    paths,
    texts,
    sourceAst,
    manifestAst,
    manifest: {
      metadata: manifestAst.metadata,
      state: propertyMap(manifestAst.state),
      evidenceBoundary: propertyMap(
        (manifestAst.objects ?? []).find((node) => node.name === 'EvidenceBoundary')
      ),
    },
    world: {
      metadata: sourceAst.metadata,
      environment: worldEnvironment,
      state: worldState,
      objects: worldObjects,
      folds,
    },
    policy,
    seed,
    catalogs: {
      publicObjects,
      blindedObjects,
    },
    sourceHashes: {
      holo: sha256(texts.source),
      hsplus: sha256(texts.policy),
      hs: sha256(texts.seed),
      publicCatalog: sha256(texts.publicCatalog),
      blindedCatalog: sha256(texts.blindedCatalog),
    },
  };
}

export function validateFoldManifest(
  contracts,
  {
    repoRoot,
    motion,
    observerIsolation,
  }
) {
  const { metadata, state, evidenceBoundary } = contracts.manifest;
  assert(metadata.schema === 'hololand.model-village.resident-motion-fold-manifest.v1', 'MV-S4 manifest schema drifted');
  assert(metadata.status === 'PASS_BOUNDED', 'MV-S4 manifest status drifted');
  const fileBindings = [
    ['worldSource', 'worldSourceSha256'],
    ['policySource', 'policySourceSha256'],
    ['seedSource', 'seedSourceSha256'],
    ['publicEmbodimentSource', 'publicEmbodimentSourceSha256'],
    ['neutralResidentSource', 'neutralResidentSourceSha256'],
    ['bridgeLibrary', 'bridgeLibrarySha256'],
    ['checker', 'checkerSha256'],
    ['testSource', 'testSourceSha256'],
    ['heroFrame', 'heroFrameSha256'],
    ['report', 'reportSha256'],
  ];
  for (const [pathField, hashField] of fileBindings) {
    const relativePath = metadata[pathField];
    const expectedHash = metadata[hashField];
    assert(typeof relativePath === 'string', `MV-S4 manifest ${pathField} is missing`);
    assert(typeof expectedHash === 'string', `MV-S4 manifest ${hashField} is missing`);
    const absolutePath = path.join(repoRoot, relativePath);
    assert(fs.existsSync(absolutePath), `MV-S4 manifest file is missing: ${relativePath}`);
    assert(
      sha256(fs.readFileSync(absolutePath)) === expectedHash,
      `MV-S4 manifest hash drifted: ${relativePath}`
    );
  }
  assert(
    state.storyReplaySha256 === motion[STORY_PROFILE].stateDigests.combined,
    'MV-S4 manifest story replay digest drifted'
  );
  assert(
    state.blindedReplaySha256 === motion[BLINDED_PROFILE].stateDigests.combined,
    'MV-S4 manifest blinded replay digest drifted'
  );
  assert(
    state.combinedProfileReplaySha256 === motion.combinedProfileDigest,
    'MV-S4 manifest combined profile digest drifted'
  );
  assert(
    state.observerProtectedStateSha256 === observerIsolation.protectedDigest,
    'MV-S4 manifest observer protected digest drifted'
  );
  assert(state.observerMutationDelta === 0, 'MV-S4 manifest observer mutation drifted');
  assert(state.publicCatalogLoadedInBlindedProfile === false, 'MV-S4 manifest blinded catalog boundary drifted');
  assert(state.blindedPayloadContainsPublicNames === false, 'MV-S4 manifest public-name boundary drifted');
  assert(state.externalNetworkFetchCount === 0, 'MV-S4 manifest external network count drifted');
  assert(state.modelCallCount === 0, 'MV-S4 manifest model call count drifted');
  assert(
    Array.isArray(evidenceBoundary.proved) && evidenceBoundary.proved.length >= 10,
    'MV-S4 manifest proved boundary is incomplete'
  );
  assert(
    Array.isArray(evidenceBoundary.notProved) && evidenceBoundary.notProved.length >= 8,
    'MV-S4 manifest not-proved boundary is incomplete'
  );
  return {
    status: metadata.status,
    schema: metadata.schema,
    manifestSha256: sha256(contracts.texts.manifest),
    sealedFileCount: fileBindings.length,
    storyReplaySha256: state.storyReplaySha256,
    blindedReplaySha256: state.blindedReplaySha256,
    combinedProfileReplaySha256: state.combinedProfileReplaySha256,
    heroFrameSha256: metadata.heroFrameSha256,
    reportSha256: metadata.reportSha256,
  };
}

export function buildProfileProjection(contracts, profile) {
  const tracks = contracts.seed.tracks
    .filter((track) => track.presentationProfile === profile)
    .sort((left, right) => left.catalogSlot - right.catalogSlot);
  assert(tracks.length === 6, `Profile ${profile} must resolve six local tracks`);

  if (profile === STORY_PROFILE) {
    const actors = contracts.catalogs.publicObjects.map((node, index) => {
      const outer = propertyMap(node);
      const identity = outer.properties ?? {};
      return {
        actorId: identity.publicEmbodimentId,
        displayName: identity.publicDisplayName,
        title: identity.embodimentTitle ?? null,
        familyMantleId: identity.familyMantleId,
        accentColor: identity.familyMantleAccentColor,
        silhouette: 'stormglass_family_mantle_proxy',
        track: tracks[index],
      };
    });
    const projection = {
      profile,
      purpose: 'public_story_only_not_live_research',
      disclosure: DISCLOSURE,
      identitySource: 'public_embodiment_catalog',
      researchJoin: null,
      actors,
    };
    assert(
      actors.every((actor) => actor.actorId && actor.displayName && actor.track),
      'Story projection actor fields are incomplete'
    );
    return projection;
  }

  assert(profile === BLINDED_PROFILE, `Unsupported presentation profile: ${profile}`);
  const actors = contracts.catalogs.blindedObjects.map((node, index) => {
    const outer = propertyMap(node);
    const identity = outer.properties ?? {};
    return {
      actorId: identity.residentId,
      displayName: identity.researchAlias,
      villageRole: identity.villageRole,
      silhouette: identity.silhouetteId,
      glyphId: identity.glyphId,
      accentColor: identity.accentColor,
      track: tracks[index],
    };
  });
  const projection = {
    profile,
    purpose: 'live_research_identity_blinded',
    identitySource: 'neutral_resident_catalog',
    publicCatalogLoaded: false,
    actors,
  };
  const serialized = canonicalJson(projection);
  for (const field of BLINDED_FORBIDDEN_FIELDS) {
    assert(!serialized.includes(`"${field}"`), `Blinded projection leaked field ${field}`);
  }
  for (const publicObject of contracts.catalogs.publicObjects) {
    const identity = propertyMap(publicObject).properties ?? {};
    assert(
      !serialized.includes(identity.publicDisplayName),
      `Blinded projection leaked public identity ${identity.publicDisplayName}`
    );
  }
  assert(
    actors.every((actor) => actor.actorId?.startsWith('resident-') && actor.track),
    'Blinded projection actor fields are incomplete'
  );
  return projection;
}

export function runMotionReplay(contracts, projection) {
  const waypoints = new Map(
    contracts.seed.waypoints.map((waypoint) => [waypoint.waypointId, waypoint])
  );
  const sampleSet = new Set(SAMPLE_STEPS);
  const samples = [];
  const started = performance.now();
  let finalState = null;
  for (let step = 0; step < contracts.policy.fixedStep.steps; step += 1) {
    const actors = projection.actors.map((actor) =>
      actorStateAtStep(actor.track, waypoints, actor, step)
    );
    const frame = {
      step,
      genesisPhase: genesisPhase(step),
      genesisSealed: step >= 239,
      scriptedFoldFocus: scriptedFoldFocus(step),
      routeMarks: routeMarks(step),
      actors,
    };
    if (sampleSet.has(step)) samples.push(frame);
    finalState = frame;
  }
  const elapsedMs = performance.now() - started;
  assert(finalState, 'Motion replay produced no final state');
  const actorStateDigest = digest({
    profile: projection.profile,
    samples: samples.map(({ step, actors }) => ({ step, actors })),
  });
  const genesisStateDigest = digest(
    samples.map(({ step, genesisPhase, genesisSealed }) => ({
      step,
      genesisPhase,
      genesisSealed,
    }))
  );
  const foldFocusDigest = digest(
    samples.map(({ step, scriptedFoldFocus }) => ({ step, scriptedFoldFocus }))
  );
  const routeMarkDigest = digest(
    samples.map(({ step, routeMarks: marks }) => ({ step, routeMarks: marks }))
  );
  const combined = digest({
    profile: projection.profile,
    inputManifest: contracts.sourceHashes,
    actorStateDigest,
    genesisStateDigest,
    foldFocusDigest,
    routeMarkDigest,
  });
  return {
    profile: projection.profile,
    elapsedMs,
    samples,
    finalState,
    stateDigests: {
      actorState: actorStateDigest,
      genesisState: genesisStateDigest,
      foldFocus: foldFocusDigest,
      routeMarks: routeMarkDigest,
      combined,
    },
  };
}

export function runDeterministicMotionReplays(contracts) {
  const profiles = [STORY_PROFILE, BLINDED_PROFILE];
  const output = {};
  for (const profile of profiles) {
    const projection = buildProfileProjection(contracts, profile);
    const runs = Array.from(
      { length: contracts.policy.fixedStep.runs },
      () => runMotionReplay(contracts, projection)
    );
    const firstDigest = runs[0].stateDigests.combined;
    assert(
      runs.every((run) => run.stateDigests.combined === firstDigest),
      `${profile} replay state digest mismatch`
    );
    output[profile] = {
      projection,
      runCount: runs.length,
      accepted: true,
      sameInputSameState: true,
      stateDigests: runs[0].stateDigests,
      samples: runs[0].samples,
      finalState: runs[0].finalState,
      timing: timingSummary(runs.map((run) => run.elapsedMs)),
    };
  }
  const storyActorIds = new Set(output[STORY_PROFILE].projection.actors.map(({ actorId }) => actorId));
  const blindedActorIds = new Set(
    output[BLINDED_PROFILE].projection.actors.map(({ actorId }) => actorId)
  );
  assert(
    [...storyActorIds].every((actorId) => !blindedActorIds.has(actorId)),
    'Story and blinded actor identifiers must be disjoint'
  );
  output.combinedProfileDigest = digest({
    story: output[STORY_PROFILE].stateDigests.combined,
    blinded: output[BLINDED_PROFILE].stateDigests.combined,
  });
  return output;
}

export function createProtectedState() {
  return Object.fromEntries(
    PROTECTED_HASH_FIELDS.map((field) => [
      field,
      digest({ field, anchor: 'mv-s4-no-feedback-baseline' }),
    ])
  );
}

export function applyObserverNavigation(state, requestedFoldId) {
  const allowedFoldIds = ['fold-01', 'fold-02', 'fold-03', 'fold-04'];
  if (!allowedFoldIds.includes(requestedFoldId)) {
    return {
      ...state,
      navigationAccepted: false,
      navigationReason: 'unknown_fold',
    };
  }
  return {
    ...state,
    focusedFoldId: requestedFoldId,
    routeMarks: [...new Set([...(state.routeMarks ?? []), requestedFoldId])],
    navigationAccepted: true,
    navigationReason: 'presentation_focus_only',
  };
}

export function verifyObserverIsolation() {
  const protectedHashes = createProtectedState();
  let state = {
    focusedFoldId: 'overview',
    routeMarks: [],
    reducedMotion: false,
    protectedHashes,
  };
  for (const foldId of ['fold-01', 'fold-02', 'fold-03', 'fold-04']) {
    state = applyObserverNavigation(state, foldId);
    assert(state.navigationAccepted, `Observer navigation failed for ${foldId}`);
    assert(
      canonicalJson(state.protectedHashes) === canonicalJson(protectedHashes),
      `Observer navigation mutated protected state at ${foldId}`
    );
  }
  const denied = applyObserverNavigation(state, 'fold-secret-condition');
  assert(denied.navigationAccepted === false, 'Unknown fold navigation did not fail closed');
  assert(
    canonicalJson(denied.protectedHashes) === canonicalJson(protectedHashes),
    'Denied navigation mutated protected state'
  );
  return {
    acceptedFoldIds: ['fold-01', 'fold-02', 'fold-03', 'fold-04'],
    deniedFoldId: 'fold-secret-condition',
    protectedFieldCount: PROTECTED_HASH_FIELDS.length,
    protectedDigest: digest(protectedHashes),
    mutationDelta: 0,
    presentationCanAffectOutcome: false,
    finalPresentationState: {
      focusedFoldId: state.focusedFoldId,
      routeMarks: state.routeMarks,
      reducedMotion: state.reducedMotion,
    },
  };
}
