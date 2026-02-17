import { describe, it, expect, beforeEach } from 'vitest';
import { ComboTracker } from '../ComboTracker';
import type { ComboDefinition } from '../ComboTracker';

function combo(id: string, inputs: string[], delay = 500): ComboDefinition {
  return {
    id,
    name: id,
    steps: inputs.map(input => ({ input, maxDelay: delay })),
    reward: `${id}_reward`,
  };
}

describe('ComboTracker', () => {
  let tracker: ComboTracker;

  beforeEach(() => { tracker = new ComboTracker(); });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  it('registerCombo adds a combo definition', () => {
    tracker.registerCombo(combo('fireball', ['down', 'right', 'punch']));
    // No error thrown is enough; we verify via getCompletedCombos
  });

  // ---------------------------------------------------------------------------
  // Input Processing
  // ---------------------------------------------------------------------------

  it('pushInput returns null when no combo completes', () => {
    tracker.registerCombo(combo('abc', ['a', 'b', 'c']));
    const result = tracker.pushInput('a', 0);
    expect(result).toBeNull();
  });

  it('detects completed combo', () => {
    tracker.registerCombo(combo('abc', ['a', 'b', 'c']));
    tracker.pushInput('a', 0);
    tracker.pushInput('b', 100);
    const result = tracker.pushInput('c', 200);
    expect(result).toBe('abc_reward');
  });

  it('getCompletedCombos returns reward after completion', () => {
    tracker.registerCombo(combo('abc', ['a', 'b', 'c']));
    tracker.pushInput('a', 0);
    tracker.pushInput('b', 100);
    tracker.pushInput('c', 200);
    const completed = tracker.getCompletedCombos();
    expect(completed).toContain('abc_reward');
  });

  it('wrong order does not complete', () => {
    tracker.registerCombo(combo('abc', ['a', 'b', 'c']));
    tracker.pushInput('c', 0);
    tracker.pushInput('b', 100);
    tracker.pushInput('a', 200);
    const completed = tracker.getCompletedCombos();
    expect(completed).not.toContain('abc_reward');
  });

  it('incomplete sequence does not fire', () => {
    tracker.registerCombo(combo('full', ['x', 'y', 'z']));
    tracker.pushInput('x', 0);
    tracker.pushInput('y', 100);
    expect(tracker.getCompletedCombos()).not.toContain('full_reward');
  });

  // ---------------------------------------------------------------------------
  // Timing
  // ---------------------------------------------------------------------------

  it('combo times out if delay exceeded', () => {
    tracker.registerCombo(combo('quick', ['a', 'b'], 100));
    tracker.pushInput('a', 0);
    tracker.tick(200); // expire
    const result = tracker.pushInput('b', 200);
    expect(result).toBeNull();
  });

  it('combo succeeds within timing window', () => {
    tracker.registerCombo(combo('quick', ['a', 'b'], 500));
    tracker.pushInput('a', 0);
    const result = tracker.pushInput('b', 100);
    expect(result).toBe('quick_reward');
  });

  // ---------------------------------------------------------------------------
  // Active Combos
  // ---------------------------------------------------------------------------

  it('getActiveComboCount tracks in-progress combos', () => {
    tracker.registerCombo(combo('abc', ['a', 'b', 'c']));
    tracker.pushInput('a', 0);
    expect(tracker.getActiveComboCount()).toBeGreaterThan(0);
  });

  it('active count drops after completion', () => {
    tracker.registerCombo(combo('ab', ['a', 'b']));
    tracker.pushInput('a', 0);
    tracker.pushInput('b', 100);
    expect(tracker.getActiveComboCount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Single-step combos
  // ---------------------------------------------------------------------------

  it('single-step combo fires immediately', () => {
    tracker.registerCombo(combo('instant', ['x']));
    const result = tracker.pushInput('x', 0);
    expect(result).toBe('instant_reward');
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  it('reset clears active and completed', () => {
    tracker.registerCombo(combo('abc', ['a', 'b', 'c']));
    tracker.pushInput('a', 0);
    tracker.reset();
    expect(tracker.getActiveComboCount()).toBe(0);
    expect(tracker.getCompletedCombos()).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Multi-combo
  // ---------------------------------------------------------------------------

  it('multiple combos can be registered', () => {
    tracker.registerCombo(combo('ab', ['a', 'b']));
    tracker.registerCombo(combo('cd', ['c', 'd']));
    tracker.pushInput('c', 0);
    const result = tracker.pushInput('d', 100);
    expect(result).toBe('cd_reward');
  });
});
