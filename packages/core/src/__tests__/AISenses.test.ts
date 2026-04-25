import { describe, it, expect } from 'vitest';
import { PerceptionSystem } from '@holoscript/framework/ai';
import { SteeringBehaviors, type SteeringAgent } from '@holoscript/framework/ai';
import { InfluenceMap } from '@holoscript/framework/ai';

describe('Cycle 148: AI Senses', () => {
  // -------------------------------------------------------------------------
  // PerceptionSystem
  // -------------------------------------------------------------------------

  it('should detect stimuli within FOV and range', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('guard', [
      { type: 'sight', range: 20, fov: 90, sensitivity: 1 },
      { type: 'hearing', range: 30, fov: 360, sensitivity: 0.8 },
    ]);
    ps.setEntityTransform('guard', [0, 0, 0], [0, 0, 1]);

    // Stimulus in front (Z+) — should be seen
    ps.addStimulus({
      id: 's1',
      type: 'sight',
      sourceId: 'player',
      position: [0, 0, 10],
      intensity: 1,
      timestamp: 0,
    });
    // Stimulus behind — should NOT be seen (90° FOV)
    ps.addStimulus({
      id: 's2',
      type: 'sight',
      sourceId: 'player2',
      position: [0, 0, -10],
      intensity: 1,
      timestamp: 0,
    });
    // Stimulus far away — heard omnidirectionally
    ps.addStimulus({
      id: 's3',
      type: 'hearing',
      sourceId: 'noise',
      position: [25, 0, 0],
      intensity: 1,
      timestamp: 0,
    });

    ps.update(0);

    const perceived = ps.getPerceivedStimuli('guard');
    expect(perceived.some((s) => s.id === 's1')).toBe(true); // Seen
    expect(perceived.some((s) => s.id === 's2')).toBe(false); // Behind
    expect(perceived.some((s) => s.id === 's3')).toBe(true); // Heard
  });

  it('should expire memories after duration', () => {
    const ps = new PerceptionSystem();
    ps.registerEntity('e1', [{ type: 'hearing', range: 50, fov: 360, sensitivity: 1 }], 5);
    ps.addStimulus({
      id: 'sound',
      type: 'hearing',
      sourceId: 'x',
      position: [1, 0, 0],
      intensity: 1,
      timestamp: 0,
    });

    ps.update(0);
    expect(ps.isAwareOf('e1', 'sound')).toBe(true);

    ps.removeStimulus('sound');
    ps.update(10); // 10s later, memory should expire (duration = 5)
    expect(ps.isAwareOf('e1', 'sound')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // SteeringBehaviors
  // -------------------------------------------------------------------------

  it('should seek toward and flee from targets', () => {
    const agent: SteeringAgent = {
      position: [0, 0, 0],
      velocity: [0, 0, 0 ],
      maxSpeed: 5,
      maxForce: 3,
      mass: 1,
    };

    const seekForce = SteeringBehaviors.seek(agent, [10, 0, 0]);
    expect(seekForce[0]).toBeGreaterThan(0); // Toward +X

    const fleeForce = SteeringBehaviors.flee(agent, [10, 0, 0]);
    expect(fleeForce[0]).toBeLessThan(0); // Away from +X
  });

  it('should arrive and slow down near target', () => {
    const agent: SteeringAgent = {
      position: [0, 0, 0],
      velocity: [2, 0, 0 ],
      maxSpeed: 5,
      maxForce: 3,
      mass: 1,
    };

    const farForce = SteeringBehaviors.arrive(agent, [100, 0, 0], 10);
    const nearForce = SteeringBehaviors.arrive(agent, [3, 0, 0], 10);

    // Near force should be weaker (slowing down)
    expect(Math.abs(nearForce[0])).toBeLessThan(Math.abs(farForce[0]));
  });

  it('should produce flock forces for a group', () => {
    const agents: SteeringAgent[] = Array.from({ length: 5 }, (_, i) => ({
      position: [i * 2, 0, 0],
      velocity: [1, 0, 0 ],
      maxSpeed: 5,
      maxForce: 3,
      mass: 1,
    }));

    const force = SteeringBehaviors.flock(agents[2], agents, {
      separationWeight: 1.5,
      alignmentWeight: 1,
      cohesionWeight: 1,
      neighborRadius: 10,
    });

    // Flock force should be non-zero since there are neighbors
    const mag = Math.sqrt(force[0] ** 2 + force[1] ** 2 + force[2] ** 2);
    expect(mag).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // InfluenceMap
  // -------------------------------------------------------------------------

  it('should stamp and propagate influence', () => {
    const im = new InfluenceMap({
      width: 20,
      height: 20,
      cellSize: 1,
      decayRate: 0.1,
      propagationRate: 0.3,
      maxValue: 100,
    });
    im.addLayer('danger');
    im.stampRadius('danger', 10, 10, 3, 50);

    expect(im.getInfluence('danger', 10, 10)).toBeGreaterThan(0);
    expect(im.getInfluence('danger', 0, 0)).toBe(0); // Far cell untouched

    const before = im.getInfluence('danger', 10, 10);
    im.update(); // Propagate + decay
    const after = im.getInfluence('danger', 10, 10);
    expect(after).toBeLessThan(before); // Decayed

    // Neighbors should now have some influence
    expect(im.getInfluence('danger', 11, 10)).toBeGreaterThan(0);
  });

  it('should find the max-value cell', () => {
    const im = new InfluenceMap({
      width: 10,
      height: 10,
      cellSize: 1,
      decayRate: 0,
      propagationRate: 0,
      maxValue: 100,
    });
    im.addLayer('heat');
    im.setInfluence('heat', 7, 3, 42);

    const max = im.getMaxCell('heat');
    expect(max[0]).toBe(7);
    expect(max[1]).toBe(3);
    expect(max.value).toBe(42);
  });
});
