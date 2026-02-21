import { describe, it, expect, vi } from 'vitest';
import { memoryHandler } from '../MemoryTrait';
type MemConfig = NonNullable<Parameters<typeof memoryHandler.onAttach>[1]>;
function mkCfg(o: Partial<MemConfig> = {}): MemConfig { return { ...memoryHandler.defaultConfig!, ...o }; }
function mkNode(id = 'mem-node') { return { id } as any; }
function mkCtx() { const e: any[] = []; return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any }; }
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) { memoryHandler.onAttach!(node, cfg, ctx as any); ctx.emitted.length = 0; return { node, ctx, cfg }; }
function remember(node: any, ctx: any, content: string, tags: string[] = [], importance = 0.5) {
  memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'remember', content, tags, importance, memoryType: 'episodic' } as any);
}

describe('memoryHandler — defaultConfig', () => {
  it('memory_type = episodic', () => expect(memoryHandler.defaultConfig?.memory_type).toBe('episodic'));
  it('capacity = 1000', () => expect(memoryHandler.defaultConfig?.capacity).toBe(1000));
  it('decay_rate = 0.01', () => expect(memoryHandler.defaultConfig?.decay_rate).toBe(0.01));
  it('working_memory_size = 7', () => expect(memoryHandler.defaultConfig?.working_memory_size).toBe(7));
  it('retrieval_mode = relevance', () => expect(memoryHandler.defaultConfig?.retrieval_mode).toBe('relevance'));
});

describe('memoryHandler — onAttach', () => {
  it('creates __memoryState', () => { const { node } = attach(); expect((node as any).__memoryState).toBeDefined(); });
  it('memories is empty Map', () => { const { node } = attach(); expect((node as any).__memoryState.memories.size).toBe(0); });
  it('workingMemory is empty', () => { const { node } = attach(); expect((node as any).__memoryState.workingMemory).toHaveLength(0); });
  it('emits memory_load_request when persist=true', () => {
    const node = mkNode(); const ctx = mkCtx();
    memoryHandler.onAttach!(node, mkCfg({ persist_across_sessions: true }), ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'memory_load_request')).toBe(true);
  });
  it('no memory_load_request when persist=false', () => {
    const node = mkNode(); const ctx = mkCtx();
    memoryHandler.onAttach!(node, mkCfg({ persist_across_sessions: false }), ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'memory_load_request')).toBe(false);
  });
});

describe('memoryHandler — onDetach', () => {
  it('emits memory_save when persist=true', () => {
    const { node, ctx, cfg } = attach(mkCfg({ persist_across_sessions: true }));
    memoryHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'memory_save')).toBe(true);
  });
  it('removes __memoryState', () => {
    const { node, ctx, cfg } = attach();
    memoryHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__memoryState).toBeUndefined();
  });
});

describe('memoryHandler — remember', () => {
  it('stores memory in map', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'I saw a dragon');
    expect((node as any).__memoryState.memories.size).toBe(1);
  });
  it('emits memory_stored', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'hello world');
    expect(ctx.emitted.some((e: any) => e.type === 'memory_stored')).toBe(true);
  });
  it('stored memory has correct content and importance', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'danger zone', ['combat'], 0.9);
    const mem = Array.from((node as any).__memoryState.memories.values())[0] as any;
    expect(mem.content).toBe('danger zone');
    expect(mem.importance).toBe(0.9);
    expect(mem.tags).toContain('combat');
  });
  it('adds to workingMemory', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'event one');
    expect((node as any).__memoryState.workingMemory).toHaveLength(1);
  });
  it('caps workingMemory at working_memory_size', () => {
    const cfg2 = mkCfg({ working_memory_size: 2 });
    const { node, ctx } = attach(cfg2);
    // Must pass cfg2 (with working_memory_size=2) to each onEvent call
    memoryHandler.onEvent!(node, cfg2, ctx as any, { type: 'remember', content: 'a', tags: [], importance: 0.5, memoryType: 'episodic' } as any);
    memoryHandler.onEvent!(node, cfg2, ctx as any, { type: 'remember', content: 'b', tags: [], importance: 0.5, memoryType: 'episodic' } as any);
    memoryHandler.onEvent!(node, cfg2, ctx as any, { type: 'remember', content: 'c', tags: [], importance: 0.5, memoryType: 'episodic' } as any);
    expect((node as any).__memoryState.workingMemory).toHaveLength(2);
  });
  it('generates unique ids per memory', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'one'); remember(node, ctx, 'two');
    const ids = Array.from((node as any).__memoryState.memories.keys());
    expect(new Set(ids).size).toBe(2);
  });
});

describe('memoryHandler — recall', () => {
  it('emits memory_recalled', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'the map shows treasure', ['map', 'treasure']);
    ctx.emitted.length = 0;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'recall', query: 'treasure', tags: ['treasure'], limit: 5 } as any);
    expect(ctx.emitted.some((e: any) => e.type === 'memory_recalled')).toBe(true);
  });
  it('returns results matching query', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'forest is dark', ['forest']);
    remember(node, ctx, 'cave is cold', ['cave']);
    ctx.emitted.length = 0;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'recall', query: 'forest', tags: ['forest'] } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'memory_recalled');
    expect(ev?.payload.results.some((r: any) => r.content.includes('forest'))).toBe(true);
  });
  it('boosts importance on recall', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'rare experience', [], 0.5);
    const memId = Array.from((node as any).__memoryState.memories.keys())[0];
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'recall', query: 'rare experience', tags: [] } as any);
    const mem = (node as any).__memoryState.memories.get(memId) as any;
    expect(mem.importance).toBeGreaterThan(0.5);
  });
  it('accessCount increments on recall', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'accessed memory', []);
    const memId = Array.from((node as any).__memoryState.memories.keys())[0] as string;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'recall', query: 'accessed memory', tags: [] } as any);
    expect(((node as any).__memoryState.memories.get(memId) as any).accessCount).toBeGreaterThan(0);
  });
});

describe('memoryHandler — forget', () => {
  it('removes memory from map', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'to forget');
    const memId = Array.from((node as any).__memoryState.memories.keys())[0] as string;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'forget', memoryId: memId } as any);
    expect((node as any).__memoryState.memories.has(memId)).toBe(false);
  });
  it('emits memory_forgotten', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'deleted');
    const memId = Array.from((node as any).__memoryState.memories.keys())[0] as string;
    ctx.emitted.length = 0;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'forget', memoryId: memId } as any);
    expect(ctx.emitted.some((e: any) => e.type === 'memory_forgotten')).toBe(true);
  });
  it('no-op for unknown memoryId', () => {
    const { node, ctx } = attach();
    expect(() => memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'forget', memoryId: 'ghost' } as any)).not.toThrow();
  });
  it('removes from workingMemory on forget', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'working mem entry');
    const memId = Array.from((node as any).__memoryState.memories.keys())[0] as string;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'forget', memoryId: memId } as any);
    expect((node as any).__memoryState.workingMemory.includes(memId)).toBe(false);
  });
});

describe('memoryHandler — associate', () => {
  it('bidirectionally links two memories', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'source mem'); remember(node, ctx, 'target mem');
    const ids = Array.from((node as any).__memoryState.memories.keys()) as string[];
    const [srcId, tgtId] = ids;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'associate', sourceId: srcId, targetId: tgtId } as any);
    const src = (node as any).__memoryState.memories.get(srcId) as any;
    const tgt = (node as any).__memoryState.memories.get(tgtId) as any;
    expect(src.associations.includes(tgtId)).toBe(true);
    expect(tgt.associations.includes(srcId)).toBe(true);
  });
  it('emits memories_associated', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'a'); remember(node, ctx, 'b');
    const [srcId, tgtId] = Array.from((node as any).__memoryState.memories.keys()) as string[];
    ctx.emitted.length = 0;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'associate', sourceId: srcId, targetId: tgtId } as any);
    expect(ctx.emitted.some((e: any) => e.type === 'memories_associated')).toBe(true);
  });
});

describe('memoryHandler — get_working_memory', () => {
  it('emits working_memory_result with current working set', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'latest event');
    ctx.emitted.length = 0;
    memoryHandler.onEvent!(node, mkCfg(), ctx as any, { type: 'get_working_memory', queryId: 'wq1' } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'working_memory_result');
    expect(ev?.payload.memories).toHaveLength(1);
  });
});

describe('memoryHandler — onUpdate decay', () => {
  it('no-op before decay_interval', () => {
    const { node, ctx } = attach();
    remember(node, ctx, 'persistent');
    ctx.emitted.length = 0;
    memoryHandler.onUpdate!(node, mkCfg({ decay_interval: 60 }), ctx as any, 0.016);
    expect((node as any).__memoryState.memories.size).toBe(1);
  });
  it('removes memory below importance_threshold after forced decay tick', () => {
    const { node, ctx } = attach(mkCfg({ decay_rate: 999, importance_threshold: 0.5, decay_interval: 1 }));
    remember(node, ctx, 'weak memory', [], 0.4);
    (node as any).__memoryState.decayTimer = 1; // force tick
    // Set lastAccessed to 24h ago to maximize decay
    const mem = Array.from((node as any).__memoryState.memories.values())[0] as any;
    mem.lastAccessed = Date.now() - 24 * 60 * 60 * 1000;
    ctx.emitted.length = 0;
    memoryHandler.onUpdate!(node, mkCfg({ decay_rate: 999, importance_threshold: 0.5, decay_interval: 1 }), ctx as any, 0.1);
    expect(ctx.emitted.some((e: any) => e.type === 'memory_forgotten')).toBe(true);
  });
});
