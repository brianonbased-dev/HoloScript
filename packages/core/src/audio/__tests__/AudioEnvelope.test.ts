import { describe, it, expect, beforeEach } from 'vitest';
import { AudioEnvelope } from '../AudioEnvelope';

describe('AudioEnvelope', () => {
  let env: AudioEnvelope;

  beforeEach(() => {
    env = new AudioEnvelope({ attack: 0.1, decay: 0.1, sustain: 0.7, release: 0.2 });
  });

  // ---------------------------------------------------------------------------
  // Initial State
  // ---------------------------------------------------------------------------

  it('starts idle at level 0', () => {
    expect(env.getStage()).toBe('idle');
    expect(env.getLevel()).toBe(0);
    expect(env.isActive()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // ADSR Stages
  // ---------------------------------------------------------------------------

  it('noteOn transitions to attack stage', () => {
    env.noteOn();
    expect(env.getStage()).toBe('attack');
    expect(env.isActive()).toBe(true);
  });

  it('attack ramps level towards 1', () => {
    env.noteOn();
    env.process(0.05); // half-way through 0.1s attack
    expect(env.getLevel()).toBeGreaterThan(0);
    expect(env.getLevel()).toBeLessThanOrEqual(1);
  });

  it('attack completes then transitions to decay', () => {
    env.noteOn();
    env.process(0.1); // attack done
    expect(env.getStage()).toBe('decay');
  });

  it('decay transitions to sustain', () => {
    env.noteOn();
    env.process(0.1); // attack
    env.process(0.1); // decay
    expect(env.getStage()).toBe('sustain');
    expect(env.getLevel()).toBeCloseTo(0.7);
  });

  it('sustain holds level', () => {
    env.noteOn();
    env.process(0.1); env.process(0.1); // attack + decay
    env.process(1); // sustain
    expect(env.getStage()).toBe('sustain');
    expect(env.getLevel()).toBeCloseTo(0.7);
  });

  it('noteOff transitions to release', () => {
    env.noteOn();
    env.process(0.1); env.process(0.1); // to sustain
    env.noteOff();
    expect(env.getStage()).toBe('release');
  });

  it('release returns to idle', () => {
    env.noteOn();
    env.process(0.1); env.process(0.1); // to sustain
    env.noteOff();
    env.process(0.2); // release done
    expect(env.getStage()).toBe('idle');
    expect(env.getLevel()).toBe(0);
    expect(env.isActive()).toBe(false);
  });

  it('noteOff from idle stays idle', () => {
    env.noteOff();
    expect(env.getStage()).toBe('idle');
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  it('getConfig returns copy of current config', () => {
    const cfg = env.getConfig();
    expect(cfg.attack).toBe(0.1);
    expect(cfg.sustain).toBe(0.7);
  });

  it('setConfig updates parameters', () => {
    env.setConfig({ sustain: 0.5 });
    expect(env.getConfig().sustain).toBe(0.5);
  });

  // ---------------------------------------------------------------------------
  // Curve Types
  // ---------------------------------------------------------------------------

  it('exponential curve shapes attack', () => {
    const expEnv = new AudioEnvelope({ attack: 1, decay: 0.1, sustain: 0.5, release: 0.1 }, 'exponential');
    expEnv.noteOn();
    expEnv.process(0.5); // t=0.5 → curve = 0.25 (t²)
    expect(expEnv.getLevel()).toBeCloseTo(0.25);
  });

  it('logarithmic curve shapes attack', () => {
    const logEnv = new AudioEnvelope({ attack: 1, decay: 0.1, sustain: 0.5, release: 0.1 }, 'logarithmic');
    logEnv.noteOn();
    logEnv.process(0.25); // t=0.25 → curve = sqrt(0.25) = 0.5
    expect(logEnv.getLevel()).toBeCloseTo(0.5);
  });

  // ---------------------------------------------------------------------------
  // Defaults
  // ---------------------------------------------------------------------------

  it('uses sensible defaults when no config provided', () => {
    const def = new AudioEnvelope();
    const cfg = def.getConfig();
    expect(cfg.attack).toBe(0.01);
    expect(cfg.decay).toBe(0.1);
    expect(cfg.sustain).toBe(0.7);
    expect(cfg.release).toBe(0.3);
  });
});
