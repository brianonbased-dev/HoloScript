/**
 * VehicleSystem — Production Test Suite
 *
 * Covers: createVehicle, update, setThrottle, setBrake, setSteering,
 * getVehicle, removeVehicle, getForwardVector, presets (createDefaultCar, createTruck).
 */
import { describe, it, expect } from 'vitest';
import { VehicleSystem, createDefaultCar, createTruck } from '@holoscript/core';

describe('VehicleSystem — Production', () => {
  // ─── Presets ──────────────────────────────────────────────────────
  it('createDefaultCar produces 4-wheel vehicle', () => {
    const def = createDefaultCar('car1');
    expect(def.wheels.length).toBe(4);
    expect(def.id).toBe('car1');
    expect(def.maxEngineForce).toBeGreaterThan(0);
    expect(def.maxSteerAngle).toBeGreaterThan(0);
  });

  it('createTruck produces 6-wheel vehicle', () => {
    const def = createTruck('truck1');
    expect(def.wheels.length).toBe(6);
    expect(def.chassisMass).toBeGreaterThan(0);
  });

  // ─── Vehicle Creation ─────────────────────────────────────────────
  it('createVehicle stores vehicle state', () => {
    const vs = new VehicleSystem();
    const def = createDefaultCar('v1');
    const state = vs.createVehicle(def, { x: 0, y: 0, z: 0 });
    expect(state.id).toBe('v1');
    expect(state.speed).toBe(0);
    expect(state.wheels.length).toBe(4);
    expect(vs.getVehicle('v1')).toBeDefined();
  });

  // ─── Controls ─────────────────────────────────────────────────────
  it('setThrottle updates engine force', () => {
    const vs = new VehicleSystem();
    vs.createVehicle(createDefaultCar('v1'), { x: 0, y: 0, z: 0 });
    vs.setThrottle('v1', 0.5);
    const v = vs.getVehicle('v1')!;
    expect(v.engineForce).toBeGreaterThan(0);
  });

  it('setBrake updates brake force', () => {
    const vs = new VehicleSystem();
    vs.createVehicle(createDefaultCar('v1'), { x: 0, y: 0, z: 0 });
    vs.setBrake('v1', 1.0);
    const v = vs.getVehicle('v1')!;
    expect(v.brakeForce).toBeGreaterThan(0);
  });

  it('setSteering updates steer angle', () => {
    const vs = new VehicleSystem();
    vs.createVehicle(createDefaultCar('v1'), { x: 0, y: 0, z: 0 });
    vs.setSteering('v1', 0.5);
    const v = vs.getVehicle('v1')!;
    expect(v.steerAngle).toBeGreaterThan(0);
  });

  // ─── Update ───────────────────────────────────────────────────────
  it('update advances position under throttle', () => {
    const vs = new VehicleSystem();
    vs.createVehicle(createDefaultCar('v1'), { x: 0, y: 0, z: 0 });
    vs.setThrottle('v1', 1.0);
    vs.update('v1', 1 / 60);
    const v = vs.getVehicle('v1')!;
    // speed should increase or position should change
    expect(v.speed !== 0 || v.position.z !== 0 || v.linearVelocity.z !== 0).toBe(true);
  });

  it('update returns null for unknown vehicle', () => {
    const vs = new VehicleSystem();
    expect(vs.update('nope', 1 / 60)).toBeNull();
  });

  // ─── Forward Vector ───────────────────────────────────────────────
  it('getForwardVector returns a direction', () => {
    const vs = new VehicleSystem();
    const state = vs.createVehicle(createDefaultCar('v1'), { x: 0, y: 0, z: 0 });
    const fwd = vs.getForwardVector(state);
    expect(typeof fwd.x).toBe('number');
    expect(typeof fwd.z).toBe('number');
  });

  // ─── Remove ───────────────────────────────────────────────────────
  it('removeVehicle deletes vehicle', () => {
    const vs = new VehicleSystem();
    vs.createVehicle(createDefaultCar('v1'), { x: 0, y: 0, z: 0 });
    expect(vs.removeVehicle('v1')).toBe(true);
    expect(vs.getVehicle('v1')).toBeUndefined();
  });

  it('removeVehicle returns false for missing', () => {
    const vs = new VehicleSystem();
    expect(vs.removeVehicle('nope')).toBe(false);
  });
});

