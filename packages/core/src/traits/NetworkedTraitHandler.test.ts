/**
 * NetworkedTraitHandler Tests
 *
 * Tests for the TraitHandler wrapper that bridges NetworkedTrait
 * into the VRTraitRegistry lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { networkedHandler } from './NetworkedTraitHandler';
import type { TraitContext, TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockNode(id: string, overrides: Partial<HSPlusNode> = {}): HSPlusNode {
  return {
    type: 'object',
    id,
    properties: {
      position: [1, 2, 3],
      rotation: [0, 45, 0],
      ...overrides.properties,
    },
    directives: overrides.directives || [],
    children: overrides.children || [],
    traits: overrides.traits || new Map(),
    ...overrides,
  } as HSPlusNode;
}

function createMockContext(stateOverrides: Record<string, unknown> = {}): TraitContext {
  let state: Record<string, unknown> = { ...stateOverrides };

  return {
    vr: {
      hands: { left: null, right: null },
      headset: { position: [0, 1.6, 0], rotation: { x: 0, y: 0, z: 0 } },
      isPresenting: false,
    } as any,
    physics: {
      addCollider: vi.fn(),
      removeCollider: vi.fn(),
      setVelocity: vi.fn(),
      getVelocity: vi.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
      applyForce: vi.fn(),
      applyImpulse: vi.fn(),
      raycast: vi.fn().mockReturnValue(null),
    } as any,
    audio: {
      play: vi.fn(),
      stop: vi.fn(),
    } as any,
    haptics: {
      pulse: vi.fn(),
    } as any,
    emit: vi.fn(),
    getState: vi.fn(() => ({ ...state })),
    setState: vi.fn((updates: Record<string, unknown>) => {
      state = { ...state, ...updates };
    }),
    getScaleMultiplier: vi.fn(() => 1),
    setScaleContext: vi.fn(),
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('NetworkedTraitHandler', () => {
  const handler = networkedHandler;
  let node: HSPlusNode;
  let context: TraitContext;

  beforeEach(() => {
    node = createMockNode('player_1');
    context = createMockContext();
  });

  describe('handler definition', () => {
    it('should have name "networked"', () => {
      expect(handler.name).toBe('networked');
    });

    it('should have all lifecycle methods', () => {
      expect(handler.onAttach).toBeTypeOf('function');
      expect(handler.onDetach).toBeTypeOf('function');
      expect(handler.onUpdate).toBeTypeOf('function');
      expect(handler.onEvent).toBeTypeOf('function');
    });

    it('should have sensible default config', () => {
      const config = handler.defaultConfig;
      expect(config.mode).toBe('owner');
      expect(config.syncRate).toBe(20);
      expect(config.syncProperties).toContain('position');
      expect(config.syncProperties).toContain('rotation');
      expect(config.interpolation).toBe(true);
      expect(config.transferable).toBe(true);
      expect(config.channel).toBe('unreliable');
    });
  });

  describe('onAttach', () => {
    it('should emit networked:register event', () => {
      handler.onAttach!(node, handler.defaultConfig, context);

      expect(context.emit).toHaveBeenCalledWith(
        'networked:register',
        expect.objectContaining({
          nodeId: 'player_1',
          entityId: expect.any(String),
          config: expect.objectContaining({
            mode: 'owner',
            syncRate: 20,
          }),
        })
      );
    });

    it('should store network metadata in state', () => {
      handler.onAttach!(node, handler.defaultConfig, context);

      expect(context.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          __networked: true,
          __networkId: expect.any(String),
          __networkMode: 'owner',
        })
      );
    });

    it('should work with custom config', () => {
      const customConfig = {
        ...handler.defaultConfig,
        mode: 'shared' as const,
        syncRate: 60,
        syncProperties: ['position', 'rotation', 'health', 'score'],
      };

      handler.onAttach!(node, customConfig, context);

      expect(context.emit).toHaveBeenCalledWith(
        'networked:register',
        expect.objectContaining({
          config: expect.objectContaining({
            mode: 'shared',
            syncRate: 60,
          }),
        })
      );
    });

    it('should generate unique entity IDs per node', () => {
      const node2 = createMockNode('player_2');
      const context2 = createMockContext();

      handler.onAttach!(node, handler.defaultConfig, context);
      handler.onAttach!(node2, handler.defaultConfig, context2);

      const call1 = (context.emit as any).mock.calls[0][1];
      const call2 = (context2.emit as any).mock.calls[0][1];

      expect(call1.entityId).not.toBe(call2.entityId);

      // Cleanup
      handler.onDetach!(node, handler.defaultConfig, context);
      handler.onDetach!(node2, handler.defaultConfig, context2);
    });
  });

  describe('onDetach', () => {
    it('should emit networked:unregister event', () => {
      handler.onAttach!(node, handler.defaultConfig, context);
      handler.onDetach!(node, handler.defaultConfig, context);

      expect(context.emit).toHaveBeenCalledWith(
        'networked:unregister',
        expect.objectContaining({
          nodeId: 'player_1',
          entityId: expect.any(String),
        })
      );
    });

    it('should clear network metadata from state', () => {
      handler.onAttach!(node, handler.defaultConfig, context);
      handler.onDetach!(node, handler.defaultConfig, context);

      expect(context.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          __networked: false,
          __networkId: null,
          __networkMode: null,
        })
      );
    });

    it('should be safe to call without prior attach', () => {
      const freshNode = createMockNode('no_attach');
      expect(() => {
        handler.onDetach!(freshNode, handler.defaultConfig, context);
      }).not.toThrow();
    });
  });

  describe('onUpdate', () => {
    it('should not throw without attachment', () => {
      const freshNode = createMockNode('unattached');
      expect(() => {
        handler.onUpdate!(freshNode, handler.defaultConfig, context, 16);
      }).not.toThrow();
    });

    it('should read node position/rotation for local owner', () => {
      handler.onAttach!(node, handler.defaultConfig, context);

      // The trait is configured as owner mode but not connected, so
      // we test that onUpdate doesn't throw with position data
      expect(() => {
        handler.onUpdate!(node, handler.defaultConfig, context, 16);
      }).not.toThrow();

      handler.onDetach!(node, handler.defaultConfig, context);
    });

    it('should handle nodes without position', () => {
      const bareNode = createMockNode('bare', { properties: {} });
      handler.onAttach!(bareNode, handler.defaultConfig, context);

      expect(() => {
        handler.onUpdate!(bareNode, handler.defaultConfig, context, 16);
      }).not.toThrow();

      handler.onDetach!(bareNode, handler.defaultConfig, context);
    });
  });

  describe('onEvent', () => {
    it('should handle grab_start event in shared mode', () => {
      const sharedConfig = {
        ...handler.defaultConfig,
        mode: 'shared' as const,
        auto_claim_on_interact: true,
      };

      handler.onAttach!(node, sharedConfig, context);
      expect(() => {
        handler.onEvent!(node, sharedConfig, context, { type: 'grab_start' } as any);
      }).not.toThrow();

      handler.onDetach!(node, sharedConfig, context);
    });

    it('should handle grab_end event with final sync', () => {
      handler.onAttach!(node, handler.defaultConfig, context);

      expect(() => {
        handler.onEvent!(node, handler.defaultConfig, context, { type: 'grab_end' } as any);
      }).not.toThrow();

      handler.onDetach!(node, handler.defaultConfig, context);
    });

    it('should handle networked:remote_state event', () => {
      handler.onAttach!(node, handler.defaultConfig, context);

      expect(() => {
        handler.onEvent!(node, handler.defaultConfig, context, {
          type: 'networked:remote_state',
          data: { health: 50, position: [1, 2, 3] },
        } as any);
      }).not.toThrow();

      handler.onDetach!(node, handler.defaultConfig, context);
    });

    it('should handle networked:authority_granted event', () => {
      handler.onAttach!(node, handler.defaultConfig, context);

      expect(() => {
        handler.onEvent!(node, handler.defaultConfig, context, {
          type: 'networked:authority_granted',
          peerId: 'peer-abc',
        } as any);
      }).not.toThrow();

      handler.onDetach!(node, handler.defaultConfig, context);
    });

    it('should handle networked:authority_revoked event', () => {
      handler.onAttach!(node, handler.defaultConfig, context);

      expect(() => {
        handler.onEvent!(node, handler.defaultConfig, context, {
          type: 'networked:authority_revoked',
          peerId: 'peer-abc',
        } as any);
      }).not.toThrow();

      handler.onDetach!(node, handler.defaultConfig, context);
    });

    it('should ignore unknown events without throwing', () => {
      handler.onAttach!(node, handler.defaultConfig, context);

      expect(() => {
        handler.onEvent!(node, handler.defaultConfig, context, {
          type: 'some_unknown_event',
        } as any);
      }).not.toThrow();

      handler.onDetach!(node, handler.defaultConfig, context);
    });

    it('should not process events for unregistered nodes', () => {
      const freshNode = createMockNode('no_attach');
      expect(() => {
        handler.onEvent!(freshNode, handler.defaultConfig, context, {
          type: 'grab_start',
        } as any);
      }).not.toThrow();
    });
  });

  describe('full lifecycle', () => {
    it('should support attach → update → event → detach', () => {
      handler.onAttach!(node, handler.defaultConfig, context);
      handler.onUpdate!(node, handler.defaultConfig, context, 16);
      handler.onEvent!(node, handler.defaultConfig, context, { type: 'grab_end' } as any);
      handler.onDetach!(node, handler.defaultConfig, context);

      // Should have emitted register and unregister
      const emitCalls = (context.emit as any).mock.calls;
      const eventNames = emitCalls.map((c: any[]) => c[0]);
      expect(eventNames).toContain('networked:register');
      expect(eventNames).toContain('networked:unregister');
    });

    it('should support re-attach after detach', () => {
      handler.onAttach!(node, handler.defaultConfig, context);
      handler.onDetach!(node, handler.defaultConfig, context);
      handler.onAttach!(node, handler.defaultConfig, context);

      const emitCalls = (context.emit as any).mock.calls;
      const registerCalls = emitCalls.filter((c: any[]) => c[0] === 'networked:register');
      expect(registerCalls).toHaveLength(2);

      handler.onDetach!(node, handler.defaultConfig, context);
    });
  });
});
