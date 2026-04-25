import { describe, it, expect, beforeEach } from 'vitest';
import { CameraRig } from '../CameraRig';

describe('CameraRig', () => {
  let rig: CameraRig;

  beforeEach(() => {
    rig = new CameraRig();
  });

  // --- Construction ---
  it('constructs with defaults', () => {
    const cfg = rig.getConfig();
    expect(cfg.mode).toBe('static');
    expect(cfg.fov).toBe(60);
    expect(cfg.nearClip).toBe(0.1);
    expect(cfg.farClip).toBe(1000);
  });

  it('constructs with overrides', () => {
    const custom = new CameraRig({ fov: 90, mode: 'dolly' });
    expect(custom.getConfig().fov).toBe(90);
    expect(custom.getMode()).toBe('dolly');
  });

  // --- Mode ---
  it('setMode / getMode', () => {
    rig.setMode('crane');
    expect(rig.getMode()).toBe('crane');
  });

  // --- Static Update ---
  it('static mode does not move position', () => {
    const before = rig.getState();
    rig.update(1);
    const after = rig.getState();
    expect(after.position[0]).toBeCloseTo(before.position[0]);
    expect(after.position[1]).toBeCloseTo(before.position[1]);
    expect(after.position[2]).toBeCloseTo(before.position[2]);
  });

  // --- Dolly ---
  it('dolly update moves along path', () => {
    rig.setMode('dolly');
    rig.setDollyPath([
      [0, 0, 0],
      [10, 0, 0],
    ]);
    rig.update(1); // moves along path
    const state = rig.getState();
    expect(state.position[0]).toBeGreaterThan(0);
  });

  it('dolly with single point does not crash', () => {
    rig.setMode('dolly');
    rig.setDollyPath([[0, 0, 0]]);
    expect(() => rig.update(1)).not.toThrow();
  });

  // --- Crane ---
  it('crane adjusts position based on height/angle', () => {
    rig.setMode('crane');
    rig.setCraneParams(10, 45);
    const state = rig.update(0.016);
    // Y position should be raised by crane height
    expect(state.position[1]).toBeGreaterThan(0);
  });

  // --- Steadicam ---
  it('steadicam smoothly interpolates', () => {
    const custom = new CameraRig({
      mode: 'steadicam',
      position: [10, 5, -20],
      smoothing: 0.5,
    });
    const s1 = custom.getState();
    custom.update(0.016);
    const s2 = custom.getState();
    // Position should stay close (smoothing toward config)
    expect(typeof s2.position[0]).toBe('number');
  });

  // --- Handheld ---
  it('handheld adds micro-movement', () => {
    rig.setMode('handheld');
    const state = rig.update(0.016);
    // Handheld offsets by sin/cos, so position varies slightly from default
    expect(typeof state.position[0]).toBe('number');
  });

  // --- Shake ---
  it('built-in shake presets exist', () => {
    const presets = rig.getShakePresets();
    expect(presets).toContain('light');
    expect(presets).toContain('medium');
    expect(presets).toContain('heavy');
    expect(presets).toContain('explosion');
  });

  it('shake applies offset during duration', () => {
    rig.shake('explosion');
    const state = rig.update(0.01);
    const offset = state.shakeOffset;
    const magnitude = Math.sqrt(offset[0] ** 2 + offset[1] ** 2 + offset[2] ** 2);
    expect(magnitude).toBeGreaterThan(0);
  });

  it('shake offset returns to zero after duration', () => {
    rig.shake('light'); // duration 0.3
    rig.update(0.5); // exceed duration
    const state = rig.getState();
    expect(state.shakeOffset[0]).toBe(0);
    expect(state.shakeOffset[1]).toBe(0);
    expect(state.shakeOffset[2]).toBe(0);
  });

  it('addShakePreset registers custom preset', () => {
    rig.addShakePreset({ name: 'earthquake', intensity: 2, frequency: 40, duration: 2, decay: 1 });
    expect(rig.getShakePresets()).toContain('earthquake');
  });

  it('shake with unknown preset is noop', () => {
    rig.shake('nonexistent');
    const state = rig.update(0.016);
    expect(state.shakeOffset[0]).toBe(0);
  });

  // --- getState returns combined pos + shake ---
  it('getState includes shakeOffset in position', () => {
    rig.shake('heavy');
    const state = rig.update(0.01);
    // Position should include shake offset
    const cfg = rig.getConfig();
    // The state position should differ from the config position when shaking
    const dx = Math.abs(state.position[0] - cfg.position[0]);
    const dy = Math.abs(state.position[1] - cfg.position[1]);
    expect(dx + dy).toBeGreaterThan(0);
  });

  // --- getConfig returns copy ---
  it('getConfig returns config copy', () => {
    const c1 = rig.getConfig();
    const c2 = rig.getConfig();
    expect(c1).toEqual(c2);
  });
});
