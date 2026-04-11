import { describe, it, expect } from 'vitest';
import { RegularGrid3D } from '../RegularGrid3D';

describe('RegularGrid3D', () => {
  it('creates grid with correct dimensions', () => {
    const g = new RegularGrid3D([10, 5, 8], [10, 5, 8]);
    expect(g.nx).toBe(10);
    expect(g.ny).toBe(5);
    expect(g.nz).toBe(8);
    expect(g.cellCount).toBe(400);
    expect(g.data.length).toBe(400);
  });

  it('get/set round-trips correctly', () => {
    const g = new RegularGrid3D([4, 4, 4], [3, 3, 3]);
    g.set(1, 2, 3, 42);
    expect(g.get(1, 2, 3)).toBe(42);
    expect(g.get(0, 0, 0)).toBe(0);
  });

  it('fill sets all cells', () => {
    const g = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    g.fill(7);
    for (let i = 0; i < g.data.length; i++) {
      expect(g.data[i]).toBe(7);
    }
  });

  it('clone produces independent copy', () => {
    const g = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    g.fill(5);
    const c = g.clone();
    c.set(0, 0, 0, 99);
    expect(g.get(0, 0, 0)).toBe(5);
    expect(c.get(0, 0, 0)).toBe(99);
  });

  it('copy overwrites data', () => {
    const a = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    const b = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    a.fill(10);
    b.fill(20);
    a.copy(b);
    expect(a.get(1, 1, 1)).toBe(20);
  });

  it('addScaled computes this += scale * other', () => {
    const a = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    const b = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    a.fill(1);
    b.fill(2);
    a.addScaled(b, 3);
    expect(a.get(1, 1, 1)).toBe(7); // 1 + 3*2
  });

  it('laplacian of uniform field is zero', () => {
    const g = new RegularGrid3D([5, 5, 5], [4, 4, 4]);
    g.fill(100);
    expect(g.laplacian(2, 2, 2)).toBeCloseTo(0, 10);
  });

  it('laplacian of linear field is zero', () => {
    // Linear function f(x) = x has ∇²f = 0
    const g = new RegularGrid3D([10, 3, 3], [9, 2, 2]);
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) g.set(i, j, k, i * g.dx);

    // Interior point should have zero laplacian
    expect(g.laplacian(5, 1, 1)).toBeCloseTo(0, 8);
  });

  it('gradient of linear field is constant', () => {
    // f(x,y,z) = 3x → ∇f = [3, 0, 0]
    const g = new RegularGrid3D([10, 3, 3], [9, 2, 2]);
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) g.set(i, j, k, 3 * i * g.dx);

    const [gx, gy, gz] = g.gradient(5, 1, 1);
    expect(gx).toBeCloseTo(3, 5);
    expect(gy).toBeCloseTo(0, 5);
    expect(gz).toBeCloseTo(0, 5);
  });

  it('sampleAtPositions does trilinear interpolation', () => {
    // Linear field: f(x,y,z) = 50*x on a [0,2] domain with 3 cells
    const g = new RegularGrid3D([3, 3, 3], [2, 2, 2]);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++) g.set(i, j, k, 50 * i); // 0, 50, 100

    // Sample at x=1 (midpoint) should be ~50
    const result = g.sampleAtPositions(new Float32Array([1, 1, 1]));
    expect(result[0]).toBeCloseTo(50, 0);
  });

  it('maxAbs returns max absolute value', () => {
    const g = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    g.fill(0);
    g.set(1, 1, 1, -42);
    expect(g.maxAbs()).toBe(42);
  });
});
