/**
 * Audit Query Builder — Fluent query API for audit events
 *
 * Provides a chainable builder pattern for constructing
 * audit event query filters.
 *
 * @version 3.3.0
 * @Sprint Sprint 9: Audit Logging & Compliance
 */

import type { AuditQueryFilter } from './AuditLogger';

/**
 * Fluent builder for constructing AuditQueryFilter objects.
 *
 * @example
 * ```typescript
 * const filter = new AuditQuery()
 *   .tenant('t1')
 *   .actor('user1')
 *   .action('compile')
 *   .since(new Date('2026-01-01'))
 *   .until(new Date('2026-02-01'))
 *   .outcome('success')
 *   .limit(100)
 *   .offset(0)
 *   .build();
 * ```
 */
export class AuditQuery {
  private filter: AuditQueryFilter = {};

  /**
   * Filter by tenant ID.
   */
  tenant(tenantId: string): this {
    this.filter.tenantId = tenantId;
    return this;
  }

  /**
   * Filter by actor ID.
   */
  actor(actorId: string): this {
    this.filter.actorId = actorId;
    return this;
  }

  /**
   * Filter by actor type.
   */
  actorType(type: 'user' | 'agent' | 'system'): this {
    this.filter.actorType = type;
    return this;
  }

  /**
   * Filter by action name.
   */
  action(action: string): this {
    this.filter.action = action;
    return this;
  }

  /**
   * Filter by resource type.
   */
  resource(resource: string): this {
    this.filter.resource = resource;
    return this;
  }

  /**
   * Filter by resource ID.
   */
  resourceId(resourceId: string): this {
    this.filter.resourceId = resourceId;
    return this;
  }

  /**
   * Filter by outcome.
   */
  outcome(outcome: 'success' | 'failure' | 'denied'): this {
    this.filter.outcome = outcome;
    return this;
  }

  /**
   * Filter events occurring on or after this date.
   */
  since(date: Date): this {
    this.filter.since = date;
    return this;
  }

  /**
   * Filter events occurring on or before this date.
   */
  until(date: Date): this {
    this.filter.until = date;
    return this;
  }

  /**
   * Limit the number of results returned.
   */
  limit(count: number): this {
    this.filter.limit = count;
    return this;
  }

  /**
   * Skip the first N results (for pagination).
   */
  offset(count: number): this {
    this.filter.offset = count;
    return this;
  }

  /**
   * Build and return the constructed AuditQueryFilter.
   */
  build(): AuditQueryFilter {
    return { ...this.filter };
  }
}
