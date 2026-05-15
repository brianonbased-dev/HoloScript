/**
 * Tests for the deterministic humanoid rock-throw replay fixture.
 */

import { describe, expect, it } from 'vitest';
import { hasReplayEvidence } from '../AdversarialTrajectory';
import {
  buildHumanoidRockThrowTrajectory,
  createHumanoidRockThrowScene,
  runHumanoidRockThrowReplay,
} from '../HumanoidRockThrowScene';

describe('createHumanoidRockThrowScene', () => {
  it('TRUE case: creates stable flagship scene objects and scene hash for a seed', () => {
    const a = createHumanoidRockThrowScene(4242);
    const b = createHumanoidRockThrowScene(4242);

    expect(a).toEqual(b);
    expect(a.sceneId).toBe('humanoid-rock-throw-v1');
    expect(a.objects.map((object) => object.id)).toEqual([
      'avatar',
      'right-hand',
      'rock',
      'target',
      'stage',
    ]);
    expect(a.sceneHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });
});

describe('runHumanoidRockThrowReplay', () => {
  it('TRUE case: emits semantic replay events for grab, release, arc, and impact', () => {
    const result = runHumanoidRockThrowReplay({ seed: 4242 });
    const eventTypes = result.events.map((event) => event.type);

    expect(eventTypes).toContain('grab_constraint_attached');
    expect(eventTypes).toContain('release');
    expect(eventTypes.filter((type) => type === 'ballistic_sample')).toHaveLength(3);
    expect(eventTypes).toContain('target_contact');
    expect(result.contactCount).toBe(1);
    expect(result.predicateViolationCount).toBe(0);
    expect(result.invalidActionCount).toBe(0);
  });

  it('TRUE case: same seed produces byte-identical replay receipts', () => {
    const a = runHumanoidRockThrowReplay({ seed: 99 });
    const b = runHumanoidRockThrowReplay({ seed: 99 });

    expect(a).toEqual(b);
    expect(a.eventLogHash).toBe(b.eventLogHash);
  });
});

describe('buildHumanoidRockThrowTrajectory', () => {
  it('TRUE case: produces replayable trajectory evidence for the flagship scenario', () => {
    const { result, trajectory } = buildHumanoidRockThrowTrajectory({ seed: 4242 });

    expect(trajectory.status).toBe('open');
    expect(trajectory.caelReceiptHash).toBe(result.eventLogHash);
    expect(trajectory.replayHandle.replayCommand).toContain(
      'holoscript world-model replay --scene humanoid-rock-throw-v1'
    );
    expect(hasReplayEvidence(trajectory)).toBe(true);
  });
});
