import { describe, it, expect, beforeEach } from 'vitest';
import { gpuParticleHandler } from '../GPUParticleTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('GPUParticleTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    count: 10000,
    emission_rate: 1000,
    lifetime: 2.0,
    lifetime_variance: 0.5,
    initial_velocity: [0, 5, 0] as [number, number, number],
    velocity_variance: [1, 1, 1] as [number, number, number],
    spread_angle: 30,
    forces: [
      {
        type: 'gravity' as const,
        strength: 9.81,
        direction: [0, -1, 0] as [number, number, number],
      },
    ],
    color_over_life: [
      { time: 0, color: [1, 1, 1, 1] as [number, number, number, number] },
      { time: 1, color: [1, 1, 1, 0] as [number, number, number, number] },
    ],
    size_over_life: [
      { time: 0, size: 0.1 },
      { time: 1, size: 0 },
    ],
    collision: false,
    collision_damping: 0.5,
    spatial_hash: false,
    sprite: '',
    blend_mode: 'additive' as const,
  };

  beforeEach(() => {
    node = createMockNode('part');
    ctx = createMockContext();
    attachTrait(gpuParticleHandler, node, cfg, ctx);
  });

  it('creates particle system on attach', () => {
    expect(getEventCount(ctx, 'gpu_particle_create')).toBe(1);
    expect((node as any).__gpuParticleState.isRunning).toBe(true);
  });

  it('continuous emission on update', () => {
    updateTrait(gpuParticleHandler, node, cfg, ctx, 0.1);
    expect(getEventCount(ctx, 'gpu_particle_emit')).toBe(1);
    expect(getEventCount(ctx, 'gpu_particle_step')).toBe(1);
  });

  it('burst queues and processes on update', () => {
    sendEvent(gpuParticleHandler, node, cfg, ctx, { type: 'particle_burst', count: 500 });
    expect((node as any).__gpuParticleState.burstQueue).toHaveLength(1);
    updateTrait(gpuParticleHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'gpu_particle_burst')).toBe(1);
    expect((node as any).__gpuParticleState.totalEmitted).toBe(500);
  });

  it('stop/start emission controls', () => {
    sendEvent(gpuParticleHandler, node, cfg, ctx, { type: 'particle_stop' });
    expect((node as any).__gpuParticleState.isEmitting).toBe(false);
    updateTrait(gpuParticleHandler, node, cfg, ctx, 0.1);
    expect(getEventCount(ctx, 'gpu_particle_emit')).toBe(0);
    sendEvent(gpuParticleHandler, node, cfg, ctx, { type: 'particle_start' });
    expect((node as any).__gpuParticleState.isEmitting).toBe(true);
  });

  it('pause/resume controls running', () => {
    sendEvent(gpuParticleHandler, node, cfg, ctx, { type: 'particle_pause' });
    expect((node as any).__gpuParticleState.isRunning).toBe(false);
    updateTrait(gpuParticleHandler, node, cfg, ctx, 0.1);
    expect(getEventCount(ctx, 'gpu_particle_step')).toBe(0);
    sendEvent(gpuParticleHandler, node, cfg, ctx, { type: 'particle_resume' });
    expect((node as any).__gpuParticleState.isRunning).toBe(true);
  });

  it('set emitter position and velocity', () => {
    sendEvent(gpuParticleHandler, node, cfg, ctx, {
      type: 'particle_set_emitter',
      position: [1, 2, 3],
      velocity: { x: 0, y: 1, z: 0 },
    });
    expect((node as any).__gpuParticleState.emitterPosition).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('add/remove force', () => {
    sendEvent(gpuParticleHandler, node, cfg, ctx, {
      type: 'particle_add_force',
      force: { type: 'wind', strength: 5, direction: [1, 0, 0] },
    });
    expect(getEventCount(ctx, 'gpu_particle_add_force')).toBe(1);
    sendEvent(gpuParticleHandler, node, cfg, ctx, { type: 'particle_remove_force', forceIndex: 0 });
    expect(getEventCount(ctx, 'gpu_particle_remove_force')).toBe(1);
  });

  it('clear resets active count', () => {
    (node as any).__gpuParticleState.activeCount = 500;
    sendEvent(gpuParticleHandler, node, cfg, ctx, { type: 'particle_clear' });
    expect((node as any).__gpuParticleState.activeCount).toBe(0);
    expect(getEventCount(ctx, 'gpu_particle_clear')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(gpuParticleHandler, node, cfg, ctx, { type: 'particle_query', queryId: 'q1' });
    const info = getLastEvent(ctx, 'particle_info') as any;
    expect(info.queryId).toBe('q1');
    expect(info.maxParticles).toBe(10000);
  });

  it('detach cleans up', () => {
    (node as any).__gpuParticleState.computeHandle = 'ch';
    gpuParticleHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__gpuParticleState).toBeUndefined();
    expect(getEventCount(ctx, 'gpu_particle_destroy')).toBe(1);
  });
});
