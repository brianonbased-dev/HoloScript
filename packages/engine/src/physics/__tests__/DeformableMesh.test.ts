import { describe, it, expect, beforeEach } from 'vitest';
import { DeformableMesh } from '@holoscript/core';

describe('DeformableMesh', () => {
  let mesh: DeformableMesh;

  beforeEach(() => {
    mesh = new DeformableMesh();
  });

  it('starts with zero vertices', () => {
    expect(mesh.getVertexCount()).toBe(0);
    expect(mesh.getSpringCount()).toBe(0);
  });

  it('setVertices initializes vertex data', () => {
    mesh.setVertices([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ]);
    expect(mesh.getVertexCount()).toBe(3);
  });

  it('getVertex returns vertex by index', () => {
    mesh.setVertices([{ x: 5, y: 3, z: 1 }]);
    const v = mesh.getVertex(0);
    expect(v).toBeDefined();
    expect(v!.rest).toEqual({ x: 5, y: 3, z: 1 });
  });

  it('addSpring creates a spring between vertices', () => {
    mesh.setVertices([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
    mesh.addSpring(0, 1);
    expect(mesh.getSpringCount()).toBe(1);
  });

  it('autoConnectRadius connects nearby vertices', () => {
    mesh.setVertices([
      { x: 0, y: 0, z: 0 },
      { x: 0.5, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }, // far away
    ]);
    mesh.autoConnectRadius(1.0);
    expect(mesh.getSpringCount()).toBe(1); // only 0↔1
  });

  it('update does not throw on empty mesh', () => {
    expect(() => mesh.update(1 / 60)).not.toThrow();
  });

  it('update advances simulation', () => {
    mesh.setVertices([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
    mesh.addSpring(0, 1);
    mesh.update(1 / 60);
    // No crash = success
    expect(mesh.getVertexCount()).toBe(2);
  });

  it('applyImpact displaces vertices within radius', () => {
    mesh.setVertices([
      { x: 0.3, y: 0, z: 0 },
      { x: 0.5, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 }, // far away
    ]);
    // Impact center offset from vertices so dist > 0
    mesh.applyImpact({ x: 0, y: 0, z: 0 }, 2.0, 10.0);
    const v0 = mesh.getVertex(0)!;
    const v2 = mesh.getVertex(2)!;
    const velLen0 = Math.sqrt(v0.velocity.x ** 2 + v0.velocity.y ** 2 + v0.velocity.z ** 2);
    const velLen2 = Math.sqrt(v2.velocity.x ** 2 + v2.velocity.y ** 2 + v2.velocity.z ** 2);
    expect(velLen0).toBeGreaterThan(0);
    expect(velLen2).toBe(0);
  });

  it('getDisplacement measures offset from rest', () => {
    mesh.setVertices([{ x: 0.1, y: 0, z: 0 }]);
    expect(mesh.getDisplacement(0)).toBe(0); // at rest
    // Impact from origin — vertex at 0.1 will get velocity
    mesh.applyImpact({ x: 0, y: 0, z: 0 }, 5.0, 10.0);
    mesh.update(1 / 60);
    expect(mesh.getDisplacement(0)).toBeGreaterThan(0);
  });

  it('getMaxDisplacement returns largest offset', () => {
    mesh.setVertices([
      { x: 0.2, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ]);
    // Impact at origin; vertex at 0.2 is within radius 0.5
    mesh.applyImpact({ x: 0, y: 0, z: 0 }, 0.5, 100);
    mesh.update(1 / 60);
    expect(mesh.getMaxDisplacement()).toBeGreaterThan(0);
  });
});
