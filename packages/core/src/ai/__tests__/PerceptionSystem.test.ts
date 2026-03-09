import { describe, it, expect, beforeEach } from 'vitest';
import { PerceptionSystem, type SenseConfig, type Stimulus } from '../PerceptionSystem';

describe('PerceptionSystem', () => {
  let ps: PerceptionSystem;

  const sightSense: SenseConfig = { type: 'sight', range: 50, fov: 120, sensitivity: 1 };
  const hearingSense: SenseConfig = { type: 'hearing', range: 100, fov: 360, sensitivity: 1 };

  beforeEach(() => {
    ps = new PerceptionSystem();
  });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  it('registerEntity and addStimulus track counts', () => {
    ps.registerEntity('guard', [sightSense]);
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: { x: 10, y: 0, z: 0 },
      intensity: 0.8,
      timestamp: 0,
    });
    expect(ps.getStimulusCount()).toBe(1);
  });

  it('removeStimulus decreases count', () => {
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'p',
      position: { x: 0, y: 0, z: 0 },
      intensity: 1,
      timestamp: 0,
    });
    ps.removeStimulus('s1');
    expect(ps.getStimulusCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Perception Update — Range
  // ---------------------------------------------------------------------------

  it('perceives stimulus within range', () => {
    ps.registerEntity('guard', [sightSense]);
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: { x: 10, y: 0, z: 0 },
      intensity: 0.9,
      timestamp: 0,
    });
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(true);
  });

  it('does not perceive stimulus out of range', () => {
    ps.registerEntity('guard', [sightSense]); // range: 50
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: { x: 200, y: 0, z: 0 },
      intensity: 0.9,
      timestamp: 0,
    });
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // FOV Check
  // ---------------------------------------------------------------------------

  it('does not perceive stimulus behind entity (out of FOV)', () => {
    ps.registerEntity('guard', [sightSense]); // fov: 120
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }); // facing +X
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: { x: -10, y: 0, z: 0 },
      intensity: 1,
      timestamp: 0,
    }); // behind
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(false);
  });

  it('omnidirectional sense (hearing 360) perceives behind', () => {
    ps.registerEntity('guard', [hearingSense]); // fov: 360
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 's1',
      type: 'hearing',
      sourceId: 'player',
      position: { x: -10, y: 0, z: 0 },
      intensity: 0.8,
      timestamp: 0,
    });
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Self-Perception
  // ---------------------------------------------------------------------------

  it('entity does not perceive own stimuli', () => {
    ps.registerEntity('guard', [sightSense]);
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'guard',
      position: { x: 0, y: 0, z: 0 },
      intensity: 1,
      timestamp: 0,
    });
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Sense Type Matching
  // ---------------------------------------------------------------------------

  it('only matching sense types are perceived', () => {
    ps.registerEntity('guard', [sightSense]); // only sight
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 's1',
      type: 'hearing',
      sourceId: 'player',
      position: { x: 5, y: 0, z: 0 },
      intensity: 1,
      timestamp: 0,
    });
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Awareness Growth
  // ---------------------------------------------------------------------------

  it('awareness increases with repeated exposure', () => {
    ps.registerEntity('guard', [sightSense]);
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: { x: 5, y: 0, z: 0 },
      intensity: 0.5,
      timestamp: 0,
    });
    ps.update(1);
    const first = ps.getPerceivedStimuli('guard')[0].awareness;
    ps.update(2);
    const second = ps.getPerceivedStimuli('guard')[0].awareness;
    expect(second).toBeGreaterThanOrEqual(first);
  });

  // ---------------------------------------------------------------------------
  // Memory Expiry
  // ---------------------------------------------------------------------------

  it('memories decay after memoryDuration', () => {
    ps.registerEntity('guard', [sightSense], 5); // 5s memory
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: { x: 5, y: 0, z: 0 },
      intensity: 1,
      timestamp: 0,
    });
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(true);
    ps.removeStimulus('s1'); // remove the stimulus
    ps.update(100); // much later
    expect(ps.isAwareOf('guard', 's1')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getPerceivedStimuli returns all perceived', () => {
    ps.registerEntity('guard', [sightSense]);
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 'a',
      type: 'sight',
      sourceId: 'p1',
      position: { x: 5, y: 0, z: 0 },
      intensity: 0.5,
      timestamp: 0,
    });
    ps.addStimulus({
      id: 'b',
      type: 'sight',
      sourceId: 'p2',
      position: { x: 10, y: 0, z: 0 },
      intensity: 0.9,
      timestamp: 0,
    });
    ps.update(1);
    expect(ps.getPerceivedStimuli('guard').length).toBe(2);
  });

  it('getHighestPriority returns stimulus with highest awareness*intensity', () => {
    ps.registerEntity('guard', [sightSense]);
    ps.setEntityTransform('guard', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    ps.addStimulus({
      id: 'weak',
      type: 'sight',
      sourceId: 'p1',
      position: { x: 40, y: 0, z: 0 },
      intensity: 0.1,
      timestamp: 0,
    });
    ps.addStimulus({
      id: 'strong',
      type: 'sight',
      sourceId: 'p2',
      position: { x: 5, y: 0, z: 0 },
      intensity: 1,
      timestamp: 0,
    });
    ps.update(1);
    const highest = ps.getHighestPriority('guard');
    expect(highest).not.toBeNull();
    expect(highest!.id).toBe('strong');
  });

  it('getHighestPriority returns null for no perceived stimuli', () => {
    ps.registerEntity('guard', [sightSense]);
    expect(ps.getHighestPriority('guard')).toBeNull();
  });
});
