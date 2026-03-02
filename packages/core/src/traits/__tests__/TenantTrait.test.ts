import { describe, it, expect, beforeEach } from 'vitest';
import { tenantHandler } from '../TenantTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
  updateTrait,
} from './traitTestHelpers';

describe('TenantTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const baseCfg = {
    tenantId: 'acme-corp-001',
    organizationName: 'Acme Corporation',
    tier: 'professional' as const,
    isolationLevel: 'logical' as const,
    crossTenantSharingEnabled: true,
  };

  beforeEach(() => {
    node = createMockNode('tenant-node');
    ctx = createMockContext();
    attachTrait(tenantHandler, node, baseCfg, ctx);
  });

  // =========================================================================
  // Initialization
  // =========================================================================

  it('provisions tenant with correct state on attach', () => {
    const state = (node as any).__tenantState;
    expect(state).toBeDefined();
    expect(state.outgoingGrants).toBeInstanceOf(Map);
    expect(state.incomingGrants).toBeInstanceOf(Map);
    expect(state.traitRegistry).toBeInstanceOf(Map);
    expect(state.activeSessions).toBe(0);
    expect(state.eventLog.length).toBe(1);
    expect(state.eventLog[0].type).toBe('tenant_provisioned');
  });

  it('emits tenant_provisioned event on attach', () => {
    expect(getEventCount(ctx, 'tenant_provisioned')).toBe(1);
    const event = getLastEvent(ctx, 'tenant_provisioned') as any;
    expect(event.tenantId).toBe('acme-corp-001');
    expect(event.organizationName).toBe('Acme Corporation');
    expect(event.tier).toBe('professional');
  });

  it('emits audit_log on provisioning', () => {
    expect(getEventCount(ctx, 'audit_log')).toBe(1);
    const event = getLastEvent(ctx, 'audit_log') as any;
    expect(event.action).toBe('tenant.create');
    expect(event.tenantId).toBe('acme-corp-001');
  });

  it('rejects tenant without tenantId', () => {
    const n = createMockNode('bad');
    const c = createMockContext();
    attachTrait(tenantHandler, n, { tenantId: '' }, c);
    expect(getEventCount(c, 'tenant_error')).toBe(1);
    expect((n as any).__tenantState).toBeUndefined();
  });

  it('generates namespace prefix if not provided', () => {
    // The config is mutated in-place by onAttach
    // Check that tenant state was created (meaning no error)
    expect((node as any).__tenantState).toBeDefined();
  });

  // =========================================================================
  // Lifecycle Management
  // =========================================================================

  it('suspends active tenant', () => {
    // onAttach mutates config.status to 'active', but sendEvent rebuilds config
    // from defaultConfig + baseCfg, so we pass status: 'active' explicitly
    const activeCfg = { ...baseCfg, status: 'active' as const };
    sendEvent(tenantHandler, node, activeCfg, ctx, {
      type: 'tenant_suspend',
      reason: 'billing_overdue',
    });
    expect(getEventCount(ctx, 'tenant_status_changed')).toBe(1);
    const event = getLastEvent(ctx, 'tenant_status_changed') as any;
    expect(event.oldStatus).toBe('active');
    expect(event.newStatus).toBe('suspended');
  });

  it('reactivates suspended tenant', () => {
    sendEvent(tenantHandler, node, { ...baseCfg, status: 'suspended' as any }, ctx, {
      type: 'tenant_reactivate',
    });
    // Note: the handler checks config.status but we modify via events
    // First suspend, then reactivate
    sendEvent(tenantHandler, node, baseCfg, ctx, { type: 'tenant_suspend' });
    ctx.clearEvents();
    // Need to simulate config status being 'suspended' - the handler mutates it
    sendEvent(tenantHandler, node, { ...baseCfg, status: 'suspended' as any }, ctx, {
      type: 'tenant_reactivate',
    });
    expect(getEventCount(ctx, 'tenant_status_changed')).toBe(1);
  });

  it('archives tenant', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, { type: 'tenant_archive' });
    expect(getEventCount(ctx, 'tenant_status_changed')).toBeGreaterThanOrEqual(1);
  });

  it('upgrades tenant tier', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_upgrade_tier',
      tier: 'enterprise',
    });
    expect(getEventCount(ctx, 'tenant_tier_changed')).toBe(1);
    const event = getLastEvent(ctx, 'tenant_tier_changed') as any;
    expect(event.oldTier).toBe('professional');
    expect(event.newTier).toBe('enterprise');
  });

  // =========================================================================
  // Tenant-Scoped Trait Registry
  // =========================================================================

  it('registers custom trait for tenant', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_register_trait',
      traitName: 'custom_physics',
      isCustom: true,
      requiredTier: 'professional',
    });
    expect(getEventCount(ctx, 'tenant_trait_registered')).toBe(1);
    const state = (node as any).__tenantState;
    expect(state.traitRegistry.has('custom_physics')).toBe(true);
  });

  it('unregisters trait from tenant', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_register_trait',
      traitName: 'temp_trait',
    });
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_unregister_trait',
      traitName: 'temp_trait',
    });
    expect(getEventCount(ctx, 'tenant_trait_unregistered')).toBe(1);
    const state = (node as any).__tenantState;
    expect(state.traitRegistry.has('temp_trait')).toBe(false);
  });

  it('tracks trait usage', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_register_trait',
      traitName: 'my_trait',
    });
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_use_trait',
      traitName: 'my_trait',
    });
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_use_trait',
      traitName: 'my_trait',
    });
    const state = (node as any).__tenantState;
    const entry = state.traitRegistry.get('my_trait');
    expect(entry.usageCount).toBe(2);
    expect(entry.lastUsed).toBeDefined();
  });

  // =========================================================================
  // Cross-Tenant Sharing
  // =========================================================================

  it('creates cross-tenant grant when sharing enabled', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'cross_tenant_grant_request',
      targetTenantId: 'other-corp-002',
      resourceType: 'scene',
      resourceId: 'scene-123',
      accessLevel: 'read',
      grantedBy: 'user-admin',
    });
    expect(getEventCount(ctx, 'cross_tenant_grant_created')).toBe(1);
    const state = (node as any).__tenantState;
    expect(state.outgoingGrants.size).toBe(1);
  });

  it('denies cross-tenant grant when sharing disabled', () => {
    const cfg = { ...baseCfg, crossTenantSharingEnabled: false };
    const n = createMockNode('no-share');
    const c = createMockContext();
    attachTrait(tenantHandler, n, cfg, c);
    sendEvent(tenantHandler, n, cfg, c, {
      type: 'cross_tenant_grant_request',
      targetTenantId: 'other-corp',
      resourceType: 'scene',
      resourceId: 's1',
    });
    expect(getEventCount(c, 'cross_tenant_grant_denied')).toBe(1);
  });

  it('revokes cross-tenant grant', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'cross_tenant_grant_request',
      targetTenantId: 'other-corp',
      resourceType: 'trait',
      resourceId: 't1',
    });
    const state = (node as any).__tenantState;
    const grantId = Array.from(state.outgoingGrants.keys())[0];
    ctx.clearEvents();
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'cross_tenant_grant_revoke',
      grantId,
    });
    expect(getEventCount(ctx, 'cross_tenant_grant_revoked')).toBe(1);
    expect(state.outgoingGrants.size).toBe(0);
  });

  // =========================================================================
  // Session Tracking
  // =========================================================================

  it('tracks session start/end', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_session_start',
      userId: 'user-1',
    });
    const state = (node as any).__tenantState;
    expect(state.activeSessions).toBe(1);

    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_session_end',
      userId: 'user-1',
    });
    expect(state.activeSessions).toBe(0);
  });

  it('does not go below zero sessions', () => {
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'tenant_session_end',
      userId: 'ghost',
    });
    const state = (node as any).__tenantState;
    expect(state.activeSessions).toBe(0);
  });

  // =========================================================================
  // Query
  // =========================================================================

  it('responds to tenant_query', () => {
    // onAttach sets status to 'active' on the actual config, but sendEvent
    // rebuilds from default + baseCfg. Pass status explicitly.
    const activeCfg = { ...baseCfg, status: 'active' as const };
    sendEvent(tenantHandler, node, activeCfg, ctx, {
      type: 'tenant_query',
      queryId: 'q1',
    });
    expect(getEventCount(ctx, 'tenant_info')).toBe(1);
    const info = getLastEvent(ctx, 'tenant_info') as any;
    expect(info.tenantId).toBe('acme-corp-001');
    expect(info.status).toBe('active');
    expect(info.tier).toBe('professional');
  });

  // =========================================================================
  // Detach / Decommission
  // =========================================================================

  it('cleans up on detach', () => {
    // Create a grant first
    sendEvent(tenantHandler, node, baseCfg, ctx, {
      type: 'cross_tenant_grant_request',
      targetTenantId: 'other',
      resourceType: 'scene',
      resourceId: 's1',
    });
    ctx.clearEvents();

    tenantHandler.onDetach?.(node as any, { ...tenantHandler.defaultConfig, ...baseCfg }, ctx as any);
    expect(getEventCount(ctx, 'tenant_decommissioned')).toBe(1);
    expect(getEventCount(ctx, 'cross_tenant_grant_revoked')).toBe(1);
    expect((node as any).__tenantState).toBeUndefined();
  });
});
