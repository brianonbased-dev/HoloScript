import { describe, it, expect, vi } from 'vitest';
import { volumetricHandler } from '../traits/VolumetricTrait';
import { SplatProcessingService } from '../services/SplatProcessingService';

describe('Volumetric Interaction (Phase 11.5)', () => {
  it('should handle volumetric_ray_query and emit ray_hit', async () => {
    const mockNode = { properties: {} };
    const mockConfig = volumetricHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;

    volumetricHandler.onAttach!(mockNode as any, mockConfig, mockContext);
    const state = (mockNode as any).__volumetricState;

    // Mock Splat Data: 1 splat at [5, 0, 0]
    const positions = new Float32Array([5, 0, 0]);
    const scales = new Float32Array([1, 1, 1]);
    const rotations = new Float32Array([0, 0, 0, 1]);
    const colors = new Uint8Array([255, 255, 255, 255]);
    state.splatData = { positions, scales, rotations, colors, count: 1 };
    state.isLoaded = true;

    // Query: Ray from origin along +X axis
    console.log('[DEBUG] Sending volumetric_ray_query...');
    volumetricHandler.onEvent!(mockNode as any, mockConfig, mockContext, {
      type: 'volumetric_ray_query',
      origin: [0, 0, 0],
      direction: [1, 0, 0],
      threshold: 1.0,
      queryId: 'test-query-1',
    });

    const calls = mockContext.emit.mock.calls;
    console.log(
      '[DEBUG] mockContext.emit types:',
      calls.map((c) => c[0])
    );
    const hitCall = calls.find((c) => c[0] === 'volumetric_ray_hit');
    if (hitCall) {
      console.log('[DEBUG] hitCall payload:', JSON.stringify(hitCall[1], null, 2));
    }

    expect(mockContext.emit).toHaveBeenCalledWith(
      'volumetric_ray_hit',
      expect.objectContaining({
        queryId: 'test-query-1',
        hit: expect.objectContaining({
          index: 0,
          distance: expect.any(Number),
        }),
      })
    );

    // Distance should be 4.0 (5.0 center - 1.0 radius)
    const hit = mockContext.emit.mock.calls.find((c) => c[0] === 'volumetric_ray_hit')[1].hit;
    expect(hit.distance).toBeLessThanOrEqual(5.0);
    expect(hit.distance).toBeGreaterThanOrEqual(4.0);
  });

  it('should return null hit if ray misses', () => {
    const mockNode = { properties: {} };
    const mockConfig = volumetricHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;

    volumetricHandler.onAttach!(mockNode as any, mockConfig, mockContext);
    const state = (mockNode as any).__volumetricState;

    const positions = new Float32Array([5, 0, 0]);
    const scales = new Float32Array([1, 1, 1]);
    const rotations = new Float32Array([0, 0, 0, 1]);
    const colors = new Uint8Array([255, 255, 255, 255]);
    state.splatData = { positions, scales, rotations, colors, count: 1 };
    state.isLoaded = true;

    // Query: Ray from origin along +Y axis (should miss)
    volumetricHandler.onEvent!(mockNode as any, mockConfig, mockContext, {
      type: 'volumetric_ray_query',
      origin: [0, 0, 0],
      direction: [0, 1, 0],
      queryId: 'test-query-miss',
    });

    expect(mockContext.emit).toHaveBeenCalledWith(
      'volumetric_ray_hit',
      expect.objectContaining({
        queryId: 'test-query-miss',
        hit: null,
      })
    );
  });
});
