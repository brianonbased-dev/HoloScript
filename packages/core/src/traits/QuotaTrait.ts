/**
 * Quota Trait
 *
 * Manages usage quotas and resource limits for HoloScript enterprise multi-tenant
 * deployments. Tracks and enforces limits on:
 *
 * - Scene count: Maximum number of scenes per tenant
 * - Gaussian budget: Total Gaussian splat count across all scenes
 * - Render credits: Compute credits for server-side rendering
 * - Storage: Total storage consumed by assets, scenes, and exports
 *
 * Supports:
 * - Soft limits (warnings) and hard limits (enforcement)
 * - Quota reset periods (monthly, weekly)
 * - Overage tracking and billing integration
 * - Per-user sub-quotas within a tenant
 * - Real-time usage monitoring via events
 *
 * @version 1.0.0
 * @category enterprise
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Quota resource types */
export type QuotaResource =
  | 'scene_count'
  | 'gaussian_budget'
  | 'render_credits'
  | 'storage_bytes'
  | 'export_count'
  | 'api_calls'
  | 'concurrent_users'
  | 'custom_traits';

/** Quota enforcement behavior */
export type QuotaEnforcement = 'hard' | 'soft' | 'warn_only';

/** Quota reset period */
export type QuotaResetPeriod = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Individual quota limit definition */
export interface QuotaLimit {
  /** Resource being limited */
  resource: QuotaResource;
  /** Maximum allowed value (hard limit) */
  hardLimit: number;
  /** Warning threshold (soft limit, percentage of hard limit 0-100) */
  softLimitPercent: number;
  /** Current usage */
  currentUsage: number;
  /** Enforcement behavior */
  enforcement: QuotaEnforcement;
  /** Reset period for this quota */
  resetPeriod: QuotaResetPeriod;
  /** Last reset timestamp */
  lastResetAt: string;
  /** Peak usage since last reset */
  peakUsage: number;
  /** Overage amount (usage beyond hard limit, for soft enforcement) */
  overage: number;
}

/** Per-user sub-quota */
export interface UserSubQuota {
  userId: string;
  resource: QuotaResource;
  limit: number;
  currentUsage: number;
}

/** Quota usage event for tracking */
export interface QuotaUsageRecord {
  timestamp: string;
  tenantId: string;
  userId?: string;
  resource: QuotaResource;
  action: 'increment' | 'decrement' | 'set';
  amount: number;
  previousUsage: number;
  newUsage: number;
  limitExceeded: boolean;
}

/** Quota configuration for trait handler */
export interface QuotaConfig {
  /** Tenant this quota belongs to */
  tenantId: string;
  /** Whether quota enforcement is enabled */
  enabled: boolean;
  /** Scene count limits */
  sceneCount: number;
  /** Gaussian splat budget (total across all scenes) */
  gaussianBudget: number;
  /** Monthly render credits */
  renderCredits: number;
  /** Storage limit in bytes */
  storageBytes: number;
  /** Monthly export limit */
  exportCount: number;
  /** Monthly API call limit */
  apiCalls: number;
  /** Concurrent user limit */
  concurrentUsers: number;
  /** Custom trait registration limit */
  customTraits: number;
  /** Global enforcement mode */
  defaultEnforcement: QuotaEnforcement;
  /** Whether to track per-user sub-quotas */
  enableUserSubQuotas: boolean;
  /** Grace period in minutes after hard limit (0 = immediate) */
  gracePeriodMinutes: number;
  /** Notification thresholds (percentages) */
  notificationThresholds: number[];
}

/** Internal state for quota tracking */
interface QuotaState {
  /** All quota limits */
  limits: Map<QuotaResource, QuotaLimit>;
  /** Per-user sub-quotas */
  userSubQuotas: Map<string, UserSubQuota[]>;
  /** Usage history for analytics */
  usageHistory: QuotaUsageRecord[];
  /** Notification state (which thresholds have been triggered) */
  notificationsSent: Map<QuotaResource, Set<number>>;
  /** Grace period tracking */
  graceActive: Map<QuotaResource, { startedAt: string; expiresAt: string }>;
}

// =============================================================================
// TIER-BASED DEFAULT QUOTAS
// =============================================================================

const TIER_DEFAULTS: Record<string, Partial<QuotaConfig>> = {
  free: {
    sceneCount: 3,
    gaussianBudget: 100_000,
    renderCredits: 100,
    storageBytes: 100 * 1024 * 1024, // 100 MB
    exportCount: 5,
    apiCalls: 1_000,
    concurrentUsers: 1,
    customTraits: 0,
  },
  starter: {
    sceneCount: 25,
    gaussianBudget: 1_000_000,
    renderCredits: 1_000,
    storageBytes: 1024 * 1024 * 1024, // 1 GB
    exportCount: 50,
    apiCalls: 10_000,
    concurrentUsers: 5,
    customTraits: 5,
  },
  professional: {
    sceneCount: 100,
    gaussianBudget: 10_000_000,
    renderCredits: 10_000,
    storageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    exportCount: 500,
    apiCalls: 100_000,
    concurrentUsers: 25,
    customTraits: 25,
  },
  enterprise: {
    sceneCount: 1_000,
    gaussianBudget: 100_000_000,
    renderCredits: 100_000,
    storageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    exportCount: 5_000,
    apiCalls: 1_000_000,
    concurrentUsers: 100,
    customTraits: 100,
  },
  unlimited: {
    sceneCount: Number.MAX_SAFE_INTEGER,
    gaussianBudget: Number.MAX_SAFE_INTEGER,
    renderCredits: Number.MAX_SAFE_INTEGER,
    storageBytes: Number.MAX_SAFE_INTEGER,
    exportCount: Number.MAX_SAFE_INTEGER,
    apiCalls: Number.MAX_SAFE_INTEGER,
    concurrentUsers: Number.MAX_SAFE_INTEGER,
    customTraits: Number.MAX_SAFE_INTEGER,
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createQuotaLimit(
  resource: QuotaResource,
  hardLimit: number,
  enforcement: QuotaEnforcement,
  resetPeriod: QuotaResetPeriod = 'monthly'
): QuotaLimit {
  return {
    resource,
    hardLimit,
    softLimitPercent: 80,
    currentUsage: 0,
    enforcement,
    resetPeriod,
    lastResetAt: new Date().toISOString(),
    peakUsage: 0,
    overage: 0,
  };
}

function shouldReset(limit: QuotaLimit): boolean {
  if (limit.resetPeriod === 'none') return false;

  const now = new Date();
  const lastReset = new Date(limit.lastResetAt);

  switch (limit.resetPeriod) {
    case 'daily':
      return now.getDate() !== lastReset.getDate() || now.getMonth() !== lastReset.getMonth();
    case 'weekly': {
      const diffMs = now.getTime() - lastReset.getTime();
      return diffMs >= 7 * 24 * 60 * 60 * 1000;
    }
    case 'monthly':
      return (
        now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()
      );
    case 'yearly':
      return now.getFullYear() !== lastReset.getFullYear();
    default:
      return false;
  }
}

// =============================================================================
// QUOTA TRAIT HANDLER
// =============================================================================

export const quotaHandler: TraitHandler<QuotaConfig> = {
  name: 'quota' as any,

  defaultConfig: {
    tenantId: '',
    enabled: true,
    sceneCount: 3,
    gaussianBudget: 100_000,
    renderCredits: 100,
    storageBytes: 100 * 1024 * 1024,
    exportCount: 5,
    apiCalls: 1_000,
    concurrentUsers: 1,
    customTraits: 0,
    defaultEnforcement: 'hard',
    enableUserSubQuotas: false,
    gracePeriodMinutes: 0,
    notificationThresholds: [50, 75, 90, 95, 100],
  },

  onAttach(node, config, context) {
    if (!config.tenantId) {
      context.emit('quota_error', {
        node,
        error: 'TENANT_ID_REQUIRED',
        message: 'Quota must be associated with a tenant',
      });
      return;
    }

    const state: QuotaState = {
      limits: new Map(),
      userSubQuotas: new Map(),
      usageHistory: [],
      notificationsSent: new Map(),
      graceActive: new Map(),
    };

    // Initialize quota limits from config
    const resourceConfigs: [QuotaResource, number, QuotaResetPeriod][] = [
      ['scene_count', config.sceneCount, 'none'],
      ['gaussian_budget', config.gaussianBudget, 'none'],
      ['render_credits', config.renderCredits, 'monthly'],
      ['storage_bytes', config.storageBytes, 'none'],
      ['export_count', config.exportCount, 'monthly'],
      ['api_calls', config.apiCalls, 'monthly'],
      ['concurrent_users', config.concurrentUsers, 'none'],
      ['custom_traits', config.customTraits, 'none'],
    ];

    for (const [resource, limit, resetPeriod] of resourceConfigs) {
      state.limits.set(
        resource,
        createQuotaLimit(resource, limit, config.defaultEnforcement, resetPeriod)
      );
      state.notificationsSent.set(resource, new Set());
    }

    (node as any).__quotaState = state;

    context.emit('quota_initialized', {
      node,
      tenantId: config.tenantId,
      limits: resourceConfigs.map(([r, l]) => ({ resource: r, hardLimit: l })),
    });
    context.emit('audit_log', {
      action: 'quota.initialize',
      tenantId: config.tenantId,
      details: { limits: Object.fromEntries(resourceConfigs.map(([r, l]) => [r, l])) },
      timestamp: new Date().toISOString(),
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__quotaState as QuotaState | undefined;
    if (state) {
      context.emit('audit_log', {
        action: 'quota.teardown',
        tenantId: config.tenantId,
        details: {
          totalUsageRecords: state.usageHistory.length,
          finalUsage: Object.fromEntries(
            Array.from(state.limits.entries()).map(([k, v]) => [k, v.currentUsage])
          ),
        },
        timestamp: new Date().toISOString(),
      });
    }
    delete (node as any).__quotaState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__quotaState as QuotaState | undefined;
    if (!state || !config.enabled) return;

    // Check for quota resets
    for (const [resource, limit] of state.limits) {
      if (shouldReset(limit)) {
        const previousUsage = limit.currentUsage;
        limit.currentUsage = 0;
        limit.peakUsage = 0;
        limit.overage = 0;
        limit.lastResetAt = new Date().toISOString();

        // Clear notifications for this resource
        state.notificationsSent.get(resource)?.clear();

        // Clear grace periods
        state.graceActive.delete(resource);

        context.emit('quota_reset', {
          node,
          tenantId: config.tenantId,
          resource,
          previousUsage,
          resetPeriod: limit.resetPeriod,
        });
        context.emit('audit_log', {
          action: 'quota.reset',
          tenantId: config.tenantId,
          details: { resource, previousUsage, resetPeriod: limit.resetPeriod },
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Check grace period expirations
    const now = new Date();
    for (const [resource, grace] of state.graceActive) {
      if (new Date(grace.expiresAt) <= now) {
        state.graceActive.delete(resource);
        context.emit('quota_grace_expired', {
          node,
          tenantId: config.tenantId,
          resource,
        });
      }
    }

    // Trim usage history (keep last 50000 records)
    if (state.usageHistory.length > 50000) {
      state.usageHistory = state.usageHistory.slice(-50000);
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__quotaState as QuotaState | undefined;
    if (!state) return;

    if (event.type === 'quota_consume') {
      const resource = (event as any).resource as QuotaResource;
      const amount = ((event as any).amount as number) || 1;
      const userId = (event as any).userId as string | undefined;

      if (!resource) return;

      const limit = state.limits.get(resource);
      if (!limit) return;

      const previousUsage = limit.currentUsage;
      const newUsage = limit.currentUsage + amount;
      const exceeds = newUsage > limit.hardLimit;

      // Enforce hard limit
      if (exceeds && limit.enforcement === 'hard') {
        // Check grace period
        if (config.gracePeriodMinutes > 0 && !state.graceActive.has(resource)) {
          const graceStart = new Date();
          const graceEnd = new Date(graceStart.getTime() + config.gracePeriodMinutes * 60 * 1000);
          state.graceActive.set(resource, {
            startedAt: graceStart.toISOString(),
            expiresAt: graceEnd.toISOString(),
          });
          context.emit('quota_grace_started', {
            node,
            tenantId: config.tenantId,
            resource,
            expiresAt: graceEnd.toISOString(),
          });
        } else if (!state.graceActive.has(resource)) {
          context.emit('quota_exceeded', {
            node,
            tenantId: config.tenantId,
            resource,
            hardLimit: limit.hardLimit,
            attempted: newUsage,
            enforcement: 'hard',
            blocked: true,
          });
          context.emit('audit_log', {
            action: 'quota.exceeded.blocked',
            tenantId: config.tenantId,
            details: { resource, hardLimit: limit.hardLimit, attempted: newUsage, userId },
            timestamp: new Date().toISOString(),
          });
          return; // Block the operation
        }
      }

      // Apply usage
      limit.currentUsage = newUsage;
      if (newUsage > limit.peakUsage) {
        limit.peakUsage = newUsage;
      }
      if (exceeds) {
        limit.overage = newUsage - limit.hardLimit;
      }

      // Track user sub-quota
      if (config.enableUserSubQuotas && userId) {
        if (!state.userSubQuotas.has(userId)) {
          state.userSubQuotas.set(userId, []);
        }
        const userQuotas = state.userSubQuotas.get(userId)!;
        let userQuota = userQuotas.find((q) => q.resource === resource);
        if (!userQuota) {
          userQuota = { userId, resource, limit: 0, currentUsage: 0 };
          userQuotas.push(userQuota);
        }
        userQuota.currentUsage += amount;
      }

      // Record usage
      const record: QuotaUsageRecord = {
        timestamp: new Date().toISOString(),
        tenantId: config.tenantId,
        userId,
        resource,
        action: 'increment',
        amount,
        previousUsage,
        newUsage,
        limitExceeded: exceeds,
      };
      state.usageHistory.push(record);

      // Check notification thresholds
      const usagePercent = (newUsage / limit.hardLimit) * 100;
      const notified = state.notificationsSent.get(resource) || new Set();
      for (const threshold of config.notificationThresholds) {
        if (usagePercent >= threshold && !notified.has(threshold)) {
          notified.add(threshold);
          context.emit('quota_threshold_reached', {
            node,
            tenantId: config.tenantId,
            resource,
            threshold,
            currentUsage: newUsage,
            hardLimit: limit.hardLimit,
            usagePercent: Math.round(usagePercent * 100) / 100,
          });
        }
      }

      // Emit soft limit warning
      if (exceeds && (limit.enforcement === 'soft' || limit.enforcement === 'warn_only')) {
        context.emit('quota_exceeded', {
          node,
          tenantId: config.tenantId,
          resource,
          hardLimit: limit.hardLimit,
          currentUsage: newUsage,
          enforcement: limit.enforcement,
          blocked: false,
          overage: limit.overage,
        });
      }

      context.emit('quota_consumed', {
        node,
        tenantId: config.tenantId,
        resource,
        amount,
        previousUsage,
        newUsage,
        hardLimit: limit.hardLimit,
      });
    } else if (event.type === 'quota_release') {
      const resource = (event as any).resource as QuotaResource;
      const amount = ((event as any).amount as number) || 1;

      if (!resource) return;

      const limit = state.limits.get(resource);
      if (!limit) return;

      const previousUsage = limit.currentUsage;
      limit.currentUsage = Math.max(0, limit.currentUsage - amount);
      if (limit.currentUsage <= limit.hardLimit) {
        limit.overage = 0;
      }

      const record: QuotaUsageRecord = {
        timestamp: new Date().toISOString(),
        tenantId: config.tenantId,
        resource,
        action: 'decrement',
        amount,
        previousUsage,
        newUsage: limit.currentUsage,
        limitExceeded: false,
      };
      state.usageHistory.push(record);

      context.emit('quota_released', {
        node,
        tenantId: config.tenantId,
        resource,
        amount,
        previousUsage,
        newUsage: limit.currentUsage,
      });
    } else if (event.type === 'quota_set_limit') {
      const resource = (event as any).resource as QuotaResource;
      const newLimit = (event as any).limit as number;

      if (!resource || newLimit === undefined) return;

      const limit = state.limits.get(resource);
      if (!limit) return;

      const oldLimit = limit.hardLimit;
      limit.hardLimit = newLimit;

      // Recalculate overage
      if (limit.currentUsage > newLimit) {
        limit.overage = limit.currentUsage - newLimit;
      } else {
        limit.overage = 0;
      }

      // Reset notifications
      state.notificationsSent.get(resource)?.clear();

      context.emit('quota_limit_changed', {
        node,
        tenantId: config.tenantId,
        resource,
        oldLimit,
        newLimit,
      });
      context.emit('audit_log', {
        action: 'quota.limit.change',
        tenantId: config.tenantId,
        details: { resource, oldLimit, newLimit },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'quota_apply_tier') {
      const tier = (event as any).tier as string;
      const tierDefaults = TIER_DEFAULTS[tier];

      if (!tierDefaults) {
        context.emit('quota_error', {
          node,
          error: 'UNKNOWN_TIER',
          message: `Unknown tier: ${tier}`,
        });
        return;
      }

      // Apply tier defaults
      const resourceMap: [QuotaResource, keyof QuotaConfig][] = [
        ['scene_count', 'sceneCount'],
        ['gaussian_budget', 'gaussianBudget'],
        ['render_credits', 'renderCredits'],
        ['storage_bytes', 'storageBytes'],
        ['export_count', 'exportCount'],
        ['api_calls', 'apiCalls'],
        ['concurrent_users', 'concurrentUsers'],
        ['custom_traits', 'customTraits'],
      ];

      for (const [resource, configKey] of resourceMap) {
        const newLimit = (tierDefaults as any)[configKey];
        if (newLimit !== undefined) {
          const limit = state.limits.get(resource);
          if (limit) {
            limit.hardLimit = newLimit;
            if (limit.currentUsage > newLimit) {
              limit.overage = limit.currentUsage - newLimit;
            } else {
              limit.overage = 0;
            }
          }
          (config as any)[configKey] = newLimit;
        }
      }

      context.emit('quota_tier_applied', {
        node,
        tenantId: config.tenantId,
        tier,
        limits: Object.fromEntries(
          Array.from(state.limits.entries()).map(([k, v]) => [k, v.hardLimit])
        ),
      });
      context.emit('audit_log', {
        action: 'quota.tier.apply',
        tenantId: config.tenantId,
        details: { tier },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'quota_query') {
      const resource = (event as any).resource as QuotaResource | undefined;

      if (resource) {
        const limit = state.limits.get(resource);
        if (limit) {
          context.emit('quota_info', {
            queryId: (event as any).queryId,
            node,
            tenantId: config.tenantId,
            resource,
            ...limit,
            usagePercent:
              limit.hardLimit > 0
                ? Math.round((limit.currentUsage / limit.hardLimit) * 10000) / 100
                : 0,
          });
        }
      } else {
        // Return all quotas
        const allLimits: Record<string, any> = {};
        for (const [r, l] of state.limits) {
          allLimits[r] = {
            ...l,
            usagePercent:
              l.hardLimit > 0 ? Math.round((l.currentUsage / l.hardLimit) * 10000) / 100 : 0,
          };
        }
        context.emit('quota_info', {
          queryId: (event as any).queryId,
          node,
          tenantId: config.tenantId,
          limits: allLimits,
        });
      }
    } else if (event.type === 'quota_usage_report') {
      const resource = (event as any).resource as QuotaResource | undefined;
      const limit = ((event as any).limit as number) || 100;

      let history = state.usageHistory;
      if (resource) {
        history = history.filter((r) => r.resource === resource);
      }

      context.emit('quota_usage_report_result', {
        queryId: (event as any).queryId,
        node,
        tenantId: config.tenantId,
        records: history.slice(-limit),
        total: history.length,
      });
    }
  },
};

export { TIER_DEFAULTS as QUOTA_TIER_DEFAULTS };
export default quotaHandler;
