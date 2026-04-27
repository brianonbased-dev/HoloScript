/**
 * SecurityEventBus — second consumer-bus closing Pattern E for the
 * security trait cluster (RBAC + SSO + Quota + Tenant + AuditLog +
 * ForgetPolicy). Tests use a MockEventSource that mirrors how
 * TraitContextFactory.on/.emit work in production.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SecurityEventBus,
  type SecurityEventSource,
  type SecurityEventEnvelope,
} from '../SecurityEventBus';

class MockEventSource implements SecurityEventSource {
  private handlers = new Map<string, Array<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  fire(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }

  get subscriberCount(): number {
    return this.handlers.size;
  }
}

describe('SecurityEventBus — Pattern E remediation for security cluster', () => {
  let source: MockEventSource;
  let bus: SecurityEventBus;

  beforeEach(() => {
    source = new MockEventSource();
    bus = new SecurityEventBus(source);
  });

  it('subscribes to the full security event vocabulary on construction', () => {
    // 17 RBAC + 15 SSO + 13 Quota + 12 Tenant + 9 AuditLog + 7 ForgetPolicy = 73
    expect(source.subscriberCount).toBe(bus.subscribedEventCount);
    expect(bus.subscribedEventCount).toBeGreaterThanOrEqual(70);
  });

  it('starts with empty state', () => {
    expect(bus.getAllSessions()).toEqual([]);
    expect(bus.getAllAgents()).toEqual([]);
    expect(bus.getAllQuotas()).toEqual([]);
    expect(bus.getAllTenants()).toEqual([]);
    expect(bus.getAuditLog()).toEqual([]);
  });

  // ---- AUTH (SSO) -------------------------------------------------------

  describe('auth (SSO) domain', () => {
    it('sso_authenticated tracks a session as authenticated', () => {
      source.fire('sso_authenticated', {
        sessionId: 'sess-1',
        userId: 'user-1',
        idp: 'oidc',
      });
      const s = bus.getSession('sess-1');
      expect(s?.status).toBe('authenticated');
      expect(s?.userId).toBe('user-1');
      expect(s?.idp).toBe('oidc');
    });

    it('sso_session_expired flips a session to expired', () => {
      source.fire('sso_authenticated', { sessionId: 'sess-2', userId: 'u2' });
      source.fire('sso_session_expired', { sessionId: 'sess-2' });
      expect(bus.getSession('sess-2')?.status).toBe('expired');
    });

    it('sso_session_revoked flips a session to revoked', () => {
      source.fire('sso_authenticated', { sessionId: 'sess-3', userId: 'u3' });
      source.fire('sso_session_revoked', { sessionId: 'sess-3' });
      expect(bus.getSession('sess-3')?.status).toBe('revoked');
    });

    it('sso_global_logout treats sessions as revoked', () => {
      source.fire('sso_authenticated', { sessionId: 'sess-4' });
      source.fire('sso_global_logout', { sessionId: 'sess-4' });
      expect(bus.getSession('sess-4')?.status).toBe('revoked');
    });

    it('ignores SSO events without sessionId (defensive)', () => {
      source.fire('sso_authenticated', { userId: 'no-sid' });
      expect(bus.getAllSessions()).toEqual([]);
    });
  });

  // ---- AUTHZ (RBAC) -----------------------------------------------------

  describe('authz (RBAC) domain', () => {
    it('rbac_role_assigned adds a role to an agent', () => {
      source.fire('rbac_role_assigned', { agentId: 'a1', role: 'admin' });
      expect(bus.getAgent('a1')?.roles.has('admin')).toBe(true);
    });

    it('rbac_role_revoked removes the role', () => {
      source.fire('rbac_role_assigned', { agentId: 'a2', role: 'editor' });
      source.fire('rbac_role_revoked', { agentId: 'a2', role: 'editor' });
      expect(bus.getAgent('a2')?.roles.has('editor')).toBe(false);
    });

    it('rbac_capability_granted adds capability', () => {
      source.fire('rbac_capability_granted', { agentId: 'a3', capability: 'tenant:write' });
      expect(bus.getAgent('a3')?.capabilities.has('tenant:write')).toBe(true);
    });

    it('rbac_capability_revoked removes capability', () => {
      source.fire('rbac_capability_granted', { agentId: 'a4', capability: 'audit:read' });
      source.fire('rbac_capability_revoked', { agentId: 'a4', capability: 'audit:read' });
      expect(bus.getAgent('a4')?.capabilities.has('audit:read')).toBe(false);
    });

    it('rbac_user_roles replaces the role set', () => {
      source.fire('rbac_role_assigned', { agentId: 'a5', role: 'old' });
      source.fire('rbac_user_roles', { agentId: 'a5', roles: ['viewer', 'editor'] });
      const a = bus.getAgent('a5');
      expect(a?.roles.has('old')).toBe(false);
      expect(a?.roles.has('viewer')).toBe(true);
      expect(a?.roles.has('editor')).toBe(true);
    });

    it('rbac_tenant_changed updates the agent\'s active tenant', () => {
      source.fire('rbac_tenant_changed', { agentId: 'a6', tenantId: 'tenant-X' });
      expect(bus.getAgent('a6')?.tenantId).toBe('tenant-X');
    });

    it('diagnostic events (rbac_permission_result) do not mutate authz state', () => {
      source.fire('rbac_role_assigned', { agentId: 'a7', role: 'analyst' });
      source.fire('rbac_permission_result', { agentId: 'a7', granted: false });
      expect(bus.getAgent('a7')?.roles.has('analyst')).toBe(true);
    });

    it('returned authz state is a defensive copy (mutation does not affect bus)', () => {
      source.fire('rbac_role_assigned', { agentId: 'a8', role: 'admin' });
      const snap = bus.getAgent('a8')!;
      snap.roles.add('rogue');
      expect(bus.getAgent('a8')?.roles.has('rogue')).toBe(false);
    });
  });

  // ---- QUOTA -----------------------------------------------------------

  describe('quota domain', () => {
    it('quota_consumed under limit → status=ok', () => {
      source.fire('quota_consumed', {
        resource: 'api_calls',
        tenantId: 't1',
        consumed: 50,
        limit: 1000,
      });
      const q = bus.getQuota('api_calls', 't1');
      expect(q?.status).toBe('ok');
      expect(q?.consumed).toBe(50);
    });

    it('quota_consumed at >=90% → status=threshold_reached', () => {
      source.fire('quota_consumed', {
        resource: 'api_calls',
        tenantId: 't2',
        consumed: 950,
        limit: 1000,
      });
      expect(bus.getQuota('api_calls', 't2')?.status).toBe('threshold_reached');
    });

    it('quota_exceeded explicitly flips status', () => {
      source.fire('quota_exceeded', {
        resource: 'tokens',
        tenantId: 't3',
        consumed: 1100,
        limit: 1000,
      });
      expect(bus.getQuota('tokens', 't3')?.status).toBe('exceeded');
    });

    it('quota_grace_started → status=grace', () => {
      source.fire('quota_grace_started', { resource: 'api_calls', tenantId: 't4' });
      expect(bus.getQuota('api_calls', 't4')?.status).toBe('grace');
    });

    it('quota_grace_expired → status=exceeded', () => {
      source.fire('quota_grace_started', { resource: 'api_calls', tenantId: 't5' });
      source.fire('quota_grace_expired', { resource: 'api_calls', tenantId: 't5' });
      expect(bus.getQuota('api_calls', 't5')?.status).toBe('exceeded');
    });

    it('quota_released recomputes status from numbers', () => {
      source.fire('quota_consumed', {
        resource: 'api_calls',
        tenantId: 't6',
        consumed: 1000,
        limit: 1000,
      });
      source.fire('quota_released', { resource: 'api_calls', tenantId: 't6', consumed: 100 });
      expect(bus.getQuota('api_calls', 't6')?.status).toBe('ok');
    });

    it('ignores quota events without resource OR subject (defensive)', () => {
      source.fire('quota_consumed', { consumed: 5 });
      expect(bus.getAllQuotas()).toEqual([]);
    });
  });

  // ---- TENANT ----------------------------------------------------------

  describe('tenant domain', () => {
    it('tenant_provisioned starts a tenant in provisioned state', () => {
      source.fire('tenant_provisioned', { tenantId: 'tA' });
      expect(bus.getTenant('tA')?.status).toBe('provisioned');
    });

    it('tenant_status_changed updates status', () => {
      source.fire('tenant_provisioned', { tenantId: 'tB' });
      source.fire('tenant_status_changed', { tenantId: 'tB', status: 'suspended' });
      expect(bus.getTenant('tB')?.status).toBe('suspended');
    });

    it('tenant_decommissioned → status=decommissioned', () => {
      source.fire('tenant_provisioned', { tenantId: 'tC' });
      source.fire('tenant_decommissioned', { tenantId: 'tC' });
      expect(bus.getTenant('tC')?.status).toBe('decommissioned');
    });

    it('tenant_tier_changed updates tier without changing status', () => {
      source.fire('tenant_provisioned', { tenantId: 'tD' });
      source.fire('tenant_tier_changed', { tenantId: 'tD', tier: 'pro' });
      expect(bus.getTenant('tD')?.tier).toBe('pro');
      expect(bus.getTenant('tD')?.status).toBe('provisioned');
    });

    it('cross_tenant_grant_* events do not mutate tenant state', () => {
      source.fire('tenant_provisioned', { tenantId: 'tE' });
      source.fire('cross_tenant_grant_created', { tenantId: 'tE', grantee: 'tF' });
      // tE state unchanged from the grant event
      expect(bus.getTenant('tE')?.status).toBe('provisioned');
    });
  });

  // ---- AUDIT LOG (cross-cutting) ---------------------------------------

  describe('audit log buffer', () => {
    it('audit_log entries append to the rolling buffer', () => {
      source.fire('audit_log', {
        action: 'role.assign',
        actor: 'agent-1',
        outcome: 'success',
      });
      const log = bus.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].action).toBe('role.assign');
      expect(log[0].outcome).toBe('success');
    });

    it('forget_audit_log entries also append', () => {
      source.fire('forget_audit_log', { action: 'forget.applied', actor: 'sys' });
      expect(bus.getAuditLog()).toHaveLength(1);
    });

    it('respects the rolling buffer size', () => {
      const small = new SecurityEventBus(new MockEventSource(), 3);
      // Fire via direct method since each MockEventSource instance is separate.
      // Build a fresh wired one:
      const src = new MockEventSource();
      const tiny = new SecurityEventBus(src, 3);
      for (let i = 0; i < 10; i++) {
        src.fire('audit_log', { action: `op-${i}`, actor: 'sys' });
      }
      const entries = tiny.getAuditLog();
      expect(entries).toHaveLength(3);
      expect(entries[0].action).toBe('op-7');
      expect(entries[2].action).toBe('op-9');
      // Silence unused-variable for the unused `small` var.
      void small;
    });

    it('audit_buffer_size=0 disables logging', () => {
      const src = new MockEventSource();
      const noLog = new SecurityEventBus(src, 0);
      src.fire('audit_log', { action: 'op-1', actor: 'sys' });
      expect(noLog.getAuditLog()).toEqual([]);
    });
  });

  // ---- subscribe + bus discipline --------------------------------------

  describe('subscribe + bus discipline', () => {
    it('subscribers receive envelopes for every observed event', () => {
      const seen: SecurityEventEnvelope[] = [];
      bus.subscribe((e) => seen.push(e));
      source.fire('sso_authenticated', { sessionId: 's1' });
      source.fire('rbac_role_assigned', { agentId: 'a1', role: 'r' });
      expect(seen).toHaveLength(2);
      expect(seen[0].domain).toBe('auth');
      expect(seen[0].event).toBe('sso_authenticated');
      expect(seen[1].domain).toBe('authz');
    });

    it('unsubscribe stops further deliveries', () => {
      const seen: SecurityEventEnvelope[] = [];
      const unsub = bus.subscribe((e) => seen.push(e));
      source.fire('sso_authenticated', { sessionId: 's1' });
      unsub();
      source.fire('sso_authenticated', { sessionId: 's2' });
      expect(seen).toHaveLength(1);
    });

    it('a thrown listener never crashes other listeners (bus discipline)', () => {
      const seen: SecurityEventEnvelope[] = [];
      bus.subscribe(() => {
        throw new Error('boom');
      });
      bus.subscribe((e) => seen.push(e));
      source.fire('sso_authenticated', { sessionId: 's1' });
      expect(seen).toHaveLength(1);
    });
  });

  // ---- stats + reset ---------------------------------------------------

  describe('stats + reset', () => {
    it('getStats aggregates across domains', () => {
      source.fire('sso_authenticated', { sessionId: 's1' });
      source.fire('sso_authenticated', { sessionId: 's2' });
      source.fire('sso_session_expired', { sessionId: 's2' });
      source.fire('rbac_role_assigned', { agentId: 'a1', role: 'r' });
      source.fire('tenant_provisioned', { tenantId: 't1' });
      source.fire('quota_exceeded', {
        resource: 'api_calls',
        tenantId: 't1',
        consumed: 1100,
        limit: 1000,
      });
      const stats = bus.getStats();
      expect(stats.sessions.authenticated).toBe(1);
      expect(stats.sessions.expired).toBe(1);
      expect(stats.agents.tracked).toBe(1);
      expect(stats.tenants.active).toBe(1);
      expect(stats.quotas.exceeded).toBe(1);
    });

    it('reset clears all state', () => {
      source.fire('sso_authenticated', { sessionId: 's1' });
      source.fire('rbac_role_assigned', { agentId: 'a1', role: 'r' });
      source.fire('tenant_provisioned', { tenantId: 't1' });
      source.fire('audit_log', { action: 'x', actor: 'sys' });
      bus.reset();
      expect(bus.getAllSessions()).toEqual([]);
      expect(bus.getAllAgents()).toEqual([]);
      expect(bus.getAllTenants()).toEqual([]);
      expect(bus.getAuditLog()).toEqual([]);
    });
  });
});
