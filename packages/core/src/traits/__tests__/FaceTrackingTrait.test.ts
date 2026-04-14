import { describe, it, expect, beforeEach } from 'vitest';
import { faceTrackingHandler } from '../FaceTrackingTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('FaceTrackingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    blend_shapes: true,
    mesh_topology: 'arkit' as const,
    eye_tracking: true,
    lip_sync: true,
    smoothing: 0.3,
    confidence_threshold: 0.5,
    update_rate: 60,
  };

  beforeEach(() => {
    node = createMockNode('ft');
    ctx = createMockContext();
    attachTrait(faceTrackingHandler, node, cfg, ctx);
  });

  it('emits face_tracking_start on attach', () => {
    expect(getEventCount(ctx, 'face_tracking_start')).toBe(1);
    expect((node as any).__faceTrackingState.isTracking).toBe(false);
  });

  it('face_data_update activates tracking', () => {
    sendEvent(faceTrackingHandler, node, cfg, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.5, mouthSmileLeft: 0.3 },
    });
    expect((node as any).__faceTrackingState.isTracking).toBe(true);
    expect(getEventCount(ctx, 'face_tracking_found')).toBe(1);
    expect(getEventCount(ctx, 'face_expression_update')).toBe(1);
  });

  it('blend shapes are smoothed', () => {
    sendEvent(faceTrackingHandler, node, cfg, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 1.0 },
    });
    sendEvent(faceTrackingHandler, node, cfg, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.0 },
    });
    const s = (node as any).__faceTrackingState;
    const smoothed = s.smoothedShapes.get('jawOpen');
    expect(smoothed).toBeGreaterThan(0);
    expect(smoothed).toBeLessThan(1);
  });

  it('lip sync detects phoneme AA for high jawOpen', () => {
    sendEvent(faceTrackingHandler, node, cfg, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.9 },
    });
    expect(getEventCount(ctx, 'lip_sync_phoneme')).toBe(1);
  });

  it('eye tracking data forwarded', () => {
    sendEvent(faceTrackingHandler, node, cfg, ctx, {
      type: 'face_data_update',
      blendShapes: {},
      eyes: {
        left: { direction: [0, 0, -1 ], origin: [0, 0, 0 ], confidence: 0.9 },
        right: { direction: [0, 0, -1 ], origin: [0, 0, 0 ], confidence: 0.9 },
      },
    });
    const s = (node as any).__faceTrackingState;
    expect(s.leftEye).not.toBeNull();
    expect(s.rightEye).not.toBeNull();
  });

  it('head pose stored', () => {
    sendEvent(faceTrackingHandler, node, cfg, ctx, {
      type: 'face_data_update',
      blendShapes: {},
      headPose: { position: [0, 1.7, 0], rotation: [0, 0, 0, 1 ] },
    });
    expect((node as any).__faceTrackingState.headPose).not.toBeNull();
  });

  it('update emits avatar_blend_shapes when tracking', () => {
    sendEvent(faceTrackingHandler, node, cfg, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.5 },
    });
    updateTrait(faceTrackingHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'avatar_blend_shapes')).toBe(1);
  });

  it('face_tracking_lost deactivates tracking', () => {
    sendEvent(faceTrackingHandler, node, cfg, ctx, {
      type: 'face_data_update',
      blendShapes: { jawOpen: 0.5 },
    });
    sendEvent(faceTrackingHandler, node, cfg, ctx, { type: 'face_tracking_lost' });
    expect((node as any).__faceTrackingState.isTracking).toBe(false);
    expect(getEventCount(ctx, 'face_tracking_lost')).toBe(1);
  });

  it('detach cleans up', () => {
    faceTrackingHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__faceTrackingState).toBeUndefined();
    expect(getEventCount(ctx, 'face_tracking_stop')).toBe(1);
  });
});
