/**
 * SecurityEventBus — second consumer-bus that closes Pattern E for the
 * security trait cluster: RBAC + SSO + Quota + Tenant + AuditLog +
 * ForgetPolicy. /stub-audit Phase 3.5 found ~75 distinct event types
 * across these 6 traits with zero downstream listeners — the largest
 * void in the trait surface (task_1777281302813_eezs).
 *
 * Follows the canonical AssetLoadCoordinator template:
 *   - Duck-typed `EventSource` ({ on(event, handler) })
 *   - Subscribes once at construction to the full security event vocabulary
 *   - Per-domain state aggregates (auth / authz / quota / tenant / forget)
 *   - Rolling audit-log buffer (the cross-cutting `audit_log` channel that
 *     RBAC, SSO, Quota, and Tenant all emit into)
 *   - Unified `subscribe(listener)` surface for downstream consumers
 *   - Bus discipline: a thrown listener never crashes other listeners
 *
 * **Why the security cluster shares one bus**:
 * The 6 traits don't just emit independent vocabularies — they share the
 * cross-cutting `audit_log` channel (RBACTrait emits to it, SSOTrait emits
 * to it, QuotaTrait emits to it, TenantTrait emits to it, ForgetPolicy
 * emits a sibling `forget_audit_log`). A single bus is the shape that
 * matches reality. Per-trait consumers would each need to maintain their
 * own audit buffer and re-correlate events.
 *
 * **Downstream consumers** (this bus exists so they can be built):
 *   - SIEM bridges (audit_siem_notify already routes through audit_log)
 *   - Admin dashboards (live tenant status / quota usage / RBAC drift)
 *   - Compliance reports (forget-policy attestations + audit integrity)
 *   - Test harnesses (assert "after this op, RBAC fires X and audit logs Y")
 *
 * Subscribe via `traitRuntime.securityEventBus.subscribe(listener)`.
 */

/** Duck-typed event source — TraitContextFactory matches this shape. */
export interface SecurityEventSource {
  on(event: string, handler: (payload: unknown) => void): void;
}

/** Authentication state per session (SSO domain). */
export interface SessionState {
  sessionId: string;
  status: 'authenticated' | 'expired' | 'revoked';
  /** IDP that issued this session (oidc, saml, …) when known. */
  idp?: string;
  /** Subject/userId when known. */
  userId?: string;
  updatedAt: number;
}

/** Authorization state per agent/user (RBAC domain). */
export interface AuthorizationState {
  agentId: string;
  /** Active tenant scope when known. */
  tenantId?: string;
  /** Roles the agent currently holds. */
  roles: Set<string>;
  /** Capabilities the agent holds (resource:action shape). */
  capabilities: Set<string>;
  updatedAt: number;
}

/** Quota usage state per tenant or agent (Quota domain). */
export interface QuotaState {
  /** Resource being metered (api_calls, tokens, storage_bytes, …). */
  resource: string;
  /** Subject the quota applies to (tenantId or agentId). */
  subject: string;
  consumed: number;
  limit: number;
  status: 'ok' | 'threshold_reached' | 'grace' | 'exceeded';
  updatedAt: number;
}

/** Tenant lifecycle state (Tenant domain). */
export interface TenantState {
  tenantId: string;
  status: 'provisioned' | 'active' | 'suspended' | 'decommissioned';
  tier?: string;
  updatedAt: number;
}

/** A single rolling audit-log entry. */
export interface AuditLogEntry {
  /** Event name on which this entry was observed. */
  event: string;
  /** Free-form payload from the emitting trait (subset of fields kept). */
  action?: string;
  actor?: string;
  tenantId?: string;
  /** Outcome flag when the trait carried it. */
  outcome?: 'success' | 'denied' | 'error';
  /** When the bus observed this entry. */
  observedAt: number;
}

/** Aggregate stats across all tracked security state. */
export interface SecurityStats {
  sessions: { authenticated: number; expired: number; revoked: number };
  agents: { tracked: number };
  tenants: { active: number; suspended: number; decommissioned: number };
  quotas: { tracked: number; exceeded: number; grace: number };
  auditLog: { entries: number; capacity: number };
}

export type SecurityEventListener = (envelope: SecurityEventEnvelope) => void;

/** Envelope wrapping one observed event for downstream listeners. */
export interface SecurityEventEnvelope {
  /** Domain bucket the event was routed to. */
  domain: 'auth' | 'authz' | 'quota' | 'tenant' | 'audit' | 'forget' | 'unknown';
  /** Original event name (rbac_role_assigned, sso_authenticated, …). */
  event: string;
  /** Original payload — trait-specific shape. */
  payload: unknown;
  observedAt: number;
}

/**
 * Full security event vocabulary the bus subscribes to. Listed
 * explicitly so future agents know exactly which trait emits feed it.
 *
 * Sourced from emit-call audit (2026-04-27):
 *   - RBACTrait.ts (~32 emit calls): rbac_initialized/error/role_assigned/
 *     role_revoked/permission_result/custom_role_created/custom_role_deleted/
 *     user_roles/access_log/capability_result/capability_granted/
 *     capability_revoked/tenant_changed/capability_delegated/tenant_id/
 *     agent_capabilities + cross-emitted rbac_sync_roles
 *   - SSOTrait.ts (~22 emit calls): sso_initialized/error/session_revoked/
 *     session_expired/idp_registered/idp_removed/auth_error/saml_authn_request/
 *     oidc_auth_redirect/user_provisioned/authenticated/global_logout/
 *     saml_slo_request/session_validation/info
 *   - QuotaTrait.ts (~22 emit calls): quota_initialized/error/reset/
 *     grace_expired/grace_started/exceeded/threshold_reached/consumed/
 *     released/limit_changed/tier_applied/info/usage_report_result
 *   - TenantTrait.ts (~24 emit calls): tenant_provisioned/error/decommissioned/
 *     status_changed/trait_registered/trait_unregistered/tier_changed/info
 *     + cross_tenant_grant_created/revoked/denied/expired
 *   - AuditLogTrait.ts (~12 emit calls): audit_log/entry_created/siem_notify/
 *     critical_event/query_result/integrity_result/stats_result/export_result/
 *     error
 *   - ForgetPolicyTrait.ts (~7 emit calls): forget_policy_attached/detached/
 *     evaluate/audit_entry/apply/audit_log/error
 */
const SECURITY_EVENTS = [
  // --- RBAC (authz) ---
  'rbac_initialized',
  'rbac_error',
  'rbac_role_assigned',
  'rbac_role_revoked',
  'rbac_permission_result',
  'rbac_custom_role_created',
  'rbac_custom_role_deleted',
  'rbac_user_roles',
  'rbac_access_log',
  'rbac_capability_result',
  'rbac_capability_granted',
  'rbac_capability_revoked',
  'rbac_tenant_changed',
  'rbac_capability_delegated',
  'rbac_tenant_id',
  'rbac_agent_capabilities',
  'rbac_sync_roles',
  // --- SSO (auth) ---
  'sso_initialized',
  'sso_error',
  'sso_session_revoked',
  'sso_session_expired',
  'sso_idp_registered',
  'sso_idp_removed',
  'sso_auth_error',
  'sso_saml_authn_request',
  'sso_oidc_auth_redirect',
  'sso_user_provisioned',
  'sso_authenticated',
  'sso_global_logout',
  'sso_saml_slo_request',
  'sso_session_validation',
  'sso_info',
  // --- Quota ---
  'quota_initialized',
  'quota_error',
  'quota_reset',
  'quota_grace_expired',
  'quota_grace_started',
  'quota_exceeded',
  'quota_threshold_reached',
  'quota_consumed',
  'quota_released',
  'quota_limit_changed',
  'quota_tier_applied',
  'quota_info',
  'quota_usage_report_result',
  // --- Tenant ---
  'tenant_provisioned',
  'tenant_error',
  'tenant_decommissioned',
  'tenant_status_changed',
  'tenant_trait_registered',
  'tenant_trait_unregistered',
  'tenant_tier_changed',
  'tenant_info',
  'cross_tenant_grant_created',
  'cross_tenant_grant_revoked',
  'cross_tenant_grant_denied',
  'cross_tenant_grant_expired',
  // --- AuditLog (cross-cutting) ---
  'audit_log',
  'audit_entry_created',
  'audit_siem_notify',
  'audit_critical_event',
  'audit_query_result',
  'audit_integrity_result',
  'audit_stats_result',
  'audit_export_result',
  'audit_error',
  // --- ForgetPolicy ---
  'forget_policy_attached',
  'forget_policy_detached',
  'forget_evaluate',
  'forget_audit_entry',
  'forget_apply',
  'forget_audit_log',
  'forget_error',
] as const;

/** Default rolling audit-log buffer size (entries; tunable via constructor). */
const DEFAULT_AUDIT_BUFFER_SIZE = 256;

export class SecurityEventBus {
  private sessions = new Map<string, SessionState>();
  private agents = new Map<string, AuthorizationState>();
  private quotas = new Map<string, QuotaState>(); // key = `${resource}:${subject}`
  private tenants = new Map<string, TenantState>();
  private auditLog: AuditLogEntry[] = [];
  private listeners = new Set<SecurityEventListener>();
  private readonly auditBufferSize: number;

  constructor(source: SecurityEventSource, auditBufferSize: number = DEFAULT_AUDIT_BUFFER_SIZE) {
    this.auditBufferSize = Math.max(0, Math.floor(auditBufferSize));
    for (const event of SECURITY_EVENTS) {
      source.on(event, (payload: unknown) => this.handleEvent(event, payload));
    }
  }

  // ---- Event ingestion ---------------------------------------------------

  private handleEvent(event: string, payload: unknown): void {
    const domain = this.domainFromEvent(event);
    const observedAt = Date.now();

    // Domain-specific state mutation
    if (domain === 'auth') this.applyAuthEvent(event, payload, observedAt);
    else if (domain === 'authz') this.applyAuthzEvent(event, payload, observedAt);
    else if (domain === 'quota') this.applyQuotaEvent(event, payload, observedAt);
    else if (domain === 'tenant') this.applyTenantEvent(event, payload, observedAt);

    // Audit-log channel — append for both `audit_*` and `forget_audit_*`
    if (domain === 'audit' || event === 'audit_log' || event === 'forget_audit_log' || event === 'forget_audit_entry') {
      this.appendAudit(event, payload, observedAt);
    }

    this.notifyListeners({ domain, event, payload, observedAt });
  }

  private domainFromEvent(event: string): SecurityEventEnvelope['domain'] {
    if (event.startsWith('sso_')) return 'auth';
    if (event.startsWith('rbac_')) return 'authz';
    if (event.startsWith('quota_')) return 'quota';
    if (event.startsWith('tenant_') || event.startsWith('cross_tenant_')) return 'tenant';
    if (event.startsWith('audit_')) return 'audit';
    if (event.startsWith('forget_')) return 'forget';
    return 'unknown';
  }

  private applyAuthEvent(event: string, payload: unknown, observedAt: number): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const sessionId = (p.sessionId as string) ?? (p.sid as string);
    if (!sessionId || typeof sessionId !== 'string') return;

    const existing = this.sessions.get(sessionId);
    let status: SessionState['status'] | null = null;
    if (event === 'sso_authenticated') status = 'authenticated';
    else if (event === 'sso_session_expired') status = 'expired';
    else if (event === 'sso_session_revoked' || event === 'sso_global_logout') status = 'revoked';

    if (status === null) return;

    const next: SessionState = {
      sessionId,
      status,
      idp: typeof p.idp === 'string' ? p.idp : existing?.idp,
      userId: typeof p.userId === 'string' ? p.userId : existing?.userId,
      updatedAt: observedAt,
    };
    this.sessions.set(sessionId, next);
  }

  private applyAuthzEvent(event: string, payload: unknown, observedAt: number): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const agentId = (p.agentId as string) ?? (p.userId as string) ?? (p.subject as string);
    if (!agentId || typeof agentId !== 'string') return;

    const existing = this.agents.get(agentId) ?? {
      agentId,
      roles: new Set<string>(),
      capabilities: new Set<string>(),
      updatedAt: observedAt,
    };
    const roles = new Set(existing.roles);
    const capabilities = new Set(existing.capabilities);
    let tenantId = existing.tenantId;

    if (event === 'rbac_role_assigned' && typeof p.role === 'string') roles.add(p.role);
    else if (event === 'rbac_role_revoked' && typeof p.role === 'string') roles.delete(p.role);
    else if (event === 'rbac_capability_granted' && typeof p.capability === 'string') capabilities.add(p.capability);
    else if (event === 'rbac_capability_revoked' && typeof p.capability === 'string') capabilities.delete(p.capability);
    else if (event === 'rbac_tenant_changed' && typeof p.tenantId === 'string') tenantId = p.tenantId;
    else if (event === 'rbac_user_roles' && Array.isArray(p.roles)) {
      roles.clear();
      for (const r of p.roles) if (typeof r === 'string') roles.add(r);
    } else if (event === 'rbac_agent_capabilities' && Array.isArray(p.capabilities)) {
      capabilities.clear();
      for (const c of p.capabilities) if (typeof c === 'string') capabilities.add(c);
    } else {
      // Diagnostic events (rbac_permission_result, rbac_capability_result, etc.) —
      // don't mutate authz state; envelope is still notified to listeners.
      return;
    }

    this.agents.set(agentId, { agentId, tenantId, roles, capabilities, updatedAt: observedAt });
  }

  private applyQuotaEvent(event: string, payload: unknown, observedAt: number): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const resource = typeof p.resource === 'string' ? p.resource : undefined;
    const subject =
      (typeof p.tenantId === 'string' && p.tenantId) ||
      (typeof p.agentId === 'string' && p.agentId) ||
      (typeof p.subject === 'string' && p.subject) ||
      undefined;
    if (!resource || !subject) return;

    const key = `${resource}:${subject}`;
    const existing = this.quotas.get(key) ?? {
      resource,
      subject,
      consumed: 0,
      limit: 0,
      status: 'ok' as QuotaState['status'],
      updatedAt: observedAt,
    };
    let status = existing.status;
    let consumed = existing.consumed;
    let limit = existing.limit;

    if (typeof p.consumed === 'number') consumed = p.consumed;
    if (typeof p.limit === 'number') limit = p.limit;

    if (event === 'quota_exceeded') status = 'exceeded';
    else if (event === 'quota_grace_started') status = 'grace';
    else if (event === 'quota_grace_expired') status = 'exceeded';
    else if (event === 'quota_threshold_reached') status = 'threshold_reached';
    else if (event === 'quota_reset' || event === 'quota_released' || event === 'quota_consumed') {
      // After consume/release/reset, recompute status from numbers if possible
      if (limit > 0 && consumed >= limit) status = 'exceeded';
      else if (limit > 0 && consumed >= limit * 0.9) status = 'threshold_reached';
      else status = 'ok';
    }

    this.quotas.set(key, { resource, subject, consumed, limit, status, updatedAt: observedAt });
  }

  private applyTenantEvent(event: string, payload: unknown, observedAt: number): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const tenantId = typeof p.tenantId === 'string' ? p.tenantId : undefined;
    if (!tenantId) return;

    const existing = this.tenants.get(tenantId);
    let status: TenantState['status'] | undefined = existing?.status;
    let tier = existing?.tier;

    if (event === 'tenant_provisioned') status = 'provisioned';
    else if (event === 'tenant_decommissioned') status = 'decommissioned';
    else if (event === 'tenant_status_changed' && typeof p.status === 'string') {
      const s = p.status;
      if (s === 'active' || s === 'suspended' || s === 'provisioned' || s === 'decommissioned') status = s;
    } else if (event === 'tenant_tier_changed' && typeof p.tier === 'string') {
      tier = p.tier;
    } else {
      // cross_tenant_* and tenant_info are observation-only; no state mutation.
      return;
    }

    if (!status) return;
    this.tenants.set(tenantId, { tenantId, status, tier, updatedAt: observedAt });
  }

  private appendAudit(event: string, payload: unknown, observedAt: number): void {
    if (this.auditBufferSize === 0) return;
    const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const entry: AuditLogEntry = {
      event,
      action: typeof p.action === 'string' ? p.action : undefined,
      actor:
        (typeof p.actor === 'string' && p.actor) ||
        (typeof p.agentId === 'string' && p.agentId) ||
        (typeof p.userId === 'string' && p.userId) ||
        undefined,
      tenantId: typeof p.tenantId === 'string' ? p.tenantId : undefined,
      outcome:
        p.outcome === 'success' || p.outcome === 'denied' || p.outcome === 'error'
          ? (p.outcome as AuditLogEntry['outcome'])
          : undefined,
      observedAt,
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > this.auditBufferSize) {
      this.auditLog.splice(0, this.auditLog.length - this.auditBufferSize);
    }
  }

  private notifyListeners(envelope: SecurityEventEnvelope): void {
    for (const listener of this.listeners) {
      try {
        listener(envelope);
      } catch (_) {
        // Bus discipline — see AssetLoadCoordinator.notifyListeners.
      }
    }
  }

  // ---- Public API --------------------------------------------------------

  /** Subscribe to all security events. Returns an unsubscribe function. */
  subscribe(listener: SecurityEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  getAgent(agentId: string): AuthorizationState | undefined {
    const a = this.agents.get(agentId);
    if (!a) return undefined;
    // Defensive copy of mutable Sets so callers can't mutate internal state.
    return { ...a, roles: new Set(a.roles), capabilities: new Set(a.capabilities) };
  }

  getAllAgents(): AuthorizationState[] {
    return Array.from(this.agents.values()).map((a) => ({
      ...a,
      roles: new Set(a.roles),
      capabilities: new Set(a.capabilities),
    }));
  }

  getQuota(resource: string, subject: string): QuotaState | undefined {
    return this.quotas.get(`${resource}:${subject}`);
  }

  getAllQuotas(): QuotaState[] {
    return Array.from(this.quotas.values());
  }

  getTenant(tenantId: string): TenantState | undefined {
    return this.tenants.get(tenantId);
  }

  getAllTenants(): TenantState[] {
    return Array.from(this.tenants.values());
  }

  /** Snapshot of the rolling audit-log buffer (oldest first). */
  getAuditLog(): AuditLogEntry[] {
    return this.auditLog.slice();
  }

  getStats(): SecurityStats {
    const sessions = Array.from(this.sessions.values());
    const tenants = Array.from(this.tenants.values());
    const quotas = Array.from(this.quotas.values());
    return {
      sessions: {
        authenticated: sessions.filter((s) => s.status === 'authenticated').length,
        expired: sessions.filter((s) => s.status === 'expired').length,
        revoked: sessions.filter((s) => s.status === 'revoked').length,
      },
      agents: { tracked: this.agents.size },
      tenants: {
        active: tenants.filter((t) => t.status === 'active' || t.status === 'provisioned').length,
        suspended: tenants.filter((t) => t.status === 'suspended').length,
        decommissioned: tenants.filter((t) => t.status === 'decommissioned').length,
      },
      quotas: {
        tracked: quotas.length,
        exceeded: quotas.filter((q) => q.status === 'exceeded').length,
        grace: quotas.filter((q) => q.status === 'grace').length,
      },
      auditLog: { entries: this.auditLog.length, capacity: this.auditBufferSize },
    };
  }

  /** Clear all tracked state — typically called on tenant teardown or test reset. */
  reset(): void {
    this.sessions.clear();
    this.agents.clear();
    this.quotas.clear();
    this.tenants.clear();
    this.auditLog = [];
  }

  /** Number of distinct event types this bus subscribes to (diagnostic). */
  get subscribedEventCount(): number {
    return SECURITY_EVENTS.length;
  }
}
