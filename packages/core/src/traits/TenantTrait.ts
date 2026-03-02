/**
 * Tenant Trait
 *
 * Provides multi-tenant organization isolation for HoloScript enterprise deployments.
 * Manages tenant-scoped trait registries, ensuring complete data isolation between
 * organizations sharing the same HoloScript platform instance.
 *
 * Features:
 * - Organization-level isolation boundaries
 * - Tenant-scoped trait registries (each tenant sees only their registered traits)
 * - Cross-tenant resource sharing with explicit grants
 * - Tenant lifecycle management (create, suspend, archive, delete)
 * - Tenant metadata and configuration
 *
 * @version 1.0.0
 * @category enterprise
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Tenant lifecycle states */
export type TenantStatus =
  | 'active'
  | 'suspended'
  | 'archived'
  | 'provisioning'
  | 'decommissioning';

/** Tenant tier determines feature availability and default quotas */
export type TenantTier = 'free' | 'starter' | 'professional' | 'enterprise' | 'unlimited';

/** Isolation level for the tenant boundary */
export type IsolationLevel = 'logical' | 'physical' | 'hybrid';

/** Cross-tenant resource sharing grant */
export interface CrossTenantGrant {
  /** Source tenant granting access */
  sourceTenantId: string;
  /** Target tenant receiving access */
  targetTenantId: string;
  /** Resource type being shared */
  resourceType: 'scene' | 'trait' | 'asset' | 'template';
  /** Specific resource identifier */
  resourceId: string;
  /** Access level for the shared resource */
  accessLevel: 'read' | 'clone' | 'reference';
  /** When the grant expires (ISO 8601) */
  expiresAt?: string;
  /** Who created this grant */
  grantedBy: string;
  /** When this grant was created */
  grantedAt: string;
}

/** Tenant-scoped trait registry entry */
export interface TenantTraitRegistryEntry {
  /** Trait name */
  traitName: string;
  /** Whether this is a custom trait (not from core) */
  isCustom: boolean;
  /** Whether this trait is enabled for the tenant */
  enabled: boolean;
  /** Tier required to use this trait */
  requiredTier: TenantTier;
  /** Usage count for analytics */
  usageCount: number;
  /** Last used timestamp */
  lastUsed?: string;
}

/** Tenant configuration */
export interface TenantConfig {
  /** Unique tenant identifier (UUID) */
  tenantId: string;
  /** Organization display name */
  organizationName: string;
  /** Tenant status */
  status: TenantStatus;
  /** Subscription tier */
  tier: TenantTier;
  /** Data isolation level */
  isolationLevel: IsolationLevel;
  /** Custom domain for tenant (e.g., 'acme.holoscript.cloud') */
  customDomain?: string;
  /** Allowed origins for CORS */
  allowedOrigins: string[];
  /** Maximum number of users for this tenant */
  maxUsers: number;
  /** Namespace prefix for all tenant resources */
  namespacePrefix: string;
  /** Whether cross-tenant sharing is enabled */
  crossTenantSharingEnabled: boolean;
  /** Tags for classification */
  tags: Record<string, string>;
  /** Tenant creation timestamp */
  createdAt: string;
  /** Last activity timestamp */
  lastActivityAt: string;
}

/** Internal state for a tenant node */
interface TenantState {
  /** Active cross-tenant grants (outgoing) */
  outgoingGrants: Map<string, CrossTenantGrant>;
  /** Active cross-tenant grants (incoming) */
  incomingGrants: Map<string, CrossTenantGrant>;
  /** Tenant-scoped trait registry */
  traitRegistry: Map<string, TenantTraitRegistryEntry>;
  /** Active session count */
  activeSessions: number;
  /** Accumulated event log for this lifecycle */
  eventLog: TenantEvent[];
}

/** Audit-ready event record */
export interface TenantEvent {
  type: string;
  timestamp: string;
  tenantId: string;
  actorId?: string;
  details: Record<string, unknown>;
}

// =============================================================================
// TENANT TRAIT HANDLER
// =============================================================================

export const tenantHandler: TraitHandler<TenantConfig> = {
  name: 'tenant' as any,

  defaultConfig: {
    tenantId: '',
    organizationName: '',
    status: 'provisioning',
    tier: 'free',
    isolationLevel: 'logical',
    customDomain: undefined,
    allowedOrigins: [],
    maxUsers: 5,
    namespacePrefix: '',
    crossTenantSharingEnabled: false,
    tags: {},
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  },

  onAttach(node, config, context) {
    // Validate tenant ID
    if (!config.tenantId) {
      context.emit('tenant_error', {
        node,
        error: 'TENANT_ID_REQUIRED',
        message: 'A tenant must have a unique tenantId',
      });
      return;
    }

    // Initialize tenant state
    const state: TenantState = {
      outgoingGrants: new Map(),
      incomingGrants: new Map(),
      traitRegistry: new Map(),
      activeSessions: 0,
      eventLog: [],
    };
    (node as any).__tenantState = state;

    // Generate namespace prefix if not provided
    if (!config.namespacePrefix) {
      config.namespacePrefix = `t_${config.tenantId.replace(/-/g, '').substring(0, 12)}`;
    }

    // Record provisioning event
    const event: TenantEvent = {
      type: 'tenant_provisioned',
      timestamp: new Date().toISOString(),
      tenantId: config.tenantId,
      details: {
        organizationName: config.organizationName,
        tier: config.tier,
        isolationLevel: config.isolationLevel,
      },
    };
    state.eventLog.push(event);

    // Set status to active
    config.status = 'active';

    context.emit('tenant_provisioned', {
      node,
      tenantId: config.tenantId,
      organizationName: config.organizationName,
      tier: config.tier,
    });

    context.emit('audit_log', {
      action: 'tenant.create',
      tenantId: config.tenantId,
      details: event.details,
      timestamp: event.timestamp,
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__tenantState as TenantState | undefined;
    if (!state) return;

    // Revoke all outgoing grants
    for (const [grantId, grant] of state.outgoingGrants) {
      context.emit('cross_tenant_grant_revoked', {
        node,
        grantId,
        grant,
      });
    }

    // Notify incoming grant sources
    for (const [grantId, grant] of state.incomingGrants) {
      context.emit('cross_tenant_grant_expired', {
        node,
        grantId,
        sourceTenantId: grant.sourceTenantId,
      });
    }

    context.emit('audit_log', {
      action: 'tenant.decommission',
      tenantId: config.tenantId,
      details: {
        totalEvents: state.eventLog.length,
        outgoingGrantsRevoked: state.outgoingGrants.size,
      },
      timestamp: new Date().toISOString(),
    });

    context.emit('tenant_decommissioned', {
      node,
      tenantId: config.tenantId,
    });

    delete (node as any).__tenantState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__tenantState as TenantState | undefined;
    if (!state) return;

    // Skip updates for non-active tenants
    if (config.status !== 'active') return;

    // Update last activity timestamp
    config.lastActivityAt = new Date().toISOString();

    // Check and expire cross-tenant grants
    const now = new Date();
    for (const [grantId, grant] of state.outgoingGrants) {
      if (grant.expiresAt && new Date(grant.expiresAt) <= now) {
        state.outgoingGrants.delete(grantId);
        context.emit('cross_tenant_grant_expired', {
          node,
          grantId,
          targetTenantId: grant.targetTenantId,
          resourceId: grant.resourceId,
        });
      }
    }

    for (const [grantId, grant] of state.incomingGrants) {
      if (grant.expiresAt && new Date(grant.expiresAt) <= now) {
        state.incomingGrants.delete(grantId);
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__tenantState as TenantState | undefined;
    if (!state) return;

    if (event.type === 'tenant_suspend') {
      if (config.status === 'active') {
        config.status = 'suspended';
        const reason = (event as any).reason || 'manual';
        state.eventLog.push({
          type: 'tenant_suspended',
          timestamp: new Date().toISOString(),
          tenantId: config.tenantId,
          details: { reason },
        });
        context.emit('tenant_status_changed', {
          node,
          tenantId: config.tenantId,
          oldStatus: 'active',
          newStatus: 'suspended',
          reason,
        });
        context.emit('audit_log', {
          action: 'tenant.suspend',
          tenantId: config.tenantId,
          details: { reason },
          timestamp: new Date().toISOString(),
        });
      }
    } else if (event.type === 'tenant_reactivate') {
      if (config.status === 'suspended') {
        config.status = 'active';
        state.eventLog.push({
          type: 'tenant_reactivated',
          timestamp: new Date().toISOString(),
          tenantId: config.tenantId,
          details: {},
        });
        context.emit('tenant_status_changed', {
          node,
          tenantId: config.tenantId,
          oldStatus: 'suspended',
          newStatus: 'active',
        });
        context.emit('audit_log', {
          action: 'tenant.reactivate',
          tenantId: config.tenantId,
          details: {},
          timestamp: new Date().toISOString(),
        });
      }
    } else if (event.type === 'tenant_archive') {
      config.status = 'archived';
      state.eventLog.push({
        type: 'tenant_archived',
        timestamp: new Date().toISOString(),
        tenantId: config.tenantId,
        details: {},
      });
      context.emit('tenant_status_changed', {
        node,
        tenantId: config.tenantId,
        oldStatus: config.status,
        newStatus: 'archived',
      });
      context.emit('audit_log', {
        action: 'tenant.archive',
        tenantId: config.tenantId,
        details: {},
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'tenant_register_trait') {
      const traitName = (event as any).traitName as string;
      const isCustom = (event as any).isCustom ?? true;
      const requiredTier = (event as any).requiredTier ?? 'free';

      if (!traitName) return;

      state.traitRegistry.set(traitName, {
        traitName,
        isCustom,
        enabled: true,
        requiredTier,
        usageCount: 0,
      });

      context.emit('tenant_trait_registered', {
        node,
        tenantId: config.tenantId,
        traitName,
        isCustom,
      });
      context.emit('audit_log', {
        action: 'tenant.trait.register',
        tenantId: config.tenantId,
        details: { traitName, isCustom, requiredTier },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'tenant_unregister_trait') {
      const traitName = (event as any).traitName as string;
      if (traitName && state.traitRegistry.has(traitName)) {
        state.traitRegistry.delete(traitName);
        context.emit('tenant_trait_unregistered', {
          node,
          tenantId: config.tenantId,
          traitName,
        });
        context.emit('audit_log', {
          action: 'tenant.trait.unregister',
          tenantId: config.tenantId,
          details: { traitName },
          timestamp: new Date().toISOString(),
        });
      }
    } else if (event.type === 'tenant_use_trait') {
      const traitName = (event as any).traitName as string;
      const entry = state.traitRegistry.get(traitName);
      if (entry) {
        entry.usageCount++;
        entry.lastUsed = new Date().toISOString();
      }
    } else if (event.type === 'cross_tenant_grant_request') {
      if (!config.crossTenantSharingEnabled) {
        context.emit('cross_tenant_grant_denied', {
          node,
          reason: 'sharing_disabled',
          tenantId: config.tenantId,
        });
        return;
      }

      const grant: CrossTenantGrant = {
        sourceTenantId: config.tenantId,
        targetTenantId: (event as any).targetTenantId,
        resourceType: (event as any).resourceType,
        resourceId: (event as any).resourceId,
        accessLevel: (event as any).accessLevel || 'read',
        expiresAt: (event as any).expiresAt,
        grantedBy: (event as any).grantedBy || 'system',
        grantedAt: new Date().toISOString(),
      };

      const grantId = `grant_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      state.outgoingGrants.set(grantId, grant);

      context.emit('cross_tenant_grant_created', {
        node,
        grantId,
        grant,
      });
      context.emit('audit_log', {
        action: 'tenant.grant.create',
        tenantId: config.tenantId,
        details: { grantId, ...grant },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'cross_tenant_grant_revoke') {
      const grantId = (event as any).grantId as string;
      const grant = state.outgoingGrants.get(grantId);
      if (grant) {
        state.outgoingGrants.delete(grantId);
        context.emit('cross_tenant_grant_revoked', {
          node,
          grantId,
          grant,
        });
        context.emit('audit_log', {
          action: 'tenant.grant.revoke',
          tenantId: config.tenantId,
          details: { grantId, targetTenantId: grant.targetTenantId },
          timestamp: new Date().toISOString(),
        });
      }
    } else if (event.type === 'tenant_session_start') {
      state.activeSessions++;
      context.emit('audit_log', {
        action: 'tenant.session.start',
        tenantId: config.tenantId,
        details: {
          userId: (event as any).userId,
          activeSessions: state.activeSessions,
        },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'tenant_session_end') {
      state.activeSessions = Math.max(0, state.activeSessions - 1);
      context.emit('audit_log', {
        action: 'tenant.session.end',
        tenantId: config.tenantId,
        details: {
          userId: (event as any).userId,
          activeSessions: state.activeSessions,
        },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'tenant_upgrade_tier') {
      const oldTier = config.tier;
      const newTier = (event as any).tier as TenantTier;
      if (newTier) {
        config.tier = newTier;
        state.eventLog.push({
          type: 'tenant_tier_upgraded',
          timestamp: new Date().toISOString(),
          tenantId: config.tenantId,
          details: { oldTier, newTier },
        });
        context.emit('tenant_tier_changed', {
          node,
          tenantId: config.tenantId,
          oldTier,
          newTier,
        });
        context.emit('audit_log', {
          action: 'tenant.tier.upgrade',
          tenantId: config.tenantId,
          details: { oldTier, newTier },
          timestamp: new Date().toISOString(),
        });
      }
    } else if (event.type === 'tenant_query') {
      context.emit('tenant_info', {
        queryId: (event as any).queryId,
        node,
        tenantId: config.tenantId,
        organizationName: config.organizationName,
        status: config.status,
        tier: config.tier,
        activeSessions: state.activeSessions,
        registeredTraits: state.traitRegistry.size,
        outgoingGrants: state.outgoingGrants.size,
        incomingGrants: state.incomingGrants.size,
        totalEvents: state.eventLog.length,
      });
    }
  },
};

export default tenantHandler;
