/**
 * AI Traits Production Tests
 *
 * DiffusionRealtimeTrait + EmbeddingSearchTrait + SpatialNavigationTrait
 */

import { describe, it, expect, vi } from 'vitest';
import { diffusionRealtimeHandler } from '../DiffusionRealtimeTrait';
import { embeddingSearchHandler } from '../EmbeddingSearchTrait';
import { spatialNavigationHandler } from '../SpatialNavigationTrait';

function mockContext(player?: any) {
  const stateStore: Record<string, any> = {};
  return {
    setState: (s: any) => Object.assign(stateStore, s),
    getState: () => stateStore,
    emit: vi.fn(),
    player: player ?? null,
  } as any;
}

const mockNode = { id: 'test-node' } as any;

// ─── DiffusionRealtime ───────────────────────────────────────────────────────

describe('DiffusionRealtimeTrait — Production', () => {
  const handler = diffusionRealtimeHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets idle state and emits ready', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    expect(ctx.getState().diffusionRealtime.isStreaming).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'diffusion_rt:ready',
      expect.objectContaining({ backend: 'lcm' })
    );
  });

  it('start event begins streaming', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'diffusion_rt:start', payload: {} });
    expect(ctx.getState().diffusionRealtime.isStreaming).toBe(true);
    expect(ctx.getState().diffusionRealtime.frameCount).toBe(0);
  });

  it('frame event increments count', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'diffusion_rt:start', payload: {} });
    handler.onEvent!(mockNode, config, ctx, {
      type: 'diffusion_rt:frame',
      payload: { frameUrl: 'f1', latencyMs: 16 },
    });
    expect(ctx.getState().diffusionRealtime.frameCount).toBe(1);
    expect(ctx.getState().diffusionRealtime.lastFrameUrl).toBe('f1');
  });

  it('frame_dropped increments dropped', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'diffusion_rt:start', payload: {} });
    handler.onEvent!(mockNode, config, ctx, { type: 'diffusion_rt:frame_dropped', payload: {} });
    expect(ctx.getState().diffusionRealtime.droppedFrames).toBe(1);
  });

  it('stop event ends streaming', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'diffusion_rt:start', payload: {} });
    handler.onEvent!(mockNode, config, ctx, { type: 'diffusion_rt:stop', payload: {} });
    expect(ctx.getState().diffusionRealtime.isStreaming).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:stopped', expect.any(Object));
  });

  it('onDetach stops if streaming', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'diffusion_rt:start', payload: {} });
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.getState().diffusionRealtime.isStreaming).toBe(false);
  });

  it('prompt_update emits new prompt', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'diffusion_rt:prompt_update',
      payload: { prompt: 'cyberpunk city' },
    });
    expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:prompt_updated', {
      prompt: 'cyberpunk city',
    });
  });
});

// ─── EmbeddingSearch ─────────────────────────────────────────────────────────

describe('EmbeddingSearchTrait — Production', () => {
  const handler = embeddingSearchHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets empty cache', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    expect(ctx.getState().embeddingSearch.totalQueries).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('search:ready', expect.any(Object));
  });

  it('query starts search', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'search:query',
      payload: { query: 'find red orbs' },
    });
    expect(ctx.getState().embeddingSearch.totalQueries).toBe(1);
    expect(ctx.getState().embeddingSearch.isSearching).toBe(true);
  });

  it('results filters by min_score and top_k', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'search:query', payload: { query: 'test' } });
    handler.onEvent!(mockNode, config, ctx, {
      type: 'search:results',
      payload: {
        queryTimeMs: 10,
        results: [
          { id: 'a', score: 0.9, payload: {} },
          { id: 'b', score: 0.3, payload: {} }, // below min_score 0.6
          { id: 'c', score: 0.7, payload: {} },
        ],
      },
    });
    const s = ctx.getState().embeddingSearch;
    expect(s.lastResults).toHaveLength(2); // only a,c
    expect(s.isSearching).toBe(false);
  });

  it('avgQueryTimeMs rolling average', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'search:query', payload: { query: 'q1' } });
    handler.onEvent!(mockNode, config, ctx, {
      type: 'search:results',
      payload: { queryTimeMs: 10, results: [] },
    });
    handler.onEvent!(mockNode, config, ctx, { type: 'search:query', payload: { query: 'q2' } });
    handler.onEvent!(mockNode, config, ctx, {
      type: 'search:results',
      payload: { queryTimeMs: 20, results: [] },
    });
    expect(ctx.getState().embeddingSearch.avgQueryTimeMs).toBe(15);
  });

  it('onDetach clears cache', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.getState().embeddingSearch.embeddingCache.size).toBe(0);
  });
});

// ─── SpatialNavigation ───────────────────────────────────────────────────────

describe('SpatialNavigationTrait — Production', () => {
  const handler = spatialNavigationHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets not navigating', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    expect(ctx.getState().spatialNavigation.isNavigating).toBe(false);
  });

  it('start event sets waypoints and begins', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'navigation:start',
      payload: {
        waypoints: [{ position: [10, 0, 10] }, { position: [20, 0, 20] }],
        totalDistance: 100,
      },
    });
    const s = ctx.getState().spatialNavigation;
    expect(s.isNavigating).toBe(true);
    expect(s.waypoints).toHaveLength(2);
    expect(s.waypoints[0].id).toBe('wp_0');
  });

  it('stop event halts navigation', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'navigation:start',
      payload: { waypoints: [{ position: [1, 0, 1] }] },
    });
    handler.onEvent!(mockNode, config, ctx, { type: 'navigation:stop', payload: {} });
    expect(ctx.getState().spatialNavigation.isNavigating).toBe(false);
  });

  it('onUpdate reaches waypoint within radius', () => {
    const ctx = mockContext({ position: [10, 0, 10] });
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'navigation:start',
      payload: { waypoints: [{ position: [10, 0, 10] }] },
    });
    handler.onUpdate!(mockNode, config, ctx, 0.016);
    expect(ctx.getState().spatialNavigation.waypoints[0].reached).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('navigation:arrived');
  });

  it('onUpdate advances to next waypoint', () => {
    const ctx = mockContext({ position: [10, 0, 10] });
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'navigation:start',
      payload: { waypoints: [{ position: [10, 0, 10] }, { position: [100, 0, 100] }] },
    });
    handler.onUpdate!(mockNode, config, ctx, 0.016);
    expect(ctx.getState().spatialNavigation.currentWaypointIndex).toBe(1);
    expect(ctx.getState().spatialNavigation.isNavigating).toBe(true); // not finished yet
  });

  it('onDetach emits cancelled if navigating', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'navigation:start',
      payload: { waypoints: [{ position: [50, 0, 50] }] },
    });
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('navigation:cancelled');
  });
});
