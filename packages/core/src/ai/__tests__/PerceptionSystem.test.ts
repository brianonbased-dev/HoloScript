/**
 * PerceptionSystem Unit Tests
 *
 * Tests entity registration, stimulus detection, sight/hearing sense cones,
 * FOV filtering, memory decay, and priority queries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerceptionSystem } from '../PerceptionSystem';
import type { SenseConfig, Stimulus } from '../PerceptionSystem';

describe('PerceptionSystem', () => {
  let ps: PerceptionSystem;

  const sightSense: SenseConfig = { type: 'sight', range: 50, fov: 90, sensitivity: 1 };
  const hearingSense: SenseConfig = { type: 'hearing', range: 100, fov: 360, sensitivity: 1 };

  beforeEach(() => {
    ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense, hearingSense], 10);
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  });

  describe('stimulus management', () => {
    it('should add and track stimuli', () => {
      ps.addStimulus({ id: 's1', type: 'sight', sourceId: 'player', position: { x: 10, y: 0, z: 10 }, intensity: 0.8, timestamp: 0 });
      expect(ps.getStimulusCount()).toBe(1);
    });

    it('should remove stimuli', () => {
      ps.addStimulus({ id: 's1', type: 'sight', sourceId: 'player', position: { x: 10, y: 0, z: 10 }, intensity: 0.8, timestamp: 0 });
      ps.removeStimulus('s1');
      expect(ps.getStimulusCount()).toBe(0);
    });
  });

  describe('detection within range and FOV', () => {
    it('should perceive stimulus within range and FOV', () => {
      ps.addStimulus({ id: 's1', type: 'sight', sourceId: 'player', position: { x: 0, y: 0, z: 10 }, intensity: 1, timestamp: 0 });
      ps.update(1);
      expect(ps.isAwareOf('guard', 's1')).toBe(true);
    });

    it('should not perceive stimulus outside range', () => {
      ps.addStimulus({ id: 'far', type: 'sight', sourceId: 'player', position: { x: 0, y: 0, z: 999 }, intensity: 1, timestamp: 0 });
      ps.update(1);
      expect(ps.isAwareOf('guard', 'far')).toBe(false);
    });

    it('should not perceive sight stimulus outside FOV', () => {
      // Guard faces +z, stimulus behind at -z
      ps.addStimulus({ id: 'behind', type: 'sight', sourceId: 'player', position: { x: 0, y: 0, z: -10 }, intensity: 1, timestamp: 0 });
      ps.update(1);
      expect(ps.isAwareOf('guard', 'behind')).toBe(false);
    });

    it('should perceive 360 FOV hearing stimulus from any direction', () => {
      ps.addStimulus({ id: 'sound', type: 'hearing', sourceId: 'player', position: { x: 0, y: 0, z: -10 }, intensity: 1, timestamp: 0 });
      ps.update(1);
      expect(ps.isAwareOf('guard', 'sound')).toBe(true);
    });
  });

  describe('self-perception prevention', () => {
    it('should not detect own stimuli', () => {
      ps.addStimulus({ id: 'own', type: 'sight', sourceId: 'guard', position: { x: 0, y: 0, z: 5 }, intensity: 1, timestamp: 0 });
      ps.update(1);
      expect(ps.isAwareOf('guard', 'own')).toBe(false);
    });
  });

  describe('awareness accumulation', () => {
    it('should increase awareness with repeated updates', () => {
      ps.addStimulus({ id: 's1', type: 'sight', sourceId: 'player', position: { x: 0, y: 0, z: 5 }, intensity: 1, timestamp: 0 });
      ps.update(1);
      const a1 = ps.getPerceivedStimuli('guard').find(s => s.id === 's1')!.awareness;
      ps.update(2);
      const a2 = ps.getPerceivedStimuli('guard').find(s => s.id === 's1')!.awareness;
      expect(a2).toBeGreaterThanOrEqual(a1);
    });
  });

  describe('memory decay', () => {
    it('should forget stimuli after memoryDuration', () => {
      ps.addStimulus({ id: 's1', type: 'sight', sourceId: 'player', position: { x: 0, y: 0, z: 5 }, intensity: 1, timestamp: 0 });
      ps.update(1);
      expect(ps.isAwareOf('guard', 's1')).toBe(true);

      ps.removeStimulus('s1'); // Remove from world
      ps.update(20); // > memoryDuration=10
      expect(ps.isAwareOf('guard', 's1')).toBe(false);
    });
  });

  describe('queries', () => {
    it('should return perceived stimuli list', () => {
      ps.addStimulus({ id: 's1', type: 'sight', sourceId: 'p1', position: { x: 0, y: 0, z: 5 }, intensity: 1, timestamp: 0 });
      ps.addStimulus({ id: 's2', type: 'hearing', sourceId: 'p2', position: { x: 5, y: 0, z: 0 }, intensity: 0.5, timestamp: 0 });
      ps.update(1);
      expect(ps.getPerceivedStimuli('guard').length).toBe(2);
    });

    it('should return highest priority stimulus', () => {
      ps.addStimulus({ id: 'weak', type: 'sight', sourceId: 'p1', position: { x: 0, y: 0, z: 5 }, intensity: 0.2, timestamp: 0 });
      ps.addStimulus({ id: 'strong', type: 'sight', sourceId: 'p2', position: { x: 0, y: 0, z: 3 }, intensity: 1.0, timestamp: 0 });
      ps.update(1);
      const best = ps.getHighestPriority('guard');
      expect(best).not.toBeNull();
      expect(best!.id).toBe('strong');
    });

    it('should return null for entity with no stimuli', () => {
      expect(ps.getHighestPriority('guard')).toBeNull();
    });

    it('should return empty for unregistered entity', () => {
      expect(ps.getPerceivedStimuli('nobody')).toEqual([]);
    });
  });
});
