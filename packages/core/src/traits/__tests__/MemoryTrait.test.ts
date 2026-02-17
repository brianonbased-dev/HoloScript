import { describe, it, expect, beforeEach } from 'vitest';
import { memoryHandler } from '../MemoryTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('MemoryTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    memory_type: 'episodic' as const,
    capacity: 100,
    decay_rate: 0.01,
    decay_interval: 60,
    importance_threshold: 0.3,
    retrieval_mode: 'relevance' as const,
    working_memory_size: 3,
    persist_across_sessions: false,
    consolidation_interval: 300,
  };

  beforeEach(() => {
    node = createMockNode('agent');
    ctx = createMockContext();
    attachTrait(memoryHandler, node, cfg, ctx);
  });

  it('initializes with empty memory', () => {
    const s = (node as any).__memoryState;
    expect(s.memories.size).toBe(0);
    expect(s.workingMemory.length).toBe(0);
  });

  it('stores a memory via remember event', () => {
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'saw the dragon', tags: ['enemy'], importance: 0.8 });
    expect((node as any).__memoryState.memories.size).toBe(1);
    expect(getEventCount(ctx, 'memory_stored')).toBe(1);
  });

  it('adds to working memory on store', () => {
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'a' });
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'b' });
    expect((node as any).__memoryState.workingMemory.length).toBe(2);
  });

  it('caps working memory to configured size', () => {
    for (let i = 0; i < 5; i++) sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: `mem ${i}` });
    expect((node as any).__memoryState.workingMemory.length).toBe(cfg.working_memory_size);
  });

  it('recalls memories with matching tags', () => {
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'saw wolf', tags: ['danger'], importance: 0.9 });
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'found gold', tags: ['treasure'], importance: 0.5 });
    ctx.clearEvents();
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'recall', query: 'wolf', tags: ['danger'], limit: 5, queryId: 'q1' });
    const r = getLastEvent(ctx, 'memory_recalled') as any;
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results[0].content).toBe('saw wolf');
  });

  it('strengthens importance on recall', () => {
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'test', tags: ['x'], importance: 0.5 });
    const id = Array.from((node as any).__memoryState.memories.keys())[0];
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'recall', query: 'test', tags: ['x'] });
    expect((node as any).__memoryState.memories.get(id).importance).toBe(0.6);
  });

  it('forgets a memory explicitly', () => {
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'temp' });
    const id = Array.from((node as any).__memoryState.memories.keys())[0];
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'forget', memoryId: id });
    expect((node as any).__memoryState.memories.has(id)).toBe(false);
    expect(getEventCount(ctx, 'memory_forgotten')).toBe(1);
  });

  it('associates two memories', () => {
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'a' });
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'b' });
    const ids = Array.from((node as any).__memoryState.memories.keys());
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'associate', sourceId: ids[0], targetId: ids[1] });
    const m = (node as any).__memoryState.memories;
    expect(m.get(ids[0]).associations).toContain(ids[1]);
    expect(m.get(ids[1]).associations).toContain(ids[0]);
  });

  it('get_working_memory returns current working set', () => {
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'remember', content: 'x' });
    ctx.clearEvents();
    sendEvent(memoryHandler, node, cfg, ctx, { type: 'get_working_memory', queryId: 'wm1' });
    const r = getLastEvent(ctx, 'working_memory_result') as any;
    expect(r.memories.length).toBe(1);
  });

  it('cleans up on detach', () => {
    memoryHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__memoryState).toBeUndefined();
  });
});
