/**
 * NetworkedTraitHandler Research Implementation Tests
 *
 * Tests for:
 * - P.NET.01: syncTier auto-configures mode, frequency, and delivery
 * - P.NET.03: Priority accumulator for proximity-weighted sync rates
 * - W.NET.05: Separate agent_state event for AI agent sync
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { networkedHandler } from '../NetworkedTraitHandler';
import { SYNC_TIER_RATES } from '@holoscript/mesh/network/NetworkTypes';

// =============================================================================
// MOCK HELPERS
// =============================================================================

function createMockNode(id: string, position?: [number, number, number]): any {
  return {
    id,
    properties: {
      position: position ?? [0, 0, 0],
      rotation: [0, 0, 0],
    },
  };
}

function createMockContext(): any {
  return {
    emit: vi.fn(),
    getState: vi.fn().mockReturnValue({}),
    setState: vi.fn(),
  };
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

describe('networkedHandler defaultConfig', () => {
  it('has syncTier defaulting to movement', () => {
    expect(networkedHandler.defaultConfig.syncTier).toBe('movement');
  });

  it('has isAgent defaulting to false', () => {
    expect(networkedHandler.defaultConfig.isAgent).toBe(false);
  });

  it('has syncRate defaulting to 20', () => {
    expect(networkedHandler.defaultConfig.syncRate).toBe(20);
  });

  it('has mode defaulting to owner', () => {
    expect(networkedHandler.defaultConfig.mode).toBe('owner');
  });

  it('has interpolation enabled by default', () => {
    expect(networkedHandler.defaultConfig.interpolation).toBe(true);
  });
});

// =============================================================================
// SYNC TIER AUTO-CONFIG (P.NET.01)
// =============================================================================

describe('SYNC_TIER_RATES (P.NET.01)', () => {
  it('physics tier runs at 60 Hz', () => {
    expect(SYNC_TIER_RATES['physics']).toBe(60);
  });

  it('movement tier runs at 20 Hz', () => {
    expect(SYNC_TIER_RATES['movement']).toBe(20);
  });

  it('ai_agent tier runs at 5 Hz', () => {
    expect(SYNC_TIER_RATES['ai_agent']).toBe(5);
  });

  it('cosmetic tier runs at 1 Hz', () => {
    expect(SYNC_TIER_RATES['cosmetic']).toBe(1);
  });

  it('physics > movement > ai_agent > cosmetic rates', () => {
    expect(SYNC_TIER_RATES.physics).toBeGreaterThan(SYNC_TIER_RATES.movement);
    expect(SYNC_TIER_RATES.movement).toBeGreaterThan(SYNC_TIER_RATES.ai_agent);
    expect(SYNC_TIER_RATES.ai_agent).toBeGreaterThan(SYNC_TIER_RATES.cosmetic);
  });
});

// =============================================================================
// onAttach / onDetach LIFECYCLE
// =============================================================================

describe('networkedHandler onAttach', () => {
  it('emits networked:register with config', () => {
    const node = createMockNode('player_1');
    const ctx = createMockContext();

    networkedHandler.onAttach(node, networkedHandler.defaultConfig, ctx);

    expect(ctx.emit).toHaveBeenCalledWith(
      'networked:register',
      expect.objectContaining({
        nodeId: 'player_1',
        config: expect.objectContaining({
          mode: 'owner',
          syncRate: 20,
        }),
      })
    );
  });

  it('stores network metadata via setState', () => {
    const node = createMockNode('player_2');
    const ctx = createMockContext();

    networkedHandler.onAttach(node, networkedHandler.defaultConfig, ctx);

    expect(ctx.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        __networked: true,
        __networkMode: 'owner',
      })
    );
  });
});

describe('networkedHandler onDetach', () => {
  it('emits networked:unregister and clears state', () => {
    const node = createMockNode('player_3');
    const ctx = createMockContext();

    networkedHandler.onAttach(node, networkedHandler.defaultConfig, ctx);
    networkedHandler.onDetach!(node, networkedHandler.defaultConfig, ctx);

    expect(ctx.emit).toHaveBeenCalledWith(
      'networked:unregister',
      expect.objectContaining({
        nodeId: 'player_3',
      })
    );
    expect(ctx.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        __networked: false,
        __networkMode: null,
      })
    );
  });
});

// =============================================================================
// AGENT STATE EVENT (W.NET.05)
// =============================================================================

describe('networkedHandler agent_state event (W.NET.05)', () => {
  it('accepts isAgent config for AI entities', () => {
    const agentConfig = {
      ...networkedHandler.defaultConfig,
      isAgent: true,
      syncTier: 'ai_agent' as const,
    };
    const node = createMockNode('agent_1');
    const ctx = createMockContext();

    networkedHandler.onAttach(node, agentConfig, ctx);

    // Registration should succeed with agent config
    expect(ctx.emit).toHaveBeenCalledWith(
      'networked:register',
      expect.objectContaining({
        nodeId: 'agent_1',
      })
    );
  });

  it('handles networked:agent_state event', () => {
    const node = createMockNode('agent_2');
    const ctx = createMockContext();
    const agentConfig = { ...networkedHandler.defaultConfig, isAgent: true };

    networkedHandler.onAttach(node, agentConfig, ctx);

    // Sending an agent_state event should not throw
    expect(() => {
      networkedHandler.onEvent!(node, agentConfig, ctx, {
        type: 'networked:agent_state',
        data: { position: [1, 2, 3], rotation: [0, 0, 0], properties: {} },
      });
    }).not.toThrow();
  });
});
