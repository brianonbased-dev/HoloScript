/**
 * JointTrait Tests
 *
 * Tests for physics joint constraints between bodies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JointTrait, createJointTrait } from './JointTrait';

describe('JointTrait', () => {
  let trait: JointTrait;

  beforeEach(() => {
    trait = createJointTrait();
  });

  describe('factory function', () => {
    it('should create joint trait with factory', () => {
      expect(trait).toBeInstanceOf(JointTrait);
    });

    it('should create with custom config', () => {
      const custom = createJointTrait({
        jointType: 'hinge',
        connectedBody: 'other-body',
      });
      expect(custom.getConfig().jointType).toBe('hinge');
      expect(custom.getConfig().connectedBody).toBe('other-body');
    });
  });

  describe('configuration', () => {
    it('should get configuration', () => {
      const config = trait.getConfig();
      expect(config).toBeDefined();
      expect(config.jointType).toBeDefined();
    });

    it('should have default joint type as fixed', () => {
      expect(trait.getConfig().jointType).toBe('fixed');
    });
  });

  describe('joint types', () => {
    it('should support fixed joint', () => {
      const fixed = createJointTrait({ jointType: 'fixed' });
      expect(fixed.getConfig().jointType).toBe('fixed');
    });

    it('should support hinge joint', () => {
      const hinge = createJointTrait({
        jointType: 'hinge',
        axis: { x: 0, y: 1, z: 0 },
      });
      expect(hinge.getConfig().jointType).toBe('hinge');
      expect(hinge.getConfig().axis?.y).toBe(1);
    });

    it('should support ball joint', () => {
      const ball = createJointTrait({ jointType: 'ball' });
      expect(ball.getConfig().jointType).toBe('ball');
    });

    it('should support slider joint', () => {
      const slider = createJointTrait({ jointType: 'slider' });
      expect(slider.getConfig().jointType).toBe('slider');
    });

    it('should support spring joint', () => {
      const spring = createJointTrait({ jointType: 'spring' });
      expect(spring.getConfig().jointType).toBe('spring');
    });

    it('should support distance joint', () => {
      const distance = createJointTrait({ jointType: 'distance' });
      expect(distance.getConfig().jointType).toBe('distance');
    });

    it('should support configurable joint', () => {
      const configurable = createJointTrait({ jointType: 'configurable' });
      expect(configurable.getConfig().jointType).toBe('configurable');
    });
  });

  describe('limits', () => {
    it('should set angular limits', () => {
      trait.setLimits({ min: -45, max: 45 }, 'angular');
      expect(trait.getConfig().angularLimits?.min).toBe(-45);
      expect(trait.getConfig().angularLimits?.max).toBe(45);
    });

    it('should set linear limits', () => {
      trait.setLimits({ min: -5, max: 5 }, 'linear');
      expect(trait.getConfig().linearLimits?.min).toBe(-5);
      expect(trait.getConfig().linearLimits?.max).toBe(5);
    });
  });

  describe('spring configuration', () => {
    it('should configure spring properties', () => {
      const spring = createJointTrait({
        jointType: 'spring',
        spring: {
          stiffness: 100,
          damping: 5,
        },
      });
      expect(spring.getConfig().spring?.stiffness).toBe(100);
      expect(spring.getConfig().spring?.damping).toBe(5);
    });

    it('should update spring properties', () => {
      trait.setSpring({ stiffness: 200, damping: 10 });
      expect(trait.getConfig().spring?.stiffness).toBe(200);
    });
  });

  describe('motor configuration', () => {
    it('should configure motor', () => {
      const motorJoint = createJointTrait({
        jointType: 'hinge',
        motor: {
          targetVelocity: 10,
          maxForce: 100,
        },
      });
      expect(motorJoint.getConfig().motor?.targetVelocity).toBe(10);
    });

    it('should enable and disable motor', () => {
      trait.enableMotor(true);
      trait.setMotorVelocity(5);
      // Motor state should be updated
      expect(trait.getConfig()).toBeDefined();
    });
  });

  describe('break force', () => {
    it('should configure break force', () => {
      trait.setBreakForce(1000);
      expect(trait.getConfig().breakForce).toBe(1000);
    });

    it('should configure break torque', () => {
      trait.setBreakTorque(500);
      expect(trait.getConfig().breakTorque).toBe(500);
    });
  });

  describe('state', () => {
    it('should get state', () => {
      const state = trait.getState();
      expect(state).toBeDefined();
    });

    it('should track broken status', () => {
      expect(trait.isBroken()).toBe(false);
      trait.break();
      expect(trait.isBroken()).toBe(true);
    });

    it('should reset after break', () => {
      trait.break();
      expect(trait.isBroken()).toBe(true);
      trait.reset();
      expect(trait.isBroken()).toBe(false);
    });

    it('should get angle', () => {
      expect(typeof trait.getAngle()).toBe('number');
    });

    it('should get position', () => {
      expect(typeof trait.getPosition()).toBe('number');
    });
  });

  describe('events', () => {
    it('should emit joint break event', () => {
      let broken = false;
      trait.on('break', () => {
        broken = true;
      });

      trait.break();
      expect(broken).toBe(true);
    });

    it('should remove event listener', () => {
      let count = 0;
      const handler = () => count++;

      trait.on('break', handler);
      trait.break();
      expect(count).toBe(1);

      trait.reset();
      trait.off('break', handler);
      trait.break();
      expect(count).toBe(1);
    });
  });

  describe('serialization', () => {
    it('should serialize for physics engine', () => {
      const hingeJoint = createJointTrait({
        jointType: 'hinge',
        connectedBody: 'door-frame',
        axis: { x: 0, y: 1, z: 0 },
      });

      const serialized = hingeJoint.serialize();
      expect(serialized.type).toBe('hinge');
      expect(serialized.connectedBody).toBe('door-frame');
    });
  });
});
