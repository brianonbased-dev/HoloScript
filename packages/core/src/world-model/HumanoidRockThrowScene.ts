/**
 * Deterministic humanoid rock-throw replay fixture.
 *
 * This is still renderer-free, but it is specific to the format-stress flagship:
 * it emits replayable semantic events for reach/grab/release/arc/impact so the
 * gauntlet can distinguish world-model evidence from kinematic still generation.
 */

import {
  asCaelReceiptHash,
  asSceneHash,
  asTrajectoryId,
  type ActionStep,
  type AdversarialTrajectory,
  type ObservationStep,
  type SceneHash,
  type SimulationContractReference,
} from './AdversarialTrajectory';
import { hashDeterministicSceneValue, type Vec3 } from './DeterministicFailureScene';
import { scoreTrajectory, type SoftAnchor } from './PredicateScorer';

export interface HumanoidRockThrowObject {
  readonly id: string;
  readonly kind: 'avatar' | 'hand' | 'rock' | 'target' | 'stage';
  readonly center: Vec3;
  readonly radiusM?: number;
  readonly massKg?: number;
}

export interface HumanoidRockThrowSceneState {
  readonly sceneId: 'humanoid-rock-throw-v1';
  readonly seed: number;
  readonly objects: readonly HumanoidRockThrowObject[];
  readonly sceneHash: SceneHash;
}

export type HumanoidRockThrowEventType =
  | 'scene_loaded'
  | 'avatar_approached'
  | 'hand_reached'
  | 'grab_constraint_attached'
  | 'lift_pose'
  | 'windup_pose'
  | 'release'
  | 'ballistic_sample'
  | 'target_contact'
  | 'aftermath';

export interface HumanoidRockThrowEvent {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: HumanoidRockThrowEventType;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface HumanoidRockThrowReplayResult {
  readonly sceneId: 'humanoid-rock-throw-v1';
  readonly seed: number;
  readonly sceneHash: SceneHash;
  readonly objects: readonly HumanoidRockThrowObject[];
  readonly events: readonly HumanoidRockThrowEvent[];
  readonly actionTrace: readonly ActionStep[];
  readonly observationTrace: readonly ObservationStep[];
  readonly contactCount: number;
  readonly predicateViolationCount: number;
  readonly invalidActionCount: number;
  readonly eventLogHash: string;
}

export interface HumanoidRockThrowTrajectoryBuild {
  readonly result: HumanoidRockThrowReplayResult;
  readonly trajectory: AdversarialTrajectory;
}

export interface HumanoidRockThrowSceneOptions {
  readonly seed?: number;
  readonly discoveredAtMs?: number;
}

export const HUMANOID_ROCK_THROW_SCENE_ID = 'humanoid-rock-throw-v1';

const DEFAULT_SEED = 4_242;
const DEFAULT_DISCOVERED_AT_MS = 1_700_000_000_000;
const STEP_MS = 100;
const GRAVITY = -9.81;
const RELEASE_VELOCITY: Vec3 = { x: 5.2, y: 3.4, z: 0 };
const RELEASE_POSITION: Vec3 = { x: -0.95, y: 1.62, z: 0.02 };

export const HUMANOID_ROCK_THROW_CONTRACT: SimulationContractReference = {
  contractId: 'world-model-humanoid-rock-throw-v1',
  hashMode: 'fnv1a',
  adapterFingerprint: 'core-world-model-humanoid-rock-throw-v1',
  replayDigestMode: 'strict-same-adapter',
  fieldQuantization: [
    { fieldPattern: 'rock.position', quantum: 1e-6, units: 'm' },
    { fieldPattern: 'hand.position', quantum: 1e-6, units: 'm' },
    { fieldPattern: 'release.velocity', quantum: 1e-6, units: 'm/s' },
  ],
};

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec3(v: Vec3, scale: number): Vec3 {
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
}

function rockPositionAt(timeSeconds: number): Vec3 {
  return addVec3(addVec3(RELEASE_POSITION, scaleVec3(RELEASE_VELOCITY, timeSeconds)), {
    x: 0,
    y: 0.5 * GRAVITY * timeSeconds * timeSeconds,
    z: 0,
  });
}

function sceneHashFor(seed: number, objects: readonly HumanoidRockThrowObject[]): SceneHash {
  return asSceneHash(
    hashDeterministicSceneValue({ sceneId: HUMANOID_ROCK_THROW_SCENE_ID, seed, objects })
  );
}

export function createHumanoidRockThrowScene(seed = DEFAULT_SEED): HumanoidRockThrowSceneState {
  const objects: readonly HumanoidRockThrowObject[] = [
    { id: 'avatar', kind: 'avatar', center: { x: -3, y: 1.25, z: 0 } },
    { id: 'right-hand', kind: 'hand', center: { x: -2.72, y: 1.22, z: 0.16 } },
    { id: 'rock', kind: 'rock', center: { x: -2.35, y: 0.22, z: 0.12 }, radiusM: 0.13, massKg: 1.8 },
    { id: 'target', kind: 'target', center: { x: 2.55, y: 0.85, z: 0 }, radiusM: 0.42, massKg: 20 },
    { id: 'stage', kind: 'stage', center: { x: 0, y: 0, z: 0 } },
  ];
  return {
    sceneId: HUMANOID_ROCK_THROW_SCENE_ID,
    seed,
    objects,
    sceneHash: sceneHashFor(seed, objects),
  };
}

function makeAction(
  stepIndex: number,
  timestampMs: number,
  type: string,
  payload: Readonly<Record<string, unknown>>
): ActionStep {
  return { stepIndex, timestampMs, type, payload };
}

function makeObservation(
  stepIndex: number,
  timestampMs: number,
  event: HumanoidRockThrowEvent
): ObservationStep {
  return {
    stepIndex,
    timestampMs,
    type: 'humanoid-rock-throw-event',
    payload: {
      eventType: event.type,
      payload: event.payload,
    },
  };
}

export function runHumanoidRockThrowReplay(
  options: HumanoidRockThrowSceneOptions = {}
): HumanoidRockThrowReplayResult {
  const scene = createHumanoidRockThrowScene(options.seed ?? DEFAULT_SEED);
  const events: HumanoidRockThrowEvent[] = [];
  const actionTrace: ActionStep[] = [];
  const observationTrace: ObservationStep[] = [];

  const emit = (type: HumanoidRockThrowEventType, payload: Readonly<Record<string, unknown>>) => {
    const stepIndex = events.length;
    const timestampMs = stepIndex * STEP_MS;
    const event: HumanoidRockThrowEvent = { stepIndex, timestampMs, type, payload };
    events.push(event);
    actionTrace.push(makeAction(stepIndex, timestampMs, type, payload));
    observationTrace.push(makeObservation(stepIndex, timestampMs, event));
  };

  emit('scene_loaded', {
    avatarId: 'avatar',
    rockId: 'rock',
    targetId: 'target',
  });
  emit('avatar_approached', {
    avatarId: 'avatar',
    from: { x: -3, y: 1.25, z: 0 },
    to: { x: -2.35, y: 1.25, z: 0 },
  });
  emit('hand_reached', {
    handId: 'right-hand',
    rockId: 'rock',
    handPosition: { x: -2.35, y: 0.9, z: 0.12 },
    clearanceM: 0.03,
  });
  emit('grab_constraint_attached', {
    handId: 'right-hand',
    rockId: 'rock',
    constraint: 'hand-rock-fixed',
  });
  emit('lift_pose', {
    rockId: 'rock',
    rockPosition: { x: -2.15, y: 1.2, z: 0.12 },
  });
  emit('windup_pose', {
    avatarId: 'avatar',
    rockId: 'rock',
    shoulderYawDeg: -38,
    rockPosition: { x: -1.45, y: 1.55, z: 0.08 },
  });
  emit('release', {
    rockId: 'rock',
    releasePosition: RELEASE_POSITION,
    releaseVelocity: RELEASE_VELOCITY,
  });

  for (const t of [0.18, 0.36, 0.54]) {
    emit('ballistic_sample', {
      rockId: 'rock',
      timeSeconds: t,
      rockPosition: rockPositionAt(t),
      gravity: GRAVITY,
    });
  }

  emit('target_contact', {
    rockId: 'rock',
    targetId: 'target',
    rockPosition: { x: 2.55, y: 0.85, z: 0 },
    impulseNs: 8.6,
  });
  emit('aftermath', {
    targetId: 'target',
    observedImpact: true,
    provenancePanel: true,
  });

  const eventLogHash = hashDeterministicSceneValue({
    sceneHash: scene.sceneHash,
    seed: scene.seed,
    actionTrace,
    observationTrace,
    events,
  });

  return {
    sceneId: scene.sceneId,
    seed: scene.seed,
    sceneHash: scene.sceneHash,
    objects: scene.objects,
    events,
    actionTrace,
    observationTrace,
    contactCount: 1,
    predicateViolationCount: 0,
    invalidActionCount: 0,
    eventLogHash,
  };
}

export function buildHumanoidRockThrowTrajectory(
  options: HumanoidRockThrowSceneOptions = {}
): HumanoidRockThrowTrajectoryBuild {
  const result = runHumanoidRockThrowReplay(options);
  const id = asTrajectoryId(
    hashDeterministicSceneValue({
      sceneHash: result.sceneHash,
      seed: result.seed,
      actionTrace: result.actionTrace,
    })
  );
  const replayCommand =
    `holoscript world-model replay --scene ${HUMANOID_ROCK_THROW_SCENE_ID}` +
    ` --trajectory ${id} --seed ${result.seed}`;

  const baseline: AdversarialTrajectory = {
    id,
    sceneHash: result.sceneHash,
    seed: result.seed,
    trustTier: 'replayable',
    caelReceiptHash: asCaelReceiptHash(result.eventLogHash),
    simulationContract: HUMANOID_ROCK_THROW_CONTRACT,
    actionTrace: result.actionTrace,
    observationTrace: result.observationTrace,
    predicateScore: {
      violation: 0,
      novelty: 0,
      learnability: 0,
      regression: 0,
      invalidity: 0,
    },
    priority: { priority: 0, tieBreaker: 0, rationale: 'unscored' },
    replayHandle: {
      trajectoryId: id,
      sceneHash: result.sceneHash,
      simulationContractId: HUMANOID_ROCK_THROW_CONTRACT.contractId,
      seed: result.seed,
      replayCommand,
    },
    status: 'open',
    discoveredAtMs: options.discoveredAtMs ?? DEFAULT_DISCOVERED_AT_MS,
    lastReplayedAtMs: null,
  };

  const impactAnchor: SoftAnchor = {
    id: 'target-impact',
    description: 'rock reaches target contact in deterministic replay',
    evaluate: () => (result.events.some((event) => event.type === 'target_contact') ? 0 : 1),
  };
  const score = scoreTrajectory({
    trajectory: baseline,
    hardAnchors: [
      {
        id: 'valid-replay',
        description: 'humanoid rock throw replay has no invalid actions',
        evaluate: () => result.invalidActionCount === 0,
      },
    ],
    softAnchors: [impactAnchor],
    historyActionTypes: new Set<string>(),
    learnabilityEstimate: 0.7,
  });

  return {
    result,
    trajectory: {
      ...baseline,
      predicateScore: score.predicateScore,
      priority: score.priority,
      status: result.predicateViolationCount > 0 ? 'unresolved' : 'open',
    },
  };
}
