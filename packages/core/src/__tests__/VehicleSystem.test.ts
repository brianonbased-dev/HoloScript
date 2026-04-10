import { describe, it, expect, beforeEach } from 'vitest';
import { VehicleSystem, createDefaultCar, createTruck } from '@holoscript/engine/physics/VehicleSystem';

// =============================================================================
// C255 — Vehicle System
// =============================================================================

describe('VehicleSystem', () => {
  let sys: VehicleSystem;
  beforeEach(() => {
    sys = new VehicleSystem();
  });

  it('createDefaultCar makes 4-wheel RWD', () => {
    const def = createDefaultCar('car1');
    expect(def.wheels).toHaveLength(4);
    expect(def.wheels.filter((w) => w.isDriving)).toHaveLength(2);
    expect(def.wheels.filter((w) => w.isSteering)).toHaveLength(2);
  });

  it('createTruck makes 6-wheel', () => {
    const def = createTruck('truck1');
    expect(def.wheels).toHaveLength(6);
    expect(def.chassisMass).toBe(5000);
  });

  it('createVehicle stores vehicle state', () => {
    const def = createDefaultCar('car1');
    const state = sys.createVehicle(def, { x: 0, y: 2, z: 0 });
    expect(state.id).toBe('car1');
    expect(state.speed).toBe(0);
    expect(state.wheels).toHaveLength(4);
  });

  it('getVehicle returns stored vehicle', () => {
    sys.createVehicle(createDefaultCar('car1'), { x: 0, y: 2, z: 0 });
    expect(sys.getVehicle('car1')).toBeDefined();
    expect(sys.getVehicle('nope')).toBeUndefined();
  });

  it('removeVehicle deletes vehicle', () => {
    sys.createVehicle(createDefaultCar('car1'), { x: 0, y: 2, z: 0 });
    expect(sys.removeVehicle('car1')).toBe(true);
    expect(sys.getVehicle('car1')).toBeUndefined();
  });

  it('setThrottle and update accelerates vehicle', () => {
    const def = createDefaultCar('car1');
    sys.createVehicle(def, { x: 0, y: 1, z: 0 });
    sys.setThrottle('car1', 1.0);
    for (let i = 0; i < 60; i++) sys.update('car1', 1 / 60);
    const v = sys.getVehicle('car1')!;
    expect(v.speed).toBeGreaterThan(0);
  });

  it('setBrake reduces speed', () => {
    sys.createVehicle(createDefaultCar('car1'), { x: 0, y: 1, z: 0 });
    sys.setThrottle('car1', 1.0);
    for (let i = 0; i < 30; i++) sys.update('car1', 1 / 60);
    const speedBefore = sys.getVehicle('car1')!.speed;
    sys.setThrottle('car1', 0);
    sys.setBrake('car1', 1.0);
    for (let i = 0; i < 30; i++) sys.update('car1', 1 / 60);
    expect(sys.getVehicle('car1')!.speed).toBeLessThan(speedBefore);
  });

  it('setSteering clamps to max angle', () => {
    sys.createVehicle(createDefaultCar('car1'), { x: 0, y: 1, z: 0 });
    sys.setSteering('car1', 5.0); // way past max
    expect(sys.getVehicle('car1')!.steerAngle).toBeLessThanOrEqual(
      createDefaultCar('x').maxSteerAngle
    );
  });

  it('vehicle falls under gravity when airborne', () => {
    sys.createVehicle(createDefaultCar('car1'), { x: 0, y: 10, z: 0 });
    sys.update('car1', 1 / 60);
    expect(sys.getVehicle('car1')!.position.y).toBeLessThan(10);
  });

  it('wheel rotation increases with speed', () => {
    sys.createVehicle(createDefaultCar('car1'), { x: 0, y: 1, z: 0 });
    sys.setThrottle('car1', 1.0);
    for (let i = 0; i < 30; i++) sys.update('car1', 1 / 60);
    const wheels = sys.getVehicle('car1')!.wheels;
    expect(wheels.some((w) => w.rotation > 0)).toBe(true);
  });

  it('update returns null for unknown vehicle', () => {
    expect(sys.update('nope', 1 / 60)).toBeNull();
  });
});
