import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialAudioZoneSystem, REVERB_PRESETS } from '../audio/SpatialAudioZone';

// =============================================================================
// C267 — Spatial Audio Zone
// =============================================================================

const makeZone = (id: string, shape: 'box' | 'sphere', pos: { x: number; y: number; z: number }, size: { x: number; y: number; z: number }, priority = 0) => ({
  id, shape, position: pos, size,
  reverb: REVERB_PRESETS.room,
  priority, fadeDistance: 5,
});

describe('SpatialAudioZoneSystem', () => {
  let sys: SpatialAudioZoneSystem;
  beforeEach(() => { sys = new SpatialAudioZoneSystem(); });

  it('addZone stores zone', () => {
    sys.addZone(makeZone('z1', 'box', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }));
    expect(sys.getZoneCount()).toBe(1);
  });

  it('removeZone deletes zone', () => {
    sys.addZone(makeZone('z1', 'box', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }));
    sys.removeZone('z1');
    expect(sys.getZoneCount()).toBe(0);
  });

  it('listener inside box zone has blendWeight 1', () => {
    sys.addZone(makeZone('z1', 'box', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }));
    sys.updateListenerPosition({ x: 0, y: 0, z: 0 });
    const active = sys.getActiveZones();
    expect(active).toHaveLength(1);
    expect(active[0].blendWeight).toBe(1);
    expect(active[0].isInside).toBe(true);
  });

  it('listener inside sphere zone has blendWeight 1', () => {
    sys.addZone(makeZone('z1', 'sphere', { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }));
    sys.updateListenerPosition({ x: 5, y: 0, z: 0 });
    const active = sys.getActiveZones();
    expect(active).toHaveLength(1);
    expect(active[0].isInside).toBe(true);
  });

  it('listener outside fadeDistance returns no active zones', () => {
    sys.addZone(makeZone('z1', 'box', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }));
    sys.updateListenerPosition({ x: 100, y: 0, z: 0 });
    expect(sys.getActiveZones()).toHaveLength(0);
  });

  it('listener in fade band gets blendWeight between 0 and 1', () => {
    sys.addZone(makeZone('z1', 'box', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }));
    sys.updateListenerPosition({ x: 7, y: 0, z: 0 }); // 2 units outside, fadeDistance=5
    const active = sys.getActiveZones();
    expect(active).toHaveLength(1);
    expect(active[0].blendWeight).toBeGreaterThan(0);
    expect(active[0].blendWeight).toBeLessThan(1);
  });

  it('getEffectiveReverb returns null when no active zones', () => {
    expect(sys.getEffectiveReverb()).toBeNull();
  });

  it('getEffectiveReverb returns reverb preset when inside zone', () => {
    sys.addZone(makeZone('z1', 'box', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }));
    sys.updateListenerPosition({ x: 0, y: 0, z: 0 });
    const reverb = sys.getEffectiveReverb()!;
    expect(reverb.decay).toBe(REVERB_PRESETS.room.decay);
  });

  it('getActiveZones sorted by priority', () => {
    sys.addZone(makeZone('low', 'box', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, 1));
    sys.addZone(makeZone('high', 'box', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, 5));
    sys.updateListenerPosition({ x: 0, y: 0, z: 0 });
    const active = sys.getActiveZones();
    expect(active[0].zoneId).toBe('high');
  });

  it('isListenerInsideZone returns correct boolean', () => {
    sys.addZone(makeZone('z1', 'box', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }));
    sys.updateListenerPosition({ x: 0, y: 0, z: 0 });
    expect(sys.isListenerInsideZone('z1')).toBe(true);
    expect(sys.isListenerInsideZone('z2')).toBe(false);
  });

  it('addPortal and getPortalAttenuation', () => {
    sys.addPortal({
      id: 'p1', position: { x: 5, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 },
      width: 2, height: 3, fromZoneId: 'z1', toZoneId: 'z2', attenuation: 0.7,
    });
    expect(sys.getPortalAttenuation('z1', 'z2')).toBe(0.7);
    expect(sys.getPortalAttenuation('z2', 'z1')).toBe(0.7); // bidirectional
    expect(sys.getPortalAttenuation('z1', 'z3')).toBe(0); // no portal
  });

  it('REVERB_PRESETS has expected presets', () => {
    expect(REVERB_PRESETS.outdoor).toBeDefined();
    expect(REVERB_PRESETS.cathedral).toBeDefined();
    expect(REVERB_PRESETS.cave).toBeDefined();
  });
});
