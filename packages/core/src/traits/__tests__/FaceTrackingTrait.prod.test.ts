/**
 * FaceTrackingTrait — Production Test Suite
 *
 * Tests: detectPhoneme helper (indirectly via events), defaultConfig,
 * onAttach, onDetach, onUpdate, onEvent face_data_update + face_tracking_lost.
 */
import { describe, it, expect, vi } from 'vitest';
import { faceTrackingHandler } from '../FaceTrackingTrait';

function makeNode() {
  return { id: 'ft_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...faceTrackingHandler.defaultConfig!, ...cfg };
  faceTrackingHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('faceTrackingHandler.defaultConfig', () => {
  const d = faceTrackingHandler.defaultConfig!;
  it('blend_shapes=true', () => expect(d.blend_shapes).toBe(true));
  it('mesh_topology=arkit', () => expect(d.mesh_topology).toBe('arkit'));
  it('eye_tracking=true', () => expect(d.eye_tracking).toBe(true));
  it('lip_sync=true', () => expect(d.lip_sync).toBe(true));
  it('smoothing=0.3', () => expect(d.smoothing).toBe(0.3));
  it('confidence_threshold=0.5', () => expect(d.confidence_threshold).toBe(0.5));
  it('update_rate=60', () => expect(d.update_rate).toBe(60));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('faceTrackingHandler.onAttach', () => {
  it('creates __faceTrackingState', () => expect(attach().node.__faceTrackingState).toBeDefined());
  it('isTracking=false', () => expect(attach().node.__faceTrackingState.isTracking).toBe(false));
  it('blendShapes is empty Map', () =>
    expect(attach().node.__faceTrackingState.blendShapes.size).toBe(0));
  it('leftEye=null', () => expect(attach().node.__faceTrackingState.leftEye).toBeNull());
  it('rightEye=null', () => expect(attach().node.__faceTrackingState.rightEye).toBeNull());
  it('headPose=null', () => expect(attach().node.__faceTrackingState.headPose).toBeNull());
  it('smoothedShapes is empty Map', () =>
    expect(attach().node.__faceTrackingState.smoothedShapes.size).toBe(0));
  it('lipSyncPhoneme=null', () =>
    expect(attach().node.__faceTrackingState.lipSyncPhoneme).toBeNull());
  it('emits face_tracking_start with topology + blendShapes + eyeTracking', () => {
    const { ctx } = attach({ mesh_topology: 'meta', blend_shapes: true, eye_tracking: false });
    expect(ctx.emit).toHaveBeenCalledWith(
      'face_tracking_start',
      expect.objectContaining({
        topology: 'meta',
        blendShapes: true,
        eyeTracking: false,
      })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('faceTrackingHandler.onDetach', () => {
  it('emits face_tracking_stop', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    faceTrackingHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('face_tracking_stop', { node });
  });
  it('removes __faceTrackingState', () => {
    const { node, config, ctx } = attach();
    faceTrackingHandler.onDetach!(node, config, ctx);
    expect(node.__faceTrackingState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('faceTrackingHandler.onUpdate', () => {
  it('no-op when not tracking', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    faceTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('emits avatar_blend_shapes when tracking and smoothedShapes non-empty', () => {
    const { node, config, ctx } = attach({ blend_shapes: true });
    node.__faceTrackingState.isTracking = true;
    node.__faceTrackingState.smoothedShapes.set('jawOpen', 0.5);
    ctx.emit.mockClear();
    faceTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'avatar_blend_shapes',
      expect.objectContaining({
        blendShapes: expect.objectContaining({ jawOpen: 0.5 }),
      })
    );
  });
  it('does NOT emit avatar_blend_shapes when blend_shapes=false', () => {
    const { node, config, ctx } = attach({ blend_shapes: false });
    node.__faceTrackingState.isTracking = true;
    node.__faceTrackingState.smoothedShapes.set('jawOpen', 0.5);
    ctx.emit.mockClear();
    faceTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('avatar_blend_shapes', expect.any(Object));
  });
  it('emits avatar_eye_gaze when tracking and eye_tracking=true and leftEye set', () => {
    const { node, config, ctx } = attach({ eye_tracking: true });
    node.__faceTrackingState.isTracking = true;
    const eye = { direction: { x: 0, y: 0, z: -1 }, origin: { x: 0, y: 0, z: 0 }, confidence: 0.9 };
    node.__faceTrackingState.leftEye = eye;
    ctx.emit.mockClear();
    faceTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'avatar_eye_gaze',
      expect.objectContaining({ leftEye: eye })
    );
  });
  it('does NOT emit avatar_eye_gaze when eye_tracking=false', () => {
    const { node, config, ctx } = attach({ eye_tracking: false });
    node.__faceTrackingState.isTracking = true;
    node.__faceTrackingState.leftEye = {
      direction: { x: 0, y: 0, z: -1 },
      origin: { x: 0, y: 0, z: 0 },
      confidence: 0.9,
    };
    ctx.emit.mockClear();
    faceTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('avatar_eye_gaze', expect.any(Object));
  });
  it('emits avatar_head_pose when headPose is set', () => {
    const { node, config, ctx } = attach();
    node.__faceTrackingState.isTracking = true;
    node.__faceTrackingState.headPose = {
      position: [0, 1.7, 0],
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    };
    ctx.emit.mockClear();
    faceTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'avatar_head_pose',
      expect.objectContaining({
        position: [0, 1.7, 0],
      })
    );
  });
  it('does NOT emit avatar_head_pose when headPose=null', () => {
    const { node, config, ctx } = attach();
    node.__faceTrackingState.isTracking = true;
    node.__faceTrackingState.headPose = null;
    ctx.emit.mockClear();
    faceTrackingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('avatar_head_pose', expect.any(Object));
  });
});

// ─── onEvent — face_data_update ───────────────────────────────────────────────

describe('faceTrackingHandler.onEvent — face_data_update', () => {
  it('sets isTracking=true', () => {
    const { node, config, ctx } = attach();
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: {},
      eyes: {},
    });
    expect(node.__faceTrackingState.isTracking).toBe(true);
  });
  it('updates lastUpdateTime', () => {
    const before = Date.now();
    const { node, config, ctx } = attach();
    faceTrackingHandler.onEvent!(node, config, ctx, { type: 'face_data_update' });
    expect(node.__faceTrackingState.lastUpdateTime).toBeGreaterThanOrEqual(before);
  });
  it('emits face_tracking_found on first data update (wasTracking=false)', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    faceTrackingHandler.onEvent!(node, config, ctx, { type: 'face_data_update' });
    expect(ctx.emit).toHaveBeenCalledWith('face_tracking_found', { node });
  });
  it('does NOT emit face_tracking_found on subsequent updates', () => {
    const { node, config, ctx } = attach();
    faceTrackingHandler.onEvent!(node, config, ctx, { type: 'face_data_update' });
    ctx.emit.mockClear();
    faceTrackingHandler.onEvent!(node, config, ctx, { type: 'face_data_update' });
    expect(ctx.emit).not.toHaveBeenCalledWith('face_tracking_found', expect.any(Object));
  });
  it('stores blendShapes in state.blendShapes map', () => {
    const { node, config, ctx } = attach({ blend_shapes: true });
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.8, mouthSmileLeft: 0.2 },
    });
    expect(node.__faceTrackingState.blendShapes.get('jawOpen')).toBeCloseTo(0.8);
  });
  it('smoothes blend shapes: smoothed = prev * smoothing + value * (1 - smoothing)', () => {
    // smoothing=0: smoothed = value exactly
    const { node, config, ctx } = attach({ blend_shapes: true, smoothing: 0 });
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.9 },
    });
    expect(node.__faceTrackingState.smoothedShapes.get('jawOpen')).toBeCloseTo(0.9, 5);
  });
  it('second update smooths from previous value (smoothing=0.5)', () => {
    const { node, config, ctx } = attach({ blend_shapes: true, smoothing: 0.5 });
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.0 },
    });
    // prev=0, value=0 → smoothed=0. Now update with value=1.0:
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 1.0 },
    });
    // 0 * 0.5 + 1.0 * 0.5 = 0.5
    expect(node.__faceTrackingState.smoothedShapes.get('jawOpen')).toBeCloseTo(0.5, 5);
  });
  it('emits face_expression_update with smoothed shapes', () => {
    const { node, config, ctx } = attach({ blend_shapes: true, smoothing: 0 });
    ctx.emit.mockClear();
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { eyeBlinkLeft: 1.0 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'face_expression_update',
      expect.objectContaining({
        blendShapes: expect.objectContaining({ eyeBlinkLeft: 1.0 }),
      })
    );
  });
  it('stores left/right eye when eye_tracking=true', () => {
    const { node, config, ctx } = attach({ eye_tracking: true });
    const lEye = {
      direction: { x: 0, y: 0, z: -1 },
      origin: { x: -0.03, y: 0, z: 0 },
      confidence: 0.9,
    };
    const rEye = {
      direction: { x: 0, y: 0, z: -1 },
      origin: { x: 0.03, y: 0, z: 0 },
      confidence: 0.9,
    };
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      eyes: { left: lEye, right: rEye },
    });
    expect(node.__faceTrackingState.leftEye).toEqual(lEye);
    expect(node.__faceTrackingState.rightEye).toEqual(rEye);
  });
  it('does NOT store eyes when eye_tracking=false', () => {
    const { node, config, ctx } = attach({ eye_tracking: false });
    const lEye = { direction: { x: 0, y: 0, z: -1 }, origin: { x: 0, y: 0, z: 0 }, confidence: 1 };
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      eyes: { left: lEye },
    });
    expect(node.__faceTrackingState.leftEye).toBeNull();
  });
  it('stores headPose when provided', () => {
    const { node, config, ctx } = attach();
    const hp = { position: [0, 1.6, 0], rotation: { x: 0, y: 0, z: 0, w: 1 } };
    faceTrackingHandler.onEvent!(node, config, ctx, { type: 'face_data_update', headPose: hp });
    expect(node.__faceTrackingState.headPose).toEqual(hp);
  });
});

// ─── detectPhoneme (tested via lip_sync + face_data_update) ──────────────────

describe('faceTrackingHandler — detectPhoneme via lip_sync', () => {
  function phonemeFor(shapes: Record<string, number>) {
    const { node, config, ctx } = attach({ blend_shapes: true, lip_sync: true, smoothing: 0 });
    ctx.emit.mockClear();
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: shapes,
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'lip_sync_phoneme');
    return call?.[1]?.phoneme ?? null;
  }

  it('jawOpen>0.7 → AA', () => expect(phonemeFor({ jawOpen: 0.8 })).toBe('AA'));
  it('mouthFunnel>0.6 → OO', () => expect(phonemeFor({ mouthFunnel: 0.7 })).toBe('OO'));
  it('mouthPucker>0.6 → UU', () => expect(phonemeFor({ mouthPucker: 0.65 })).toBe('UU'));
  it('mouthSmile avg>0.5 → EE', () =>
    expect(phonemeFor({ mouthSmileLeft: 0.6, mouthSmileRight: 0.6 })).toBe('EE'));
  it('mouthClose>0.5 and jawOpen<0.2 → MM', () =>
    expect(phonemeFor({ mouthClose: 0.6, jawOpen: 0.1 })).toBe('MM'));
  it('jawOpen 0.3..0.6 → AH', () => expect(phonemeFor({ jawOpen: 0.4 })).toBe('AH'));
  it('no matching shapes → no lip_sync_phoneme emitted (null returns nothing)', () => {
    const { node, config, ctx } = attach({ blend_shapes: true, lip_sync: true, smoothing: 0 });
    ctx.emit.mockClear();
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.0 },
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('lip_sync_phoneme', expect.any(Object));
  });
  it('emits lip_sync_phoneme only on phoneme change (dedup)', () => {
    const { node, config, ctx } = attach({ blend_shapes: true, lip_sync: true, smoothing: 0 });
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.8 },
    });
    ctx.emit.mockClear();
    // Same shapes again — same phoneme. Should NOT emit again.
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.8 },
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('lip_sync_phoneme', expect.any(Object));
  });
  it('emits lip_sync_phoneme when phoneme changes', () => {
    const { node, config, ctx } = attach({ blend_shapes: true, lip_sync: true, smoothing: 0 });
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.8 },
    });
    ctx.emit.mockClear();
    // Change to OO — only mouthFunnel, no jawOpen (which would take priority as AA)
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.0, mouthFunnel: 0.7 },
    });
    expect(ctx.emit).toHaveBeenCalledWith('lip_sync_phoneme', { node, phoneme: 'OO' });
  });
  it('does NOT emit lip_sync_phoneme when lip_sync=false', () => {
    const { node, config, ctx } = attach({ blend_shapes: true, lip_sync: false, smoothing: 0 });
    ctx.emit.mockClear();
    faceTrackingHandler.onEvent!(node, config, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.9 },
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('lip_sync_phoneme', expect.any(Object));
  });
});

// ─── onEvent — face_tracking_lost ─────────────────────────────────────────────

describe('faceTrackingHandler.onEvent — face_tracking_lost', () => {
  it('sets isTracking=false', () => {
    const { node, config, ctx } = attach();
    node.__faceTrackingState.isTracking = true;
    faceTrackingHandler.onEvent!(node, config, ctx, { type: 'face_tracking_lost' });
    expect(node.__faceTrackingState.isTracking).toBe(false);
  });
  it('emits face_tracking_lost event', () => {
    const { node, config, ctx } = attach();
    node.__faceTrackingState.isTracking = true;
    ctx.emit.mockClear();
    faceTrackingHandler.onEvent!(node, config, ctx, { type: 'face_tracking_lost' });
    expect(ctx.emit).toHaveBeenCalledWith('face_tracking_lost', { node });
  });
  it('does NOT emit face_tracking_lost when already not tracking', () => {
    const { node, config, ctx } = attach();
    node.__faceTrackingState.isTracking = false;
    ctx.emit.mockClear();
    faceTrackingHandler.onEvent!(node, config, ctx, { type: 'face_tracking_lost' });
    expect(ctx.emit).not.toHaveBeenCalledWith('face_tracking_lost', expect.any(Object));
  });
});
