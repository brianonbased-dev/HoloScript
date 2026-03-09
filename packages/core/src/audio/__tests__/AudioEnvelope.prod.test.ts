/**
 * AudioEnvelope — Production Test Suite
 *
 * Covers: construction (defaults), noteOn/noteOff transitions,
 * process stages (attack→decay→sustain→release→idle), level range,
 * isActive, setConfig/getConfig, curve types (linear/exp/log).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioEnvelope } from '../AudioEnvelope';

function step(env: AudioEnvelope, dt: number, steps: number) {
  for (let i = 0; i < steps; i++) env.process(dt);
}

describe('AudioEnvelope — Production', () => {
  let env: AudioEnvelope;

  beforeEach(() => {
    env = new AudioEnvelope({ attack: 0.1, decay: 0.1, sustain: 0.7, release: 0.2 });
  });

  // ─── Initial state ────────────────────────────────────────────────
  it('starts idle at level 0', () => {
    expect(env.getStage()).toBe('idle');
    expect(env.getLevel()).toBe(0);
  });

  it('isActive is false when idle', () => {
    expect(env.isActive()).toBe(false);
  });

  it('process in idle returns 0', () => {
    expect(env.process(0.016)).toBe(0);
  });

  // ─── noteOn ───────────────────────────────────────────────────────
  it('noteOn switches to attack stage', () => {
    env.noteOn();
    expect(env.getStage()).toBe('attack');
  });

  it('attack level rises toward 1', () => {
    env.noteOn();
    env.process(0.05); // half of 0.1s attack
    expect(env.getLevel()).toBeGreaterThan(0);
    expect(env.getLevel()).toBeLessThanOrEqual(1);
  });

  it('isActive is true after noteOn', () => {
    env.noteOn();
    expect(env.isActive()).toBe(true);
  });

  // ─── attack → decay ───────────────────────────────────────────────
  it('transitions from attack to decay', () => {
    env.noteOn();
    step(env, 0.016, 10); // >= 0.1s attack
    expect(env.getStage()).toBe('decay');
  });

  // ─── decay → sustain ──────────────────────────────────────────────
  it('transitions from decay to sustain', () => {
    env.noteOn();
    step(env, 0.016, 16); // attack done, then decay done
    expect(env.getStage()).toBe('sustain');
  });

  it('sustain holds at sustain level', () => {
    env.noteOn();
    step(env, 0.016, 20); // well past decay
    expect(env.getStage()).toBe('sustain');
    expect(env.getLevel()).toBeCloseTo(0.7, 1);
  });

  // ─── noteOff → release → idle ─────────────────────────────────────
  it('noteOff in sustain transitions to release', () => {
    env.noteOn();
    step(env, 0.016, 20);
    env.noteOff();
    expect(env.getStage()).toBe('release');
  });

  it('release level decreases from sustain to 0', () => {
    env.noteOn();
    step(env, 0.016, 20); // sustain
    env.noteOff();
    env.process(0.1); // half of 0.2s release
    expect(env.getLevel()).toBeLessThan(0.7);
    expect(env.getLevel()).toBeGreaterThanOrEqual(0);
  });

  it('transitions to idle after release completes', () => {
    env.noteOn();
    step(env, 0.016, 20);
    env.noteOff();
    step(env, 0.016, 20); // >= 0.2s release
    expect(env.getStage()).toBe('idle');
    expect(env.getLevel()).toBe(0);
    expect(env.isActive()).toBe(false);
  });

  // ─── noteOff in idle is safe ──────────────────────────────────────
  it('noteOff in idle stays idle', () => {
    env.noteOff();
    expect(env.getStage()).toBe('idle');
  });

  // ─── setConfig / getConfig ────────────────────────────────────────
  it('setConfig updates fields', () => {
    env.setConfig({ sustain: 0.5 });
    expect(env.getConfig().sustain).toBeCloseTo(0.5);
  });

  it('getConfig returns copy of config', () => {
    const cfg = env.getConfig();
    expect(cfg.attack).toBeCloseTo(0.1);
    expect(cfg.decay).toBeCloseTo(0.1);
    expect(cfg.sustain).toBeCloseTo(0.7);
    expect(cfg.release).toBeCloseTo(0.2);
  });

  // ─── Curve types ──────────────────────────────────────────────────
  it('exponential curve produces different level than linear at midpoint', () => {
    const linear = new AudioEnvelope(
      { attack: 1, decay: 0.001, sustain: 1, release: 0.001 },
      'linear'
    );
    const expo = new AudioEnvelope(
      { attack: 1, decay: 0.001, sustain: 1, release: 0.001 },
      'exponential'
    );
    linear.noteOn();
    expo.noteOn();
    linear.process(0.5);
    expo.process(0.5);
    // exponential at t=0.5 → t² = 0.25, linear → 0.5
    expect(expo.getLevel()).toBeLessThan(linear.getLevel());
  });

  it('logarithmic curve produces higher level than linear at midpoint', () => {
    const linear = new AudioEnvelope(
      { attack: 1, decay: 0.001, sustain: 1, release: 0.001 },
      'linear'
    );
    const log = new AudioEnvelope(
      { attack: 1, decay: 0.001, sustain: 1, release: 0.001 },
      'logarithmic'
    );
    linear.noteOn();
    log.noteOn();
    linear.process(0.25);
    log.process(0.25);
    // log at t=0.25 → sqrt(0.25)=0.5, linear → 0.25
    expect(log.getLevel()).toBeGreaterThan(linear.getLevel());
  });

  // ─── Rapid re-trigger ─────────────────────────────────────────────
  it('noteOn again from sustain restarts attack', () => {
    env.noteOn();
    step(env, 0.016, 20); // sustain
    env.noteOn(); // re-trigger
    expect(env.getStage()).toBe('attack');
  });
});
