import { describe, it, expect, beforeEach } from 'vitest';
import { fluidHandler } from '../FluidTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('FluidTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    method: 'sph' as const,
    particle_count: 10000,
    viscosity: 0.01,
    surface_tension: 0.07,
    density: 1000,
    gravity: [0, -9.81, 0] as [number, number, number],
    render_mode: 'particles' as const,
    kernel_radius: 0.04,
    time_step: 0.001,
    collision_damping: 0.3,
    rest_density: 1000,
  };

  beforeEach(() => {
    node = createMockNode('fluid');
    ctx = createMockContext();
    attachTrait(fluidHandler, node, cfg, ctx);
  });

  it('initializes and starts simulating', () => {
    const state = (node as any).__fluidState;
    expect(state.isSimulating).toBe(true);
    expect(getEventCount(ctx, 'fluid_create')).toBe(1);
  });

  it('add_emitter stores emitter', () => {
    sendEvent(fluidHandler, node, cfg, ctx, {
      type: 'fluid_add_emitter',
      emitterId: 'e1',
      position: [0, 1, 0],
      rate: 200,
      velocity: [0, -2, 0 ],
    });
    expect((node as any).__fluidState.emitters.size).toBe(1);
  });

  it('remove_emitter removes', () => {
    sendEvent(fluidHandler, node, cfg, ctx, { type: 'fluid_add_emitter', emitterId: 'e1' });
    sendEvent(fluidHandler, node, cfg, ctx, { type: 'fluid_remove_emitter', emitterId: 'e1' });
    expect((node as any).__fluidState.emitters.size).toBe(0);
  });

  it('particle_update updates state', () => {
    sendEvent(fluidHandler, node, cfg, ctx, {
      type: 'fluid_particle_update',
      particleCount: 500,
      volume: 0.1,
    });
    expect((node as any).__fluidState.particleCount).toBe(500);
    expect(getEventCount(ctx, 'fluid_render_update')).toBe(1);
  });

  it('splash emits impulse and event', () => {
    sendEvent(fluidHandler, node, cfg, ctx, {
      type: 'fluid_splash',
      position: [0, 0, 0],
      force: 20,
      radius: 1,
    });
    expect(getEventCount(ctx, 'fluid_apply_impulse')).toBe(1);
    expect(getEventCount(ctx, 'on_fluid_splash')).toBe(1);
  });

  it('pause and resume control simulation', () => {
    sendEvent(fluidHandler, node, cfg, ctx, { type: 'fluid_pause' });
    expect((node as any).__fluidState.isSimulating).toBe(false);
    sendEvent(fluidHandler, node, cfg, ctx, { type: 'fluid_resume' });
    expect((node as any).__fluidState.isSimulating).toBe(true);
  });

  it('reset clears state', () => {
    sendEvent(fluidHandler, node, cfg, ctx, { type: 'fluid_add_emitter', emitterId: 'x' });
    sendEvent(fluidHandler, node, cfg, ctx, { type: 'fluid_reset' });
    expect((node as any).__fluidState.particleCount).toBe(0);
    expect((node as any).__fluidState.emitters.size).toBe(0);
  });

  it('query returns info', () => {
    sendEvent(fluidHandler, node, cfg, ctx, { type: 'fluid_query', queryId: 'q1' });
    const info = getLastEvent(ctx, 'fluid_info');
    expect(info.queryId).toBe('q1');
    expect(info.isSimulating).toBe(true);
  });

  it('detach cleans up', () => {
    fluidHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'fluid_destroy')).toBe(1);
    expect((node as any).__fluidState).toBeUndefined();
  });
});
