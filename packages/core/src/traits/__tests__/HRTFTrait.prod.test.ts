/**
 * HRTFTrait — Production Test Suite
 *
 * hrtfHandler stores state on node.__hrtfState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 8 fields
 * 2. onAttach — state init (isActive=true, headRadius=config.head_radius),
 *               hrtf_load_custom when custom_sofa_url set,
 *               hrtf_load_database when no custom url,
 *               always emits hrtf_configure
 * 3. onDetach — emits hrtf_disable, removes state
 * 4. onUpdate — no-op when !isActive; profile change detection → hrtf_change_profile
 * 5. onEvent — hrtf_database_loaded, listener_update, hrtf_set_head_radius,
 *              hrtf_enable, hrtf_disable
 */
import { describe, it, expect, vi } from 'vitest';
import { hrtfHandler } from '../HRTFTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'hrtf_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof hrtfHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...hrtfHandler.defaultConfig!, ...cfg };
  hrtfHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('hrtfHandler.defaultConfig', () => {
  const d = hrtfHandler.defaultConfig!;
  it('profile=generic', () => expect(d.profile).toBe('generic'));
  it('database=cipic', () => expect(d.database).toBe('cipic'));
  it('custom_sofa_url=""', () => expect(d.custom_sofa_url).toBe(''));
  it('interpolation=bilinear', () => expect(d.interpolation).toBe('bilinear'));
  it('crossfade_time=50', () => expect(d.crossfade_time).toBe(50));
  it('head_radius=0.0875', () => expect(d.head_radius).toBe(0.0875));
  it('enable_near_field=true', () => expect(d.enable_near_field).toBe(true));
  it('itd_model=spherical', () => expect(d.itd_model).toBe('spherical'));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('hrtfHandler.onAttach', () => {
  it('initialises __hrtfState', () => {
    const { node } = attach();
    expect((node as any).__hrtfState).toBeDefined();
  });

  it('isActive=true initially', () => {
    const { node } = attach();
    expect((node as any).__hrtfState.isActive).toBe(true);
  });

  it('currentProfile = config.profile', () => {
    const { node } = attach({ profile: 'subject_42' });
    expect((node as any).__hrtfState.currentProfile).toBe('subject_42');
  });

  it('headRadius = config.head_radius', () => {
    const { node } = attach({ head_radius: 0.09 });
    expect((node as any).__hrtfState.headRadius).toBeCloseTo(0.09, 5);
  });

  it('databaseLoaded=false initially', () => {
    const { node } = attach();
    expect((node as any).__hrtfState.databaseLoaded).toBe(false);
  });

  it('emits hrtf_load_custom when custom_sofa_url provided', () => {
    const { ctx } = attach({ custom_sofa_url: 'https://example.com/my.sofa' });
    expect(ctx.emit).toHaveBeenCalledWith('hrtf_load_custom', expect.objectContaining({
      url: 'https://example.com/my.sofa',
    }));
  });

  it('does NOT emit hrtf_load_database when custom_sofa_url provided', () => {
    const { ctx } = attach({ custom_sofa_url: 'https://example.com/my.sofa' });
    expect(ctx.emit).not.toHaveBeenCalledWith('hrtf_load_database', expect.anything());
  });

  it('emits hrtf_load_database when no custom_sofa_url', () => {
    const { ctx } = attach({ custom_sofa_url: '', database: 'listen', profile: 'p1' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'hrtf_load_database');
    expect(call).toBeDefined();
    expect(call![1].database).toBe('listen');
    expect(call![1].profile).toBe('p1');
  });

  it('always emits hrtf_configure', () => {
    const { ctx } = attach({ interpolation: 'sphere', crossfade_time: 100, head_radius: 0.09, enable_near_field: false, itd_model: 'measured' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'hrtf_configure');
    expect(call).toBeDefined();
    expect(call![1].interpolation).toBe('sphere');
    expect(call![1].crossfadeTime).toBe(100);
    expect(call![1].headRadius).toBeCloseTo(0.09, 5);
    expect(call![1].nearField).toBe(false);
    expect(call![1].itdModel).toBe('measured');
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('hrtfHandler.onDetach', () => {
  it('emits hrtf_disable', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    hrtfHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('hrtf_disable', expect.any(Object));
  });

  it('removes __hrtfState', () => {
    const { node, ctx, config } = attach();
    hrtfHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__hrtfState).toBeUndefined();
  });
});

// ─── onUpdate — profile change detection ────────────────────────────────────

describe('hrtfHandler.onUpdate', () => {
  it('no-op when isActive=false', () => {
    const { node, ctx, config } = attach();
    (node as any).__hrtfState.isActive = false;
    ctx.emit.mockClear();
    hrtfHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('no-op when profile unchanged', () => {
    const { node, ctx, config } = attach({ profile: 'generic' });
    ctx.emit.mockClear();
    hrtfHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    // config.profile === state.currentProfile → no emit
    expect(ctx.emit).not.toHaveBeenCalledWith('hrtf_change_profile', expect.anything());
  });

  it('emits hrtf_change_profile when config.profile differs from state.currentProfile', () => {
    const { node, ctx, config } = attach({ profile: 'generic' });
    // Mutate config to simulate live update
    (config as any).profile = 'subject_99';
    ctx.emit.mockClear();
    hrtfHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'hrtf_change_profile');
    expect(call).toBeDefined();
    expect(call![1].profile).toBe('subject_99');
    expect(call![1].crossfadeTime).toBeDefined();
  });

  it('updates state.currentProfile after profile change', () => {
    const { node, ctx, config } = attach({ profile: 'generic' });
    (config as any).profile = 'subject_10';
    hrtfHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__hrtfState.currentProfile).toBe('subject_10');
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('hrtfHandler.onEvent', () => {
  it('hrtf_database_loaded → databaseLoaded=true, stores subjectId, emits hrtf_ready', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    hrtfHandler.onEvent!(node as any, config, ctx as any, {
      type: 'hrtf_database_loaded',
      subjectId: 42,
    });
    const state = (node as any).__hrtfState;
    expect(state.databaseLoaded).toBe(true);
    expect(state.subjectId).toBe(42);
    expect(ctx.emit).toHaveBeenCalledWith('hrtf_ready', { node: expect.anything(), subjectId: 42 });
  });

  it('hrtf_database_loaded with null subjectId → hrtf_ready with null', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    hrtfHandler.onEvent!(node as any, config, ctx as any, { type: 'hrtf_database_loaded', subjectId: null });
    expect(ctx.emit).toHaveBeenCalledWith('hrtf_ready', { node: expect.anything(), subjectId: null });
  });

  it('listener_update stores position and orientation, emits hrtf_listener_update', () => {
    const { node, ctx, config } = attach();
    const pos = { x: 1, y: 2, z: 3 };
    const orient = { forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } };
    ctx.emit.mockClear();
    hrtfHandler.onEvent!(node as any, config, ctx as any, {
      type: 'listener_update',
      position: pos,
      orientation: orient,
    });
    const state = (node as any).__hrtfState;
    expect(state.listenerPosition).toEqual(pos);
    expect(state.listenerOrientation).toEqual(orient);
    expect(ctx.emit).toHaveBeenCalledWith('hrtf_listener_update', expect.objectContaining({
      position: pos,
      orientation: orient,
    }));
  });

  it('hrtf_set_head_radius updates headRadius and emits hrtf_configure', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    hrtfHandler.onEvent!(node as any, config, ctx as any, { type: 'hrtf_set_head_radius', radius: 0.1 });
    expect((node as any).__hrtfState.headRadius).toBeCloseTo(0.1, 5);
    expect(ctx.emit).toHaveBeenCalledWith('hrtf_configure', expect.objectContaining({ headRadius: 0.1 }));
  });

  it('hrtf_enable sets isActive=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__hrtfState.isActive = false;
    hrtfHandler.onEvent!(node as any, config, ctx as any, { type: 'hrtf_enable' });
    expect((node as any).__hrtfState.isActive).toBe(true);
  });

  it('hrtf_disable sets isActive=false', () => {
    const { node, ctx, config } = attach();
    hrtfHandler.onEvent!(node as any, config, ctx as any, { type: 'hrtf_disable' });
    expect((node as any).__hrtfState.isActive).toBe(false);
  });

  it('no-op gracefully when __hrtfState absent', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = hrtfHandler.defaultConfig!;
    expect(() => hrtfHandler.onEvent!(node as any, config, ctx as any, { type: 'hrtf_enable' })).not.toThrow();
  });
});
