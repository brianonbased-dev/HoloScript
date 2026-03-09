import { describe, it, expect, beforeEach } from 'vitest';
import { VehicleSystem, createDefaultCar, createTruck } from '../VehicleSystem';

describe('VehicleSystem', () => {
  let sys: VehicleSystem;

  beforeEach(() => {
    sys = new VehicleSystem();
  });

  // ---------- Presets ----------
  it('createDefaultCar produces 4 wheels', () => {
    const def = createDefaultCar('car1');
    expect(def.wheels.length).toBe(4);
    expect(def.id).toBe('car1');
  });

  it('createTruck produces 6 wheels', () => {
    const def = createTruck('truck1');
    expect(def.wheels.length).toBe(6);
  });

  // ---------- Vehicle lifecycle ----------
  it('creates a vehicle at given position', () => {
    const def = createDefaultCar('v1');
    const state = sys.createVehicle(def, { x: 0, y: 5, z: 0 });
    expect(state.position).toEqual({ x: 0, y: 5, z: 0 });
    expect(state.wheels.length).toBe(4);
    expect(state.speed).toBe(0);
  });

  it('getVehicle retrieves by ID', () => {
    const def = createDefaultCar('v2');
    sys.createVehicle(def, { x: 0, y: 0, z: 0 });
    expect(sys.getVehicle('v2')).toBeDefined();
  });

  it('removeVehicle deletes vehicle', () => {
    const def = createDefaultCar('v3');
    sys.createVehicle(def, { x: 0, y: 0, z: 0 });
    expect(sys.removeVehicle('v3')).toBe(true);
    expect(sys.getVehicle('v3')).toBeUndefined();
  });

  // ---------- Controls ----------
  it('setThrottle sets engine force', () => {
    const def = createDefaultCar('v4');
    sys.createVehicle(def, { x: 0, y: 0, z: 0 });
    sys.setThrottle('v4', 0.8);
    const v = sys.getVehicle('v4')!;
    expect(v.engineForce).toBeCloseTo(0.8 * def.maxEngineForce);
  });

  it('setBrake sets brake force', () => {
    const def = createDefaultCar('v5');
    sys.createVehicle(def, { x: 0, y: 0, z: 0 });
    sys.setBrake('v5', 0.5);
    const v = sys.getVehicle('v5')!;
    expect(v.brakeForce).toBeCloseTo(0.5 * def.maxBrakeForce);
  });

  it('setSteering sets steer angle', () => {
    const def = createDefaultCar('v6');
    sys.createVehicle(def, { x: 0, y: 0, z: 0 });
    sys.setSteering('v6', -1);
    const v = sys.getVehicle('v6')!;
    expect(v.steerAngle).toBeCloseTo(-def.maxSteerAngle);
  });

  // ---------- Update ----------
  it('update advances vehicle state', () => {
    const def = createDefaultCar('v7');
    sys.createVehicle(def, { x: 0, y: 0, z: 0 });
    sys.setThrottle('v7', 1.0);
    const state = sys.update('v7', 1 / 60);
    expect(state).not.toBeNull();
  });

  it('update returns null for unknown vehicle', () => {
    expect(sys.update('ghost', 1 / 60)).toBeNull();
  });

  // ---------- Forward vector ----------
  it('getForwardVector returns non-zero for default quaternion', () => {
    const def = createDefaultCar('v8');
    const state = sys.createVehicle(def, { x: 0, y: 0, z: 0 });
    const fwd = sys.getForwardVector(state);
    const len = Math.sqrt(fwd.x * fwd.x + fwd.y * fwd.y + fwd.z * fwd.z);
    expect(len).toBeCloseTo(1, 0);
  });
});
