/**
 * FractureSystem.test.ts
 *
 * Tests for the main fracture system.
 *
 * Week 8: Explosive Demolition - Day 1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FractureSystem } from '../FractureSystem';
import { Fracturable, MATERIALS } from '../Fracturable';

describe('FractureSystem', () => {
  let system: FractureSystem;

  beforeEach(() => {
    system = new FractureSystem();
  });

  describe('Initialization', () => {
    it('should create system with default config', () => {
      expect(system).toBeDefined();
    });

    it('should create system with custom config', () => {
      const customSystem = new FractureSystem({
        maxFragments: 5000,
        autoDeactivate: false,
      });

      expect(customSystem).toBeDefined();
    });
  });

  describe('Object Management', () => {
    it('should add fracturable object', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.CONCRETE,
      });

      system.addObject(object);

      const retrieved = system.getObject(object.id);
      expect(retrieved).toBe(object);
    });

    it('should remove object', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.CONCRETE,
      });

      system.addObject(object);
      system.removeObject(object.id);

      const retrieved = system.getObject(object.id);
      expect(retrieved).toBeUndefined();
    });

    it('should get all objects', () => {
      const obj1 = new Fracturable({
        geometry: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 10, y: 10, z: 10 },
        },
        material: MATERIALS.CONCRETE,
      });

      const obj2 = new Fracturable({
        geometry: {
          min: { x: 20, y: 0, z: 0 },
          max: { x: 30, y: 10, z: 10 },
        },
        material: MATERIALS.BRICK,
      });

      system.addObject(obj1);
      system.addObject(obj2);

      const objects = system.getObjects();
      expect(objects.length).toBe(2);
    });
  });

  describe('Impact Application', () => {
    it('should apply impact to object', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);

      const fractured = system.applyImpactToObject(
        object.id,
        { x: 10000, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
      );

      expect(fractured).toBe(true);
    });

    it('should return false for non-existent object', () => {
      const fractured = system.applyImpactToObject(
        'invalid_id',
        { x: 10000, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }
      );

      expect(fractured).toBe(false);
    });
  });

  describe('Object Fracturing', () => {
    it('should fracture object into fragments', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.BRICK,
        fragmentCount: 10,
      });

      system.addObject(object);

      system.applyImpactToObject(object.id, { x: 5000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragments = system.getFragments();
      expect(fragments.length).toBeGreaterThan(0);
    });

    it('should remove object after fracturing', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);

      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const retrieved = system.getObject(object.id);
      expect(retrieved).toBeUndefined();
    });

    it('should record fracture event', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);

      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 1, y: 2, z: 3 });

      const events = system.getFractureEvents();
      expect(events.length).toBe(1);
      expect(events[0].impactPoint).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should not fracture if already fractured', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      object.applyImpact({ x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragments = system.fractureObject(object);

      expect(fragments.length).toBeGreaterThan(0);

      const fragmentsAgain = system.fractureObject(object);

      expect(fragmentsAgain.length).toBe(0);
    });
  });

  describe('Fragment Management', () => {
    it('should get all fragments', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        fragmentCount: 8,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragments = system.getFragments();
      expect(fragments.length).toBeGreaterThan(0);
    });

    it('should get active fragments', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const activeFragments = system.getActiveFragments();
      expect(activeFragments.length).toBeGreaterThan(0);
    });

    it('should clear fragments', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      system.clearFragments();

      const fragments = system.getFragments();
      expect(fragments.length).toBe(0);
    });
  });

  describe('Fragment Update', () => {
    it('should update fragments', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 50, z: 0 },
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragment = system.getFragments()[0];
      const posBefore = { ...fragment.physics.position };

      system.update(0.1);

      const posAfter = fragment.physics.position;
      expect(posAfter.y).not.toBe(posBefore.y);
    });

    it('should not update with zero time', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragment = system.getFragments()[0];
      const posBefore = { ...fragment.physics.position };

      system.update(0);

      expect(fragment.physics.position).toEqual(posBefore);
    });

    it('should auto-deactivate fragments at rest', () => {
      const systemWithAuto = new FractureSystem({
        autoDeactivate: true,
        deactivationThreshold: 0.1,
      });

      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        position: { x: 0, y: 0.5, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
      });

      systemWithAuto.addObject(object);
      systemWithAuto.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragments = systemWithAuto.getFragments();

      // Simulate until fragments settle
      for (let i = 0; i < 100; i++) {
        systemWithAuto.update(0.01);
      }

      const activeCount = systemWithAuto.getActiveFragments().length;
      expect(activeCount).toBeLessThan(fragments.length);
    });
  });

  describe('Statistics', () => {
    it('should track total objects', () => {
      const obj1 = new Fracturable({
        geometry: {
          min: { x: 0, y: 0, z: 0 },
          max: { x: 10, y: 10, z: 10 },
        },
        material: MATERIALS.CONCRETE,
      });

      const obj2 = new Fracturable({
        geometry: {
          min: { x: 20, y: 0, z: 0 },
          max: { x: 30, y: 10, z: 10 },
        },
        material: MATERIALS.BRICK,
      });

      system.addObject(obj1);
      system.addObject(obj2);

      const stats = system.getStatistics();
      expect(stats.totalObjects).toBe(2);
    });

    it('should track fractured objects', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const stats = system.getStatistics();
      expect(stats.fracturedObjects).toBe(1);
    });

    it('should track total fragments', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const stats = system.getStatistics();
      expect(stats.totalFragments).toBeGreaterThan(0);
    });

    it('should calculate average fragments per fracture', () => {
      const obj1 = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        fragmentCount: 10,
      });

      const obj2 = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        fragmentCount: 10,
      });

      system.addObject(obj1);
      system.addObject(obj2);

      system.applyImpactToObject(obj1.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
      system.applyImpactToObject(obj2.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const stats = system.getStatistics();
      expect(stats.avgFragmentsPerFracture).toBeGreaterThan(0);
    });
  });

  describe('Reset', () => {
    it('should reset system', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      system.reset();

      const fragments = system.getFragments();
      expect(fragments.length).toBe(0);
    });

    it('should clear fracture events on reset', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      system.reset();

      const events = system.getFractureEvents();
      expect(events.length).toBe(0);
    });

    it('should reset objects', () => {
      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
      });

      system.addObject(object);
      system.applyImpactToObject(object.id, { x: 5000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      // Object would be removed after fracturing, so add it back
      system.addObject(object);
      object.reset(); // Manually reset to test

      expect(object.isFractured()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle max fragments limit', () => {
      const limitedSystem = new FractureSystem({
        maxFragments: 5,
      });

      const object = new Fracturable({
        geometry: {
          min: { x: -5, y: -5, z: -5 },
          max: { x: 5, y: 5, z: 5 },
        },
        material: MATERIALS.GLASS,
        fragmentCount: 100,
      });

      limitedSystem.addObject(object);
      limitedSystem.applyImpactToObject(object.id, { x: 10000, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

      const fragments = limitedSystem.getFragments();
      expect(fragments.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty system', () => {
      const stats = system.getStatistics();

      expect(stats.totalObjects).toBe(0);
      expect(stats.totalFragments).toBe(0);
    });

    it('should handle update with no fragments', () => {
      expect(() => {
        system.update(0.1);
      }).not.toThrow();
    });
  });
});
