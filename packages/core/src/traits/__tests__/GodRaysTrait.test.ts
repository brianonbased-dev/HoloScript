/**
 * GodRaysTrait — comprehensive tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWeatherBlackboard = vi.hoisted(() => ({
  sun_position: [100, 200, 100] as [number, number, number],
  sun_intensity: 1.0,
  is_night: false,
}));

vi.mock('@holoscript/engine/environment/WeatherBlackboard', () => ({
  weatherBlackboard: mockWeatherBlackboard,
}));

import { godRaysHandler } from '../GodRaysTrait';

const makeNode = () => ({
  id: 'n-gr',
  traits: new Set<string>(),
  emit: vi.fn(),
});

const defaultConfig = {
  decay: 0.96,
  weight: 0.5,
  exposure: 0.3,
  samples: 100,
  density: 1.0,
  use_weather: true,
  light_position: [100, 200, 100] as [number, number, number],
};

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('GodRaysTrait — metadata', () => {
  it('has name "god_rays"', () => {
    expect(godRaysHandler.name).toBe('god_rays');
  });

  it('defaultConfig decay is 0.96', () => {
    expect(godRaysHandler.defaultConfig?.decay).toBe(0.96);
  });

  it('defaultConfig use_weather is true', () => {
    expect(godRaysHandler.defaultConfig?.use_weather).toBe(true);
  });
});

describe('GodRaysTrait — lifecycle', () => {
  it('onAttach emits god_rays_create with light parameters', () => {
    const node = makeNode();
    godRaysHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('god_rays_create', expect.objectContaining({
      decay: 0.96,
      weight: 0.5,
      exposure: 0.3,
    }));
  });

  it('onDetach emits god_rays_destroy', () => {
    const node = makeNode();
    godRaysHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    godRaysHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('god_rays_destroy', { nodeId: 'n-gr' });
  });
});

describe('GodRaysTrait — onUpdate', () => {
  it('emits god_rays_update when active and use_weather=true', () => {
    const node = makeNode();
    godRaysHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    godRaysHandler.onUpdate!(node as never, defaultConfig, makeCtx(node) as never, 0.016);
    expect(node.emit).toHaveBeenCalledWith('god_rays_update', expect.objectContaining({
      lightPosition: mockWeatherBlackboard.sun_position,
    }));
  });
});

describe('GodRaysTrait — onEvent', () => {
  it('god_rays_set_params emits god_rays_update with overridden params', () => {
    const node = makeNode();
    godRaysHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    godRaysHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'god_rays_set_params', decay: 0.8, exposure: 0.6,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('god_rays_update', expect.objectContaining({
      decay: 0.8,
      exposure: 0.6,
    }));
  });
});
