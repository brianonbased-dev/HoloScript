import { describe, it, expect } from 'vitest';
import { RopeSystem } from '@holoscript/engine/physics/RopeSystem';
import { DeformableMesh } from '@holoscript/engine/physics/DeformableMesh';
import { FluidSim } from '@holoscript/engine/physics/FluidSim';

describe('Cycle 146: Rope, Deformable & Fluid', () => {
  // -------------------------------------------------------------------------
  // RopeSystem
  // -------------------------------------------------------------------------

  it('should create a rope and simulate gravity', () => {
    const rs = new RopeSystem();
    rs.createRope('r1', [0, 10, 0], [10, 10, 0], { segmentCount: 5 });
    rs.pinNode('r1', 0); // Pin first node

    for (let i = 0; i < 20; i++) rs.update(0.016);

    const nodesAfter = rs.getRopeNodes('r1');
    // Pinned node stays put
    expect(nodesAfter[0].position[1]).toBe(10);
    // Middle unpinned nodes should have fallen below starting Y=10
    expect(nodesAfter[3].position[1]).toBeLessThan(10);
  });

  it('should measure rope length and tension', () => {
    const rs = new RopeSystem();
    rs.createRope(
      'r2',
      [0, 0, 0],
      [5, 0, 0],
      { segmentCount: 5, segmentLength: 1 }
    );
    rs.pinNode('r2', 0);

    // Before simulation
    const len = rs.getRopeLength('r2');
    expect(len).toBeGreaterThan(0);

    // After simulation — tension should appear as gravity pulls
    for (let i = 0; i < 10; i++) rs.update(0.016);
    const tension = rs.getTension('r2', 2);
    expect(tension).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // DeformableMesh
  // -------------------------------------------------------------------------

  it('should deform on impact and recover with shape matching', () => {
    const mesh = new DeformableMesh({ stiffness: 100, damping: 0.9, shapeMatchingStrength: 0.8 });
    mesh.setVertices([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ]);
    mesh.autoConnectRadius(2);

    expect(mesh.getSpringCount()).toBeGreaterThan(0);

    // Apply impact
    mesh.applyImpact([0.5, 0.5, 0], 2, 10);

    mesh.update(0.016);
    const disp = mesh.getMaxDisplacement();
    expect(disp).toBeGreaterThan(0); // Something moved

    // After many frames, shape matching should bring it back
    for (let i = 0; i < 200; i++) mesh.update(0.016);
    const dispAfter = mesh.getMaxDisplacement();
    expect(dispAfter).toBeLessThan(disp); // Should have recovered
  });

  it('should clamp displacement to max', () => {
    const mesh = new DeformableMesh({ maxDisplacement: 1, stiffness: 0, shapeMatchingStrength: 0 });
    mesh.setVertices([[0, 0, 0]]);

    mesh.applyImpact([-5, 0, 0], 10, 1000);
    mesh.update(0.1);

    expect(mesh.getMaxDisplacement()).toBeLessThanOrEqual(1.01); // ≤ max + float tolerance
  });

  // -------------------------------------------------------------------------
  // FluidSim
  // -------------------------------------------------------------------------

  it('should simulate fluid particles under gravity', () => {
    const fluid = new FluidSim({
      smoothingRadius: 1.5,
      boundaryMin: [-5, -5, -5],
      boundaryMax: [5, 5, 5],
    });

    fluid.addBlock([-1, 2, -1], [1, 3, 1], 0.8);
    const count = fluid.getParticleCount();
    expect(count).toBeGreaterThan(0);

    const initialY = fluid.getParticles()[0].position[1];
    for (let i = 0; i < 10; i++) fluid.update();

    // Particles should have fallen
    expect(fluid.getParticles()[0].position[1]).toBeLessThan(initialY);
  });

  it('should enforce boundaries', () => {
    const fluid = new FluidSim({
      boundaryMin: [0, 0, 0],
      boundaryMax: [10, 10, 10],
    });

    fluid.addParticle([5, 1, 5]);
    for (let i = 0; i < 50; i++) fluid.update();

    const p = fluid.getParticles()[0];
    expect(p.position[1]).toBeGreaterThanOrEqual(0); // Didn't fall through floor
  });

  it('should report density and kinetic energy', () => {
    const fluid = new FluidSim();
    fluid.addParticle([0, 0, 0], [1, 0, 0]);
    fluid.update();

    expect(fluid.getAverageDensity()).toBeGreaterThan(0);
    expect(fluid.getKineticEnergy()).toBeGreaterThan(0);
  });
});
