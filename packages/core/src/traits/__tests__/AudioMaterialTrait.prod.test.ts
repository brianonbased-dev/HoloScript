/**
 * AudioMaterialTrait — Production Test Suite
 *
 * audioMaterialHandler stores state on node.__audioMaterialState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 5 fields
 * 2. onAttach — state init (isRegistered, effectiveAbsorption), preset calculation,
 *               custom absorption_coefficients override preset,
 *               emits audio_material_register, sets isRegistered=true
 * 3. onDetach — emits audio_material_unregister, removes state
 * 4. onUpdate — static (no per-frame logic)
 * 5. onEvent — audio_material_query (returns snapshot), audio_material_set_preset (emits update)
 *              MATERIAL_PRESETS correctness spot-checks (concrete, carpet, glass)
 */
import { describe, it, expect, vi } from 'vitest';
import { audioMaterialHandler } from '../AudioMaterialTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'am_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof audioMaterialHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...audioMaterialHandler.defaultConfig!, ...cfg };
  audioMaterialHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('audioMaterialHandler.defaultConfig', () => {
  const d = audioMaterialHandler.defaultConfig!;
  it('absorption_coefficients={}', () => expect(d.absorption_coefficients).toEqual({}));
  it('reflection_coefficient=0.5', () => expect(d.reflection_coefficient).toBe(0.5));
  it('transmission_coefficient=0.1', () => expect(d.transmission_coefficient).toBe(0.1));
  it('scattering_coefficient=0.3', () => expect(d.scattering_coefficient).toBe(0.3));
  it('material_preset=concrete', () => expect(d.material_preset).toBe('concrete'));
});

// ─── onAttach — state init ────────────────────────────────────────────────────

describe('audioMaterialHandler.onAttach — state', () => {
  it('initialises __audioMaterialState', () => {
    const { node } = attach();
    expect((node as any).__audioMaterialState).toBeDefined();
  });

  it('sets isRegistered=true after attach', () => {
    const { node } = attach();
    expect((node as any).__audioMaterialState.isRegistered).toBe(true);
  });

  it('emits audio_material_register', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('audio_material_register', expect.any(Object));
  });

  it('register payload contains reflection, transmission, scattering', () => {
    const { ctx } = attach({ reflection_coefficient: 0.7, transmission_coefficient: 0.05, scattering_coefficient: 0.2 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_register');
    expect(call![1].reflection).toBe(0.7);
    expect(call![1].transmission).toBe(0.05);
    expect(call![1].scattering).toBe(0.2);
  });
});

// ─── onAttach — effectiveAbsorption ──────────────────────────────────────────

describe('audioMaterialHandler.onAttach — effectiveAbsorption', () => {
  it('concrete preset: effectiveAbsorption ≈ mean of concrete coefficients', () => {
    const { node } = attach({ material_preset: 'concrete' });
    // concrete: [0.01, 0.01, 0.02, 0.02, 0.02, 0.03] → mean = 0.11/6 ≈ 0.0183
    const ea = (node as any).__audioMaterialState.effectiveAbsorption;
    expect(ea).toBeCloseTo(0.11 / 6, 4);
  });

  it('carpet preset: effectiveAbsorption ≈ mean of carpet coefficients (highly absorptive)', () => {
    const { node } = attach({ material_preset: 'carpet' });
    // carpet: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73] → mean = 3.02/6 ≈ 0.5033
    const ea = (node as any).__audioMaterialState.effectiveAbsorption;
    expect(ea).toBeCloseTo(3.02 / 6, 3);
  });

  it('custom absorption_coefficients override the preset', () => {
    const customCoeffs = { 125: 0.5, 250: 0.5, 500: 0.5, 1000: 0.5, 2000: 0.5, 4000: 0.5 };
    const { node, ctx } = attach({ absorption_coefficients: customCoeffs, material_preset: 'concrete' });
    // All 0.5 → mean = 0.5
    expect((node as any).__audioMaterialState.effectiveAbsorption).toBeCloseTo(0.5, 5);
    // register payload should use custom, not preset
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_register');
    expect(call![1].absorption[125]).toBe(0.5);
  });

  it('register payload uses preset when absorption_coefficients={}', () => {
    const { ctx } = attach({ material_preset: 'glass', absorption_coefficients: {} });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_register');
    // glass[125] = 0.35
    expect(call![1].absorption[125]).toBe(0.35);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('audioMaterialHandler.onDetach', () => {
  it('emits audio_material_unregister', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    audioMaterialHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('audio_material_unregister', expect.any(Object));
  });

  it('removes __audioMaterialState', () => {
    const { node, ctx, config } = attach();
    audioMaterialHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__audioMaterialState).toBeUndefined();
  });
});

// ─── onUpdate — static ───────────────────────────────────────────────────────

describe('audioMaterialHandler.onUpdate', () => {
  it('does not emit any events (static material)', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    audioMaterialHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('does not throw', () => {
    const { node, ctx, config } = attach();
    expect(() => audioMaterialHandler.onUpdate!(node as any, config, ctx as any, 0.016)).not.toThrow();
  });
});

// ─── onEvent — audio_material_query ──────────────────────────────────────────

describe('audioMaterialHandler.onEvent — audio_material_query', () => {
  it('emits audio_material_response with all fields', () => {
    const { node, ctx, config } = attach({ material_preset: 'wood' });
    ctx.emit.mockClear();
    audioMaterialHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_material_query',
      queryId: 'q42',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_response');
    expect(call).toBeDefined();
    expect(call![1].queryId).toBe('q42');
    expect(call![1].reflection).toBe(config.reflection_coefficient);
    expect(call![1].transmission).toBe(config.transmission_coefficient);
    expect(call![1].scattering).toBe(config.scattering_coefficient);
    expect(call![1].effectiveAbsorption).toBeDefined();
  });

  it('uses custom absorption_coefficients in query response when provided', () => {
    const customCoeffs = { 125: 0.9 };
    const { node, ctx, config } = attach({ absorption_coefficients: customCoeffs });
    ctx.emit.mockClear();
    audioMaterialHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_material_query', queryId: 'q1' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_response');
    expect(call![1].absorption[125]).toBe(0.9);
  });

  it('uses preset absorption when absorption_coefficients={} in query', () => {
    const { node, ctx, config } = attach({ material_preset: 'metal', absorption_coefficients: {} });
    ctx.emit.mockClear();
    audioMaterialHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_material_query', queryId: 'q2' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_response');
    // metal[1000] = 0.01
    expect(call![1].absorption[1000]).toBe(0.01);
  });

  it('no-op when __audioMaterialState absent', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = audioMaterialHandler.defaultConfig!;
    // Do not call attach — state absent
    expect(() =>
      audioMaterialHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_material_query', queryId: 'q' })
    ).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — audio_material_set_preset ──────────────────────────────────────

describe('audioMaterialHandler.onEvent — audio_material_set_preset', () => {
  it('emits audio_material_update with new preset absorption', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    audioMaterialHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_material_set_preset',
      preset: 'fabric',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_update');
    expect(call).toBeDefined();
    // fabric[2000] = 0.7
    expect(call![1].absorption[2000]).toBe(0.7);
  });

  it('emits audio_material_update for tile preset', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    audioMaterialHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_material_set_preset',
      preset: 'tile',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_update');
    // tile[500] = 0.02
    expect(call![1].absorption[500]).toBe(0.02);
  });

  it('unknown event type does not crash', () => {
    const { node, ctx, config } = attach();
    expect(() =>
      audioMaterialHandler.onEvent!(node as any, config, ctx as any, { type: 'unknown_event' })
    ).not.toThrow();
  });
});

// ─── MATERIAL_PRESETS spot-checks ────────────────────────────────────────────

describe('AudioMaterial — MATERIAL_PRESETS spot-checks', () => {
  it('glass 125Hz absorption = 0.35 (high-loss at low freq)', () => {
    const { ctx } = attach({ material_preset: 'glass', absorption_coefficients: {} });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_register');
    expect(call![1].absorption[125]).toBe(0.35);
  });

  it('metal 4000Hz absorption = 0.02 (very low)', () => {
    const { ctx } = attach({ material_preset: 'metal', absorption_coefficients: {} });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_register');
    expect(call![1].absorption[4000]).toBe(0.02);
  });

  it('fabric 4000Hz absorption = 0.72 (highly absorptive at high freq)', () => {
    const { ctx } = attach({ material_preset: 'fabric', absorption_coefficients: {} });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_material_register');
    expect(call![1].absorption[4000]).toBe(0.72);
  });

  it('custom preset effectiveAbsorption = 0.1 (all bands = 0.1)', () => {
    const { node } = attach({ material_preset: 'custom', absorption_coefficients: {} });
    expect((node as any).__audioMaterialState.effectiveAbsorption).toBeCloseTo(0.1, 5);
  });
});
