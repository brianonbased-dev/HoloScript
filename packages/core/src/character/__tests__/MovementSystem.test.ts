import { describe, it, expect } from 'vitest';
import { MovementSystem } from '../MovementSystem';
import type { MovementInput } from '../MovementSystem';

const idleInput: MovementInput = { forward: 0, right: 0, sprint: false, walk: false };
const walkForward: MovementInput = { forward: 1, right: 0, sprint: false, walk: true };
const runForward: MovementInput = { forward: 1, right: 0, sprint: false, walk: false };
const sprintForward: MovementInput = { forward: 1, right: 0, sprint: true, walk: false };

describe('MovementSystem', () => {
  it('initializes with default speeds', () => {
    const ms = new MovementSystem();
    expect(ms.walkSpeed).toBe(2.0);
    expect(ms.runSpeed).toBe(5.0);
    expect(ms.sprintSpeed).toBe(8.0);
    expect(ms.mode).toBe('idle');
  });

  it('idle input produces no displacement', () => {
    const ms = new MovementSystem();
    const result = ms.update(idleInput, 1 / 60);
    expect(result.dx).toBe(0);
    expect(result.dz).toBe(0);
    expect(result.staminaCost).toBe(0);
    expect(ms.mode).toBe('idle');
  });

  it('walk input sets walk mode and produces displacement', () => {
    const ms = new MovementSystem({ acceleration: 1000 }); // instant accel for test
    const result = ms.update(walkForward, 1.0);
    expect(ms.mode).toBe('walk');
    expect(result.dz).toBeGreaterThan(0); // forward = +z in normalized
    expect(result.staminaCost).toBe(0);
  });

  it('run mode is default when no walk/sprint held', () => {
    const ms = new MovementSystem({ acceleration: 1000 });
    ms.update(runForward, 1.0);
    expect(ms.mode).toBe('run');
  });

  it('sprint mode consumes stamina', () => {
    const ms = new MovementSystem({ sprintStaminaCost: 10, acceleration: 1000 });
    const result = ms.update(sprintForward, 1.0);
    expect(ms.mode).toBe('sprint');
    expect(result.staminaCost).toBeCloseTo(10, 1);
  });

  it('deceleration brings velocity to zero', () => {
    const ms = new MovementSystem({ acceleration: 100, deceleration: 100 });
    // Accelerate
    ms.update(runForward, 1.0);
    expect(ms.state.speed).toBeGreaterThan(0);
    // Decelerate
    ms.update(idleInput, 1.0);
    expect(ms.state.speed).toBeCloseTo(0, 3);
    expect(ms.mode).toBe('idle');
  });

  it('stop() immediately zeroes velocity', () => {
    const ms = new MovementSystem({ acceleration: 100 });
    ms.update(runForward, 1.0);
    expect(ms.state.speed).toBeGreaterThan(0);
    ms.stop();
    expect(ms.state.speed).toBe(0);
    expect(ms.mode).toBe('idle');
  });

  it('getSpeedForMode returns correct values', () => {
    const ms = new MovementSystem({ walkSpeed: 2, runSpeed: 5, sprintSpeed: 8 });
    expect(ms.getSpeedForMode('walk')).toBe(2);
    expect(ms.getSpeedForMode('run')).toBe(5);
    expect(ms.getSpeedForMode('sprint')).toBe(8);
    expect(ms.getSpeedForMode('idle')).toBe(0);
  });

  it('diagonal input is normalized so speed does not exceed target', () => {
    const ms = new MovementSystem({ acceleration: 1000, runSpeed: 5 });
    const diagonal: MovementInput = { forward: 1, right: 1, sprint: false, walk: false };
    // Many frames to reach full speed
    for (let i = 0; i < 60; i++) ms.update(diagonal, 1 / 60);
    // Speed should be approximately runSpeed, not runSpeed * sqrt(2)
    expect(ms.state.speed).toBeLessThanOrEqual(5.1);
  });

  it('zero deltaTime returns zero displacement', () => {
    const ms = new MovementSystem();
    const result = ms.update(runForward, 0);
    expect(result.dx).toBe(0);
    expect(result.dz).toBe(0);
  });

  it('state snapshot returns current movement state', () => {
    const ms = new MovementSystem();
    const s = ms.state;
    expect(s).toHaveProperty('mode');
    expect(s).toHaveProperty('speed');
    expect(s).toHaveProperty('direction');
    expect(s).toHaveProperty('velocityX');
    expect(s).toHaveProperty('velocityZ');
  });
});
