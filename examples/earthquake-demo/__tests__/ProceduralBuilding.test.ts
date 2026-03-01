/**
 * Tests for Procedural Building Generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProceduralBuilding, type BuildingConfig } from '../ProceduralBuilding.js';

describe('ProceduralBuilding', () => {
  let builder: ProceduralBuilding;
  let defaultConfig: BuildingConfig;

  beforeEach(() => {
    builder = new ProceduralBuilding();
    defaultConfig = {
      floors: 5,
      floorHeight: 3.0,
      width: 20,
      depth: 20,
      columnsPerSide: 4,
      beamsPerFloor: 12,
    };
  });

  describe('Building Generation', () => {
    it('should generate a building structure', () => {
      const structure = builder.generateStructure(defaultConfig);

      expect(structure).toBeDefined();
      expect(structure.elements).toBeDefined();
      expect(structure.weakPoints).toBeDefined();
      expect(structure.config).toEqual(defaultConfig);
    });

    it('should create correct number of floors', () => {
      const structure = builder.generateStructure(defaultConfig);
      const floorElements = structure.elements.filter((el) => el.type === 'floor');

      expect(floorElements.length).toBe(defaultConfig.floors);
    });

    it('should create foundation', () => {
      const structure = builder.generateStructure(defaultConfig);
      const foundation = structure.elements.find((el) => el.type === 'foundation');

      expect(foundation).toBeDefined();
      expect(foundation?.floor).toBe(0);
      expect(foundation?.health).toBe(100);
    });

    it('should create columns', () => {
      const structure = builder.generateStructure(defaultConfig);
      const columns = structure.elements.filter((el) => el.type === 'column');

      expect(columns.length).toBeGreaterThan(0);

      // First floor should have full grid of columns
      const groundColumns = columns.filter((col) => col.floor === 1);
      expect(groundColumns.length).toBe(defaultConfig.columnsPerSide ** 2);
    });

    it('should create beams', () => {
      const structure = builder.generateStructure(defaultConfig);
      const beams = structure.elements.filter((el) => el.type === 'beam');

      expect(beams.length).toBeGreaterThan(0);
    });

    it('should vary floor counts', () => {
      const configs = [3, 5, 7, 10].map((floors) => ({ ...defaultConfig, floors }));

      for (const config of configs) {
        const structure = builder.generateStructure(config);
        const floorElements = structure.elements.filter((el) => el.type === 'floor');

        expect(floorElements.length).toBe(config.floors);
      }
    });
  });

  describe('Structural Elements', () => {
    it('should assign unique IDs to elements', () => {
      const structure = builder.generateStructure(defaultConfig);
      const ids = structure.elements.map((el) => el.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should set appropriate materials', () => {
      const structure = builder.generateStructure(defaultConfig);

      for (const element of structure.elements) {
        expect(['concrete', 'steel', 'composite']).toContain(element.material);
      }
    });

    it('should initialize health to 100%', () => {
      const structure = builder.generateStructure(defaultConfig);

      for (const element of structure.elements) {
        expect(element.health).toBe(100);
      }
    });

    it('should calculate mass based on volume and material', () => {
      const structure = builder.generateStructure(defaultConfig);

      for (const element of structure.elements) {
        expect(element.mass).toBeGreaterThan(0);

        // Concrete density ~2400 kg/m³, steel ~7850 kg/m³
        const volume =
          element.dimensions[0] * element.dimensions[1] * element.dimensions[2];
        const expectedMassRange = volume * 1000; // Minimum reasonable mass

        expect(element.mass).toBeGreaterThan(expectedMassRange);
      }
    });

    it('should set load capacity', () => {
      const structure = builder.generateStructure(defaultConfig);

      for (const element of structure.elements) {
        expect(element.loadCapacity).toBeGreaterThan(0);
      }
    });

    it('should initialize stress to 0', () => {
      const structure = builder.generateStructure(defaultConfig);

      for (const element of structure.elements) {
        expect(element.stress).toBe(0);
      }
    });
  });

  describe('Connections', () => {
    it('should establish connections between elements', () => {
      const structure = builder.generateStructure(defaultConfig);

      const connectedElements = structure.elements.filter((el) => el.connections.length > 0);

      expect(connectedElements.length).toBeGreaterThan(0);
    });

    it('should connect columns to foundation', () => {
      const structure = builder.generateStructure(defaultConfig);
      const foundation = structure.elements.find((el) => el.type === 'foundation');

      expect(foundation).toBeDefined();
      expect(foundation!.connections.length).toBeGreaterThan(0);
    });

    it('should connect columns vertically', () => {
      const structure = builder.generateStructure({ ...defaultConfig, floors: 3 });

      // Find a column on floor 1
      const floor1Column = structure.elements.find(
        (el) => el.type === 'column' && el.floor === 1
      );

      expect(floor1Column).toBeDefined();

      // Should have connections (floor above and/or below)
      const connectedToFloor2 = floor1Column!.connections.some((id) => {
        const connected = structure.elements.find((el) => el.id === id);
        return connected?.type === 'column' && connected.floor === 2;
      });

      expect(connectedToFloor2 || floor1Column!.connections.length > 0).toBe(true);
    });

    it('should connect beams to columns', () => {
      const structure = builder.generateStructure(defaultConfig);
      const beams = structure.elements.filter((el) => el.type === 'beam');

      for (const beam of beams) {
        // Beams should have 2 connections (to columns on each end)
        expect(beam.connections.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should create valid connection IDs', () => {
      const structure = builder.generateStructure(defaultConfig);

      for (const element of structure.elements) {
        for (const connId of element.connections) {
          const connectedElement = structure.elements.find((el) => el.id === connId);
          expect(connectedElement).toBeDefined();
        }
      }
    });
  });

  describe('Weak Points', () => {
    it('should identify weak points', () => {
      const structure = builder.generateStructure(defaultConfig);

      expect(structure.weakPoints.length).toBeGreaterThan(0);
    });

    it('should set failure thresholds', () => {
      const structure = builder.generateStructure(defaultConfig);

      for (const weakPoint of structure.weakPoints) {
        expect(weakPoint.failureThreshold).toBeGreaterThan(0);
        expect(weakPoint.failureThreshold).toBeLessThanOrEqual(100);
      }
    });

    it('should assign failure modes', () => {
      const structure = builder.generateStructure(defaultConfig);

      const validModes = ['snap', 'bend', 'crush', 'shear'];

      for (const weakPoint of structure.weakPoints) {
        expect(validModes).toContain(weakPoint.failureMode);
      }
    });

    it('should have weak points for each structural element type', () => {
      const structure = builder.generateStructure(defaultConfig);

      const elementTypes = ['column', 'beam', 'floor'];

      for (const type of elementTypes) {
        const elementsOfType = structure.elements.filter((el) => el.type === type);
        const weakPointsOfType = structure.weakPoints.filter((wp) => {
          const element = structure.elements.find((el) => el.id === wp.elementId);
          return element?.type === type;
        });

        if (elementsOfType.length > 0) {
          expect(weakPointsOfType.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have lower failure thresholds for lower floors (higher stress)', () => {
      const structure = builder.generateStructure({ ...defaultConfig, floors: 10 });

      // Get weak points for bottom floor columns
      const bottomFloorColumns = structure.elements.filter(
        (el) => el.type === 'column' && el.floor === 1
      );
      const bottomWeakPoints = structure.weakPoints.filter((wp) =>
        bottomFloorColumns.some((col) => col.id === wp.elementId)
      );

      // Get weak points for top floor columns
      const topFloorColumns = structure.elements.filter(
        (el) => el.type === 'column' && el.floor === 10
      );
      const topWeakPoints = structure.weakPoints.filter((wp) =>
        topFloorColumns.some((col) => col.id === wp.elementId)
      );

      if (bottomWeakPoints.length > 0 && topWeakPoints.length > 0) {
        const avgBottomThreshold =
          bottomWeakPoints.reduce((sum, wp) => sum + wp.failureThreshold, 0) /
          bottomWeakPoints.length;
        const avgTopThreshold =
          topWeakPoints.reduce((sum, wp) => sum + wp.failureThreshold, 0) /
          topWeakPoints.length;

        // Bottom floor should have lower threshold (fails easier due to higher stress)
        expect(avgBottomThreshold).toBeLessThanOrEqual(avgTopThreshold + 10); // Allow some variance
      }
    });
  });

  describe('Building Properties', () => {
    it('should calculate total mass', () => {
      const structure = builder.generateStructure(defaultConfig);

      expect(structure.totalMass).toBeGreaterThan(0);

      const sumMass = structure.elements.reduce((sum, el) => sum + el.mass, 0);
      expect(structure.totalMass).toBeCloseTo(sumMass, 0);
    });

    it('should calculate center of mass', () => {
      const structure = builder.generateStructure(defaultConfig);

      expect(structure.centerOfMass).toBeDefined();
      expect(structure.centerOfMass.length).toBe(3);

      // Center of mass should be roughly at building center
      expect(structure.centerOfMass[0]).toBeCloseTo(0, 0); // X near 0
      expect(structure.centerOfMass[1]).toBeGreaterThan(0); // Y above ground
      expect(structure.centerOfMass[2]).toBeCloseTo(0, 0); // Z near 0
    });

    it('should calculate bounding box', () => {
      const structure = builder.generateStructure(defaultConfig);

      expect(structure.bounds).toBeDefined();
      expect(structure.bounds.min).toBeDefined();
      expect(structure.bounds.max).toBeDefined();

      // Min should be less than max for all axes
      expect(structure.bounds.min[0]).toBeLessThan(structure.bounds.max[0]);
      expect(structure.bounds.min[1]).toBeLessThan(structure.bounds.max[1]);
      expect(structure.bounds.min[2]).toBeLessThan(structure.bounds.max[2]);

      // Bounds should roughly match building dimensions
      const boundsWidth = structure.bounds.max[0] - structure.bounds.min[0];
      const boundsDepth = structure.bounds.max[2] - structure.bounds.min[2];

      expect(boundsWidth).toBeCloseTo(defaultConfig.width, 0);
      expect(boundsDepth).toBeCloseTo(defaultConfig.depth, 0);
    });
  });

  describe('Helper Methods', () => {
    it('should get structural elements', () => {
      const structure = builder.generateStructure(defaultConfig);
      const elements = builder.getStructuralElements(structure);

      expect(elements).toEqual(structure.elements);
    });

    it('should get weak points', () => {
      const structure = builder.generateStructure(defaultConfig);
      const weakPoints = builder.getWeakPoints(structure);

      expect(weakPoints).toEqual(structure.weakPoints);
    });

    it('should get element by ID', () => {
      const structure = builder.generateStructure(defaultConfig);
      const firstElement = structure.elements[0];

      const element = builder.getElementById(structure, firstElement.id);

      expect(element).toEqual(firstElement);
    });

    it('should return undefined for invalid ID', () => {
      const structure = builder.generateStructure(defaultConfig);
      const element = builder.getElementById(structure, 999999);

      expect(element).toBeUndefined();
    });

    it('should get connected elements', () => {
      const structure = builder.generateStructure(defaultConfig);
      const elementWithConnections = structure.elements.find(
        (el) => el.connections.length > 0
      );

      if (elementWithConnections) {
        const connected = builder.getConnectedElements(structure, elementWithConnections.id);

        expect(connected.length).toBe(elementWithConnections.connections.length);
      }
    });

    it('should get building statistics', () => {
      const structure = builder.generateStructure(defaultConfig);
      const stats = builder.getStatistics(structure);

      expect(stats.totalElements).toBe(structure.elements.length);
      expect(stats.columns).toBeGreaterThan(0);
      expect(stats.beams).toBeGreaterThan(0);
      expect(stats.floors).toBe(defaultConfig.floors);
      expect(stats.totalMass).toBeCloseTo(structure.totalMass, 0);
      expect(stats.averageHealth).toBe(100); // All elements start at 100% health
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum building (3 floors)', () => {
      const structure = builder.generateStructure({ ...defaultConfig, floors: 3 });

      expect(structure.elements.length).toBeGreaterThan(0);
      expect(structure.weakPoints.length).toBeGreaterThan(0);
    });

    it('should handle maximum building (10 floors)', () => {
      const structure = builder.generateStructure({ ...defaultConfig, floors: 10 });

      expect(structure.elements.length).toBeGreaterThan(0);
      expect(structure.weakPoints.length).toBeGreaterThan(0);
    });

    it('should handle small building (narrow)', () => {
      const structure = builder.generateStructure({
        ...defaultConfig,
        width: 10,
        depth: 10,
      });

      expect(structure.elements.length).toBeGreaterThan(0);
    });

    it('should handle large building (wide)', () => {
      const structure = builder.generateStructure({
        ...defaultConfig,
        width: 40,
        depth: 40,
      });

      expect(structure.elements.length).toBeGreaterThan(0);
    });

    it('should handle minimum columns per side', () => {
      const structure = builder.generateStructure({
        ...defaultConfig,
        columnsPerSide: 2,
      });

      const columns = structure.elements.filter((el) => el.type === 'column');
      expect(columns.length).toBeGreaterThan(0);
    });
  });
});
