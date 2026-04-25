/**
 * NavMesh — Production Test Suite
 *
 * Covers: polygon management, connections, A* pathfinding,
 * path smoothing, walkability, cost, queries.
 */
import { describe, it, expect } from 'vitest';
import { NavMesh } from '../NavMesh';

function tri(x: number, z: number): [number, number, number][] {
  return [
    [x, 0, z],
    [x + 2, 0, z],
    [x + 1, 0, z + 2],
  ];
}

describe('NavMesh — Production', () => {
  // ─── Polygon Management ───────────────────────────────────────────
  it('addPolygon assigns auto-incrementing id', () => {
    const nav = new NavMesh();
    const id0 = nav.addPolygon(tri(0, 0));
    const id1 = nav.addPolygon(tri(3, 0));
    expect(id0).toBe(0);
    expect(id1).toBe(1);
    expect(nav.getPolygonCount()).toBe(2);
  });

  it('polygon center is computed correctly', () => {
    const nav = new NavMesh();
    const id = nav.addPolygon([
      [0, 0, 0],
      [3, 0, 0],
      [0, 0, 3],
    ]);
    const poly = nav.getPolygon(id);
    expect(poly!.center[0]).toBe(1);
    expect(poly!.center[2]).toBe(1);
  });

  // ─── Connections ──────────────────────────────────────────────────
  it('connect links two polygons bidirectionally', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon(tri(0, 0));
    const b = nav.addPolygon(tri(3, 0));
    expect(nav.connect(a, b)).toBe(true);
    expect(nav.getPolygon(a)!.neighbors).toContain(b);
    expect(nav.getPolygon(b)!.neighbors).toContain(a);
  });

  it('connect returns false for invalid ids', () => {
    const nav = new NavMesh();
    expect(nav.connect(99, 100)).toBe(false);
  });

  // ─── Pathfinding ──────────────────────────────────────────────────
  it('finds direct path between connected polygons', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon(tri(0, 0));
    const b = nav.addPolygon(tri(3, 0));
    nav.connect(a, b);
    const path = nav.findPath(a, b);
    expect(path).not.toBeNull();
    expect(path!.polygonIds).toEqual([a, b]);
    expect(path!.waypoints.length).toBe(2);
  });

  it('finds multi-hop path', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon(tri(0, 0));
    const b = nav.addPolygon(tri(3, 0));
    const c = nav.addPolygon(tri(6, 0));
    nav.connect(a, b);
    nav.connect(b, c);
    const path = nav.findPath(a, c);
    expect(path).not.toBeNull();
    expect(path!.polygonIds).toEqual([a, b, c]);
  });

  it('returns null when no path exists', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon(tri(0, 0));
    const b = nav.addPolygon(tri(100, 100));
    // Not connected
    expect(nav.findPath(a, b)).toBeNull();
  });

  it('same start/end returns zero-hop path', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon(tri(0, 0));
    const path = nav.findPath(a, a);
    expect(path).not.toBeNull();
    expect(path!.polygonIds).toEqual([a]);
  });

  // ─── Walkability ──────────────────────────────────────────────────
  it('setWalkable blocks polygon from pathfinding', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon(tri(0, 0));
    const b = nav.addPolygon(tri(3, 0));
    const c = nav.addPolygon(tri(6, 0));
    nav.connect(a, b);
    nav.connect(b, c);
    nav.setWalkable(b, false);
    expect(nav.findPath(a, c)).toBeNull();
  });

  it('findPath returns null if start is not walkable', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon(tri(0, 0), false);
    const b = nav.addPolygon(tri(3, 0));
    nav.connect(a, b);
    expect(nav.findPath(a, b)).toBeNull();
  });

  // ─── Cost ─────────────────────────────────────────────────────────
  it('path prefers low-cost route', () => {
    const nav = new NavMesh();
    const a = nav.addPolygon(tri(0, 0));
    const b = nav.addPolygon(tri(3, 0), true, 100); // expensive
    const c = nav.addPolygon(tri(0, 3), true, 1); // cheap
    const d = nav.addPolygon(tri(3, 3));
    nav.connect(a, b);
    nav.connect(b, d);
    nav.connect(a, c);
    nav.connect(c, d);
    const path = nav.findPath(a, d);
    expect(path).not.toBeNull();
    expect(path!.polygonIds).toContain(c); // should go via cheap route
  });

  // ─── Smooth Path ──────────────────────────────────────────────────
  it('smoothPath reduces waypoints when possible', () => {
    const nav = new NavMesh();
    const ids = Array.from({ length: 5 }, (_, i) => nav.addPolygon(tri(i * 3, 0)));
    for (let i = 0; i < ids.length - 1; i++) nav.connect(ids[i], ids[i + 1]);
    const path = nav.findPath(ids[0], ids[4])!;
    const smoothed = nav.smoothPath(path);
    expect(smoothed.waypoints.length).toBeLessThanOrEqual(path.waypoints.length);
  });
});
