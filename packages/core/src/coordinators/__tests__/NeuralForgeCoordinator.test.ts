/**
 * NeuralForgeCoordinator — fifth consumer-bus closing Pattern E for the
 * neural_forge trait (task_1777423899630_nsna). Tests use a MockEventSource
 * that mirrors how TraitContextFactory.on/.emit work in production.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  NeuralForgeCoordinator,
  type NeuralForgeEventSource,
  type NeuralNodeState,
} from '../NeuralForgeCoordinator';

class MockEventSource implements NeuralForgeEventSource {
  private handlers = new Map<string, Array<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  fire(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }

  get subscriberCount(): number {
    return this.handlers.size;
  }
}

describe('NeuralForgeCoordinator — Pattern E remediation for neural_forge trait', () => {
  let source: MockEventSource;
  let coord: NeuralForgeCoordinator;

  beforeEach(() => {
    source = new MockEventSource();
    coord = new NeuralForgeCoordinator(source);
  });

  it('subscribes to the full neural-forge event vocabulary on construction', () => {
    // 5 events: connected, request, timeout, shard_created, cognition_evolved
    expect(source.subscriberCount).toBe(coord.subscribedEventCount);
    expect(coord.subscribedEventCount).toBe(5);
  });

  it('starts with empty state', () => {
    expect(coord.getAllStates()).toEqual([]);
    expect(coord.getStats().anyConnected).toBe(false);
  });

  // ---- CONNECTED --------------------------------------------------------

  describe('neural_forge_connected', () => {
    it('registers a new node in connected state', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      const state = coord.getNodeState('npc-1');
      expect(state?.status).toBe('connected');
      expect(state?.nodeId).toBe('npc-1');
      expect(state?.shardCount).toBe(0);
      expect(coord.isConnected('npc-1')).toBe(true);
    });

    it('preserves existing state on reconnect', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 'shard-1' } });
      // Reconnect should preserve shard count
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      expect(coord.getNodeState('npc-1')?.shardCount).toBe(1);
    });
  });

  // ---- SYNTHESIS REQUEST (external mode) --------------------------------

  describe('neural_synthesis_request', () => {
    it('tracks external-mode request as synthesizing', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_synthesis_request', {
        node: { id: 'npc-1' },
        mode: 'external',
        experiences: ['e1', 'e2', 'e3'],
        currentWeights: { openness: 0.6 },
      });
      const state = coord.getNodeState('npc-1');
      expect(state?.status).toBe('synthesizing');
      expect(state?.pendingExternalSynthesis).toBe(true);
      expect(state?.pendingSince).toBeTypeOf('number');
      expect(state?.experienceLogLength).toBe(3);
      expect(state?.weights.openness).toBe(0.6);
    });

    it('tracks mock-mode request without synthesizing status', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-2' } });
      source.fire('neural_synthesis_request', {
        node: { id: 'npc-2' },
        mode: 'mock',
        experiences: ['e1'],
        currentWeights: {},
      });
      const state = coord.getNodeState('npc-2');
      expect(state?.pendingExternalSynthesis).toBe(false);
      // Mock mode doesn't change status to synthesizing
      expect(state?.status).toBe('connected');
    });
  });

  // ---- SYNTHESIS TIMEOUT -----------------------------------------------

  describe('neural_synthesis_timeout', () => {
    it('marks node as timeout_fallback and clears pending state', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_synthesis_request', {
        node: { id: 'npc-1' },
        mode: 'external',
        experiences: ['e1', 'e2'],
        currentWeights: {},
      });
      source.fire('neural_synthesis_timeout', {
        node: { id: 'npc-1' },
        pendingSince: Date.now() - 30000,
        elapsedMs: 30000,
        experienceCount: 2,
      });
      const state = coord.getNodeState('npc-1');
      expect(state?.status).toBe('timeout_fallback');
      expect(state?.pendingExternalSynthesis).toBe(false);
      expect(state?.pendingSince).toBeNull();
      expect(state?.experienceLogLength).toBe(2);
    });
  });

  // ---- SHARD CREATED ----------------------------------------------------

  describe('neural_shard_created', () => {
    it('increments shard count and updates lastSynthesisAt', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_shard_created', {
        node: { id: 'npc-1' },
        shard: { id: 'shard-1', type: 'memory' },
      });
      const state = coord.getNodeState('npc-1');
      expect(state?.shardCount).toBe(1);
      expect(state?.lastSynthesisAt).toBeTypeOf('number');
    });

    it('accumulates shards across multiple events', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's1' } });
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's2' } });
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's3' } });
      expect(coord.getNodeState('npc-1')?.shardCount).toBe(3);
    });
  });

  // ---- COGNITION EVOLVED -----------------------------------------------

  describe('neural_cognition_evolved', () => {
    it('updates weights on existing node', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_cognition_evolved', {
        node: { id: 'npc-1' },
        currentWeights: { openness: 0.7, conscientiousness: 0.4 },
      });
      const state = coord.getNodeState('npc-1');
      expect(state?.weights.openness).toBe(0.7);
      expect(state?.weights.conscientiousness).toBe(0.4);
    });

    it('creates synthetic node entry if cognition_evolved fires before connected', () => {
      source.fire('neural_cognition_evolved', {
        node: { id: 'npc-3' },
        currentWeights: { openness: 0.5 },
      });
      const state = coord.getNodeState('npc-3');
      expect(state?.nodeId).toBe('npc-3');
      expect(state?.weights.openness).toBe(0.5);
      // Not formally connected — isConnected tracks explicit connected event
      expect(coord.isConnected('npc-3')).toBe(false);
    });
  });

  // ---- DEFENSIVE --------------------------------------------------------

  describe('defensive', () => {
    it('ignores events without a resolvable nodeId', () => {
      source.fire('neural_shard_created', { shard: { id: 's1' } }); // no node
      source.fire('neural_cognition_evolved', { currentWeights: {} }); // no node
      expect(coord.getAllStates()).toEqual([]);
    });

    it('handles null/undefined payload gracefully', () => {
      source.fire('neural_forge_connected', null);
      source.fire('neural_synthesis_request', undefined);
      expect(coord.getAllStates()).toEqual([]);
    });
  });

  // ---- SUBSCRIBE + BUS DISCIPLINE ---------------------------------------

  describe('subscribe + bus discipline', () => {
    it('subscribers receive every state change', () => {
      const seen: NeuralNodeState[] = [];
      coord.subscribe((s) => seen.push(s));
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's1' } });
      expect(seen).toHaveLength(2);
      expect(seen[0].status).toBe('connected');
      expect(seen[1].shardCount).toBe(1);
    });

    it('unsubscribe stops further deliveries', () => {
      const seen: NeuralNodeState[] = [];
      const unsub = coord.subscribe((s) => seen.push(s));
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      unsub();
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's1' } });
      expect(seen).toHaveLength(1);
    });

    it('a thrown listener never crashes other listeners', () => {
      const seen: NeuralNodeState[] = [];
      coord.subscribe(() => {
        throw new Error('boom');
      });
      coord.subscribe((s) => seen.push(s));
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      expect(seen).toHaveLength(1);
    });
  });

  // ---- STATS + RESET ----------------------------------------------------

  describe('stats + reset', () => {
    it('getStats aggregates across nodes', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_forge_connected', { node: { id: 'npc-2' } });
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's1' } });
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's2' } });
      source.fire('neural_shard_created', { node: { id: 'npc-2' }, shard: { id: 's3' } });

      const stats = coord.getStats();
      expect(stats.total).toBe(2);
      expect(stats.totalShards).toBe(3);
      expect(stats.anyConnected).toBe(true);
      expect(stats.synthesizing).toBe(0);
      expect(stats.timeoutFallback).toBe(0);
    });

    it('tracks synthesizing and timeout_fallback counts', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_synthesis_request', {
        node: { id: 'npc-1' },
        mode: 'external',
        experiences: [],
        currentWeights: {},
      });
      source.fire('neural_forge_connected', { node: { id: 'npc-2' } });
      source.fire('neural_synthesis_timeout', {
        node: { id: 'npc-2' },
        pendingSince: Date.now() - 30000,
        elapsedMs: 30000,
        experienceCount: 5,
      });

      const stats = coord.getStats();
      expect(stats.synthesizing).toBe(1);
      expect(stats.timeoutFallback).toBe(1);
    });

    it('reset clears all state', () => {
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's1' } });
      coord.reset();
      expect(coord.getAllStates()).toEqual([]);
      expect(coord.isConnected('npc-1')).toBe(false);
      expect(coord.getStats().anyConnected).toBe(false);
    });
  });

  // ---- FULL LIFECYCLE ---------------------------------------------------

  describe('full lifecycle: connected → request → absorb → evolve', () => {
    it('tracks a complete mock-mode synthesis cycle', () => {
      const seen: NeuralNodeState[] = [];
      coord.subscribe((s) => seen.push(s));

      // 1. Connect
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });
      expect(coord.getNodeState('npc-1')?.status).toBe('connected');

      // 2. Mock synthesis: shard_created + cognition_evolved (no request in mock mode)
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 's1' } });
      source.fire('neural_cognition_evolved', {
        node: { id: 'npc-1' },
        currentWeights: { openness: 0.6 },
      });

      const finalState = coord.getNodeState('npc-1');
      expect(finalState?.shardCount).toBe(1);
      expect(finalState?.weights.openness).toBe(0.6);
      expect(finalState?.lastSynthesisAt).toBeTypeOf('number');
      // 4 state changes: connected, shard_created, cognition_evolved
      expect(seen).toHaveLength(3);
    });

    it('tracks a complete external-mode cycle with timeout fallback', () => {
      const seen: NeuralNodeState[] = [];
      coord.subscribe((s) => seen.push(s));

      // 1. Connect
      source.fire('neural_forge_connected', { node: { id: 'npc-1' } });

      // 2. External synthesis request
      source.fire('neural_synthesis_request', {
        node: { id: 'npc-1' },
        mode: 'external',
        experiences: ['e1', 'e2'],
        currentWeights: { openness: 0.5 },
      });
      expect(coord.getNodeState('npc-1')?.status).toBe('synthesizing');
      expect(coord.getNodeState('npc-1')?.pendingExternalSynthesis).toBe(true);

      // 3. Timeout (no absorb_shard arrived)
      source.fire('neural_synthesis_timeout', {
        node: { id: 'npc-1' },
        pendingSince: Date.now() - 30000,
        elapsedMs: 30000,
        experienceCount: 2,
      });
      expect(coord.getNodeState('npc-1')?.status).toBe('timeout_fallback');
      expect(coord.getNodeState('npc-1')?.pendingExternalSynthesis).toBe(false);

      // 4. Fallback shard created
      source.fire('neural_shard_created', { node: { id: 'npc-1' }, shard: { id: 'shard_timeout_1' } });
      expect(coord.getNodeState('npc-1')?.shardCount).toBe(1);

      // 5. Cognition evolved
      source.fire('neural_cognition_evolved', {
        node: { id: 'npc-1' },
        currentWeights: { openness: 0.55 },
      });
      expect(coord.getNodeState('npc-1')?.weights.openness).toBe(0.55);

      // State changes: connected, request, timeout, shard_created, cognition_evolved = 5
      expect(seen).toHaveLength(5);
    });
  });
});