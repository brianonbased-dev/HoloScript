/**
 * NeuralAnimationTrait — Production Test Suite
 *
 * No external dependencies — the exported `interpolatePoses` helper is internal
 * but can be tested through the event/update interface.
 *
 * Key behaviours:
 * 1. defaultConfig — 5 fields
 * 2. onAttach — creates __neuralAnimationState; emits neural_animation_init
 * 3. onDetach — deletes state; no throws
 * 4. onUpdate — no-op without target_pose; lerps towards target_pose when current_pose set
 *   - blend_accumulator advances by delta * (1/smoothing)
 *   - blended pose emitted as neural_animation_frame
 *   - reaches t=1: clears target_pose + resets blend_accumulator
 * 5. onEvent 'neural_animation_synthesize' — sets target_pose, resets accumulator, is_generating=true, emits on_animation_synthesis_start
 * 6. onEvent 'neural_animation_retarget' — emits neural_animation_request_retarget with sourceSkeleton + targetSkeleton
 *   - uses config.target_skeleton first, falls back to event.target_skeleton
 * 7. onEvent 'neural_animation_retarget_result' — sets target_pose + emits on_retargeting_complete
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { neuralAnimationHandler } from '../NeuralAnimationTrait';

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nodeId = 0;
function makeNode() {
  return { id: `nanim_${++_nodeId}` };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function makeConfig(o: any = {}) {
  return { ...neuralAnimationHandler.defaultConfig!, ...o };
}
function attach(o: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(o);
  neuralAnimationHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) {
  return (node as any).__neuralAnimationState;
}

function makePose(val: number = 0) {
  return {
    timestamp: Date.now(),
    joints: {
      hip: {
        position: [val, val, val] as [number, number, number],
        rotation: [val, val, val, 1] as [number, number, number, number],
      },
    },
  };
}

beforeEach(() => vi.clearAllMocks());

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('neuralAnimationHandler.defaultConfig', () => {
  const d = neuralAnimationHandler.defaultConfig!;
  it('animation_model = neural_motion', () => expect(d.animation_model).toBe('neural_motion'));
  it('smoothing = 0.7', () => expect(d.smoothing).toBe(0.7));
  it('retargeting = false', () => expect(d.retargeting).toBe(false));
  it('blend_weight = 1.0', () => expect(d.blend_weight).toBe(1.0));
  it('target_skeleton = undefined', () => expect(d.target_skeleton).toBeUndefined());
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('neuralAnimationHandler.onAttach', () => {
  it('creates __neuralAnimationState', () => {
    const { node } = attach();
    expect(getState(node)).toBeDefined();
  });
  it('current_pose = null', () => {
    const { node } = attach();
    expect(getState(node).current_pose).toBeNull();
  });
  it('target_pose = null', () => {
    const { node } = attach();
    expect(getState(node).target_pose).toBeNull();
  });
  it('animation_buffer starts empty', () => {
    const { node } = attach();
    expect(getState(node).animation_buffer).toEqual([]);
  });
  it('is_generating = false', () => {
    const { node } = attach();
    expect(getState(node).is_generating).toBe(false);
  });
  it('blend_accumulator = 0', () => {
    const { node } = attach();
    expect(getState(node).blend_accumulator).toBe(0);
  });
  it('emits neural_animation_init with model + retargeting', () => {
    const { ctx } = attach({ animation_model: 'diffusion', retargeting: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_animation_init',
      expect.objectContaining({
        model: 'diffusion',
        retargeting: true,
      })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('neuralAnimationHandler.onDetach', () => {
  it('removes __neuralAnimationState', () => {
    const { node, ctx, config } = attach();
    neuralAnimationHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
  it('does not throw', () => {
    const { node, ctx, config } = attach();
    expect(() => neuralAnimationHandler.onDetach!(node as any, config, ctx as any)).not.toThrow();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────
describe('neuralAnimationHandler.onUpdate', () => {
  it('no-op when target_pose is null', () => {
    const { node, ctx, config } = attach();
    getState(node).current_pose = makePose(0);
    ctx.emit.mockClear();
    neuralAnimationHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('neural_animation_frame', expect.anything());
  });

  it('no-op when state is missing', () => {
    const { node, ctx, config } = attach();
    delete (node as any).__neuralAnimationState;
    expect(() =>
      neuralAnimationHandler.onUpdate!(node as any, config, ctx as any, 0.016)
    ).not.toThrow();
  });

  it('no-op when current_pose is null (target_pose set but no start)', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    state.target_pose = makePose(1);
    state.current_pose = null;
    ctx.emit.mockClear();
    neuralAnimationHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('emits neural_animation_frame when lerping', () => {
    const { node, ctx, config } = attach({ smoothing: 1.0, blend_weight: 1.0 });
    const state = getState(node);
    state.current_pose = makePose(0);
    state.target_pose = makePose(10);
    ctx.emit.mockClear();
    neuralAnimationHandler.onUpdate!(node as any, config, ctx as any, 0.5); // t = 0.5 * (1/1.0) = 0.5
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_animation_frame',
      expect.objectContaining({ pose: expect.any(Object) })
    );
  });

  it('clears target_pose when accumulator reaches 1.0', () => {
    const { node, ctx, config } = attach({ smoothing: 1.0, blend_weight: 1.0 });
    const state = getState(node);
    state.current_pose = makePose(0);
    state.target_pose = makePose(5);
    neuralAnimationHandler.onUpdate!(node as any, config, ctx as any, 1.0); // t = 1.0 → done
    expect(state.target_pose).toBeNull();
    expect(state.blend_accumulator).toBe(0);
  });

  it('lerped position is between from and to values', () => {
    const { node, ctx, config } = attach({ smoothing: 1.0, blend_weight: 1.0 });
    const state = getState(node);
    state.current_pose = {
      timestamp: 0,
      joints: { hip: { position: [0, 0, 0], rotation: [0, 0, 0, 1] } },
    };
    state.target_pose = {
      timestamp: 0,
      joints: { hip: { position: [10, 10, 10], rotation: [0, 0, 0, 1] } },
    };
    neuralAnimationHandler.onUpdate!(node as any, config, ctx as any, 0.5); // t=0.5
    const blendedPos = state.current_pose.joints.hip.position;
    // Lerped 0 → 10 at t=0.5 = ~5
    expect(blendedPos[0]).toBeCloseTo(5, 0);
  });
});

// ─── onEvent 'neural_animation_synthesize' ────────────────────────────────────
describe("onEvent 'neural_animation_synthesize'", () => {
  it('sets target_pose and resets blend_accumulator', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    state.blend_accumulator = 0.5; // simulate partial progress
    const pose = makePose(3);
    neuralAnimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'neural_animation_synthesize',
      target_pose: pose,
    });
    expect(state.target_pose).toBe(pose);
    expect(state.blend_accumulator).toBe(0);
    expect(state.is_generating).toBe(true);
  });

  it('emits on_animation_synthesis_start', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    const pose = makePose(1);
    neuralAnimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'neural_animation_synthesize',
      target_pose: pose,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_animation_synthesis_start',
      expect.objectContaining({ targetPose: pose })
    );
  });
});

// ─── onEvent 'neural_animation_retarget' ──────────────────────────────────────
describe("onEvent 'neural_animation_retarget'", () => {
  it('emits neural_animation_request_retarget with source and target skeleton', () => {
    const { node, ctx, config } = attach({ target_skeleton: 'robot' });
    ctx.emit.mockClear();
    neuralAnimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'neural_animation_retarget',
      source_skeleton: 'human',
      target_skeleton: 'ignored_override',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_animation_request_retarget',
      expect.objectContaining({
        sourceSkeleton: 'human',
        targetSkeleton: 'robot', // config.target_skeleton wins
      })
    );
  });

  it('falls back to event.target_skeleton when config.target_skeleton not set', () => {
    const { node, ctx, config } = attach({ target_skeleton: undefined });
    ctx.emit.mockClear();
    neuralAnimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'neural_animation_retarget',
      source_skeleton: 'human',
      target_skeleton: 'gnome',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_animation_request_retarget',
      expect.objectContaining({
        targetSkeleton: 'gnome',
      })
    );
  });

  it('includes currentPose in request', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    state.current_pose = makePose(2);
    ctx.emit.mockClear();
    neuralAnimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'neural_animation_retarget',
      source_skeleton: 's',
      target_skeleton: 't',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'neural_animation_request_retarget',
      expect.objectContaining({
        currentPose: state.current_pose,
      })
    );
  });
});

// ─── onEvent 'neural_animation_retarget_result' ───────────────────────────────
describe("onEvent 'neural_animation_retarget_result'", () => {
  it('sets retargeted pose as target_pose', () => {
    const { node, ctx, config } = attach();
    const pose = makePose(7);
    neuralAnimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'neural_animation_retarget_result',
      pose,
    });
    expect(getState(node).target_pose).toBe(pose);
    expect(getState(node).blend_accumulator).toBe(0);
  });

  it('emits on_retargeting_complete', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    const pose = makePose(7);
    neuralAnimationHandler.onEvent!(node as any, config, ctx as any, {
      type: 'neural_animation_retarget_result',
      pose,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_retargeting_complete',
      expect.objectContaining({ pose })
    );
  });
});
