/**
 * VehicleSystem suspension terrain response regression (zgcn).
 *
 * Before the fix, the suspension raycast assumed a flat ground plane at y = 0
 * (`if (rayEnd <= 0)`, contactPoint Y hardcoded to 0) — so a vehicle could not
 * respond to non-flat terrain. update() now accepts an optional GroundProbe
 * `(x, z) => height`; this pins that suspension reads the probed ground height
 * per wheel:
 *   - contactPoint Y equals the probed terrain height (not a hardcoded 0),
 *   - a wheel over a deep pit (no ground) goes ungrounded,
 *   - left/right wheels over a split terrain ground independently,
 *   - with no probe, behavior is the legacy flat plane at y = 0.
 */

import { describe, it, expect } from 'vitest';
import { VehicleSystem, createDefaultCar } from '..';

describe('VehicleSystem suspension terrain response (zgcn)', () => {
  const dt = 1 / 60;

  it('contactPoint Y tracks the probed terrain height (not a hardcoded 0)', () => {
    const vs = new VehicleSystem();
    vs.createVehicle(createDefaultCar('v1'), [0, 0, 0]);

    // Raised flat terrain at y = 0.5 everywhere.
    const state = vs.update('v1', dt, () => 0.5)!;
    const grounded = state.wheels.filter((w) => w.isGrounded);
    expect(grounded.length).toBe(4);
    for (const w of grounded) {
      expect(w.contactPoint).not.toBeNull();
      expect(w.contactPoint![1]).toBeCloseTo(0.5, 6);
    }
  });

  it('legacy: no probe behaves as a flat ground plane at y = 0', () => {
    const vs = new VehicleSystem();
    vs.createVehicle(createDefaultCar('v1'), [0, 0, 0]);

    const state = vs.update('v1', dt)!;
    const grounded = state.wheels.filter((w) => w.isGrounded);
    expect(grounded.length).toBe(4);
    for (const w of grounded) expect(w.contactPoint![1]).toBeCloseTo(0, 6);
  });

  it('a wheel over a deep pit goes ungrounded; the rest stay grounded (split terrain)', () => {
    const vs = new VehicleSystem();
    vs.createVehicle(createDefaultCar('v1'), [0, 0, 0]);

    // Left half (x < 0) is solid ground at y = 0; right half (x > 0) is a deep
    // pit far below the wheels — the right wheels should find no ground.
    const split = (x: number) => (x < 0 ? 0 : -5);
    const state = vs.update('v1', dt, (x) => split(x))!;

    const leftWheels = state.wheels.filter((w) => w.config.connectionPoint[0] < 0);
    const rightWheels = state.wheels.filter((w) => w.config.connectionPoint[0] > 0);

    expect(leftWheels.length).toBe(2);
    expect(rightWheels.length).toBe(2);
    expect(leftWheels.every((w) => w.isGrounded)).toBe(true);
    expect(rightWheels.every((w) => !w.isGrounded)).toBe(true);
    // Ungrounded wheels carry no suspension force.
    for (const w of rightWheels) expect(w.suspensionForce).toBe(0);
  });

  it('non-flat (tilted) terrain produces differential suspension force left vs right', () => {
    const vs = new VehicleSystem();
    // Position the chassis in the suspension-responsive band (un-clamped travel).
    vs.createVehicle(createDefaultCar('v1'), [0, 0.85, 0]);

    // Right side sits on a low rise → more compression than the flat left side.
    const tilt = (x: number) => (x > 0 ? 0.05 : 0);
    const state = vs.update('v1', dt, (x) => tilt(x))!;

    const leftForce = state.wheels
      .filter((w) => w.config.connectionPoint[0] < 0)
      .reduce((s, w) => s + w.suspensionForce, 0);
    const rightForce = state.wheels
      .filter((w) => w.config.connectionPoint[0] > 0)
      .reduce((s, w) => s + w.suspensionForce, 0);

    // Higher ground under the right wheels compresses their suspension more.
    expect(rightForce).toBeGreaterThan(leftForce);
  });
});
