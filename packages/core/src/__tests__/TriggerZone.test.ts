import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerZoneSystem } from '@holoscript/engine/physics/TriggerZone';
import type { TriggerZoneConfig } from '@holoscript/engine/physics/TriggerZone';

// =============================================================================
// C236 — Trigger Zone
// =============================================================================

// Use factory functions to avoid shared mutable state between tests
function sphereZone(): TriggerZoneConfig {
  return {
    id: 'zone1',
    shape: { type: 'sphere', position: [0, 0, 0], radius: 10 },
    enabled: true,
    tags: ['combat'],
  };
}

function boxZone(): TriggerZoneConfig {
  return {
    id: 'zone2',
    shape: { type: 'box', position: [50, 0, 0], halfExtents: { x: 5, y: 5, z: 5 } },
    enabled: true,
    tags: ['shop'],
  };
}

describe('TriggerZoneSystem', () => {
  let sys: TriggerZoneSystem;
  beforeEach(() => {
    sys = new TriggerZoneSystem();
  });

  it('addZone and getZoneCount', () => {
    sys.addZone(sphereZone());
    expect(sys.getZoneCount()).toBe(1);
  });

  it('removeZone decreases count', () => {
    sys.addZone(sphereZone());
    sys.removeZone('zone1');
    expect(sys.getZoneCount()).toBe(0);
  });

  it('update detects sphere enter', () => {
    sys.addZone(sphereZone());
    const cb = vi.fn();
    sys.onTrigger('zone1', cb);
    sys.update([{ id: 'player', position: [0, 0, 0] }]);
    expect(cb).toHaveBeenCalledWith('player', 'zone1', 'enter');
  });

  it('update detects stay on second update', () => {
    sys.addZone(sphereZone());
    const cb = vi.fn();
    sys.onTrigger('zone1', cb);
    const player = { id: 'player', position: [0, 0, 0] };
    sys.update([player]); // enter
    cb.mockClear();
    sys.update([player]); // stay
    expect(cb).toHaveBeenCalledWith('player', 'zone1', 'stay');
  });

  it('update detects exit when entity moves out', () => {
    sys.addZone(sphereZone());
    const cb = vi.fn();
    sys.onTrigger('zone1', cb);
    sys.update([{ id: 'player', position: [0, 0, 0] }]);
    cb.mockClear();
    sys.update([{ id: 'player', position: [100, 100, 100] }]);
    expect(cb).toHaveBeenCalledWith('player', 'zone1', 'exit');
  });

  it('update detects exit when entity disappears from list', () => {
    sys.addZone(sphereZone());
    const cb = vi.fn();
    sys.onTrigger('zone1', cb);
    sys.update([{ id: 'player', position: [0, 0, 0] }]);
    cb.mockClear();
    sys.update([]);
    expect(cb).toHaveBeenCalledWith('player', 'zone1', 'exit');
  });

  it('does not fire for entity outside zone', () => {
    sys.addZone(sphereZone());
    const cb = vi.fn();
    sys.onTrigger('zone1', cb);
    sys.update([{ id: 'enemy', position: [100, 100, 100] }]);
    expect(cb).not.toHaveBeenCalled();
  });

  it('enableZone false skips zone', () => {
    sys.addZone(sphereZone());
    sys.enableZone('zone1', false);
    const cb = vi.fn();
    sys.onTrigger('zone1', cb);
    sys.update([{ id: 'player', position: [0, 0, 0] }]);
    expect(cb).not.toHaveBeenCalled();
  });

  it('box zone detects overlap', () => {
    sys.addZone(boxZone());
    const cb = vi.fn();
    sys.onTrigger('zone2', cb);
    sys.update([{ id: 'p', position: [52, 0, 0] }]);
    expect(cb).toHaveBeenCalledWith('p', 'zone2', 'enter');
  });

  it('isInside reflects current state after update', () => {
    sys.addZone(sphereZone());
    sys.update([{ id: 'player', position: [0, 0, 0] }]);
    expect(sys.isInside('player', 'zone1')).toBe(true);
    expect(sys.isInside('nobody', 'zone1')).toBe(false);
  });

  it('getOccupants lists entities currently inside', () => {
    sys.addZone(sphereZone());
    sys.update([
      { id: 'player', position: [0, 0, 0] },
      { id: 'ally', position: [1, 1, 1] },
    ]);
    const occ = sys.getOccupants('zone1');
    expect(occ).toContain('player');
    expect(occ).toContain('ally');
  });

  it('getZonesForEntity returns correct zones', () => {
    sys.addZone(sphereZone());
    sys.addZone(boxZone());
    sys.update([{ id: 'player', position: [0, 0, 0] }]);
    const zones = sys.getZonesForEntity('player');
    expect(zones).toContain('zone1');
    expect(zones).not.toContain('zone2');
  });

  it('entity with radius extends overlap', () => {
    sys.addZone(sphereZone()); // radius=10 at origin
    const cb = vi.fn();
    sys.onTrigger('zone1', cb);
    // Entity at distance 12, but with radius 5 → overlaps (12 <= 10+5)
    sys.update([{ id: 'big', position: [12, 0, 0], radius: 5 }]);
    expect(cb).toHaveBeenCalledWith('big', 'zone1', 'enter');
  });
});
