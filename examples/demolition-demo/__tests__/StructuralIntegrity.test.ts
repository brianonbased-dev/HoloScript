/**
 * StructuralIntegrity.test.ts
 *
 * Tests for structural integrity system.
 *
 * Week 8: Explosive Demolition - Day 5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StructuralIntegrity } from '../StructuralIntegrity';
import { StructuralElement } from '../StructuralElement';

describe('StructuralElement', () => {
  let element: StructuralElement;

  beforeEach(() => {
    element = new StructuralElement({
      position: { x: 0, y: 10, z: 0 },
      size: { x: 1, y: 5, z: 1 },
      maxLoad: 100000,
      mass: 1000,
    });
  });

  describe('Initialization', () => {
    it('should create structural element', () => {
      expect(element).toBeDefined();
      expect(element.id).toBeDefined();
    });

    it('should use default values', () => {
      const defaultElement = new StructuralElement({
        position: { x: 0, y: 0, z: 0 },
      });

      expect(defaultElement.type).toBe('beam');
      expect(defaultElement.maxLoad).toBeGreaterThan(0);
    });

    it('should set foundation flag', () => {
      const foundation = new StructuralElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      expect(foundation.isFoundation).toBe(true);
    });
  });

  describe('Connections', () => {
    it('should add connection', () => {
      element.addConnection('elem2', 1.0, true);

      const connections = element.getConnections();
      expect(connections.length).toBe(1);
      expect(connections[0].elementId).toBe('elem2');
    });

    it('should track support connections', () => {
      element.addConnection('support1', 1.0, true);

      const supportedBy = element.getSupportedBy();
      expect(supportedBy).toContain('support1');
    });

    it('should track supporting connections', () => {
      element.addConnection('supported1', 1.0, false);

      const supporting = element.getSupporting();
      expect(supporting).toContain('supported1');
    });

    it('should remove connection', () => {
      element.addConnection('elem2', 1.0, true);
      element.removeConnection('elem2');

      const connections = element.getConnections();
      expect(connections.length).toBe(0);
    });
  });

  describe('Load Management', () => {
    it('should apply load', () => {
      element.applyLoad(1000);

      expect(element.getCurrentLoad()).toBe(1000);
    });

    it('should set load', () => {
      element.applyLoad(1000);
      element.setLoad(500);

      expect(element.getCurrentLoad()).toBe(500);
    });

    it('should calculate load capacity', () => {
      const capacity = element.getLoadCapacity();

      expect(capacity).toBe(100000); // maxLoad * strength(1.0)
    });

    it('should calculate load percentage', () => {
      element.setLoad(50000);

      expect(element.getLoadPercentage()).toBeCloseTo(0.5, 1);
    });

    it('should detect overload', () => {
      element.setLoad(150000);

      expect(element.isOverloaded()).toBe(true);
    });

    it('should not overload foundation', () => {
      const foundation = new StructuralElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      foundation.setLoad(1000000);

      expect(foundation.isOverloaded()).toBe(false);
    });
  });

  describe('Failure', () => {
    it('should fail element', () => {
      element.fail();

      expect(element.hasFailed()).toBe(true);
    });

    it('should not fail foundation', () => {
      const foundation = new StructuralElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      foundation.fail();

      expect(foundation.hasFailed()).toBe(false);
    });

    it('should check if supported', () => {
      element.addConnection('support1', 1.0, true);

      expect(element.isSupported()).toBe(true);
    });

    it('should not be supported if no supports', () => {
      const unsupported = new StructuralElement({
        position: { x: 0, y: 10, z: 0 },
      });

      expect(unsupported.isSupported()).toBe(false);
    });

    it('should foundation always be supported', () => {
      const foundation = new StructuralElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      expect(foundation.isSupported()).toBe(true);
    });
  });

  describe('Damage', () => {
    it('should reduce strength', () => {
      element.damage(0.5);

      expect(element.getStrength()).toBeCloseTo(0.5, 1);
    });

    it('should fail when strength depleted', () => {
      element.damage(1.5);

      expect(element.hasFailed()).toBe(true);
    });

    it('should reduce load capacity', () => {
      const capacityBefore = element.getLoadCapacity();

      element.damage(0.5);

      const capacityAfter = element.getLoadCapacity();
      expect(capacityAfter).toBeLessThan(capacityBefore);
    });
  });

  describe('Geometry', () => {
    it('should calculate distance from point', () => {
      const distance = element.distanceFrom({ x: 3, y: 14, z: 0 });

      expect(distance).toBeCloseTo(5, 0);
    });

    it('should check if point is inside', () => {
      const inside = element.containsPoint({ x: 0, y: 10, z: 0 });

      expect(inside).toBe(true);
    });

    it('should check if point is outside', () => {
      const outside = element.containsPoint({ x: 100, y: 100, z: 100 });

      expect(outside).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset element', () => {
      element.fail();
      element.setLoad(5000);
      element.damage(0.5);

      element.reset();

      expect(element.hasFailed()).toBe(false);
      expect(element.getCurrentLoad()).toBe(0);
      expect(element.getStrength()).toBe(1.0);
    });
  });
});

describe('StructuralIntegrity', () => {
  let system: StructuralIntegrity;

  beforeEach(() => {
    system = new StructuralIntegrity();
  });

  describe('Initialization', () => {
    it('should create structural integrity system', () => {
      expect(system).toBeDefined();
    });

    it('should use default config', () => {
      const stats = system.getStatistics();

      expect(stats.totalElements).toBe(0);
    });
  });

  describe('Element Management', () => {
    it('should add element', () => {
      system.addElement({
        position: { x: 0, y: 0, z: 0 },
      });

      const stats = system.getStatistics();
      expect(stats.totalElements).toBe(1);
    });

    it('should remove element', () => {
      const element = system.addElement({
        position: { x: 0, y: 0, z: 0 },
      });

      system.removeElement(element.id);

      const stats = system.getStatistics();
      expect(stats.totalElements).toBe(0);
    });

    it('should get element by ID', () => {
      const element = system.addElement({
        position: { x: 0, y: 0, z: 0 },
      });

      const retrieved = system.getElement(element.id);

      expect(retrieved).toBe(element);
    });

    it('should get all elements', () => {
      system.addElement({ position: { x: 0, y: 0, z: 0 } });
      system.addElement({ position: { x: 5, y: 0, z: 0 } });

      const elements = system.getElements();
      expect(elements.length).toBe(2);
    });
  });

  describe('Connections', () => {
    it('should connect two elements', () => {
      const elem1 = system.addElement({ position: { x: 0, y: 0, z: 0 } });
      const elem2 = system.addElement({ position: { x: 0, y: 5, z: 0 } });

      system.connect(elem1.id, elem2.id);

      expect(elem1.getConnections().length).toBeGreaterThan(0);
    });

    it('should create bidirectional connection', () => {
      const elem1 = system.addElement({ position: { x: 0, y: 0, z: 0 } });
      const elem2 = system.addElement({ position: { x: 0, y: 5, z: 0 } });

      system.connect(elem1.id, elem2.id, 1.0, true);

      expect(elem1.getConnections().length).toBe(1);
      expect(elem2.getConnections().length).toBe(1);
    });

    it('should determine support based on position', () => {
      const bottom = system.addElement({ position: { x: 0, y: 0, z: 0 } });
      const top = system.addElement({ position: { x: 0, y: 10, z: 0 } });

      system.connect(bottom.id, top.id);

      expect(top.getSupportedBy()).toContain(bottom.id);
    });

    it('should disconnect elements', () => {
      const elem1 = system.addElement({ position: { x: 0, y: 0, z: 0 } });
      const elem2 = system.addElement({ position: { x: 0, y: 5, z: 0 } });

      system.connect(elem1.id, elem2.id);
      system.disconnect(elem1.id, elem2.id);

      expect(elem1.getConnections().length).toBe(0);
    });
  });

  describe('Load Calculation', () => {
    it('should calculate self-weight', () => {
      const element = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        mass: 1000,
      });

      system.calculateLoads();

      expect(element.getCurrentLoad()).toBeGreaterThan(0);
    });

    it('should distribute loads to supports', () => {
      const foundation = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      const column = system.addElement({
        position: { x: 0, y: 5, z: 0 },
        mass: 1000,
      });

      system.connect(foundation.id, column.id);
      system.calculateLoads();

      expect(foundation.getCurrentLoad()).toBeGreaterThan(column.getWeight());
    });

    it('should distribute to multiple supports', () => {
      const support1 = system.addElement({
        position: { x: -5, y: 0, z: 0 },
        isFoundation: true,
      });

      const support2 = system.addElement({
        position: { x: 5, y: 0, z: 0 },
        isFoundation: true,
      });

      const beam = system.addElement({
        position: { x: 0, y: 5, z: 0 },
        mass: 1000,
      });

      system.connect(support1.id, beam.id);
      system.connect(support2.id, beam.id);
      system.calculateLoads();

      // Each support should carry roughly half the load
      expect(support1.getCurrentLoad()).toBeGreaterThan(0);
      expect(support2.getCurrentLoad()).toBeGreaterThan(0);
    });
  });

  describe('Failure Detection', () => {
    it('should detect overloaded element', () => {
      const element = system.addElement({
        position: { x: 0, y: 5, z: 0 },
        maxLoad: 1000,
        mass: 1000,
        isFoundation: false,
      });

      const support = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      system.connect(support.id, element.id);

      // Apply very heavy load
      element.setLoad(10000);

      system.update();

      expect(element.hasFailed()).toBe(true);
    });

    it('should detect unsupported element', () => {
      const element = system.addElement({
        position: { x: 0, y: 10, z: 0 },
        maxLoad: 100000, // High capacity so it doesn't fail from overload
      });

      system.update();

      // Element should have failed due to being unsupported
      expect(element.hasFailed()).toBe(true);
      const events = system.getFailureEvents();
      const event = events.find((e) => e.elementId === element.id);
      expect(event?.reason).toBe('unsupported');
    });

    it('should not fail foundation', () => {
      const foundation = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
        maxLoad: 1000,
      });

      foundation.setLoad(100000);

      system.update();

      expect(foundation.hasFailed()).toBe(false);
    });
  });

  describe('Progressive Failure', () => {
    it('should cascade failure to unsupported elements', () => {
      const foundation = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      const column = system.addElement({
        position: { x: 0, y: 5, z: 0 },
      });

      const beam = system.addElement({
        position: { x: 0, y: 10, z: 0 },
      });

      system.connect(foundation.id, column.id);
      system.connect(column.id, beam.id);

      // Fail the column
      column.fail();

      system.update();

      // Beam should fail due to loss of support
      expect(beam.hasFailed()).toBe(true);
    });

    it('should redistribute load after failure', () => {
      const support1 = system.addElement({
        position: { x: -5, y: 0, z: 0 },
        isFoundation: true,
      });

      const support2 = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      const support3 = system.addElement({
        position: { x: 5, y: 0, z: 0 },
        isFoundation: true,
      });

      const beam = system.addElement({
        position: { x: 0, y: 5, z: 0 },
        mass: 3000,
      });

      system.connect(support1.id, beam.id);
      system.connect(support2.id, beam.id);
      system.connect(support3.id, beam.id);

      system.calculateLoads();
      const load2Before = support2.getCurrentLoad();

      // Fail middle support
      support2.fail();

      system.update();

      // Load should redistribute to other supports
      expect(support1.getCurrentLoad()).toBeGreaterThan(0);
      expect(support3.getCurrentLoad()).toBeGreaterThan(0);
    });
  });

  describe('Damage', () => {
    it('should damage elements in radius', () => {
      const element = system.addElement({
        position: { x: 0, y: 5, z: 0 },
      });

      const count = system.damageInRadius({ x: 0, y: 5, z: 0 }, 10, 0.5);

      expect(count).toBe(1);
      expect(element.getStrength()).toBeLessThan(1.0);
    });

    it('should apply damage falloff', () => {
      const near = system.addElement({
        position: { x: 1, y: 0, z: 0 },
      });

      const far = system.addElement({
        position: { x: 9, y: 0, z: 0 },
      });

      system.damageInRadius({ x: 0, y: 0, z: 0 }, 10, 0.5);

      expect(near.getStrength()).toBeLessThan(far.getStrength());
    });

    it('should remove element at position', () => {
      const element = system.addElement({
        position: { x: 5, y: 5, z: 5 },
        size: { x: 1, y: 1, z: 1 },
      });

      const removed = system.removeElementAt({ x: 5, y: 5, z: 5 });

      expect(removed).toBe(element);
      expect(element.hasFailed()).toBe(true);
    });
  });

  describe('Stability', () => {
    it('should detect stable structure', () => {
      const foundation = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      const column = system.addElement({
        position: { x: 0, y: 5, z: 0 },
        maxLoad: 100000,
      });

      system.connect(foundation.id, column.id);
      system.calculateLoads();

      expect(system.isStable()).toBe(true);
    });

    it('should detect unstable structure', () => {
      system.addElement({
        position: { x: 0, y: 10, z: 0 },
      });

      expect(system.isStable()).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track total elements', () => {
      system.addElement({ position: { x: 0, y: 0, z: 0 } });
      system.addElement({ position: { x: 5, y: 0, z: 0 } });

      const stats = system.getStatistics();
      expect(stats.totalElements).toBe(2);
    });

    it('should track failed elements', () => {
      const elem = system.addElement({ position: { x: 0, y: 0, z: 0 } });
      elem.fail();

      const stats = system.getStatistics();
      expect(stats.failedElements).toBe(1);
    });

    it('should track failure events', () => {
      const elem = system.addElement({
        position: { x: 0, y: 5, z: 0 },
        maxLoad: 100,
      });

      const support = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      system.connect(support.id, elem.id);
      elem.setLoad(1000);

      system.update();

      const stats = system.getStatistics();
      expect(stats.failureEvents).toBeGreaterThan(0);
    });

    it('should track stability', () => {
      const foundation = system.addElement({
        position: { x: 0, y: 0, z: 0 },
        isFoundation: true,
      });

      const column = system.addElement({
        position: { x: 0, y: 5, z: 0 },
        maxLoad: 100000,
      });

      system.connect(foundation.id, column.id);
      system.calculateLoads();

      const stats = system.getStatistics();
      expect(stats.isStable).toBe(true);
    });
  });

  describe('Reset and Clear', () => {
    it('should reset system', () => {
      const elem = system.addElement({ position: { x: 0, y: 0, z: 0 } });
      elem.fail();

      system.reset();

      expect(elem.hasFailed()).toBe(false);
    });

    it('should clear all elements', () => {
      system.addElement({ position: { x: 0, y: 0, z: 0 } });
      system.addElement({ position: { x: 5, y: 0, z: 0 } });

      system.clear();

      const stats = system.getStatistics();
      expect(stats.totalElements).toBe(0);
    });
  });
});
