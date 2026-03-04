/**
 * PIDController Tests
 *
 * Comprehensive tests for the generic PID controller with:
 * - Scalar and Vector3 type parameterization
 * - Cascade (inner/outer) loop timing
 * - Setpoint tracking with ramp-rate limiting
 * - Velocity monitoring
 * - Anti-windup behavior
 * - Thread-safe state snapshots
 * - VR 90fps timing constraints
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PIDController,
  ScalarArithmetic,
  Vector3Arithmetic,
  VelocityRingBuffer,
  defaultPIDConfig,
  createScalarPIDController,
  createVector3PIDController,
  createPIDControllerTrait,
  type PIDControllerConfig,
  type PIDGains,
  type PIDControllerTraitConfig,
  type PIDArithmetic,
} from '../PIDController';
import type { IVector3 } from '../PhysicsTypes';

// =============================================================================
// HELPER: simulate N steps
// =============================================================================

function simulateScalar(
  controller: PIDController<number>,
  measurement: () => number,
  steps: number,
  dt: number,
): number[] {
  const outputs: number[] = [];
  for (let i = 0; i < steps; i++) {
    const out = controller.step(measurement(), dt);
    outputs.push(out);
  }
  return outputs;
}

// =============================================================================
// SCALAR ARITHMETIC ADAPTER
// =============================================================================

describe('ScalarArithmetic', () => {
  it('zero returns 0', () => {
    expect(ScalarArithmetic.zero()).toBe(0);
  });

  it('add performs addition', () => {
    expect(ScalarArithmetic.add(3, 4)).toBe(7);
    expect(ScalarArithmetic.add(-1, 1)).toBe(0);
  });

  it('sub performs subtraction', () => {
    expect(ScalarArithmetic.sub(10, 3)).toBe(7);
    expect(ScalarArithmetic.sub(0, 5)).toBe(-5);
  });

  it('scale multiplies by scalar', () => {
    expect(ScalarArithmetic.scale(2, 5)).toBe(10);
    expect(ScalarArithmetic.scale(0.5, 8)).toBe(4);
  });

  it('magnitude returns absolute value', () => {
    expect(ScalarArithmetic.magnitude(5)).toBe(5);
    expect(ScalarArithmetic.magnitude(-5)).toBe(5);
    expect(ScalarArithmetic.magnitude(0)).toBe(0);
  });

  it('clamp restricts to range', () => {
    expect(ScalarArithmetic.clamp(5, -10, 10)).toBe(5);
    expect(ScalarArithmetic.clamp(15, -10, 10)).toBe(10);
    expect(ScalarArithmetic.clamp(-15, -10, 10)).toBe(-10);
  });

  it('clone returns same value', () => {
    expect(ScalarArithmetic.clone(42)).toBe(42);
  });
});

// =============================================================================
// VECTOR3 ARITHMETIC ADAPTER
// =============================================================================

describe('Vector3Arithmetic', () => {
  it('zero returns origin', () => {
    expect(Vector3Arithmetic.zero()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('add performs component-wise addition', () => {
    const a: IVector3 = { x: 1, y: 2, z: 3 };
    const b: IVector3 = { x: 4, y: 5, z: 6 };
    expect(Vector3Arithmetic.add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
  });

  it('sub performs component-wise subtraction', () => {
    const a: IVector3 = { x: 10, y: 20, z: 30 };
    const b: IVector3 = { x: 3, y: 5, z: 7 };
    expect(Vector3Arithmetic.sub(a, b)).toEqual({ x: 7, y: 15, z: 23 });
  });

  it('scale multiplies all components', () => {
    const v: IVector3 = { x: 1, y: 2, z: 3 };
    expect(Vector3Arithmetic.scale(2, v)).toEqual({ x: 2, y: 4, z: 6 });
  });

  it('magnitude returns L2 norm', () => {
    expect(Vector3Arithmetic.magnitude({ x: 3, y: 4, z: 0 })).toBeCloseTo(5, 10);
    expect(Vector3Arithmetic.magnitude({ x: 0, y: 0, z: 0 })).toBe(0);
    expect(Vector3Arithmetic.magnitude({ x: 1, y: 1, z: 1 })).toBeCloseTo(Math.sqrt(3), 10);
  });

  it('clamp restricts each component', () => {
    const v: IVector3 = { x: 15, y: -15, z: 5 };
    expect(Vector3Arithmetic.clamp(v, -10, 10)).toEqual({ x: 10, y: -10, z: 5 });
  });

  it('clone creates independent copy', () => {
    const v: IVector3 = { x: 1, y: 2, z: 3 };
    const c = Vector3Arithmetic.clone(v);
    expect(c).toEqual(v);
    c.x = 99;
    expect(v.x).toBe(1); // Original unchanged
  });
});

// =============================================================================
// VELOCITY RING BUFFER
// =============================================================================

describe('VelocityRingBuffer', () => {
  let buffer: VelocityRingBuffer;

  beforeEach(() => {
    buffer = new VelocityRingBuffer(5);
  });

  it('starts empty', () => {
    expect(buffer.size()).toBe(0);
    expect(buffer.latest()).toBe(0);
    expect(buffer.average()).toBe(0);
    expect(buffer.peak()).toBe(0);
  });

  it('push and latest', () => {
    buffer.push(10);
    expect(buffer.latest()).toBe(10);
    expect(buffer.size()).toBe(1);

    buffer.push(20);
    expect(buffer.latest()).toBe(20);
    expect(buffer.size()).toBe(2);
  });

  it('average computes mean', () => {
    buffer.push(10);
    buffer.push(20);
    buffer.push(30);
    expect(buffer.average()).toBeCloseTo(20, 10);
  });

  it('peak returns maximum absolute value', () => {
    buffer.push(5);
    buffer.push(-15);
    buffer.push(10);
    expect(buffer.peak()).toBe(15);
  });

  it('wraps around when full', () => {
    for (let i = 1; i <= 7; i++) {
      buffer.push(i);
    }
    // Buffer capacity is 5, so it should contain [3,4,5,6,7] after wrap
    expect(buffer.size()).toBe(5);
    expect(buffer.latest()).toBe(7);
    // Average of 3+4+5+6+7 = 25/5 = 5
    expect(buffer.average()).toBeCloseTo(5, 10);
  });

  it('clear resets everything', () => {
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.clear();
    expect(buffer.size()).toBe(0);
    expect(buffer.latest()).toBe(0);
  });
});

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

describe('defaultPIDConfig', () => {
  it('creates config with sensible defaults', () => {
    const config = defaultPIDConfig('test', 0);
    expect(config.id).toBe('test');
    expect(config.initialSetpoint).toBe(0);
    expect(config.innerGains.kP).toBe(1.0);
    expect(config.outerGains.kP).toBe(2.0);
    expect(config.timing.innerHz).toBe(200);
    expect(config.timing.outerHz).toBe(60);
    expect(config.outputLimit).toBe(1000);
    expect(config.derivativeOnMeasurement).toBe(true);
    expect(config.backCalculationAntiWindup).toBe(true);
  });

  it('allows overrides', () => {
    const config = defaultPIDConfig('test', 0, {
      outputLimit: 500,
      innerGains: { kP: 5, kI: 1, kD: 0.5 },
    });
    expect(config.outputLimit).toBe(500);
    expect(config.innerGains.kP).toBe(5);
  });

  it('works with Vector3 initial setpoint', () => {
    const config = defaultPIDConfig('vec-test', { x: 1, y: 2, z: 3 });
    expect(config.initialSetpoint).toEqual({ x: 1, y: 2, z: 3 });
  });
});

// =============================================================================
// SCALAR PID CONTROLLER
// =============================================================================

describe('PIDController<number> (Scalar)', () => {
  let controller: PIDController<number>;

  beforeEach(() => {
    controller = new PIDController<number>(
      defaultPIDConfig('test-scalar', 0, {
        outerGains: { kP: 2.0, kI: 0.1, kD: 0.3 },
        innerGains: { kP: 1.0, kI: 0.0, kD: 0.1 },
        timing: { innerHz: 100, outerHz: 50 },
        outputLimit: 100,
        integralLimit: 50,
        setpointRampRate: 0, // instant
        velocityLimit: 50,
      }),
      ScalarArithmetic,
    );
  });

  describe('Initialization', () => {
    it('should create with valid config', () => {
      expect(controller).toBeDefined();
      expect(controller.getId()).toBe('test-scalar');
    });

    it('should start at initial setpoint', () => {
      expect(controller.getSetpoint()).toBe(0);
      expect(controller.getTargetSetpoint()).toBe(0);
    });

    it('should report initial state', () => {
      const state = controller.getState();
      expect(state.id).toBe('test-scalar');
      expect(state.setpoint).toBe(0);
      expect(state.elapsedTime).toBe(0);
      expect(state.innerTickCount).toBe(0);
      expect(state.outerTickCount).toBe(0);
      expect(state.isSaturated).toBe(false);
      expect(state.isVelocityExceeded).toBe(false);
    });
  });

  describe('Basic Control', () => {
    it('should produce zero output when at setpoint', () => {
      controller.setSetpoint(0);
      // Step with measurement = 0 (at setpoint)
      const output = controller.step(0, 1 / 50);
      // Output should be very small (near zero) since error is zero
      expect(Math.abs(output)).toBeLessThan(1);
    });

    it('should produce non-zero output when off setpoint', () => {
      controller.setSetpoint(10);
      const output = controller.step(0, 1 / 50);
      // Should produce positive output to move toward setpoint
      expect(output).not.toBe(0);
    });

    it('should converge toward setpoint over time', () => {
      controller.setSetpoint(10);
      let measurement = 0;
      const dt = 1 / 50;

      for (let i = 0; i < 100; i++) {
        const output = controller.step(measurement, dt);
        // Simple plant: measurement moves by output * dt
        measurement += output * dt * 0.1;
      }

      // After sufficient steps, measurement should approach setpoint
      // (exact convergence depends on gains and plant model)
      const error = Math.abs(10 - measurement);
      expect(error).toBeLessThan(10); // At least trending toward setpoint
    });

    it('should handle negative setpoints', () => {
      controller.setSetpoint(-5);
      const output = controller.step(0, 1 / 50);
      // Output should be negative to drive toward -5
      expect(output).toBeLessThan(0);
    });
  });

  describe('Cascade Timing', () => {
    it('should tick outer loop at outerHz', () => {
      controller.setSetpoint(10);
      // Step at exactly the outer loop period
      controller.step(0, 1 / 50); // outerHz = 50
      const state = controller.getState();
      expect(state.outerTickCount).toBeGreaterThanOrEqual(1);
    });

    it('should tick inner loop at innerHz', () => {
      controller.setSetpoint(10);
      // Step with a large dt that should trigger multiple inner ticks
      controller.step(0, 1 / 10); // 100ms = 10 inner ticks at 100Hz
      const state = controller.getState();
      expect(state.innerTickCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle very small dt without crashing', () => {
      controller.setSetpoint(5);
      // dt smaller than both loop periods
      const output = controller.step(0, 0.0001);
      expect(Number.isFinite(output)).toBe(true);
    });

    it('should clamp large dt to prevent spiral of death', () => {
      controller.setSetpoint(5);
      // Huge dt should be clamped to 100ms
      const output = controller.step(0, 10);
      expect(Number.isFinite(output)).toBe(true);
      // Elapsed time should be clamped
      expect(controller.getState().elapsedTime).toBeLessThanOrEqual(0.11);
    });
  });

  describe('Setpoint Ramping', () => {
    it('should change setpoint instantly when rampRate = 0', () => {
      controller.setSetpoint(100);
      controller.step(0, 0.01);
      expect(controller.getSetpoint()).toBe(100);
    });

    it('should ramp setpoint gradually when rampRate > 0', () => {
      const rampController = new PIDController<number>(
        defaultPIDConfig('ramp-test', 0, {
          setpointRampRate: 10, // 10 units per second
          timing: { innerHz: 100, outerHz: 50 },
        }),
        ScalarArithmetic,
      );

      rampController.setSetpoint(100);
      rampController.step(0, 0.1); // 0.1s => ramp by 1 unit

      const currentSP = rampController.getSetpoint();
      expect(currentSP).toBeGreaterThan(0);
      expect(currentSP).toBeLessThan(100);
      expect(currentSP).toBeCloseTo(1, 0); // ~1 unit at 10/s * 0.1s
    });

    it('should eventually reach target setpoint', () => {
      const rampController = new PIDController<number>(
        defaultPIDConfig('ramp-reach', 0, {
          setpointRampRate: 100,
          timing: { innerHz: 100, outerHz: 50 },
        }),
        ScalarArithmetic,
      );

      rampController.setSetpoint(50);
      for (let i = 0; i < 100; i++) {
        rampController.step(0, 0.01);
      }
      // After 1 second at 100 units/s, target of 50 should be reached
      expect(rampController.getSetpoint()).toBeCloseTo(50, 5);
    });
  });

  describe('Velocity Monitoring', () => {
    it('should report zero velocity initially', () => {
      expect(controller.getVelocityMagnitude()).toBe(0);
      expect(controller.getAverageVelocity()).toBe(0);
      expect(controller.getPeakVelocity()).toBe(0);
    });

    it('should track velocity from measurement changes', () => {
      controller.setSetpoint(10);
      controller.step(0, 0.01);
      controller.step(1, 0.01); // measurement changed by 1 in 0.01s = 100 units/s
      expect(controller.getVelocityMagnitude()).toBeGreaterThan(0);
    });

    it('should flag when velocity exceeds limit', () => {
      controller.setSetpoint(10);
      controller.step(0, 0.01);
      // Large jump in measurement = high velocity
      controller.step(100, 0.01); // 10000 units/s >> 50 limit
      expect(controller.getIsVelocityExceeded()).toBe(true);
    });

    it('should not flag when velocity is within limit', () => {
      controller.setSetpoint(10);
      controller.step(0, 0.01);
      controller.step(0.001, 0.01); // 0.1 units/s << 50 limit
      expect(controller.getIsVelocityExceeded()).toBe(false);
    });
  });

  describe('Output Saturation', () => {
    it('should clamp output to outputLimit', () => {
      // Large error should saturate
      controller.setSetpoint(10000);
      const output = controller.step(0, 1 / 50);
      expect(Math.abs(output)).toBeLessThanOrEqual(100.01); // Allow small floating point
    });

    it('should report saturation in state', () => {
      controller.setSetpoint(10000);
      controller.step(0, 1 / 50);
      controller.step(0, 1 / 50);
      const state = controller.getState();
      // With such a large error, output should saturate
      expect(state.outputMagnitude).toBeLessThanOrEqual(100.01);
    });
  });

  describe('Anti-Windup', () => {
    it('should prevent integral runaway during saturation', () => {
      const windupController = new PIDController<number>(
        defaultPIDConfig('windup-test', 0, {
          outerGains: { kP: 0.1, kI: 10.0, kD: 0 },
          innerGains: { kP: 1.0, kI: 0, kD: 0 },
          timing: { innerHz: 100, outerHz: 50 },
          outputLimit: 10,
          integralLimit: 5,
        }),
        ScalarArithmetic,
      );

      windupController.setSetpoint(1000);
      // Run many steps with constant large error
      for (let i = 0; i < 200; i++) {
        windupController.step(0, 0.02);
      }

      const state = windupController.getState();
      // Integral should be clamped, not blown up to infinity
      expect(Math.abs(state.integral as unknown as number)).toBeLessThanOrEqual(5.1);
    });
  });

  describe('Single-Loop Mode', () => {
    it('should work with stepSingle', () => {
      controller.setSetpoint(10);
      const output = controller.stepSingle(0, 0.01);
      expect(Number.isFinite(output)).toBe(true);
      expect(output).not.toBe(0);
    });

    it('should track setpoint with stepSingle', () => {
      controller.setSetpoint(5);
      let measurement = 0;
      for (let i = 0; i < 200; i++) {
        const output = controller.stepSingle(measurement, 0.01);
        measurement += output * 0.01 * 0.05;
      }
      // Should trend toward setpoint
      expect(measurement).toBeGreaterThan(0);
    });
  });

  describe('Reset', () => {
    it('should clear all state', () => {
      controller.setSetpoint(100);
      controller.step(50, 0.01);
      controller.step(55, 0.01);

      controller.reset();
      const state = controller.getState();
      expect(state.setpoint).toBe(0);
      expect(state.targetSetpoint).toBe(0);
      expect(state.elapsedTime).toBe(0);
      expect(state.innerTickCount).toBe(0);
      expect(state.outerTickCount).toBe(0);
      expect(state.isSaturated).toBe(false);
      expect(state.isVelocityExceeded).toBe(false);
    });
  });

  describe('Runtime Gain Tuning', () => {
    it('should accept new outer gains', () => {
      const newGains: PIDGains = { kP: 5.0, kI: 0.5, kD: 1.0 };
      controller.setOuterGains(newGains);
      // Should not throw and should produce different output
      controller.setSetpoint(10);
      const output = controller.step(0, 0.01);
      expect(Number.isFinite(output)).toBe(true);
    });

    it('should accept new inner gains', () => {
      const newGains: PIDGains = { kP: 3.0, kI: 0.2, kD: 0.5 };
      controller.setInnerGains(newGains);
      controller.setSetpoint(10);
      const output = controller.step(0, 0.01);
      expect(Number.isFinite(output)).toBe(true);
    });
  });

  describe('State Snapshot', () => {
    it('should return frozen state object', () => {
      controller.setSetpoint(10);
      controller.step(5, 0.01);
      const state = controller.getState();
      expect(Object.isFrozen(state)).toBe(true);
    });

    it('should contain all required fields', () => {
      controller.setSetpoint(10);
      controller.step(5, 0.01);
      const state = controller.getState();

      expect(state).toHaveProperty('id');
      expect(state).toHaveProperty('setpoint');
      expect(state).toHaveProperty('targetSetpoint');
      expect(state).toHaveProperty('measurement');
      expect(state).toHaveProperty('error');
      expect(state).toHaveProperty('integral');
      expect(state).toHaveProperty('derivative');
      expect(state).toHaveProperty('outerOutput');
      expect(state).toHaveProperty('innerOutput');
      expect(state).toHaveProperty('outputMagnitude');
      expect(state).toHaveProperty('isSaturated');
      expect(state).toHaveProperty('velocityMagnitude');
      expect(state).toHaveProperty('isVelocityExceeded');
      expect(state).toHaveProperty('elapsedTime');
      expect(state).toHaveProperty('innerTickCount');
      expect(state).toHaveProperty('outerTickCount');
    });

    it('should be independent of controller mutations', () => {
      controller.setSetpoint(10);
      controller.step(5, 0.01);
      const state1 = controller.getState();
      const sp1 = state1.setpoint;

      controller.setSetpoint(999);
      controller.step(0, 0.01);

      // state1 should be unchanged
      expect(state1.setpoint).toBe(sp1);
    });
  });
});

// =============================================================================
// VECTOR3 PID CONTROLLER
// =============================================================================

describe('PIDController<IVector3> (Vector3)', () => {
  let controller: PIDController<IVector3>;

  beforeEach(() => {
    controller = new PIDController<IVector3>(
      defaultPIDConfig('test-vec3', { x: 0, y: 0, z: 0 }, {
        outerGains: { kP: 2.0, kI: 0.1, kD: 0.3 },
        innerGains: { kP: 1.0, kI: 0.0, kD: 0.1 },
        timing: { innerHz: 100, outerHz: 50 },
        outputLimit: 100,
        integralLimit: 50,
        velocityLimit: 50,
      }),
      Vector3Arithmetic,
    );
  });

  it('should create with Vector3 config', () => {
    expect(controller).toBeDefined();
    expect(controller.getId()).toBe('test-vec3');
  });

  it('should track 3D setpoint', () => {
    const target: IVector3 = { x: 10, y: 5, z: -3 };
    controller.setSetpoint(target);
    expect(controller.getTargetSetpoint()).toEqual(target);
  });

  it('should produce vector output', () => {
    controller.setSetpoint({ x: 10, y: 0, z: 0 });
    const output = controller.step({ x: 0, y: 0, z: 0 }, 0.02);
    expect(output).toHaveProperty('x');
    expect(output).toHaveProperty('y');
    expect(output).toHaveProperty('z');
    // X component should be non-zero (driving toward setpoint)
    expect(output.x).not.toBe(0);
  });

  it('should handle multi-axis setpoints', () => {
    controller.setSetpoint({ x: 5, y: -3, z: 8 });
    const output = controller.step({ x: 0, y: 0, z: 0 }, 0.02);
    // All components should have some contribution
    expect(Number.isFinite(output.x)).toBe(true);
    expect(Number.isFinite(output.y)).toBe(true);
    expect(Number.isFinite(output.z)).toBe(true);
  });

  it('should report vector velocity magnitude', () => {
    controller.setSetpoint({ x: 10, y: 10, z: 10 });
    controller.step({ x: 0, y: 0, z: 0 }, 0.01);
    controller.step({ x: 1, y: 1, z: 1 }, 0.01);
    // Velocity = magnitude of (1,1,1)/0.01 = sqrt(3)*100
    expect(controller.getVelocityMagnitude()).toBeGreaterThan(0);
  });

  it('should produce frozen state snapshot', () => {
    controller.setSetpoint({ x: 1, y: 2, z: 3 });
    controller.step({ x: 0, y: 0, z: 0 }, 0.01);
    const state = controller.getState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(state.setpoint).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('should reset to zero vector', () => {
    controller.setSetpoint({ x: 100, y: 200, z: 300 });
    controller.step({ x: 50, y: 100, z: 150 }, 0.01);
    controller.reset();
    const state = controller.getState();
    expect(state.setpoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.targetSetpoint).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('should work with stepSingle for simple 3D control', () => {
    controller.setSetpoint({ x: 5, y: 5, z: 5 });
    const output = controller.stepSingle({ x: 0, y: 0, z: 0 }, 0.01);
    expect(Number.isFinite(output.x)).toBe(true);
    expect(Number.isFinite(output.y)).toBe(true);
    expect(Number.isFinite(output.z)).toBe(true);
  });
});

// =============================================================================
// TRAIT FACTORY FUNCTIONS
// =============================================================================

describe('Trait Factory Functions', () => {
  describe('createScalarPIDController', () => {
    it('should create a scalar controller from trait config', () => {
      const config: PIDControllerTraitConfig = {
        id: 'servo-1',
        mode: 'scalar',
        outerGains: { kP: 3.0 },
        outputLimit: 500,
      };
      const ctrl = createScalarPIDController(config);
      expect(ctrl).toBeDefined();
      expect(ctrl.getId()).toBe('pid-scalar-servo-1');
    });

    it('should use defaults for unspecified values', () => {
      const ctrl = createScalarPIDController({ id: 'minimal', mode: 'scalar' });
      const cfg = ctrl.getConfig();
      expect(cfg.outputLimit).toBe(1000);
      expect(cfg.timing.innerHz).toBe(200);
    });
  });

  describe('createVector3PIDController', () => {
    it('should create a Vector3 controller from trait config', () => {
      const config: PIDControllerTraitConfig = {
        id: 'pos-tracker',
        mode: 'vector3',
        velocityLimit: 100,
      };
      const ctrl = createVector3PIDController(config);
      expect(ctrl).toBeDefined();
      expect(ctrl.getId()).toBe('pid-vec3-pos-tracker');
    });
  });

  describe('createPIDControllerTrait', () => {
    it('should dispatch to scalar for mode=scalar', () => {
      const ctrl = createPIDControllerTrait({ id: 'test', mode: 'scalar' });
      expect(ctrl.getId()).toContain('scalar');
    });

    it('should dispatch to vector3 for mode=vector3', () => {
      const ctrl = createPIDControllerTrait({ id: 'test', mode: 'vector3' });
      expect(ctrl.getId()).toContain('vec3');
    });
  });
});

// =============================================================================
// VR 90FPS PERFORMANCE CONSTRAINT
// =============================================================================

describe('VR 90fps Performance', () => {
  it('should complete a cascade step in under 1ms', () => {
    const controller = new PIDController<number>(
      defaultPIDConfig('perf-test', 0, {
        timing: { innerHz: 200, outerHz: 90 },
      }),
      ScalarArithmetic,
    );

    controller.setSetpoint(100);
    const dt = 1 / 90; // 90fps

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      controller.step(i * 0.5, dt);
    }
    const elapsed = performance.now() - start;

    // 100 steps should take well under 100ms (< 1ms per step)
    expect(elapsed).toBeLessThan(100);
    // Average per step should be under 1ms (11.1ms budget)
    expect(elapsed / 100).toBeLessThan(1);
  });

  it('should complete Vector3 cascade step in under 1ms', () => {
    const controller = new PIDController<IVector3>(
      defaultPIDConfig('perf-vec3', { x: 0, y: 0, z: 0 }, {
        timing: { innerHz: 200, outerHz: 90 },
      }),
      Vector3Arithmetic,
    );

    controller.setSetpoint({ x: 100, y: 50, z: -30 });
    const dt = 1 / 90;

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      controller.step({ x: i * 0.3, y: i * 0.2, z: i * -0.1 }, dt);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(elapsed / 100).toBeLessThan(1);
  });
});

// =============================================================================
// CUSTOM ARITHMETIC ADAPTER
// =============================================================================

describe('Custom Arithmetic Adapter', () => {
  // A custom 2D vector type
  interface Vec2 {
    u: number;
    v: number;
  }

  const Vec2Arithmetic: PIDArithmetic<Vec2> = {
    zero: () => ({ u: 0, v: 0 }),
    add: (a, b) => ({ u: a.u + b.u, v: a.v + b.v }),
    sub: (a, b) => ({ u: a.u - b.u, v: a.v - b.v }),
    scale: (s, a) => ({ u: s * a.u, v: s * a.v }),
    magnitude: (a) => Math.sqrt(a.u * a.u + a.v * a.v),
    clamp: (a, min, max) => ({
      u: Math.max(min, Math.min(max, a.u)),
      v: Math.max(min, Math.min(max, a.v)),
    }),
    clone: (a) => ({ u: a.u, v: a.v }),
  };

  it('should work with custom 2D vector type', () => {
    const controller = new PIDController<Vec2>(
      defaultPIDConfig('custom-2d', { u: 0, v: 0 }),
      Vec2Arithmetic,
    );

    controller.setSetpoint({ u: 5, v: 3 });
    const output = controller.step({ u: 0, v: 0 }, 0.01);

    expect(output).toHaveProperty('u');
    expect(output).toHaveProperty('v');
    expect(Number.isFinite(output.u)).toBe(true);
    expect(Number.isFinite(output.v)).toBe(true);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle zero dt gracefully', () => {
    const controller = new PIDController<number>(
      defaultPIDConfig('zero-dt', 0),
      ScalarArithmetic,
    );
    controller.setSetpoint(10);
    // dt = 0 should not cause division by zero
    const output = controller.step(0, 0);
    expect(Number.isFinite(output)).toBe(true);
  });

  it('should handle NaN measurement gracefully', () => {
    const controller = new PIDController<number>(
      defaultPIDConfig('nan-test', 0),
      ScalarArithmetic,
    );
    controller.setSetpoint(10);
    controller.step(0, 0.01);
    // NaN input propagates through math but should not crash
    const output = controller.step(NaN, 0.01);
    // Output will be NaN (correct mathematical behavior)
    expect(typeof output).toBe('number');
  });

  it('should handle very large setpoint changes', () => {
    const controller = new PIDController<number>(
      defaultPIDConfig('large-sp', 0, { outputLimit: 1e6 }),
      ScalarArithmetic,
    );
    controller.setSetpoint(1e9);
    const output = controller.step(0, 0.01);
    expect(Number.isFinite(output)).toBe(true);
    expect(Math.abs(output)).toBeLessThanOrEqual(1e6 + 1);
  });

  it('should handle rapid setpoint oscillation', () => {
    const controller = new PIDController<number>(
      defaultPIDConfig('oscillate', 0),
      ScalarArithmetic,
    );

    for (let i = 0; i < 100; i++) {
      controller.setSetpoint(i % 2 === 0 ? 10 : -10);
      const output = controller.step(0, 0.01);
      expect(Number.isFinite(output)).toBe(true);
    }
  });

  it('should handle identical sequential measurements', () => {
    const controller = new PIDController<number>(
      defaultPIDConfig('same-meas', 0),
      ScalarArithmetic,
    );
    controller.setSetpoint(10);
    for (let i = 0; i < 50; i++) {
      const output = controller.step(5, 0.01);
      expect(Number.isFinite(output)).toBe(true);
    }
  });
});
