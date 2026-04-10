/**
 * AgentBudgetEnforcer tests — v5.8 "Live Economy"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentBudgetEnforcer } from '@holoscript/framework/economy';

describe('AgentBudgetEnforcer', () => {
  let enforcer: AgentBudgetEnforcer;

  beforeEach(() => {
    enforcer = new AgentBudgetEnforcer({
      defaultBudget: {
        maxSpend: 10000, // $0.01
        period: 'daily',
        mode: 'hard',
        warnThreshold: 0.8,
        circuitBreakerThreshold: 3,
      },
      circuitBreakerResetMs: 100, // Fast reset for tests
    });
  });

  // ===========================================================================
  // BUDGET MANAGEMENT
  // ===========================================================================

  describe('budget management', () => {
    it('sets and retrieves budget', () => {
      enforcer.setBudget({
        agentId: 'agent-1',
        maxSpend: 50000,
        period: 'monthly',
        mode: 'soft',
      });
      const budget = enforcer.getBudget('agent-1');
      expect(budget).toBeDefined();
      expect(budget!.maxSpend).toBe(50000);
      expect(budget!.mode).toBe('soft');
    });

    it('removes budget', () => {
      enforcer.setBudget({ agentId: 'a', maxSpend: 100, period: 'daily', mode: 'hard' });
      expect(enforcer.removeBudget('a')).toBe(true);
      expect(enforcer.getBudget('a')).toBeUndefined();
    });
  });

  // ===========================================================================
  // AUTHORIZATION
  // ===========================================================================

  describe('authorize', () => {
    it('authorizes spend within budget', () => {
      const result = enforcer.authorize('agent-1', 5000);
      expect(result.authorized).toBe(true);
      expect(result.state.remaining).toBe(10000); // Not yet recorded
    });

    it('denies spend over hard limit', () => {
      enforcer.recordSpend('agent-1', 8000);
      const result = enforcer.authorize('agent-1', 5000);
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('hard limit');
    });

    it('denies spend over soft limit', () => {
      enforcer.setBudget({ agentId: 'soft-agent', maxSpend: 10000, period: 'daily', mode: 'soft' });
      enforcer.recordSpend('soft-agent', 8000);
      const result = enforcer.authorize('soft-agent', 5000);
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('soft limit');
    });

    it('allows spend over warn limit with warning', () => {
      enforcer.setBudget({ agentId: 'warn-agent', maxSpend: 10000, period: 'daily', mode: 'warn' });
      enforcer.recordSpend('warn-agent', 9000);
      const result = enforcer.authorize('warn-agent', 5000);
      expect(result.authorized).toBe(true);
      expect(result.warning).toBe(true);
      expect(result.warningMessage).toContain('exceeded');
    });

    it('warns when approaching budget threshold', () => {
      const result = enforcer.authorize('agent-1', 8500); // 85% > 80% threshold
      expect(result.authorized).toBe(true);
      expect(result.warning).toBe(true);
      expect(result.warningMessage).toContain('Approaching');
    });
  });

  // ===========================================================================
  // SPEND RECORDING
  // ===========================================================================

  describe('recordSpend', () => {
    it('accumulates spend', () => {
      enforcer.recordSpend('agent-1', 3000);
      enforcer.recordSpend('agent-1', 2000);
      const state = enforcer.getState('agent-1');
      expect(state!.spent).toBe(5000);
      expect(state!.remaining).toBe(5000);
      expect(state!.requestCount).toBe(2);
    });

    it('resets consecutive failures on successful spend', () => {
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');
      enforcer.recordSpend('agent-1', 100);
      const state = enforcer.getState('agent-1');
      expect(state!.circuitBreaker.consecutiveFailures).toBe(0);
    });
  });

  // ===========================================================================
  // CIRCUIT BREAKER
  // ===========================================================================

  describe('circuit breaker', () => {
    it('trips after threshold consecutive failures', () => {
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');

      const state = enforcer.getState('agent-1');
      expect(state!.circuitBreaker.isOpen).toBe(true);
      expect(state!.circuitBreaker.consecutiveFailures).toBe(3);
    });

    it('blocks authorization when circuit breaker is open', () => {
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');

      const result = enforcer.authorize('agent-1', 100);
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('Circuit breaker open');
    });

    it('resets circuit breaker after timeout', async () => {
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');

      // Wait for reset (100ms configured)
      await new Promise((r) => setTimeout(r, 150));

      const result = enforcer.authorize('agent-1', 100);
      expect(result.authorized).toBe(true);
    });

    it('manual circuit breaker reset', () => {
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');
      enforcer.recordFailure('agent-1');
      enforcer.resetCircuitBreaker('agent-1');

      const state = enforcer.getState('agent-1');
      expect(state!.circuitBreaker.isOpen).toBe(false);
    });
  });

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  describe('queries', () => {
    it('returns all budget states', () => {
      enforcer.setBudget({ agentId: 'a', maxSpend: 100, period: 'daily', mode: 'hard' });
      enforcer.setBudget({ agentId: 'b', maxSpend: 200, period: 'daily', mode: 'soft' });
      const states = enforcer.getAllStates();
      expect(states).toHaveLength(2);
    });

    it('finds over-budget agents', () => {
      enforcer.setBudget({ agentId: 'over', maxSpend: 100, period: 'daily', mode: 'hard' });
      enforcer.recordSpend('over', 100);
      const overBudget = enforcer.getOverBudgetAgents();
      expect(overBudget).toHaveLength(1);
      expect(overBudget[0].agentId).toBe('over');
    });

    it('resets spending for an agent', () => {
      enforcer.recordSpend('agent-1', 5000);
      enforcer.resetSpending('agent-1');
      const state = enforcer.getState('agent-1');
      expect(state!.spent).toBe(0);
      expect(state!.requestCount).toBe(0);
    });
  });

  // ===========================================================================
  // AUTO-CREATED TRACKER
  // ===========================================================================

  describe('auto-creation', () => {
    it('auto-creates tracker with default budget', () => {
      const result = enforcer.authorize('new-agent', 100);
      expect(result.authorized).toBe(true);
      expect(result.state.limit).toBe(10000); // default
    });
  });
});
