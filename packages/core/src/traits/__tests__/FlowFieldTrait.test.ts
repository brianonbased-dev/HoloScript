import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait, updateTrait } from './traitTestHelpers';

// Mock NavigationEngine
const mockSampleDirection = vi.fn().mockReturnValue([1, 0, 0]);
vi.mock('@holoscript/engine/runtime/NavigationEngine', () => ({
  getNavigationEngine: vi.fn(() => ({
    sampleDirection: mockSampleDirection,
  })),
}));

import { flowFieldHandler } from '../FlowFieldTrait';

describe('FlowFieldTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    destinationId: 'target1',
    speed: 3.0,
    steeringWeight: 0.8,
    stopDistance: 0.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('flowNode');
    (node as any).properties = { position: [0, 0, 0] };
    ctx = createMockContext();
    attachTrait(flowFieldHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const s = (node as any).__flowFieldState;
    expect(s).toBeDefined();
    expect(s.currentDirection).toEqual([0, 0, 0]);
    expect(s.isMoving).toBe(false);
  });

  it('cleans up state on detach', () => {
    flowFieldHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__flowFieldState).toBeUndefined();
  });

  it('updates position on update when engine returns direction', () => {
    mockSampleDirection.mockReturnValue([1, 0, 0]);
    updateTrait(flowFieldHandler, node, cfg, ctx, 0.016);
    const pos = (node as any).properties.position;
    expect(pos[0]).toBeGreaterThan(0);
  });

  it('applies steering weight to blend directions', () => {
    // First update: direction becomes blend of [0,0,0] and [1,0,0]
    mockSampleDirection.mockReturnValue([1, 0, 0]);
    updateTrait(flowFieldHandler, node, cfg, ctx, 0.016);
    const s = (node as any).__flowFieldState;
    // With 0.8 weight, direction should be 0.8 * 1 = 0.8 (since initial is 0)
    expect(s.currentDirection[0]).toBeCloseTo(0.8, 1);
  });

  it('sets isMoving to true when moving', () => {
    mockSampleDirection.mockReturnValue([1, 0, 0]);
    updateTrait(flowFieldHandler, node, cfg, ctx, 0.016);
    expect((node as any).__flowFieldState.isMoving).toBe(true);
  });

  it('does nothing without destinationId', () => {
    const emptyCfg = { ...cfg, destinationId: '' };
    const startPos = [...((node as any).properties.position as number[])];
    updateTrait(flowFieldHandler, node, emptyCfg, ctx, 0.016);
    expect((node as any).properties.position).toEqual(startPos);
  });

  it('updates rotation to face movement direction', () => {
    mockSampleDirection.mockReturnValue([1, 0, 0]);
    updateTrait(flowFieldHandler, node, cfg, ctx, 0.016);
    expect((node as any).properties.rotation).toBeDefined();
    expect((node as any).properties.rotation[1]).not.toBe(0);
  });

  it('does not move when engine returns zero direction', () => {
    mockSampleDirection.mockReturnValue([0, 0, 0]);
    updateTrait(flowFieldHandler, node, cfg, ctx, 0.016);
    expect((node as any).__flowFieldState.isMoving).toBe(false);
  });
});
