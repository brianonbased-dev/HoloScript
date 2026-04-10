/**
 * IKTrait Tests
 *
 * Tests for inverse kinematics with FABRIK solver.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IKTrait, createIKTrait } from './IKTrait';

describe('IKTrait', () => {
  let trait: IKTrait;

  beforeEach(() => {
    trait = createIKTrait();
  });

  describe('factory function', () => {
    it('should create IK trait with factory', () => {
      expect(trait).toBeInstanceOf(IKTrait);
    });

    it('should create with custom config', () => {
      const custom = createIKTrait({
        solver: 'ccd',
        iterations: 20,
      });
      expect(custom.getConfig().solver).toBe('ccd');
      expect(custom.getConfig().iterations).toBe(20);
    });
  });

  describe('configuration', () => {
    it('should get configuration', () => {
      const config = trait.getConfig();
      expect(config).toBeDefined();
      expect(config.solver).toBeDefined();
    });

    it('should have default solver as fabrik', () => {
      expect(trait.getConfig().solver).toBe('fabrik');
    });

    it('should have default iterations', () => {
      expect(trait.getConfig().iterations).toBe(10);
    });
  });

  describe('solver types', () => {
    it('should support fabrik solver', () => {
      const fabrik = createIKTrait({ solver: 'fabrik' });
      expect(fabrik.getConfig().solver).toBe('fabrik');
    });

    it('should support ccd solver', () => {
      const ccd = createIKTrait({ solver: 'ccd' });
      expect(ccd.getConfig().solver).toBe('ccd');
    });

    it('should support two-bone solver', () => {
      const twoBone = createIKTrait({ solver: 'two-bone' });
      expect(twoBone.getConfig().solver).toBe('two-bone');
    });

    it('should support full-body solver', () => {
      const fullBody = createIKTrait({ solver: 'full-body' });
      expect(fullBody.getConfig().solver).toBe('full-body');
    });
  });

  describe('target', () => {
    it('should set target by name', () => {
      trait.setTarget('hand_target');
      expect(trait.getConfig().target).toBe('hand_target');
    });

    it('should set target by position', () => {
      trait.setTarget({ x: 1, y: 2, z: 3 });
      expect(trait.getConfig().targetPosition).toEqual({ x: 1, y: 2, z: 3 });
    });
  });

  describe('pole target', () => {
    it('should set pole target by name', () => {
      trait.setPoleTarget('elbow_hint');
      expect(trait.getConfig().poleTarget).toBe('elbow_hint');
    });

    it('should set pole target by position', () => {
      trait.setPoleTarget({ x: 0, y: 1, z: -0.5 });
      expect(trait.getConfig().polePosition).toEqual({ x: 0, y: 1, z: -0.5 });
    });
  });

  describe('weight', () => {
    it('should set and get weight', () => {
      trait.setWeight(0.5);
      expect(trait.getWeight()).toBe(0.5);
    });

    it('should clamp weight to 0-1 range', () => {
      trait.setWeight(1.5);
      expect(trait.getWeight()).toBe(1.0);

      trait.setWeight(-0.5);
      expect(trait.getWeight()).toBe(0);
    });
  });

  describe('chain', () => {
    it('should set and get chain', () => {
      const chain = {
        name: 'arm',
        bones: [
          { name: 'shoulder', length: 0.3 },
          { name: 'elbow', length: 0.3 },
          { name: 'wrist', length: 0.1 },
        ],
      };
      trait.setChain(chain);
      expect(trait.getChain()?.name).toBe('arm');
    });
  });

  describe('solve', () => {
    it('should solve IK', () => {
      trait.setTarget('target');
      const result = trait.solve({ x: 1, y: 0, z: 0 });
      expect(result).toBeDefined();
      expect(result.reached).toBeDefined();
    });

    it('should return last result after solving', () => {
      // Set up a chain first
      const chain = {
        name: 'arm',
        bones: [
          { name: 'shoulder', length: 0.3 },
          { name: 'elbow', length: 0.3 },
          { name: 'wrist', length: 0.1 },
        ],
      };
      trait.setChain(chain);

      trait.solve({ x: 0.5, y: 0, z: 0 });
      const lastResult = trait.getLastResult();
      expect(lastResult).not.toBeNull();
    });
  });

  describe('enable/disable', () => {
    it('should track enabled state', () => {
      expect(trait.isEnabled()).toBe(true);

      trait.setEnabled(false);
      expect(trait.isEnabled()).toBe(false);
    });
  });

  describe('serialization', () => {
    it('should serialize for animation system', () => {
      trait.setTarget('hand');
      trait.setWeight(0.8);

      const serialized = trait.serialize();
      expect(serialized.target).toBe('hand');
      expect(serialized.weight).toBe(0.8);
    });
  });
});
