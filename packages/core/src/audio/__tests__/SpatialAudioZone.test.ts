/**
 * SpatialAudioZone Unit Tests
 *
 * Tests zone management, listener positioning, blend weight
 * calculations, reverb presets, portals, and active zone queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpatialAudioZoneSystem,
  REVERB_PRESETS,
  type AudioZoneConfig,
  type AudioPortal,
} from '../SpatialAudioZone';

function makeBoxZone(
  id: string,
  pos = { x: 0, y: 0, z: 0 },
  size = { x: 5, y: 5, z: 5 },
  overrides: Partial<AudioZoneConfig> = {}
): AudioZoneConfig {
  return {
    id,
    shape: 'box',
    position: pos,
    size,
    reverb: REVERB_PRESETS.room,
    priority: 0,
    fadeDistance: 2,
    ...overrides,
  };
}

function makeSphereZone(
  id: string,
  pos = { x: 0, y: 0, z: 0 },
  radius = 5,
  overrides: Partial<AudioZoneConfig> = {}
): AudioZoneConfig {
  return {
    id,
    shape: 'sphere',
    position: pos,
    size: { x: radius, y: radius, z: radius },
    reverb: REVERB_PRESETS.hall,
    priority: 0,
    fadeDistance: 3,
    ...overrides,
  };
}

describe('SpatialAudioZoneSystem', () => {
  let system: SpatialAudioZoneSystem;

  beforeEach(() => {
    system = new SpatialAudioZoneSystem();
  });

  describe('zone management', () => {
    it('should add and retrieve a zone', () => {
      const zone = makeBoxZone('zone1');
      system.addZone(zone);
      expect(system.getZone('zone1')).toEqual(zone);
      expect(system.getZoneCount()).toBe(1);
    });

    it('should remove a zone', () => {
      system.addZone(makeBoxZone('zone1'));
      system.removeZone('zone1');
      expect(system.getZone('zone1')).toBeUndefined();
      expect(system.getZoneCount()).toBe(0);
    });
  });

  describe('listener inside box zone', () => {
    it('should detect listener inside a box zone', () => {
      system.addZone(makeBoxZone('room', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }));
      system.updateListenerPosition({ x: 0, y: 0, z: 0 });

      expect(system.isListenerInsideZone('room')).toBe(true);
      const active = system.getActiveZones();
      expect(active).toHaveLength(1);
      expect(active[0].blendWeight).toBe(1);
    });

    it('should detect listener outside a box zone', () => {
      system.addZone(
        makeBoxZone('room', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }, { fadeDistance: 2 })
      );
      system.updateListenerPosition({ x: 100, y: 100, z: 100 });

      expect(system.isListenerInsideZone('room')).toBe(false);
      expect(system.getActiveZones()).toHaveLength(0);
    });

    it('should blend weight at zone boundary', () => {
      system.addZone(
        makeBoxZone('room', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }, { fadeDistance: 4 })
      );
      // Position just outside the box (distance ~1 from boundary)
      system.updateListenerPosition({ x: 6, y: 0, z: 0 });

      const active = system.getActiveZones();
      expect(active).toHaveLength(1);
      expect(active[0].blendWeight).toBeGreaterThan(0);
      expect(active[0].blendWeight).toBeLessThan(1);
      expect(active[0].isInside).toBe(false);
    });
  });

  describe('listener inside sphere zone', () => {
    it('should detect listener inside a sphere zone', () => {
      system.addZone(makeSphereZone('sphere', { x: 0, y: 0, z: 0 }, 10));
      system.updateListenerPosition({ x: 3, y: 0, z: 0 });

      expect(system.isListenerInsideZone('sphere')).toBe(true);
    });

    it('should detect listener outside a sphere zone', () => {
      system.addZone(makeSphereZone('sphere', { x: 0, y: 0, z: 0 }, 10, { fadeDistance: 2 }));
      system.updateListenerPosition({ x: 50, y: 0, z: 0 });

      expect(system.isListenerInsideZone('sphere')).toBe(false);
      expect(system.getActiveZones()).toHaveLength(0);
    });
  });

  describe('priority ordering', () => {
    it('should sort active zones by priority (highest first)', () => {
      system.addZone(
        makeBoxZone('low', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, { priority: 1 })
      );
      system.addZone(
        makeBoxZone('high', { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, { priority: 10 })
      );
      system.updateListenerPosition({ x: 0, y: 0, z: 0 });

      const active = system.getActiveZones();
      expect(active[0].zoneId).toBe('high');
      expect(active[1].zoneId).toBe('low');
    });
  });

  describe('getEffectiveReverb', () => {
    it('should return null when no zones are active', () => {
      expect(system.getEffectiveReverb()).toBeNull();
    });

    it('should return reverb of single active zone', () => {
      system.addZone(makeBoxZone('room', { x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }));
      system.updateListenerPosition({ x: 0, y: 0, z: 0 });

      const reverb = system.getEffectiveReverb();
      expect(reverb).toBeDefined();
      expect(reverb!.name).toBe('room');
    });
  });

  describe('portals', () => {
    it('should add and query portal attenuation', () => {
      const portal: AudioPortal = {
        id: 'portal1',
        position: { x: 5, y: 0, z: 0 },
        normal: { x: 1, y: 0, z: 0 },
        width: 2,
        height: 3,
        fromZoneId: 'hallway',
        toZoneId: 'room',
        attenuation: 0.5,
      };
      system.addPortal(portal);

      expect(system.getPortalAttenuation('hallway', 'room')).toBe(0.5);
      expect(system.getPortalAttenuation('room', 'hallway')).toBe(0.5); // bidirectional
    });

    it('should return 0 for no portal between zones', () => {
      expect(system.getPortalAttenuation('a', 'b')).toBe(0);
    });

    it('should remove a portal', () => {
      system.addPortal({
        id: 'p1',
        position: { x: 0, y: 0, z: 0 },
        normal: { x: 1, y: 0, z: 0 },
        width: 2,
        height: 3,
        fromZoneId: 'a',
        toZoneId: 'b',
        attenuation: 0.8,
      });
      system.removePortal('p1');
      expect(system.getPortalAttenuation('a', 'b')).toBe(0);
    });
  });

  describe('REVERB_PRESETS', () => {
    it('should contain standard presets', () => {
      expect(REVERB_PRESETS.outdoor).toBeDefined();
      expect(REVERB_PRESETS.room).toBeDefined();
      expect(REVERB_PRESETS.hall).toBeDefined();
      expect(REVERB_PRESETS.cathedral).toBeDefined();
      expect(REVERB_PRESETS.cave).toBeDefined();
      expect(REVERB_PRESETS.underwater).toBeDefined();
    });

    it('should have valid decay times', () => {
      for (const preset of Object.values(REVERB_PRESETS)) {
        expect(preset.decay).toBeGreaterThan(0);
      }
    });
  });
});
