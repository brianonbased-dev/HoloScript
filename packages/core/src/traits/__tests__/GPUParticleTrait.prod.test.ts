/**
 * GPUParticleTrait — Production Test Suite
 *
 * gpuParticleHandler stores state on node.__gpuParticleState.
 * All GPU operations are emitted as events (no real GPU needed).
 *
 * Key behaviours:
 * 1. defaultConfig — count=10000, emission_rate=1000, forces=[gravity], etc.
 * 2. onAttach — creates state (isRunning=false initially, then =true after gpu_particle_create);
 *               emits gpu_particle_create with all params
 * 3. onDetach — emits gpu_particle_destroy only when computeHandle is set; removes state
 * 4. onUpdate — no-op when !isRunning
 *             — processes burstQueue: emits gpu_particle_burst for each, increments totalEmitted
 *             — emits gpu_particle_emit when isEmitting=true and activeCount < count
 *             — no emit when isEmitting=false
 *             — no emit when activeCount >= count
 *             — always emits gpu_particle_step
 * 5. onEvent 'gpu_particle_update' — updates activeCount
 * 6. onEvent 'particle_burst' — adds to burstQueue
 * 7. onEvent 'particle_set_emitter' — updates emitterPosition / emitterVelocity
 * 8. onEvent 'particle_start' / 'particle_stop' — sets isEmitting
 * 9. onEvent 'particle_pause' / 'particle_resume' — sets isRunning
 * 10. onEvent 'particle_clear' — emits gpu_particle_clear, resets activeCount=0
 * 11. onEvent 'particle_add_force' — emits gpu_particle_add_force
 * 12. onEvent 'particle_remove_force' — emits gpu_particle_remove_force
 * 13. onEvent 'particle_query' — emits particle_info with state snapshot
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gpuParticleHandler } from '../GPUParticleTrait';

// ─── helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
function makeNode() {
  return { id: `particle_node_${++_id}`, name: `ParticleNode_${_id}` };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function makeConfig(overrides: any = {}) {
  return { ...gpuParticleHandler.defaultConfig!, ...overrides };
}

function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(cfg);
  gpuParticleHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

function getState(node: any) {
  return (node as any).__gpuParticleState;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('gpuParticleHandler.defaultConfig', () => {
  const d = gpuParticleHandler.defaultConfig!;
  it('count = 10000', () => expect(d.count).toBe(10000));
  it('emission_rate = 1000', () => expect(d.emission_rate).toBe(1000));
  it('lifetime = 2.0', () => expect(d.lifetime).toBe(2.0));
  it('lifetime_variance = 0.5', () => expect(d.lifetime_variance).toBe(0.5));
  it('spread_angle = 30', () => expect(d.spread_angle).toBe(30));
  it('forces contains gravity', () => expect(d.forces[0].type).toBe('gravity'));
  it('collision = false', () => expect(d.collision).toBe(false));
  it('spatial_hash = false', () => expect(d.spatial_hash).toBe(false));
  it('blend_mode = additive', () => expect(d.blend_mode).toBe('additive'));
  it('color_over_life has 2 stops', () => expect(d.color_over_life.length).toBe(2));
  it('size_over_life has 3 stops', () => expect(d.size_over_life.length).toBe(3));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('gpuParticleHandler.onAttach', () => {
  it('creates __gpuParticleState', () => {
    const { node } = attach();
    expect(getState(node)).toBeDefined();
  });

  it('isRunning = true after attach', () => {
    const { node } = attach();
    expect(getState(node).isRunning).toBe(true);
  });

  it('isEmitting = true after attach', () => {
    const { node } = attach();
    expect(getState(node).isEmitting).toBe(true);
  });

  it('activeCount = 0, totalEmitted = 0 after attach', () => {
    const { node } = attach();
    const s = getState(node);
    expect(s.activeCount).toBe(0);
    expect(s.totalEmitted).toBe(0);
  });

  it('emits gpu_particle_create with maxParticles=count', () => {
    const { ctx } = attach({ count: 5000 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_create',
      expect.objectContaining({ maxParticles: 5000 })
    );
  });

  it('emits gpu_particle_create with blendMode=alpha when configured', () => {
    const { ctx } = attach({ blend_mode: 'alpha' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_create',
      expect.objectContaining({ blendMode: 'alpha' })
    );
  });

  it('burstQueue is empty', () => {
    const { node } = attach();
    expect(getState(node).burstQueue).toEqual([]);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('gpuParticleHandler.onDetach', () => {
  it('removes __gpuParticleState', () => {
    const { node, ctx, config } = attach();
    gpuParticleHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });

  it('does NOT emit gpu_particle_destroy when computeHandle is null', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gpuParticleHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('gpu_particle_destroy', expect.anything());
  });

  it('emits gpu_particle_destroy when computeHandle is set', () => {
    const { node, ctx, config } = attach();
    getState(node).computeHandle = { handle: 42 }; // non-null
    ctx.emit.mockClear();
    gpuParticleHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_destroy',
      expect.objectContaining({ node })
    );
  });
});

// ─── onUpdate — no-op ─────────────────────────────────────────────────────────

describe('gpuParticleHandler.onUpdate — no-op paths', () => {
  it('does nothing when !isRunning', () => {
    const { node, ctx, config } = attach();
    getState(node).isRunning = false;
    ctx.emit.mockClear();
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — burst queue ───────────────────────────────────────────────────

describe('gpuParticleHandler.onUpdate — burst queue', () => {
  it('emits gpu_particle_burst for each queued burst and clears queue', () => {
    const { node, ctx, config } = attach({ emission_rate: 0 }); // disable continuous emit
    const state = getState(node);
    state.burstQueue.push({ count: 100 });
    state.burstQueue.push({ count: 50, position: [1, 0, 0] });
    ctx.emit.mockClear();
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_burst',
      expect.objectContaining({ count: 100 })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_burst',
      expect.objectContaining({ count: 50 })
    );
    expect(state.burstQueue.length).toBe(0);
  });

  it('increments totalEmitted by burst count', () => {
    const { node, ctx, config } = attach({ emission_rate: 0 });
    const state = getState(node);
    state.burstQueue.push({ count: 75 });
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.totalEmitted).toBe(75);
  });

  it('uses emitterPosition as burst position when burst.position is undefined', () => {
    const { node, ctx, config } = attach({ emission_rate: 0 });
    const state = getState(node);
    state.emitterPosition = [5, 0, 0 ];
    state.burstQueue.push({ count: 10 }); // no position
    ctx.emit.mockClear();
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_burst',
      expect.objectContaining({ position: [5, 0, 0] })
    );
  });
});

// ─── onUpdate — continuous emission ──────────────────────────────────────────

describe('gpuParticleHandler.onUpdate — continuous emission', () => {
  it('emits gpu_particle_emit when isEmitting=true and activeCount < count', () => {
    const { node, ctx, config } = attach({ emission_rate: 1000, count: 10000 });
    const state = getState(node);
    state.activeCount = 0;
    ctx.emit.mockClear();
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.1); // 1000*0.1=100 → emit 100
    const emitCall = ctx.emit.mock.calls.find(([ev]) => ev === 'gpu_particle_emit');
    expect(emitCall).toBeDefined();
    expect(emitCall![1].count).toBe(100);
  });

  it('does NOT emit gpu_particle_emit when isEmitting=false', () => {
    const { node, ctx, config } = attach({ emission_rate: 1000 });
    getState(node).isEmitting = false;
    ctx.emit.mockClear();
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(ctx.emit).not.toHaveBeenCalledWith('gpu_particle_emit', expect.anything());
  });

  it('does NOT emit gpu_particle_emit when activeCount >= count', () => {
    const { node, ctx, config } = attach({ emission_rate: 1000, count: 100 });
    getState(node).activeCount = 100;
    ctx.emit.mockClear();
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(ctx.emit).not.toHaveBeenCalledWith('gpu_particle_emit', expect.anything());
  });

  it('always emits gpu_particle_step when running', () => {
    const { node, ctx, config } = attach({ emission_rate: 0 });
    ctx.emit.mockClear();
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_step',
      expect.objectContaining({ deltaTime: 0.016 })
    );
  });

  it('caps emitted count to remaining capacity', () => {
    const { node, ctx, config } = attach({ emission_rate: 1000, count: 100 });
    getState(node).activeCount = 95; // only 5 slots left
    ctx.emit.mockClear();
    gpuParticleHandler.onUpdate!(node as any, config, ctx as any, 0.1); // toEmit=100 > remaining=5
    const emitCall = ctx.emit.mock.calls.find(([ev]) => ev === 'gpu_particle_emit');
    expect(emitCall).toBeDefined();
    expect(emitCall![1].count).toBe(5);
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('gpuParticleHandler.onEvent', () => {
  it('gpu_particle_update — updates activeCount', () => {
    const { node, ctx, config } = attach();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, {
      type: 'gpu_particle_update',
      activeCount: 500,
    });
    expect(getState(node).activeCount).toBe(500);
  });

  it('particle_burst — queues burst with default count=100', () => {
    const { node, ctx, config } = attach();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, { type: 'particle_burst' });
    expect(getState(node).burstQueue).toEqual([{ count: 100, position: undefined }]);
  });

  it('particle_burst — queues burst with custom count and position', () => {
    const { node, ctx, config } = attach();
    const pos = [3, 0, 0 ];
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, {
      type: 'particle_burst',
      count: 250,
      position: pos,
    });
    expect(getState(node).burstQueue[0]).toEqual({ count: 250, position: pos });
  });

  it('particle_set_emitter — updates emitterPosition', () => {
    const { node, ctx, config } = attach();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, {
      type: 'particle_set_emitter',
      position: [1, 2, 3],
    });
    expect(getState(node).emitterPosition).toEqual([1, 2, 3 ]);
  });

  it('particle_set_emitter — updates emitterVelocity', () => {
    const { node, ctx, config } = attach();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, {
      type: 'particle_set_emitter',
      velocity: [0, 5, 0 ],
    });
    expect(getState(node).emitterVelocity).toEqual([0, 5, 0 ]);
  });

  it('particle_start — sets isEmitting=true', () => {
    const { node, ctx, config } = attach();
    getState(node).isEmitting = false;
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, { type: 'particle_start' });
    expect(getState(node).isEmitting).toBe(true);
  });

  it('particle_stop — sets isEmitting=false', () => {
    const { node, ctx, config } = attach();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, { type: 'particle_stop' });
    expect(getState(node).isEmitting).toBe(false);
  });

  it('particle_pause — sets isRunning=false', () => {
    const { node, ctx, config } = attach();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, { type: 'particle_pause' });
    expect(getState(node).isRunning).toBe(false);
  });

  it('particle_resume — sets isRunning=true', () => {
    const { node, ctx, config } = attach();
    getState(node).isRunning = false;
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, { type: 'particle_resume' });
    expect(getState(node).isRunning).toBe(true);
  });

  it('particle_clear — emits gpu_particle_clear and resets activeCount', () => {
    const { node, ctx, config } = attach();
    getState(node).activeCount = 500;
    ctx.emit.mockClear();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, { type: 'particle_clear' });
    expect(ctx.emit).toHaveBeenCalledWith('gpu_particle_clear', expect.objectContaining({ node }));
    expect(getState(node).activeCount).toBe(0);
  });

  it('particle_add_force — emits gpu_particle_add_force with force data', () => {
    const { node, ctx, config } = attach();
    const force = { type: 'wind', strength: 5, direction: [1, 0, 0] };
    ctx.emit.mockClear();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, {
      type: 'particle_add_force',
      force,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_add_force',
      expect.objectContaining({ force })
    );
  });

  it('particle_remove_force — emits gpu_particle_remove_force with forceIndex', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, {
      type: 'particle_remove_force',
      forceIndex: 2,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'gpu_particle_remove_force',
      expect.objectContaining({ forceIndex: 2 })
    );
  });

  it('particle_query — emits particle_info with state snapshot', () => {
    const { node, ctx, config } = attach({ count: 8000 });
    const state = getState(node);
    state.activeCount = 300;
    state.totalEmitted = 1200;
    ctx.emit.mockClear();
    gpuParticleHandler.onEvent!(node as any, config, ctx as any, {
      type: 'particle_query',
      queryId: 'q1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'particle_info',
      expect.objectContaining({
        queryId: 'q1',
        isRunning: true,
        isEmitting: true,
        activeCount: 300,
        totalEmitted: 1200,
        maxParticles: 8000,
      })
    );
  });
});
