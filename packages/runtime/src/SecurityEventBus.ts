/**
 * @holoscript/runtime - SecurityEventBus
 *
 * Consumes security-domain events emitted by RBAC, SSO, Quota, Tenant, AuditLog, and
 * ForgetPolicy traits (75 void events combined per stub-audit Phase 3.5).
 *
 * Acts as the single subscriber that:
 *  1. Aggregates audit-log entries
 *  2. Propagates RBAC / SSO events to registered authorization handlers
 *  3. Enforces quota-exceeded gates
 *  4. Fans out tenant isolation events
 *  5. Triggers forget-policy callbacks (GDPR article-17 flows)
 */

import { EventBus } from './events.js';

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export interface RbacEvent {
  node: string;
  principal: string;
  action: string;
  resource: string;
  granted: boolean;
  reason?: string;
}

export interface SsoEvent {
  node: string;
  provider: string;
  userId: string;
  sessionToken?: string;
  event: 'login' | 'logout' | 'token_refresh' | 'session_expired';
}

export interface QuotaEvent {
  node: string;
  resource: string;
  limit: number;
  used: number;
  exceeded: boolean;
  tenantId?: string;
}

export interface TenantEvent {
  node: string;
  tenantId: string;
  event: 'provisioned' | 'suspended' | 'deleted' | 'config_updated';
  metadata?: Record<string, unknown>;
}

export interface AuditLogEvent {
  node: string;
  actorId: string;
  action: string;
  resource: string;
  outcome: 'success' | 'failure' | 'denied';
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface ForgetPolicyEvent {
  node: string;
  subjectId: string;
  scope: string[];
  requestedAt: number;
  completedAt?: number;
  policy: string;
}

export type SecurityAuditEntry = AuditLogEvent & { receivedAt: number };

// ---------------------------------------------------------------------------
// Handler types
// ---------------------------------------------------------------------------

export type RbacHandler = (evt: RbacEvent) => void;
export type SsoHandler = (evt: SsoEvent) => void;
export type QuotaHandler = (evt: QuotaEvent) => void;
export type TenantHandler = (evt: TenantEvent) => void;
export type ForgetPolicyHandler = (evt: ForgetPolicyEvent) => void;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SecurityEventBusOptions {
  bus?: EventBus;
  /** Max audit log entries before oldest are pruned. Default 10_000. */
  maxAuditLog?: number;
  /** Called whenever RBAC denies an action. */
  onRbacDenied?: RbacHandler;
  /** Called on quota exceeded. */
  onQuotaExceeded?: QuotaHandler;
  /** Called when a forget-policy request completes. */
  onForgetComplete?: ForgetPolicyHandler;
}

// ---------------------------------------------------------------------------
// SecurityEventBus
// ---------------------------------------------------------------------------

/**
 * Central consumer for all security-domain trait events.
 *
 * ```ts
 * import { eventBus } from '@holoscript/runtime';
 * const secBus = new SecurityEventBus({ bus: eventBus });
 * secBus.start();
 *
 * secBus.onRbac((evt) => { if (!evt.granted) redirectToLogin(); });
 * secBus.onSso((evt) => { if (evt.event === 'login') initSession(evt.userId); });
 * ```
 */
export class SecurityEventBus {
  private readonly bus: EventBus;
  private readonly maxAuditLog: number;
  private readonly opts: SecurityEventBusOptions;
  private readonly auditLog: SecurityAuditEntry[] = [];

  private rbacHandlers: Set<RbacHandler> = new Set();
  private ssoHandlers: Set<SsoHandler> = new Set();
  private quotaHandlers: Set<QuotaHandler> = new Set();
  private tenantHandlers: Set<TenantHandler> = new Set();
  private forgetHandlers: Set<ForgetPolicyHandler> = new Set();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: SecurityEventBusOptions = {}) {
    this.bus = options.bus ?? new EventBus();
    this.maxAuditLog = options.maxAuditLog ?? 10_000;
    this.opts = options;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    if (this._started) return;
    this._started = true;

    // RBAC events from rbac trait
    this.unsubscribers.push(
      this.bus.on<RbacEvent>('rbac:access_granted', (e) => this.handleRbac({ ...e, granted: true }))
    );
    this.unsubscribers.push(
      this.bus.on<RbacEvent>('rbac:access_denied', (e) => this.handleRbac({ ...e, granted: false }))
    );
    this.unsubscribers.push(
      this.bus.on<RbacEvent>('rbac:permission_changed', (e) => this.handleRbac(e))
    );

    // SSO events
    this.unsubscribers.push(
      this.bus.on<SsoEvent>('sso:login', (e) => this.handleSso(e))
    );
    this.unsubscribers.push(
      this.bus.on<SsoEvent>('sso:logout', (e) => this.handleSso(e))
    );
    this.unsubscribers.push(
      this.bus.on<SsoEvent>('sso:token_refresh', (e) => this.handleSso(e))
    );
    this.unsubscribers.push(
      this.bus.on<SsoEvent>('sso:session_expired', (e) => this.handleSso(e))
    );

    // Quota events
    this.unsubscribers.push(
      this.bus.on<QuotaEvent>('quota:exceeded', (e) => this.handleQuota({ ...e, exceeded: true }))
    );
    this.unsubscribers.push(
      this.bus.on<QuotaEvent>('quota:usage_updated', (e) => this.handleQuota(e))
    );
    this.unsubscribers.push(
      this.bus.on<QuotaEvent>('quota:reset', (e) => this.handleQuota({ ...e, exceeded: false }))
    );

    // Tenant events
    this.unsubscribers.push(
      this.bus.on<TenantEvent>('tenant:provisioned', (e) => this.handleTenant(e))
    );
    this.unsubscribers.push(
      this.bus.on<TenantEvent>('tenant:suspended', (e) => this.handleTenant(e))
    );
    this.unsubscribers.push(
      this.bus.on<TenantEvent>('tenant:deleted', (e) => this.handleTenant(e))
    );
    this.unsubscribers.push(
      this.bus.on<TenantEvent>('tenant:config_updated', (e) => this.handleTenant(e))
    );

    // Audit log events
    this.unsubscribers.push(
      this.bus.on<AuditLogEvent>('audit:log', (e) => this.handleAudit(e))
    );
    this.unsubscribers.push(
      this.bus.on<AuditLogEvent>('audit:security_event', (e) => this.handleAudit(e))
    );

    // Forget-policy (GDPR article 17)
    this.unsubscribers.push(
      this.bus.on<ForgetPolicyEvent>('forget_policy:requested', (e) => this.handleForget(e))
    );
    this.unsubscribers.push(
      this.bus.on<ForgetPolicyEvent>('forget_policy:completed', (e) => {
        this.handleForget({ ...e, completedAt: e.completedAt ?? Date.now() });
        this.opts.onForgetComplete?.(e);
      })
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  private handleRbac(evt: RbacEvent): void {
    if (!evt.granted) {
      this.opts.onRbacDenied?.(evt);
    }
    this.rbacHandlers.forEach((h) => h(evt));
    this.bus.emit('security_bus:rbac', evt);
  }

  private handleSso(evt: SsoEvent): void {
    this.ssoHandlers.forEach((h) => h(evt));
    this.bus.emit('security_bus:sso', evt);
  }

  private handleQuota(evt: QuotaEvent): void {
    if (evt.exceeded) {
      this.opts.onQuotaExceeded?.(evt);
    }
    this.quotaHandlers.forEach((h) => h(evt));
    this.bus.emit('security_bus:quota', evt);
  }

  private handleTenant(evt: TenantEvent): void {
    this.tenantHandlers.forEach((h) => h(evt));
    this.bus.emit('security_bus:tenant', evt);
  }

  private handleAudit(evt: AuditLogEvent): void {
    const entry: SecurityAuditEntry = { ...evt, receivedAt: Date.now() };
    this.auditLog.push(entry);
    if (this.auditLog.length > this.maxAuditLog) {
      this.auditLog.shift();
    }
    this.bus.emit('security_bus:audit', entry);
  }

  private handleForget(evt: ForgetPolicyEvent): void {
    this.forgetHandlers.forEach((h) => h(evt));
    this.bus.emit('security_bus:forget', evt);
  }

  // -------------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------------

  onRbac(handler: RbacHandler): () => void {
    this.rbacHandlers.add(handler);
    return () => this.rbacHandlers.delete(handler);
  }

  onSso(handler: SsoHandler): () => void {
    this.ssoHandlers.add(handler);
    return () => this.ssoHandlers.delete(handler);
  }

  onQuota(handler: QuotaHandler): () => void {
    this.quotaHandlers.add(handler);
    return () => this.quotaHandlers.delete(handler);
  }

  onTenant(handler: TenantHandler): () => void {
    this.tenantHandlers.add(handler);
    return () => this.tenantHandlers.delete(handler);
  }

  onForget(handler: ForgetPolicyHandler): () => void {
    this.forgetHandlers.add(handler);
    return () => this.forgetHandlers.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

  getAuditLog(): SecurityAuditEntry[] {
    return [...this.auditLog];
  }

  getAuditByActor(actorId: string): SecurityAuditEntry[] {
    return this.auditLog.filter((e) => e.actorId === actorId);
  }

  getAuditByOutcome(outcome: AuditLogEvent['outcome']): SecurityAuditEntry[] {
    return this.auditLog.filter((e) => e.outcome === outcome);
  }

  clearAuditLog(): void {
    this.auditLog.length = 0;
  }

  get started(): boolean {
    return this._started;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSecurityEventBus(options: SecurityEventBusOptions = {}): SecurityEventBus {
  const bus = new SecurityEventBus(options);
  bus.start();
  return bus;
}
