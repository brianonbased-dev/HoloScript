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
  buildSyntheticBipedPose,
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

  it('onUpdate writes engine pose to bones — ground-truth quaternion AND position match', () => {
    // Serious #5 from /critic: assert against the actual computed pose, not
    // just "not identity". Reproduce the engine's math here so a buggy refactor
    // (axis swap, sign flip, missing speedScale) gets caught.
    const v = { x: 1.5, y: 0, z: 0 };
    const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const delta = 0.1;
    // SyntheticWalkCycleEngine.infer phase advance: max(speed,0.1)*0.5*delta
    const expectedPhase = (Math.max(speed, 0.1) * 0.5) * delta;
    const expectedPose = buildSyntheticBipedPose(expectedPhase, speed);

    neuralAnimationHandler.onApply!(ctx);
    setNeuralAnimationTargetVelocity(ctx, v);
    neuralAnimationHandler.onUpdate!(ctx, delta);

    const leftThighBone = object.children.find((c) => c.name === 'left_thigh') as THREE.Bone;
    const expectedThigh = expectedPose.left_thigh;
    // Critical #1 fix: BOTH position AND rotation are now applied.
    expect(leftThighBone.position.x).toBeCloseTo(expectedThigh.position[0], 5);
    expect(leftThighBone.position.y).toBeCloseTo(expectedThigh.position[1], 5);
    expect(leftThighBone.position.z).toBeCloseTo(expectedThigh.position[2], 5);
    expect(leftThighBone.quaternion.x).toBeCloseTo(expectedThigh.rotation[0], 5);
    expect(leftThighBone.quaternion.y).toBeCloseTo(expectedThigh.rotation[1], 5);
    expect(leftThighBone.quaternion.z).toBeCloseTo(expectedThigh.rotation[2], 5);
    expect(leftThighBone.quaternion.w).toBeCloseTo(expectedThigh.rotation[3], 5);
  });

  it('Critical #3: onUpdate is no-op when engine is not yet loaded (load race)', () => {
    // Custom engine with manually-controlled load() — caller resolves it later.
    let resolveLoad: () => void;
    const loadPromise = new Promise<void>((resolve) => { resolveLoad = resolve; });
    let inferCallCount = 0;
    const slowLoadingEngine: MotionMatchingEngine = {
      modelId: 'slow_load',
      loaded: false,
      load: () => loadPromise,
      dispose: () => {},
      infer: () => {
        inferCallCount++;
        return {
          pose: { joints: {}, timestamp: 0 },
          phase: 0,
          trajectory: [],
          stability: 1,
          contactFeatures: { leftFoot: false, rightFoot: false },
          gait: 'idle',
          kineticEnergyProxy: 0,
        };
      },
    };
    const slowCtx = makeContext(object, { engine: slowLoadingEngine });
    neuralAnimationHandler.onApply!(slowCtx);

    // First update before load resolves: must NOT call infer
    neuralAnimationHandler.onUpdate!(slowCtx, 0.016);
    expect(inferCallCount).toBe(0);

    // Now flip loaded and update — infer should be called
    (slowLoadingEngine as { loaded: boolean }).loaded = true;
    resolveLoad!();
    neuralAnimationHandler.onUpdate!(slowCtx, 0.016);
    expect(inferCallCount).toBe(1);
  });

  it('Critical #2: buildBoneMap scopes to SkinnedMesh, not parent subtree', () => {
    // Build a scene with TWO skeletons under a common root.
    // Naive traverse() would collect bones from both characters and overwrite
    // by name. Scoped resolution should only see one skeleton's bones.
    const root = new THREE.Object3D();
    root.name = 'scene_root';

    const charA = new THREE.SkinnedMesh();
    charA.name = 'character_A';
    const boneA = new THREE.Bone();
    boneA.name = 'hip';
    boneA.position.set(1, 0, 0); // distinguishable
    charA.skeleton = new THREE.Skeleton([boneA]);
    root.add(charA);

    const charB = new THREE.Object3D();
    charB.name = 'character_B';
    const boneB = new THREE.Bone();
    boneB.name = 'hip';
    boneB.position.set(2, 0, 0); // distinguishable
    charB.add(boneB);
    root.add(charB);

    // Apply trait to character A (the SkinnedMesh) — must only see boneA
    const ctxA = makeContext(charA);
    neuralAnimationHandler.onApply!(ctxA);
    const boneMap = (ctxA.data as Record<string, unknown>).boneMap as Map<string, THREE.Bone>;
    expect(boneMap.size).toBe(1);
    expect(boneMap.get('hip')).toBe(boneA);
    expect(boneMap.get('hip')).not.toBe(boneB);
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
        kineticEnergyProxy: 0,
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
