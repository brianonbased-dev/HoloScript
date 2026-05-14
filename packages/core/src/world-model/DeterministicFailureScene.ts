/**
 * Deterministic failure-discovery scene for the world-model curriculum.
 *
 * This is intentionally renderer-free: it gives later tasks a stable scene
 * substrate with object placement, contact/collision events, camera motion,
 * and adversarial-trajectory receipts without requiring HoloLand runtime
 * bootstrapping.
 *
 * @module @holoscript/core/world-model
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
import { scoreTrajectory, type SoftAnchor } from './PredicateScorer';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type DeterministicSceneObjectKind = 'block' | 'obstacle' | 'target';

export interface DeterministicSceneObject {
  readonly id: string;
  readonly kind: DeterministicSceneObjectKind;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
  readonly movable: boolean;
}

export interface DeterministicSceneCamera {
  readonly position: Vec3;
  readonly lookAt: Vec3;
}

export interface DeterministicFailureSceneState {
  readonly sceneId: string;
  readonly seed: number;
  readonly objects: readonly DeterministicSceneObject[];
  readonly camera: DeterministicSceneCamera;
  readonly sceneHash: SceneHash;
}

export type DeterministicSceneAction =
  | {
      readonly type: 'place-object';
      readonly object: DeterministicSceneObject;
    }
  | {
      readonly type: 'move-object';
      readonly objectId: string;
      readonly center: Vec3;
    }
  | {
      readonly type: 'move-camera';
      readonly position: Vec3;
      readonly lookAt: Vec3;
    }
  | {
      readonly type: 'wait';
      readonly durationMs: number;
    };

export type DeterministicSceneEventType =
  | 'object_placed'
  | 'object_moved'
  | 'camera_moved'
  | 'wait'
  | 'contact'
  | 'target_contact'
  | 'predicate_violation'
  | 'invalid_action';

export interface DeterministicSceneEvent {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: DeterministicSceneEventType;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface DeterministicFailureSceneResult {
  readonly sceneId: string;
  readonly seed: number;
  readonly sceneHash: SceneHash;
  readonly objects: readonly DeterministicSceneObject[];
  readonly camera: DeterministicSceneCamera;
  readonly events: readonly DeterministicSceneEvent[];
  readonly actionTrace: readonly ActionStep[];
  readonly observationTrace: readonly ObservationStep[];
  readonly contactCount: number;
  readonly predicateViolationCount: number;
  readonly invalidActionCount: number;
  readonly eventLogHash: string;
}

export interface DeterministicFailureTrajectoryBuild {
  readonly result: DeterministicFailureSceneResult;
  readonly trajectory: AdversarialTrajectory;
}

export interface DeterministicFailureSceneOptions {
  readonly seed?: number;
  readonly discoveredAtMs?: number;
}

const SCENE_ID = 'deterministic-contact-v1';
const DEFAULT_SEED = 1_337;
const DEFAULT_DISCOVERED_AT_MS = 1_700_000_000_000;
const STEP_MS = 100;

const CONTRACT: SimulationContractReference = {
  contractId: 'world-model-deterministic-contact-v1',
  hashMode: 'fnv1a',
  adapterFingerprint: 'core-world-model-deterministic-scene-v1',
  replayDigestMode: 'strict-same-adapter',
  fieldQuantization: [
    { fieldPattern: 'objects.*.center', quantum: 1e-6, units: 'm' },
    { fieldPattern: 'camera.position', quantum: 1e-6, units: 'm' },
    { fieldPattern: 'camera.lookAt', quantum: 1e-6, units: 'm' },
  ],
};

export const DEFAULT_DETERMINISTIC_FAILURE_ACTIONS: readonly DeterministicSceneAction[] = [
  {
    type: 'place-object',
    object: {
      id: 'probe-block',
      kind: 'block',
      center: { x: -0.6, y: 0.15, z: 0 },
      halfExtents: { x: 0.15, y: 0.15, z: 0.15 },
      movable: true,
    },
  },
  {
    type: 'move-camera',
    position: { x: 0, y: 1.25, z: 2.2 },
    lookAt: { x: 0, y: 0.2, z: 0 },
  },
  {
    type: 'move-object',
    objectId: 'probe-block',
    center: { x: 0, y: 0.15, z: 0 },
  },
  {
    type: 'move-object',
    objectId: 'probe-block',
    center: { x: 0.55, y: 0.15, z: 0 },
  },
];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`;
}

export function hashDeterministicSceneValue(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function cloneObject(o: DeterministicSceneObject): DeterministicSceneObject {
  return {
    id: o.id,
    kind: o.kind,
    center: cloneVec3(o.center),
    halfExtents: cloneVec3(o.halfExtents),
    movable: o.movable,
  };
}

function cloneCamera(camera: DeterministicSceneCamera): DeterministicSceneCamera {
  return {
    position: cloneVec3(camera.position),
    lookAt: cloneVec3(camera.lookAt),
  };
}

function sceneHashFor(seed: number, objects: readonly DeterministicSceneObject[]): SceneHash {
  return asSceneHash(hashDeterministicSceneValue({ sceneId: SCENE_ID, seed, objects }));
}

export function createDeterministicFailureDiscoveryScene(
  seed = DEFAULT_SEED
): DeterministicFailureSceneState {
  const objects: readonly DeterministicSceneObject[] = [
    {
      id: 'contact-pillar',
      kind: 'obstacle',
      center: { x: 0, y: 0.35, z: 0 },
      halfExtents: { x: 0.16, y: 0.35, z: 0.45 },
      movable: false,
    },
    {
      id: 'target-pad',
      kind: 'target',
      center: { x: 0.55, y: 0.05, z: 0 },
      halfExtents: { x: 0.32, y: 0.05, z: 0.32 },
      movable: false,
    },
  ];

  return {
    sceneId: SCENE_ID,
    seed,
    objects,
    camera: {
      position: { x: -0.25, y: 1.1, z: 2 },
      lookAt: { x: 0, y: 0.2, z: 0 },
    },
    sceneHash: sceneHashFor(seed, objects),
  };
}

function overlaps(a: DeterministicSceneObject, b: DeterministicSceneObject): boolean {
  return (
    Math.abs(a.center.x - b.center.x) <= a.halfExtents.x + b.halfExtents.x &&
    Math.abs(a.center.y - b.center.y) <= a.halfExtents.y + b.halfExtents.y &&
    Math.abs(a.center.z - b.center.z) <= a.halfExtents.z + b.halfExtents.z
  );
}

function actionPayload(action: DeterministicSceneAction): Readonly<Record<string, unknown>> {
  switch (action.type) {
    case 'place-object':
      return { object: action.object };
    case 'move-object':
      return { objectId: action.objectId, center: action.center };
    case 'move-camera':
      return { position: action.position, lookAt: action.lookAt };
    case 'wait':
      return { durationMs: action.durationMs };
  }
}

function snapshotObservationPayload(
  objects: readonly DeterministicSceneObject[],
  camera: DeterministicSceneCamera,
  events: readonly DeterministicSceneEvent[],
  contactCount: number,
  predicateViolationCount: number,
  invalidActionCount: number
): Readonly<Record<string, unknown>> {
  return {
    objects: objects.map((o) => ({
      id: o.id,
      kind: o.kind,
      center: o.center,
    })),
    camera,
    eventTypes: events.map((e) => e.type),
    contactCount,
    predicateViolationCount,
    invalidActionCount,
  };
}

export function runDeterministicFailureDiscoveryScene(
  actions: readonly DeterministicSceneAction[] = DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
  options: DeterministicFailureSceneOptions = {}
): DeterministicFailureSceneResult {
  const scene = createDeterministicFailureDiscoveryScene(options.seed ?? DEFAULT_SEED);
  let objects = scene.objects.map(cloneObject);
  let camera = cloneCamera(scene.camera);
  let timestampMs = 0;
  let contactCount = 0;
  let predicateViolationCount = 0;
  let invalidActionCount = 0;
  const events: DeterministicSceneEvent[] = [];
  const actionTrace: ActionStep[] = [];
  const observationTrace: ObservationStep[] = [];

  for (let stepIndex = 0; stepIndex < actions.length; stepIndex += 1) {
    const action = actions[stepIndex];
    const stepEvents: DeterministicSceneEvent[] = [];
    const emit = (
      type: DeterministicSceneEventType,
      payload: Readonly<Record<string, unknown>>
    ): void => {
      const event = { stepIndex, timestampMs, type, payload };
      stepEvents.push(event);
      events.push(event);
    };

    actionTrace.push({
      stepIndex,
      timestampMs,
      type: action.type,
      payload: actionPayload(action),
    });

    if (action.type === 'place-object') {
      if (objects.some((o) => o.id === action.object.id)) {
        invalidActionCount += 1;
        emit('invalid_action', {
          reason: 'duplicate-object-id',
          objectId: action.object.id,
        });
      } else {
        const placed = cloneObject(action.object);
        objects = [...objects, placed];
        emit('object_placed', { objectId: placed.id, center: placed.center });
      }
    } else if (action.type === 'move-camera') {
      camera = {
        position: cloneVec3(action.position),
        lookAt: cloneVec3(action.lookAt),
      };
      emit('camera_moved', { position: camera.position, lookAt: camera.lookAt });
    } else if (action.type === 'move-object') {
      const object = objects.find((o) => o.id === action.objectId);
      if (!object) {
        invalidActionCount += 1;
        emit('invalid_action', {
          reason: 'unknown-object',
          objectId: action.objectId,
        });
      } else if (!object.movable) {
        invalidActionCount += 1;
        emit('invalid_action', {
          reason: 'object-not-movable',
          objectId: action.objectId,
        });
      } else {
        const moved = { ...object, center: cloneVec3(action.center) };
        const obstacle = objects.find((o) => o.kind === 'obstacle' && overlaps(moved, o));
        if (obstacle) {
          contactCount += 1;
          predicateViolationCount += 1;
          emit('contact', {
            objectId: object.id,
            otherObjectId: obstacle.id,
            blocked: true,
          });
          emit('predicate_violation', {
            predicate: 'no-block-obstacle-overlap',
            objectId: object.id,
            otherObjectId: obstacle.id,
          });
        } else {
          objects = objects.map((o) => (o.id === object.id ? moved : o));
          emit('object_moved', { objectId: moved.id, center: moved.center });
          for (const target of objects.filter((o) => o.kind === 'target')) {
            if (overlaps(moved, target)) {
              contactCount += 1;
              emit('target_contact', {
                objectId: moved.id,
                targetId: target.id,
              });
            }
          }
        }
      }
    } else {
      emit('wait', { durationMs: action.durationMs });
    }

    observationTrace.push({
      stepIndex,
      timestampMs,
      type: 'deterministic-scene-snapshot',
      payload: snapshotObservationPayload(
        objects,
        camera,
        stepEvents,
        contactCount,
        predicateViolationCount,
        invalidActionCount
      ),
    });

    timestampMs += action.type === 'wait' ? action.durationMs : STEP_MS;
  }

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
    objects,
    camera,
    events,
    actionTrace,
    observationTrace,
    contactCount,
    predicateViolationCount,
    invalidActionCount,
    eventLogHash,
  };
}

export function buildDeterministicFailureTrajectory(
  actions: readonly DeterministicSceneAction[] = DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
  options: DeterministicFailureSceneOptions = {}
): DeterministicFailureTrajectoryBuild {
  const result = runDeterministicFailureDiscoveryScene(actions, options);
  const id = asTrajectoryId(
    hashDeterministicSceneValue({
      sceneHash: result.sceneHash,
      seed: result.seed,
      actionTrace: result.actionTrace,
    })
  );
  const replayCommand =
    `holoscript world-model replay --scene ${SCENE_ID}` +
    ` --trajectory ${id} --seed ${result.seed}`;

  const baseline: AdversarialTrajectory = {
    id,
    sceneHash: result.sceneHash,
    seed: result.seed,
    trustTier: 'replayable',
    caelReceiptHash: asCaelReceiptHash(result.eventLogHash),
    simulationContract: CONTRACT,
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
      simulationContractId: CONTRACT.contractId,
      seed: result.seed,
      replayCommand,
    },
    status: 'open',
    discoveredAtMs: options.discoveredAtMs ?? DEFAULT_DISCOVERED_AT_MS,
    lastReplayedAtMs: null,
  };

  const collisionAnchor: SoftAnchor = {
    id: 'blocked-contact',
    description: 'blocked obstacle contact in deterministic scene',
    evaluate: () => Math.min(1, result.predicateViolationCount),
  };
  const score = scoreTrajectory({
    trajectory: baseline,
    hardAnchors: [
      {
        id: 'valid-actions-only',
        description: 'all deterministic scene actions reference valid movable objects',
        evaluate: () => result.invalidActionCount === 0,
      },
    ],
    softAnchors: [collisionAnchor],
    historyActionTypes: new Set<string>(),
    learnabilityEstimate: 0.9,
  });

  const status =
    score.predicateScore.invalidity > 0
      ? 'invalid'
      : result.predicateViolationCount > 0
        ? 'unresolved'
        : 'open';

  return {
    result,
    trajectory: {
      ...baseline,
      predicateScore: score.predicateScore,
      priority: score.priority,
      status,
    },
  };
}
