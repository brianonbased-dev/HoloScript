import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flowFieldHandler } from '../traits/FlowFieldTrait';
import {
  registerNavigationEngine,
  type NavigationEngine,
} from '@holoscript/engine/runtime/NavigationEngine';
import { HSPlusNode } from '../types/HoloScriptPlus';

describe('FlowFieldTrait - NPC Pathfinding', () => {
  let mockEngine: NavigationEngine;
  let node: HSPlusNode;

  beforeEach(() => {
    mockEngine = {
      initialize: vi.fn(),
      updateFlowField: vi.fn(),
      sampleDirection: vi.fn().mockReturnValue([1, 0, 0]), // Always steer right
      updateObstacle: vi.fn(),
      dispose: vi.fn(),
    };
    registerNavigationEngine('default', mockEngine);

    node = {
      id: 'npc_1',
      name: 'npc_1',
      type: 'object',
      traits: new Map([['flow_field', { destinationId: 'target_1' }]]),
      properties: {
        position: [0, 0, 0],
      },
      children: [],
    } as any as HSPlusNode;
  });

  it('should initialize state on attach', () => {
    flowFieldHandler.onAttach!(node, flowFieldHandler.defaultConfig as any, {} as any);
    expect((node as any).__flowFieldState).toBeDefined();
    expect((node as any).__flowFieldState.isMoving).toBe(false);
  });

  it('should sample direction and update position on update', () => {
    flowFieldHandler.onAttach!(node, flowFieldHandler.defaultConfig as any, {} as any);

    // Mock delta of 1.0 for simplicity
    flowFieldHandler.onUpdate!(
      node,
      {
        destinationId: 'target_1',
        speed: 10,
        steeringWeight: 1,
      } as any,
      {} as any,
      1.0
    );

    expect(mockEngine.sampleDirection).toHaveBeenCalledWith('target_1', [0, 0, 0]);

    // Position should have moved from [0,0,0] to [10,0,0] because sampleDirection returned [1,0,0]
    const pos = node.properties.position as number[];
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBe(0);
    expect(pos[2]).toBe(0);
  });

  it('should handle missing navigation engine gracefully', () => {
    registerNavigationEngine('default', null as any); // Remove engine

    flowFieldHandler.onAttach!(node, flowFieldHandler.defaultConfig as any, {} as any);
    const initialPos = [...(node.properties.position as number[])];

    flowFieldHandler.onUpdate!(node, { destinationId: 'target_1' } as any, {} as any, 1.0);

    // Position should not have changed
    expect(node.properties.position).toEqual(initialPos);
  });
});
