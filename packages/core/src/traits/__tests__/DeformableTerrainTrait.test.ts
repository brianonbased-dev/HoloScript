/**
 * DeformableTerrainTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the weatherBlackboard before importing the trait
vi.mock('@holoscript/engine/environment/WeatherBlackboard', () => ({
  weatherBlackboard: {
    precipitation: 0,
    wind_vector: [0, 0, 0],
  },
}));

import { deformableTerrainHandler } from '../DeformableTerrainTrait';
import { weatherBlackboard } from '@holoscript/engine/environment/WeatherBlackboard';

const makeNode = () => ({
  id: 'node-terrain',
  traits: new Set<string>(),
  emit: vi.fn(),
  __terrainState: undefined as unknown,
});

const defaultConfig = {
  resolution: 256,
  scale: 100,
  displacement_scale: 5.0,
  erosion_rate: 0.01,
  sediment_capacity: 0.02,
  thermal_threshold: 45,
  use_weather: true,
  use_gpu: true,
};

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DeformableTerrainTrait — metadata', () => {
  it('has name "deformable_terrain"', () => {
    expect(deformableTerrainHandler.name).toBe('deformable_terrain');
  });

  it('defaultConfig resolution is 256', () => {
    expect(deformableTerrainHandler.defaultConfig?.resolution).toBe(256);
  });
});

describe('DeformableTerrainTrait — onAttach / onDetach', () => {
  it('onAttach emits deformable_terrain_create with config fields', () => {
    const node = makeNode();
    deformableTerrainHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('deformable_terrain_create', expect.objectContaining({
      resolution: 256, scale: 100, useGPU: true,
    }));
  });

  it('onAttach initializes terrain state with active=true', () => {
    const node = makeNode();
    deformableTerrainHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__terrainState as { active: boolean; totalErosion: number; erosionSteps: number };
    expect(state.active).toBe(true);
    expect(state.totalErosion).toBe(0);
    expect(state.erosionSteps).toBe(0);
  });

  it('onDetach emits deformable_terrain_destroy', () => {
    const node = makeNode();
    deformableTerrainHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    deformableTerrainHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('deformable_terrain_destroy', { nodeId: 'node-terrain' });
    expect(node.__terrainState).toBeUndefined();
  });
});

describe('DeformableTerrainTrait — onUpdate', () => {
  it('does NOT erode when precipitation is 0', () => {
    const node = makeNode();
    deformableTerrainHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    (weatherBlackboard as { precipitation: number }).precipitation = 0;
    deformableTerrainHandler.onUpdate!(node as never, defaultConfig, makeCtx(node) as never, 0.016);
    expect(node.emit).not.toHaveBeenCalled();
  });

  it('erodes and emits deformable_terrain_erode when precipitation > 0', () => {
    const node = makeNode();
    deformableTerrainHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    (weatherBlackboard as { precipitation: number }).precipitation = 0.5;
    deformableTerrainHandler.onUpdate!(node as never, defaultConfig, makeCtx(node) as never, 0.016);
    expect(node.emit).toHaveBeenCalledWith('deformable_terrain_erode', expect.objectContaining({
      deltaTime: 0.016,
    }));
    const state = node.__terrainState as { erosionSteps: number };
    expect(state.erosionSteps).toBe(1);
    // Reset for other tests
    (weatherBlackboard as { precipitation: number }).precipitation = 0;
  });
});

describe('DeformableTerrainTrait — onEvent', () => {
  it('terrain_deform emits deformable_terrain_deform', () => {
    const node = makeNode();
    deformableTerrainHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    deformableTerrainHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'terrain_deform', position: [10, 0, 5], radius: 3.0, strength: 2.0, mode: 'raise',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('deformable_terrain_deform', expect.objectContaining({
      position: [10, 0, 5], mode: 'raise',
    }));
  });

  it('terrain_reset resets erosion counters', () => {
    const node = makeNode();
    (weatherBlackboard as { precipitation: number }).precipitation = 1.0;
    deformableTerrainHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deformableTerrainHandler.onUpdate!(node as never, defaultConfig, makeCtx(node) as never, 0.016);
    const state = node.__terrainState as { erosionSteps: number; totalErosion: number };
    expect(state.erosionSteps).toBe(1);
    node.emit.mockClear();
    deformableTerrainHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'terrain_reset',
    } as never);
    expect(state.totalErosion).toBe(0);
    expect(state.erosionSteps).toBe(0);
    expect(node.emit).toHaveBeenCalledWith('deformable_terrain_reset', {});
    // Reset
    (weatherBlackboard as { precipitation: number }).precipitation = 0;
  });
});
