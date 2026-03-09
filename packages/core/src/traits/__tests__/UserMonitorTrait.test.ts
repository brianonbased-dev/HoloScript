import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockNode,
  createMockContext,
  attachTrait,
  updateTrait,
  sendEvent,
} from './traitTestHelpers';

// Mock EmotionDetector
const mockInfer = vi.fn().mockReturnValue({
  frustration: 0.3,
  confusion: 0.2,
  engagement: 0.8,
});
vi.mock('../../runtime/EmotionDetector', () => ({
  getEmotionDetector: vi.fn(() => ({
    infer: mockInfer,
  })),
}));

import { userMonitorHandler } from '../UserMonitorTrait';

describe('UserMonitorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: any;
  const cfg = {
    updateRate: 0.2,
    jitterSensitivity: 0.5,
    adaptiveAssistance: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('monitor');
    (node as any).properties = {};
    ctx = {
      ...createMockContext(),
      vr: {
        headset: { position: [0, 1.7, 0] },
        getDominantHand: () => ({ position: [0.3, 1.2, 0.4] }),
      },
    };
    attachTrait(userMonitorHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const s = (node as any).__userMonitorState;
    expect(s).toBeDefined();
    expect(s.frustration).toBe(0);
    expect(s.confusion).toBe(0);
    expect(s.engagement).toBe(0);
    expect(s.headPositions).toEqual([]);
    expect(s.handPositions).toEqual([]);
  });

  it('cleans up on detach', () => {
    userMonitorHandler.onDetach?.(node as any, cfg as any, ctx);
    expect((node as any).__userMonitorState).toBeUndefined();
  });

  it('collects head positions on update', () => {
    updateTrait(userMonitorHandler, node, cfg, ctx, 0.016);
    const s = (node as any).__userMonitorState;
    expect(s.headPositions.length).toBe(1);
  });

  it('collects hand positions on update', () => {
    updateTrait(userMonitorHandler, node, cfg, ctx, 0.016);
    const s = (node as any).__userMonitorState;
    expect(s.handPositions.length).toBe(1);
  });

  it('caps position buffer at 30', () => {
    for (let i = 0; i < 35; i++) {
      updateTrait(userMonitorHandler, node, cfg, ctx, 0.001);
    }
    const s = (node as any).__userMonitorState;
    expect(s.headPositions.length).toBeLessThanOrEqual(30);
  });

  it('tracks clicks in onEvent', () => {
    sendEvent(userMonitorHandler, node, cfg, ctx, { type: 'click' });
    const s = (node as any).__userMonitorState;
    expect(s.lastClickTime).toBeGreaterThan(0);
  });

  it('increments click count for rapid clicks', () => {
    sendEvent(userMonitorHandler, node, cfg, ctx, { type: 'click' });
    sendEvent(userMonitorHandler, node, cfg, ctx, { type: 'click' });
    const s = (node as any).__userMonitorState;
    expect(s.clickCount).toBeGreaterThanOrEqual(1);
  });

  it('has correct handler name', () => {
    expect(userMonitorHandler.name).toBe('user_monitor');
  });
});
