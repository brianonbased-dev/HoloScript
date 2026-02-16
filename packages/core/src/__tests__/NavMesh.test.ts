import { describe, it, expect, beforeEach } from 'vitest';
import { NavMesh } from '../ai/NavMesh';

// =============================================================================
// C277 — NavMesh
// =============================================================================

describe('NavMesh', () => {
  let nav: NavMesh;
  beforeEach(() => { nav = new NavMesh(); });

  it('addPolygon returns incrementing id', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 5, z: 10 }]);
    const b = nav.addPolygon([{ x: 10, z: 0 }, { x: 20, z: 0 }, { x: 15, z: 10 }]);
    expect(b).toBeGreaterThan(a);
    expect(nav.getPolygonCount()).toBe(2);
  });

  it('addPolygon computes center correctly', () => {
    const id = nav.addPolygon([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }]);
    const p = nav.getPolygon(id)!;
    expect(p.center.x).toBeCloseTo(5);
    expect(p.center.z).toBeCloseTo(5);
  });

  it('connect links two polygons bidirectionally', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]);
    const b = nav.addPolygon([{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    expect(nav.connect(a, b)).toBe(true);
    expect(nav.getPolygon(a)!.neighbors).toContain(b);
    expect(nav.getPolygon(b)!.neighbors).toContain(a);
  });

  it('findPath returns null for non-walkable start', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }], false);
    const b = nav.addPolygon([{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    nav.connect(a, b);
    expect(nav.findPath(a, b)).toBeNull();
  });

  it('findPath returns direct path for connected neighbors', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]);
    const b = nav.addPolygon([{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    nav.connect(a, b);
    const path = nav.findPath(a, b);
    expect(path).not.toBeNull();
    expect(path!.polygonIds).toEqual([a, b]);
    expect(path!.waypoints).toHaveLength(2);
  });

  it('findPath returns null when disconnected', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]);
    const b = nav.addPolygon([{ x: 50, z: 50 }, { x: 60, z: 50 }, { x: 55, z: 60 }]);
    expect(nav.findPath(a, b)).toBeNull();
  });

  it('findPath routes through multiple polygons', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]);
    const b = nav.addPolygon([{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    const c = nav.addPolygon([{ x: 10, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 5 }]);
    nav.connect(a, b);
    nav.connect(b, c);
    const path = nav.findPath(a, c);
    expect(path).not.toBeNull();
    expect(path!.polygonIds).toEqual([a, b, c]);
  });

  it('findPath avoids non-walkable polygons', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]);
    const wall = nav.addPolygon([{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }], false);
    const c = nav.addPolygon([{ x: 10, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 5 }]);
    nav.connect(a, wall);
    nav.connect(wall, c);
    expect(nav.findPath(a, c)).toBeNull();
  });

  it('setWalkable toggles walkability', () => {
    const id = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]);
    nav.setWalkable(id, false);
    expect(nav.getPolygon(id)!.walkable).toBe(false);
  });

  it('smoothPath removes intermediate waypoints within range', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]);
    const b = nav.addPolygon([{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }]);
    const c = nav.addPolygon([{ x: 10, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 5 }]);
    nav.connect(a, b);
    nav.connect(b, c);
    const path = nav.findPath(a, c)!;
    const smoothed = nav.smoothPath(path);
    expect(smoothed.waypoints.length).toBeLessThanOrEqual(path.waypoints.length);
  });

  it('findPath with custom cost prefers cheaper route', () => {
    const a = nav.addPolygon([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 5 }]);
    const expensive = nav.addPolygon([{ x: 5, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 }], true, 100);
    const cheap1 = nav.addPolygon([{ x: 0, z: 5 }, { x: 5, z: 5 }, { x: 5, z: 10 }], true, 1);
    const cheap2 = nav.addPolygon([{ x: 5, z: 5 }, { x: 10, z: 5 }, { x: 10, z: 10 }], true, 1);
    const end = nav.addPolygon([{ x: 10, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 5 }]);
    nav.connect(a, expensive); nav.connect(expensive, end);
    nav.connect(a, cheap1); nav.connect(cheap1, cheap2); nav.connect(cheap2, end);
    const path = nav.findPath(a, end)!;
    expect(path.polygonIds).not.toContain(expensive);
  });
});
