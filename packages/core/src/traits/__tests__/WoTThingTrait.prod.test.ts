/**
 * WoTThingTrait — Production Test Suite
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wotThingHandler, hasWoTThingTrait, getWoTThingState, getCachedThingDescription, invalidateThingDescription } from '../WoTThingTrait';

function makeNode() { return { id: 'wot_node', name: 'MyThing' }; }
function makeCtx(state: any = {}) {
  return {
    emit: vi.fn(),
    getState: vi.fn().mockReturnValue(state),
  };
}
function attach(cfg: any = {}, ctxState: any = {}) {
  const node = makeNode();
  const ctx = makeCtx(ctxState);
  const config = { ...wotThingHandler.defaultConfig!, ...cfg };
  wotThingHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('wotThingHandler.defaultConfig', () => {
  const d = wotThingHandler.defaultConfig!;
  it('title=""', () => expect(d.title).toBe(''));
  it('security=nosec', () => expect(d.security).toBe('nosec'));
  it('version=1.0.0', () => expect(d.version).toBe('1.0.0'));
  it('auto_generate=false', () => expect(d.auto_generate).toBe(false));
  it('description=undefined', () => expect(d.description).toBeUndefined());
  it('base=undefined', () => expect(d.base).toBeUndefined());
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('wotThingHandler.onAttach', () => {
  it('creates __wotThingState', () => expect(attach().node.__wotThingState).toBeDefined());
  it('tdGenerated=false', () => expect(attach().node.__wotThingState.tdGenerated).toBe(false));
  it('lastGenerated=0', () => expect(attach().node.__wotThingState.lastGenerated).toBe(0));
  it('cachedTD=null', () => expect(attach().node.__wotThingState.cachedTD).toBeNull());
  it('validationErrors=[]', () => expect(attach().node.__wotThingState.validationErrors).toEqual([]));
  it('emits wot_thing_attached', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_attached', expect.objectContaining({ nodeId: 'MyThing' }));
  });
  it('does NOT emit wot_thing_generate synchronously when auto_generate=false', () => {
    const { ctx } = attach({ auto_generate: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('wot_thing_generate', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('wotThingHandler.onDetach', () => {
  it('removes __wotThingState', () => {
    const { node, config, ctx } = attach();
    wotThingHandler.onDetach!(node, config, ctx);
    expect(node.__wotThingState).toBeUndefined();
  });
  it('emits wot_thing_detached', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    wotThingHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_detached', expect.objectContaining({ nodeId: 'MyThing' }));
  });
  it('no wot_thing_detached when state missing', () => {
    const node = makeNode() as any;
    const ctx = makeCtx();
    const config = { ...wotThingHandler.defaultConfig! };
    // Do NOT attach — no __wotThingState
    wotThingHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('wot_thing_detached', expect.anything());
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('wotThingHandler.onUpdate', () => {
  it('stores hash on first call (no stale emit on first)', () => {
    const { node, config, ctx } = attach({}, { value: 1 });
    ctx.emit.mockClear();
    wotThingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('wot_thing_stale', expect.anything());
  });
  it('emits wot_thing_stale when state changes after tdGenerated=true', () => {
    const ctx = makeCtx({ value: 1 });
    const node = makeNode() as any;
    const config = { ...wotThingHandler.defaultConfig! };
    wotThingHandler.onAttach!(node, config, ctx);
    // First update — set hash
    wotThingHandler.onUpdate!(node, config, ctx, 0.016);
    // Mark TD as generated
    node.__wotThingState.tdGenerated = true;
    node.__wotThingState.cachedTD = '<td>';
    ctx.emit.mockClear();
    // Change state
    ctx.getState.mockReturnValue({ value: 2 });
    wotThingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_stale', expect.objectContaining({ nodeId: 'MyThing' }));
  });
  it('no wot_thing_stale when state unchanged', () => {
    const { node, config, ctx } = attach({}, { value: 42 });
    wotThingHandler.onUpdate!(node, config, ctx, 0.016);
    node.__wotThingState.tdGenerated = true;
    ctx.emit.mockClear();
    wotThingHandler.onUpdate!(node, config, ctx, 0.016); // same state
    expect(ctx.emit).not.toHaveBeenCalledWith('wot_thing_stale', expect.anything());
  });
  it('stale emit nullifies cachedTD', () => {
    const ctx = makeCtx({ v: 1 });
    const node = makeNode() as any;
    const config = { ...wotThingHandler.defaultConfig! };
    wotThingHandler.onAttach!(node, config, ctx);
    wotThingHandler.onUpdate!(node, config, ctx, 0.016);
    node.__wotThingState.tdGenerated = true;
    node.__wotThingState.cachedTD = '<td_cached>';
    ctx.getState.mockReturnValue({ v: 99 });
    wotThingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__wotThingState.cachedTD).toBeNull();
  });
  it('no stale if tdGenerated=false even when state changes', () => {
    const { node, config, ctx } = attach({}, { v: 1 });
    wotThingHandler.onUpdate!(node, config, ctx, 0.016);
    ctx.emit.mockClear();
    ctx.getState.mockReturnValue({ v: 2 });
    wotThingHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('wot_thing_stale', expect.anything());
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('wotThingHandler.onEvent', () => {
  it('wot_generate_request emits wot_thing_generate', () => {
    const { node, config, ctx } = attach({ title: 'Lamp' });
    ctx.emit.mockClear();
    wotThingHandler.onEvent!(node, config, ctx, { type: 'wot_generate_request' });
    expect(ctx.emit).toHaveBeenCalledWith('wot_thing_generate', expect.objectContaining({ nodeId: 'MyThing' }));
  });
  it('wot_td_generated sets tdGenerated=true', () => {
    const { node, config, ctx } = attach();
    wotThingHandler.onEvent!(node, config, ctx, { type: 'wot_td_generated', td: '<td_json>', errors: [] });
    expect(node.__wotThingState.tdGenerated).toBe(true);
  });
  it('wot_td_generated stores cachedTD', () => {
    const { node, config, ctx } = attach();
    wotThingHandler.onEvent!(node, config, ctx, { type: 'wot_td_generated', td: '{"@context":"..."}', errors: [] });
    expect(node.__wotThingState.cachedTD).toBe('{"@context":"..."}');
  });
  it('wot_td_generated stores validationErrors', () => {
    const { node, config, ctx } = attach();
    wotThingHandler.onEvent!(node, config, ctx, { type: 'wot_td_generated', td: null, errors: ['missing title'] });
    expect(node.__wotThingState.validationErrors).toEqual(['missing title']);
  });
  it('wot_td_generated updates lastGenerated timestamp', () => {
    const { node, config, ctx } = attach();
    const before = Date.now();
    wotThingHandler.onEvent!(node, config, ctx, { type: 'wot_td_generated', td: null, errors: [] });
    expect(node.__wotThingState.lastGenerated).toBeGreaterThanOrEqual(before);
  });
  it('unknown event is silently ignored', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    expect(() => wotThingHandler.onEvent!(node, config, ctx, { type: '__noop__' })).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── Helper functions ─────────────────────────────────────────────────────────

describe('WoTThingTrait helper functions', () => {
  it('hasWoTThingTrait returns true after attach', () => {
    const { node } = attach();
    expect(hasWoTThingTrait(node)).toBe(true);
  });
  it('hasWoTThingTrait returns false when not attached', () => {
    expect(hasWoTThingTrait(makeNode())).toBe(false);
  });
  it('getWoTThingState returns state after attach', () => {
    const { node } = attach();
    expect(getWoTThingState(node)).toBe(node.__wotThingState);
  });
  it('getWoTThingState returns null when not attached', () => {
    expect(getWoTThingState(makeNode())).toBeNull();
  });
  it('getCachedThingDescription returns cachedTD after generation event', () => {
    const { node, config, ctx } = attach();
    wotThingHandler.onEvent!(node, config, ctx, { type: 'wot_td_generated', td: 'TD_VALUE', errors: [] });
    expect(getCachedThingDescription(node)).toBe('TD_VALUE');
  });
  it('getCachedThingDescription returns null when no TD generated', () => {
    const { node } = attach();
    expect(getCachedThingDescription(node)).toBeNull();
  });
  it('invalidateThingDescription sets cachedTD=null', () => {
    const { node, config, ctx } = attach();
    wotThingHandler.onEvent!(node, config, ctx, { type: 'wot_td_generated', td: 'TD', errors: [] });
    invalidateThingDescription(node);
    expect(node.__wotThingState.cachedTD).toBeNull();
  });
  it('invalidateThingDescription no-op when not attached', () => {
    expect(() => invalidateThingDescription(makeNode())).not.toThrow();
  });
});
