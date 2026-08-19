import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

export const LIVE_PHYSICS_SOURCE_REL =
  'source/layers/vr/frontier/model-village/model-village-live-weather-fluid-physics.holo';
export const LIVE_PHYSICS_MANIFEST_REL =
  'source/layers/vr/frontier/model-village/model-village-live-weather-fluid-physics-manifest.holo';
export const LIVE_PHYSICS_POLICY_REL =
  'source/proofs/model-village-live-physics-contract.hsplus';
export const LIVE_PHYSICS_SEED_REL =
  'source/proofs/model-village-live-physics-seed.hs';

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in canonical state: ${value}`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function objectProperties(node) {
  return Object.fromEntries((node?.properties ?? []).map(({ key, value }) => [key, value]));
}

function templateByName(composition, name) {
  return composition.children.find((node) => node.type === 'template' && node.name === name);
}

function seedByType(seedNodes, type) {
  return seedNodes.find((node) => node.properties?.type === type);
}

function traitsByName(object, name) {
  return (object?.traits ?? []).filter((trait) => trait.name === name);
}

function finiteDeep(value) {
  if (Array.isArray(value)) return value.every(finiteDeep);
  if (value && typeof value === 'object') return Object.values(value).every(finiteDeep);
  return typeof value !== 'number' || Number.isFinite(value);
}

function normalizeNumber(value) {
  if (!Number.isFinite(value)) throw new Error(`Non-finite simulation value: ${value}`);
  return Object.is(value, -0) ? 0 : value;
}

function normalizeVector(vector) {
  if (Array.isArray(vector)) return vector.map(normalizeNumber);
  if (vector && typeof vector === 'object') {
    const values = [vector.x, vector.y, vector.z];
    if (Object.hasOwn(vector, 'w')) values.push(vector.w);
    return values.map(normalizeNumber);
  }
  return null;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

function timingSummary(values) {
  return {
    sampleCount: values.length,
    totalMs: values.reduce((sum, value) => sum + value, 0),
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values.length > 0 ? Math.max(...values) : null,
  };
}

export function createXorShift32(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function materializeFluidParticles(seed) {
  const random = createXorShift32(seed.deterministicSeed);
  const lattice = seed.fluidSeed;
  const particles = [];
  for (let layer = 0; layer < lattice.layers; layer += 1) {
    for (let row = 0; row < lattice.rows; row += 1) {
      for (let column = 0; column < lattice.columns; column += 1) {
        const jitter = () => (random() * 2 - 1) * lattice.jitterAmplitude;
        particles.push({
          id: particles.length,
          position: [
            lattice.origin[0] + column * lattice.spacing[0] + jitter(),
            lattice.origin[1] + row * lattice.spacing[1] + jitter(),
            lattice.origin[2] + layer * lattice.spacing[2] + jitter(),
          ],
          velocity: [...lattice.initialVelocity],
        });
      }
    }
  }
  assert(particles.length === lattice.particleCount, 'Fluid lattice particle count drifted');
  return particles;
}

export async function loadLivePhysicsContracts({
  repoRoot,
  holoScriptRoot,
}) {
  const paths = {
    source: path.join(repoRoot, LIVE_PHYSICS_SOURCE_REL),
    manifest: path.join(repoRoot, LIVE_PHYSICS_MANIFEST_REL),
    policy: path.join(repoRoot, LIVE_PHYSICS_POLICY_REL),
    seed: path.join(repoRoot, LIVE_PHYSICS_SEED_REL),
    core: path.join(holoScriptRoot, 'packages/core/dist/index.js'),
    traits: path.join(holoScriptRoot, 'packages/core/dist/traits/index.js'),
    runtime: path.join(holoScriptRoot, 'packages/runtime/dist/index.js'),
    three: path.join(holoScriptRoot, 'node_modules/three/build/three.module.js'),
    clothRuntimeSource: path.join(
      holoScriptRoot,
      'packages/core/src/traits/AdvancedClothTrait.ts'
    ),
    fluidRuntimeSource: path.join(
      holoScriptRoot,
      'packages/core/src/traits/FluidSimulationTrait.ts'
    ),
    rigidRuntimeSource: path.join(
      holoScriptRoot,
      'packages/runtime/src/physics/PhysicsWorld.ts'
    ),
  };
  for (const [key, filePath] of Object.entries(paths)) {
    assert(fs.existsSync(filePath), `Required ${key} path is missing: ${filePath}`);
  }

  const [core, traits, runtime, three] = await Promise.all([
    import(`${pathToFileURL(paths.core).href}?mv-s3=${Date.now()}`),
    import(`${pathToFileURL(paths.traits).href}?mv-s3=${Date.now()}`),
    import(pathToFileURL(paths.runtime).href),
    import(pathToFileURL(paths.three).href),
  ]);
  assert(typeof core.HoloCompositionParser === 'function', 'Holo parser unavailable');
  assert(typeof core.HoloScriptPlusParser === 'function', 'HoloScript+ parser unavailable');
  assert(typeof core.HoloScriptCodeParser === 'function', 'HoloScript parser unavailable');
  assert(
    typeof traits.fluidSimulationHandler?.onUpdate === 'function',
    'fluidSimulationHandler lifecycle unavailable'
  );
  assert(
    typeof traits.advancedClothHandler?.onUpdate === 'function',
    'advancedClothHandler lifecycle unavailable'
  );
  assert(typeof runtime.PhysicsWorld === 'function', 'PhysicsWorld unavailable');
  assert(typeof three.Object3D === 'function', 'Three Object3D unavailable');

  const texts = {
    source: fs.readFileSync(paths.source, 'utf8'),
    manifest: fs.readFileSync(paths.manifest, 'utf8'),
    policy: fs.readFileSync(paths.policy, 'utf8'),
    seed: fs.readFileSync(paths.seed, 'utf8'),
  };
  const sourceResult = new core.HoloCompositionParser().parse(texts.source);
  const manifestResult = new core.HoloCompositionParser().parse(texts.manifest);
  const policyResult = new core.HoloScriptPlusParser().parse(texts.policy);
  const seedResult = new core.HoloScriptCodeParser().parse(texts.seed);
  assert(
    sourceResult.success,
    `MV-S3 .holo parse failed: ${canonicalJson(sourceResult.errors ?? [])}`
  );
  assert(
    manifestResult.success,
    `MV-S3 manifest .holo parse failed: ${canonicalJson(manifestResult.errors ?? [])}`
  );
  assert(
    policyResult.success,
    `MV-S3 .hsplus parse failed: ${canonicalJson(policyResult.errors ?? [])}`
  );
  assert(
    seedResult.success,
    `MV-S3 .hs parse failed: ${canonicalJson(seedResult.errors ?? [])}`
  );

  const sourceAst = sourceResult.ast;
  const manifestAst = manifestResult.ast;
  const policyComposition = policyResult.ast.children.find(
    (node) => node.type === 'composition'
  );
  assert(policyComposition, 'MV-S3 policy composition unavailable');
  const policyConfig = policyComposition.children.find((node) => node.type === 'config');
  const policyState = policyComposition.children.find((node) => node.type === 'state');
  const fixedStep = templateByName(policyComposition, 'FixedStepExecutionContract');
  const runtimeBinding = templateByName(policyComposition, 'HoloScriptRuntimeBinding');
  const replayGate = templateByName(policyComposition, 'ReplayAcceptanceGate');
  const gpuWitness = templateByName(policyComposition, 'GpuWitnessContract');
  const laneFirewall = templateByName(policyComposition, 'NoCausalMergeGate');
  const formatRoles = templateByName(policyComposition, 'FormatRoleContract');
  for (const [name, node] of Object.entries({
    policyConfig,
    policyState,
    fixedStep,
    runtimeBinding,
    replayGate,
    gpuWitness,
    laneFirewall,
    formatRoles,
  })) {
    assert(node, `MV-S3 policy is missing ${name}`);
  }

  const seedNodes = seedResult.ast;
  const manifestNode = seedByType(seedNodes, 'model_village_live_physics_seed_manifest');
  const fluidSeedNode = seedByType(seedNodes, 'fluid_particle_lattice_seed');
  const fluidBoundaryNode = seedByType(seedNodes, 'fluid_boundary_fixture');
  const seedGateNode = seedByType(seedNodes, 'model_village_live_physics_seed_gate');
  const rigidNodes = seedNodes.filter((node) => node.properties?.type === 'rigid_body_fixture');
  assert(manifestNode && fluidSeedNode && fluidBoundaryNode && seedGateNode, 'MV-S3 seed is incomplete');
  assert(rigidNodes.length === 2, 'MV-S3 rigid seed count drifted');

  const fluidObject = sourceAst.objects.find((object) => object.name === 'CisternSPH');
  const clothObject = sourceAst.objects.find((object) => object.name === 'CommonsClothCanopy');
  const labelsObject = sourceAst.objects.find(
    (object) => object.name === 'VisiblePhysicsLaneLabels'
  );
  const presentationBoundaryObject = sourceAst.objects.find(
    (object) => object.name === 'SimulationPresentationBoundary'
  );
  const noCausalMergeObject = sourceAst.objects.find(
    (object) => object.name === 'NoCausalMergeBoundary'
  );
  const claimBoundaryObject = sourceAst.objects.find((object) => object.name === 'ClaimBoundary');
  const weatherBlock = sourceAst.domainBlocks.find((block) => block.domain === 'weather');
  const rainBlock = sourceAst.domainBlocks.find(
    (block) => block.domain === 'vfx' && block.name === 'StormglassRainField'
  );
  assert(fluidObject && clothObject && weatherBlock && rainBlock, 'MV-S3 world is incomplete');
  const fluidTraits = traitsByName(fluidObject, 'fluid_simulation');
  const clothTraits = traitsByName(clothObject, 'advanced_cloth');
  assert(fluidTraits.length === 1, 'Cistern must have one fluid_simulation trait');
  assert(clothTraits.length === 1, 'Canopy must have one advanced_cloth trait');

  const seed = {
    manifest: manifestNode.properties,
    fluidSeed: fluidSeedNode.properties,
    fluidBoundary: {
      ...fluidBoundaryNode.properties,
      position: fluidBoundaryNode.position,
    },
    rigidBodies: rigidNodes.map((node) => ({
      ...node.properties,
      position: node.position,
    })),
    gate: seedGateNode.properties,
    deterministicSeed: manifestNode.properties.deterministicSeed,
  };
  const source = {
    metadata: sourceAst.metadata,
    environment: sourceAst.environment,
    state: objectProperties(sourceAst.state),
    weather: weatherBlock.properties,
    rain: rainBlock.properties,
    fluidTrait: fluidTraits[0].config,
    clothTrait: clothTraits[0].config,
    labels: objectProperties(labelsObject),
    presentationBoundary: objectProperties(presentationBoundaryObject),
    noCausalMerge: objectProperties(noCausalMergeObject),
    claimBoundary: objectProperties(claimBoundaryObject),
  };
  const manifestBoundaryObject = manifestAst.objects.find(
    (object) => object.name === 'EvidenceBoundary'
  );
  assert(manifestBoundaryObject, 'MV-S3 evidence manifest is missing EvidenceBoundary');
  const manifest = {
    metadata: manifestAst.metadata,
    state: objectProperties(manifestAst.state),
    boundary: objectProperties(manifestBoundaryObject),
  };
  const policy = {
    config: policyConfig.properties,
    state: policyState.properties,
    fixedStep: fixedStep.properties,
    runtimeBinding: runtimeBinding.properties,
    replayGate: replayGate.properties,
    gpuWitness: gpuWitness.properties,
    laneFirewall: laneFirewall.properties,
    formatRoles: formatRoles.properties,
  };
  const sourceHashes = Object.fromEntries(
    Object.entries(texts).map(([key, text]) => [key, sha256(Buffer.from(text, 'utf8'))])
  );
  const toolchainHashes = Object.fromEntries(
    Object.entries(paths)
      .filter(([key]) => !['source', 'manifest', 'policy', 'seed', 'three'].includes(key))
      .map(([key, filePath]) => [key, sha256(fs.readFileSync(filePath))])
  );

  validateLivePhysicsContracts({ source, manifest, policy, seed, sourceHashes });
  return {
    texts,
    paths,
    sourceAst,
    manifestAst,
    policyComposition,
    seedNodes,
    source,
    manifest,
    policy,
    seed,
    sourceHashes,
    toolchainHashes,
    toolchain: { core, traits, runtime, three },
  };
}

export function validateLivePhysicsContracts({ source, manifest, policy, seed, sourceHashes }) {
  assert(
    source.metadata.schema === 'hololand.model-village.live-weather-fluid-physics.v1',
    'MV-S3 source schema drifted'
  );
  assert(source.metadata.milestone === 'MV-S3', 'MV-S3 milestone drifted');
  assert(
    source.metadata.manifestSource === LIVE_PHYSICS_MANIFEST_REL,
    'MV-S3 world no longer points to its manifest'
  );
  assert(source.metadata.sourceSovereign === true, 'MV-S3 source lost sovereignty');
  assert(source.weather.deterministic_seed === 641031, 'Weather seed drifted');
  assert(source.weather.drives.includes('CisternSPH'), 'Weather no longer drives the fluid');
  assert(
    source.weather.drives.includes('CommonsClothCanopy'),
    'Weather no longer drives the cloth'
  );
  assert(source.rain.presentation_particle_count === 320, 'Rain field count drifted');
  assert(source.fluidTrait.solverType === 'sph', 'Fluid solver is no longer SPH');
  assert(source.fluidTrait.timeStep === 1 / 120, 'Fluid fixed step drifted');
  assert(source.clothTrait.width * source.clothTrait.height === 140, 'Cloth grid drifted');
  assert(source.clothTrait.enableTearing === false, 'Bounded cloth unexpectedly enables tearing');
  assert(
    source.labels.visibleInWitness === true && source.labels.colorAloneRequired === false,
    'Visible lane label accessibility drifted'
  );
  assert(source.presentationBoundary.gpuComputeSolverUsed === false, 'GPU solver overclaim');
  assert(
    source.noCausalMerge.livePhysicsMayCreateVillageReceipts === false
      && source.noCausalMerge.livePhysicsMayMutateCanonicalWorld === false
      && source.noCausalMerge.sharedClaimRootAllowed === false,
    'Live-physics lane firewall drifted'
  );
  assert(
    source.claimBoundary.notProved.includes('gpu_fluid_solver')
      && source.claimBoundary.notProved.includes('fluid_structure_interaction')
      && source.claimBoundary.notProved.includes('cross_hardware_determinism'),
    'MV-S3 claim boundary lost required exclusions'
  );

  assert(policy.config.nativeHsplusActionExecutionClaimed === false, 'Native action overclaim');
  assert(policy.fixedStep.timestepNumerator / policy.fixedStep.timestepDenominator === 1 / 120);
  assert(policy.fixedStep.steps === 360 && policy.fixedStep.runs === 3, 'Replay shape drifted');
  assert(policy.fixedStep.wallClockInSimulationInput === false, 'Wall clock entered simulation');
  assert(
    canonicalJson(policy.fixedStep.domainOrder)
      === canonicalJson(['fluid_sph', 'cloth_pbd', 'rigid_collision']),
    'Physics domain order drifted'
  );
  assert(
    policy.runtimeBinding.fluidHandler === 'fluidSimulationHandler'
      && policy.runtimeBinding.clothHandler === 'advancedClothHandler'
      && policy.runtimeBinding.rigidWorld === 'PhysicsWorld',
    'HoloScript runtime binding drifted'
  );
  assert(
    policy.runtimeBinding.directPrivateSolverReimplementationAllowed === false,
    'Private solver reimplementation became allowed'
  );
  assert(policy.gpuWitness.gpuSolverClaimed === false, 'GPU witness claims a solver');
  assert(policy.gpuWitness.webglFallbackAllowed === false, 'WebGL fallback became allowed');
  assert(policy.laneFirewall.mutationDeltaRequired === 0, 'Village mutation delta drifted');
  assert(
    policy.formatRoles.holoParser === 'HoloCompositionParser'
      && policy.formatRoles.hsplusParser === 'HoloScriptPlusParser'
      && policy.formatRoles.hsParser === 'HoloScriptCodeParser'
      && policy.formatRoles.interchangeableFormatsClaimed === false,
    'Three-format parser contract drifted'
  );

  assert(seed.deterministicSeed === 641031, 'Seed manifest drifted');
  assert(seed.fluidSeed.particleCount === 96, 'Fluid particle seed count drifted');
  assert(seed.fluidBoundary.boundaryType === 'box', 'Fluid boundary drifted');
  assert(seed.fluidBoundary.boxSize.length === 3, 'Fluid box size is unavailable');
  assert(seed.rigidBodies.length === 2, 'Rigid body seed count drifted');
  assert(seed.gate.expectedFluidParticleCount === 96, 'Fluid acceptance count drifted');
  assert(seed.gate.expectedClothParticleCount === 140, 'Cloth acceptance count drifted');
  assert(seed.gate.crossLaneInputsAllowed === false, 'Cross-lane input became allowed');
  assert(
    policy.fixedStep.deterministicSeed === seed.deterministicSeed
      && source.weather.deterministic_seed === seed.deterministicSeed,
    'Weather, policy, and seed no longer agree'
  );
  assert(
    manifest.metadata.schema
      === 'hololand.model-village.live-weather-fluid-physics-manifest.v1',
    'MV-S3 evidence manifest schema drifted'
  );
  assert(
    manifest.metadata.source === LIVE_PHYSICS_MANIFEST_REL
      && manifest.metadata.worldSource === LIVE_PHYSICS_SOURCE_REL
      && manifest.metadata.policySource === LIVE_PHYSICS_POLICY_REL
      && manifest.metadata.seedSource === LIVE_PHYSICS_SEED_REL,
    'MV-S3 evidence manifest paths drifted'
  );
  assert(
    manifest.metadata.worldSourceSha256 === sourceHashes.source
      && manifest.metadata.policySourceSha256 === sourceHashes.policy
      && manifest.metadata.seedSourceSha256 === sourceHashes.seed,
    'MV-S3 evidence manifest source hash drifted'
  );
  assert(
    manifest.state.replayRuns === policy.fixedStep.runs
      && manifest.state.replaySteps === policy.fixedStep.steps
      && manifest.state.fixedStepHz === policy.fixedStep.timestepDenominator
      && manifest.state.deterministicSeed === seed.deterministicSeed,
    'MV-S3 evidence manifest replay shape drifted'
  );
  assert(
    manifest.state.fluidParticleCount === seed.gate.expectedFluidParticleCount
      && manifest.state.clothParticleCount === seed.gate.expectedClothParticleCount
      && manifest.state.rigidBodyCount === seed.gate.expectedRigidBodyCount
      && manifest.state.rainInstanceCount === source.rain.presentation_particle_count,
    'MV-S3 evidence manifest object counts drifted'
  );
  assert(
    manifest.state.gpuPhysicsSolverClaimed === false
      && manifest.state.sealedFixtureUsedAsPhysicsInput === false
      && manifest.state.villageReceiptUsedAsPhysicsInput === false
      && manifest.state.sharedCausalRootClaimed === false,
    'MV-S3 evidence manifest claim boundary drifted'
  );
  return true;
}

function normalizeFluid(system) {
  return system.getParticles().map((particle) => ({
    id: particle.id,
    position: normalizeVector(particle.position),
    velocity: normalizeVector(particle.velocity),
    force: normalizeVector(particle.force),
    density: normalizeNumber(particle.density),
    pressure: normalizeNumber(particle.pressure),
  }));
}

function normalizeCloth(system) {
  return system.getAllParticles().map((particle) => ({
    id: particle.id,
    position: normalizeVector(particle.position),
    previousPosition: normalizeVector(particle.prevPosition),
    velocity: normalizeVector(particle.velocity),
    inverseMass: normalizeNumber(particle.inverseMass),
    pinned: particle.inverseMass === 0,
  }));
}

function normalizeRigidState(state) {
  return {
    bodyId: state.id,
    position: normalizeVector(state.position),
    rotation: normalizeVector(state.rotation),
    linearVelocity: normalizeVector(state.linearVelocity),
    angularVelocity: normalizeVector(state.angularVelocity),
    sleeping: state.isSleeping,
    active: state.isActive,
  };
}

function registerRigidBodies({ PhysicsWorld, Object3D }, definitions, execution) {
  const world = new PhysicsWorld({
    gravity: [0, -9.81, 0],
    iterations: 10,
    stepSize: execution.timestepNumerator / execution.timestepDenominator,
  });
  const registeredIds = new Set();
  for (const body of definitions) {
    assert(!registeredIds.has(body.bodyId), `Duplicate rigid body: ${body.bodyId}`);
    registeredIds.add(body.bodyId);
    const object = new Object3D();
    object.position.set(...body.position);
    object.scale.set(...body.scale);
    world.addBodyWithConfig(body.bodyId, object, {
      type: body.bodyType,
      shape: body.colliderShape,
      mass: body.mass,
      restitution: body.restitution,
      linearDamping: body.linearDamping,
      angularDamping: body.angularDamping,
    });
  }
  return world;
}

export function runOneLivePhysicsReplay(contracts) {
  const {
    source,
    policy,
    seed,
    toolchain: { traits, runtime, three },
  } = contracts;
  const events = [];
  const ctx = {
    emit(type, payload) {
      events.push({ type, nodeId: payload?.node?.id ?? null });
    },
  };
  const fluidNode = { id: 'CisternSPH' };
  const clothNode = { id: 'CommonsClothCanopy' };
  traits.fluidSimulationHandler.onAttach(fluidNode, source.fluidTrait, ctx);
  traits.advancedClothHandler.onAttach(clothNode, source.clothTrait, ctx);
  const fluid = fluidNode.__fluid_simulation_instance;
  const cloth = clothNode.__advanced_cloth_instance;
  assert(fluid && cloth, 'HoloScript trait handler did not attach a solver');

  fluid.addBoundary({
    type: seed.fluidBoundary.boundaryType,
    position: [...seed.fluidBoundary.position],
    size: [...seed.fluidBoundary.boxSize],
    restitution: seed.fluidBoundary.restitution,
  });
  for (const particle of materializeFluidParticles(seed)) {
    fluid.addParticle(particle.position, particle.velocity);
  }
  const rigid = registerRigidBodies(
    { PhysicsWorld: runtime.PhysicsWorld, Object3D: three.Object3D },
    seed.rigidBodies,
    policy.fixedStep
  );
  const rigidEvents = [];
  let currentStep = -1;
  const unsubscribe = rigid.onAnyCollision((event) => {
    rigidEvents.push({
      step: currentStep,
      type: event.type,
      pair: [event.bodyA, event.bodyB].sort(),
      point: normalizeVector(event.contactPoint),
      normal: normalizeVector(event.contactNormal),
    });
  });

  const dt = policy.fixedStep.timestepNumerator / policy.fixedStep.timestepDenominator;
  const timings = { fluid: [], cloth: [], rigid: [], total: [] };
  const sampledFrames = [];
  const sampleSteps = new Set([0, 59, 119, 239, policy.fixedStep.steps - 1]);
  for (let step = 0; step < policy.fixedStep.steps; step += 1) {
    currentStep = step;
    const totalStart = performance.now();
    let started = performance.now();
    traits.fluidSimulationHandler.onUpdate(fluidNode, {}, ctx, dt);
    timings.fluid.push(performance.now() - started);
    started = performance.now();
    traits.advancedClothHandler.onUpdate(clothNode, {}, ctx, dt);
    timings.cloth.push(performance.now() - started);
    started = performance.now();
    rigid.step(dt);
    timings.rigid.push(performance.now() - started);
    timings.total.push(performance.now() - totalStart);
    if (sampleSteps.has(step)) {
      sampledFrames.push({
        step,
        fluid: normalizeFluid(fluid).map(({ id, position }) => ({ id, position })),
        cloth: normalizeCloth(cloth).map(({ id, position, pinned }) => ({
          id,
          position,
          pinned,
        })),
        rigid: rigid.getAllBodyStates().map(normalizeRigidState),
      });
    }
  }
  unsubscribe();

  const fluidState = normalizeFluid(fluid);
  const clothState = normalizeCloth(cloth);
  const rigidState = rigid.getAllBodyStates().map(normalizeRigidState);
  const stateDigests = {
    fluid: digest(fluidState),
    cloth: digest(clothState),
    rigid: digest(rigidState),
    events: digest({ trait: events, rigid: rigidEvents }),
  };
  stateDigests.combined = digest(stateDigests);
  const counts = {
    fluidParticles: fluidState.length,
    clothParticles: clothState.length,
    rigidBodies: rigidState.length,
    rigidContacts: rigidEvents.length,
  };
  const metrics = {
    fluidAverageDensity: normalizeNumber(fluid.getAverageDensity()),
    fluidKineticEnergy: normalizeNumber(fluid.getKineticEnergy()),
    clothConstraintCount: cloth.getConstraints().length,
    clothTearCount: cloth.getTearHistory().length,
    dynamicRigidBodySleeping: rigidState
      .filter((body) => body.bodyId === 'mv-s3-collision-orb')
      .every((body) => body.sleeping),
  };
  assert(finiteDeep({ fluidState, clothState, rigidState, metrics }), 'Simulation produced NaN');
  assert(counts.fluidParticles === seed.gate.expectedFluidParticleCount, 'Fluid count drifted');
  assert(counts.clothParticles === seed.gate.expectedClothParticleCount, 'Cloth count drifted');
  assert(counts.rigidBodies === seed.gate.expectedRigidBodyCount, 'Rigid count drifted');
  assert(counts.rigidContacts >= 1, 'Rigid collision was not observed');
  assert(metrics.clothTearCount === 0, 'Bounded canopy tore unexpectedly');

  traits.fluidSimulationHandler.onDetach(fluidNode, {}, ctx);
  traits.advancedClothHandler.onDetach(clothNode, {}, ctx);
  return {
    stateDigests,
    counts,
    metrics,
    events: { trait: events, rigid: rigidEvents },
    finalState: { fluid: fluidState, cloth: clothState, rigid: rigidState },
    sampledFrames,
    timings: Object.fromEntries(
      Object.entries(timings).map(([domain, values]) => [domain, timingSummary(values)])
    ),
  };
}

export function runDeterministicLivePhysicsReplays(contracts) {
  const runs = [];
  for (let index = 0; index < contracts.policy.fixedStep.runs; index += 1) {
    runs.push(runOneLivePhysicsReplay(contracts));
  }
  const fields = ['fluid', 'cloth', 'rigid', 'events', 'combined'];
  const digestAgreement = Object.fromEntries(
    fields.map((field) => [
      field,
      new Set(runs.map((run) => run.stateDigests[field])).size === 1,
    ])
  );
  const accepted = Object.values(digestAgreement).every(Boolean)
    && runs.length === contracts.policy.replayGate.expectedRuns;
  assert(accepted, `Deterministic replay mismatch: ${canonicalJson(digestAgreement)}`);
  assert(
    runs[0].stateDigests.combined === contracts.manifest.state.replayCombinedSha256,
    'Deterministic replay root no longer matches the immutable manifest'
  );
  return {
    accepted,
    runCount: runs.length,
    digestAgreement,
    stateDigests: runs.map((run) => run.stateDigests),
    firstRun: runs[0],
    timingRuns: runs.map((run) => run.timings),
  };
}
