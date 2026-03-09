/**
 * SpatialAudioZoneSystem — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { SpatialAudioZoneSystem, REVERB_PRESETS, type AudioZoneConfig } from '../SpatialAudioZone';

function makeSystem() {
  return new SpatialAudioZoneSystem();
}

function boxZone(id: string, priority = 1, sx = 5, sy = 5, sz = 5, fd = 2): AudioZoneConfig {
  return {
    id,
    shape: 'box',
    position: { x: 0, y: 0, z: 0 },
    size: { x: sx, y: sy, z: sz },
    reverb: { ...REVERB_PRESETS.room },
    priority,
    fadeDistance: fd,
  };
}

function sphereZone(id: string, radius = 5, priority = 1, fd = 2): AudioZoneConfig {
  return {
    id,
    shape: 'sphere',
    position: { x: 0, y: 0, z: 0 },
    size: { x: radius, y: radius, z: radius },
    reverb: { ...REVERB_PRESETS.hall },
    priority,
    fadeDistance: fd,
  };
}

describe('SpatialAudioZoneSystem — REVERB_PRESETS', () => {
  it('has outdoor, room, hall, cathedral, cave, underwater presets', () => {
    const keys = Object.keys(REVERB_PRESETS);
    for (const name of ['outdoor', 'room', 'hall', 'cathedral', 'cave', 'underwater']) {
      expect(keys).toContain(name);
    }
  });
  it('each preset has required fields', () => {
    for (const p of Object.values(REVERB_PRESETS)) {
      expect(p.decay).toBeGreaterThan(0);
      expect(p.density).toBeGreaterThanOrEqual(0);
      expect(p.wetLevel).toBeGreaterThanOrEqual(0);
    }
  });
  it('cathedral has higher decay than room', () => {
    expect(REVERB_PRESETS.cathedral.decay).toBeGreaterThan(REVERB_PRESETS.room.decay);
  });
});

describe('SpatialAudioZoneSystem — zone management', () => {
  it('starts with 0 zones', () => {
    expect(makeSystem().getZoneCount()).toBe(0);
  });
  it('addZone increments count', () => {
    const s = makeSystem();
    s.addZone(boxZone('a'));
    expect(s.getZoneCount()).toBe(1);
  });
  it('getZone returns config', () => {
    const s = makeSystem();
    s.addZone(boxZone('z1'));
    expect(s.getZone('z1')!.id).toBe('z1');
  });
  it('getZone returns undefined for unknown', () => {
    expect(makeSystem().getZone('ghost')).toBeUndefined();
  });
  it('removeZone decrements count', () => {
    const s = makeSystem();
    s.addZone(boxZone('a'));
    s.removeZone('a');
    expect(s.getZoneCount()).toBe(0);
  });
  it('overwriting a zone by id replaces it', () => {
    const s = makeSystem();
    s.addZone(boxZone('x'));
    s.addZone(boxZone('x'));
    expect(s.getZoneCount()).toBe(1);
  });
});

describe('SpatialAudioZoneSystem — portals', () => {
  it('addPortal / removePortal does not throw', () => {
    const s = makeSystem();
    const portal = {
      id: 'p1',
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      width: 2,
      height: 3,
      fromZoneId: 'a',
      toZoneId: 'b',
      attenuation: 0.5,
    };
    expect(() => s.addPortal(portal)).not.toThrow();
    expect(() => s.removePortal('p1')).not.toThrow();
  });
  it('getPortalAttenuation returns 0 when no portal between zones', () => {
    expect(makeSystem().getPortalAttenuation('a', 'b')).toBe(0);
  });
  it('getPortalAttenuation returns attenuation via portal', () => {
    const s = makeSystem();
    s.addPortal({
      id: 'p',
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      width: 1,
      height: 2,
      fromZoneId: 'zoneA',
      toZoneId: 'zoneB',
      attenuation: 0.7,
    });
    expect(s.getPortalAttenuation('zoneA', 'zoneB')).toBeCloseTo(0.7);
    expect(s.getPortalAttenuation('zoneB', 'zoneA')).toBeCloseTo(0.7); // bidirectional
  });
});

describe('SpatialAudioZoneSystem — (box) listener positioning', () => {
  it('no active zones when no zones registered', () => {
    const s = makeSystem();
    s.updateListenerPosition({ x: 0, y: 0, z: 0 });
    expect(s.getActiveZones()).toHaveLength(0);
  });
  it('listener inside box zone → blendWeight=1, isInside=true', () => {
    const s = makeSystem();
    s.addZone(boxZone('b'));
    s.updateListenerPosition({ x: 0, y: 0, z: 0 }); // center
    const active = s.getActiveZones();
    expect(active).toHaveLength(1);
    expect(active[0].isInside).toBe(true);
    expect(active[0].blendWeight).toBe(1);
  });
  it('listener well outside box zone → no active zones', () => {
    const s = makeSystem();
    s.addZone(boxZone('b', 1, 5, 5, 5, 1)); // fadeDistance=1
    s.updateListenerPosition({ x: 20, y: 0, z: 0 }); // far outside
    expect(s.getActiveZones()).toHaveLength(0);
  });
  it('listener in fadeDistance band → 0<blendWeight<1', () => {
    const s = makeSystem();
    s.addZone(boxZone('b', 1, 5, 5, 5, 3)); // fadeDistance=3
    s.updateListenerPosition({ x: 7, y: 0, z: 0 }); // 7-5=2m outside, fadeDistance=3
    const active = s.getActiveZones();
    expect(active[0].blendWeight).toBeGreaterThan(0);
    expect(active[0].blendWeight).toBeLessThan(1);
    expect(active[0].isInside).toBe(false);
  });
  it('isListenerInsideZone returns true when inside', () => {
    const s = makeSystem();
    s.addZone(boxZone('z'));
    s.updateListenerPosition({ x: 1, y: 0, z: 0 });
    expect(s.isListenerInsideZone('z')).toBe(true);
  });
  it('isListenerInsideZone returns false for outside zone', () => {
    const s = makeSystem();
    s.addZone(boxZone('z'));
    s.updateListenerPosition({ x: 20, y: 0, z: 0 });
    expect(s.isListenerInsideZone('z')).toBe(false);
  });
  it('isListenerInsideZone returns false for unknown zone', () => {
    expect(makeSystem().isListenerInsideZone('ghost')).toBe(false);
  });
});

describe('SpatialAudioZoneSystem — sphere listener', () => {
  it('inside sphere zone → blendWeight=1', () => {
    const s = makeSystem();
    s.addZone(sphereZone('s', 10));
    s.updateListenerPosition({ x: 3, y: 0, z: 0 });
    expect(s.getActiveZones()[0].isInside).toBe(true);
  });
  it('outside sphere → no active', () => {
    const s = makeSystem();
    s.addZone(sphereZone('s', 5, 1, 1));
    s.updateListenerPosition({ x: 20, y: 0, z: 0 });
    expect(s.getActiveZones()).toHaveLength(0);
  });
});

describe('SpatialAudioZoneSystem — getEffectiveReverb', () => {
  it('returns null when no active zones', () => {
    const s = makeSystem();
    s.updateListenerPosition({ x: 1000, y: 0, z: 0 });
    expect(s.getEffectiveReverb()).toBeNull();
  });
  it('returns zone reverb when fully inside a zone', () => {
    const s = makeSystem();
    s.addZone(boxZone('r'));
    s.updateListenerPosition({ x: 0, y: 0, z: 0 });
    const rev = s.getEffectiveReverb()!;
    expect(rev).toBeDefined();
    expect(typeof rev.decay).toBe('number');
  });
  it('returns blended reverb when in two overlapping zones', () => {
    const s = makeSystem();
    s.addZone({
      ...boxZone('a', 2, 10, 10, 10, 5),
      reverb: { ...(REVERB_PRESETS.indoor ?? REVERB_PRESETS.room) },
    });
    s.addZone({ ...boxZone('b', 1, 10, 10, 10, 5), reverb: { ...REVERB_PRESETS.outdoor } });
    s.updateListenerPosition({ x: 8, y: 0, z: 0 }); // in fade band of both
    const rev = s.getEffectiveReverb();
    expect(rev).not.toBeNull();
  });
  it('higher priority zone dominates', () => {
    const s = makeSystem();
    const zLow = { ...boxZone('low', 1), reverb: { ...REVERB_PRESETS.outdoor } };
    const zHigh = { ...boxZone('high', 5), reverb: { ...REVERB_PRESETS.cathedral } };
    s.addZone(zLow);
    s.addZone(zHigh);
    s.updateListenerPosition({ x: 0, y: 0, z: 0 });
    const rev = s.getEffectiveReverb()!;
    // Primary (highest priority) zone reverb should dominate
    expect(rev.decay).toBeCloseTo(REVERB_PRESETS.cathedral.decay, 1);
  });
});

describe('SpatialAudioZoneSystem — getActiveZones ordering', () => {
  it('zones sorted by priority (highest first)', () => {
    const s = makeSystem();
    s.addZone(boxZone('low', 1));
    s.addZone(boxZone('high', 10));
    s.updateListenerPosition({ x: 0, y: 0, z: 0 });
    const active = s.getActiveZones();
    expect(active[0].zoneId).toBe('high');
    expect(active[1].zoneId).toBe('low');
  });
});
