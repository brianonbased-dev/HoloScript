/**
 * SpatialHash.test.ts
 *
 * Tests for spatial hash grid.
 *
 * Week 8: Explosive Demolition - Day 3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHash } from '../SpatialHash';
import { DebrisParticle } from '../DebrisParticle';

describe('SpatialHash', () => {
  let spatialHash: SpatialHash;

  beforeEach(() => {
    spatialHash = new SpatialHash({ cellSize: 10.0 });
  });

  describe('Initialization', () => {
    it('should create spatial hash', () => {
      expect(spatialHash).toBeDefined();
      expect(spatialHash.getCellSize()).toBe(10.0);
    });

    it('should use default cell size', () => {
      const defaultHash = new SpatialHash();

      expect(defaultHash.getCellSize()).toBe(1.0);
    });

    it('should start empty', () => {
      const stats = spatialHash.getStatistics();

      expect(stats.totalCells).toBe(0);
      expect(stats.totalParticles).toBe(0);
    });
  });

  describe('Insert', () => {
    it('should insert particle', () => {
      const particle = new DebrisParticle({
        position: { x: 5, y: 5, z: 5 },
      });

      spatialHash.insert(particle);

      const stats = spatialHash.getStatistics();
      expect(stats.totalParticles).toBe(1);
      expect(stats.occupiedCells).toBe(1);
    });

    it('should insert multiple particles in same cell', () => {
      const p1 = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });
      const p2 = new DebrisParticle({ position: { x: 6, y: 6, z: 6 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);

      const stats = spatialHash.getStatistics();
      expect(stats.totalParticles).toBe(2);
      expect(stats.occupiedCells).toBe(1);
    });

    it('should insert particles in different cells', () => {
      const p1 = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });
      const p2 = new DebrisParticle({ position: { x: 25, y: 25, z: 25 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);

      const stats = spatialHash.getStatistics();
      expect(stats.totalParticles).toBe(2);
      expect(stats.occupiedCells).toBe(2);
    });

    it('should set spatial hash cell on particle', () => {
      const particle = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });

      spatialHash.insert(particle);

      expect(particle.getSpatialHashCell()).toBeDefined();
    });
  });

  describe('Remove', () => {
    it('should remove particle', () => {
      const particle = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });

      spatialHash.insert(particle);
      const removed = spatialHash.remove(particle);

      expect(removed).toBe(true);

      const stats = spatialHash.getStatistics();
      expect(stats.totalParticles).toBe(0);
    });

    it('should remove particle not in hash', () => {
      const particle = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });

      const removed = spatialHash.remove(particle);

      expect(removed).toBe(false);
    });

    it('should clear particle cell reference', () => {
      const particle = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });

      spatialHash.insert(particle);
      spatialHash.remove(particle);

      expect(particle.getSpatialHashCell()).toBeNull();
    });

    it('should remove empty cells', () => {
      const particle = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });

      spatialHash.insert(particle);
      spatialHash.remove(particle);

      const stats = spatialHash.getStatistics();
      expect(stats.occupiedCells).toBe(0);
    });
  });

  describe('Update', () => {
    it('should update particle in same cell', () => {
      const particle = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });

      spatialHash.insert(particle);
      particle.position = { x: 6, y: 6, z: 6 };
      spatialHash.update(particle);

      const stats = spatialHash.getStatistics();
      expect(stats.totalParticles).toBe(1);
      expect(stats.occupiedCells).toBe(1);
    });

    it('should update particle to different cell', () => {
      const particle = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });

      spatialHash.insert(particle);
      particle.position = { x: 25, y: 25, z: 25 };
      spatialHash.update(particle);

      const stats = spatialHash.getStatistics();
      expect(stats.totalParticles).toBe(1);
      expect(stats.occupiedCells).toBe(1);
    });

    it('should remove old empty cell', () => {
      const p1 = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });
      const p2 = new DebrisParticle({ position: { x: 6, y: 6, z: 6 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);

      p2.position = { x: 25, y: 25, z: 25 };
      spatialHash.update(p2);

      const stats = spatialHash.getStatistics();
      expect(stats.occupiedCells).toBe(2);
    });
  });

  describe('Query Radius', () => {
    it('should find particles in radius', () => {
      const p1 = new DebrisParticle({ position: { x: 0, y: 0, z: 0 } });
      const p2 = new DebrisParticle({ position: { x: 5, y: 0, z: 0 } });
      const p3 = new DebrisParticle({ position: { x: 50, y: 0, z: 0 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);
      spatialHash.insert(p3);

      const results = spatialHash.queryRadius({ x: 0, y: 0, z: 0 }, 10);

      expect(results.length).toBe(2);
      expect(results).toContain(p1);
      expect(results).toContain(p2);
    });

    it('should return empty for no particles in radius', () => {
      const particle = new DebrisParticle({ position: { x: 100, y: 100, z: 100 } });

      spatialHash.insert(particle);

      const results = spatialHash.queryRadius({ x: 0, y: 0, z: 0 }, 10);

      expect(results.length).toBe(0);
    });

    it('should handle exact radius boundary', () => {
      const particle = new DebrisParticle({ position: { x: 10, y: 0, z: 0 } });

      spatialHash.insert(particle);

      const results = spatialHash.queryRadius({ x: 0, y: 0, z: 0 }, 10);

      expect(results.length).toBe(1);
    });

    it('should check multiple cells', () => {
      const particles: DebrisParticle[] = [];

      for (let i = 0; i < 10; i++) {
        const particle = new DebrisParticle({
          position: { x: i * 5, y: 0, z: 0 },
        });
        particles.push(particle);
        spatialHash.insert(particle);
      }

      const results = spatialHash.queryRadius({ x: 25, y: 0, z: 0 }, 15);

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Query Box', () => {
    it('should find particles in box', () => {
      const p1 = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });
      const p2 = new DebrisParticle({ position: { x: 15, y: 15, z: 15 } });
      const p3 = new DebrisParticle({ position: { x: 50, y: 50, z: 50 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);
      spatialHash.insert(p3);

      const results = spatialHash.queryBox(
        { x: 0, y: 0, z: 0 },
        { x: 20, y: 20, z: 20 }
      );

      expect(results.length).toBe(2);
      expect(results).toContain(p1);
      expect(results).toContain(p2);
    });

    it('should return empty for no particles in box', () => {
      const particle = new DebrisParticle({ position: { x: 100, y: 100, z: 100 } });

      spatialHash.insert(particle);

      const results = spatialHash.queryBox({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 });

      expect(results.length).toBe(0);
    });

    it('should handle box boundary', () => {
      const particle = new DebrisParticle({ position: { x: 10, y: 10, z: 10 } });

      spatialHash.insert(particle);

      const results = spatialHash.queryBox(
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 10, z: 10 }
      );

      expect(results.length).toBe(1);
    });
  });

  describe('Get All Particles', () => {
    it('should get all particles', () => {
      const particles: DebrisParticle[] = [];

      for (let i = 0; i < 10; i++) {
        const particle = new DebrisParticle({
          position: { x: i * 20, y: 0, z: 0 },
        });
        particles.push(particle);
        spatialHash.insert(particle);
      }

      const all = spatialHash.getAllParticles();

      expect(all.length).toBe(10);
    });

    it('should return empty when no particles', () => {
      const all = spatialHash.getAllParticles();

      expect(all.length).toBe(0);
    });
  });

  describe('Clear', () => {
    it('should clear all particles', () => {
      const p1 = new DebrisParticle({ position: { x: 0, y: 0, z: 0 } });
      const p2 = new DebrisParticle({ position: { x: 10, y: 10, z: 10 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);

      spatialHash.clear();

      const stats = spatialHash.getStatistics();
      expect(stats.totalParticles).toBe(0);
      expect(stats.occupiedCells).toBe(0);
    });

    it('should clear particle cell references', () => {
      const particle = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });

      spatialHash.insert(particle);
      spatialHash.clear();

      expect(particle.getSpatialHashCell()).toBeNull();
    });
  });

  describe('Statistics', () => {
    it('should track total cells', () => {
      const p1 = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });
      const p2 = new DebrisParticle({ position: { x: 25, y: 25, z: 25 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);

      const stats = spatialHash.getStatistics();
      expect(stats.totalCells).toBe(2);
    });

    it('should track occupied cells', () => {
      const p1 = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });
      const p2 = new DebrisParticle({ position: { x: 6, y: 6, z: 6 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);

      const stats = spatialHash.getStatistics();
      expect(stats.occupiedCells).toBe(1);
    });

    it('should calculate average particles per cell', () => {
      const p1 = new DebrisParticle({ position: { x: 5, y: 5, z: 5 } });
      const p2 = new DebrisParticle({ position: { x: 6, y: 6, z: 6 } });
      const p3 = new DebrisParticle({ position: { x: 25, y: 25, z: 25 } });

      spatialHash.insert(p1);
      spatialHash.insert(p2);
      spatialHash.insert(p3);

      const stats = spatialHash.getStatistics();
      expect(stats.avgParticlesPerCell).toBeCloseTo(1.5, 1);
    });

    it('should track max particles in cell', () => {
      const particles: DebrisParticle[] = [];

      for (let i = 0; i < 5; i++) {
        const particle = new DebrisParticle({
          position: { x: i, y: i, z: i },
        });
        particles.push(particle);
        spatialHash.insert(particle);
      }

      const stats = spatialHash.getStatistics();
      expect(stats.maxParticlesInCell).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative coordinates', () => {
      const particle = new DebrisParticle({ position: { x: -5, y: -5, z: -5 } });

      spatialHash.insert(particle);

      const results = spatialHash.queryRadius({ x: -5, y: -5, z: -5 }, 10);
      expect(results.length).toBe(1);
    });

    it('should handle very large coordinates', () => {
      const particle = new DebrisParticle({
        position: { x: 100000, y: 100000, z: 100000 },
      });

      spatialHash.insert(particle);

      const results = spatialHash.queryRadius({ x: 100000, y: 100000, z: 100000 }, 10);
      expect(results.length).toBe(1);
    });

    it('should handle zero radius query', () => {
      const particle = new DebrisParticle({ position: { x: 0, y: 0, z: 0 } });

      spatialHash.insert(particle);

      const results = spatialHash.queryRadius({ x: 0, y: 0, z: 0 }, 0);
      expect(results.length).toBe(1);
    });

    it('should handle many particles in single cell', () => {
      const particles: DebrisParticle[] = [];

      for (let i = 0; i < 100; i++) {
        const particle = new DebrisParticle({
          position: { x: Math.random(), y: Math.random(), z: Math.random() },
        });
        particles.push(particle);
        spatialHash.insert(particle);
      }

      const stats = spatialHash.getStatistics();
      expect(stats.totalParticles).toBe(100);
    });
  });
});
