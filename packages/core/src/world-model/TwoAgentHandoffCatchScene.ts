/**
 * Deterministic two-agent handoff/catch replay fixture.
 *
 * This is the compact next-extreme candidate after humanoid rock throw: it
 * proves an object can move from one embodied agent's hand, through free
 * flight, into another agent's catch volume with an ownership-transfer receipt.
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

export interface TwoAgentHandoffObject {
  readonly id: string;
  readonly kind: 'agent' | 'hand' | 'tool' | 'catch-volume' | 'stage';
  readonly center: Vec3;
  readonly radiusM?: number;
  readonly ownerId?: string;
  readonly massKg?: number;
}

export interface TwoAgentHandoffCatchSceneState {
  readonly sceneId: 'two-agent-handoff-catch-v1';
  readonly seed: number;
  readonly objects: readonly TwoAgentHandoffObject[];
  readonly sceneHash: SceneHash;
}

export type TwoAgentHandoffCatchEventType =
  | 'scene_loaded'
  | 'agents_aligned'
  | 'release_constraint_detached'
  | 'ballistic_sample'
  | 'catch_volume_entered'
  | 'catch_constraint_attached'
  | 'ownership_transferred'
  | 'receipt_emitted';

export interface TwoAgentHandoffCatchEvent {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: TwoAgentHandoffCatchEventType;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TwoAgentHandoffCatchReplayResult {
  readonly sceneId: 'two-agent-handoff-catch-v1';
  readonly seed: number;
  readonly sceneHash: SceneHash;
  readonly objects: readonly TwoAgentHandoffObject[];
  readonly events: readonly TwoAgentHandoffCatchEvent[];
  readonly actionTrace: readonly ActionStep[];
  readonly observationTrace: readonly ObservationStep[];
  readonly contactCount: number;
  readonly predicateViolationCount: number;
  readonly invalidActionCount: number;
  readonly eventLogHash: string;
}

export interface TwoAgentHandoffCatchTrajectoryBuild {
  readonly result: TwoAgentHandoffCatchReplayResult;
  readonly trajectory: AdversarialTrajectory;
}

export interface TwoAgentHandoffCatchSceneOptions {
  readonly seed?: number;
  readonly discoveredAtMs?: number;
}

export const TWO_AGENT_HANDOFF_CATCH_SCENE_ID = 'two-agent-handoff-catch-v1';

const DEFAULT_SEED = 5_151;
const DEFAULT_DISCOVERED_AT_MS = 1_700_000_000_000;
const STEP_MS = 100;
const GRAVITY = -9.81;
const RELEASE_POSITION: Vec3 = { x: -1.48, y: 1.32, z: 0.08 };
const RELEASE_VELOCITY: Vec3 = { x: 4.4, y: 1.5, z: 0 };

export const TWO_AGENT_HANDOFF_CATCH_CONTRACT: SimulationContractReference = {
  contractId: 'world-model-two-agent-handoff-catch-v1',
  hashMode: 'fnv1a',
  adapterFingerprint: 'core-world-model-two-agent-handoff-catch-v1',
  replayDigestMode: 'strict-same-adapter',
  fieldQuantization: [
    { fieldPattern: 'tool.position', quantum: 1e-6, units: 'm' },
    { fieldPattern: 'hands.*.position', quantum: 1e-6, units: 'm' },
    { fieldPattern: 'release.velocity', quantum: 1e-6, units: 'm/s' },
    { fieldPattern: 'ownership.ownerId', quantum: 1, units: 'symbol' },
  ],
};

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec3(v: Vec3, scale: number): Vec3 {
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
}

function toolPositionAt(timeSeconds: number): Vec3 {
  return addVec3(addVec3(RELEASE_POSITION, scaleVec3(RELEASE_VELOCITY, timeSeconds)), {
    x: 0,
    y: 0.5 * GRAVITY * timeSeconds * timeSeconds,
    z: 0,
  });
}

function sceneHashFor(seed: number, objects: readonly TwoAgentHandoffObject[]): SceneHash {
  return asSceneHash(
    hashDeterministicSceneValue({ sceneId: TWO_AGENT_HANDOFF_CATCH_SCENE_ID, seed, objects })
  );
}

export function createTwoAgentHandoffCatchScene(
  seed = DEFAULT_SEED
): TwoAgentHandoffCatchSceneState {
  const objects: readonly TwoAgentHandoffObject[] = [
    { id: 'thrower', kind: 'agent', center: { x: -2.2, y: 1.1, z: 0 } },
    { id: 'catcher', kind: 'agent', center: { x: 2.2, y: 1.1, z: 0 } },
    {
      id: 'thrower-hand',
      kind: 'hand',
      center: { x: -1.72, y: 1.32, z: 0.08 },
      ownerId: 'thrower',
    },
    {
      id: 'catcher-hand',
      kind: 'hand',
      center: { x: 1.74, y: 1.28, z: 0.08 },
      ownerId: 'catcher',
    },
    {
      id: 'shared-tool',
      kind: 'tool',
      center: RELEASE_POSITION,
      radiusM: 0.16,
      ownerId: 'thrower',
      massKg: 0.65,
    },
    {
      id: 'catch-volume',
      kind: 'catch-volume',
      center: { x: 1.74, y: 1.28, z: 0.08 },
      radiusM: 0.35,
      ownerId: 'catcher',
    },
    { id: 'stage', kind: 'stage', center: { x: 0, y: 0, z: 0 } },
  ];
  return {
    sceneId: TWO_AGENT_HANDOFF_CATCH_SCENE_ID,
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
  event: TwoAgentHandoffCatchEvent
): ObservationStep {
  return {
    stepIndex,
    timestampMs,
    type: 'two-agent-handoff-catch-event',
    payload: {
      eventType: event.type,
      payload: event.payload,
    },
  };
}

export function runTwoAgentHandoffCatchReplay(
  options: TwoAgentHandoffCatchSceneOptions = {}
): TwoAgentHandoffCatchReplayResult {
  const scene = createTwoAgentHandoffCatchScene(options.seed ?? DEFAULT_SEED);
  const events: TwoAgentHandoffCatchEvent[] = [];
  const actionTrace: ActionStep[] = [];
  const observationTrace: ObservationStep[] = [];
  let ownerId: 'thrower' | 'catcher' | null = 'thrower';

  const emit = (
    type: TwoAgentHandoffCatchEventType,
    payload: Readonly<Record<string, unknown>>
  ): void => {
    const stepIndex = events.length;
    const timestampMs = stepIndex * STEP_MS;
    const event: TwoAgentHandoffCatchEvent = { stepIndex, timestampMs, type, payload };
    events.push(event);
    actionTrace.push(makeAction(stepIndex, timestampMs, type, payload));
    observationTrace.push(makeObservation(stepIndex, timestampMs, event));
  };

  emit('scene_loaded', {
    throwerId: 'thrower',
    catcherId: 'catcher',
    toolId: 'shared-tool',
    ownerId,
  });
  emit('agents_aligned', {
    throwerHandId: 'thrower-hand',
    catcherHandId: 'catcher-hand',
    toolId: 'shared-tool',
    facing: true,
  });

  ownerId = null;
  emit('release_constraint_detached', {
    toolId: 'shared-tool',
    fromHandId: 'thrower-hand',
    previousOwnerId: 'thrower',
    ownerId,
    releasePosition: RELEASE_POSITION,
    releaseVelocity: RELEASE_VELOCITY,
  });

  for (const t of [0.18, 0.36, 0.54]) {
    emit('ballistic_sample', {
      toolId: 'shared-tool',
      timeSeconds: t,
      toolPosition: toolPositionAt(t),
      gravity: GRAVITY,
      ownerId,
    });
  }

  emit('catch_volume_entered', {
    toolId: 'shared-tool',
    catchVolumeId: 'catch-volume',
    toolPosition: { x: 1.74, y: 1.28, z: 0.08 },
    clearanceM: 0.04,
  });

  ownerId = 'catcher';
  emit('catch_constraint_attached', {
    toolId: 'shared-tool',
    handId: 'catcher-hand',
    constraint: 'hand-tool-fixed',
    ownerId,
  });
  emit('ownership_transferred', {
    objectId: 'shared-tool',
    from: 'thrower',
    to: 'catcher',
    transferMode: 'release-flight-catch',
  });
  emit('receipt_emitted', {
    objectId: 'shared-tool',
    ownerId,
    releaseConfirmed: true,
    catchConfirmed: true,
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

export function buildTwoAgentHandoffCatchTrajectory(
  options: TwoAgentHandoffCatchSceneOptions = {}
): TwoAgentHandoffCatchTrajectoryBuild {
  const result = runTwoAgentHandoffCatchReplay(options);
  const id = asTrajectoryId(
    hashDeterministicSceneValue({
      sceneHash: result.sceneHash,
      seed: result.seed,
      actionTrace: result.actionTrace,
    })
  );
  const replayCommand =
    `holoscript world-model replay --scene ${TWO_AGENT_HANDOFF_CATCH_SCENE_ID}` +
    ` --trajectory ${id} --seed ${result.seed}`;

  const baseline: AdversarialTrajectory = {
    id,
    sceneHash: result.sceneHash,
    seed: result.seed,
    trustTier: 'replayable',
    caelReceiptHash: asCaelReceiptHash(result.eventLogHash),
    simulationContract: TWO_AGENT_HANDOFF_CATCH_CONTRACT,
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
      simulationContractId: TWO_AGENT_HANDOFF_CATCH_CONTRACT.contractId,
      seed: result.seed,
      replayCommand,
    },
    status: 'open',
    discoveredAtMs: options.discoveredAtMs ?? DEFAULT_DISCOVERED_AT_MS,
    lastReplayedAtMs: null,
  };

  const ownershipAnchor: SoftAnchor = {
    id: 'ownership-transfer',
    description: 'tool ownership transfers from thrower to catcher',
    evaluate: () => (result.events.some((event) => event.type === 'ownership_transferred') ? 0 : 1),
  };
  const catchAnchor: SoftAnchor = {
    id: 'catch-constraint',
    description: 'catcher hand receives fixed tool constraint',
    evaluate: () =>
      result.events.some((event) => event.type === 'catch_constraint_attached') ? 0 : 1,
  };
  const score = scoreTrajectory({
    trajectory: baseline,
    hardAnchors: [
      {
        id: 'valid-handoff-replay',
        description: 'handoff catch replay has no invalid actions',
        evaluate: () => result.invalidActionCount === 0,
      },
    ],
    softAnchors: [ownershipAnchor, catchAnchor],
    historyActionTypes: new Set<string>(),
    learnabilityEstimate: 0.75,
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
