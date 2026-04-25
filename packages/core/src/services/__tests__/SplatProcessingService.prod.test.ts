/**
 * SplatProcessingService Production Tests
 *
 * parseSplat (ArrayBuffer→SplatData), sortSplat (depth), intersectRay.
 */

import { describe, it, expect } from 'vitest';
import { SplatProcessingService } from '../SplatProcessingService';

function buildSplatBuffer(splats: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[]): ArrayBuffer {
  const buf = new ArrayBuffer(splats.length * 32);
  const view = new DataView(buf);
  for (let i = 0; i < splats.length; i++) {
    const off = i * 32;
    const s = splats[i];
    view.setFloat32(off + 0, s[0], true);
    view.setFloat32(off + 4, s[1], true);
    view.setFloat32(off + 8, s[2], true);
    view.setFloat32(off + 12, s.sx, true);
    view.setFloat32(off + 16, s.sy, true);
    view.setFloat32(off + 20, s.sz, true);
    // Rotation: default (128,128,128,128) → 0,0,0,0
    view.setUint8(off + 24, 128);
    view.setUint8(off + 25, 128);
    view.setUint8(off + 26, 128);
    view.setUint8(off + 27, 128);
    // Colors: white opaque
    view.setUint8(off + 28, 255);
    view.setUint8(off + 29, 255);
    view.setUint8(off + 30, 255);
    view.setUint8(off + 31, 255);
  }
  return buf;
}

describe('SplatProcessingService — Production', () => {
  const svc = new SplatProcessingService();

  describe('parseSplat', () => {
    it('parses buffer into SplatData', async () => {
      const buf = buildSplatBuffer([
        { x: 1, y: 2, z: 3, sx: 0.5, sy: 0.5, sz: 0.5 },
        { x: 4, y: 5, z: 6, sx: 1, sy: 1, sz: 1 },
      ]);
      const data = await svc.parseSplat(buf);
      expect(data.count).toBe(2);
      expect(data.positions[0]).toBeCloseTo(1);
      expect(data.positions[1]).toBeCloseTo(2);
      expect(data.positions[2]).toBeCloseTo(3);
      expect(data.scales[0]).toBeCloseTo(0.5);
      expect(data.colors[0]).toBe(255);
    });

    it('empty buffer', async () => {
      const data = await svc.parseSplat(new ArrayBuffer(0));
      expect(data.count).toBe(0);
    });
  });

  describe('sortSplat', () => {
    it('sorts far-to-near from camera', async () => {
      const buf = buildSplatBuffer([
        { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 },    // Near
        { x: 100, y: 0, z: 0, sx: 1, sy: 1, sz: 1 },  // Far
      ]);
      const data = await svc.parseSplat(buf);
      const sorted = svc.sortSplat(data, [0, 0, 0]);
      expect(sorted[0]).toBe(1); // Farthest first
    });
  });

  describe('intersectRay', () => {
    it('hits splat sphere', async () => {
      const buf = buildSplatBuffer([
        { x: 5, y: 0, z: 0, sx: 2, sy: 2, sz: 2 },
      ]);
      const data = await svc.parseSplat(buf);
      const hit = svc.intersectRay(data, [0, 0, 0], [1, 0, 0]);
      expect(hit).not.toBeNull();
      expect(hit!.index).toBe(0);
      expect(hit!.distance).toBeGreaterThan(0);
    });

    it('misses off-axis', async () => {
      const buf = buildSplatBuffer([
        { x: 5, y: 0, z: 0, sx: 0.1, sy: 0.1, sz: 0.1 },
      ]);
      const data = await svc.parseSplat(buf);
      const hit = svc.intersectRay(data, [0, 0, 0], [0, 1, 0]);
      expect(hit).toBeNull();
    });
  });
});
