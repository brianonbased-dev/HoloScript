import { describe, it, expect, beforeEach, vi } from 'vitest';
import { userMonitorHandler } from '../traits/UserMonitorTrait';
import { registerEmotionDetector, type EmotionDetector } from '@holoscript/engine/runtime/EmotionDetector';
import { HSPlusNode } from '../types/HoloScriptPlus';

describe('UserMonitorTrait - Frustration Detection', () => {
  let mockDetector: EmotionDetector;
  let node: HSPlusNode;
  let mockContext: any;

  beforeEach(() => {
    mockDetector = {
      initialize: vi.fn(),
      infer: vi.fn().mockReturnValue({
        frustration: 0.1,
        confusion: 0.0,
        engagement: 0.9,
        primaryState: 'neutral',
      }),
      dispose: vi.fn(),
    };
    registerEmotionDetector('default', mockDetector);

    node = {
      id: 'player_monitor',
      name: 'Player',
      type: 'object',
      traits: new Map([['user_monitor', {}]]),
      properties: {},
      children: [],
    } as any as HSPlusNode;

    mockContext = {
      vr: {
        headset: { position: [0, 0, 0], rotation: [0, 0, 0] },
        getDominantHand: () => ({ position: [0, 0, 0], rotation: [0, 0, 0] }),
      },
    };
  });

  it('should initialize state on attach', () => {
    userMonitorHandler.onAttach!(node, userMonitorHandler.defaultConfig as any, mockContext);
    expect((node as any).__userMonitorState).toBeDefined();
    expect((node as any).__userMonitorState.headPositions).toHaveLength(0);
  });

  it('should accumulate tracking positions over update calls', () => {
    userMonitorHandler.onAttach!(node, userMonitorHandler.defaultConfig as any, mockContext);

    // Call update 5 times with moving head
    for (let i = 0; i < 5; i++) {
      mockContext.vr.headset.position = [0, i * 0.01, 0];
      userMonitorHandler.onUpdate!(
        node,
        userMonitorHandler.defaultConfig as any,
        mockContext,
        0.016
      );
    }

    const state = (node as any).__userMonitorState;
    expect(state.headPositions).toHaveLength(5);
    expect(state.headPositions[4][1]).toBe(0.04);
  });

  it('should trigger inference at specified updateRate', () => {
    userMonitorHandler.onAttach!(node, { updateRate: 0.1 } as any, mockContext);

    // 0.05s update - should not trigger
    userMonitorHandler.onUpdate!(node, { updateRate: 0.1 } as any, mockContext, 0.05);
    expect(mockDetector.infer).not.toHaveBeenCalled();

    // Another 0.06s update - total 0.11s, should trigger
    userMonitorHandler.onUpdate!(node, { updateRate: 0.1 } as any, mockContext, 0.06);
    expect(mockDetector.infer).toHaveBeenCalled();
  });

  it('should detect instability (jitter) during inference', () => {
    userMonitorHandler.onAttach!(node, { updateRate: 0.1 } as any, mockContext);

    // High jitter movement: 10cm jump every frame
    for (let i = 0; i < 10; i++) {
      mockContext.vr.headset.position = [0, i % 2 === 0 ? 0 : 0.1, 0];
      userMonitorHandler.onUpdate!(node, { updateRate: 0.1 } as any, mockContext, 0.1);
    }

    expect(mockDetector.infer).toHaveBeenCalledWith(
      expect.objectContaining({
        headStability: 0, // Should be low/zero for 10cm jumps
      })
    );
  });

  it('should track rapid clicking as interaction intensity', () => {
    userMonitorHandler.onAttach!(node, { updateRate: 0.1 } as any, mockContext);

    // Simulate 5 rapid clicks
    for (let i = 0; i < 5; i++) {
      userMonitorHandler.onEvent!(node, {} as any, mockContext, { type: 'click' } as any);
    }

    // Trigger inference
    userMonitorHandler.onUpdate!(node, { updateRate: 0.1 } as any, mockContext, 0.2);

    expect(mockDetector.infer).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionIntensity: 0.4, // 5 clicks -> 4 rapid intervals / 10 limit
      })
    );
  });
});

