/**
 * MemoryTrait — Production Test Suite
 *
 * memoryHandler is self-contained with no external dependencies.
 * Helper functions generateId, calculateRelevance, sortMemories are internal.
 *
 * Key behaviours:
 * 1. defaultConfig — 9 fields
 * 2. onAttach — creates __memoryState with empty Map + working memory; emits memory_load_request when persist=true
 * 3. onDetach — emits memory_save when persist=true; removes __memoryState
 * 4. onUpdate — accumulates decayTimer; fires decay/prune when decayTimer >= decay_interval
 *   - decays importance by exp factor
 *   - removes memories below importance_threshold + emits memory_forgotten
 *   - enforces capacity limit (evicts lowest importance)
 *   - resets decayTimer to 0
 * 5. onEvent 'remember' — stores memory, assigns sequential id, emits memory_stored
 *   - adds to workingMemory (capped at working_memory_size, LIFO)
 * 6. onEvent 'recall' — scores via calculateRelevance, returns top-N sorted by relevance
 *   - updates accessCount + lastAccessed + boosts importance
 *   - updates workingMemory order + trims to working_memory_size
 *   - emits memory_recalled with queryId
 * 7. onEvent 'forget' — explicit removal, cleans workingMemory, emits memory_forgotten
 * 8. onEvent 'associate' — links two memories bidirectionally, emits memories_associated
 * 9. onEvent 'get_working_memory' — emits working_memory_result with current working set
 * 10. onEvent 'memory_load_response' — restores memories array + updates nextId
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryHandler } from '../MemoryTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

let _nodeId = 0;
function makeNode() {
  return { id: `mem_node_${++_nodeId}` };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function makeConfig(o: any = {}) {
  return { ...memoryHandler.defaultConfig!, ...o };
}
function attach(o: any = {}) {
  const node = makeNode(),
    ctx = makeCtx(),
    config = makeConfig(o);
  memoryHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) {
  return (node as any).__memoryState;
}

function remember(
  node: any,
  config: any,
  ctx: any,
  content: string,
  tags: string[] = [],
  importance = 0.5
) {
  memoryHandler.onEvent!(node as any, config, ctx as any, {
    type: 'remember',
    content,
    tags,
    importance,
  });
}

function rememberN(node: any, config: any, ctx: any, count: number) {
  for (let i = 0; i < count; i++) {
    remember(node, config, ctx, `memory_${i}`, [], 0.5);
  }
}

beforeEach(() => vi.clearAllMocks());

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('memoryHandler.defaultConfig', () => {
  const d = memoryHandler.defaultConfig!;
  it('memory_type = episodic', () => expect(d.memory_type).toBe('episodic'));
  it('capacity = 1000', () => expect(d.capacity).toBe(1000));
  it('decay_rate = 0.01', () => expect(d.decay_rate).toBe(0.01));
  it('decay_interval = 60', () => expect(d.decay_interval).toBe(60));
  it('importance_threshold = 0.3', () => expect(d.importance_threshold).toBe(0.3));
  it('retrieval_mode = relevance', () => expect(d.retrieval_mode).toBe('relevance'));
  it('working_memory_size = 7', () => expect(d.working_memory_size).toBe(7));
  it('persist_across_sessions = false', () => expect(d.persist_across_sessions).toBe(false));
  it('consolidation_interval = 300', () => expect(d.consolidation_interval).toBe(300));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('memoryHandler.onAttach', () => {
  it('creates __memoryState with empty memories Map', () => {
    const { node } = attach();
    expect(getState(node).memories).toBeInstanceOf(Map);
    expect(getState(node).memories.size).toBe(0);
  });
  it('workingMemory starts empty', () => {
    const { node } = attach();
    expect(getState(node).workingMemory).toEqual([]);
  });
  it('decayTimer = 0', () => {
    const { node } = attach();
    expect(getState(node).decayTimer).toBe(0);
  });
  it('nextId = 1', () => {
    const { node } = attach();
    expect(getState(node).nextId).toBe(1);
  });
  it('emits memory_load_request when persist_across_sessions=true', () => {
    const { ctx } = attach({ persist_across_sessions: true });
    expect(ctx.emit).toHaveBeenCalledWith('memory_load_request', expect.any(Object));
  });
  it('does NOT emit load_request when persist=false', () => {
    const { ctx } = attach({ persist_across_sessions: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('memory_load_request', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('memoryHandler.onDetach', () => {
  it('removes __memoryState', () => {
    const { node, ctx, config } = attach();
    memoryHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
  it('emits memory_save when persist=true', () => {
    const { node, ctx, config } = attach({ persist_across_sessions: true });
    remember(node, config, ctx, 'hello');
    ctx.emit.mockClear();
    memoryHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'memory_save',
      expect.objectContaining({ node, memories: expect.any(Array) })
    );
  });
  it('does NOT emit memory_save when persist=false', () => {
    const { node, ctx, config } = attach({ persist_across_sessions: false });
    ctx.emit.mockClear();
    memoryHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('memory_save', expect.anything());
  });
});

// ─── onUpdate — decay ─────────────────────────────────────────────────────────
describe('memoryHandler.onUpdate — decay', () => {
  it('accumulates decayTimer without firing decay before interval', () => {
    const { node, ctx, config } = attach({ decay_interval: 60 });
    remember(node, config, ctx, 'test', [], 0.9);
    ctx.emit.mockClear();
    memoryHandler.onUpdate!(node as any, config, ctx as any, 10);
    expect(getState(node).decayTimer).toBe(10);
    expect(ctx.emit).not.toHaveBeenCalledWith('memory_forgotten', expect.anything());
  });

  it('resets decayTimer to 0 after firing', () => {
    const { node, ctx, config } = attach({
      decay_interval: 5,
      decay_rate: 0,
      importance_threshold: 0,
    });
    remember(node, config, ctx, 'test', [], 0.9);
    memoryHandler.onUpdate!(node as any, config, ctx as any, 5);
    expect(getState(node).decayTimer).toBe(0);
  });

  it('emits memory_forgotten for memories below importance_threshold', () => {
    // A memory with lastAccessed far in the past will have near-zero decayFactor
    const { node, ctx, config } = attach({
      decay_interval: 1,
      decay_rate: 100, // aggressive decay
      importance_threshold: 0.4,
    });
    // Manually add a memory with very old lastAccessed so exp(-hours*100) ≈ 0
    const state = getState(node);
    state.memories.set('mem_old', {
      id: 'mem_old',
      type: 'episodic',
      content: 'old',
      tags: [],
      importance: 0.35,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now() - 999999999, // very old
      associations: [],
      context: {},
    });
    ctx.emit.mockClear();
    memoryHandler.onUpdate!(node as any, config, ctx as any, 1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'memory_forgotten',
      expect.objectContaining({ memoryId: 'mem_old' })
    );
    expect(state.memories.has('mem_old')).toBe(false);
  });

  it('enforces capacity — evicts lowest importance', () => {
    const { node, ctx, config } = attach({
      decay_interval: 1,
      decay_rate: 0,
      importance_threshold: 0,
      capacity: 2,
    });
    const state = getState(node);
    // 3 memories with distinct importance
    state.memories.set('m1', {
      id: 'm1',
      type: 'episodic',
      content: 'a',
      tags: [],
      importance: 0.8,
      timestamp: 0,
      accessCount: 0,
      lastAccessed: Date.now(),
      associations: [],
      context: {},
    });
    state.memories.set('m2', {
      id: 'm2',
      type: 'episodic',
      content: 'b',
      tags: [],
      importance: 0.5,
      timestamp: 0,
      accessCount: 0,
      lastAccessed: Date.now(),
      associations: [],
      context: {},
    });
    state.memories.set('m3', {
      id: 'm3',
      type: 'episodic',
      content: 'c',
      tags: [],
      importance: 0.1,
      timestamp: 0,
      accessCount: 0,
      lastAccessed: Date.now(),
      associations: [],
      context: {},
    });
    memoryHandler.onUpdate!(node as any, config, ctx as any, 1);
    expect(state.memories.size).toBe(2);
  });
});

// ─── onEvent 'remember' ───────────────────────────────────────────────────────
describe("memoryHandler.onEvent 'remember'", () => {
  it('stores memory with sequential id', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'Hello world');
    const state = getState(node);
    expect(state.memories.size).toBe(1);
    const [id] = state.memories.keys();
    expect(id).toMatch(/^mem_\d+/);
  });

  it('emits memory_stored with the new memory', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    remember(node, config, ctx, 'Test content', ['tag1'], 0.7);
    expect(ctx.emit).toHaveBeenCalledWith(
      'memory_stored',
      expect.objectContaining({
        memory: expect.objectContaining({ content: 'Test content', importance: 0.7 }),
      })
    );
  });

  it('stores tags from event', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'Tagged', ['ai', 'memory']);
    const state = getState(node);
    const mem = Array.from(state.memories.values())[0];
    expect(mem.tags).toEqual(['ai', 'memory']);
  });

  it('adds to workingMemory (LIFO order)', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'first');
    remember(node, config, ctx, 'second');
    const state = getState(node);
    expect(state.workingMemory[0]).toMatch(/mem_/);
    expect(state.workingMemory.length).toBe(2);
    // Second memory should be at front
    const second = Array.from(state.memories.values())[1];
    expect(state.workingMemory[0]).toBe(second.id);
  });

  it('caps workingMemory at working_memory_size', () => {
    const { node, ctx, config } = attach({ working_memory_size: 3 });
    rememberN(node, config, ctx, 5);
    const state = getState(node);
    expect(state.workingMemory.length).toBe(3);
  });

  it('uses config.memory_type as default when not specified in event', () => {
    const { node, ctx, config } = attach({ memory_type: 'semantic' });
    memoryHandler.onEvent!(node as any, config, ctx as any, { type: 'remember', content: 'fact' });
    const mem = Array.from(getState(node).memories.values())[0];
    expect(mem.type).toBe('semantic');
  });
});

// ─── onEvent 'recall' ─────────────────────────────────────────────────────────
describe("memoryHandler.onEvent 'recall'", () => {
  it('emits memory_recalled with results', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'the weather is sunny', ['weather', 'sunny'], 0.8);
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'recall',
      query: 'sunny weather',
      tags: ['weather'],
      limit: 5,
      queryId: 'q1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'memory_recalled',
      expect.objectContaining({ queryId: 'q1', results: expect.any(Array) })
    );
  });

  it('returns memories matching query with relevance > 0.1', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'the weather is sunny today', ['weather'], 0.9);
    remember(node, config, ctx, 'apples and oranges', ['fruit'], 0.5);
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'recall',
      query: 'sunny weather',
      tags: ['weather'],
      limit: 5,
      queryId: 'q2',
    });
    const call = ctx.emit.mock.calls.find(([ev]) => ev === 'memory_recalled');
    expect(call![1].results.length).toBeGreaterThanOrEqual(1);
    expect(call![1].results[0].content).toContain('weather');
  });

  it('boosts importance on recall', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'recall me', ['recall'], 0.5);
    const state = getState(node);
    const mem = Array.from(state.memories.values())[0];
    const importanceBefore = mem.importance;
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'recall',
      query: 'recall me',
      tags: ['recall'],
      limit: 5,
      queryId: 'q3',
    });
    expect(mem.importance).toBeGreaterThan(importanceBefore);
  });

  it('increments accessCount on recall', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'access me', ['test'], 0.5);
    const state = getState(node);
    const mem = Array.from(state.memories.values())[0];
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'recall',
      query: 'access me',
      tags: ['test'],
      limit: 5,
      queryId: 'q4',
    });
    expect(mem.accessCount).toBe(1);
  });

  it('limits results to specified limit', () => {
    const { node, ctx, config } = attach();
    for (let i = 0; i < 10; i++) {
      remember(node, config, ctx, `shared word content item ${i}`, ['common'], 0.5);
    }
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'recall',
      query: 'shared word',
      tags: ['common'],
      limit: 3,
      queryId: 'q5',
    });
    const call = ctx.emit.mock.calls.find(([ev]) => ev === 'memory_recalled');
    expect(call![1].results.length).toBeLessThanOrEqual(3);
  });
});

// ─── onEvent 'forget' ─────────────────────────────────────────────────────────
describe("memoryHandler.onEvent 'forget'", () => {
  it('removes memory from state + emits memory_forgotten', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'forget me', [], 0.5);
    const state = getState(node);
    const id = Array.from(state.memories.keys())[0];
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node as any, config, ctx as any, { type: 'forget', memoryId: id });
    expect(state.memories.has(id)).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'memory_forgotten',
      expect.objectContaining({ memoryId: id })
    );
  });

  it('removes from workingMemory on forget', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'forget me too', [], 0.5);
    const state = getState(node);
    const id = state.workingMemory[0];
    memoryHandler.onEvent!(node as any, config, ctx as any, { type: 'forget', memoryId: id });
    expect(state.workingMemory.includes(id)).toBe(false);
  });

  it('no-op for unknown memoryId', () => {
    const { node, ctx, config } = attach();
    expect(() =>
      memoryHandler.onEvent!(node as any, config, ctx as any, {
        type: 'forget',
        memoryId: 'unknown',
      })
    ).not.toThrow();
  });
});

// ─── onEvent 'associate' ──────────────────────────────────────────────────────
describe("memoryHandler.onEvent 'associate'", () => {
  it('links two memories bidirectionally', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'memory A');
    remember(node, config, ctx, 'memory B');
    const state = getState(node);
    const [idA, idB] = Array.from(state.memories.keys());
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'associate',
      sourceId: idA,
      targetId: idB,
    });
    expect(state.memories.get(idA)!.associations).toContain(idB);
    expect(state.memories.get(idB)!.associations).toContain(idA);
    expect(ctx.emit).toHaveBeenCalledWith(
      'memories_associated',
      expect.objectContaining({ sourceId: idA, targetId: idB })
    );
  });

  it('does not duplicate associations on repeated associate', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'A');
    remember(node, config, ctx, 'B');
    const state = getState(node);
    const [idA, idB] = Array.from(state.memories.keys());
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'associate',
      sourceId: idA,
      targetId: idB,
    });
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'associate',
      sourceId: idA,
      targetId: idB,
    });
    expect(state.memories.get(idA)!.associations.filter((x: string) => x === idB).length).toBe(1);
  });

  it('no-op when either memory does not exist', () => {
    const { node, ctx, config } = attach();
    expect(() =>
      memoryHandler.onEvent!(node as any, config, ctx as any, {
        type: 'associate',
        sourceId: 'x',
        targetId: 'y',
      })
    ).not.toThrow();
  });
});

// ─── onEvent 'get_working_memory' ─────────────────────────────────────────────
describe("memoryHandler.onEvent 'get_working_memory'", () => {
  it('emits working_memory_result with current working set', () => {
    const { node, ctx, config } = attach();
    remember(node, config, ctx, 'mem1');
    remember(node, config, ctx, 'mem2');
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'get_working_memory',
      queryId: 'wm1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'working_memory_result',
      expect.objectContaining({ queryId: 'wm1', memories: expect.any(Array) })
    );
    const call = ctx.emit.mock.calls.find(([ev]) => ev === 'working_memory_result');
    expect(call![1].memories.length).toBe(2);
  });
});

// ─── onEvent 'memory_load_response' ──────────────────────────────────────────
describe("memoryHandler.onEvent 'memory_load_response'", () => {
  it('restores memories from persisted array', () => {
    const { node, ctx, config } = attach();
    const loaded = [
      {
        id: 'mem_10',
        type: 'episodic',
        content: 'restored',
        tags: [],
        importance: 0.6,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
        associations: [],
        context: {},
      },
    ];
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'memory_load_response',
      memories: loaded,
    });
    const state = getState(node);
    expect(state.memories.has('mem_10')).toBe(true);
  });

  it('updates nextId to avoid collision', () => {
    const { node, ctx, config } = attach();
    const loaded = [
      {
        id: 'mem_50',
        type: 'episodic',
        content: 'hi',
        tags: [],
        importance: 0.5,
        timestamp: 0,
        accessCount: 0,
        lastAccessed: 0,
        associations: [],
        context: {},
      },
    ];
    memoryHandler.onEvent!(node as any, config, ctx as any, {
      type: 'memory_load_response',
      memories: loaded,
    });
    const state = getState(node);
    expect(state.nextId).toBeGreaterThanOrEqual(51);
  });
});
