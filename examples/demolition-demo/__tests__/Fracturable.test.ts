/**
 * Fracturable.test.ts
 *
 * Tests for fracturable objects.
 *
 * Week 8: Explosive Demolition - Day 1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Fracturable, MATERIALS, type FracturableConfig } from '../Fracturable';

describe('Fracturable', () => {
  let config: FracturableConfig;

  beforeEach(() => {
    config = {
      geometry: {
        min: { x: -5, y: -5, z: -5 },
        max: { x: 5, y: 5, z: 5 },
      },
      material: MATERIALS.CONCRETE,
      position: { x: 0, y: 10, z: 0 },
    };
  });

  describe('Initialization', () => {
    it('should create fracturable object', () => {
      const object = new Fracturable(config);

      expect(object.id).toBeDefined();
      expect(object.name).toBeDefined();
    });

    it('should calculate mass from volume and density', () => {
      const object = new Fracturable(config);

      const expectedVolume = 10 * 10 * 10;
      const expectedMass = expectedVolume * MATERIALS.CONCRETE.density;

      expect(object.mass).toBe(expectedMass);
    });

    it('should initialize health from fracture threshold', () => {
      const object = new Fracturable(config);

      expect(object.getHealth()).toBe(MATERIALS.CONCRETE.fractureThreshold);
    });

    it('should not be fractured initially', () => {
      const object = new Fracturable(config);

      expect(object.isFractured()).toBe(false);
    });
  });

  describe('Impact Application', () => {
    it('should apply impact to object', () => {
      const object = new Fracturable(config);

      const fractured = object.applyImpact({ x: 1000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(fractured).toBe(false);
      expect(object.getHealth()).toBeLessThan(MATERIALS.CONCRETE.fractureThreshold);
    });

    it('should fracture when health depleted', () => {
      const object = new Fracturable(config);

      const fractured = object.applyImpact({ x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(fractured).toBe(true);
      expect(object.isFractured()).toBe(true);
    });

    it('should record fracture event', () => {
      const object = new Fracturable(config);

      object.applyImpact({ x: 10000, y: 0, z: 0 }, { x: 1, y: 2, z: 3 });

      const event = object.getFractureEvent();
      expect(event).toBeDefined();
      expect(event?.impactPoint).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should not apply impact after fractured', () => {
      const object = new Fracturable(config);

      object.applyImpact({ x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fracturedAgain = object.applyImpact({ x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(fracturedAgain).toBe(false);
    });

    it('should change velocity from impact', () => {
      const object = new Fracturable(config);
      const velBefore = { ...object.velocity };

      object.applyImpact({ x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(object.velocity.x).toBeGreaterThan(velBefore.x);
    });
  });

  describe('Material Properties', () => {
    it('should use concrete material', () => {
      const object = new Fracturable({
        ...config,
        material: MATERIALS.CONCRETE,
      });

      expect(object.material.density).toBe(MATERIALS.CONCRETE.density);
      expect(object.material.fractureThreshold).toBe(MATERIALS.CONCRETE.fractureThreshold);
    });

    it('should use glass material', () => {
      const object = new Fracturable({
        ...config,
        material: MATERIALS.GLASS,
      });

      expect(object.material.fractureThreshold).toBe(MATERIALS.GLASS.fractureThreshold);
    });

    it('should fracture easier with lower threshold', () => {
      const weakObject = new Fracturable({
        ...config,
        material: { ...MATERIALS.GLASS, fractureThreshold: 100 },
      });

      const fractured = weakObject.applyImpact({ x: 150, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(fractured).toBe(true);
    });
  });

  describe('Fracture Configuration', () => {
    it('should get fracture type', () => {
      const object = new Fracturable({
        ...config,
        fractureType: 'radial',
      });

      expect(object.getFractureType()).toBe('radial');
    });

    it('should get fragment count', () => {
      const object = new Fracturable({
        ...config,
        fragmentCount: 25,
      });

      expect(object.getFragmentCount()).toBe(25);
    });

    it('should default to voronoi pattern', () => {
      const object = new Fracturable(config);

      expect(object.getFractureType()).toBe('voronoi');
    });
  });

  describe('Health Management', () => {
    it('should track health', () => {
      const object = new Fracturable(config);

      object.applyImpact({ x: 1000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(object.getHealth()).toBeLessThan(MATERIALS.CONCRETE.fractureThreshold);
      expect(object.getHealth()).toBeGreaterThanOrEqual(0);
    });

    it('should calculate health percentage', () => {
      const object = new Fracturable(config);

      expect(object.getHealthPercentage()).toBe(100);

      object.applyImpact({ x: 2500, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(object.getHealthPercentage()).toBeLessThan(100);
      expect(object.getHealthPercentage()).toBeGreaterThan(0);
    });

    it('should clamp health to zero', () => {
      const object = new Fracturable(config);

      object.applyImpact({ x: 20000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(object.getHealth()).toBe(0);
    });
  });

  describe('Geometry Queries', () => {
    it('should get volume', () => {
      const object = new Fracturable(config);

      expect(object.getVolume()).toBe(1000);
    });

    it('should get center', () => {
      const object = new Fracturable(config);

      const center = object.getCenter();

      expect(center).toEqual({ x: 0, y: 10, z: 0 });
    });

    it('should check if point is inside', () => {
      const object = new Fracturable(config);

      expect(object.containsPoint({ x: 0, y: 10, z: 0 })).toBe(true);
      expect(object.containsPoint({ x: 100, y: 100, z: 100 })).toBe(false);
    });

    it('should calculate distance from point', () => {
      const object = new Fracturable(config);

      const dist = object.distanceFromPoint({ x: 0, y: 10, z: 0 });

      expect(dist).toBeCloseTo(0, 1);
    });
  });

  describe('Reset', () => {
    it('should reset fractured object', () => {
      const object = new Fracturable(config);

      object.applyImpact({ x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      expect(object.isFractured()).toBe(true);

      object.reset();

      expect(object.isFractured()).toBe(false);
      expect(object.getHealth()).toBe(MATERIALS.CONCRETE.fractureThreshold);
    });

    it('should reset velocity', () => {
      const object = new Fracturable(config);
      object.velocity = { x: 10, y: 10, z: 10 };

      object.reset();

      expect(object.velocity).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe('Material Presets', () => {
    it('should have concrete preset', () => {
      expect(MATERIALS.CONCRETE).toBeDefined();
      expect(MATERIALS.CONCRETE.density).toBeGreaterThan(0);
    });

    it('should have brick preset', () => {
      expect(MATERIALS.BRICK).toBeDefined();
      expect(MATERIALS.BRICK.fractureThreshold).toBeLessThan(MATERIALS.CONCRETE.fractureThreshold);
    });

    it('should have glass preset', () => {
      expect(MATERIALS.GLASS).toBeDefined();
      expect(MATERIALS.GLASS.fractureThreshold).toBeLessThan(MATERIALS.BRICK.fractureThreshold);
    });

    it('should have wood preset', () => {
      expect(MATERIALS.WOOD).toBeDefined();
      expect(MATERIALS.WOOD.density).toBeLessThan(MATERIALS.CONCRETE.density);
    });

    it('should have metal preset', () => {
      expect(MATERIALS.METAL).toBeDefined();
      expect(MATERIALS.METAL.fractureThreshold).toBeGreaterThan(
        MATERIALS.CONCRETE.fractureThreshold
      );
    });

    it('should have stone preset', () => {
      expect(MATERIALS.STONE).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero volume object', () => {
      const zeroVolConfig = {
        ...config,
        geometry: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 0, y: 0, z: 0 },
        },
      };

      const object = new Fracturable(zeroVolConfig);

      expect(object.mass).toBe(0);
    });

    it('should handle very weak material', () => {
      const weakConfig = {
        ...config,
        material: { fractureThreshold: 1 },
      };

      const object = new Fracturable(weakConfig);

      const fractured = object.applyImpact({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(fractured).toBe(true);
    });

    it('should handle very strong material', () => {
      const strongConfig = {
        ...config,
        material: { fractureThreshold: 1000000 },
      };

      const object = new Fracturable(strongConfig);

      const fractured = object.applyImpact({ x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      expect(fractured).toBe(false);
    });
  });
});
