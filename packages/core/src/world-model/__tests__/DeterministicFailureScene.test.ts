/**
 * Tests for the deterministic failure-discovery scene.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
  buildDeterministicFailureTrajectory,
  createDeterministicFailureDiscoveryScene,
  runDeterministicFailureDiscoveryScene,
  type DeterministicSceneAction,
} from '../DeterministicFailureScene';
import { hasReplayEvidence } from '../AdversarialTrajectory';

const placeProbe = (): DeterministicSceneAction => ({
  type: 'place-object',
  object: {
    id: 'probe-block',
    kind: 'block',
    center: { x: -0.6, y: 0.15, z: 0 },
    halfExtents: { x: 0.15, y: 0.15, z: 0.15 },
    movable: true,
  },
});

describe('createDeterministicFailureDiscoveryScene', () => {
  it('TRUE case: creates stable object placement and scene hash for a seed', () => {
    const a = createDeterministicFailureDiscoveryScene(7);
    const b = createDeterministicFailureDiscoveryScene(7);

    expect(a).toEqual(b);
    expect(a.objects.map((o) => o.id)).toEqual(['contact-pillar', 'target-pad']);
    expect(a.sceneHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it('FALSE case: different seeds produce different scene hashes', () => {
    const a = createDeterministicFailureDiscoveryScene(7);
    const b = createDeterministicFailureDiscoveryScene(8);

    expect(a.sceneHash).not.toBe(b.sceneHash);
  });
});

describe('runDeterministicFailureDiscoveryScene', () => {
  it('TRUE case: default scene logs placement, camera motion, contact, violation, and target contact', () => {
    const result = runDeterministicFailureDiscoveryScene();
    const eventTypes = result.events.map((event) => event.type);

    expect(eventTypes).toContain('object_placed');
    expect(eventTypes).toContain('camera_moved');
    expect(eventTypes).toContain('contact');
    expect(eventTypes).toContain('predicate_violation');
    expect(eventTypes).toContain('target_contact');
    expect(result.contactCount).toBe(2);
    expect(result.predicateViolationCount).toBe(1);
    expect(result.invalidActionCount).toBe(0);
  });

  it('TRUE case: same seed and actions produce byte-identical scene result', () => {
    const a = runDeterministicFailureDiscoveryScene(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, {
      seed: 99,
    });
    const b = runDeterministicFailureDiscoveryScene(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, {
      seed: 99,
    });

    expect(a).toEqual(b);
    expect(a.eventLogHash).toBe(b.eventLogHash);
  });

  it('FALSE case: blocked obstacle contact preserves the last safe object pose', () => {
    const result = runDeterministicFailureDiscoveryScene([
      placeProbe(),
      {
        type: 'move-object',
        objectId: 'probe-block',
        center: { x: 0, y: 0.15, z: 0 },
      },
    ]);

    const probe = result.objects.find((object) => object.id === 'probe-block');
    expect(probe?.center).toEqual({ x: -0.6, y: 0.15, z: 0 });
    expect(result.events.map((event) => event.type)).toEqual([
      'object_placed',
      'contact',
      'predicate_violation',
    ]);
  });

  it('TRUE case: target contact can be replayed without predicate violation', () => {
    const result = runDeterministicFailureDiscoveryScene([
      placeProbe(),
      {
        type: 'move-object',
        objectId: 'probe-block',
        center: { x: 0.55, y: 0.15, z: 0 },
      },
    ]);

    expect(result.events.map((event) => event.type)).toEqual([
      'object_placed',
      'object_moved',
      'target_contact',
    ]);
    expect(result.predicateViolationCount).toBe(0);
  });

  it('FALSE case: unknown object action is logged as invalid and does not create contact noise', () => {
    const result = runDeterministicFailureDiscoveryScene([
      {
        type: 'move-object',
        objectId: 'missing',
        center: { x: 0, y: 0.15, z: 0 },
      },
    ]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('invalid_action');
    expect(result.invalidActionCount).toBe(1);
    expect(result.contactCount).toBe(0);
  });
});

describe('buildDeterministicFailureTrajectory', () => {
  it('TRUE case: default actions produce replayable unresolved trajectory evidence', () => {
    const { result, trajectory } = buildDeterministicFailureTrajectory();

    expect(trajectory.status).toBe('unresolved');
    expect(trajectory.predicateScore.violation).toBe(1);
    expect(trajectory.priority.priority).toBeGreaterThan(0);
    expect(trajectory.actionTrace).toHaveLength(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS.length);
    expect(trajectory.observationTrace).toHaveLength(
      DEFAULT_DETERMINISTIC_FAILURE_ACTIONS.length
    );
    expect(trajectory.caelReceiptHash).toBe(result.eventLogHash);
    expect(hasReplayEvidence(trajectory)).toBe(true);
  });

  it('FALSE case: invalid action produces invalid trajectory with zero priority', () => {
    const { trajectory } = buildDeterministicFailureTrajectory([
      {
        type: 'move-object',
        objectId: 'missing',
        center: { x: 0, y: 0.15, z: 0 },
      },
    ]);

    expect(trajectory.status).toBe('invalid');
    expect(trajectory.predicateScore.invalidity).toBe(1);
    expect(trajectory.priority.priority).toBe(0);
  });

  it('TRUE case: no violation trajectory stays open with replay evidence', () => {
    const { trajectory } = buildDeterministicFailureTrajectory([
      placeProbe(),
      {
        type: 'move-object',
        objectId: 'probe-block',
        center: { x: 0.55, y: 0.15, z: 0 },
      },
    ]);

    expect(trajectory.status).toBe('open');
    expect(trajectory.predicateScore.violation).toBe(0);
    expect(trajectory.priority.priority).toBe(0);
    expect(hasReplayEvidence(trajectory)).toBe(true);
  });
});
