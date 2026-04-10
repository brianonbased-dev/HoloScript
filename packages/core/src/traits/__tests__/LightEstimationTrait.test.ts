import { describe, it, expect, beforeEach } from 'vitest';
import { lightEstimationHandler } from '../LightEstimationTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('LightEstimationTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'ambient_intensity' as const,
    auto_apply: true,
    update_rate: 30,
    shadow_estimation: false,
    color_temperature: true,
    smoothing: 0.8,
    intensity_multiplier: 1.0,
  };

  beforeEach(() => {
    node = createMockNode('le');
    ctx = createMockContext();
    attachTrait(lightEstimationHandler, node, cfg, ctx);
  });

  it('initializes active and requests estimation', () => {
    expect((node as any).__lightEstimationState.isActive).toBe(true);
    expect(getEventCount(ctx, 'light_estimation_request')).toBe(1);
  });

  it('update polls and auto-applies lighting', () => {
    updateTrait(lightEstimationHandler, node, cfg, ctx, 0.05); // > 1/30
    expect(getEventCount(ctx, 'light_estimation_poll')).toBe(1);
    expect(getEventCount(ctx, 'scene_light_update')).toBe(1);
  });

  it('estimation_update smooths intensity', () => {
    sendEvent(lightEstimationHandler, node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 2.0,
    });
    const s = (node as any).__lightEstimationState;
    // smoothed: 1.0 * 0.8 + 2.0 * 0.2 = 1.2
    expect(s.intensity).toBeCloseTo(1.2, 2);
    expect(getEventCount(ctx, 'on_light_estimated')).toBe(1);
  });

  it('color temperature updates correction', () => {
    sendEvent(lightEstimationHandler, node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 1,
      colorTemperature: 3000,
    });
    const s = (node as any).__lightEstimationState;
    expect(s.colorTemperature).toBeLessThan(6500);
    expect(s.colorCorrection.r).toBeGreaterThan(0);
  });

  it('direction is smoothed', () => {
    sendEvent(lightEstimationHandler, node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 1,
      direction: { x: 1, y: 0, z: 0 },
    });
    const s = (node as any).__lightEstimationState;
    // smoothed x: 0 * 0.8 + 1 * 0.2 = 0.2
    expect(s.primaryDirection.x).toBeCloseTo(0.2, 2);
  });

  it('env_map updates environment map', () => {
    sendEvent(lightEstimationHandler, node, cfg, ctx, {
      type: 'light_estimation_env_map',
      envMap: 'map_handle',
    });
    expect((node as any).__lightEstimationState.environmentMap).toBe('map_handle');
    expect(getEventCount(ctx, 'scene_environment_map_update')).toBe(1);
  });

  it('pause/resume controls active state', () => {
    sendEvent(lightEstimationHandler, node, cfg, ctx, { type: 'light_estimation_pause' });
    expect((node as any).__lightEstimationState.isActive).toBe(false);
    sendEvent(lightEstimationHandler, node, cfg, ctx, { type: 'light_estimation_resume' });
    expect((node as any).__lightEstimationState.isActive).toBe(true);
  });

  it('query returns state', () => {
    sendEvent(lightEstimationHandler, node, cfg, ctx, {
      type: 'light_estimation_query',
      queryId: 'q1',
    });
    const r = getLastEvent(ctx, 'light_estimation_response') as any;
    expect(r.intensity).toBe(1);
    expect(r.queryId).toBe('q1');
  });

  it('cleans up on detach', () => {
    lightEstimationHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__lightEstimationState).toBeUndefined();
    expect(getEventCount(ctx, 'light_estimation_stop')).toBe(1);
  });
});
