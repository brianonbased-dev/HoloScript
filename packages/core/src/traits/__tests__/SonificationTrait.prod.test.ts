/**
 * SonificationTrait — Production Test Suite
 *
 * Tests: mapValue helper (linear / exponential / logarithmic curves, clamp),
 * defaultConfig, onAttach, onDetach, onUpdate continuous mode,
 * onEvent data_update (pitch/volume/pan primary mapping, custom mappings,
 * non-continuous trigger auto-stop), start/stop/set_instrument.
 */
import { describe, it, expect, vi } from 'vitest';
import { sonificationHandler } from '../SonificationTrait';

// Inline implementation matching the source (private function — tested via behavior)
function mapValue(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  curve: 'linear' | 'exponential' | 'logarithmic'
): number {
  const normalized = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
  let curved: number;
  switch (curve) {
    case 'exponential':
      curved = Math.pow(normalized, 2);
      break;
    case 'logarithmic':
      curved = Math.log10(1 + normalized * 9) / Math.log10(10);
      break;
    default:
      curved = normalized;
  }
  return outMin + curved * (outMax - outMin);
}

function makeNode() {
  return { id: 'soni_node' };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...sonificationHandler.defaultConfig!, ...config };
  sonificationHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── mapValue behavior (inline verified) ─────────────────────────────────────

describe('mapValue', () => {
  it('linear: maps midpoint to midpoint', () => {
    expect(mapValue(50, 0, 100, 200, 2000, 'linear')).toBeCloseTo(1100, 0);
  });
  it('linear: maps min to outMin', () => {
    expect(mapValue(0, 0, 100, 200, 2000, 'linear')).toBeCloseTo(200, 0);
  });
  it('linear: maps max to outMax', () => {
    expect(mapValue(100, 0, 100, 200, 2000, 'linear')).toBeCloseTo(2000, 0);
  });
  it('linear: clamps below inMin to outMin', () => {
    expect(mapValue(-50, 0, 100, 200, 2000, 'linear')).toBeCloseTo(200, 0);
  });
  it('linear: clamps above inMax to outMax', () => {
    expect(mapValue(200, 0, 100, 200, 2000, 'linear')).toBeCloseTo(2000, 0);
  });
  it('exponential: midpoint maps lower than linear (curve bends down)', () => {
    const linear = mapValue(50, 0, 100, 200, 2000, 'linear');
    const expo = mapValue(50, 0, 100, 200, 2000, 'exponential');
    expect(expo).toBeLessThan(linear);
  });
  it('exponential: maps max to outMax', () => {
    expect(mapValue(100, 0, 100, 200, 2000, 'exponential')).toBeCloseTo(2000, 0);
  });
  it('logarithmic: midpoint maps higher than linear (curve bends up)', () => {
    const linear = mapValue(50, 0, 100, 200, 2000, 'linear');
    const log = mapValue(50, 0, 100, 200, 2000, 'logarithmic');
    expect(log).toBeGreaterThan(linear);
  });
  it('logarithmic: maps max to outMax', () => {
    expect(mapValue(100, 0, 100, 200, 2000, 'logarithmic')).toBeCloseTo(2000, 0);
  });
});

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('sonificationHandler.defaultConfig', () => {
  it('data_source = empty string', () =>
    expect(sonificationHandler.defaultConfig!.data_source).toBe(''));
  it('mapping = pitch', () => expect(sonificationHandler.defaultConfig!.mapping).toBe('pitch'));
  it('min_freq = 200', () => expect(sonificationHandler.defaultConfig!.min_freq).toBe(200));
  it('max_freq = 2000', () => expect(sonificationHandler.defaultConfig!.max_freq).toBe(2000));
  it('min_value = 0', () => expect(sonificationHandler.defaultConfig!.min_value).toBe(0));
  it('max_value = 100', () => expect(sonificationHandler.defaultConfig!.max_value).toBe(100));
  it('pan_mode = spatial', () =>
    expect(sonificationHandler.defaultConfig!.pan_mode).toBe('spatial'));
  it('continuous = false', () => expect(sonificationHandler.defaultConfig!.continuous).toBe(false));
  it('instrument = sine', () => expect(sonificationHandler.defaultConfig!.instrument).toBe('sine'));
  it('volume = 0.5', () => expect(sonificationHandler.defaultConfig!.volume).toBe(0.5));
  it('attack = 0.01', () => expect(sonificationHandler.defaultConfig!.attack).toBe(0.01));
  it('release = 0.1', () => expect(sonificationHandler.defaultConfig!.release).toBe(0.1));
  it('custom_mappings = []', () =>
    expect(sonificationHandler.defaultConfig!.custom_mappings).toEqual([]));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('sonificationHandler.onAttach', () => {
  it('creates __sonificationState on node', () => {
    const { node } = attachNode();
    expect((node as any).__sonificationState).toBeDefined();
  });
  it('initial isActive = false', () => {
    const { node } = attachNode();
    expect((node as any).__sonificationState.isActive).toBe(false);
  });
  it('initial currentValues map empty', () => {
    const { node } = attachNode();
    expect((node as any).__sonificationState.currentValues.size).toBe(0);
  });
  it('initial currentFrequency = min_freq', () => {
    const { node } = attachNode({ min_freq: 440 });
    expect((node as any).__sonificationState.currentFrequency).toBe(440);
  });
  it('initial currentGain = 0', () => {
    const { node } = attachNode();
    expect((node as any).__sonificationState.currentGain).toBe(0);
  });
  it('initial currentPan = 0', () => {
    const { node } = attachNode();
    expect((node as any).__sonificationState.currentPan).toBe(0);
  });
  it('emits sonification_create with instrument and volume', () => {
    const { ctx } = attachNode({ instrument: 'sawtooth', volume: 0.8 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'sonification_create',
      expect.objectContaining({ instrument: 'sawtooth', volume: 0.8 })
    );
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('sonificationHandler.onDetach', () => {
  it('removes __sonificationState', () => {
    const { node, cfg, ctx } = attachNode();
    sonificationHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__sonificationState).toBeUndefined();
  });
  it('emits sonification_stop if isActive', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__sonificationState.isActive = true;
    ctx.emit.mockClear();
    sonificationHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('sonification_stop', expect.any(Object));
  });
  it('always emits sonification_destroy', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    sonificationHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('sonification_destroy', expect.any(Object));
  });
});

// ─── onUpdate ────────────────────────────────────────────────────────────────

describe('sonificationHandler.onUpdate', () => {
  it('emits sonification_update_params when isActive + continuous=true', () => {
    const { node, cfg, ctx } = attachNode({ continuous: true });
    (node as any).__sonificationState.isActive = true;
    (node as any).__sonificationState.currentFrequency = 880;
    ctx.emit.mockClear();
    sonificationHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'sonification_update_params',
      expect.objectContaining({ frequency: 880 })
    );
  });
  it('does NOT emit when not active', () => {
    const { node, cfg, ctx } = attachNode({ continuous: true });
    ctx.emit.mockClear();
    sonificationHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('sonification_update_params', expect.any(Object));
  });
  it('does NOT emit when continuous=false', () => {
    const { node, cfg, ctx } = attachNode({ continuous: false });
    (node as any).__sonificationState.isActive = true;
    ctx.emit.mockClear();
    sonificationHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('sonification_update_params', expect.any(Object));
  });
});

// ─── onEvent — data_update (pitch mapping) ────────────────────────────────────

describe('sonificationHandler.onEvent — data_update (pitch)', () => {
  it('maps value to frequency via exponential curve for pitch mapping', () => {
    const { node, cfg, ctx } = attachNode({
      mapping: 'pitch',
      min_value: 0,
      max_value: 100,
      min_freq: 200,
      max_freq: 2000,
      data_source: 'health',
      continuous: true,
    });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'health',
      value: 100,
    });
    expect((node as any).__sonificationState.currentFrequency).toBeCloseTo(2000, 0);
  });
  it('stores value in currentValues map', () => {
    const { node, cfg, ctx } = attachNode({ data_source: 'score' });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'score',
      value: 42,
    });
    expect((node as any).__sonificationState.currentValues.get('score')).toBe(42);
  });
  it('emits sonification_value_changed', () => {
    const { node, cfg, ctx } = attachNode({ data_source: 'health', continuous: true });
    ctx.emit.mockClear();
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'health',
      value: 50,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'sonification_value_changed',
      expect.objectContaining({ property: 'health', value: 50 })
    );
  });
});

// ─── onEvent — data_update (volume mapping) ───────────────────────────────────

describe('sonificationHandler.onEvent — data_update (volume)', () => {
  it('maps value 0→0 gain (linear)', () => {
    const { node, cfg, ctx } = attachNode({
      mapping: 'volume',
      min_value: 0,
      max_value: 100,
      data_source: 's',
      continuous: true,
    });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 's',
      value: 0,
    });
    expect((node as any).__sonificationState.currentGain).toBeCloseTo(0, 3);
  });
  it('maps value 100→1 gain (linear)', () => {
    const { node, cfg, ctx } = attachNode({
      mapping: 'volume',
      min_value: 0,
      max_value: 100,
      data_source: 's',
      continuous: true,
    });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 's',
      value: 100,
    });
    expect((node as any).__sonificationState.currentGain).toBeCloseTo(1, 3);
  });
});

// ─── onEvent — data_update (pan mapping) ─────────────────────────────────────

describe('sonificationHandler.onEvent — data_update (pan)', () => {
  it('maps min value to -1 pan', () => {
    const { node, cfg, ctx } = attachNode({
      mapping: 'pan',
      min_value: 0,
      max_value: 100,
      data_source: 'x',
      continuous: true,
    });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'x',
      value: 0,
    });
    expect((node as any).__sonificationState.currentPan).toBeCloseTo(-1, 2);
  });
  it('maps max value to 1 pan', () => {
    const { node, cfg, ctx } = attachNode({
      mapping: 'pan',
      min_value: 0,
      max_value: 100,
      data_source: 'x',
      continuous: true,
    });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'x',
      value: 100,
    });
    expect((node as any).__sonificationState.currentPan).toBeCloseTo(1, 2);
  });
});

// ─── onEvent — data_update (non-continuous trigger) ───────────────────────────

describe('sonificationHandler.onEvent — non-continuous trigger', () => {
  it('emits sonification_trigger when not continuous and not active', () => {
    const { node, cfg, ctx } = attachNode({ continuous: false, data_source: 'hp' });
    ctx.emit.mockClear();
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'hp',
      value: 50,
    });
    expect(ctx.emit).toHaveBeenCalledWith('sonification_trigger', expect.any(Object));
  });
  it('sets isActive=true on trigger', () => {
    const { node, cfg, ctx } = attachNode({ continuous: false, data_source: 'hp' });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'hp',
      value: 50,
    });
    expect((node as any).__sonificationState.isActive).toBe(true);
  });
  it('does NOT re-trigger when already active', () => {
    const { node, cfg, ctx } = attachNode({ continuous: false, data_source: 'hp' });
    (node as any).__sonificationState.isActive = true;
    ctx.emit.mockClear();
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'hp',
      value: 50,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('sonification_trigger', expect.any(Object));
  });
});

// ─── onEvent — custom_mappings ────────────────────────────────────────────────

describe('sonificationHandler.onEvent — custom_mappings', () => {
  it('applies custom pitch mapping for matching property', () => {
    const { node, cfg, ctx } = attachNode({
      data_source: '',
      continuous: true,
      custom_mappings: [
        {
          property: 'speed',
          type: 'pitch',
          min_input: 0,
          max_input: 10,
          min_output: 100,
          max_output: 1000,
          curve: 'linear',
        },
      ],
    });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'speed',
      value: 10,
    });
    expect((node as any).__sonificationState.currentFrequency).toBeCloseTo(1000, 0);
  });
  it('applies custom volume mapping', () => {
    const { node, cfg, ctx } = attachNode({
      data_source: '',
      continuous: true,
      custom_mappings: [
        {
          property: 'hp',
          type: 'volume',
          min_input: 0,
          max_input: 100,
          min_output: 0,
          max_output: 1,
          curve: 'linear',
        },
      ],
    });
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_data_update',
      property: 'hp',
      value: 50,
    });
    expect((node as any).__sonificationState.currentGain).toBeCloseTo(0.5, 2);
  });
});

// ─── onEvent — start / stop / set_instrument ─────────────────────────────────

describe('sonificationHandler.onEvent — start/stop/set_instrument', () => {
  it('sonification_start sets isActive=true and emits sonification_play', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    sonificationHandler.onEvent!(node, cfg, ctx, { type: 'sonification_start' });
    expect((node as any).__sonificationState.isActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('sonification_play', expect.any(Object));
  });
  it('sonification_stop sets isActive=false and emits sonification_stop', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__sonificationState.isActive = true;
    ctx.emit.mockClear();
    sonificationHandler.onEvent!(node, cfg, ctx, { type: 'sonification_stop' });
    expect((node as any).__sonificationState.isActive).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('sonification_stop', expect.any(Object));
  });
  it('sonification_set_instrument emits sonification_change_instrument', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    sonificationHandler.onEvent!(node, cfg, ctx, {
      type: 'sonification_set_instrument',
      instrument: 'square',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'sonification_change_instrument',
      expect.objectContaining({ instrument: 'square' })
    );
  });
});
