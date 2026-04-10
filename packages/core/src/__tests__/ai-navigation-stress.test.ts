import { describe, it, expect } from 'vitest';
import { NavMesh } from '../ai/NavMesh.js';

describe('NavMesh Stress Testing & Fallbacks', () => {
  it('should return null when navigating across disjointed navmesh islands', () => {
    const nav = new NavMesh();

    // Island A
    const a1 = nav.addPolygon([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ]);
    const a2 = nav.addPolygon([
      { x: 10, z: 0 },
      { x: 20, z: 0 },
      { x: 20, z: 10 },
      { x: 10, z: 10 },
    ]);
    nav.connect(a1, a2);

    // Island B (disjointed)
    const b1 = nav.addPolygon([
      { x: 100, z: 0 },
      { x: 110, z: 0 },
      { x: 110, z: 10 },
      { x: 100, z: 10 },
    ]);
    const b2 = nav.addPolygon([
      { x: 110, z: 0 },
      { x: 120, z: 0 },
      { x: 120, z: 10 },
      { x: 110, z: 10 },
    ]);
    nav.connect(b1, b2);

    const path = nav.findPath(a1, b2);
    expect(path).toBeNull();
  });

  it('should successfully pathfind through a complex 10,000 polygon labyrinth', () => {
    const nav = new NavMesh();
    const GRID_SIZE = 100;

    // Create 100x100 grid of polygons
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        nav.addPolygon([
          { x: x * 10, z: z * 10 },
          { x: (x + 1) * 10, z: z * 10 },
          { x: (x + 1) * 10, z: (z + 1) * 10 },
          { x: x * 10, z: (z + 1) * 10 },
        ]);
      }
    }

    // Connect adjacent polygons
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const current = x * GRID_SIZE + z;
        if (x < GRID_SIZE - 1) nav.connect(current, (x + 1) * GRID_SIZE + z); // Right
        if (z < GRID_SIZE - 1) nav.connect(current, x * GRID_SIZE + (z + 1)); // Down
      }
    }

    // Make some polygons unwalkable to create a minimalist maze pattern
    for (let i = 0; i < 2000; i++) {
      // Leave boundaries open so path exists
      const wx = Math.floor(Math.random() * (GRID_SIZE - 4)) + 2;
      const wz = Math.floor(Math.random() * (GRID_SIZE - 4)) + 2;
      nav.setWalkable(wx * GRID_SIZE + wz, false);
    }

    const t0 = performance.now();
    const path = nav.findPath(0, GRID_SIZE * GRID_SIZE - 1);
    const t1 = performance.now();

    expect(path).not.toBeNull();
    // V8 typically crushes this in under ~40ms on modern CPUs, but padding for CI.
    expect(t1 - t0).toBeLessThan(150);
  });

  it('should fall back gracefully when internal polygon is deleted or walled off', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 10 },
      { x: 0, z: 10 },
    ]);
    const b = nav.addPolygon([
      { x: 10, z: 0 },
      { x: 20, z: 0 },
      { x: 20, z: 10 },
      { x: 10, z: 10 },
    ]);
    const c = nav.addPolygon([
      { x: 20, z: 0 },
      { x: 30, z: 0 },
      { x: 30, z: 10 },
      { x: 20, z: 10 },
    ]);

    nav.connect(a, b);
    nav.connect(b, c);

    let path = nav.findPath(a, c);
    expect(path).not.toBeNull();

    // Wall off B
    nav.setWalkable(b, false);

    path = nav.findPath(a, c);
    expect(path).toBeNull();
  });
});
