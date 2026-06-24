/**
 * @granular_material Trait — dead-delegation fix regression test.
 *
 * The 2026-06-24 substrate audit (research/2026-06-24_trait-map-substrate-audit.md §3.1)
 * found this trait OVERCLAIMED: onAttach constructs a real DEM `GranularMaterialSystem`
 * but onUpdate called `instance.onUpdate(...)` — a method the System does not have (its
 * stepper is `step(dt)`) — so the solver was constructed and never advanced. These tests
 * pin the fix: driving the trait's onUpdate must integrate the solver, so a particle
 * added at height falls under gravity. If the wiring regresses, the particle stays put
 * and these fail.
 *
 * @module traits/__tests__
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { HSPlusNode, TraitContext } from './TraitTypes';
import { granularMaterialHandler, GranularMaterialSystem } from './GranularMaterialTrait';

describe('GranularMaterialTrait (dead-delegation fix)', () => {
  let node: HSPlusNode & { __granular_material_instance?: GranularMaterialSystem };
  let ctx: TraitContext;

  beforeEach(() => {
    node = { id: 'granular-test' } as HSPlusNode & {
      __granular_material_instance?: GranularMaterialSystem;
    };
    ctx = { emit: () => {} } as unknown as TraitContext;
  });

  it('constructs a real GranularMaterialSystem on attach', () => {
    granularMaterialHandler.onAttach(node, {}, ctx);
    expect(node.__granular_material_instance).toBeInstanceOf(GranularMaterialSystem);
  });

  it('onUpdate steps the solver: a particle falls under gravity', () => {
    granularMaterialHandler.onAttach(node, {}, ctx);
    const sys = node.__granular_material_instance!;
    const id = sys.addParticle([0, 10, 0], 0.1);
    expect(id).toBeGreaterThanOrEqual(0);

    const y0 = sys.getParticle(id)!.position.y;

    // Drive the trait lifecycle the way the runtime does (handler.onUpdate per frame).
    for (let i = 0; i < 30; i++) {
      granularMaterialHandler.onUpdate(node, {}, ctx, 0.016);
    }

    const p = sys.getParticle(id)!;
    // Falsifiable: gravity is -9.81 m/s²; after ~0.48 s the particle must have
    // dropped and be moving downward. Pre-fix (onUpdate never reached step) y == y0.
    expect(p.position.y).toBeLessThan(y0);
    expect(p.velocity.y).toBeLessThan(0);
  });

  it('onUpdate is a safe no-op before attach (no instance)', () => {
    expect(() => granularMaterialHandler.onUpdate(node, {}, ctx, 0.016)).not.toThrow();
  });
});
