/**
 * AudioPortalTrait — Production Test Suite
 *
 * Tests: defaultConfig, onAttach (state + audio_portal_register),
 * onDetach (unregister), onUpdate (smooth open/close lerp + dB transmission + portal_update),
 * onEvent open/close, set_openness, audio_source_route (zone match + max_sources guard),
 * audio_source_unroute, audio_portal_query.
 */
import { describe, it, expect, vi } from 'vitest';
import { audioPortalHandler } from '../AudioPortalTrait';

function makeNode() {
  return { id: 'portal_1', type: 'object' };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...audioPortalHandler.defaultConfig!, ...config };
  audioPortalHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('audioPortalHandler.defaultConfig', () => {
  it('opening_size = 1', () => expect(audioPortalHandler.defaultConfig!.opening_size).toBe(1));
  it('connected_zones = ["",""]', () =>
    expect(audioPortalHandler.defaultConfig!.connected_zones).toEqual(['', '']));
  it('transmission_loss = 6 dB', () =>
    expect(audioPortalHandler.defaultConfig!.transmission_loss).toBe(6));
  it('diffraction = true', () => expect(audioPortalHandler.defaultConfig!.diffraction).toBe(true));
  it('frequency_filtering = true', () =>
    expect(audioPortalHandler.defaultConfig!.frequency_filtering).toBe(true));
  it('low_pass_frequency = 8000', () =>
    expect(audioPortalHandler.defaultConfig!.low_pass_frequency).toBe(8000));
  it('open_by_default = true', () =>
    expect(audioPortalHandler.defaultConfig!.open_by_default).toBe(true));
  it('max_sources = 8', () => expect(audioPortalHandler.defaultConfig!.max_sources).toBe(8));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('audioPortalHandler.onAttach', () => {
  it('creates __audioPortalState', () => {
    const { node } = attachNode();
    expect((node as any).__audioPortalState).toBeDefined();
  });
  it('isOpen = true when open_by_default=true', () => {
    const { node } = attachNode({ open_by_default: true });
    expect((node as any).__audioPortalState.isOpen).toBe(true);
  });
  it('isOpen = false when open_by_default=false', () => {
    const { node } = attachNode({ open_by_default: false });
    expect((node as any).__audioPortalState.isOpen).toBe(false);
  });
  it('openAmount = 1 when open_by_default=true', () => {
    const { node } = attachNode({ open_by_default: true });
    expect((node as any).__audioPortalState.openAmount).toBe(1);
  });
  it('openAmount = 0 when open_by_default=false', () => {
    const { node } = attachNode({ open_by_default: false });
    expect((node as any).__audioPortalState.openAmount).toBe(0);
  });
  it('currentTransmission = 1 when open', () => {
    const { node } = attachNode({ open_by_default: true });
    expect((node as any).__audioPortalState.currentTransmission).toBe(1);
  });
  it('sourceZone = connected_zones[0]', () => {
    const { node } = attachNode({
      connected_zones: ['living_room', 'kitchen'] as [string, string],
    });
    expect((node as any).__audioPortalState.sourceZone).toBe('living_room');
  });
  it('targetZone = connected_zones[1]', () => {
    const { node } = attachNode({
      connected_zones: ['living_room', 'kitchen'] as [string, string],
    });
    expect((node as any).__audioPortalState.targetZone).toBe('kitchen');
  });
  it('activeConnections is empty Set', () => {
    const { node } = attachNode();
    expect((node as any).__audioPortalState.activeConnections.size).toBe(0);
  });
  it('emits audio_portal_register with zones and openingSize', () => {
    const { ctx } = attachNode({
      connected_zones: ['A', 'B'] as [string, string],
      opening_size: 2,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_portal_register',
      expect.objectContaining({ zones: ['A', 'B'], openingSize: 2 })
    );
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('audioPortalHandler.onDetach', () => {
  it('removes __audioPortalState', () => {
    const { node, cfg, ctx } = attachNode();
    audioPortalHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__audioPortalState).toBeUndefined();
  });
  it('emits audio_portal_unregister', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    audioPortalHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('audio_portal_unregister', expect.any(Object));
  });
});

// ─── onUpdate — smooth lerp + transmission ───────────────────────────────────

describe('audioPortalHandler.onUpdate', () => {
  it('lerps openAmount toward 1 when isOpen=true and openAmount<1', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: false }); // starts closed
    (node as any).__audioPortalState.isOpen = true;
    const before = (node as any).__audioPortalState.openAmount; // 0
    audioPortalHandler.onUpdate!(node, cfg, ctx, 0.1); // delta=0.1 → speed=0.3
    const after = (node as any).__audioPortalState.openAmount;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(1);
  });
  it('lerps openAmount toward 0 when isOpen=false and openAmount>0', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: true }); // starts open
    (node as any).__audioPortalState.isOpen = false;
    const before = (node as any).__audioPortalState.openAmount; // 1
    audioPortalHandler.onUpdate!(node, cfg, ctx, 0.1);
    const after = (node as any).__audioPortalState.openAmount;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(0);
  });
  it('currentTransmission = 1 when fully open (openAmount=1, loss=0)', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: true, transmission_loss: 6 });
    // fully open: dbLoss = 6*(1-1)=0 → transmission = 10^0 = 1
    audioPortalHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__audioPortalState.currentTransmission).toBeCloseTo(1, 4);
  });
  it('currentTransmission < 1 when partially open', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: false, transmission_loss: 6 });
    (node as any).__audioPortalState.isOpen = true;
    (node as any).__audioPortalState.openAmount = 0.5;
    const delta = 0.016;
    audioPortalHandler.onUpdate!(node, cfg, ctx, delta);
    // After lerp: openAmount = min(0.5 + delta*3, 1) = min(0.5+0.048, 1) = 0.548
    const postLerpOpen = Math.min(0.5 + delta * 3, 1);
    const dbLoss = 6 * (1 - postLerpOpen);
    const expectedTransmission = Math.pow(10, -dbLoss / 20);
    expect((node as any).__audioPortalState.currentTransmission).toBeCloseTo(
      expectedTransmission,
      4
    );
    expect((node as any).__audioPortalState.currentTransmission).toBeLessThan(1);
  });
  it('emits audio_portal_update when there are active connections', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: true });
    (node as any).__audioPortalState.activeConnections.add('src_1');
    ctx.emit.mockClear();
    audioPortalHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('audio_portal_update', expect.any(Object));
  });
  it('does NOT emit audio_portal_update when no active connections', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: true });
    ctx.emit.mockClear();
    audioPortalHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_portal_update', expect.any(Object));
  });
  it('lowPassFreq proportional to openAmount when frequency_filtering=true', () => {
    const { node, cfg, ctx } = attachNode({
      open_by_default: true,
      frequency_filtering: true,
      low_pass_frequency: 8000,
    });
    // openAmount starts at 1, isOpen=true → no lerp needed. lowPassFreq = 8000 * 1 = 8000
    (node as any).__audioPortalState.activeConnections.add('x');
    ctx.emit.mockClear();
    audioPortalHandler.onUpdate!(node, cfg, ctx, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_portal_update');
    expect(call?.[1].lowPassFreq).toBeCloseTo(8000, 0); // 8000 * 1.0 (fully open)
  });
  it('lowPassFreq = 22000 when frequency_filtering=false', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: true, frequency_filtering: false });
    (node as any).__audioPortalState.activeConnections.add('x');
    ctx.emit.mockClear();
    audioPortalHandler.onUpdate!(node, cfg, ctx, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_portal_update');
    expect(call?.[1].lowPassFreq).toBe(22000);
  });
});

// ─── onEvent — open / close ───────────────────────────────────────────────────

describe('audioPortalHandler.onEvent — open/close', () => {
  it('audio_portal_open sets isOpen=true and emits state_change', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: false });
    ctx.emit.mockClear();
    audioPortalHandler.onEvent!(node, cfg, ctx, { type: 'audio_portal_open' });
    expect((node as any).__audioPortalState.isOpen).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_portal_state_change',
      expect.objectContaining({ isOpen: true })
    );
  });
  it('audio_portal_close sets isOpen=false and emits state_change', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: true });
    ctx.emit.mockClear();
    audioPortalHandler.onEvent!(node, cfg, ctx, { type: 'audio_portal_close' });
    expect((node as any).__audioPortalState.isOpen).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_portal_state_change',
      expect.objectContaining({ isOpen: false })
    );
  });
});

// ─── onEvent — set_openness ───────────────────────────────────────────────────

describe('audioPortalHandler.onEvent — set_openness', () => {
  it('sets openAmount directly', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: false });
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_portal_set_openness',
      amount: 0.75,
    });
    expect((node as any).__audioPortalState.openAmount).toBe(0.75);
  });
  it('sets isOpen=true when amount > 0', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: false });
    audioPortalHandler.onEvent!(node, cfg, ctx, { type: 'audio_portal_set_openness', amount: 0.1 });
    expect((node as any).__audioPortalState.isOpen).toBe(true);
  });
  it('sets isOpen=false when amount = 0', () => {
    const { node, cfg, ctx } = attachNode({ open_by_default: true });
    audioPortalHandler.onEvent!(node, cfg, ctx, { type: 'audio_portal_set_openness', amount: 0 });
    expect((node as any).__audioPortalState.isOpen).toBe(false);
  });
});

// ─── onEvent — audio_source_route ────────────────────────────────────────────

describe('audioPortalHandler.onEvent — audio_source_route', () => {
  it('adds source when zones match (forward direction)', () => {
    const { node, cfg, ctx } = attachNode({
      connected_zones: ['hall', 'room'] as [string, string],
      max_sources: 5,
    });
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_source_route',
      sourceId: 'src_A',
      fromZone: 'hall',
      toZone: 'room',
    });
    expect((node as any).__audioPortalState.activeConnections.has('src_A')).toBe(true);
  });
  it('adds source when zones match (reverse direction)', () => {
    const { node, cfg, ctx } = attachNode({
      connected_zones: ['hall', 'room'] as [string, string],
      max_sources: 5,
    });
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_source_route',
      sourceId: 'src_B',
      fromZone: 'room',
      toZone: 'hall',
    });
    expect((node as any).__audioPortalState.activeConnections.has('src_B')).toBe(true);
  });
  it('emits audio_portal_route_source with transmission and diffraction', () => {
    const { node, cfg, ctx } = attachNode({
      connected_zones: ['A', 'B'] as [string, string],
      max_sources: 5,
      diffraction: true,
    });
    ctx.emit.mockClear();
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_source_route',
      sourceId: 'src_C',
      fromZone: 'A',
      toZone: 'B',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_portal_route_source',
      expect.objectContaining({ sourceId: 'src_C', diffraction: true })
    );
  });
  it('does NOT add source when zones do not match', () => {
    const { node, cfg, ctx } = attachNode({
      connected_zones: ['hall', 'room'] as [string, string],
    });
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_source_route',
      sourceId: 'src_X',
      fromZone: 'outside',
      toZone: 'attic',
    });
    expect((node as any).__audioPortalState.activeConnections.has('src_X')).toBe(false);
  });
  it('rejects source when max_sources reached', () => {
    const { node, cfg, ctx } = attachNode({
      connected_zones: ['zone1', 'zone2'] as [string, string],
      max_sources: 1,
    });
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_source_route',
      sourceId: 'src_1',
      fromZone: 'zone1',
      toZone: 'zone2',
    });
    ctx.emit.mockClear();
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_source_route',
      sourceId: 'src_2',
      fromZone: 'zone1',
      toZone: 'zone2',
    });
    expect((node as any).__audioPortalState.activeConnections.has('src_2')).toBe(false);
  });
});

// ─── onEvent — unroute + query ────────────────────────────────────────────────

describe('audioPortalHandler.onEvent — unroute + query', () => {
  it('audio_source_unroute removes source from activeConnections', () => {
    const { node, cfg, ctx } = attachNode({
      connected_zones: ['A', 'B'] as [string, string],
      max_sources: 5,
    });
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_source_route',
      sourceId: 'src_D',
      fromZone: 'A',
      toZone: 'B',
    });
    audioPortalHandler.onEvent!(node, cfg, ctx, {
      type: 'audio_source_unroute',
      sourceId: 'src_D',
    });
    expect((node as any).__audioPortalState.activeConnections.has('src_D')).toBe(false);
  });
  it('audio_portal_query emits audio_portal_info with state snapshot', () => {
    const { node, cfg, ctx } = attachNode({
      open_by_default: true,
      connected_zones: ['hall', 'kitchen'] as [string, string],
    });
    ctx.emit.mockClear();
    audioPortalHandler.onEvent!(node, cfg, ctx, { type: 'audio_portal_query', queryId: 'q42' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_portal_info',
      expect.objectContaining({
        queryId: 'q42',
        isOpen: true,
        zones: ['hall', 'kitchen'],
        activeConnections: 0,
      })
    );
  });
});
