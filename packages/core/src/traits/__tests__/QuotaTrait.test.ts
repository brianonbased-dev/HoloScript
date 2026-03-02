import { describe, it, expect, beforeEach } from 'vitest';
import { quotaHandler } from '../QuotaTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('QuotaTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const baseCfg = {
    tenantId: 'acme-corp-001',
    enabled: true,
    sceneCount: 10,
    gaussianBudget: 1_000_000,
    renderCredits: 500,
    storageBytes: 1024 * 1024 * 100,
    exportCount: 20,
    apiCalls: 5000,
    concurrentUsers: 5,
    customTraits: 10,
    defaultEnforcement: 'hard' as const,
    enableUserSubQuotas: true,
    gracePeriodMinutes: 0,
    notificationThresholds: [50, 75, 90, 100],
  };

  beforeEach(() => {
    node = createMockNode('quota-node');
    ctx = createMockContext();
    attachTrait(quotaHandler, node, baseCfg, ctx);
  });

  // =========================================================================
  // Initialization
  // =========================================================================

  it('initializes with all quota limits', () => {
    const state = (node as any).__quotaState;
    expect(state).toBeDefined();
    expect(state.limits.size).toBe(8);
    expect(state.limits.has('scene_count')).toBe(true);
    expect(state.limits.has('gaussian_budget')).toBe(true);
    expect(state.limits.has('render_credits')).toBe(true);
    expect(state.limits.has('storage_bytes')).toBe(true);
    expect(state.limits.has('export_count')).toBe(true);
    expect(state.limits.has('api_calls')).toBe(true);
    expect(state.limits.has('concurrent_users')).toBe(true);
    expect(state.limits.has('custom_traits')).toBe(true);
  });

  it('emits quota_initialized on attach', () => {
    expect(getEventCount(ctx, 'quota_initialized')).toBe(1);
    const event = getLastEvent(ctx, 'quota_initialized') as any;
    expect(event.tenantId).toBe('acme-corp-001');
    expect(event.limits.length).toBe(8);
  });

  it('rejects quota without tenantId', () => {
    const n = createMockNode('bad');
    const c = createMockContext();
    attachTrait(quotaHandler, n, { tenantId: '' }, c);
    expect(getEventCount(c, 'quota_error')).toBe(1);
  });

  // =========================================================================
  // Quota Consumption
  // =========================================================================

  it('consumes quota and updates usage', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume',
      resource: 'scene_count',
      amount: 1,
      userId: 'user-1',
    });
    const state = (node as any).__quotaState;
    const limit = state.limits.get('scene_count');
    expect(limit.currentUsage).toBe(1);
    expect(getEventCount(ctx, 'quota_consumed')).toBe(1);
  });

  it('tracks peak usage', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 5,
    });
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_release', resource: 'scene_count', amount: 3,
    });
    const state = (node as any).__quotaState;
    const limit = state.limits.get('scene_count');
    expect(limit.currentUsage).toBe(2);
    expect(limit.peakUsage).toBe(5);
  });

  it('blocks consumption on hard limit exceeded', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 11,
    });
    expect(getEventCount(ctx, 'quota_exceeded')).toBe(1);
    const exceeded = getLastEvent(ctx, 'quota_exceeded') as any;
    expect(exceeded.blocked).toBe(true);
    expect(exceeded.enforcement).toBe('hard');
    // Usage should NOT have been applied
    const state = (node as any).__quotaState;
    const limit = state.limits.get('scene_count');
    expect(limit.currentUsage).toBe(0);
  });

  it('allows soft limit exceeded with warning', () => {
    const cfg = { ...baseCfg, defaultEnforcement: 'soft' as const, sceneCount: 5 };
    const n = createMockNode('soft');
    const c = createMockContext();
    attachTrait(quotaHandler, n, cfg, c);
    sendEvent(quotaHandler, n, cfg, c, {
      type: 'quota_consume', resource: 'scene_count', amount: 6,
    });
    expect(getEventCount(c, 'quota_exceeded')).toBe(1);
    const exceeded = getLastEvent(c, 'quota_exceeded') as any;
    expect(exceeded.blocked).toBe(false);
    expect(exceeded.enforcement).toBe('soft');
    // Usage should have been applied
    const state = (n as any).__quotaState;
    const limit = state.limits.get('scene_count');
    expect(limit.currentUsage).toBe(6);
    expect(limit.overage).toBe(1);
  });

  // =========================================================================
  // Notifications
  // =========================================================================

  it('triggers notification thresholds', () => {
    // Consume 50% of scene_count (5 out of 10)
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 5,
    });
    expect(getEventCount(ctx, 'quota_threshold_reached')).toBe(1);
    const threshold = getLastEvent(ctx, 'quota_threshold_reached') as any;
    expect(threshold.threshold).toBe(50);
    expect(threshold.resource).toBe('scene_count');
  });

  it('triggers multiple thresholds at once', () => {
    // Consume 100% (10 out of 10) - should trigger 50, 75, 90, 100
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 10,
    });
    expect(getEventCount(ctx, 'quota_threshold_reached')).toBe(4);
  });

  it('does not re-trigger already sent thresholds', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 5,
    });
    const firstCount = getEventCount(ctx, 'quota_threshold_reached');
    // Consume 1 more (still at 60%, should not re-trigger 50%)
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 1,
    });
    expect(getEventCount(ctx, 'quota_threshold_reached')).toBe(firstCount);
  });

  // =========================================================================
  // Quota Release
  // =========================================================================

  it('releases quota and reduces usage', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 5,
    });
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_release', resource: 'scene_count', amount: 2,
    });
    const state = (node as any).__quotaState;
    expect(state.limits.get('scene_count').currentUsage).toBe(3);
    expect(getEventCount(ctx, 'quota_released')).toBe(1);
  });

  it('does not go below zero on release', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_release', resource: 'scene_count', amount: 5,
    });
    const state = (node as any).__quotaState;
    expect(state.limits.get('scene_count').currentUsage).toBe(0);
  });

  // =========================================================================
  // Quota Limit Changes
  // =========================================================================

  it('changes quota limit', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_set_limit', resource: 'scene_count', limit: 50,
    });
    const state = (node as any).__quotaState;
    expect(state.limits.get('scene_count').hardLimit).toBe(50);
    expect(getEventCount(ctx, 'quota_limit_changed')).toBe(1);
  });

  it('recalculates overage on limit decrease', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 8,
    });
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_set_limit', resource: 'scene_count', limit: 5,
    });
    const state = (node as any).__quotaState;
    expect(state.limits.get('scene_count').overage).toBe(3);
  });

  // =========================================================================
  // Tier Application
  // =========================================================================

  it('applies tier defaults', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_apply_tier', tier: 'enterprise',
    });
    expect(getEventCount(ctx, 'quota_tier_applied')).toBe(1);
    const state = (node as any).__quotaState;
    expect(state.limits.get('scene_count').hardLimit).toBe(1_000);
    expect(state.limits.get('gaussian_budget').hardLimit).toBe(100_000_000);
  });

  it('rejects unknown tier', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_apply_tier', tier: 'mythical',
    });
    expect(getEventCount(ctx, 'quota_error')).toBe(1);
  });

  // =========================================================================
  // User Sub-Quotas
  // =========================================================================

  it('tracks per-user sub-quotas when enabled', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 3, userId: 'user-1',
    });
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 2, userId: 'user-2',
    });
    const state = (node as any).__quotaState;
    const u1 = state.userSubQuotas.get('user-1');
    expect(u1).toBeDefined();
    expect(u1[0].currentUsage).toBe(3);
    const u2 = state.userSubQuotas.get('user-2');
    expect(u2[0].currentUsage).toBe(2);
  });

  // =========================================================================
  // Query
  // =========================================================================

  it('queries specific quota resource', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 3,
    });
    ctx.clearEvents();
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_query', resource: 'scene_count', queryId: 'q1',
    });
    const result = getLastEvent(ctx, 'quota_info') as any;
    expect(result.resource).toBe('scene_count');
    expect(result.currentUsage).toBe(3);
    expect(result.hardLimit).toBe(10);
    expect(result.usagePercent).toBe(30);
  });

  it('queries all quotas', () => {
    ctx.clearEvents();
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_query', queryId: 'q2',
    });
    const result = getLastEvent(ctx, 'quota_info') as any;
    expect(result.limits).toBeDefined();
    expect(Object.keys(result.limits).length).toBe(8);
  });

  // =========================================================================
  // Gaussian Budget Specific
  // =========================================================================

  it('tracks Gaussian budget consumption', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'gaussian_budget', amount: 500_000,
    });
    const state = (node as any).__quotaState;
    expect(state.limits.get('gaussian_budget').currentUsage).toBe(500_000);
  });

  it('blocks Gaussian overage with hard limit', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'gaussian_budget', amount: 1_500_000,
    });
    expect(getEventCount(ctx, 'quota_exceeded')).toBe(1);
    const exceeded = getLastEvent(ctx, 'quota_exceeded') as any;
    expect(exceeded.blocked).toBe(true);
    expect(exceeded.resource).toBe('gaussian_budget');
  });

  // =========================================================================
  // Render Credits
  // =========================================================================

  it('tracks render credit consumption', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'render_credits', amount: 100,
    });
    const state = (node as any).__quotaState;
    expect(state.limits.get('render_credits').currentUsage).toBe(100);
  });

  // =========================================================================
  // Storage
  // =========================================================================

  it('tracks storage consumption in bytes', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'storage_bytes', amount: 50 * 1024 * 1024,
    });
    const state = (node as any).__quotaState;
    expect(state.limits.get('storage_bytes').currentUsage).toBe(50 * 1024 * 1024);
  });

  // =========================================================================
  // Usage Report
  // =========================================================================

  it('generates usage report', () => {
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 1,
    });
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_consume', resource: 'scene_count', amount: 2,
    });
    ctx.clearEvents();
    sendEvent(quotaHandler, node, baseCfg, ctx, {
      type: 'quota_usage_report', resource: 'scene_count', queryId: 'rpt1', limit: 10,
    });
    const result = getLastEvent(ctx, 'quota_usage_report_result') as any;
    expect(result.records.length).toBe(2);
    expect(result.total).toBe(2);
  });

  // =========================================================================
  // Detach
  // =========================================================================

  it('cleans up on detach', () => {
    quotaHandler.onDetach?.(node as any, { ...quotaHandler.defaultConfig, ...baseCfg }, ctx as any);
    expect((node as any).__quotaState).toBeUndefined();
    expect(getEventCount(ctx, 'audit_log')).toBeGreaterThanOrEqual(1);
  });
});
