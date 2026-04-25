/**
 * PerceptionSystem — Production Test Suite
 *
 * Covers: entity registration, stimulus management, sense types
 * (sight/hearing/smell), range/FOV checks, memory/decay, queries.
 */
import { describe, it, expect } from 'vitest';
import { PerceptionSystem, type SenseConfig, type Stimulus } from '../PerceptionSystem';

function sightSense(range = 50, fov = 360, sensitivity = 1): SenseConfig {
  return { type: 'sight', range, fov, sensitivity };
}

function stim(
  id: string,
  type: 'sight' | 'hearing' | 'smell' = 'sight',
  x = 10,
  y = 0,
  z = 0,
  intensity = 0.8
): Stimulus {
  return { id, type, sourceId: `src-${id}`, position: [x, y, z], intensity, timestamp: 0 };
}

describe('PerceptionSystem — Production', () => {
  // ─── Registration ─────────────────────────────────────────────────
  it('registerEntity + getStimulusCount', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense()]);
    ps.addStimulus(stim('s1'));
    expect(ps.getStimulusCount()).toBe(1);
  });

  // ─── Detection Within Range ───────────────────────────────────────
  it('detects stimulus within range', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense(50)]);
    ps.addStimulus(stim('s1', 'sight', 10, 0, 0));
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(true);
  });

  it('does not detect stimulus out of range', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense(5)]);
    ps.addStimulus(stim('s1', 'sight', 100, 0, 0));
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(false);
  });

  // ─── Sense Type Matching ──────────────────────────────────────────
  it('only detects matching sense type', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense()]);
    ps.addStimulus(stim('s1', 'hearing', 5, 0, 0)); // hearing stimulus but only sight sense
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(false);
  });

  // ─── FOV Check ────────────────────────────────────────────────────
  it('FOV-limited sense detects in front', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense(50, 90)], 10); // 90° FOV
    ps.setEntityTransform('guard', [0, 0, 0], [1, 0, 0]); // facing +X
    ps.addStimulus(stim('ahead', 'sight', 10, 0, 0)); // directly ahead
    ps.update(1);
    expect(ps.isAwareOf('guard', 'ahead')).toBe(true);
  });

  it('FOV-limited sense misses behind', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense(50, 90)], 10);
    ps.setEntityTransform('guard', [0, 0, 0], [1, 0, 0]); // facing +X
    ps.addStimulus(stim('behind', 'sight', -10, 0, 0)); // behind
    ps.update(1);
    expect(ps.isAwareOf('guard', 'behind')).toBe(false);
  });

  // ─── Self-detection ───────────────────────────────────────────────
  it('entity does not sense own stimuli', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense()]);
    const s: Stimulus = {
      id: 'self',
      type: 'sight',
      sourceId: 'guard',
      position: [0, 0, 0],
      intensity: 1,
      timestamp: 0,
    };
    ps.addStimulus(s);
    ps.update(1);
    expect(ps.isAwareOf('guard', 'self')).toBe(false);
  });

  // ─── Memory Decay ─────────────────────────────────────────────────
  it('memory expires after memoryDuration', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense()], 5); // 5 second memory
    ps.addStimulus(stim('s1'));
    ps.update(1);
    expect(ps.isAwareOf('guard', 's1')).toBe(true);
    ps.removeStimulus('s1');
    ps.update(100); // way past memory duration
    expect(ps.isAwareOf('guard', 's1')).toBe(false);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getPerceivedStimuli returns all perceived', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense()]);
    ps.addStimulus(stim('a', 'sight', 5, 0, 0));
    ps.addStimulus(stim('b', 'sight', 8, 0, 0));
    ps.update(1);
    expect(ps.getPerceivedStimuli('guard').length).toBe(2);
  });

  it('getHighestPriority returns top awareness', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [sightSense(100, 360, 1)]);
    ps.addStimulus(stim('far', 'sight', 40, 0, 0, 0.2));
    ps.addStimulus(stim('near', 'sight', 2, 0, 0, 1.0));
    ps.update(1);
    const top = ps.getHighestPriority('guard');
    expect(top).not.toBeNull();
    expect(top!.id).toBe('near');
  });

  it('removeStimulus removes from world', () => {
    const ps = new PerceptionSystem();
    ps.addStimulus(stim('s1'));
    ps.removeStimulus('s1');
    expect(ps.getStimulusCount()).toBe(0);
  });
});
