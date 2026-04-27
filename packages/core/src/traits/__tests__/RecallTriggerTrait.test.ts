import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recallTriggerHandler, type RecallTriggerConfig } from '../RecallTriggerTrait';
import type { TraitContext } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';
import type { AgentMemoryState, Memory } from '../AgentMemoryTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMemory(overrides: Partial<Memory> & { key: string; content: string }): Memory {
  return {
    key: overrides.key,
    content: overrides.content,
    tags: overrides.tags ?? [],
    embedding: overrides.embedding ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    accessedAt: overrides.accessedAt ?? Date.now(),
    accessCount: overrides.accessCount ?? 0,
    ttl: overrides.ttl ?? null,
  };
}

function makeMemoryState(memories: Memory[]): AgentMemoryState {
  const map = new Map<string, Memory>();
  for (const m of memories) map.set(m.key, m);
  return {
    memories: map,
    totalStored: memories.length,
    totalPruned: 0,
    capacity: 100,
  };
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const stateSet: Array<unknown> = [];
  const context = {
    emit: vi.fn((type: string, payload?: unknown) => {
      emitted.push({ type, payload });
      return 0;
    }),
    setState: vi.fn((s: unknown) => stateSet.push(s)),
  } as unknown as TraitContext;
  return { context, emitted, stateSet };
}

function makeNode(overrides: Partial<Record<string, unknown>> = {}): HSPlusNode & Record<string, unknown> {
  return { traits: undefined, ...overrides } as unknown as HSPlusNode & Record<string, unknown>;
}

const baseConfig: RecallTriggerConfig = {
  query: 'test',
  min_confidence: 0.3,
  max_results: 5,
  cooldown_ms: 1000,
  filter_tags: [],
  trigger_on_events: [],
  write_to_state: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('recallTriggerHandler', () => {
  describe('defaultConfig', () => {
    it('has expected default values', () => {
      expect(recallTriggerHandler.defaultConfig).toMatchObject({
        query: '',
        min_confidence: 0.3,
        max_results: 5,
        cooldown_ms: 1000,
        filter_tags: [],
        trigger_on_events: [],
        write_to_state: true,
      });
    });

    it('has name recall_trigger', () => {
      expect(recallTriggerHandler.name).toBe('recall_trigger');
    });
  });

  describe('onAttach', () => {
    it('initializes state with zeroed counters', () => {
      const node = makeNode({ __agentMemoryState: makeMemoryState([]) });
      const { context } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      expect((node as any).__recallTriggerState).toEqual({
        lastRecallAt: 0,
        totalRecalls: 0,
        totalHits: 0,
        totalMisses: 0,
      });
    });

    it('emits recall_error when min_confidence < 0', () => {
      const node = makeNode({ __agentMemoryState: makeMemoryState([]) });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, { ...baseConfig, min_confidence: -0.1 }, context);
      expect(emitted.some((e) => e.type === 'recall_error')).toBe(true);
      const err = emitted.find((e) => e.type === 'recall_error')!.payload as any;
      expect(err.error).toContain('min_confidence');
    });

    it('emits recall_error when min_confidence > 1', () => {
      const node = makeNode({ __agentMemoryState: makeMemoryState([]) });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, { ...baseConfig, min_confidence: 1.5 }, context);
      expect(emitted.some((e) => e.type === 'recall_error')).toBe(true);
    });

    it('emits recall_error when no query and no trigger_on_events', () => {
      const node = makeNode({ __agentMemoryState: makeMemoryState([]) });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(
        node,
        { ...baseConfig, query: '', trigger_on_events: [] },
        context
      );
      expect(emitted.some((e) => e.type === 'recall_error')).toBe(true);
      const err = emitted.find((e) => e.type === 'recall_error')!.payload as any;
      expect(err.error).toContain('query');
    });

    it('does NOT error when query is empty but trigger_on_events has entries', () => {
      const node = makeNode({ __agentMemoryState: makeMemoryState([]) });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(
        node,
        { ...baseConfig, query: '', trigger_on_events: ['some:event'] },
        context
      );
      expect(emitted.some((e) => e.type === 'recall_error')).toBe(false);
    });

    it('emits recall_error when max_results < 1', () => {
      const node = makeNode({ __agentMemoryState: makeMemoryState([]) });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, { ...baseConfig, max_results: 0 }, context);
      expect(emitted.some((e) => e.type === 'recall_error')).toBe(true);
      const err = emitted.find((e) => e.type === 'recall_error')!.payload as any;
      expect(err.error).toContain('max_results');
    });

    it('emits recall_error when no memory source in scope', () => {
      const node = makeNode();
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      expect(emitted.some((e) => e.type === 'recall_error')).toBe(true);
      const err = emitted.find((e) => e.type === 'recall_error')!.payload as any;
      expect(err.error).toContain('@recall_trigger requires');
    });

    it('does not error when memory_crystal trait is present', () => {
      const node = makeNode({ traits: new Set(['memory_crystal']) });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      expect(emitted.some((e) => e.type === 'recall_error')).toBe(false);
    });

    it('does not error when __agentMemoryState is present', () => {
      const node = makeNode({ __agentMemoryState: makeMemoryState([]) });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      expect(emitted.some((e) => e.type === 'recall_error')).toBe(false);
    });
  });

  describe('onDetach', () => {
    it('removes __recallTriggerState', () => {
      const node = makeNode({ __agentMemoryState: makeMemoryState([]) });
      const { context } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      expect((node as any).__recallTriggerState).toBeDefined();
      recallTriggerHandler.onDetach!(node, baseConfig, context);
      expect((node as any).__recallTriggerState).toBeUndefined();
    });

    it('is safe when state not present', () => {
      const node = makeNode();
      const { context } = makeContext();
      expect(() => recallTriggerHandler.onDetach!(node, baseConfig, context)).not.toThrow();
    });
  });

  describe('onEvent — no-op cases', () => {
    it('ignores events not in trigger_on_events', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'some:other:event' });
      expect(emitted.length).toBe(0);
    });

    it('is safe when state is missing', () => {
      const node = makeNode();
      const { context } = makeContext();
      expect(() =>
        recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' })
      ).not.toThrow();
    });
  });

  describe('onEvent — recall_execute', () => {
    it('emits recall_start before searching', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k', content: 'test query match' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      expect(emitted[0]?.type).toBe('recall_start');
      const start = emitted[0]?.payload as any;
      expect(start.query).toBe('test');
      expect(start.minConfidence).toBe(0.3);
    });

    it('emits recall_hit when results found (keyword match)', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test query match' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      const hit = emitted.find((e) => e.type === 'recall_hit')!.payload as any;
      expect(hit.results).toHaveLength(1);
      expect(hit.results[0].key).toBe('k1');
      expect(hit.topScore).toBeGreaterThanOrEqual(0.3);
    });

    it('emits recall_miss when no results above min_confidence', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'completely unrelated xyz' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      expect(emitted.some((e) => e.type === 'recall_miss')).toBe(true);
      const miss = emitted.find((e) => e.type === 'recall_miss')!.payload as any;
      expect(miss.reason).toContain('min_confidence');
    });

    it('emits recall_miss when no memory state available', () => {
      const node = makeNode({ __agentMemoryState: undefined, traits: new Set(['memory_crystal']) });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      expect(emitted.some((e) => e.type === 'recall_miss')).toBe(true);
      const miss = emitted.find((e) => e.type === 'recall_miss')!.payload as any;
      expect(miss.reason).toContain('No memory state');
    });

    it('uses event.query over config.query when provided', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'robot arm joint' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, baseConfig, context, {
        type: 'recall_execute',
        query: 'robot',
      });
      const start = emitted.find((e) => e.type === 'recall_start')!.payload as any;
      expect(start.query).toBe('robot');
    });

    it('increments totalRecalls on each trigger', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context } = makeContext();
      recallTriggerHandler.onAttach!(node, { ...baseConfig, cooldown_ms: 0 }, context);
      const state = (node as any).__recallTriggerState;
      recallTriggerHandler.onEvent!(node, { ...baseConfig, cooldown_ms: 0 }, context, { type: 'recall_execute' });
      recallTriggerHandler.onEvent!(node, { ...baseConfig, cooldown_ms: 0 }, context, { type: 'recall_execute' });
      expect(state.totalRecalls).toBe(2);
    });

    it('increments totalHits on hit', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context } = makeContext();
      recallTriggerHandler.onAttach!(node, { ...baseConfig, cooldown_ms: 0 }, context);
      const state = (node as any).__recallTriggerState;
      recallTriggerHandler.onEvent!(node, { ...baseConfig, cooldown_ms: 0 }, context, { type: 'recall_execute' });
      expect(state.totalHits).toBe(1);
      expect(state.totalMisses).toBe(0);
    });

    it('increments totalMisses on miss', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'unrelated xyz abc' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context } = makeContext();
      recallTriggerHandler.onAttach!(node, { ...baseConfig, cooldown_ms: 0 }, context);
      const state = (node as any).__recallTriggerState;
      recallTriggerHandler.onEvent!(node, { ...baseConfig, cooldown_ms: 0 }, context, { type: 'recall_execute' });
      expect(state.totalMisses).toBe(1);
      expect(state.totalHits).toBe(0);
    });
  });

  describe('onEvent — cooldown', () => {
    it('emits recall_cooldown when triggered within cooldown_ms', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      const state = (node as any).__recallTriggerState;
      // Simulate lastRecallAt just happened
      state.lastRecallAt = Date.now() - 100; // 100ms ago, cooldown is 1000ms
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      expect(emitted.some((e) => e.type === 'recall_cooldown')).toBe(true);
      const cd = emitted.find((e) => e.type === 'recall_cooldown')!.payload as any;
      expect(cd.remainingMs).toBeGreaterThan(0);
    });

    it('does NOT emit cooldown when cooldown_ms has elapsed', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      const state = (node as any).__recallTriggerState;
      state.lastRecallAt = Date.now() - 5000; // 5s ago, cooldown is 1s
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      expect(emitted.some((e) => e.type === 'recall_cooldown')).toBe(false);
    });
  });

  describe('onEvent — trigger_on_events', () => {
    it('triggers recall on custom event types', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      const cfg = { ...baseConfig, trigger_on_events: ['agent:perceived'] };
      recallTriggerHandler.onAttach!(node, cfg, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, cfg, context, { type: 'agent:perceived' });
      expect(emitted.some((e) => e.type === 'recall_start')).toBe(true);
    });

    it('does not trigger on unrelated event types', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      const cfg = { ...baseConfig, trigger_on_events: ['agent:perceived'] };
      recallTriggerHandler.onAttach!(node, cfg, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, cfg, context, { type: 'agent:other' });
      expect(emitted.length).toBe(0);
    });
  });

  describe('onEvent — tag filtering', () => {
    it('only includes memories matching all filter_tags', () => {
      const m1 = makeMemory({ key: 'k1', content: 'test data', tags: ['important'] });
      const m2 = makeMemory({ key: 'k2', content: 'test data also', tags: ['unrelated'] });
      const mem = makeMemoryState([m1, m2]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      const cfg = { ...baseConfig, filter_tags: ['important'] };
      recallTriggerHandler.onAttach!(node, cfg, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, cfg, context, { type: 'recall_execute' });
      const hit = emitted.find((e) => e.type === 'recall_hit')?.payload as any;
      if (hit) {
        expect(hit.results.every((r: any) => r.key === 'k1')).toBe(true);
      }
    });
  });

  describe('onEvent — semantic search with embedding', () => {
    it('uses cosine similarity when embedding provided', () => {
      const m1 = makeMemory({
        key: 'k1',
        content: 'relevant',
        embedding: [1, 0, 0],
      });
      const m2 = makeMemory({
        key: 'k2',
        content: 'different',
        embedding: [0, 1, 0],
      });
      const mem = makeMemoryState([m1, m2]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      const cfg = { ...baseConfig, min_confidence: 0.5 };
      recallTriggerHandler.onAttach!(node, cfg, context);
      emitted.length = 0;
      recallTriggerHandler.onEvent!(node, cfg, context, {
        type: 'recall_execute',
        embedding: [1, 0, 0], // exact match to m1
      });
      const hit = emitted.find((e) => e.type === 'recall_hit')?.payload as any;
      expect(hit).toBeDefined();
      expect(hit.results[0].key).toBe('k1');
    });
  });

  describe('onEvent — write_to_state', () => {
    it('calls setState on hit when write_to_state is true', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, stateSet } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      expect(stateSet.length).toBe(1);
      const s = stateSet[0] as any;
      expect(s.lastRecall).toBeDefined();
      expect(s.lastRecall.query).toBe('test');
    });

    it('does NOT call setState when write_to_state is false', () => {
      const mem = makeMemoryState([makeMemory({ key: 'k1', content: 'test data' })]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, stateSet } = makeContext();
      const cfg = { ...baseConfig, write_to_state: false };
      recallTriggerHandler.onAttach!(node, cfg, context);
      recallTriggerHandler.onEvent!(node, cfg, context, { type: 'recall_execute' });
      expect(stateSet.length).toBe(0);
    });
  });

  describe('onEvent — max_results', () => {
    it('limits results to max_results', () => {
      const memories = Array.from({ length: 10 }, (_, i) =>
        makeMemory({ key: `k${i}`, content: 'test match content' })
      );
      const mem = makeMemoryState(memories);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      const cfg = { ...baseConfig, max_results: 3 };
      recallTriggerHandler.onAttach!(node, cfg, context);
      recallTriggerHandler.onEvent!(node, cfg, context, { type: 'recall_execute' });
      const hit = emitted.find((e) => e.type === 'recall_hit')?.payload as any;
      expect(hit.results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('onEvent — expired memories', () => {
    it('excludes expired memories (ttl elapsed)', () => {
      const expired = makeMemory({
        key: 'expired',
        content: 'test old data',
        createdAt: Date.now() - 100000,
        ttl: 1000, // 1s ttl, created 100s ago
      });
      const valid = makeMemory({
        key: 'valid',
        content: 'test fresh data',
        ttl: null,
      });
      const mem = makeMemoryState([expired, valid]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context, emitted } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      const hit = emitted.find((e) => e.type === 'recall_hit')?.payload as any;
      if (hit) {
        expect(hit.results.every((r: any) => r.key !== 'expired')).toBe(true);
      }
    });
  });

  describe('onEvent — access stats update', () => {
    it('increments accessCount on matched memory', () => {
      const m1 = makeMemory({ key: 'k1', content: 'test data', accessCount: 0 });
      const mem = makeMemoryState([m1]);
      const node = makeNode({ __agentMemoryState: mem });
      const { context } = makeContext();
      recallTriggerHandler.onAttach!(node, baseConfig, context);
      recallTriggerHandler.onEvent!(node, baseConfig, context, { type: 'recall_execute' });
      expect(m1.accessCount).toBe(1);
    });
  });
});
