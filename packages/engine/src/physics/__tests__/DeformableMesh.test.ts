import { describe, it, expect, beforeEach } from 'vitest';
import { DeformableMesh } from '..';

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
      [0, 0, 0 ],
      [1, 0, 0 ],
      [0, 1, 0 ],
    ]);
    expect(mesh.getVertexCount()).toBe(3);
  });

  it('getVertex returns vertex by index', () => {
    mesh.setVertices([[5, 3, 1 ]]);
    const v = mesh.getVertex(0);
    expect(v).toBeDefined();
    expect(v!.rest).toEqual([5, 3, 1 ]);
  });

  it('addSpring creates a spring between vertices', () => {
    mesh.setVertices([
      [0, 0, 0 ],
      [1, 0, 0 ],
    ]);
    mesh.addSpring(0, 1);
    expect(mesh.getSpringCount()).toBe(1);
  });

  it('autoConnectRadius connects nearby vertices', () => {
    mesh.setVertices([
      [0, 0, 0 ],
      [0.5, 0, 0 ],
      [10, 0, 0 ], // far away
    ]);
    mesh.autoConnectRadius(1.0);
    expect(mesh.getSpringCount()).toBe(1); // only 0↔1
  });

  it('update does not throw on empty mesh', () => {
    expect(() => mesh.update(1 / 60)).not.toThrow();
  });

  it('update advances simulation', () => {
    mesh.setVertices([
      [0, 0, 0 ],
      [1, 0, 0 ],
    ]);
    mesh.addSpring(0, 1);
    mesh.update(1 / 60);
    // No crash = success
    expect(mesh.getVertexCount()).toBe(2);
  });

  it('applyImpact displaces vertices within radius', () => {
    mesh.setVertices([
      [0.3, 0, 0 ],
      [0.5, 0, 0 ],
      [5, 0, 0 ], // far away
    ]);
    // Impact center offset from vertices so dist > 0
    mesh.applyImpact([0, 0, 0 ], 2.0, 10.0);
    const v0 = mesh.getVertex(0)!;
    const v2 = mesh.getVertex(2)!;
    const velLen0 = Math.sqrt(v0.velocity[0] ** 2 + v0.velocity[1] ** 2 + v0.velocity[2] ** 2);
    const velLen2 = Math.sqrt(v2.velocity[0] ** 2 + v2.velocity[1] ** 2 + v2.velocity[2] ** 2);
    expect(velLen0).toBeGreaterThan(0);
    expect(velLen2).toBe(0);
  });

  it('getDisplacement measures offset from rest', () => {
    mesh.setVertices([[0.1, 0, 0 ]]);
    expect(mesh.getDisplacement(0)).toBe(0); // at rest
    // Impact from origin — vertex at 0.1 will get velocity
    mesh.applyImpact([0, 0, 0 ], 5.0, 10.0);
    mesh.update(1 / 60);
    expect(mesh.getDisplacement(0)).toBeGreaterThan(0);
  });

  it('getMaxDisplacement returns largest offset', () => {
    mesh.setVertices([
      [0.2, 0, 0 ],
      [1, 0, 0 ],
    ]);
    // Impact at origin; vertex at 0.2 is within radius 0.5
    mesh.applyImpact([0, 0, 0 ], 0.5, 100);
    mesh.update(1 / 60);
    expect(mesh.getMaxDisplacement()).toBeGreaterThan(0);
  });
});
