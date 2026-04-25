import { describe, it, expect } from 'vitest';
import { ConstraintSolver } from '@holoscript/engine/physics/ConstraintSolver';
import {
  RagdollSystem,
  HUMANOID_PRESET,
  QUADRUPED_PRESET,
} from '@holoscript/engine/physics/RagdollSystem';
import {
  VehicleSystem,
  createDefaultCar,
  createTruck,
} from '@holoscript/engine/physics/VehicleSystem';
import {
  IRigidBodyState,
  IDistanceConstraint,
  ISpringConstraint,
  IHingeConstraint,
} from '@holoscript/engine/physics/PhysicsTypes';

// =============================================================================
// HELPERS
// =============================================================================

function createBody(id: string, pos: [number, number, number]): IRigidBodyState {
  return {
    id,
    position: { ...pos },
    rotation: [0, 0, 0, 1 ],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    isSleeping: false,
    isActive: true,
  };
}

describe('Cycle 105: Physics Refinement', () => {
  // -------------------------------------------------------------------------
  // ConstraintSolver
  // -------------------------------------------------------------------------

  it('should solve distance constraint and produce corrections', () => {
    const solver = new ConstraintSolver({ iterations: 10 });

    const bodyA = createBody('a', [0, 0, 0]);
    const bodyB = createBody('b', [3, 0, 0]); // 3m apart

    const constraint: IDistanceConstraint = {
      type: 'distance',
      id: 'dist_1',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0],
      pivotB: [0, 0, 0],
      distance: 2, // want 2m, currently 3m
    };

    solver.addConstraint(constraint, bodyA, bodyB);
    const corrections = solver.solve(1 / 60);

    // Should produce velocity corrections to bring bodies closer
    expect(corrections.size).toBeGreaterThan(0);
    const corrA = corrections.get('a');
    expect(corrA).toBeDefined();
    expect(corrA!.linearVelocity[0]).toBeGreaterThan(0); // Push A toward B
  });

  it('should solve spring constraint with damping', () => {
    const solver = new ConstraintSolver({ iterations: 5 });

    const bodyA = createBody('a', [0, 0, 0]);
    const bodyB = createBody('b', [5, 0, 0]); // Stretched

    const constraint: ISpringConstraint = {
      type: 'spring',
      id: 'spring_1',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0],
      pivotB: [0, 0, 0],
      restLength: 2,
      stiffness: 100,
      damping: 5,
    };

    solver.addConstraint(constraint, bodyA, bodyB);
    const corrections = solver.solve(1 / 60);

    expect(corrections.size).toBeGreaterThan(0);
  });

  it('should detect breakable constraints', () => {
    const solver = new ConstraintSolver({ iterations: 5 });

    const bodyA = createBody('a', [0, 0, 0]);
    const bodyB = createBody('b', [100, 0, 0]); // Far apart

    const constraint: IDistanceConstraint = {
      type: 'distance',
      id: 'breakable',
      bodyA: 'a',
      bodyB: 'b',
      pivotA: [0, 0, 0],
      pivotB: [0, 0, 0],
      distance: 1,
      breakForce: 0.1, // Very low break force
    };

    solver.addConstraint(constraint, bodyA, bodyB);
    solver.solve(1 / 60);

    const broken = solver.getBrokenConstraints();
    expect(broken).toContain('breakable');
  });

  it('should solve hinge constraint with motor', () => {
    const solver = new ConstraintSolver({ iterations: 5 });

    const bodyA = createBody('a', [0, 0, 0]);

    const constraint: IHingeConstraint = {
      type: 'hinge',
      id: 'hinge_motor',
      bodyA: 'a',
      pivotA: [0, 0, 0],
      axisA: [0, 1, 0],
      motor: { targetVelocity: 5, maxForce: 100 },
    };

    solver.addConstraint(constraint, bodyA, null);
    const corrections = solver.solve(1 / 60);

    const corrA = corrections.get('a');
    expect(corrA).toBeDefined();
    // Motor should produce angular velocity correction
    expect(corrA!.angularVelocity[1]).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // RagdollSystem
  // -------------------------------------------------------------------------

  it('should create humanoid ragdoll with correct bone/constraint count', () => {
    const system = new RagdollSystem();
    const ragdoll = system.createHumanoid('hero', [0, 5, 0]);

    expect(ragdoll.bodies).toHaveLength(HUMANOID_PRESET.length);
    // Constraints = bones with parents (all except root pelvis)
    const expectedConstraints = HUMANOID_PRESET.filter((b) => b.parentBone).length;
    expect(ragdoll.constraints).toHaveLength(expectedConstraints);

    const totalMass = system.getTotalMass('hero');
    expect(totalMass).toBeGreaterThan(50); // Humanoid ~70kg+
  });

  it('should create quadruped ragdoll', () => {
    const system = new RagdollSystem();
    const ragdoll = system.createQuadruped('dog', [0, 2, 0]);

    expect(ragdoll.bodies).toHaveLength(QUADRUPED_PRESET.length);
    expect(ragdoll.constraints.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // VehicleSystem
  // -------------------------------------------------------------------------

  it('should create default car with 4 wheels', () => {
    const system = new VehicleSystem();
    const carDef = createDefaultCar('player_car');
    const car = system.createVehicle(carDef, [0, 1, 0]);

    expect(car.wheels).toHaveLength(4);
    expect(car.speed).toBe(0);

    // Verify wheel roles
    const steeringWheels = car.wheels.filter((w) => w.config.isSteering);
    const drivingWheels = car.wheels.filter((w) => w.config.isDriving);
    expect(steeringWheels).toHaveLength(2); // Front wheels steer
    expect(drivingWheels).toHaveLength(2); // Rear wheels drive
  });

  it('should create truck with 6 wheels', () => {
    const system = new VehicleSystem();
    const truckDef = createTruck('big_rig');
    const truck = system.createVehicle(truckDef, [0, 2, 0]);

    expect(truck.wheels).toHaveLength(6);
    expect(truck.definition.chassisMass).toBe(5000);
  });

  it('should accelerate, steer, and brake a vehicle', () => {
    const system = new VehicleSystem();
    const carDef = createDefaultCar('test_car');
    system.createVehicle(carDef, [0, 0.65, 0]);

    // Throttle
    system.setThrottle('test_car', 1.0);
    system.update('test_car', 1 / 60);
    system.update('test_car', 1 / 60);

    const afterThrottle = system.getVehicle('test_car')!;
    const speed = Math.sqrt(
      afterThrottle.linearVelocity[0] ** 2 + afterThrottle.linearVelocity[2] ** 2
    );
    expect(speed).toBeGreaterThan(0);

    // Steer
    system.setSteering('test_car', 0.5);
    system.update('test_car', 1 / 60);
    const afterSteer = system.getVehicle('test_car')!;
    expect(afterSteer.steerAngle).toBeGreaterThan(0);

    // Brake (reset throttle first)
    system.setThrottle('test_car', 0);
    system.setBrake('test_car', 1.0);
    for (let i = 0; i < 100; i++) system.update('test_car', 1 / 60);
    const afterBrake = system.getVehicle('test_car')!;
    const brakingSpeed = Math.sqrt(
      afterBrake.linearVelocity[0] ** 2 + afterBrake.linearVelocity[2] ** 2
    );
    expect(brakingSpeed).toBeLessThan(speed); // Should have slowed down
  });
});
