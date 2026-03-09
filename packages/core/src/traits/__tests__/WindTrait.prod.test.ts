/**
 * WindTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { windHandler } from '../WindTrait';

function makeNode(props: any = {}) {
  return { id: 'wind_node', ...props };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...windHandler.defaultConfig!, ...cfg };
  windHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('windHandler.defaultConfig', () => {
  const d = windHandler.defaultConfig!;
  it('direction=[1,0,0]', () => expect(d.direction).toEqual([1, 0, 0]));
  it('strength=5', () => expect(d.strength).toBe(5));
  it('turbulence=0.3', () => expect(d.turbulence).toBe(0.3));
  it('turbulence_frequency=1.0', () => expect(d.turbulence_frequency).toBe(1.0));
  it('pulse=false', () => expect(d.pulse).toBe(false));
  it('pulse_frequency=0.5', () => expect(d.pulse_frequency).toBe(0.5));
  it('falloff=none', () => expect(d.falloff).toBe('none'));
  it('radius=100', () => expect(d.radius).toBe(100));
  it('affects=[]', () => expect(d.affects).toEqual([]));
  it('gust_chance=0.01', () => expect(d.gust_chance).toBe(0.01));
  it('gust_multiplier=2.0', () => expect(d.gust_multiplier).toBe(2.0));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('windHandler.onAttach', () => {
  it('creates __windState', () => expect(attach().node.__windState).toBeDefined());
  it('isActive=true', () => expect(attach().node.__windState.isActive).toBe(true));
  it('currentStrength = config.strength', () =>
    expect(attach({ strength: 10 }).node.__windState.currentStrength).toBe(10));
  it('gustTimer=0', () => expect(attach().node.__windState.gustTimer).toBe(0));
  it('time=0', () => expect(attach().node.__windState.time).toBe(0));
  it('emits register_wind_zone', () => {
    const { ctx } = attach({ radius: 50 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'register_wind_zone',
      expect.objectContaining({ radius: 50 })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('windHandler.onDetach', () => {
  it('emits unregister_wind_zone', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    windHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      'unregister_wind_zone',
      expect.objectContaining({ node })
    );
  });
  it('removes __windState', () => {
    const { node, config, ctx } = attach();
    windHandler.onDetach!(node, config, ctx);
    expect(node.__windState).toBeUndefined();
  });
});

// ─── onUpdate — basic ─────────────────────────────────────────────────────────

describe('windHandler.onUpdate — basic', () => {
  it('increments state.time by delta', () => {
    const { node, config, ctx } = attach();
    windHandler.onUpdate!(node, config, ctx, 0.1);
    expect(node.__windState.time).toBeCloseTo(0.1, 5);
  });
  it('emits wind_zone_update every frame when active', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    windHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'wind_zone_update',
      expect.objectContaining({
        radius: config.radius,
        direction: config.direction,
        falloff: config.falloff,
      })
    );
  });
  it('wind_zone_update strength = base * 1 when no pulse/gust', () => {
    const { node, config, ctx } = attach({ strength: 5, gust_chance: 0, pulse: false });
    node.__windState.gustTimer = 0;
    ctx.emit.mockClear();
    windHandler.onUpdate!(node, config, ctx, 0.001);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'wind_zone_update')!;
    expect(call[1].strength).toBeCloseTo(5, 1);
  });
  it('no-op when isActive=false', () => {
    const { node, config, ctx } = attach();
    node.__windState.isActive = false;
    ctx.emit.mockClear();
    windHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('turbulenceOffset is set after update', () => {
    const { node, config, ctx } = attach({ turbulence: 0.5, turbulence_frequency: 1 });
    windHandler.onUpdate!(node, config, ctx, 1.0); // large time step to get non-zero noise
    const offset = node.__windState.turbulenceOffset;
    expect(typeof offset.x).toBe('number');
    expect(typeof offset.z).toBe('number');
  });
  it('pulse modulator reduces strength to ~0 at sin trough', () => {
    const { node, config, ctx } = attach({
      strength: 10,
      pulse: true,
      pulse_frequency: 0,
      gust_chance: 0,
    });
    // When pulse_frequency=0, pulsePhase=0, sin(0)=0, pulseMultiplier=(0+1)/2=0.5
    // currentStrength = 10 * 0.5 * 1 = 5
    ctx.emit.mockClear();
    windHandler.onUpdate!(node, config, ctx, 0.001);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'wind_zone_update')!;
    expect(call[1].strength).toBeCloseTo(5, 0);
  });
});

// ─── onUpdate — gust ──────────────────────────────────────────────────────────

describe('windHandler.onUpdate — existing gust', () => {
  it('applies gust_multiplier when gustTimer > 0', () => {
    const { node, config, ctx } = attach({
      strength: 5,
      gust_multiplier: 3,
      gust_chance: 0,
      pulse: false,
    });
    node.__windState.gustTimer = 1.0; // active gust
    ctx.emit.mockClear();
    windHandler.onUpdate!(node, config, ctx, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'wind_zone_update')!;
    expect(call[1].strength).toBeCloseTo(5 * 3, 1);
  });
  it('decrements gustTimer by delta', () => {
    const { node, config, ctx } = attach({ gust_chance: 0, pulse: false });
    node.__windState.gustTimer = 1.0;
    windHandler.onUpdate!(node, config, ctx, 0.1);
    expect(node.__windState.gustTimer).toBeCloseTo(0.9, 5);
  });
  it('gustTimer does not go below 0', () => {
    const { node, config, ctx } = attach({ gust_chance: 0, pulse: false });
    node.__windState.gustTimer = 0.05;
    windHandler.onUpdate!(node, config, ctx, 0.2);
    expect(node.__windState.gustTimer).toBe(0);
  });
});

describe('windHandler.onUpdate — on_wind_change', () => {
  it('emits on_wind_change when gustMultiplier creates >0.5 strength delta', () => {
    const { node, config, ctx } = attach({
      strength: 5,
      gust_multiplier: 2,
      gust_chance: 0,
      pulse: false,
    });
    node.__windState.gustTimer = 1.0; // gust active → strength=5*2=10
    ctx.emit.mockClear();
    windHandler.onUpdate!(node, config, ctx, 0.016);
    // |10 - 5| = 5 > 0.5 → should emit on_wind_change
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_wind_change',
      expect.objectContaining({ strength: 10 })
    );
  });
  it('does NOT emit on_wind_change when delta is small', () => {
    const { node, config, ctx } = attach({ strength: 5, gust_chance: 0, pulse: false });
    // no gust, no pulse → strength=5, delta=0 → no on_wind_change
    ctx.emit.mockClear();
    windHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('on_wind_change', expect.any(Object));
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('windHandler.onEvent — set_wind_direction', () => {
  it('updates config.direction', () => {
    const { node, config, ctx } = attach();
    windHandler.onEvent!(node, config, ctx, { type: 'set_wind_direction', direction: [0, 1, 0] });
    expect(config.direction).toEqual([0, 1, 0]);
  });
});

describe('windHandler.onEvent — set_wind_strength', () => {
  it('updates config.strength', () => {
    const { node, config, ctx } = attach();
    windHandler.onEvent!(node, config, ctx, { type: 'set_wind_strength', strength: 20 });
    expect(config.strength).toBe(20);
  });
});

describe('windHandler.onEvent — toggle_wind', () => {
  it('toggles isActive from true to false', () => {
    const { node, config, ctx } = attach();
    windHandler.onEvent!(node, config, ctx, { type: 'toggle_wind' });
    expect(node.__windState.isActive).toBe(false);
  });
  it('toggles isActive from false to true', () => {
    const { node, config, ctx } = attach();
    node.__windState.isActive = false;
    windHandler.onEvent!(node, config, ctx, { type: 'toggle_wind' });
    expect(node.__windState.isActive).toBe(true);
  });
});

describe('windHandler.onEvent — trigger_gust', () => {
  it('sets gustTimer to event.duration', () => {
    const { node, config, ctx } = attach();
    windHandler.onEvent!(node, config, ctx, { type: 'trigger_gust', duration: 2.5 });
    expect(node.__windState.gustTimer).toBe(2.5);
  });
  it('defaults gustTimer to 1.0 when no duration', () => {
    const { node, config, ctx } = attach();
    windHandler.onEvent!(node, config, ctx, { type: 'trigger_gust' });
    expect(node.__windState.gustTimer).toBe(1.0);
  });
});
