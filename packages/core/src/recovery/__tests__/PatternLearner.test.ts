import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PatternLearner, PatternAnalysis, PatternLearnerConfig } from '../PatternLearner';
import type { IAgentFailure, FailureType } from '../../extensions';

describe('PatternLearner', () => {
  let learner: PatternLearner;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    learner = new PatternLearner({
      windowSize: 100,
      frequencyThreshold: 3,
      timeWindowMs: 3600000, // 1 hour
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const defaultLearner = new PatternLearner();
      // Should not throw
      expect(defaultLearner).toBeDefined();
    });

    it('should use provided config', () => {
      const customLearner = new PatternLearner({
        windowSize: 50,
        frequencyThreshold: 5,
        timeWindowMs: 7200000,
      });
      expect(customLearner).toBeDefined();
    });
  });

  describe('recordFailure', () => {
    it('should record failures', () => {
      const failure: IAgentFailure = {
        id: 'f1',
        agentId: 'agent-1',
        errorType: 'network-timeout',
        message: 'Connection timeout',
        timestamp: Date.now(),
        severity: 'medium',
      };

      learner.recordFailure(failure);
      // No direct way to check count, but patterns should reflect this
      const patterns = learner.detectPatterns();
      // Below threshold (3), so no pattern yet
      expect(patterns.length).toBe(0);
    });

    it('should trim to window size', () => {
      const learnerSmall = new PatternLearner({
        windowSize: 5,
        frequencyThreshold: 1,
        timeWindowMs: 3600000,
      });

      // Add 10 failures
      for (let i = 0; i < 10; i++) {
        learnerSmall.recordFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Test',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const patterns = learnerSmall.detectPatterns();
      // Should only have 5 (window size) failures tracked
      expect(patterns[0]?.frequency).toBe(5);
    });
  });

  describe('detectPatterns', () => {
    it('should return empty array with no failures', () => {
      const patterns = learner.detectPatterns();
      expect(patterns).toEqual([]);
    });

    it('should detect patterns when threshold reached', () => {
      for (let i = 0; i < 3; i++) {
        learner.recordFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Connection timeout',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const patterns = learner.detectPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].errorType).toBe('network-timeout');
      expect(patterns[0].frequency).toBe(3);
    });

    it('should not detect patterns below threshold', () => {
      for (let i = 0; i < 2; i++) {
        learner.recordFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Connection timeout',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const patterns = learner.detectPatterns();
      expect(patterns.length).toBe(0);
    });

    it('should sort patterns by frequency', () => {
      // Add 5 network-timeout
      for (let i = 0; i < 5; i++) {
        learner.recordFailure({
          id: `net${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Test',
          timestamp: Date.now() + i * 100,
          severity: 'medium',
        });
      }

      // Add 3 memory-error
      for (let i = 0; i < 3; i++) {
        learner.recordFailure({
          id: `mem${i}`,
          agentId: 'agent-1',
          errorType: 'memory-error',
          message: 'Test',
          timestamp: Date.now() + i * 100 + 1000,
          severity: 'high',
        });
      }

      const patterns = learner.detectPatterns();
      expect(patterns[0].errorType).toBe('network-timeout');
      expect(patterns[0].frequency).toBe(5);
      expect(patterns[1].errorType).toBe('memory-error');
      expect(patterns[1].frequency).toBe(3);
    });

    it('should exclude old failures outside time window', () => {
      const hourAgo = Date.now() - 3700000; // Slightly more than 1 hour

      // Add old failures
      for (let i = 0; i < 5; i++) {
        learner.recordFailure({
          id: `old${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Old failure',
          timestamp: hourAgo + i * 1000,
          severity: 'medium',
        });
      }

      const patterns = learner.detectPatterns();
      expect(patterns.length).toBe(0);
    });
  });

  describe('analyze', () => {
    it('should return analysis with empty history', () => {
      const analysis = learner.analyze();
      expect(analysis.topPatterns).toEqual([]);
      expect(analysis.healthScore).toBeDefined();
      expect(analysis.recentTrend).toBeDefined();
    });

    it('should include patterns in analysis', () => {
      for (let i = 0; i < 5; i++) {
        learner.recordFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Test',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const analysis = learner.analyze();
      expect(analysis.topPatterns.length).toBeGreaterThan(0);
    });

    it('should suggest actions for frequent patterns', () => {
      for (let i = 0; i < 10; i++) {
        learner.recordFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Test',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const analysis = learner.analyze();
      expect(analysis.suggestedActions.length).toBeGreaterThan(0);
      expect(analysis.suggestedActions.some((a) => a.includes('network-timeout'))).toBe(true);
    });
  });

  describe('recordStrategyOutcome', () => {
    it('should track strategy success rates', () => {
      learner.recordStrategyOutcome('network-retry', true);
      learner.recordStrategyOutcome('network-retry', true);
      learner.recordStrategyOutcome('network-retry', false);

      // Add failures to trigger pattern detection
      for (let i = 0; i < 3; i++) {
        learner.recordFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Test',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }

      const patterns = learner.detectPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('getSuggestedStrategy', () => {
    it('should suggest strategy for error type', () => {
      const strategy = learner.getSuggestedStrategy('network-timeout');
      expect(strategy).toBe('network-retry');
    });

    it('should suggest circuit-breaker for rate limiting', () => {
      const strategy = learner.getSuggestedStrategy('api-rate-limit');
      expect(strategy).toBe('circuit-breaker');
    });
  });

  describe('reset', () => {
    it('should clear all history', () => {
      for (let i = 0; i < 5; i++) {
        learner.recordFailure({
          id: `f${i}`,
          agentId: 'agent-1',
          errorType: 'network-timeout',
          message: 'Test',
          timestamp: Date.now() + i * 1000,
          severity: 'medium',
        });
      }
      learner.recordStrategyOutcome('network-retry', true);

      learner.reset();

      const patterns = learner.detectPatterns();
      expect(patterns.length).toBe(0);
    });
  });
});
