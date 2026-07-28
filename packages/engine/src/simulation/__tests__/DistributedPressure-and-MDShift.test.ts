/**
 * DistributedPressure-and-MDShift.test.ts
 *
 * Tests for two bugs identified in the physics audit:
 *
 * 1. StructuralSolver TET4 distributed pressure load:
 *    The current code reads tets[elemIdx*4+0..2] — the first 3 nodes of the
 *    element — when the caller passes element indices via surfaceElements.
 *    This is only correct when the surface face happens to be local face 0
 *    (opposite node 3). When the boundary face is face 3 (nodes n1,n2,n3),
 *    wrong nodes are used and force is applied to the wrong triangle.
 *
 *    Fix: add an explicit surfaceFaces interface (mirroring TET10), plus fix
 *    surfaceElements to enumerate boundary faces (shared by only one tet).
 *
 * 2. MolecularDynamicsSolver LJ cutoff energy shift:
 *    The raw LJ potential V(r_c) ≈ -0.00163ε is non-zero, so every pair
 *    crossing the cutoff boundary introduces a discontinuous energy jump.
 *    Over N steps the accumulated error corrupts NVE energy conservation.
 *    Fix: apply standard shifted potential V(r) - V(r_c) for r < r_c.
 *    Test: NVE energy drift < 0.5% over 1000 steps.
 */

import { describe, it, expect } from 'vitest';
import { StructuralSolver, type StructuralConfig, type StructuralLoad } from '../StructuralSolver';
import { MolecularDynamicsSolver, type MDConfig } from '../MolecularDynamicsSolver';
import type { Pressure } from '../units/PhysicalQuantity';

// ── Bug 1: StructuralSolver distributed pressure load ─────────────────────────

/**
 * Build a single-tet mesh designed so that the surface face of interest is
 * local face 3 (nodes n1, n2, n3), NOT face 0 (nodes n0, n1, n2).
 *
 * Node layout:
 *   n0 = (0.5, 0.5, 0.0)  ← base node (NOT on z=1 surface)
 *   n1 = (0.0, 0.0, 1.0)  ← top surface
 *   n2 = (1.0, 0.0, 1.0)  ← top surface
 *   n3 = (0.0, 1.0, 1.0)  ← top surface
 *
 * Tet connectivity: [0, 1, 2, 3]
 *
 * Face 3 (opposite n0) = {n1, n2, n3}:
 *   edge a = n2 - n1 = (1, 0, 0)
 *   edge b = n3 - n1 = (0, 1, 0)
 *   cross = (0, 0, 1), |cross| = 1, area = 0.5
 *   outward normal = +Z (pointing away from n0 which is below)
 *
 * With pressure P, expected total force = P * 0.5 in +Z direction only.
 *
 * Face 0 (opposite n3) = {n0, n1, n2} — this is what the BUGGY code uses:
 *   edge a = n1 - n0 = (-0.5, -0.5, 1)
 *   edge b = n2 - n0 = (0.5, -0.5, 1)
 *   cross = (-0.5*1 - 1*(-0.5), 1*0.5 - (-0.5)*1, (-0.5)(-0.5) - (-0.5)(0.5))
 *         = (0, 1, 0.5)
 *   |cross| = sqrt(1.25), area = 0.5*sqrt(1.25) ≈ 0.559
 *   Normal has Y and Z components → non-zero Fy, wrong Fz
 */
function buildSingleTetWithSurfaceFace3() {
  // prettier-ignore
  const vertices = new Float32Array([
    0.5, 0.5, 0.0,   // n0 — base node, NOT on z=1 surface
    0.0, 0.0, 1.0,   // n1 — top surface z=1
    1.0, 0.0, 1.0,   // n2 — top surface z=1
    0.0, 1.0, 1.0,   // n3 — top surface z=1
  ]);
  const tetrahedra = new Uint32Array([0, 1, 2, 3]);
  return { vertices, tetrahedra };
}

describe('Bug 1 — StructuralSolver distributed pressure: explicit surfaceFaces interface', () => {
  it('surfaceFaces with localFace=3 gives Fz = P * 0.5 and Fx = Fy = 0', () => {
    const { vertices, tetrahedra } = buildSingleTetWithSurfaceFace3();

    const PRESSURE = 200.0; // Pa

    const config: StructuralConfig = {
      vertices,
      tetrahedra,
      material: {
        density: 1000,
        youngs_modulus: 1e6,
        poisson_ratio: 0.3,
        yield_strength: 1e9,
      },
      constraints: [{ id: 'fix_base', type: 'fixed', nodes: [0] }],
      loads: [
        {
          id: 'top_pressure',
          type: 'distributed',
          // Use the new explicit interface: face 3 = {n1,n2,n3}, opposite n0
          surfaceFaces: [{ elementIndex: 0, localFace: 3 }],
          pressure: PRESSURE as unknown as Pressure,
        } as StructuralLoad,
      ],
    };

    const solver = new StructuralSolver(config);
    const forces = (solver as unknown as { forces: Float64Array }).forces;

    let totalFx = 0,
      totalFy = 0,
      totalFz = 0;
    for (let n = 0; n < 4; n++) {
      totalFx += forces[n * 3];
      totalFy += forces[n * 3 + 1];
      totalFz += forces[n * 3 + 2];
    }

    // Face 3 area = 0.5, outward unit normal = +Z.
    // Total force = P * area = 200 * 0.5 = 100 N in +Z only.
    // Tolerance 1e-4: vertices are Float32Array, so ~7 decimal digits precision;
    // ULP of 100 in float32 ≈ 1.2e-5, we allow 10× margin.
    const expectedFz = PRESSURE * 0.5;
    expect(Math.abs(totalFz - expectedFz)).toBeLessThan(1e-4);
    expect(Math.abs(totalFx)).toBeLessThan(1e-4);
    expect(Math.abs(totalFy)).toBeLessThan(1e-4);

    // Force must be on surface nodes n1,n2,n3 only — n0 gets zero force.
    expect(Math.abs(forces[0])).toBeLessThan(1e-10); // n0.Fx
    expect(Math.abs(forces[1])).toBeLessThan(1e-10); // n0.Fy
    expect(Math.abs(forces[2])).toBeLessThan(1e-10); // n0.Fz
  });

  it('surfaceFaces with localFace=0 gives correct force on face 0 of the same tet', () => {
    // Verify the localFace=0 path works too (face 0 = {n0,n1,n2}, opposite n3).
    // Face 0 normal: cross(n1-n0, n2-n0)
    //   n1-n0 = (-0.5, -0.5, 1), n2-n0 = (0.5, -0.5, 1)
    //   cross = ((-0.5)(1) - 1*(-0.5), 1*(0.5) - (-0.5)(1), (-0.5)(-0.5)-(-0.5)(0.5))
    //         = (-0.5+0.5, 0.5+0.5, 0.25+0.25) = (0, 1, 0.5)
    //   |cross| = sqrt(0+1+0.25) = sqrt(1.25)
    //   area = 0.5*sqrt(1.25)
    // The outward normal for face 0 (opposite n3) should point away from n3=(0,1,1).
    // dot(cross, n3 - n0) = (0,1,0.5)·(-0.5,0.5,1) = 0+0.5+0.5 = 1 > 0
    //   → cross points TOWARD n3 → outward is -cross = (0,-1,-0.5)
    //   unit_outward = (0, -1, -0.5) / sqrt(1.25)
    // Force per node = P * area / 3 * unit_outward
    // Total force = P * area * unit_outward = P * 0.5*sqrt(1.25) * (0,-1,-0.5)/sqrt(1.25)
    //             = P * 0.5 * (0, -1, -0.5)
    // So Fy = -P*0.5 = -100, Fz = -P*0.25 = -50, Fx = 0.
    const { vertices, tetrahedra } = buildSingleTetWithSurfaceFace3();
    const PRESSURE = 200.0;

    const config: StructuralConfig = {
      vertices,
      tetrahedra,
      material: { density: 1000, youngs_modulus: 1e6, poisson_ratio: 0.3, yield_strength: 1e9 },
      constraints: [{ id: 'fix_n3', type: 'fixed', nodes: [3] }],
      loads: [
        {
          id: 'face0_pressure',
          type: 'distributed',
          surfaceFaces: [{ elementIndex: 0, localFace: 0 }],
          pressure: PRESSURE as unknown as Pressure,
        } as StructuralLoad,
      ],
    };

    const solver = new StructuralSolver(config);
    const forces = (solver as unknown as { forces: Float64Array }).forces;

    let totalFx = 0,
      totalFy = 0,
      totalFz = 0;
    for (let n = 0; n < 4; n++) {
      totalFx += forces[n * 3];
      totalFy += forces[n * 3 + 1];
      totalFz += forces[n * 3 + 2];
    }

    // Outward normal of face 0: (0, -1, -0.5)/sqrt(1.25)
    // Total force = P * area * outward_unit = 200 * 0.5*sqrt(1.25) * (0,-1,-0.5)/sqrt(1.25)
    //             = 200 * 0.5 * (0, -1, -0.5) = (0, -100, -50)
    // Tolerance 1e-4: Float32 vertices, ULP of 100 ≈ 1.2e-5.
    expect(Math.abs(totalFx)).toBeLessThan(1e-4);
    expect(Math.abs(totalFy - -PRESSURE * 0.5)).toBeLessThan(1e-4);
    expect(Math.abs(totalFz - -PRESSURE * 0.25)).toBeLessThan(1e-4);

    // Force must be applied only to face-0 nodes {n0,n1,n2}, NOT n3.
    expect(Math.abs(forces[3 * 3])).toBeLessThan(1e-10); // n3.Fx
    expect(Math.abs(forces[3 * 3 + 1])).toBeLessThan(1e-10); // n3.Fy
    expect(Math.abs(forces[3 * 3 + 2])).toBeLessThan(1e-10); // n3.Fz
  });
});

// ── Bug 3: MolecularDynamicsSolver LJ energy shift ───────────────────────────

describe('Bug 3 — MolecularDynamicsSolver: LJ cutoff energy shift', () => {
  it('NVE energy drift < 0.5% over 1000 steps with LJ shift applied', () => {
    const config: MDConfig = {
      particleCount: 32,
      boxSize: [5, 5, 5],
      epsilon: 1.0,
      sigma: 1.0,
      temperature: 1.0,
      thermostatTau: 0, // NVE — no thermostat
      initialConfig: 'fcc',
    };

    const solver = new MolecularDynamicsSolver(config);
    const dt = 0.005;

    // Equilibrate briefly
    for (let i = 0; i < 20; i++) solver.step(dt);

    const E0 = solver.getStats().totalEnergy;

    // Run 1000 more steps
    for (let i = 0; i < 1000; i++) solver.step(dt);

    const E1 = solver.getStats().totalEnergy;

    // With LJ energy shift, energy drift should be < 0.5% over 1000 steps.
    // Without the shift, energy jumps each time a pair crosses the cutoff,
    // typically causing > 1% drift over 1000 steps.
    const drift = Math.abs(E1 - E0) / Math.abs(E0);
    expect(drift).toBeLessThan(0.005);
  });
});
