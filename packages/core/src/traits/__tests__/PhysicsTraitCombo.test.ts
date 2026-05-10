import { describe, it, expect, vi } from 'vitest';

vi.mock('@holoscript/engine/physics/SoftBodySolver', () => ({
  SoftBodySolver: class MockSoftBodySolver {
    private particles: any[];

    constructor(particles: any[] = []) {
      this.particles = particles;
    }

    step = vi.fn();
    getParticles = vi.fn(() => this.particles);
    reset = vi.fn();
  },
}));

import { clothHandler } from '../ClothTrait';
import { fluidHandler } from '../FluidTrait';
import { softBodyHandler } from '../SoftBodyTrait';
import {
  attachTrait,
  createMockContext,
  createMockNode,
  getEventCount,
  sendEvent,
  updateTrait,
} from './traitTestHelpers';

describe('A-009 physics trait combo regression', () => {
  it('attaches cloth, fluid, and soft_body on one scene node without state collisions', () => {
    const node = createMockNode('flowing-fabric');
    const ctx = createMockContext();

    const clothConfig = {
      resolution: 4,
      stiffness: 0.8,
      damping: 0.01,
      mass: 1.0,
      gravity_scale: 1.0,
      wind_response: 0.5,
      collision_margin: 0.01,
      self_collision: false,
      tearable: true,
      tear_threshold: 100,
      pin_vertices: [
        [0, 0],
        [0, 3],
      ] as Array<[number, number]>,
    };
    const fluidConfig = {
      method: 'sph' as const,
      particle_count: 256,
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
    const softBodyConfig = {
      stiffness: 0.5,
      damping: 0.05,
      mass: 1.0,
      pressure: 1.0,
      volume_conservation: 0.9,
      collision_margin: 0.01,
      solver_iterations: 10,
      tetrahedral: false,
      surface_stiffness: 0.5,
      bending_stiffness: 0.3,
    };

    expect(() => {
      attachTrait(clothHandler, node, clothConfig, ctx);
      attachTrait(fluidHandler, node, fluidConfig, ctx);
      attachTrait(softBodyHandler, node, softBodyConfig, ctx);
    }).not.toThrow();

    expect((node as any).__clothState).toBeDefined();
    expect((node as any).__fluidState).toBeDefined();
    expect((node as any).__softBodyState).toBeDefined();
    expect(getEventCount(ctx, 'cloth_create')).toBe(1);
    expect(getEventCount(ctx, 'fluid_create')).toBe(1);

    expect(() => {
      updateTrait(clothHandler, node, clothConfig, ctx, 0.016);
      updateTrait(fluidHandler, node, fluidConfig, ctx, 0.016);
      updateTrait(softBodyHandler, node, softBodyConfig, ctx, 0.016);
      sendEvent(fluidHandler, node, fluidConfig, ctx, {
        type: 'fluid_splash',
        position: [0, 0, 0],
        force: 10,
        radius: 0.5,
      });
      sendEvent(clothHandler, node, clothConfig, ctx, {
        type: 'cloth_constraint_break',
        constraintIndex: 0,
      });
      sendEvent(softBodyHandler, node, softBodyConfig, ctx, { type: 'soft_body_reset' });
    }).not.toThrow();

    expect((node as any).__clothState.isTorn).toBe(true);
    expect(getEventCount(ctx, 'on_fluid_splash')).toBe(1);
    expect(getEventCount(ctx, 'soft_body_reset_shape')).toBe(1);
  });
});
