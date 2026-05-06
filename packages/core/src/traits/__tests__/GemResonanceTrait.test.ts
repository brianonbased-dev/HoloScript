import { describe, expect, it, vi } from 'vitest';
import {
  GEM_RESONANCE_ELEMENT_FREQUENCIES,
  gemResonanceHandler,
  type GemResonanceConfig,
} from '../GemResonanceTrait';
import { vrTraitRegistry } from '../VRTraitSystem';

function makeNode(element = 'fire') {
  return {
    id: 'fire_gem',
    traits: new Map<string, Record<string, unknown>>([
      ['crystal_gem', { cut: 'emerald' }],
      ['enchantable', { element }],
    ]),
    stateBlock: { element, held: false },
  } as any;
}

function makeContext() {
  return { emit: vi.fn() };
}

function makeConfig(overrides: Partial<GemResonanceConfig> = {}) {
  return { ...gemResonanceHandler.defaultConfig!, ...overrides };
}

describe('GemResonanceTrait', () => {
  it('maps requested elemental defaults to base frequencies', () => {
    expect(GEM_RESONANCE_ELEMENT_FREQUENCIES.fire).toBe(440);
    expect(GEM_RESONANCE_ELEMENT_FREQUENCIES.water).toBe(528);
    expect(GEM_RESONANCE_ELEMENT_FREQUENCIES.earth).toBe(396);
  });

  it('is registered with the VR trait registry', () => {
    expect(vrTraitRegistry.getHandler('gem_resonance' as any)).toBe(gemResonanceHandler);
  });

  it('registers an enchanted crystal gem with its resolved frequency', () => {
    const node = makeNode('fire');
    const ctx = makeContext();
    const config = makeConfig();

    gemResonanceHandler.onAttach!(node, config, ctx as any);

    expect(ctx.emit).toHaveBeenCalledWith(
      'gem_resonance_register',
      expect.objectContaining({
        nodeId: 'fire_gem',
        element: 'fire',
        baseFrequency: 440,
        maxDistance: 0.5,
        qualified: true,
      })
    );
  });

  it('resolves enchantable element from trait directives', () => {
    const node = {
      id: 'directive_gem',
      directives: [
        { type: 'trait', name: 'crystal_gem', config: { cut: 'round' } },
        { type: 'trait', name: 'enchantable', config: { element: 'water' } },
      ],
    } as any;
    const ctx = makeContext();
    const config = makeConfig();

    gemResonanceHandler.onAttach!(node, config, ctx as any);

    expect(ctx.emit).toHaveBeenCalledWith(
      'gem_resonance_register',
      expect.objectContaining({
        nodeId: 'directive_gem',
        element: 'water',
        baseFrequency: 528,
        qualified: true,
      })
    );
  });

  it('probes nearby gems on a deterministic update interval', () => {
    const node = makeNode('fire');
    const ctx = makeContext();
    const config = makeConfig({ probe_interval_ms: 100 });
    gemResonanceHandler.onAttach!(node, config, ctx as any);
    ctx.emit.mockClear();

    gemResonanceHandler.onUpdate!(node, config, ctx as any, 0.099);
    expect(ctx.emit).not.toHaveBeenCalledWith('gem_resonance_probe', expect.any(Object));

    gemResonanceHandler.onUpdate!(node, config, ctx as any, 0.001);
    expect(ctx.emit).toHaveBeenCalledWith(
      'gem_resonance_probe',
      expect.objectContaining({
        nodeId: 'fire_gem',
        element: 'fire',
        baseFrequency: 440,
        maxDistance: 0.5,
      })
    );
  });

  it('emits harmonic spatial audio for nearby enchanted crystal gems', () => {
    const node = makeNode('fire');
    const ctx = makeContext();
    const config = makeConfig();
    gemResonanceHandler.onAttach!(node, config, ctx as any);
    ctx.emit.mockClear();

    gemResonanceHandler.onEvent!(node, config, ctx as any, {
      type: 'gem_resonance_neighbors',
      payload: {
        neighbors: [
          {
            nodeId: 'water_gem',
            element: 'water',
            distance: 0.42,
            traits: ['crystal_gem', 'enchantable'],
          },
          {
            nodeId: 'earth_gem',
            element: 'earth',
            distance: 0.8,
            traits: ['crystal_gem', 'enchantable'],
          },
        ],
      },
    });

    expect(ctx.emit).toHaveBeenCalledWith(
      'gem_resonance_audio',
      expect.objectContaining({
        resonanceId: 'fire_water_harmonic',
        elements: ['fire', 'water'],
        frequencies: [440, 528],
        beatFrequencies: [88],
        neighborIds: ['water_gem'],
        spatial: true,
      })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'spatial_audio',
      expect.objectContaining({
        source: 'gem_resonance',
        frequencies: [440, 528],
      })
    );
  });
});
