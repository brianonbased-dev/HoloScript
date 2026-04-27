/**
 * NeuralAnimationHandler — runtime/traits-side bridge for @neural_animation.
 *
 * Per /founder ruling 2026-04-26 (PLAN-4 in idea-run-3 memo): the motion-matching
 * engine is engine-agnostic and lives ONCE in @holoscript/core/src/traits/engines/.
 * Both the AST-side declarative trait (core/traits/NeuralAnimationTrait.ts) and
 * the runtime-side imperative handler (THIS file) share that engine via the
 * MotionMatchingEngine interface. No generic core/traits ↔ runtime/traits adapter
 * — per-trait wrapper as the pilot pattern (W.GOLD.001 — avoid premature
 * abstraction with one example; revisit when 2-3 traits demonstrate the shape).
 *
 * Lifecycle:
 *   onApply  → instantiate engine (default: SyntheticWalkCycleEngine), load it,
 *              cache joint→THREE.Bone lookup map from the THREE.Object3D's Skeleton
 *   onUpdate → infer pose, write joint quaternions back to bones in the THREE
 *              scene, accumulate phase + emit foot-contact events on transitions
 *   onRemove → dispose engine, clear bone map
 *
 * Config (passed via TraitContext.config — runtime side only):
 *   engine?:           MotionMatchingEngine  // optional override; default = SyntheticWalkCycleEngine
 *   modelId?:          string                // ignored if engine passed; else passed to default factory
 *   targetVelocity?:   {x,y,z}               // initial velocity; mutate via context.data.targetVelocity later
 *   energyEfficiency?: number                // forwarded to engine.infer()
 *
 * State (TraitContext.data):
 *   engine:            MotionMatchingEngine
 *   boneMap:           Map<jointName, THREE.Bone>
 *   currentPhase:      number
 *   targetVelocity:    {x,y,z}
 *   prevLeftContact:   boolean
 *   prevRightContact:  boolean
 *   lastResult:        MotionInferenceResult | null
 */

import * as THREE from 'three';
import {
  createSyntheticWalkCycleEngine,
  type MotionMatchingEngine,
  type MotionInferenceResult,
  type Vec3,
} from '@holoscript/core/traits/engines';
import type { TraitContext, TraitHandler } from './TraitSystem';

interface HandlerData {
  engine: MotionMatchingEngine;
  boneMap: Map<string, THREE.Bone>;
  currentPhase: number;
  targetVelocity: Vec3;
  prevLeftContact: boolean;
  prevRightContact: boolean;
  lastResult: MotionInferenceResult | null;
  /** Listeners that downstream traits (IK, agent perception) can subscribe to. */
  listeners: Map<string, Array<(payload: unknown) => void>>;
}

interface HandlerConfig {
  engine?: MotionMatchingEngine;
  modelId?: string;
  targetVelocity?: Vec3;
  energyEfficiency?: number;
}

/**
 * Build a joint→Bone map scoped to a SINGLE skeleton.
 *
 * Critical bug fix from /critic batch-4 review (Critical #2): naive
 * `object.traverse(...)` over-collects bones from sibling characters in
 * multi-character scenes, causing last-bone-wins joint-name collisions
 * (`hip`, `left_foot`, etc) and non-deterministic posing.
 *
 * Resolution rule (in priority order):
 *   1. If `object` IS a SkinnedMesh, use `object.skeleton.bones` directly.
 *   2. Else find the first SkinnedMesh descendant and use its `.skeleton.bones`.
 *   3. Fall back to the legacy traverse-with-collision-warning behavior
 *      (logged once per attach so test fixtures and headless rigs without
 *      SkinnedMesh still work, with operator visibility).
 */
function buildBoneMap(object: THREE.Object3D): Map<string, THREE.Bone> {
  const map = new Map<string, THREE.Bone>();

  const skinnedMesh =
    (object as THREE.SkinnedMesh).isSkinnedMesh === true
      ? (object as THREE.SkinnedMesh)
      : findFirstSkinnedMesh(object);

  if (skinnedMesh && skinnedMesh.skeleton) {
    for (const bone of skinnedMesh.skeleton.bones) {
      if (typeof bone.name === 'string' && bone.name.length > 0) {
        map.set(bone.name, bone);
      }
    }
    return map;
  }

  // Fallback path — no SkinnedMesh in subtree (test fixtures, headless rigs).
  // Detect collisions and warn so the caller knows multi-character collection occurred.
  const collisions: string[] = [];
  object.traverse((child) => {
    const maybeBone = child as THREE.Bone & { isBone?: boolean; name?: string };
    if (maybeBone.isBone === true && typeof maybeBone.name === 'string' && maybeBone.name.length > 0) {
      if (map.has(maybeBone.name)) collisions.push(maybeBone.name);
      map.set(maybeBone.name, maybeBone);
    }
  });
  if (collisions.length > 0) {
    console.warn(
      `[NeuralAnimationHandler] buildBoneMap: ${collisions.length} joint-name collisions in fallback traversal — ` +
      `wrap your character in a SkinnedMesh to scope per-skeleton. Colliding joints: ${collisions.join(', ')}`
    );
  }
  return map;
}

function findFirstSkinnedMesh(object: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  object.traverse((child) => {
    if (!found && (child as THREE.SkinnedMesh).isSkinnedMesh === true) {
      found = child as THREE.SkinnedMesh;
    }
  });
  return found;
}

/**
 * Apply pose to bones — both rotation AND position (Critical #1 fix from
 * /critic review: real NN backends produce relative joint translations
 * that are IK-relevant; previous handler discarded them silently).
 */
function applyPoseToBones(
  pose: MotionInferenceResult['pose'],
  boneMap: Map<string, THREE.Bone>
): number {
  let appliedCount = 0;
  for (const jointName in pose.joints) {
    const bone = boneMap.get(jointName);
    if (!bone) continue;
    const joint = pose.joints[jointName];
    bone.position.set(joint.position[0], joint.position[1], joint.position[2]);
    bone.quaternion.set(joint.rotation[0], joint.rotation[1], joint.rotation[2], joint.rotation[3]);
    appliedCount++;
  }
  return appliedCount;
}

function emit(data: HandlerData, eventType: string, payload: unknown): void {
  const listeners = data.listeners.get(eventType);
  if (!listeners) return;
  for (const listener of listeners) listener(payload);
}

export const neuralAnimationHandler: TraitHandler = {
  name: 'neural_animation',

  onApply(context: TraitContext): void {
    const config = (context.config ?? {}) as HandlerConfig;
    const engine = config.engine ?? createSyntheticWalkCycleEngine(config.modelId);

    // Fire-and-forget load (engine becomes usable as soon as load resolves —
    // SyntheticWalkCycleEngine.load() resolves synchronously next-tick).
    void engine.load();

    const data: HandlerData = {
      engine,
      boneMap: buildBoneMap(context.object),
      currentPhase: 0,
      targetVelocity: config.targetVelocity ?? { x: 0, y: 0, z: 0 },
      prevLeftContact: false,
      prevRightContact: false,
      lastResult: null,
      listeners: new Map(),
    };
    Object.assign(context.data, data);
  },

  onUpdate(context: TraitContext, delta: number): void {
    const data = context.data as unknown as HandlerData;
    if (!data || !data.engine) return;

    // Critical #3: gate on engine.loaded so async backends (ONNX runtime
    // fetch, WASM init, weight download) don't crash on first frame.
    // SyntheticWalkCycleEngine resolves load() synchronously, so this is a
    // no-op for the default case but protects every real backend.
    if (!data.engine.loaded) return;

    const config = (context.config ?? {}) as HandlerConfig;
    const result = data.engine.infer({
      targetVelocity: data.targetVelocity,
      currentPhase: data.currentPhase,
      delta,
      energyEfficiency: config.energyEfficiency,
    });

    data.currentPhase = result.phase;
    data.lastResult = result;
    applyPoseToBones(result.pose, data.boneMap);

    // Serious #6: events carry timestamp + agentId so listeners can correlate
    // across characters and replay deterministically (CAEL needs both).
    const eventBase = {
      timestamp: result.pose.timestamp,
      agentId: context.object.uuid,
      phase: result.phase,
    };

    if (result.contactFeatures.leftFoot !== data.prevLeftContact) {
      emit(data, 'on_foot_contact', { ...eventBase, side: 'left', state: result.contactFeatures.leftFoot });
      data.prevLeftContact = result.contactFeatures.leftFoot;
    }
    if (result.contactFeatures.rightFoot !== data.prevRightContact) {
      emit(data, 'on_foot_contact', { ...eventBase, side: 'right', state: result.contactFeatures.rightFoot });
      data.prevRightContact = result.contactFeatures.rightFoot;
    }

    if (result.stability < 0.3) {
      emit(data, 'on_stumble_detected', { ...eventBase, stability: result.stability });
    }

    emit(data, 'locomotion_features', {
      ...eventBase,
      locomotion: {
        phase: result.phase,
        trajectory: result.trajectory,
        stability: result.stability,
        contact: result.contactFeatures,
        currentGait: result.gait,
        kineticEnergyProxy: result.kineticEnergyProxy,
      },
      targetVelocity: data.targetVelocity,
      engineLoaded: data.engine.loaded,
    });
  },

  onRemove(context: TraitContext): void {
    const data = context.data as unknown as HandlerData;
    if (!data) return;
    data.engine?.dispose();
    data.boneMap.clear();
    data.listeners.clear();
  },
};

/**
 * Subscribe to a runtime locomotion event. Returns an unsubscribe function.
 * Lets sibling traits (e.g. runtime IKHandler) listen for foot contacts
 * without coupling to engine internals.
 */
export function subscribeNeuralAnimationEvent(
  context: TraitContext,
  eventType: 'on_foot_contact' | 'on_stumble_detected' | 'locomotion_features',
  listener: (payload: unknown) => void
): () => void {
  const data = context.data as unknown as HandlerData;
  if (!data || !data.listeners) {
    throw new Error(
      'subscribeNeuralAnimationEvent: context.data not initialized — call onApply first'
    );
  }
  let arr = data.listeners.get(eventType);
  if (!arr) {
    arr = [];
    data.listeners.set(eventType, arr);
  }
  arr.push(listener);
  return () => {
    const current = data.listeners.get(eventType);
    if (!current) return;
    const idx = current.indexOf(listener);
    if (idx >= 0) current.splice(idx, 1);
  };
}

/**
 * Update target velocity at runtime — equivalent to the AST event
 * 'neural_animation_set_target_velocity'.
 *
 * Throws if context.data is not initialized — Serious #7 from /critic
 * review: all three helpers now fail fast on lifecycle violation rather
 * than silently corrupt state.
 */
export function setNeuralAnimationTargetVelocity(
  context: TraitContext,
  velocity: Vec3
): void {
  const data = context.data as unknown as HandlerData;
  if (!data || !data.listeners) {
    throw new Error(
      'setNeuralAnimationTargetVelocity: context.data not initialized — call onApply first'
    );
  }
  data.targetVelocity = { x: velocity.x ?? 0, y: velocity.y ?? 0, z: velocity.z ?? 0 };
}

/**
 * Read the most recent inference result — for downstream traits (IK, agent
 * perception). Returns null if no inference has run yet (legitimate state);
 * throws if the handler was never attached (lifecycle error — Serious #7).
 */
export function getNeuralAnimationLastResult(
  context: TraitContext
): MotionInferenceResult | null {
  const data = context.data as unknown as HandlerData;
  if (!data || !data.listeners) {
    throw new Error(
      'getNeuralAnimationLastResult: context.data not initialized — call onApply first'
    );
  }
  return data.lastResult;
}
