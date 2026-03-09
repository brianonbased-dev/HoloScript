import { describe, it, expect, beforeEach } from 'vitest';
import { audioMaterialHandler } from '../AudioMaterialTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('AudioMaterialTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    absorption_coefficients: {} as Record<string, number>,
    reflection_coefficient: 0.5,
    transmission_coefficient: 0.1,
    scattering_coefficient: 0.3,
    material_preset: 'concrete' as const,
  };

  beforeEach(() => {
    node = createMockNode('wall');
    ctx = createMockContext();
    attachTrait(audioMaterialHandler, node, cfg, ctx);
  });

  it('initializes and registers with preset absorption', () => {
    expect((node as any).__audioMaterialState.isRegistered).toBe(true);
    expect(getEventCount(ctx, 'audio_material_register')).toBe(1);
  });

  it('calculates effective absorption from preset', () => {
    // concrete: average of 0.01,0.01,0.02,0.02,0.02,0.03
    expect((node as any).__audioMaterialState.effectiveAbsorption).toBeCloseTo(0.018, 2);
  });

  it('uses custom coefficients when provided', () => {
    const n2 = createMockNode('custom');
    const c2 = createMockContext();
    const customCfg = { ...cfg, absorption_coefficients: { 125: 0.5, 250: 0.5, 500: 0.5 } };
    attachTrait(audioMaterialHandler, n2, customCfg as any, c2);
    expect((n2 as any).__audioMaterialState.effectiveAbsorption).toBeCloseTo(0.5, 2);
  });

  it('query returns material properties', () => {
    sendEvent(audioMaterialHandler, node, cfg, ctx, {
      type: 'audio_material_query',
      queryId: 'q1',
    });
    const r = getLastEvent(ctx, 'audio_material_response') as any;
    expect(r.reflection).toBe(0.5);
    expect(r.transmission).toBe(0.1);
    expect(r.effectiveAbsorption).toBeCloseTo(0.018, 2);
  });

  it('set_preset emits update', () => {
    sendEvent(audioMaterialHandler, node, cfg, ctx, {
      type: 'audio_material_set_preset',
      preset: 'fabric',
    });
    expect(getEventCount(ctx, 'audio_material_update')).toBe(1);
  });

  it('cleans up on detach', () => {
    audioMaterialHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__audioMaterialState).toBeUndefined();
    expect(getEventCount(ctx, 'audio_material_unregister')).toBe(1);
  });
});
