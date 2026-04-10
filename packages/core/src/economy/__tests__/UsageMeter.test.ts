/**
 * UsageMeter tests — v5.8 "Live Economy"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UsageMeter } from '@holoscript/framework/economy';

describe('UsageMeter', () => {
  let meter: UsageMeter;

  beforeEach(() => {
    meter = new UsageMeter({
      defaultToolCost: 100, // $0.0001
      freeTier: { monthlyAllowance: 1000 }, // $0.001
      toolCosts: {
        'premium-tool': 5000, // $0.005
      },
    });
  });

  // ===========================================================================
  // RECORDING
  // ===========================================================================

  describe('recordUsage', () => {
    it('records a usage event', () => {
      const event = meter.recordUsage('agent-1', 'tool-a');
      expect(event.agentId).toBe('agent-1');
      expect(event.toolId).toBe('tool-a');
      expect(event.cost).toBe(100);
      expect(event.freeTier).toBe(true);
    });

    it('uses tool-specific cost overrides', () => {
      const event = meter.recordUsage('agent-1', 'premium-tool');
      expect(event.cost).toBe(5000);
    });

    it('tracks free-tier usage', () => {
      // Allowance is 1000 base units
      meter.recordUsage('agent-1', 'tool-a'); // 100 → free (900 remaining)
      meter.recordUsage('agent-1', 'tool-a'); // 100 → free (800 remaining)

      const remaining = meter.getFreeTierRemaining('agent-1');
      expect(remaining).toBe(800);
    });

    it('transitions to paid after free-tier exhausted', () => {
      // Allowance is 1000; each call costs 100 → 10 free calls
      for (let i = 0; i < 10; i++) {
        meter.recordUsage('agent-1', 'tool-a');
      }

      expect(meter.getFreeTierRemaining('agent-1')).toBe(0);
      expect(meter.isOverFreeTier('agent-1')).toBe(true);

      const paid = meter.recordUsage('agent-1', 'tool-a');
      expect(paid.freeTier).toBe(false);
    });
  });

  // ===========================================================================
  // TOOL COST
  // ===========================================================================

  describe('tool costs', () => {
    it('returns default cost for unknown tools', () => {
      expect(meter.getToolCost('unknown-tool')).toBe(100);
    });

    it('allows setting tool cost at runtime', () => {
      meter.setToolCost('new-tool', 250);
      expect(meter.getToolCost('new-tool')).toBe(250);
    });
  });

  // ===========================================================================
  // AGGREGATION
  // ===========================================================================

  describe('getAgentUsage', () => {
    it('aggregates usage by tool', () => {
      meter.recordUsage('agent-1', 'tool-a');
      meter.recordUsage('agent-1', 'tool-a');
      meter.recordUsage('agent-1', 'tool-b');

      const summary = meter.getAgentUsage('agent-1', 'monthly');
      expect(summary.total.totalCalls).toBe(3);
      expect(summary.total.totalCost).toBe(300);
      expect(summary.byTool.size).toBe(2);
      expect(summary.byTool.get('tool-a')!.totalCalls).toBe(2);
    });

    it('separates free-tier and paid usage', () => {
      // 10 free calls (1000 allowance / 100 per call)
      for (let i = 0; i < 10; i++) {
        meter.recordUsage('agent-1', 'tool-a');
      }
      // Next calls are paid
      meter.recordUsage('agent-1', 'tool-a');
      meter.recordUsage('agent-1', 'tool-a');

      const summary = meter.getAgentUsage('agent-1', 'monthly');
      expect(summary.total.freeTierCalls).toBe(10);
      expect(summary.total.paidCalls).toBe(2);
      expect(summary.total.paidCost).toBe(200);
    });
  });

  describe('getGlobalUsage', () => {
    it('aggregates across all agents', () => {
      meter.recordUsage('agent-1', 'tool-a');
      meter.recordUsage('agent-2', 'tool-a');
      meter.recordUsage('agent-3', 'tool-b');

      const global = meter.getGlobalUsage('monthly');
      expect(global.totalCalls).toBe(3);
      expect(global.totalCost).toBe(300);
    });
  });

  describe('getTopTools', () => {
    it('returns tools sorted by cost', () => {
      meter.recordUsage('agent-1', 'tool-a');
      meter.recordUsage('agent-1', 'premium-tool');
      meter.recordUsage('agent-1', 'premium-tool');

      const top = meter.getTopTools('monthly', 5);
      expect(top[0].toolId).toBe('premium-tool');
      expect(top[0].cost).toBe(10000);
      expect(top[1].toolId).toBe('tool-a');
    });
  });

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  describe('queries', () => {
    it('lists tracked agents', () => {
      meter.recordUsage('a', 'tool-a');
      meter.recordUsage('b', 'tool-a');
      expect(meter.getTrackedAgents()).toEqual(['a', 'b']);
    });

    it('returns raw events', () => {
      meter.recordUsage('a', 'tool-a');
      meter.recordUsage('a', 'tool-b');
      const events = meter.getEvents('a');
      expect(events).toHaveLength(2);
    });

    it('counts total events', () => {
      meter.recordUsage('a', 'tool-a');
      meter.recordUsage('b', 'tool-a');
      expect(meter.getTotalEventCount()).toBe(2);
    });
  });
});
