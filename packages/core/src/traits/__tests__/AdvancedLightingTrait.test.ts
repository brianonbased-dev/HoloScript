/**
 * AdvancedLightingTrait — comprehensive tests
 */
import { describe, it, expect } from 'vitest';
import {
  ADVANCED_LIGHTING_RUNTIME_CLAIM,
  AdvancedLightingTrait,
  type AdvancedLightingConfig,
  type AdvancedLightingRuntimeState,
  type AreaRectLightConfig,
  type AreaDiskLightConfig,
  type IESLightConfig,
} from '../AdvancedLightingTrait';
import type { HSPlusNode, TraitContext, TraitEvent } from '../TraitTypes';

function makeRectConfig(overrides: Partial<AreaRectLightConfig> = {}): AreaRectLightConfig {
  return { width: 2, height: 1, intensity: 500, color: [1, 1, 1], ...overrides };
}

function makeDiskConfig(overrides: Partial<AreaDiskLightConfig> = {}): AreaDiskLightConfig {
  return { radius: 1, intensity: 300, color: [1, 0.9, 0.8], ...overrides };
}

function makeIESConfig(overrides: Partial<IESLightConfig> = {}): IESLightConfig {
  return { profilePath: 'lights/office.ies', intensity: 1000, color: [1, 1, 1], ...overrides };
}

interface EmittedEvent {
  type: string;
  payload: unknown;
}

function makeNode(): HSPlusNode {
  return {
    type: 'Object',
    id: 'advanced-lighting-node',
  } as unknown as HSPlusNode;
}

function makeContext(events: EmittedEvent[]): TraitContext {
  return {
    emit(type: string, payload?: unknown): void {
      events.push({ type, payload });
    },
  } as unknown as TraitContext;
}

describe('AdvancedLightingTrait — metadata', () => {
  it('has name "advanced_lighting"', () => {
    expect(AdvancedLightingTrait.name).toBe('advanced_lighting');
  });

  it('advertises a renderer-adapter runtime claim instead of a full renderer', () => {
    expect(ADVANCED_LIGHTING_RUNTIME_CLAIM).toMatchObject({
      capability: 'renderer-adapter',
      runtimeBody: 'node-state-and-events',
      rendererRequired: true,
    });
    expect(ADVANCED_LIGHTING_RUNTIME_CLAIM.omittedFeatures).toContain('no in-core renderer');
  });
});

describe('AdvancedLightingTrait — validate', () => {
  it('accepts valid area_rect config', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    expect(AdvancedLightingTrait.validate!(config)).toBe(true);
  });

  it('accepts valid area_disk config', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_disk', config: makeDiskConfig() }],
    };
    expect(AdvancedLightingTrait.validate!(config)).toBe(true);
  });

  it('accepts valid ies config', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'ies', config: makeIESConfig() }],
    };
    expect(AdvancedLightingTrait.validate!(config)).toBe(true);
  });

  it('accepts multiple lights of different types', () => {
    const config: AdvancedLightingConfig = {
      lights: [
        { type: 'area_rect', config: makeRectConfig() },
        { type: 'area_disk', config: makeDiskConfig() },
        { type: 'ies', config: makeIESConfig() },
      ],
    };
    expect(AdvancedLightingTrait.validate!(config)).toBe(true);
  });

  it('throws when lights array is empty', () => {
    const config: AdvancedLightingConfig = { lights: [] };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('at least one light entry');
  });

  it('throws when lights is not an array', () => {
    const config = { lights: null } as unknown as AdvancedLightingConfig;
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow();
  });

  it('throws for unknown light type', () => {
    const config = {
      lights: [{ type: 'laser_beam', config: {} }],
    } as unknown as AdvancedLightingConfig;
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('Unknown light type');
  });

  it('throws area_rect with width <= 0', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig({ width: 0 }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('width and height must be > 0');
  });

  it('throws area_rect with height <= 0', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig({ height: -1 }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('width and height must be > 0');
  });

  it('throws area_rect with negative intensity', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig({ intensity: -1 }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('intensity must be >= 0');
  });

  it('throws area_disk with radius <= 0', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_disk', config: makeDiskConfig({ radius: 0 }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('radius must be > 0');
  });

  it('throws ies without profilePath', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'ies', config: makeIESConfig({ profilePath: '' }) }],
    };
    expect(() => AdvancedLightingTrait.validate!(config)).toThrow('profilePath is required');
  });
});

describe('AdvancedLightingTrait — compile (unity)', () => {
  it('generates Unity HDRP code for area_rect light', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'unity');
    expect(result).toContain('LightType.Rectangle');
    expect(result).toContain('AdvancedLightingSetup');
  });

  it('includes area_disk in Unity output', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_disk', config: makeDiskConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'unity');
    expect(result).toContain('LightType.Disc');
  });

  it('includes IES light in Unity output', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'ies', config: makeIESConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'unity');
    expect(result).toContain('office.ies');
  });
});

describe('AdvancedLightingTrait — compile (unreal)', () => {
  it('generates Unreal code for area_rect light', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'unreal');
    expect(result).toContain('ARectLight');
  });
});

describe('AdvancedLightingTrait — compile (web)', () => {
  it('generates web code', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'web');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('react-three-fiber target produces output', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'react-three-fiber');
    expect(typeof result).toBe('string');
  });
});

describe('AdvancedLightingTrait — compile (webgpu)', () => {
  it('names the host renderer requirement for LTC integration', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'webgpu');
    expect(result).toContain('Host renderers must provide LTC lookup textures');
    expect(result).not.toContain('full LTC polygon integration omitted');
  });
});

describe('AdvancedLightingTrait — runtime adapter lifecycle', () => {
  it('stores renderer-facing state and emits an attach event', () => {
    const events: EmittedEvent[] = [];
    const node = makeNode();
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };

    AdvancedLightingTrait.onAttach!(node, config, makeContext(events));

    const state = node.__advancedLightingState as AdvancedLightingRuntimeState;
    expect(state.active).toBe(true);
    expect(state.revision).toBe(0);
    expect(state.claim.rendererRequired).toBe(true);
    expect(state.lights).toEqual(config.lights);
    expect(state.lights).not.toBe(config.lights);
    expect(events[0]).toMatchObject({
      type: 'advanced_lighting_attached',
      payload: { nodeId: 'advanced-lighting-node', rendererRequired: true },
    });
  });

  it('updates runtime state through explicit adapter events', () => {
    const events: EmittedEvent[] = [];
    const node = makeNode();
    const context = makeContext(events);
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const nextConfig: AdvancedLightingConfig = {
      lights: [{ type: 'area_disk', config: makeDiskConfig({ radius: 2 }) }],
    };

    AdvancedLightingTrait.onAttach!(node, config, context);
    AdvancedLightingTrait.onEvent!(node, config, context, {
      type: 'advanced_lighting_update',
      payload: { config: nextConfig },
    } as TraitEvent);

    const state = node.__advancedLightingState as AdvancedLightingRuntimeState;
    expect(state.revision).toBe(1);
    expect(state.lights).toEqual(nextConfig.lights);
    expect(events.map((event) => event.type)).toContain('advanced_lighting_updated');
  });

  it('answers state queries and clears state on detach', () => {
    const events: EmittedEvent[] = [];
    const node = makeNode();
    const context = makeContext(events);
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };

    AdvancedLightingTrait.onAttach!(node, config, context);
    AdvancedLightingTrait.onEvent!(node, config, context, {
      type: 'advanced_lighting_query',
    } as TraitEvent);
    AdvancedLightingTrait.onDetach!(node, config, context);

    expect(events.map((event) => event.type)).toEqual([
      'advanced_lighting_attached',
      'advanced_lighting_state',
      'advanced_lighting_detached',
    ]);
    expect(node.__advancedLightingState).toBeUndefined();
  });
});

describe('AdvancedLightingTrait — compile (generic fallback)', () => {
  it('unknown target returns generic output', () => {
    const config: AdvancedLightingConfig = {
      lights: [{ type: 'area_rect', config: makeRectConfig() }],
    };
    const result = AdvancedLightingTrait.compile!(config, 'godot');
    expect(typeof result).toBe('string');
  });
});
