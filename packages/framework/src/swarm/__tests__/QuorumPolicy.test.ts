/**
 * QuorumPolicy Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QuorumPolicy } from '../QuorumPolicy';

describe('QuorumPolicy', () => {
  let policy: QuorumPolicy;

  beforeEach(() => {
    policy = new QuorumPolicy({
      minimumSize: 2,
      optimalSize: 5,
      maximumSize: 10,
      quorumPercentage: 0.5,
    });
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const p = new QuorumPolicy();
      expect(p.getConfig().minimumSize).toBe(2);
    });

    it('should throw for invalid config', () => {
      expect(() => new QuorumPolicy({ minimumSize: 10, optimalSize: 5 })).toThrow();
      expect(() => new QuorumPolicy({ optimalSize: 20, maximumSize: 10 })).toThrow();
      expect(() => new QuorumPolicy({ quorumPercentage: 1.5 })).toThrow();
    });
  });

  describe('canJoin', () => {
    it('should allow joining below max', () => {
      policy.setMemberCount(5);
      expect(policy.canJoin()).toBe(true);
    });

    it('should disallow joining at max', () => {
      policy.setMemberCount(10);
      expect(policy.canJoin()).toBe(false);
    });
  });

  describe('canLeave', () => {
    it('should allow leaving above minimum', () => {
      policy.setMemberCount(5);
      expect(policy.canLeave()).toBe(true);
    });

    it('should disallow leaving at minimum', () => {
      policy.setMemberCount(2);
      expect(policy.canLeave()).toBe(false);
    });
  });

  describe('hasQuorum', () => {
    it('should not have quorum below minimum', () => {
      policy.setMemberCount(1);
      expect(policy.hasQuorum()).toBe(false);
    });

    it('should have quorum at minimum if meets percentage', () => {
      // quorumPercentage 0.5 of 5 = 2.5 -> 3, but min is 2
      // So need max(2, 3) = 3
      policy.setMemberCount(3);
      expect(policy.hasQuorum()).toBe(true);
    });

    it('should have quorum at optimal', () => {
      policy.setMemberCount(5);
      expect(policy.hasQuorum()).toBe(true);
    });
  });

  describe('canOperate', () => {
    it('should not operate without quorum when required', () => {
      policy.setMemberCount(1);
      expect(policy.canOperate()).toBe(false);
    });

    it('should operate with quorum', () => {
      policy.setMemberCount(3);
      expect(policy.canOperate()).toBe(true);
    });

    it('should operate without quorum when not required', () => {
      const p = new QuorumPolicy({ requireQuorumForOperations: false });
      p.setMemberCount(1);
      expect(p.canOperate()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return below-minimum for too few', () => {
      policy.setMemberCount(1);
      expect(policy.getStatus()).toBe('below-minimum');
    });

    it('should return quorum for sufficient members', () => {
      policy.setMemberCount(3);
      expect(policy.getStatus()).toBe('quorum');
    });

    it('should return optimal at optimal size', () => {
      policy.setMemberCount(5);
      expect(policy.getStatus()).toBe('optimal');
    });

    it('should return above-maximum when exceeded', () => {
      policy.setMemberCount(15);
      expect(policy.getStatus()).toBe('above-maximum');
    });
  });

  describe('getState', () => {
    it('should return full state object', () => {
      policy.setMemberCount(3);
      const state = policy.getState();

      expect(state.currentSize).toBe(3);
      expect(state.status).toBe('quorum');
      expect(state.hasQuorum).toBe(true);
      expect(state.canOperate).toBe(true);
      expect(state.requiredForQuorum).toBe(0);
      expect(state.spotsAvailable).toBe(7);
    });
  });

  describe('shouldRecruit', () => {
    it('should recruit below optimal', () => {
      policy.setMemberCount(3);
      expect(policy.shouldRecruit()).toBe(true);
    });

    it('should not recruit at optimal', () => {
      policy.setMemberCount(5);
      expect(policy.shouldRecruit()).toBe(false);
    });
  });

  describe('shouldSplit', () => {
    it('should not split below maximum', () => {
      policy.setMemberCount(8);
      expect(policy.shouldSplit()).toBe(false);
    });

    it('should split above maximum', () => {
      policy.setMemberCount(12);
      expect(policy.shouldSplit()).toBe(true);
    });
  });

  describe('getHealthScore', () => {
    it('should return 0 for empty', () => {
      policy.setMemberCount(0);
      expect(policy.getHealthScore()).toBe(0);
    });

    it('should return low score below minimum', () => {
      policy.setMemberCount(1);
      expect(policy.getHealthScore()).toBeLessThan(0.5);
    });

    it('should return 1 at optimal', () => {
      policy.setMemberCount(5);
      expect(policy.getHealthScore()).toBe(1);
    });

    it('should return partial score between min and optimal', () => {
      policy.setMemberCount(3);
      const score = policy.getHealthScore();
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThan(1);
    });
  });
});
