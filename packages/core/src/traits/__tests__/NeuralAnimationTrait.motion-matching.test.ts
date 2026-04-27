/**
 * NeuralAnimationTrait — motion_matching path
 *
 * Tests the new seam wired by idea-run-3 (research/2026-04-26_idea-run-3-neural-locomotion.md):
 *   1. animation_model='motion_matching' + engine present → onUpdate calls engine.infer()
 *   2. animation_model='motion_matching' + engine absent → falls through to legacy interpolator path
 *   3. set_engine event populates state.engine + emits on_locomotion_initialized
 *   4. clear_engine event disposes engine + emits on_locomotion_fallback
 *   5. set_target_velocity event updates state.target_velocity
 *   6. Foot-contact transitions emit on_foot_contact (drives WIRE-1 @ik bridge)
 *   7. Stability < 0.3 emits on_stumble_detected
 *   8. state.locomotion populated after first inference
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { neuralAnimationHandler } from '../NeuralAnimationTrait';
import { createNullMotionMatchingEngine, type MotionMatchingEngine, type MotionInferenceResult } from '../engines/motion-matching';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

const baseCfg = {
  animation_model: 'motion_matching' as const,
  smoothing: 0.7,
  retargeting: false,
  blend_weight: 1.0,
};

describe('NeuralAnimationTrait — motion_matching seam', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('nm');
    ctx = createMockContext();
    attachTrait(neuralAnimationHandler, node, baseCfg, ctx);
  });

  it('initializes new state fields on attach', () => {
    const s = (node as any).__neuralAnimationState;
    expect(s.engine).toBeNull();
    expect(s.locomotion).toBeNull();
    expect(s.target_velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('set_engine populates state.engine + emits on_locomotion_initialized', () => {
    const engine = createNullMotionMatchingEngine('biped_humanoid_v2');
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_engine',
      engine,
    });
    const s = (node as any).__neuralAnimationState;
    expect(s.engine).toBe(engine);
    expect(getEventCount(ctx, 'on_locomotion_initialized')).toBe(1);
    expect(getLastEvent(ctx, 'on_locomotion_initialized')).toMatchObject({
      modelId: 'biped_humanoid_v2',
    });
  });

  it('set_target_velocity updates state.target_velocity', () => {
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_target_velocity',
      velocity: { x: 1.5, y: 0, z: 0.5 },
    });
    const s = (node as any).__neuralAnimationState;
    expect(s.target_velocity).toEqual({ x: 1.5, y: 0, z: 0.5 });
  });

  it('onUpdate with engine + motion_matching populates state.locomotion', () => {
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_engine',
      engine: createNullMotionMatchingEngine('biped_humanoid_v2'),
    });
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_target_velocity',
      velocity: { x: 2, y: 0, z: 0 },
    });
    updateTrait(neuralAnimationHandler, node, baseCfg, ctx, 0.016);
    const s = (node as any).__neuralAnimationState;
    expect(s.locomotion).not.toBeNull();
    expect(s.locomotion.phase).toBeGreaterThan(0);
    expect(s.locomotion.trajectory.length).toBe(12);
    expect(s.locomotion.currentGait).toBe('trot');
    expect(getEventCount(ctx, 'neural_animation_frame')).toBe(1);
  });

  it('foot-contact transition emits on_foot_contact (drives @ik WIRE-1)', () => {
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_engine',
      engine: createNullMotionMatchingEngine('biped_humanoid_v2'),
    });
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_target_velocity',
      velocity: { x: 1, y: 0, z: 0 },
    });
    // First update: phase advances from 0 → small value (still <0.5) — leftFoot=true (transition from prev=false)
    updateTrait(neuralAnimationHandler, node, baseCfg, ctx, 0.016);
    expect(getEventCount(ctx, 'on_foot_contact')).toBeGreaterThanOrEqual(1);
    const lastContact = getLastEvent(ctx, 'on_foot_contact') as { side: string; state: boolean };
    expect(['left', 'right']).toContain(lastContact.side);
  });

  it('engine absent → falls through to legacy interpolator (no behavior change)', () => {
    // No engine set; with motion_matching model + no target_pose → no-op (matches existing trait)
    updateTrait(neuralAnimationHandler, node, baseCfg, ctx, 0.016);
    const s = (node as any).__neuralAnimationState;
    expect(s.locomotion).toBeNull();
    expect(getEventCount(ctx, 'neural_animation_frame')).toBe(0);
  });

  it('clear_engine disposes + emits on_locomotion_fallback', () => {
    const engine = createNullMotionMatchingEngine('biped_humanoid_v2');
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_engine',
      engine,
    });
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_clear_engine',
    });
    const s = (node as any).__neuralAnimationState;
    expect(s.engine).toBeNull();
    expect(s.locomotion).toBeNull();
    expect(getEventCount(ctx, 'on_locomotion_fallback')).toBe(1);
  });

  it('query_locomotion with no engine emits locomotion_features w/ null state', () => {
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_query_locomotion',
    });
    expect(getEventCount(ctx, 'locomotion_features')).toBe(1);
    const reply = getLastEvent(ctx, 'locomotion_features') as {
      locomotion: unknown;
      engineLoaded: boolean;
    };
    expect(reply.locomotion).toBeNull();
    expect(reply.engineLoaded).toBe(false);
  });

  it('query_locomotion after engine + tick exposes populated state', () => {
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_engine',
      engine: createNullMotionMatchingEngine('biped_humanoid_v2'),
    });
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_target_velocity',
      velocity: { x: 2, y: 0, z: 0 },
    });
    updateTrait(neuralAnimationHandler, node, baseCfg, ctx, 0.016);
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_query_locomotion',
    });
    const reply = getLastEvent(ctx, 'locomotion_features') as {
      locomotion: { phase: number; currentGait: string };
      targetVelocity: { x: number; y: number; z: number };
      engineLoaded: boolean;
    };
    expect(reply.locomotion).not.toBeNull();
    expect(reply.locomotion.phase).toBeGreaterThan(0);
    expect(reply.locomotion.currentGait).toBe('trot');
    expect(reply.targetVelocity).toEqual({ x: 2, y: 0, z: 0 });
    expect(reply.engineLoaded).toBe(true);
  });

  it('low stability triggers on_stumble_detected', () => {
    // Custom engine returning low stability — exercises the stumble hook
    const stumblyEngine: MotionMatchingEngine = {
      modelId: 'test',
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
    sendEvent(neuralAnimationHandler, node, baseCfg, ctx, {
      type: 'neural_animation_set_engine',
      engine: stumblyEngine,
    });
    updateTrait(neuralAnimationHandler, node, baseCfg, ctx, 0.016);
    expect(getEventCount(ctx, 'on_stumble_detected')).toBe(1);
    expect(getLastEvent(ctx, 'on_stumble_detected')).toMatchObject({ stability: 0.1 });
  });
});
