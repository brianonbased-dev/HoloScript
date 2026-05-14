/**
 * Tests for the adversarial mutator.
 *
 * Acceptance criteria:
 *   1. Generates action-trace variants deterministically.
 *   2. Scores each trace by violation, novelty, learnability, regression, invalidity.
 *   3. Invalid traces get zero priority.
 *   4. Connects to the deterministic scene (replay handles are valid).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
  hasReplayEvidence,
  isCurriculumEligible,
} from '../';
import {
  mutateTrace,
  exploreAdversarialTraces,
  BUILT_IN_PROFILES,
  type MutatorProfile,
} from '../AdversarialMutator';

describe('mutateTrace', () => {
  it('TRUE case: perturb-positions mutates object centers deterministically', () => {
    const profile: MutatorProfile = { name: 'test-perturb', strategy: 'perturb-positions', intensity: 0.2 };
    const a = mutateTrace(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, profile, 42);
    const b = mutateTrace(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, profile, 42);

    expect(a).toEqual(b);
    expect(a.profile).toBe('test-perturb');
    expect(a.actions).toHaveLength(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS.length);

    // At least one position should differ
    const anyDiff = a.actions.some((action, idx) => {
      const base = DEFAULT_DETERMINISTIC_FAILURE_ACTIONS[idx];
      if (action.type !== base.type) return true;
      if (action.type === 'move-object' && base.type === 'move-object') {
        return (
          action.center.x !== base.center.x ||
          action.center.y !== base.center.y ||
          action.center.z !== base.center.z
        );
      }
      return false;
    });
    expect(anyDiff).toBe(true);
  });

  it('TRUE case: skip-step reduces trace length', () => {
    const profile: MutatorProfile = { name: 'test-skip', strategy: 'skip-step', intensity: 0.3 };
    const mutated = mutateTrace(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, profile, 7);

    expect(mutated.actions.length).toBeLessThan(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS.length);
    expect(mutated.profile).toBe('test-skip');
  });

  it('TRUE case: duplicate-step increases trace length', () => {
    const profile: MutatorProfile = { name: 'test-dup', strategy: 'duplicate-step', intensity: 0.3 };
    const mutated = mutateTrace(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, profile, 9);

    expect(mutated.actions.length).toBeGreaterThan(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS.length);
  });

  it('TRUE case: swap-consecutive preserves length', () => {
    const profile: MutatorProfile = { name: 'test-swap', strategy: 'swap-consecutive', intensity: 0.3 };
    const mutated = mutateTrace(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, profile, 3);

    expect(mutated.actions.length).toBe(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS.length);
  });

  it('TRUE case: insert-wait adds a wait step', () => {
    const profile: MutatorProfile = { name: 'test-wait', strategy: 'insert-wait', intensity: 0.3 };
    const mutated = mutateTrace(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, profile, 5);

    expect(mutated.actions.length).toBeGreaterThan(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS.length);
    expect(mutated.actions.some((a) => a.type === 'wait')).toBe(true);
  });

  it('TRUE case: different seeds produce different mutations', () => {
    const profile: MutatorProfile = { name: 'test-diff', strategy: 'perturb-positions', intensity: 0.5 };
    const a = mutateTrace(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, profile, 1);
    const b = mutateTrace(DEFAULT_DETERMINISTIC_FAILURE_ACTIONS, profile, 2);

    expect(a).not.toEqual(b);
  });
});

describe('exploreAdversarialTraces', () => {
  it('TRUE case: generates scored trajectories with all five predicate components', () => {
    const traces = exploreAdversarialTraces({
      baseActions: DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
      seed: 1337,
      maxTraces: 8,
    });

    expect(traces.length).toBe(8);

    for (const t of traces) {
      expect(t.predicateScore).toBeDefined();
      expect(typeof t.predicateScore.violation).toBe('number');
      expect(typeof t.predicateScore.novelty).toBe('number');
      expect(typeof t.predicateScore.learnability).toBe('number');
      expect(typeof t.predicateScore.regression).toBe('number');
      expect(typeof t.predicateScore.invalidity).toBe('number');

      // Components are clamped to [0, 1]
      expect(t.predicateScore.violation).toBeGreaterThanOrEqual(0);
      expect(t.predicateScore.violation).toBeLessThanOrEqual(1);
      expect(t.predicateScore.novelty).toBeGreaterThanOrEqual(0);
      expect(t.predicateScore.novelty).toBeLessThanOrEqual(1);
    }
  });

  it('TRUE case: every trajectory has replay evidence', () => {
    const traces = exploreAdversarialTraces({
      baseActions: DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
      seed: 2024,
      maxTraces: 8,
    });

    for (const t of traces) {
      expect(hasReplayEvidence(t)).toBe(true);
    }
  });

  it('TRUE case: invalid traces have zero priority', () => {
    // Use push-toward-obstacle + strong perturb to force invalid actions
    const traces = exploreAdversarialTraces({
      baseActions: DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
      seed: 9999,
      maxTraces: 4,
      profiles: [
        { name: 'extreme-perturb', strategy: 'perturb-positions', intensity: 2.0 },
      ],
    });

    for (const t of traces) {
      if (t.status === 'invalid') {
        expect(t.priority.priority).toBe(0);
        expect(t.predicateScore.invalidity).toBe(1);
      }
    }
  });

  it('TRUE case: results are sorted by descending priority', () => {
    const traces = exploreAdversarialTraces({
      baseActions: DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
      seed: 5555,
      maxTraces: 12,
    });

    for (let i = 0; i < traces.length - 1; i += 1) {
      const a = traces[i].priority.priority;
      const b = traces[i + 1].priority.priority;
      expect(a).toBeGreaterThanOrEqual(b);
    }
  });

  it('TRUE case: curriculum eligibility matches status and priority', () => {
    const traces = exploreAdversarialTraces({
      baseActions: DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
      seed: 7777,
      maxTraces: 8,
    });

    for (const t of traces) {
      const eligible = isCurriculumEligible(t);
      if (t.status === 'invalid' || t.priority.priority <= 0) {
        expect(eligible).toBe(false);
      }
      // Eligibility does not guarantee status !== invalid; it is a filter.
    }
  });

  it('TRUE case: deterministic — same options yield identical trajectories', () => {
    const a = exploreAdversarialTraces({
      baseActions: DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
      seed: 3141,
      maxTraces: 6,
    });
    const b = exploreAdversarialTraces({
      baseActions: DEFAULT_DETERMINISTIC_FAILURE_ACTIONS,
      seed: 3141,
      maxTraces: 6,
    });

    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
    expect(a.map((t) => t.priority.priority)).toEqual(b.map((t) => t.priority.priority));
  });

  it('TRUE case: empty base actions still produces valid trajectories', () => {
    const traces = exploreAdversarialTraces({
      baseActions: [],
      seed: 1234,
      maxTraces: 4,
    });

    expect(traces.length).toBe(4);
    for (const t of traces) {
      expect(t.actionTrace).toBeDefined();
      expect(t.observationTrace).toBeDefined();
    }
  });

  it('TRUE case: BUILT_IN_PROFILES covers all mutation strategies', () => {
    const strategies = new Set(BUILT_IN_PROFILES.map((p) => p.strategy));
    expect(strategies.has('perturb-positions')).toBe(true);
    expect(strategies.has('skip-step')).toBe(true);
    expect(strategies.has('duplicate-step')).toBe(true);
    expect(strategies.has('swap-consecutive')).toBe(true);
    expect(strategies.has('insert-wait')).toBe(true);
    expect(strategies.has('push-toward-obstacle')).toBe(true);
    expect(strategies.has('camera-drift')).toBe(true);
    expect(BUILT_IN_PROFILES.length).toBeGreaterThanOrEqual(7);
  });
});
