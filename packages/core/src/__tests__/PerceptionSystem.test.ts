import { describe, it, expect, beforeEach } from 'vitest';
import { PerceptionSystem } from '@holoscript/framework/ai';

// =============================================================================
// C273 — Perception System
// =============================================================================

describe('PerceptionSystem', () => {
  let sys: PerceptionSystem;
  beforeEach(() => {
    sys = new PerceptionSystem();
  });

  it('registerEntity and addStimulus', () => {
    sys.registerEntity('guard', [{ type: 'sight', range: 50, fov: 120, sensitivity: 1 }]);
    sys.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [10, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    expect(sys.getStimulusCount()).toBe(1);
  });

  it('entity perceives stimulus within range and FOV', () => {
    sys.registerEntity('guard', [{ type: 'sight', range: 50, fov: 120, sensitivity: 1 }]);
    sys.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    sys.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [10, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.update(0);
    expect(sys.getPerceivedStimuli('guard')).toHaveLength(1);
    expect(sys.isAwareOf('guard', 's1')).toBe(true);
  });

  it('entity does not perceive stimulus out of range', () => {
    sys.registerEntity('guard', [{ type: 'sight', range: 5, fov: 360, sensitivity: 1 }]);
    sys.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [100, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.update(0);
    expect(sys.getPerceivedStimuli('guard')).toHaveLength(0);
  });

  it('entity does not perceive stimulus outside FOV', () => {
    sys.registerEntity('guard', [{ type: 'sight', range: 50, fov: 90, sensitivity: 1 }]);
    sys.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }); // facing +x
    sys.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [-10, 0, 0],
      intensity: 1,
      timestamp: 0,
    }); // behind
    sys.update(0);
    expect(sys.getPerceivedStimuli('guard')).toHaveLength(0);
  });

  it('omnidirectional sense (fov=360) perceives from any direction', () => {
    sys.registerEntity('guard', [{ type: 'hearing', range: 50, fov: 360, sensitivity: 1 }]);
    sys.addStimulus({
      id: 's1',
      type: 'hearing',
      sourceId: 'player',
      position: [-10, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.update(0);
    expect(sys.getPerceivedStimuli('guard')).toHaveLength(1);
  });

  it('entity cannot perceive own stimuli', () => {
    sys.registerEntity('guard', [{ type: 'hearing', range: 50, fov: 360, sensitivity: 1 }]);
    sys.addStimulus({
      id: 's1',
      type: 'hearing',
      sourceId: 'guard',
      position: [0, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.update(0);
    expect(sys.getPerceivedStimuli('guard')).toHaveLength(0);
  });

  it('awareness increases with repeated perception', () => {
    sys.registerEntity('guard', [{ type: 'sight', range: 50, fov: 360, sensitivity: 1 }]);
    sys.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [5, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.update(0);
    const a1 = sys.getPerceivedStimuli('guard')[0].awareness;
    sys.update(1);
    const a2 = sys.getPerceivedStimuli('guard')[0].awareness;
    expect(a2).toBeGreaterThanOrEqual(a1);
  });

  it('memory expires after memoryDuration', () => {
    sys.registerEntity('guard', [{ type: 'sight', range: 50, fov: 360, sensitivity: 1 }], 5);
    sys.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [5, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.update(0);
    expect(sys.isAwareOf('guard', 's1')).toBe(true);
    sys.removeStimulus('s1');
    sys.update(10); // 10 > memoryDuration(5)
    expect(sys.isAwareOf('guard', 's1')).toBe(false);
  });

  it('getHighestPriority returns best awareness*intensity', () => {
    sys.registerEntity('guard', [{ type: 'sight', range: 50, fov: 360, sensitivity: 1 }]);
    sys.addStimulus({
      id: 'weak',
      type: 'sight',
      sourceId: 'p1',
      position: [40, 0, 0],
      intensity: 0.2,
      timestamp: 0,
    });
    sys.addStimulus({
      id: 'strong',
      type: 'sight',
      sourceId: 'p2',
      position: [5, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.update(0);
    const best = sys.getHighestPriority('guard');
    expect(best).not.toBeNull();
    expect(best!.id).toBe('strong');
  });

  it('mismatched sense type is ignored', () => {
    sys.registerEntity('guard', [{ type: 'smell', range: 50, fov: 360, sensitivity: 1 }]);
    sys.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [5, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.update(0);
    expect(sys.getPerceivedStimuli('guard')).toHaveLength(0);
  });

  it('removeStimulus removes from world', () => {
    sys.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [0, 0, 0],
      intensity: 1,
      timestamp: 0,
    });
    sys.removeStimulus('s1');
    expect(sys.getStimulusCount()).toBe(0);
  });
});
