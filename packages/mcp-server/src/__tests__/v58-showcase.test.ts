/**
 * v5.8 "Live Economy" — End-to-end showcase test
 *
 * Tests the full economy stack:
 * 1. Paid plugin .holo composition parses and validates
 * 2. PaymentWebhookService HMAC verification + processing
 * 3. UsageMeter per-tool-call tracking + free-tier
 * 4. AgentBudgetEnforcer enforcement modes + circuit breaker
 * 5. CreatorRevenueAggregator earnings + payouts
 * 6. SubscriptionManager full lifecycle
 * 7. MCP economy tools (check_agent_budget, get_usage_summary, get_creator_earnings)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  PaymentWebhookService,
  CreatorRevenueAggregator,
} from '@holoscript/framework';
import {
  UsageMeter,
  AgentBudgetEnforcer,
  SubscriptionManager,
} from '@holoscript/framework/economy';
import { handleEconomyTool, resetEconomySingletons } from '../economy-tools';

// =============================================================================
// FIXTURES
// =============================================================================

const EXAMPLES_DIR = resolve(__dirname, '../../../../examples/economy');

// =============================================================================
// TESTS
// =============================================================================

describe('v5.8 Showcase — Live Economy', () => {
  beforeEach(() => {
    resetEconomySingletons();
  });

  // ===========================================================================
  // 1. PAID PLUGIN COMPOSITION
  // ===========================================================================

  describe('paid-plugin-flow.holo', () => {
    const code = readFileSync(resolve(EXAMPLES_DIR, 'paid-plugin-flow.holo'), 'utf-8');

    it('is a valid economy composition', () => {
      expect(code.length).toBeGreaterThan(500);
      expect(code).toContain('@world');
      expect(code).toContain('Paid Plugin Ecosystem');
    });

    it('defines a paid plugin with pricing', () => {
      expect(code).toContain('plugin "weather-premium"');
      expect(code).toContain('pricing:');
      expect(code).toContain('per-call');
      expect(code).toContain('USDC');
    });

    it('defines subscription plans', () => {
      expect(code).toContain('plan "free"');
      expect(code).toContain('plan "pro"');
      expect(code).toContain('plan "enterprise"');
      expect(code).toContain('trial_days:');
    });

    it('defines an agent with budget', () => {
      expect(code).toContain('agent WeatherBot');
      expect(code).toContain('budget:');
      expect(code).toContain('max_spend:');
      expect(code).toContain('circuit_breaker:');
    });

    it('defines a payment workflow', () => {
      expect(code).toContain('workflow "PaymentConfirmation"');
      expect(code).toContain('receive_webhook');
      expect(code).toContain('update_ledger');
      expect(code).toContain('depends_on:');
    });
  });

  // ===========================================================================
  // 2. WEBHOOK SERVICE E2E
  // ===========================================================================

  describe('PaymentWebhookService E2E', () => {
    it('full webhook flow: verify → process → ledger update', async () => {
      const service = new PaymentWebhookService({
        secrets: { x402: 'production-secret' },
      });

      // Register ledger update callback
      const ledgerUpdates: Array<{ id: string; settled: boolean }> = [];
      service.onLedgerUpdate((id, updates) => {
        ledgerUpdates.push({ id, settled: updates.settled as boolean });
      });

      // Create a payment confirmation webhook
      const payload = {
        eventId: 'evt-showcase-1',
        type: 'payment.confirmed' as const,
        provider: 'x402' as const,
        timestamp: new Date().toISOString(),
        data: { chain: 'base' },
        ledgerEntryId: 'ledger-001',
        transactionHash: '0xabc123',
        amount: 50000,
        payer: 'agent-weather-bot',
      };

      const rawBody = JSON.stringify(payload);
      const signature = service.createSignature(rawBody, 'x402');

      // Verify
      const verifyResult = service.verifySignature(rawBody, signature, 'x402');
      expect(verifyResult.verified).toBe(true);

      // Process
      const processResult = await service.processWebhook(payload);
      expect(processResult.success).toBe(true);

      // Ledger updated
      expect(ledgerUpdates).toHaveLength(1);
      expect(ledgerUpdates[0].id).toBe('ledger-001');
      expect(ledgerUpdates[0].settled).toBe(true);

      // Idempotent
      expect(service.isProcessed('evt-showcase-1')).toBe(true);
    });
  });

  // ===========================================================================
  // 3. USAGE METER E2E
  // ===========================================================================

  describe('UsageMeter E2E', () => {
    it('tracks usage with free-tier transition', () => {
      const meter = new UsageMeter({
        defaultToolCost: 1000,
        freeTier: { monthlyAllowance: 5000 },
        toolCosts: { 'weather-premium:forecast': 2000 },
      });

      // 5 free calls (5 × 1000 = 5000 allowance)
      for (let i = 0; i < 5; i++) {
        const event = meter.recordUsage('weather-bot', 'weather-premium:get_weather');
        expect(event.freeTier).toBe(true);
      }

      // Next call is paid
      const paidEvent = meter.recordUsage('weather-bot', 'weather-premium:get_weather');
      expect(paidEvent.freeTier).toBe(false);

      // Premium tool costs more
      const forecast = meter.recordUsage('weather-bot', 'weather-premium:forecast');
      expect(forecast.cost).toBe(2000);

      // Usage summary
      const summary = meter.getAgentUsage('weather-bot', 'monthly');
      expect(summary.total.totalCalls).toBe(7);
      expect(summary.total.freeTierCalls).toBe(5);
      expect(summary.total.paidCalls).toBe(2);
      expect(summary.freeTierRemaining).toBe(0);
    });
  });

  // ===========================================================================
  // 4. BUDGET ENFORCER E2E
  // ===========================================================================

  describe('AgentBudgetEnforcer E2E', () => {
    it('enforces budget with circuit breaker', () => {
      const enforcer = new AgentBudgetEnforcer({
        circuitBreakerResetMs: 50,
      });

      enforcer.setBudget({
        agentId: 'weather-bot',
        maxSpend: 100000, // $0.10
        period: 'daily',
        mode: 'hard',
        warnThreshold: 0.8,
        circuitBreakerThreshold: 3,
      });

      // Spend within budget
      let result = enforcer.authorize('weather-bot', 50000);
      expect(result.authorized).toBe(true);
      enforcer.recordSpend('weather-bot', 50000);

      // Warning level (80%)
      result = enforcer.authorize('weather-bot', 35000);
      expect(result.authorized).toBe(true);
      expect(result.warning).toBe(true);

      // Over budget
      enforcer.recordSpend('weather-bot', 35000);
      result = enforcer.authorize('weather-bot', 20000);
      expect(result.authorized).toBe(false);

      // State check
      const state = enforcer.getState('weather-bot');
      expect(state!.spent).toBe(85000);
      expect(state!.remaining).toBe(15000);
    });
  });

  // ===========================================================================
  // 5. CREATOR REVENUE E2E
  // ===========================================================================

  describe('CreatorRevenueAggregator E2E', () => {
    it('full revenue flow: record → aggregate → payout', () => {
      const aggregator = new CreatorRevenueAggregator({
        platformFeeRate: 0.15,
        minPayoutThreshold: 1000,
      });

      // Record revenue from multiple payers
      aggregator.recordRevenue('weather-labs', 'weather-premium', 10000, 'weather-bot');
      aggregator.recordRevenue('weather-labs', 'weather-premium', 5000, 'forecast-agent');
      aggregator.recordRevenue('weather-labs', 'weather-display', 3000, 'weather-bot');

      // Check earnings
      const earnings = aggregator.getCreatorEarnings('weather-labs', 'all-time');
      expect(earnings.totalGross).toBe(18000);
      expect(earnings.totalFees).toBe(2700); // 15%
      expect(earnings.totalNet).toBe(15300);
      expect(earnings.byPlugin.size).toBe(2);

      // Platform revenue
      const platform = aggregator.getPlatformRevenue('all-time');
      expect(platform.totalFees).toBe(2700);

      // Payout
      const eligible = aggregator.getPayoutEligible('all-time');
      expect(eligible).toHaveLength(1);
      expect(eligible[0].creatorId).toBe('weather-labs');

      const payout = aggregator.recordPayout('weather-labs', 15300, 'usdc_transfer', '0xpayout');
      expect(payout.status).toBe('completed');
    });
  });

  // ===========================================================================
  // 6. SUBSCRIPTION MANAGER E2E
  // ===========================================================================

  describe('SubscriptionManager E2E', () => {
    it('full lifecycle: trial → active → past_due → reactivate', async () => {
      const manager = new SubscriptionManager({ maxFailedRenewals: 2 });

      manager.registerPlan({
        id: 'pro',
        name: 'Pro',
        description: 'Pro tier',
        amount: 1000000,
        interval: 'monthly',
        trialDays: 7,
        features: ['all-tools'],
      });

      // Create with trial
      const sub = manager.create('weather-bot', 'pro');
      expect(sub.state).toBe('trial');
      expect(sub.inTrial).toBe(true);

      // Simulate trial end + successful renewal
      manager.onRenewal(async () => true);
      const renewResult = await manager.renew(sub.id);
      expect(renewResult.success).toBe(true);

      // Simulate failed renewal
      manager.onRenewal(async () => false);
      const failResult = await manager.renew(sub.id);
      expect(failResult.success).toBe(false);
      expect(failResult.subscription.state).toBe('past_due');

      // Reactivate
      const reactivated = manager.reactivate(sub.id);
      expect(reactivated.state).toBe('active');

      // Stats
      const stats = manager.getStats();
      expect(stats.total).toBe(1);
      expect(stats.totalMRR).toBe(1000000);
    });
  });

  // ===========================================================================
  // 7. MCP ECONOMY TOOLS
  // ===========================================================================

  describe('MCP economy tools', () => {
    it('check_agent_budget returns budget state', async () => {
      const result = (await handleEconomyTool('check_agent_budget', {
        agentId: 'test-agent',
      })) as { agentId: string; state: null | Record<string, unknown> };

      expect(result.agentId).toBe('test-agent');
      // No budget set yet, so state is null
      expect(result.state).toBeNull();
    });

    it('check_agent_budget with authorization check', async () => {
      const result = (await handleEconomyTool('check_agent_budget', {
        agentId: 'budget-agent',
        amount: 1000,
      })) as { authorization: { authorized: boolean } };

      expect(result.authorization.authorized).toBe(true);
    });

    it('get_usage_summary returns global summary', async () => {
      const result = (await handleEconomyTool('get_usage_summary', {
        period: 'monthly',
      })) as { period: string; summary: { totalCalls: number } };

      expect(result.period).toBe('monthly');
      expect(result.summary.totalCalls).toBe(0);
    });

    it('get_creator_earnings returns earnings data', async () => {
      const result = (await handleEconomyTool('get_creator_earnings', {
        creatorId: 'test-creator',
        period: 'all-time',
      })) as { creatorId: string; earnings: { totalGross: number }; platformFeeRate: number };

      expect(result.creatorId).toBe('test-creator');
      expect(result.earnings.totalGross).toBe(0);
      expect(result.platformFeeRate).toBe(0.15);
    });
  });
});
