/**
 * ReverbZoneTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { reverbZoneHandler } from '../ReverbZoneTrait';

function makeNode() { return { id: 'rz_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...reverbZoneHandler.defaultConfig!, ...cfg };
  reverbZoneHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('reverbZoneHandler.defaultConfig', () => {
  const d = reverbZoneHandler.defaultConfig!;
  it('preset=room', () => expect(d.preset).toBe('room'));
  it('size=10', () => expect(d.size).toBe(10));
  it('decay_time=1.5', () => expect(d.decay_time).toBe(1.5));
  it('damping=0.5', () => expect(d.damping).toBe(0.5));
  it('diffusion=0.7', () => expect(d.diffusion).toBe(0.7));
  it('pre_delay=20', () => expect(d.pre_delay).toBe(20));
  it('wet_level=0.3', () => expect(d.wet_level).toBe(0.3));
  it('dry_level=1.0', () => expect(d.dry_level).toBe(1.0));
  it('shape=box', () => expect(d.shape).toBe('box'));
  it('priority=0', () => expect(d.priority).toBe(0));
  it('blend_distance=2', () => expect(d.blend_distance).toBe(2));
  it('impulse_response_url=""', () => expect(d.impulse_response_url).toBe(''));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('reverbZoneHandler.onAttach', () => {
  it('creates __reverbZoneState', () => expect(attach().node.__reverbZoneState).toBeDefined());
  it('listenersInZone is empty Set', () => expect(attach().node.__reverbZoneState.listenersInZone.size).toBe(0));
  it('currentWetLevel=0', () => expect(attach().node.__reverbZoneState.currentWetLevel).toBe(0));
  it('targetWetLevel=0', () => expect(attach().node.__reverbZoneState.targetWetLevel).toBe(0));
  it('isActive=true', () => expect(attach().node.__reverbZoneState.isActive).toBe(true));
  it('convolverLoaded=false', () => expect(attach().node.__reverbZoneState.convolverLoaded).toBe(false));
  it('emits reverb_zone_register', () => {
    const { ctx } = attach({ preset: 'hall', size: 20 });
    expect(ctx.emit).toHaveBeenCalledWith('reverb_zone_register', expect.objectContaining({
      preset: 'hall',
      size: 20,
    }));
  });
  it('reverb_zone_register includes decayTime/damping/diffusion', () => {
    const { ctx } = attach({ decay_time: 2.5, damping: 0.8 });
    expect(ctx.emit).toHaveBeenCalledWith('reverb_zone_register', expect.objectContaining({
      decayTime: 2.5,
      damping: 0.8,
    }));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('reverbZoneHandler.onDetach', () => {
  it('emits reverb_zone_unregister', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    reverbZoneHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('reverb_zone_unregister', expect.objectContaining({ node }));
  });
  it('removes __reverbZoneState', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onDetach!(node, config, ctx);
    expect(node.__reverbZoneState).toBeUndefined();
  });
});

// ─── onUpdate — blend logic ───────────────────────────────────────────────────

describe('reverbZoneHandler.onUpdate — blend up toward target', () => {
  it('increments currentWetLevel toward targetWetLevel', () => {
    const { node, config, ctx } = attach({ wet_level: 1 });
    node.__reverbZoneState.targetWetLevel = 1;
    node.__reverbZoneState.currentWetLevel = 0;
    reverbZoneHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__reverbZoneState.currentWetLevel).toBeGreaterThan(0);
    expect(node.__reverbZoneState.currentWetLevel).toBeLessThanOrEqual(1);
  });
  it('clamps at targetWetLevel when overshoot would occur', () => {
    const { node, config, ctx } = attach({ wet_level: 1 });
    node.__reverbZoneState.targetWetLevel = 0.01;
    node.__reverbZoneState.currentWetLevel = 0;
    reverbZoneHandler.onUpdate!(node, config, ctx, 1.0); // large delta
    expect(node.__reverbZoneState.currentWetLevel).toBeCloseTo(0.01);
  });
  it('decrements currentWetLevel toward 0', () => {
    const { node, config, ctx } = attach({ wet_level: 1 });
    node.__reverbZoneState.targetWetLevel = 0;
    node.__reverbZoneState.currentWetLevel = 0.8;
    reverbZoneHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__reverbZoneState.currentWetLevel).toBeLessThan(0.8);
    expect(node.__reverbZoneState.currentWetLevel).toBeGreaterThanOrEqual(0);
  });
  it('clamps at 0 when decreasing', () => {
    const { node, config, ctx } = attach({ wet_level: 1 });
    node.__reverbZoneState.targetWetLevel = 0;
    node.__reverbZoneState.currentWetLevel = 0.01;
    reverbZoneHandler.onUpdate!(node, config, ctx, 1.0);
    expect(node.__reverbZoneState.currentWetLevel).toBeCloseTo(0);
  });
});

describe('reverbZoneHandler.onUpdate — reverb_update_mix', () => {
  it('emits reverb_update_mix when listeners in zone', () => {
    const { node, config, ctx } = attach({ wet_level: 0.5, dry_level: 1.0 });
    node.__reverbZoneState.listenersInZone.add('l1');
    node.__reverbZoneState.currentWetLevel = 0.8;
    ctx.emit.mockClear();
    reverbZoneHandler.onUpdate!(node, config, ctx, 0);
    expect(ctx.emit).toHaveBeenCalledWith('reverb_update_mix', expect.objectContaining({
      wetLevel: expect.any(Number),
      dryLevel: 1.0,
    }));
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'reverb_update_mix')!;
    expect(call[1].wetLevel).toBeCloseTo(0.8 * 0.5);
  });
  it('no reverb_update_mix when no listeners', () => {
    const { node, config, ctx } = attach();
    node.__reverbZoneState.currentWetLevel = 0.5;
    ctx.emit.mockClear();
    reverbZoneHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('reverb_update_mix', expect.anything());
  });
  it('no-op when isActive=false', () => {
    const { node, config, ctx } = attach();
    node.__reverbZoneState.isActive = false;
    node.__reverbZoneState.listenersInZone.add('l1');
    ctx.emit.mockClear();
    reverbZoneHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — listener_enter_zone ───────────────────────────────────────────

describe('reverbZoneHandler.onEvent — listener_enter_zone', () => {
  it('adds listener to zone', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear1' });
    expect(node.__reverbZoneState.listenersInZone.has('ear1')).toBe(true);
  });
  it('sets targetWetLevel=1', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear1' });
    expect(node.__reverbZoneState.targetWetLevel).toBe(1);
  });
  it('emits reverb_zone_enter on first listener', () => {
    const { node, config, ctx } = attach({ preset: 'hall' });
    ctx.emit.mockClear();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear1' });
    expect(ctx.emit).toHaveBeenCalledWith('reverb_zone_enter', expect.objectContaining({
      listenerId: 'ear1',
      preset: 'hall',
    }));
  });
  it('no reverb_zone_enter for subsequent listeners', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear1' });
    ctx.emit.mockClear();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear2' });
    expect(ctx.emit).not.toHaveBeenCalledWith('reverb_zone_enter', expect.anything());
  });
});

// ─── onEvent — listener_exit_zone ────────────────────────────────────────────

describe('reverbZoneHandler.onEvent — listener_exit_zone', () => {
  it('removes listener from zone', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear1' });
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_exit_zone', listenerId: 'ear1' });
    expect(node.__reverbZoneState.listenersInZone.has('ear1')).toBe(false);
  });
  it('targetWetLevel set to 0 when zone empty', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear1' });
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_exit_zone', listenerId: 'ear1' });
    expect(node.__reverbZoneState.targetWetLevel).toBe(0);
  });
  it('emits reverb_zone_exit when zone empty', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear1' });
    ctx.emit.mockClear();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_exit_zone', listenerId: 'ear1' });
    expect(ctx.emit).toHaveBeenCalledWith('reverb_zone_exit', expect.objectContaining({ listenerId: 'ear1' }));
  });
  it('no exit event when other listeners remain', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear1' });
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_enter_zone', listenerId: 'ear2' });
    ctx.emit.mockClear();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_exit_zone', listenerId: 'ear1' });
    expect(ctx.emit).not.toHaveBeenCalledWith('reverb_zone_exit', expect.anything());
  });
});

// ─── onEvent — listener_distance_update ──────────────────────────────────────

describe('reverbZoneHandler.onEvent — listener_distance_update', () => {
  it('partial blend when distance < blend_distance', () => {
    const { node, config, ctx } = attach({ blend_distance: 2 });
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_distance_update', distance: 1 });
    // targetWetLevel = 1 - 1/2 = 0.5
    expect(node.__reverbZoneState.targetWetLevel).toBeCloseTo(0.5);
  });
  it('targetWetLevel=0 when distance >= blend_distance', () => {
    const { node, config, ctx } = attach({ blend_distance: 2 });
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_distance_update', distance: 3 });
    expect(node.__reverbZoneState.targetWetLevel).toBe(0);
  });
  it('targetWetLevel=1 when distance=0', () => {
    const { node, config, ctx } = attach({ blend_distance: 2 });
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'listener_distance_update', distance: 0 });
    expect(node.__reverbZoneState.targetWetLevel).toBe(1);
  });
});

// ─── onEvent — convolver_loaded ───────────────────────────────────────────────

describe('reverbZoneHandler.onEvent — convolver_loaded', () => {
  it('sets convolverLoaded=true', () => {
    const { node, config, ctx } = attach();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'convolver_loaded' });
    expect(node.__reverbZoneState.convolverLoaded).toBe(true);
  });
  it('emits reverb_zone_ready', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'convolver_loaded' });
    expect(ctx.emit).toHaveBeenCalledWith('reverb_zone_ready', expect.objectContaining({ node }));
  });
});

// ─── onEvent — reverb_zone_set_preset ────────────────────────────────────────

describe('reverbZoneHandler.onEvent — reverb_zone_set_preset', () => {
  it('emits reverb_zone_update with new preset', () => {
    const { node, config, ctx } = attach({ decay_time: 1.5 });
    ctx.emit.mockClear();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'reverb_zone_set_preset', preset: 'cathedral', decayTime: 5.0 });
    expect(ctx.emit).toHaveBeenCalledWith('reverb_zone_update', expect.objectContaining({
      preset: 'cathedral',
      decayTime: 5.0,
    }));
  });
  it('uses config decay_time as fallback when decayTime not provided', () => {
    const { node, config, ctx } = attach({ decay_time: 2.0 });
    ctx.emit.mockClear();
    reverbZoneHandler.onEvent!(node, config, ctx, { type: 'reverb_zone_set_preset', preset: 'cave' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'reverb_zone_update')!;
    expect(call[1].decayTime).toBe(2.0);
  });
});
