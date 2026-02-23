/**
 * WoTThingTrait Production Tests
 *
 * Mark an object as a W3C Web of Things "Thing" for TD generation.
 * Covers: defaultConfig, onAttach (state init + wot_thing_attached + auto_generate),
 * onDetach (state guard), onUpdate (state hash diff → stale),
 * 2 onEvent types, and 4 utility exports.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  wotThingHandler,
  hasWoTThingTrait,
  getWoTThingState,
  getCachedThingDescription,
  invalidateThingDescription,
} from '../WoTThingTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id = 'wot_test', name = 'wot_thing') {
  return { id, name } as any;
}
function makeCtx(initialState: Record<string, unknown> = {}) {
  let _state: Record<string, unknown> = { ...initialState };
  return {
    emit: vi.fn(),
    getState: () => _state,
    setState: (s: Record<string, unknown>) => { _state = { ..._state, ...s }; },
    // helper to mutate state between calls
    _mutateState: (s: Record<string, unknown>) => { _state = { ..._state, ...s }; },
  };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...wotThingHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  wotThingHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) { return node.__wotThingState as any; }
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  wotThingHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('WoTThingTrait — defaultConfig', () => {
  it('has 8 fields with correct defaults', () => {
    const d = wotThingHandler.defaultConfig!;
    expect(d.title).toBe('');
    expect(d.description).toBeUndefined();
    expect(d.security).toBe('nosec');
    expect(d.base).toBeUndefined();
    expect(d.id).toBeUndefined();
    expect(d.version).toBe('1.0.0');
    expect(d.auto_generate).toBe(false);
    expect(d.output_path).toBeUndefined();
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('WoTThingTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.tdGenerated).toBe(false);
    expect(s.lastGenerated).toBe(0);
    expect(s.cachedTD).toBeNull();
    expect(s.validationErrors).toEqual([]);
  });

  it('emits wot_thing_attached with nodeId=node.name and config', () => {
    const node = makeNode('n1', 'MyThing');
    const { ctx, cfg } = attach(node, { title: 'My Thing', security: 'bearer' });
    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_attached', expect.objectContaining({
      nodeId: 'MyThing', config: cfg,
    }));
  });

  it('schedules wot_thing_generate via setTimeout when auto_generate=true', async () => {
    vi.useFakeTimers();
    const node = makeNode();
    const { ctx } = attach(node, { auto_generate: true });
    ctx.emit.mockClear();
    vi.runAllTimers(); // flush the setTimeout(() => emit, 0)
    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_generate', expect.objectContaining({ nodeId: node.name }));
    vi.useRealTimers();
  });

  it('does NOT schedule wot_thing_generate when auto_generate=false', () => {
    vi.useFakeTimers();
    const node = makeNode();
    const { ctx } = attach(node, { auto_generate: false });
    ctx.emit.mockClear();
    vi.runAllTimers();
    expect(ctx.emit).not.toHaveBeenCalledWith('wot_thing_generate', expect.any(Object));
    vi.useRealTimers();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('WoTThingTrait — onDetach', () => {
  it('emits wot_thing_detached when state exists', () => {
    const node = makeNode('n', 'MyThing');
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    wotThingHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_detached', { nodeId: 'MyThing' });
  });

  it('removes __wotThingState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    wotThingHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__wotThingState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('WoTThingTrait — onUpdate', () => {
  it('sets __wotThingStateHash on first call', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    wotThingHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(node.__wotThingStateHash).toBeDefined();
  });

  it('does NOT emit wot_thing_stale on first update (hadPreviousHash=false)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    wotThingHandler.onUpdate!(node, cfg, ctx as any, 0.016); // first update
    expect(ctx.emit).not.toHaveBeenCalledWith('wot_thing_stale', expect.any(Object));
  });

  it('emits wot_thing_stale when state changes after tdGenerated=true', () => {
    const node = makeNode('n', 'T');
    const ctx = makeCtx({ count: 1 });
    const cfg = { ...wotThingHandler.defaultConfig! } as any;
    wotThingHandler.onAttach!(node, cfg, ctx as any);
    st(node).tdGenerated = true;
    ctx.emit.mockClear();

    // First update — sets initial hash (count=1)
    wotThingHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    ctx.emit.mockClear();

    // Mutate the context state (simulates node state change)
    ctx._mutateState({ count: 2 });
    wotThingHandler.onUpdate!(node, cfg, ctx as any, 0.016);

    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_stale', expect.objectContaining({ nodeId: 'T' }));
    expect(st(node).cachedTD).toBeNull();
  });

  it('does NOT emit stale when tdGenerated=false (even if state changes)', () => {
    const node = makeNode('n', 'T');
    const ctx = makeCtx({ count: 1 });
    const cfg = { ...wotThingHandler.defaultConfig! } as any;
    wotThingHandler.onAttach!(node, cfg, ctx as any);
    st(node).tdGenerated = false;
    ctx.emit.mockClear();
    wotThingHandler.onUpdate!(node, cfg, ctx as any, 0.016); // sets hash
    ctx.emit.mockClear();
    ctx._mutateState({ count: 99 });
    wotThingHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('wot_thing_stale', expect.any(Object));
  });
});

// ─── onEvent — wot_generate_request ──────────────────────────────────────────

describe('WoTThingTrait — onEvent: wot_generate_request', () => {
  it('emits wot_thing_generate with nodeId and config', () => {
    const node = makeNode('n', 'MyThing');
    const { cfg, ctx } = attach(node, { title: 'My Thing', security: 'oauth2' });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'wot_generate_request' });
    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_generate', expect.objectContaining({
      nodeId: 'MyThing',
    }));
  });
});

// ─── onEvent — wot_td_generated ───────────────────────────────────────────────

describe('WoTThingTrait — onEvent: wot_td_generated', () => {
  it('sets tdGenerated=true, stores cachedTD, clears validationErrors', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'wot_td_generated', td: '{"@type":"Thing"}', errors: [] });
    expect(st(node).tdGenerated).toBe(true);
    expect(st(node).cachedTD).toBe('{"@type":"Thing"}');
    expect(st(node).validationErrors).toEqual([]);
    expect(st(node).lastGenerated).toBeGreaterThan(0);
  });

  it('stores validationErrors when present', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'wot_td_generated', td: '{}', errors: ['missing title'] });
    expect(st(node).validationErrors).toEqual(['missing title']);
  });

  it('cachedTD is null when td not provided', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'wot_td_generated' });
    expect(st(node).cachedTD).toBeNull();
  });
});

// ─── Utility exports ──────────────────────────────────────────────────────────

describe('WoTThingTrait — utility exports', () => {
  it('hasWoTThingTrait returns false before attach', () => {
    const node = makeNode();
    expect(hasWoTThingTrait(node)).toBe(false);
  });

  it('hasWoTThingTrait returns true after attach', () => {
    const node = makeNode();
    attach(node);
    expect(hasWoTThingTrait(node)).toBe(true);
  });

  it('getWoTThingState returns null for fresh node', () => {
    const node = makeNode();
    expect(getWoTThingState(node)).toBeNull();
  });

  it('getWoTThingState returns state after attach', () => {
    const node = makeNode();
    attach(node);
    expect(getWoTThingState(node)).toBe(st(node));
  });

  it('getCachedThingDescription returns null before TD generated', () => {
    const node = makeNode();
    attach(node);
    expect(getCachedThingDescription(node)).toBeNull();
  });

  it('getCachedThingDescription returns the TD string after generation', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'wot_td_generated', td: '{"id":"urn:thing:1"}', errors: [] });
    expect(getCachedThingDescription(node)).toBe('{"id":"urn:thing:1"}');
  });

  it('invalidateThingDescription sets cachedTD to null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'wot_td_generated', td: '{"id":"urn:thing:1"}', errors: [] });
    invalidateThingDescription(node);
    expect(getCachedThingDescription(node)).toBeNull();
  });
});
