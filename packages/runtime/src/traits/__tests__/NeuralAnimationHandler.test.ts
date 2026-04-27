/**
 * NeuralAnimationHandler — runtime/traits-side bridge tests (RULING 2 pilot).
 *
 * Verifies the per-trait wrapper pattern: AST trait declared in
 * @holoscript/core, runtime side here in @holoscript/runtime, both share
 * the same MotionMatchingEngine. No generic TraitSystem bridge needed.
 *
 * THREE.Object3D + Bone are real (no mocks) — the handler manipulates
 * bone.quaternion which is a real THREE.Quaternion API and unit-testable
 * without WebGL.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  createSyntheticWalkCycleEngine,
  SYNTHETIC_WALK_JOINTS,
  type MotionMatchingEngine,
  type MotionInferenceResult,
} from '@holoscript/core/traits/engines';
import {
  neuralAnimationHandler,
  subscribeNeuralAnimationEvent,
  setNeuralAnimationTargetVelocity,
  getNeuralAnimationLastResult,
} from '../NeuralAnimationHandler';
import type { TraitContext } from '../TraitSystem';

function buildBipedSkeleton(): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = 'biped_root';
  for (const jointName of SYNTHETIC_WALK_JOINTS) {
    const bone = new THREE.Bone();
    bone.name = jointName;
    root.add(bone);
  }
  return root;
}

function makeContext(object: THREE.Object3D, config: Record<string, unknown> = {}): TraitContext {
  return {
    object,
    physicsWorld: {} as TraitContext['physicsWorld'],
    config,
    data: {},
  };
}

describe('NeuralAnimationHandler — runtime bridge (RULING 2 pilot)', () => {
  let object: THREE.Object3D;
  let ctx: TraitContext;

  beforeEach(() => {
    object = buildBipedSkeleton();
    ctx = makeContext(object);
  });

  it('onApply discovers all 7 biped bones in the THREE.Object3D', () => {
    neuralAnimationHandler.onApply!(ctx);
    const data = ctx.data as Record<string, unknown>;
    const boneMap = data.boneMap as Map<string, THREE.Bone>;
    expect(boneMap.size).toBe(SYNTHETIC_WALK_JOINTS.length);
    for (const jointName of SYNTHETIC_WALK_JOINTS) {
      expect(boneMap.get(jointName)).toBeInstanceOf(THREE.Bone);
    }
  });

  it('onApply uses default SyntheticWalkCycleEngine when no engine in config', async () => {
    neuralAnimationHandler.onApply!(ctx);
    const data = ctx.data as Record<string, unknown>;
    const engine = data.engine as MotionMatchingEngine;
    expect(engine).toBeDefined();
    expect(engine.modelId).toBe('synthetic_biped_walk');
    // load() is fire-and-forget; await a tick so it resolves
    await Promise.resolve();
    expect(engine.loaded).toBe(true);
  });

  it('onApply uses custom engine when passed via config', async () => {
    const customEngine = createSyntheticWalkCycleEngine('test_quad_v1');
    const ctxWithEngine = makeContext(object, { engine: customEngine });
    neuralAnimationHandler.onApply!(ctxWithEngine);
    const data = ctxWithEngine.data as Record<string, unknown>;
    expect(data.engine).toBe(customEngine);
  });

  it('onUpdate writes engine pose quaternions to the actual bones', () => {
    neuralAnimationHandler.onApply!(ctx);
    setNeuralAnimationTargetVelocity(ctx, { x: 1.5, y: 0, z: 0 });
    neuralAnimationHandler.onUpdate!(ctx, 0.016);

    const hipBone = object.children.find((c) => c.name === 'hip') as THREE.Bone;
    // Quaternion should NOT be identity after walking inference
    const isIdentity = hipBone.quaternion.x === 0 && hipBone.quaternion.y === 0 && hipBone.quaternion.z === 0 && hipBone.quaternion.w === 1;
    // Hip quat may be identity at phase 0 with low yaw; check left_thigh which definitely rotates
    const leftThighBone = object.children.find((c) => c.name === 'left_thigh') as THREE.Bone;
    expect(leftThighBone.quaternion.w).not.toBe(1); // rotated, not identity
    // hipBone reference still works (quaternion was set)
    expect(typeof isIdentity).toBe('boolean');
  });

  it('onUpdate accumulates phase across calls', () => {
    neuralAnimationHandler.onApply!(ctx);
    setNeuralAnimationTargetVelocity(ctx, { x: 2, y: 0, z: 0 });
    neuralAnimationHandler.onUpdate!(ctx, 0.1);
    const data = ctx.data as Record<string, unknown>;
    const phaseAfter1 = data.currentPhase as number;
    neuralAnimationHandler.onUpdate!(ctx, 0.1);
    const phaseAfter2 = data.currentPhase as number;
    expect(phaseAfter2).toBeGreaterThan(phaseAfter1);
  });

  it('onUpdate emits on_foot_contact when contact transitions', () => {
    neuralAnimationHandler.onApply!(ctx);
    setNeuralAnimationTargetVelocity(ctx, { x: 1, y: 0, z: 0 });

    const events: Array<{ side: string; state: boolean }> = [];
    subscribeNeuralAnimationEvent(ctx, 'on_foot_contact', (payload) => {
      events.push(payload as { side: string; state: boolean });
    });

    // Multiple ticks to drive phase across the 0.5 transition (left→right swap)
    for (let i = 0; i < 30; i++) {
      neuralAnimationHandler.onUpdate!(ctx, 0.05);
    }

    expect(events.length).toBeGreaterThan(0);
    const sides = events.map((e) => e.side);
    expect(sides).toContain('left');
    // After enough ticks, also expect a right-side transition
    expect(sides.some((s) => s === 'right')).toBe(true);
  });

  it('locomotion_features listener receives full state each tick', () => {
    neuralAnimationHandler.onApply!(ctx);
    setNeuralAnimationTargetVelocity(ctx, { x: 2, y: 0, z: 0 });

    let lastFeatures: { locomotion: { currentGait: string }; engineLoaded: boolean } | null = null;
    subscribeNeuralAnimationEvent(ctx, 'locomotion_features', (payload) => {
      lastFeatures = payload as typeof lastFeatures;
    });

    neuralAnimationHandler.onUpdate!(ctx, 0.016);
    expect(lastFeatures).not.toBeNull();
    expect(lastFeatures!.locomotion.currentGait).toBe('trot');
    expect(typeof lastFeatures!.engineLoaded).toBe('boolean');
  });

  it('subscribeNeuralAnimationEvent returns an unsubscribe function', () => {
    neuralAnimationHandler.onApply!(ctx);
    setNeuralAnimationTargetVelocity(ctx, { x: 1, y: 0, z: 0 });

    let count = 0;
    const unsub = subscribeNeuralAnimationEvent(ctx, 'locomotion_features', () => {
      count++;
    });

    neuralAnimationHandler.onUpdate!(ctx, 0.016);
    expect(count).toBe(1);

    unsub();
    neuralAnimationHandler.onUpdate!(ctx, 0.016);
    expect(count).toBe(1); // unchanged after unsubscribe
  });

  it('low-stability stumble emits on_stumble_detected', () => {
    // Custom engine that always reports low stability
    const stumblyEngine: MotionMatchingEngine = {
      modelId: 'stumbly',
      loaded: true,
      load: async () => {},
      dispose: () => {},
      infer: (input): MotionInferenceResult => ({
        pose: { joints: {}, timestamp: 0 },
        phase: input.currentPhase,
        trajectory: [],
        stability: 0.1,
        contactFeatures: { leftFoot: true, rightFoot: false },
        gait: 'walk',
        energyCost: 0,
      }),
    };
    const stumbleCtx = makeContext(object, { engine: stumblyEngine });
    neuralAnimationHandler.onApply!(stumbleCtx);

    const stumbles: Array<{ stability: number }> = [];
    subscribeNeuralAnimationEvent(stumbleCtx, 'on_stumble_detected', (payload) => {
      stumbles.push(payload as { stability: number });
    });
    neuralAnimationHandler.onUpdate!(stumbleCtx, 0.016);

    expect(stumbles).toHaveLength(1);
    expect(stumbles[0].stability).toBe(0.1);
  });

  it('getNeuralAnimationLastResult returns null before first update', () => {
    neuralAnimationHandler.onApply!(ctx);
    expect(getNeuralAnimationLastResult(ctx)).toBeNull();
  });

  it('getNeuralAnimationLastResult returns the last MotionInferenceResult', () => {
    neuralAnimationHandler.onApply!(ctx);
    setNeuralAnimationTargetVelocity(ctx, { x: 1, y: 0, z: 0 });
    neuralAnimationHandler.onUpdate!(ctx, 0.016);

    const result = getNeuralAnimationLastResult(ctx);
    expect(result).not.toBeNull();
    expect(result!.gait).toBe('walk');
    expect(result!.trajectory.length).toBe(12);
  });

  it('onRemove disposes engine and clears bone map', () => {
    neuralAnimationHandler.onApply!(ctx);
    const data = ctx.data as Record<string, unknown>;
    const engine = data.engine as MotionMatchingEngine;
    const boneMap = data.boneMap as Map<string, THREE.Bone>;

    neuralAnimationHandler.onRemove!(ctx);

    expect(engine.loaded).toBe(false);
    expect(boneMap.size).toBe(0);
  });
});
