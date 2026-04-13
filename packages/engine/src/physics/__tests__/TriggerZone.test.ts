import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerZoneSystem } from '..';

function sphereZone(id: string, x = 0, y = 0, z = 0, radius = 1): any {
  return { id, shape: { type: 'sphere', position: { x, y, z }, radius }, enabled: true, tags: [] };
}

function boxZone(id: string, x = 0, y = 0, z = 0, hx = 1, hy = 1, hz = 1): any {
  return {
    id,
    shape: { type: 'box', position: { x, y, z }, halfExtents: { x: hx, y: hy, z: hz } },
    enabled: true,
    tags: [],
  };
}

describe('TriggerZoneSystem', () => {
  let sys: TriggerZoneSystem;

  beforeEach(() => {
    sys = new TriggerZoneSystem();
  });

  it('adds and counts zones', () => {
    sys.addZone(sphereZone('z1'));
    expect(sys.getZoneCount()).toBe(1);
  });

  it('removes a zone', () => {
    sys.addZone(sphereZone('z2'));
    sys.removeZone('z2');
    expect(sys.getZoneCount()).toBe(0);
  });

  // ---------- Enter / Stay / Exit ----------
  it('fires enter callback on first overlap', () => {
    sys.addZone(sphereZone('z3', 0, 0, 0, 5));
    const cb = vi.fn();
    sys.onTrigger('z3', cb);
    sys.update([{ id: 'e1', position: [0, 0, 0] }]);
    expect(cb).toHaveBeenCalledWith('e1', 'z3', 'enter');
  });

  it('fires stay on subsequent overlap', () => {
    sys.addZone(sphereZone('z4', 0, 0, 0, 5));
    const cb = vi.fn();
    sys.onTrigger('z4', cb);
    sys.update([{ id: 'e2', position: [0, 0, 0] }]);
    sys.update([{ id: 'e2', position: [1, 0, 0] }]);
    expect(cb).toHaveBeenCalledWith('e2', 'z4', 'stay');
  });

  it('fires exit when entity leaves', () => {
    sys.addZone(sphereZone('z5', 0, 0, 0, 1));
    const cb = vi.fn();
    sys.onTrigger('z5', cb);
    sys.update([{ id: 'e3', position: [0, 0, 0] }]); // enter
    sys.update([]); // entity gone → exit
    expect(cb).toHaveBeenCalledWith('e3', 'z5', 'exit');
  });

  // ---------- Box zone ----------
  it('detects overlap with box zone', () => {
    sys.addZone(boxZone('box1', 0, 0, 0, 2, 2, 2));
    const cb = vi.fn();
    sys.onTrigger('box1', cb);
    sys.update([{ id: 'e4', position: [1, 1, 1] }]);
    expect(cb).toHaveBeenCalledWith('e4', 'box1', 'enter');
  });

  it('does not trigger outside box', () => {
    sys.addZone(boxZone('box2', 0, 0, 0, 1, 1, 1));
    const cb = vi.fn();
    sys.onTrigger('box2', cb);
    sys.update([{ id: 'e5', position: [5, 5, 5] }]);
    expect(cb).not.toHaveBeenCalled();
  });

  // ---------- Disabled zone ----------
  it('does not trigger for disabled zones', () => {
    sys.addZone(sphereZone('z6', 0, 0, 0, 10));
    sys.enableZone('z6', false);
    const cb = vi.fn();
    sys.onTrigger('z6', cb);
    sys.update([{ id: 'e6', position: [0, 0, 0] }]);
    expect(cb).not.toHaveBeenCalled();
  });

  // ---------- Queries ----------
  it('isInside returns true for overlapping entity', () => {
    sys.addZone(sphereZone('z7', 0, 0, 0, 5));
    sys.update([{ id: 'e7', position: [0, 0, 0] }]);
    expect(sys.isInside('e7', 'z7')).toBe(true);
  });

  it('getOccupants lists entities inside zone', () => {
    sys.addZone(sphereZone('z8', 0, 0, 0, 5));
    sys.update([
      { id: 'a', position: [0, 0, 0] },
      { id: 'b', position: [1, 0, 0] },
    ]);
    expect(sys.getOccupants('z8')).toContain('a');
    expect(sys.getOccupants('z8')).toContain('b');
  });

  it('getZonesForEntity returns zones containing entity', () => {
    sys.addZone(sphereZone('z9a', 0, 0, 0, 5));
    sys.addZone(sphereZone('z9b', 1, 0, 0, 5));
    sys.update([{ id: 'e9', position: [0.5, 0, 0] }]);
    const zones = sys.getZonesForEntity('e9');
    expect(zones).toContain('z9a');
    expect(zones).toContain('z9b');
  });
});
