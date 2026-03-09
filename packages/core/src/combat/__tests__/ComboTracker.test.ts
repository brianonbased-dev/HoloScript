import { describe, it, expect, beforeEach } from 'vitest';
import { ComboTracker, type ComboDefinition } from '../ComboTracker';

const hadouken: ComboDefinition = {
  id: 'hadouken',
  name: 'Hadouken',
  steps: [
    { input: 'down', maxDelay: 200 },
    { input: 'forward', maxDelay: 200 },
    { input: 'punch', maxDelay: 200 },
  ],
  reward: 'fireball',
};

const uppercut: ComboDefinition = {
  id: 'uppercut',
  name: 'Uppercut',
  steps: [
    { input: 'forward', maxDelay: 150 },
    { input: 'punch', maxDelay: 150 },
  ],
  reward: 'rising_punch',
};

describe('ComboTracker', () => {
  let tracker: ComboTracker;

  beforeEach(() => {
    tracker = new ComboTracker();
    tracker.registerCombo(hadouken);
    tracker.registerCombo(uppercut);
  });

  it('no reward for random input', () => {
    expect(tracker.pushInput('kick', 0)).toBeNull();
  });

  it('single-input combo triggers immediately', () => {
    tracker.registerCombo({
      id: 'quick',
      name: 'Quick',
      reward: 'flash',
      steps: [{ input: 'snap', maxDelay: 100 }],
    });
    expect(tracker.pushInput('snap', 0)).toBe('flash');
  });

  it('completes hadouken combo in sequence', () => {
    const t = new ComboTracker();
    t.registerCombo(hadouken); // Only hadouken, no uppercut interference
    expect(t.pushInput('down', 0)).toBeNull();
    expect(t.pushInput('forward', 100)).toBeNull();
    expect(t.pushInput('punch', 200)).toBe('fireball');
  });

  it('fails combo if timing window exceeded', () => {
    const t = new ComboTracker();
    t.registerCombo(hadouken);
    t.pushInput('down', 0);
    t.pushInput('forward', 300); // 300 > 200ms maxDelay
    expect(t.pushInput('punch', 400)).toBeNull();
  });

  it('completes uppercut combo', () => {
    tracker.pushInput('forward', 0);
    expect(tracker.pushInput('punch', 100)).toBe('rising_punch');
  });

  it('tick cleans up timed-out combos', () => {
    tracker.pushInput('down', 0); // Starts hadouken
    expect(tracker.getActiveComboCount()).toBe(1);
    tracker.tick(500); // Way past maxDelay
    expect(tracker.getActiveComboCount()).toBe(0);
  });

  it('reset clears all state', () => {
    tracker.pushInput('down', 0);
    tracker.reset();
    expect(tracker.getActiveComboCount()).toBe(0);
    expect(tracker.getCompletedCombos().length).toBe(0);
  });

  it('getCompletedCombos returns rewards from last input', () => {
    tracker.pushInput('forward', 0);
    tracker.pushInput('punch', 100);
    expect(tracker.getCompletedCombos()).toContain('rising_punch');
  });

  it('multiple combos can track simultaneously', () => {
    tracker.pushInput('down', 0); // starts hadouken
    tracker.pushInput('forward', 100); // advances hadouken, starts uppercut
    expect(tracker.getActiveComboCount()).toBeGreaterThanOrEqual(1);
  });
});
