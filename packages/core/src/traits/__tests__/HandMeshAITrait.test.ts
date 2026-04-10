import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockNode,
  createMockContext,
  attachTrait,
  updateTrait,
  sendEvent,
} from './traitTestHelpers';

// Mock HandTrackingTrait base
vi.mock('../HandTrackingTrait', () => ({
  handTrackingHandler: {
    name: 'hand_tracking',
    defaultConfig: {
      hand_model: 'mediapipe_hands',
      joint_count: 21,
      bimanual_tracking: false,
    },
    onAttach: vi.fn((node: any) => {
      (node as any).__handTrackingState = {
        left: { visible: true, joints: {} },
        right: { visible: false, joints: {} },
      };
    }),
    onDetach: vi.fn((node: any) => {
      delete (node as any).__handTrackingState;
    }),
    onUpdate: vi.fn(),
    onEvent: vi.fn(),
  },
}));

import { handMeshAIHandler } from '../HandMeshAITrait';

describe('HandMeshAITrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    hand_model: 'mediapipe_hands' as const,
    joint_count: 21 as const,
    bimanual_tracking: false,
    mesh_resolution: 'medium' as const,
    texture_enabled: false,
    vertex_count: 256,
    real_time_generation: true,
    gesture_detection: false,
    inference_fps: 30,
    temporal_smoothing: 0.3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('handAI');
    ctx = createMockContext();
    attachTrait(handMeshAIHandler, node, cfg, ctx);
  });

  it('initializes mesh state on attach', () => {
    const s = (node as any).__handMeshState;
    expect(s).toBeDefined();
    expect(s.left_mesh).toBeNull();
    expect(s.right_mesh).toBeNull();
    expect(s.is_generating).toBe(false);
  });

  it('also initializes hand tracking state from base', () => {
    expect((node as any).__handTrackingState).toBeDefined();
  });

  it('emits hand_mesh_ai_init on attach', () => {
    const initEvents = ctx.emittedEvents.filter((e) => e.event === 'hand_mesh_ai_init');
    expect(initEvents.length).toBe(1);
  });

  it('cleans up mesh state on detach', () => {
    handMeshAIHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__handMeshState).toBeUndefined();
  });

  it('emits hand_mesh_generate when left hand visible on update', () => {
    // Force enough time to trigger generation
    (node as any).__handMeshState.last_update_time = 0;
    updateTrait(handMeshAIHandler, node, cfg, ctx, 0.016);
    const genEvents = ctx.emittedEvents.filter((e) => e.event === 'hand_mesh_generate');
    expect(genEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('stores mesh result from hand_mesh_result event', () => {
    const mesh = {
      vertices: new Float32Array(12),
      normals: new Float32Array(12),
      indices: new Uint16Array(6),
    };
    sendEvent(handMeshAIHandler, node, cfg, ctx, {
      type: 'hand_mesh_result',
      hand: 'left',
      mesh,
    });
    const s = (node as any).__handMeshState;
    expect(s.left_mesh).toBe(mesh);
    expect(s.is_generating).toBe(false);
  });

  it('emits on_hand_mesh_updated after storing mesh', () => {
    sendEvent(handMeshAIHandler, node, cfg, ctx, {
      type: 'hand_mesh_result',
      hand: 'right',
      mesh: {
        vertices: new Float32Array(12),
        normals: new Float32Array(12),
        indices: new Uint16Array(6),
      },
    });
    const updateEvents = ctx.emittedEvents.filter((e) => e.event === 'on_hand_mesh_updated');
    expect(updateEvents.length).toBe(1);
  });

  it('has correct handler name', () => {
    expect(handMeshAIHandler.name).toBe('hand_mesh_ai');
  });

  it('has correct default config', () => {
    expect((handMeshAIHandler.defaultConfig as any).mesh_resolution).toBe('medium');
    expect((handMeshAIHandler.defaultConfig as any).real_time_generation).toBe(true);
  });
});
