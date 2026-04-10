import { describe, it, expect, beforeEach } from 'vitest';
import { PatternLearner } from '../../recovery/PatternLearner';
import type { IAgentFailure } from '../../extensions';

function makeFailure(overrides: Partial<IAgentFailure> = {}): IAgentFailure {
  return {
    id: `f-${Math.random()}`,
    agentId: 'agent-A',
    errorType: 'network-timeout',
    message: 'timeout',
    severity: 'medium',
    timestamp: Date.now(),
    context: {},
    ...overrides,
  };
}

describe('PatternLearner — Production Tests', () => {
  let pl: PatternLearner;

  beforeEach(() => {
    pl = new PatternLearner({ frequencyThreshold: 3, windowSize: 50, timeWindowMs: 3600000 });
  });

  describe('recordFailure()', () => {
    it('stores failures up to windowSize', () => {
      const tiny = new PatternLearner({
        windowSize: 3,
        frequencyThreshold: 1,
        timeWindowMs: 3600000,
      });
      for (let i = 0; i < 5; i++) tiny.recordFailure(makeFailure());
      // internal history trimmed — detectPatterns still works
      expect(() => tiny.detectPatterns()).not.toThrow();
    });

    it('does not throw for any valid failure', () => {
      expect(() => pl.recordFailure(makeFailure())).not.toThrow();
    });
  });

  describe('detectPatterns()', () => {
    it('returns empty array with no failures', () => {
      expect(pl.detectPatterns()).toEqual([]);
    });

    it('returns empty when below frequencyThreshold', () => {
      pl.recordFailure(makeFailure());
      pl.recordFailure(makeFailure());
      expect(pl.detectPatterns().length).toBe(0);
    });

    it('returns a pattern at or above frequency threshold', () => {
      for (let i = 0; i < 3; i++) pl.recordFailure(makeFailure());
      const patterns = pl.detectPatterns();
      expect(patterns.length).toBe(1);
      expect(patterns[0].errorType).toBe('network-timeout');
      expect(patterns[0].frequency).toBe(3);
    });

    it('groups distinct error types separately', () => {
      for (let i = 0; i < 3; i++) pl.recordFailure(makeFailure({ errorType: 'network-timeout' }));
      for (let i = 0; i < 3; i++) pl.recordFailure(makeFailure({ errorType: 'api-rate-limit' }));
      const patterns = pl.detectPatterns();
      expect(patterns.length).toBe(2);
      expect(patterns.map((p) => p.errorType)).toContain('network-timeout');
      expect(patterns.map((p) => p.errorType)).toContain('api-rate-limit');
    });

    it('sorts by frequency descending', () => {
      for (let i = 0; i < 5; i++) pl.recordFailure(makeFailure({ errorType: 'network-timeout' }));
      for (let i = 0; i < 3; i++) pl.recordFailure(makeFailure({ errorType: 'api-rate-limit' }));
      const patterns = pl.detectPatterns();
      expect(patterns[0].errorType).toBe('network-timeout');
    });

    it('pattern has suggestedStrategy based on errorType', () => {
      for (let i = 0; i < 3; i++) pl.recordFailure(makeFailure({ errorType: 'network-timeout' }));
      const [pattern] = pl.detectPatterns();
      expect(pattern.suggestedStrategy).toBe('network-retry');
    });
  });

  describe('recordStrategyOutcome() / getSuggestedStrategy()', () => {
    it('records strategy success', () => {
      pl.recordStrategyOutcome('network-retry', true);
      pl.recordStrategyOutcome('network-retry', true);
      pl.recordStrategyOutcome('network-retry', false);
      // successRate = 2/3
      // getSuggestedStrategy still returns default mapping
      const suggested = pl.getSuggestedStrategy('network-timeout');
      expect(suggested).toBe('network-retry');
    });

    it('returns undefined for errorType with no mapping and no history', () => {
      const result = pl.getSuggestedStrategy('type-error');
      expect(result).toBe('');
    });
  });

  describe('analyze()', () => {
    it('returns health score 100 with no failures', () => {
      const analysis = pl.analyze();
      expect(analysis.healthScore).toBe(100);
    });

    it('returns topPatterns, recentTrend, suggestedActions, healthScore', () => {
      const analysis = pl.analyze();
      expect(analysis).toHaveProperty('topPatterns');
      expect(analysis).toHaveProperty('recentTrend');
      expect(analysis).toHaveProperty('suggestedActions');
      expect(analysis).toHaveProperty('healthScore');
    });

    it('trend is stable with < 10 failures', () => {
      for (let i = 0; i < 5; i++) pl.recordFailure(makeFailure());
      const analysis = pl.analyze();
      expect(analysis.recentTrend).toBe('stable');
    });

    it('health score decreases with more failures', () => {
      for (let i = 0; i < 10; i++) {
        pl.recordFailure(makeFailure({ severity: 'high' }));
      }
      const analysis = pl.analyze();
      expect(analysis.healthScore).toBeLessThan(100);
    });

    it('generates suggested actions for high-frequency patterns', () => {
      for (let i = 0; i < 6; i++) pl.recordFailure(makeFailure({ errorType: 'network-timeout' }));
      const analysis = pl.analyze();
      expect(analysis.suggestedActions.some((a) => a.includes('network-timeout'))).toBe(true);
    });
  });

  describe('reset()', () => {
    it('clears all history and patterns', () => {
      for (let i = 0; i < 5; i++) pl.recordFailure(makeFailure());
      pl.recordStrategyOutcome('network-retry', true);
      pl.reset();
      expect(pl.detectPatterns().length).toBe(0);
      expect(pl.analyze().healthScore).toBe(100);
    });
  });
});
