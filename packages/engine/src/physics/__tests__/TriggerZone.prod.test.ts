/**
 * TriggerZoneSystem — Production Test Suite
 *
 * Covers: addZone, removeZone, enter/stay/exit callbacks,
 * box/sphere overlap, enable/disable, occupant queries.
 */
import { describe, it, expect, vi } from 'vitest';
import { TriggerZoneSystem, type TriggerZoneConfig } from '..';

function sphereZone(): TriggerZoneConfig {
  return {
    id: 'z1',
    enabled: true,
    tags: ['test'],
    shape: { type: 'sphere', position: [0, 0, 0], radius: 5 },
  };
}

function boxZone(): TriggerZoneConfig {
  return {
    id: 'z2',
    enabled: true,
    tags: ['box'],
    shape: { type: 'box', position: [0, 0, 0], halfExtents: { x: 5, y: 5, z: 5 } },
  };
}

describe('TriggerZoneSystem — Production', () => {
  // ─── Enter ────────────────────────────────────────────────────────
  it('fires enter when entity enters sphere zone', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(sphereZone());
    const cb = vi.fn();
    tz.onTrigger('z1', cb);
    tz.update([{ id: 'e1', position: [0, 0, 0] }]);
    expect(cb).toHaveBeenCalledWith('e1', 'z1', 'enter');
  });

  // ─── Stay ─────────────────────────────────────────────────────────
  it('fires stay on subsequent frames inside zone', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(sphereZone());
    const cb = vi.fn();
    tz.onTrigger('z1', cb);
    const ents = [{ id: 'e1', position: [0, 0, 0] }];
    tz.update(ents);
    cb.mockClear();
    tz.update(ents);
    expect(cb).toHaveBeenCalledWith('e1', 'z1', 'stay');
  });

  // ─── Exit ─────────────────────────────────────────────────────────
  it('fires exit when entity leaves zone', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(sphereZone());
    const cb = vi.fn();
    tz.onTrigger('z1', cb);
    tz.update([{ id: 'e1', position: [0, 0, 0] }]);
    cb.mockClear();
    tz.update([]); // entity gone
    expect(cb).toHaveBeenCalledWith('e1', 'z1', 'exit');
  });

  // ─── Box Overlap ──────────────────────────────────────────────────
  it('box zone detects entities inside', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(boxZone());
    const cb = vi.fn();
    tz.onTrigger('z2', cb);
    tz.update([{ id: 'e1', position: [3, 3, 3] }]);
    expect(cb).toHaveBeenCalled();
  });

  it('entity outside box zone not detected', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(boxZone());
    const cb = vi.fn();
    tz.onTrigger('z2', cb);
    tz.update([{ id: 'e1', position: [100, 100, 100] }]);
    expect(cb).not.toHaveBeenCalled();
  });

  // ─── Enable/Disable ───────────────────────────────────────────────
  it('disabled zone does not fire', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(sphereZone());
    tz.enableZone('z1', false);
    const cb = vi.fn();
    tz.onTrigger('z1', cb);
    tz.update([{ id: 'e1', position: [0, 0, 0] }]);
    expect(cb).not.toHaveBeenCalled();
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('isInside and getOccupants', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(sphereZone());
    tz.update([{ id: 'e1', position: [0, 0, 0] }]);
    expect(tz.isInside('e1', 'z1')).toBe(true);
    expect(tz.getOccupants('z1')).toContain('e1');
  });

  it('getZonesForEntity lists zones containing entity', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(sphereZone());
    tz.addZone(boxZone());
    tz.update([{ id: 'e1', position: [0, 0, 0] }]);
    expect(tz.getZonesForEntity('e1').length).toBe(2);
  });

  it('removeZone cleans up', () => {
    const tz = new TriggerZoneSystem();
    tz.addZone(sphereZone());
    tz.removeZone('z1');
    expect(tz.getZoneCount()).toBe(0);
  });
});
