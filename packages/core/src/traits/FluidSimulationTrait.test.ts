/**
 * @fluid_simulation Trait — dead-delegation fix regression test.
 *
 * The 2026-06-24 substrate audit (research/2026-06-24_trait-map-substrate-audit.md §3.1)
 * found this trait OVERCLAIMED: onAttach was constructing a `SpatialHash` (the neighbor-
 * lookup helper) instead of the `FluidSimulationSystem` solver, so no simulation object
 * was ever created. Additionally, onUpdate called `instance.onUpdate(...)` — a method
 * FluidSimulationSystem does not expose (its stepper is `step(dt)`) — so even if the
 * right object had been constructed the solver would never have advanced.
 *
 * These tests pin the fix: driving the trait's onUpdate must integrate the SPH solver,
 * so a particle placed at height falls under gravity. Pre-fix: neither the construction
 * nor the stepping was wired correctly. Post-fix: both are.
 *
 * @module traits/__tests__
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { HSPlusNode, TraitContext } from './TraitTypes';
import { fluidSimulationHandler, FluidSimulationSystem } from './FluidSimulationTrait';

describe('FluidSimulationTrait (dead-delegation fix)', () => {
  let node: HSPlusNode & { __fluid_simulation_instance?: FluidSimulationSystem };
  let ctx: TraitContext;

  beforeEach(() => {
    node = { id: 'fluid-test' } as HSPlusNode & {
      __fluid_simulation_instance?: FluidSimulationSystem;
    };
    ctx = { emit: () => {} } as unknown as TraitContext;
  });

  it('constructs a real FluidSimulationSystem on attach (not SpatialHash)', () => {
    fluidSimulationHandler.onAttach(node, {}, ctx);
    expect(node.__fluid_simulation_instance).toBeInstanceOf(FluidSimulationSystem);
  });

  it('onUpdate steps the SPH solver: a particle falls under gravity', () => {
    fluidSimulationHandler.onAttach(node, {}, ctx);
    const sys = node.__fluid_simulation_instance!;
    const id = sys.addParticle([0, 10, 0]); // start at y=10

    const y0 = sys.getParticle(id)!.position[1];

    // Drive the trait lifecycle the way the runtime does (handler.onUpdate per frame).
    for (let i = 0; i < 30; i++) {
      fluidSimulationHandler.onUpdate(node, {}, ctx, 0.016);
    }

    const p = sys.getParticle(id)!;
    // Falsifiable: gravity is -9.81 m/s²; after ~0.48 s the particle must have
    // dropped and be moving downward. Pre-fix (solver never stepped) y == y0.
    expect(p.position[1]).toBeLessThan(y0);
    expect(p.velocity[1]).toBeLessThan(0);
  });

  it('onUpdate is a safe no-op before attach (no instance)', () => {
    expect(() => fluidSimulationHandler.onUpdate(node, {}, ctx, 0.016)).not.toThrow();
  });

  it('onDetach disposes the instance', () => {
    fluidSimulationHandler.onAttach(node, {}, ctx);
    expect(node.__fluid_simulation_instance).toBeDefined();
    fluidSimulationHandler.onDetach(node, {}, ctx);
    expect(node.__fluid_simulation_instance).toBeUndefined();
  });

  it('accepts partial FluidSimulationConfig on attach', () => {
    fluidSimulationHandler.onAttach(node, { restDensity: 800, viscosity: 0.01 }, ctx);
    const sys = node.__fluid_simulation_instance!;
    expect(sys.getConfig().restDensity).toBe(800);
    expect(sys.getConfig().viscosity).toBe(0.01);
  });
});
