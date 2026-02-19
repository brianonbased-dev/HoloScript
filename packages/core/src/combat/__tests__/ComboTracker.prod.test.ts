/**
 * ComboTracker — Production Test Suite
 *
 * Covers: combo registration, input sequence matching, timing,
 * completion, timeout expiry, multi-combo, reset.
 */
import { describe, it, expect } from 'vitest';
import { ComboTracker, type ComboDefinition } from '../ComboTracker';

const HADOUKEN: ComboDefinition = {
  id: 'hadouken', name: 'Hadouken',
  steps: [
    { input: 'down', maxDelay: 500 },
    { input: 'forward', maxDelay: 500 },
    { input: 'punch', maxDelay: 500 },
  ],
  reward: 'fireball',
};

const UPPERCUT: ComboDefinition = {
  id: 'uppercut', name: 'Uppercut',
  steps: [
    { input: 'forward', maxDelay: 300 },
    { input: 'punch', maxDelay: 300 },
  ],
  reward: 'shoryuken',
};

describe('ComboTracker — Production', () => {
  // ─── Registration ─────────────────────────────────────────────────
  it('registerCombo registers without error', () => {
    const ct = new ComboTracker();
    ct.registerCombo(HADOUKEN);
    // No crash
    expect(ct.getActiveComboCount()).toBe(0);
  });

  // ─── Combo Completion ─────────────────────────────────────────────
  it('completes combo on correct sequence', () => {
    const ct = new ComboTracker();
    ct.registerCombo(HADOUKEN);
    ct.pushInput('down', 0);
    ct.pushInput('forward', 100);
    const result = ct.pushInput('punch', 200);
    expect(result).toBe('fireball');
  });

  it('wrong input does not complete combo', () => {
    const ct = new ComboTracker();
    ct.registerCombo(HADOUKEN);
    ct.pushInput('down', 0);
    ct.pushInput('forward', 100);
    const result = ct.pushInput('kick', 200); // wrong
    expect(result).toBeNull();
  });

  // ─── Timing ───────────────────────────────────────────────────────
  it('combo fails if input too slow', () => {
    const ct = new ComboTracker();
    ct.registerCombo(HADOUKEN);
    ct.pushInput('down', 0);
    ct.pushInput('forward', 1000); // 1s > 500ms maxDelay
    const result = ct.pushInput('punch', 1100);
    expect(result).toBeNull();
  });

  // ─── Multi-Combo ──────────────────────────────────────────────────
  it('tracks multiple combos simultaneously', () => {
    const ct = new ComboTracker();
    ct.registerCombo(HADOUKEN);
    ct.registerCombo(UPPERCUT);
    ct.pushInput('forward', 0); // starts uppercut
    ct.pushInput('punch', 100); // completes uppercut
    expect(ct.getCompletedCombos()).toContain('shoryuken');
  });

  // ─── Tick Cleanup ─────────────────────────────────────────────────
  it('tick cleans up timed-out combo states', () => {
    const ct = new ComboTracker();
    ct.registerCombo(HADOUKEN);
    ct.pushInput('down', 0);   // starts hadouken chain
    expect(ct.getActiveComboCount()).toBe(1);
    ct.tick(1000); // way past maxDelay
    expect(ct.getActiveComboCount()).toBe(0);
  });

  // ─── Reset ────────────────────────────────────────────────────────
  it('reset clears all state', () => {
    const ct = new ComboTracker();
    ct.registerCombo(HADOUKEN);
    ct.pushInput('down', 0);
    ct.reset();
    expect(ct.getActiveComboCount()).toBe(0);
    expect(ct.getCompletedCombos().length).toBe(0);
  });

  // ─── Single-Step Combo ────────────────────────────────────────────
  it('single-step combo completes immediately', () => {
    const ct = new ComboTracker();
    ct.registerCombo({
      id: 'slash', name: 'Slash',
      steps: [{ input: 'attack', maxDelay: 500 }],
      reward: 'slash_hit',
    });
    const result = ct.pushInput('attack', 0);
    expect(result).toBe('slash_hit');
  });
});
