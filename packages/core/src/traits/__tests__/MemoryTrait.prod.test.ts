/**
 * MemoryTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { memoryHandler } from '../MemoryTrait';

function makeNode() { return { id: 'mem_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...memoryHandler.defaultConfig!, ...cfg };
  memoryHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}
function remember(node: any, ctx: any, config: any, overrides: any = {}) {
  memoryHandler.onEvent!(node, config, ctx, {
    type: 'remember',
    content: 'test event',
    importance: 0.5,
    tags: [],
    ...overrides,
  });
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('memoryHandler.defaultConfig', () => {
  const d = memoryHandler.defaultConfig!;
  it('memory_type=episodic', () => expect(d.memory_type).toBe('episodic'));
  it('capacity=1000', () => expect(d.capacity).toBe(1000));
  it('decay_rate=0.01', () => expect(d.decay_rate).toBe(0.01));
  it('decay_interval=60', () => expect(d.decay_interval).toBe(60));
  it('importance_threshold=0.3', () => expect(d.importance_threshold).toBe(0.3));
  it('retrieval_mode=relevance', () => expect(d.retrieval_mode).toBe('relevance'));
  it('working_memory_size=7', () => expect(d.working_memory_size).toBe(7));
  it('persist_across_sessions=false', () => expect(d.persist_across_sessions).toBe(false));
  it('consolidation_interval=300', () => expect(d.consolidation_interval).toBe(300));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('memoryHandler.onAttach', () => {
  it('creates __memoryState', () => expect(attach().node.__memoryState).toBeDefined());
  it('memories Map is empty', () => expect(attach().node.__memoryState.memories.size).toBe(0));
  it('workingMemory is empty', () => expect(attach().node.__memoryState.workingMemory).toHaveLength(0));
  it('decayTimer=0', () => expect(attach().node.__memoryState.decayTimer).toBe(0));
  it('nextId=1', () => expect(attach().node.__memoryState.nextId).toBe(1));
  it('emits memory_load_request when persist_across_sessions=true', () => {
    const { ctx } = attach({ persist_across_sessions: true });
    expect(ctx.emit).toHaveBeenCalledWith('memory_load_request', expect.anything());
  });
  it('no memory_load_request when persist_across_sessions=false', () => {
    const { ctx } = attach({ persist_across_sessions: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('memory_load_request', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('memoryHandler.onDetach', () => {
  it('removes __memoryState', () => {
    const { node, config, ctx } = attach();
    memoryHandler.onDetach!(node, config, ctx);
    expect(node.__memoryState).toBeUndefined();
  });
  it('emits memory_save when persist_across_sessions=true', () => {
    const { node, config, ctx } = attach({ persist_across_sessions: true });
    ctx.emit.mockClear();
    memoryHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('memory_save', expect.anything());
  });
  it('memory_save includes serialized memories', () => {
    const { node, config, ctx } = attach({ persist_across_sessions: true });
    remember(node, ctx, config, { content: 'to persist', importance: 0.8 });
    ctx.emit.mockClear();
    memoryHandler.onDetach!(node, config, ctx);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'memory_save')!;
    expect(call[1].memories).toHaveLength(1);
    expect(call[1].memories[0].content).toBe('to persist');
  });
  it('no memory_save when persist_across_sessions=false', () => {
    const { node, config, ctx } = attach({ persist_across_sessions: false });
    ctx.emit.mockClear();
    memoryHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('memory_save', expect.anything());
  });
});

// ─── onEvent — remember ───────────────────────────────────────────────────────

describe('memoryHandler.onEvent — remember', () => {
  it('stores memory in memories Map', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'hello world' });
    expect(node.__memoryState.memories.size).toBe(1);
  });
  it('generates id starting with mem_1', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config);
    const first = [...node.__memoryState.memories.values()][0];
    expect(first.id).toBe('mem_1');
  });
  it('nextId increments', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config);
    remember(node, ctx, config);
    expect(node.__memoryState.nextId).toBe(3);
  });
  it('uses memoryType from event', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { memoryType: 'semantic' });
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.type).toBe('semantic');
  });
  it('falls back to config.memory_type', () => {
    const { node, ctx, config } = attach({ memory_type: 'procedural' });
    remember(node, ctx, config, {});
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.type).toBe('procedural');
  });
  it('stores tags array', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { tags: ['red', 'hot'] });
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.tags).toEqual(['red', 'hot']);
  });
  it('importance defaults to 0.5', () => {
    const { node, ctx, config } = attach();
    memoryHandler.onEvent!(node, config, ctx, { type: 'remember', content: 'x', tags: [] }); // no importance
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.importance).toBe(0.5);
  });
  it('stores explicit importance', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { importance: 0.9 });
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.importance).toBe(0.9);
  });
  it('accessCount=0 on creation', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config);
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.accessCount).toBe(0);
  });
  it('adds memory id to front of workingMemory', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config);
    const id = [...node.__memoryState.memories.keys()][0];
    expect(node.__memoryState.workingMemory[0]).toBe(id);
  });
  it('workingMemory capped at working_memory_size', () => {
    const { node, ctx, config } = attach({ working_memory_size: 3 });
    for (let i = 0; i < 5; i++) remember(node, ctx, config, { content: `m${i}` });
    expect(node.__memoryState.workingMemory).toHaveLength(3);
  });
  it('newest memory is first in workingMemory', () => {
    const { node, ctx, config } = attach({ working_memory_size: 5 });
    remember(node, ctx, config, { content: 'first' });
    remember(node, ctx, config, { content: 'second' });
    const frontId = node.__memoryState.workingMemory[0];
    const frontMem = node.__memoryState.memories.get(frontId);
    expect(frontMem?.content).toBe('second');
  });
  it('emits memory_stored', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    remember(node, ctx, config, { content: 'stored' });
    expect(ctx.emit).toHaveBeenCalledWith('memory_stored', expect.objectContaining({ memory: expect.objectContaining({ content: 'stored' }) }));
  });
  it('stores associations array', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { associations: ['mem_99'] });
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.associations).toEqual(['mem_99']);
  });
  it('stores context object', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { context: { location: 'kitchen' } });
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.context).toEqual({ location: 'kitchen' });
  });
});

// ─── onEvent — recall ─────────────────────────────────────────────────────────

describe('memoryHandler.onEvent — recall', () => {
  it('emits memory_recalled with results', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'the cat sat on the mat', tags: ['cat'] });
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node, config, ctx, { type: 'recall', query: 'cat', tags: ['cat'], limit: 5, queryId: 'r1' });
    expect(ctx.emit).toHaveBeenCalledWith('memory_recalled', expect.objectContaining({ queryId: 'r1' }));
  });
  it('returns matching memory', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'sunny day outside', tags: ['weather'] });
    memoryHandler.onEvent!(node, config, ctx, { type: 'recall', query: 'sunny', tags: ['weather'], limit: 5, queryId: 'r2' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'memory_recalled')!;
    expect(call[1].results.length).toBeGreaterThan(0);
  });
  it('results include relevance score', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'big blue sky', importance: 0.8 });
    memoryHandler.onEvent!(node, config, ctx, { type: 'recall', query: 'big blue', tags: [], limit: 5 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'memory_recalled')!;
    expect(call[1].results[0].relevance).toBeGreaterThan(0);
  });
  it('recall increments accessCount', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'red fire engine', tags: ['red'] });
    memoryHandler.onEvent!(node, config, ctx, { type: 'recall', query: 'red fire', tags: ['red'], limit: 5 });
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.accessCount).toBe(1);
  });
  it('recall strengthens importance (+0.1 capped at 1)', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'blue ocean waves', importance: 0.5, tags: ['blue'] });
    memoryHandler.onEvent!(node, config, ctx, { type: 'recall', query: 'blue ocean', tags: ['blue'], limit: 5 });
    const m = [...node.__memoryState.memories.values()][0];
    expect(m.importance).toBeCloseTo(0.6);
  });
  it('empty DB returns empty results', () => {
    const { node, ctx, config } = attach();
    memoryHandler.onEvent!(node, config, ctx, { type: 'recall', query: 'anything', tags: [], limit: 5 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'memory_recalled')!;
    expect(call[1].results).toHaveLength(0);
  });
  it('results limited to limit param', () => {
    const { node, ctx, config } = attach();
    for (let i = 0; i < 6; i++) remember(node, ctx, config, { content: 'common word here', importance: 0.8, tags: [] });
    memoryHandler.onEvent!(node, config, ctx, { type: 'recall', query: 'common word', tags: [], limit: 3 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'memory_recalled')!;
    expect(call[1].results.length).toBeLessThanOrEqual(3);
  });
  it('defaults limit=5 when not provided', () => {
    const { node, ctx, config } = attach();
    for (let i = 0; i < 7; i++) remember(node, ctx, config, { content: 'repeated thing here', importance: 0.8 });
    memoryHandler.onEvent!(node, config, ctx, { type: 'recall', query: 'repeated thing' }); // no limit
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'memory_recalled')!;
    expect(call[1].results.length).toBeLessThanOrEqual(5);
  });
});

// ─── onEvent — forget ─────────────────────────────────────────────────────────

describe('memoryHandler.onEvent — forget', () => {
  it('removes memory from memories Map', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config);
    const id = [...node.__memoryState.memories.keys()][0];
    memoryHandler.onEvent!(node, config, ctx, { type: 'forget', memoryId: id });
    expect(node.__memoryState.memories.has(id)).toBe(false);
  });
  it('removes memory from workingMemory', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config);
    const id = node.__memoryState.workingMemory[0];
    memoryHandler.onEvent!(node, config, ctx, { type: 'forget', memoryId: id });
    expect(node.__memoryState.workingMemory.includes(id)).toBe(false);
  });
  it('emits memory_forgotten', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config);
    const id = [...node.__memoryState.memories.keys()][0];
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node, config, ctx, { type: 'forget', memoryId: id });
    expect(ctx.emit).toHaveBeenCalledWith('memory_forgotten', expect.objectContaining({ memoryId: id }));
  });
  it('no-op for unknown memoryId', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node, config, ctx, { type: 'forget', memoryId: 'mem_999' });
    expect(ctx.emit).not.toHaveBeenCalledWith('memory_forgotten', expect.anything());
  });
});

// ─── onEvent — associate ──────────────────────────────────────────────────────

describe('memoryHandler.onEvent — associate', () => {
  it('links two memories bidirectionally', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'dog' });
    remember(node, ctx, config, { content: 'bone' });
    const [id1, id2] = [...node.__memoryState.memories.keys()];
    memoryHandler.onEvent!(node, config, ctx, { type: 'associate', sourceId: id1, targetId: id2 });
    const m1 = node.__memoryState.memories.get(id1);
    const m2 = node.__memoryState.memories.get(id2);
    expect(m1.associations).toContain(id2);
    expect(m2.associations).toContain(id1);
  });
  it('emits memories_associated', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'a' });
    remember(node, ctx, config, { content: 'b' });
    const [id1, id2] = [...node.__memoryState.memories.keys()];
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node, config, ctx, { type: 'associate', sourceId: id1, targetId: id2 });
    expect(ctx.emit).toHaveBeenCalledWith('memories_associated', expect.objectContaining({ sourceId: id1, targetId: id2 }));
  });
  it('no duplicate associations on re-link', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'x' });
    remember(node, ctx, config, { content: 'y' });
    const [id1, id2] = [...node.__memoryState.memories.keys()];
    memoryHandler.onEvent!(node, config, ctx, { type: 'associate', sourceId: id1, targetId: id2 });
    memoryHandler.onEvent!(node, config, ctx, { type: 'associate', sourceId: id1, targetId: id2 });
    const m1 = node.__memoryState.memories.get(id1);
    expect(m1.associations.filter((a: string) => a === id2)).toHaveLength(1);
  });
  it('no-op when source or target not found', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    memoryHandler.onEvent!(node, config, ctx, { type: 'associate', sourceId: 'bad1', targetId: 'bad2' });
    expect(ctx.emit).not.toHaveBeenCalledWith('memories_associated', expect.anything());
  });
});

// ─── onEvent — get_working_memory ─────────────────────────────────────────────

describe('memoryHandler.onEvent — get_working_memory', () => {
  it('emits working_memory_result', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'recent' });
    memoryHandler.onEvent!(node, config, ctx, { type: 'get_working_memory', queryId: 'wm1' });
    expect(ctx.emit).toHaveBeenCalledWith('working_memory_result', expect.objectContaining({ queryId: 'wm1' }));
  });
  it('result includes recently stored memories', () => {
    const { node, ctx, config } = attach();
    remember(node, ctx, config, { content: 'recent thought' });
    memoryHandler.onEvent!(node, config, ctx, { type: 'get_working_memory', queryId: 'wm2' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'working_memory_result')!;
    expect(call[1].memories.some((m: any) => m.content === 'recent thought')).toBe(true);
  });
  it('empty result when no memories stored', () => {
    const { node, ctx, config } = attach();
    memoryHandler.onEvent!(node, config, ctx, { type: 'get_working_memory', queryId: 'wm3' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'working_memory_result')!;
    expect(call[1].memories).toHaveLength(0);
  });
});

// ─── onEvent — memory_load_response ───────────────────────────────────────────

describe('memoryHandler.onEvent — memory_load_response', () => {
  it('restores memories from loaded array', () => {
    const { node, ctx, config } = attach();
    const loaded = [{ id: 'mem_5', type: 'episodic', content: 'loaded mem', tags: [], importance: 0.7, timestamp: Date.now(), accessCount: 0, lastAccessed: Date.now(), associations: [], context: {} }];
    memoryHandler.onEvent!(node, config, ctx, { type: 'memory_load_response', memories: loaded });
    expect(node.__memoryState.memories.has('mem_5')).toBe(true);
    expect(node.__memoryState.memories.get('mem_5').content).toBe('loaded mem');
  });
  it('updates nextId to avoid collisions', () => {
    const { node, ctx, config } = attach();
    const loaded = [{ id: 'mem_10', type: 'episodic', content: 'old', tags: [], importance: 0.5, timestamp: Date.now(), accessCount: 0, lastAccessed: Date.now(), associations: [], context: {} }];
    memoryHandler.onEvent!(node, config, ctx, { type: 'memory_load_response', memories: loaded });
    expect(node.__memoryState.nextId).toBe(11);
  });
  it('ignores non-array payload', () => {
    const { node, ctx, config } = attach();
    memoryHandler.onEvent!(node, config, ctx, { type: 'memory_load_response', memories: null });
    expect(node.__memoryState.memories.size).toBe(0);
  });
});

// ─── onUpdate — decay ─────────────────────────────────────────────────────────

describe('memoryHandler.onUpdate — decay timer', () => {
  it('accumulates decayTimer', () => {
    const { node, ctx, config } = attach({ decay_interval: 60 });
    memoryHandler.onUpdate!(node, config, ctx, 5);
    expect(node.__memoryState.decayTimer).toBe(5);
  });
  it('resets timer after decay_interval', () => {
    const { node, ctx, config } = attach({ decay_interval: 10 });
    remember(node, ctx, config, { content: 'x', importance: 0.9 });
    memoryHandler.onUpdate!(node, config, ctx, 11);
    expect(node.__memoryState.decayTimer).toBe(0);
  });
  it('emits memory_forgotten for memories below threshold', () => {
    const { node, ctx, config } = attach({ decay_interval: 1, importance_threshold: 0.5 });
    remember(node, ctx, config, { content: 'very old memory', importance: 0.49 });
    // Force lastAccessed to be very old
    const m = [...node.__memoryState.memories.values()][0];
    m.lastAccessed = Date.now() - 1000 * 60 * 60 * 48; // 48 hours ago
    ctx.emit.mockClear();
    memoryHandler.onUpdate!(node, config, ctx, 2);
    expect(ctx.emit).toHaveBeenCalledWith('memory_forgotten', expect.anything());
  });
});
