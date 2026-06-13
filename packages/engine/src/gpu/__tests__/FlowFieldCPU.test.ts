/**
 * FlowFieldCPU honesty + correctness regression (lh8l).
 *
 * The class was previously named FlowFieldCompute and documented as
 * "WebGPU-accelerated", but compute() always ran on the CPU and never issued a
 * WGSL dispatch (it acquired a WebGPUContext it ignored). The class is now
 * honestly named FlowFieldCPU with the dead GPU scaffolding removed. This test
 * pins the deterministic CPU behavior the builtin actually provides.
 */

import { describe, it, expect } from 'vitest';
import { FlowFieldCPU } from '../FlowFieldCompute';

describe('FlowFieldCPU (lh8l)', () => {
  it('initialize() is a no-op that resolves (no GPU resources)', async () => {
    const ff = new FlowFieldCPU({ width: 4, height: 4 });
    await expect(ff.initialize()).resolves.toBeUndefined();
  });

  it('compute() returns one unit direction vector per cell, pointing toward the target', () => {
    const w = 4;
    const h = 4;
    const ff = new FlowFieldCPU({ width: w, height: h, cellSize: 1 });
    const field = ff.compute(0, 0); // target at the origin cell

    expect(field).toHaveLength(w * h);

    // Cell (col=3,row=0): direction toward (0,0) is (-1, 0).
    const right = field[0 * w + 3];
    expect(right.x).toBeCloseTo(-1, 6);
    expect(right.y).toBeCloseTo(0, 6);

    // Cell (col=0,row=3): direction toward (0,0) is (0, -1).
    const down = field[3 * w + 0];
    expect(down.x).toBeCloseTo(0, 6);
    expect(down.y).toBeCloseTo(-1, 6);

    // Every non-target cell yields a unit-length vector; the target cell is zero.
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const v = field[row * w + col];
        const len = Math.sqrt(v.x * v.x + v.y * v.y);
        if (col === 0 && row === 0) {
          expect(len).toBeCloseTo(0, 6); // target cell: no direction
        } else {
          expect(len).toBeCloseTo(1, 6);
        }
      }
    }
  });

  it('exposes its grid configuration', () => {
    const ff = new FlowFieldCPU({ width: 32, height: 16, cellSize: 2.5 });
    expect(ff.gridWidth).toBe(32);
    expect(ff.gridHeight).toBe(16);
    expect(ff.worldCellSize).toBe(2.5);
  });

  it('destroy() is safe to call (no GPU resources to release)', () => {
    const ff = new FlowFieldCPU();
    expect(() => ff.destroy()).not.toThrow();
  });
});
