import { describe, it, expect } from 'vitest';
import {
  extractPlaneAnchors,
  toPlaneDetectedEvents,
  type PointCloud,
} from '../PlaneAnchorExtractor';
import { planeDetectionHandler } from '../../traits/PlaneDetectionTrait';

/**
 * Synthetic room (ARCore convention, +Y up): floor @y=0, ceiling @y=2.5, wall @x=0, wall @z=0, and a
 * counter @y=0.9. Each surface is a dense, slightly-noisy point patch. A correct extractor must recover
 * every surface with the right horizontal/vertical split and normal orientation — and its output must
 * drive the real PlaneDetectionTrait. Deterministic noise so the test is stable.
 */
function syntheticRoom(): PointCloud {
  const x: number[] = [],
    y: number[] = [],
    z: number[] = [];
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 0.02; // ±1cm
  const W = 4,
    D = 3,
    H = 2.5;
  // floor (y=0): horizontal, densely sampled (handheld scans see the floor most → it's the largest plane)
  for (let i = 0; i <= 56; i++)
    for (let j = 0; j <= 42; j++) {
      x.push((i / 56) * W + rnd());
      y.push(0 + rnd());
      z.push((j / 42) * D + rnd());
    }
  // ceiling (y=H): horizontal, sparser
  for (let i = 0; i <= 36; i++)
    for (let j = 0; j <= 27; j++) {
      x.push((i / 36) * W + rnd());
      y.push(H + rnd());
      z.push((j / 27) * D + rnd());
    }
  // wall x=0 and wall z=0: vertical
  for (let i = 0; i <= 30; i++)
    for (let j = 0; j <= 24; j++) {
      const py = (j / 24) * H;
      x.push(0 + rnd());
      y.push(py + rnd());
      z.push((i / 30) * D + rnd()); // wall at x=0 (normal ±x)
      x.push((i / 30) * W + rnd());
      y.push(py + rnd());
      z.push(0 + rnd()); // wall at z=0 (normal ±z)
    }
  // counter @y=0.9, a 1.2 x 0.6 patch off in a corner: horizontal table
  for (let i = 0; i <= 24; i++)
    for (let j = 0; j <= 12; j++) {
      x.push(2.2 + (i / 24) * 1.2 + rnd());
      y.push(0.9 + rnd());
      z.push(2.0 + (j / 12) * 0.6 + rnd());
    }
  return { N: x.length, x, y, z };
}

describe('extractPlaneAnchors', () => {
  const anchors = extractPlaneAnchors(syntheticRoom(), { distThreshold: 0.05, minInliers: 200 });

  it('recovers floor, ceiling, two walls, and the counter', () => {
    const cls = anchors.map((a) => a.classification);
    expect(cls).toContain('floor');
    expect(cls).toContain('ceiling');
    expect(cls).toContain('table');
    expect(cls.filter((c) => c === 'wall').length).toBeGreaterThanOrEqual(2);
  });

  it('classifies horizontal vs vertical by surface normal', () => {
    for (const a of anchors) {
      const ny = Math.abs(a.normal[1]);
      if (a.orientation === 'horizontal') expect(ny).toBeGreaterThan(0.85);
      if (a.orientation === 'vertical') expect(ny).toBeLessThan(0.2);
    }
    expect(anchors.some((a) => a.orientation === 'horizontal')).toBe(true);
    expect(anchors.some((a) => a.orientation === 'vertical')).toBe(true);
  });

  it('orients the floor normal up and the ceiling normal down', () => {
    const floor = anchors.find((a) => a.classification === 'floor');
    const ceiling = anchors.find((a) => a.classification === 'ceiling');
    expect(floor!.normal[1]).toBeGreaterThan(0.85);
    expect(ceiling!.normal[1]).toBeLessThan(-0.85);
  });

  it('places anchor centers on their real surfaces with sane extents', () => {
    const floor = anchors.find((a) => a.classification === 'floor')!;
    expect(Math.abs(floor.center[1])).toBeLessThan(0.05); // y≈0
    expect(floor.extent.width).toBeGreaterThan(2); // spans the room
    expect(floor.area).toBeGreaterThan(6);
    const counter = anchors.find((a) => a.classification === 'table')!;
    expect(Math.abs(counter.center[1] - 0.9)).toBeLessThan(0.06); // y≈0.9
  });

  it('is deterministic for a fixed seed', () => {
    const a2 = extractPlaneAnchors(syntheticRoom(), { distThreshold: 0.05, minInliers: 200 });
    expect(a2.map((a) => a.id)).toEqual(anchors.map((a) => a.id));
  });

  it('feeds the real PlaneDetectionTrait via plane_detected events', () => {
    const node: Record<string, unknown> = {};
    const ctx = { emit: () => {} };
    const cfg = planeDetectionHandler.defaultConfig;
    planeDetectionHandler.onAttach!(node as never, cfg, ctx as never);
    for (const ev of toPlaneDetectedEvents(anchors)) {
      planeDetectionHandler.onEvent!(node as never, cfg, ctx as never, ev as never);
    }
    const state = node.__planeDetectionState as { planes: Map<string, unknown> };
    expect(state.planes.size).toBeGreaterThanOrEqual(5);
  });
});
