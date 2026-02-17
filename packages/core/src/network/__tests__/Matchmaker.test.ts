/**
 * Matchmaker Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Matchmaker } from '../Matchmaker';

describe('Matchmaker', () => {
  let mm: Matchmaker;

  beforeEach(() => {
    mm = new Matchmaker({ minPlayers: 2, maxPlayers: 4, ratingWindow: 200, regions: ['us-east', 'eu-west'] });
  });

  describe('queue', () => {
    it('should enqueue and track size', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      expect(mm.getQueueSize()).toBe(1);
    });

    it('should prevent duplicate enqueue', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      expect(mm.getQueueSize()).toBe(1);
    });

    it('should dequeue', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      expect(mm.dequeue('p1')).toBe(true);
      expect(mm.getQueueSize()).toBe(0);
    });

    it('should track queue size by region', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'B', rating: 1100, region: 'eu-west' });
      expect(mm.getQueueSizeByRegion('us-east')).toBe(1);
      expect(mm.getQueueSizeByRegion('eu-west')).toBe(1);
    });
  });

  describe('processQueue', () => {
    it('should form match from same-region compatible players', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'B', rating: 1100, region: 'us-east' });
      const matches = mm.processQueue();
      expect(matches.length).toBe(1);
      expect(matches[0].players.length).toBe(2);
      expect(matches[0].region).toBe('us-east');
      expect(mm.getQueueSize()).toBe(0);
    });

    it('should not match cross-region players', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'B', rating: 1050, region: 'eu-west' });
      const matches = mm.processQueue();
      expect(matches.length).toBe(0);
    });

    it('should not match players outside rating window', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'B', rating: 1500, region: 'us-east' });
      const matches = mm.processQueue();
      expect(matches.length).toBe(0);
    });

    it('should not form match below minPlayers', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      const matches = mm.processQueue();
      expect(matches.length).toBe(0);
    });

    it('should cap at maxPlayers', () => {
      for (let i = 0; i < 6; i++) {
        mm.enqueue({ id: `p${i}`, name: `P${i}`, rating: 1000, region: 'us-east' });
      }
      const matches = mm.processQueue();
      if (matches.length > 0) {
        expect(matches[0].players.length).toBeLessThanOrEqual(4);
      }
    });

    it('should compute averageRating and ratingSpread', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'B', rating: 1100, region: 'us-east' });
      const matches = mm.processQueue();
      expect(matches[0].averageRating).toBe(1050);
      expect(matches[0].ratingSpread).toBe(100);
    });
  });

  describe('estimateWaitTime', () => {
    it('should return 0 when enough nearby players', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      expect(mm.estimateWaitTime(1050, 'us-east')).toBe(0);
    });

    it('should return positive estimate when insufficient players', () => {
      expect(mm.estimateWaitTime(1000, 'us-east')).toBeGreaterThan(0);
    });
  });

  describe('match history', () => {
    it('should track matches', () => {
      mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'B', rating: 1050, region: 'us-east' });
      mm.processQueue();
      expect(mm.getMatches().length).toBe(1);
    });
  });

  describe('config', () => {
    it('should return regions', () => {
      expect(mm.getRegions()).toEqual(['us-east', 'eu-west']);
    });

    it('should return config', () => {
      expect(mm.getConfig().minPlayers).toBe(2);
    });
  });
});
