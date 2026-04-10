import { describe, it, expect, beforeEach } from 'vitest';
import { neuralAnimationHandler } from '../NeuralAnimationTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('NeuralAnimationTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    animation_model: 'neural_motion' as const,
    smoothing: 0.7,
    retargeting: false,
    blend_weight: 1.0,
    target_skeleton: undefined,
  };

  const makePose = (x = 0) => ({
    joints: {
      hip: {
        position: [x, 1, 0] as [number, number, number],
        rotation: [0, 0, 0, 1] as [number, number, number, number],
      },
    },
    timestamp: Date.now(),
  });

  beforeEach(() => {
    node = createMockNode('na');
    ctx = createMockContext();
    attachTrait(neuralAnimationHandler, node, cfg, ctx);
  });

  it('emits neural_animation_init on attach', () => {
    expect(getEventCount(ctx, 'neural_animation_init')).toBe(1);
    const s = (node as any).__neuralAnimationState;
    expect(s.current_pose).toBeNull();
  });

  it('neural_animation_synthesize sets target', () => {
    const pose = makePose(1);
    sendEvent(neuralAnimationHandler, node, cfg, ctx, {
      type: 'neural_animation_synthesize',
      target_pose: pose,
    });
    const s = (node as any).__neuralAnimationState;
    expect(s.target_pose).toBe(pose);
    expect(s.is_generating).toBe(true);
    expect(getEventCount(ctx, 'on_animation_synthesis_start')).toBe(1);
  });

  it('update interpolates toward target when current_pose exists', () => {
    const s = (node as any).__neuralAnimationState;
    s.current_pose = makePose(0);
    s.target_pose = makePose(10);
    s.blend_accumulator = 0;
    updateTrait(neuralAnimationHandler, node, cfg, ctx, 0.1);
    expect(s.current_pose.joints.hip.position[0]).toBeGreaterThan(0);
    expect(getEventCount(ctx, 'neural_animation_frame')).toBe(1);
  });

  it('blend accumulator clears target when fully blended', () => {
    const s = (node as any).__neuralAnimationState;
    s.current_pose = makePose(0);
    s.target_pose = makePose(1);
    s.blend_accumulator = 0;
    // Large delta to exceed smoothing threshold (t >= 1)
    updateTrait(neuralAnimationHandler, node, cfg, ctx, 2.0);
    expect(s.target_pose).toBeNull();
    expect(s.blend_accumulator).toBe(0);
  });

  it('retarget request emits retarget event', () => {
    sendEvent(neuralAnimationHandler, node, cfg, ctx, {
      type: 'neural_animation_retarget',
      source_skeleton: 'skeleton_A',
      target_skeleton: 'skeleton_B',
    });
    expect(getEventCount(ctx, 'neural_animation_request_retarget')).toBe(1);
  });

  it('retarget result sets new target', () => {
    const rPose = makePose(5);
    sendEvent(neuralAnimationHandler, node, cfg, ctx, {
      type: 'neural_animation_retarget_result',
      pose: rPose,
    });
    const s = (node as any).__neuralAnimationState;
    expect(s.target_pose).toBe(rPose);
    expect(getEventCount(ctx, 'on_retargeting_complete')).toBe(1);
  });

  it('detach cleans up', () => {
    neuralAnimationHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__neuralAnimationState).toBeUndefined();
  });
});
