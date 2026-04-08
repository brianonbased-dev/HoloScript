/**
 * Audit Logger — Core audit logging for HoloScript
 *
 * Provides append-only audit event logging with query, export,
 * and retention management capabilities.
 *
 * @version 3.3.0
 * @Sprint Sprint 9: Audit Logging & Compliance
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a single audit event.
 */
export interface AuditEvent {
  id: string;
  timestamp: Date;
  tenantId: string;
  actorId: string;
  actorType: 'user' | 'agent' | 'system';
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
  metadata: Record<string, unknown>;
  clientIp?: string;
  userAgent?: string;
}

/**
 * Input type for creating a new audit event (ID and timestamp are auto-generated).
 */
export type AuditEventInput = Omit<AuditEvent, 'id' | 'timestamp'>;

/**
 * Filter criteria for querying audit events.
 */
export interface AuditQueryFilter {
  tenantId?: string;
  actorId?: string;
  actorType?: 'user' | 'agent' | 'system';
  action?: string;
  resource?: string;
  resourceId?: string;
  outcome?: 'success' | 'failure' | 'denied';
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Storage backend interface for pluggable persistence.
 */
export interface AuditStorageBackend {
  append(event: AuditEvent): void;
  getAll(): AuditEvent[];
  getCount(): number;
  removeWhere(predicate: (event: AuditEvent) => boolean): number;
}

// =============================================================================
// Default In-Memory Storage Backend
// =============================================================================

/**
 * Default in-memory storage backend using an append-only array.
 */
export class InMemoryAuditStorage implements AuditStorageBackend {
  private events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(Object.freeze({ ...event }));
  }

  getAll(): AuditEvent[] {
    return [...this.events];
  }

  getCount(): number {
    return this.events.length;
  }

  removeWhere(predicate: (event: AuditEvent) => boolean): number {
    const before = this.events.length;
    this.events = this.events.filter((e) => !predicate(e));
    return before - this.events.length;
  }
}

// =============================================================================
// ID Generation
// =============================================================================

let idCounter = 0;

function generateAuditId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  const counter = (idCounter++).toString(36);
  return `audit_${timestamp}_${random}_${counter}`;
}

// =============================================================================
// AuditLogger
// =============================================================================

/**
 * Core audit logger that provides append-only event logging,
 * querying, export, and retention management.
 */
export class AuditLogger {
  private storage: AuditStorageBackend;
  private retentionPolicies: Map<string, number> = new Map(); // tenantId -> days

  constructor(storage?: AuditStorageBackend) {
    this.storage = storage ?? new InMemoryAuditStorage();
  }

  /**
   * Log a new audit event. Generates ID and timestamp automatically.
   * Events are immutable once logged (append-only).
   */
  log(input: AuditEventInput): AuditEvent {
    const event: AuditEvent = {
      ...input,
      id: generateAuditId(),
      timestamp: new Date(),
    };

    this.storage.append(event);
    return event;
  }

  /**
   * Query audit events matching the given filter criteria.
   */
  query(filter: AuditQueryFilter): AuditEvent[] {
    let results = this.storage.getAll();

    results = this.applyFilter(results, filter);

    // Apply offset
    if (filter.offset !== undefined && filter.offset > 0) {
      results = results.slice(filter.offset);
    }

    // Apply limit
    if (filter.limit !== undefined && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Export filtered events in the specified format.
   */
  export(filter: AuditQueryFilter, format: 'json' | 'csv'): string {
    const events = this.query(filter);

    if (format === 'json') {
      return JSON.stringify(
        events.map((e) => ({
          ...e,
          timestamp: e.timestamp.toISOString(),
        })),
        null,
        2
      );
    }

    // CSV format
    if (events.length === 0) {
      return 'id,timestamp,tenantId,actorId,actorType,action,resource,resourceId,outcome,metadata,clientIp,userAgent';
    }

    const headers = [
      'id',
      'timestamp',
      'tenantId',
      'actorId',
      'actorType',
      'action',
      'resource',
      'resourceId',
      'outcome',
      'metadata',
      'clientIp',
      'userAgent',
    ];

    const rows = events.map((event) =>
      headers
        .map((header) => {
          const value = event[header as keyof AuditEvent];
          if (value === undefined || value === null) return '';
          if (value instanceof Date) return value.toISOString();
          if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          const str = String(value);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Set retention policy for a specific tenant (in days).
   */
  setRetentionPolicy(tenantId: string, days: number): void {
    if (days <= 0) {
      throw new Error(`Retention period must be positive, got ${days}`);
    }
    this.retentionPolicies.set(tenantId, days);
  }

  /**
   * Get retention policy for a tenant, or undefined if none set.
   */
  getRetentionPolicy(tenantId: string): number | undefined {
    return this.retentionPolicies.get(tenantId);
  }

  /**
   * Purge events that have exceeded their tenant's retention period.
   * Returns the number of events purged.
   */
  purgeExpired(): number {
    const now = new Date();
    let totalPurged = 0;

    for (const [tenantId, days] of this.retentionPolicies.entries()) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const purged = this.storage.removeWhere(
        (event) => event.tenantId === tenantId && event.timestamp < cutoff
      );
      totalPurged += purged;
    }

    return totalPurged;
  }

  /**
   * Get count of events matching the optional filter.
   */
  getEventCount(filter?: AuditQueryFilter): number {
    if (!filter) {
      return this.storage.getCount();
    }
    return this.applyFilter(this.storage.getAll(), filter).length;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private applyFilter(events: AuditEvent[], filter: AuditQueryFilter): AuditEvent[] {
    return events.filter((event) => {
      if (filter.tenantId !== undefined && event.tenantId !== filter.tenantId) return false;
      if (filter.actorId !== undefined && event.actorId !== filter.actorId) return false;
      if (filter.actorType !== undefined && event.actorType !== filter.actorType) return false;
      if (filter.action !== undefined && event.action !== filter.action) return false;
      if (filter.resource !== undefined && event.resource !== filter.resource) return false;
      if (filter.resourceId !== undefined && event.resourceId !== filter.resourceId) return false;
      if (filter.outcome !== undefined && event.outcome !== filter.outcome) return false;
      if (filter.since !== undefined && event.timestamp < filter.since) return false;
      if (filter.until !== undefined && event.timestamp > filter.until) return false;
      return true;
    });
  }
}
