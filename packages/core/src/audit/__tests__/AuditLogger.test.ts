/**
 * Tests for Audit Logging & Compliance (Sprint 9, Priority 6)
 *
 * Covers:
 * - Event logging with auto-generated ID and timestamp
 * - Query filtering (by tenant, actor, action, date range, outcome)
 * - CSV and JSON export
 * - Retention policy and purge
 * - AuditQueryBuilder fluent API
 * - Compliance report generation (SOC2, GDPR)
 * - Append-only guarantee (no update/delete of individual events)
 * - Custom storage backend
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AuditLogger,
  InMemoryAuditStorage,
  type AuditEventInput,
  type AuditStorageBackend,
} from '../AuditLogger';
import { AuditQuery } from '../AuditQueryBuilder';
import { ComplianceReporter } from '../ComplianceReporter';

// =============================================================================
// Test helpers
// =============================================================================

function createEvent(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    tenantId: 'tenant-1',
    actorId: 'user-1',
    actorType: 'user',
    action: 'compile',
    resource: 'scene',
    outcome: 'success',
    metadata: {},
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// AuditLogger — Core event logging
// =============================================================================

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger();
  });

  describe('log()', () => {
    it('should auto-generate a unique ID for each event', () => {
      const e1 = logger.log(createEvent());
      const e2 = logger.log(createEvent());

      expect(e1.id).toBeDefined();
      expect(e2.id).toBeDefined();
      expect(e1.id).not.toBe(e2.id);
      expect(e1.id).toMatch(/^audit_/);
    });

    it('should auto-generate a timestamp', () => {
      const before = new Date();
      const event = logger.log(createEvent());
      const after = new Date();

      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should preserve all input fields', () => {
      const input = createEvent({
        tenantId: 'tenant-abc',
        actorId: 'agent-007',
        actorType: 'agent',
        action: 'deploy',
        resource: 'package',
        resourceId: 'pkg-123',
        outcome: 'failure',
        metadata: { version: '2.0.0' },
        clientIp: '192.168.1.1',
        userAgent: 'HoloScript CLI/3.0',
      });

      const event = logger.log(input);

      expect(event.tenantId).toBe('tenant-abc');
      expect(event.actorId).toBe('agent-007');
      expect(event.actorType).toBe('agent');
      expect(event.action).toBe('deploy');
      expect(event.resource).toBe('package');
      expect(event.resourceId).toBe('pkg-123');
      expect(event.outcome).toBe('failure');
      expect(event.metadata).toEqual({ version: '2.0.0' });
      expect(event.clientIp).toBe('192.168.1.1');
      expect(event.userAgent).toBe('HoloScript CLI/3.0');
    });

    it('should return the complete event with id and timestamp', () => {
      const event = logger.log(createEvent());
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.tenantId).toBe('tenant-1');
    });
  });

  // ===========================================================================
  // Query filtering
  // ===========================================================================

  describe('query()', () => {
    beforeEach(() => {
      logger.log(
        createEvent({ tenantId: 't1', actorId: 'u1', action: 'compile', outcome: 'success' })
      );
      logger.log(
        createEvent({ tenantId: 't1', actorId: 'u2', action: 'deploy', outcome: 'failure' })
      );
      logger.log(
        createEvent({ tenantId: 't2', actorId: 'u1', action: 'compile', outcome: 'denied' })
      );
      logger.log(
        createEvent({ tenantId: 't2', actorId: 'u3', action: 'login', outcome: 'success' })
      );
    });

    it('should return all events when no filter is provided', () => {
      const results = logger.query({});
      expect(results).toHaveLength(4);
    });

    it('should filter by tenantId', () => {
      const results = logger.query({ tenantId: 't1' });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.tenantId === 't1')).toBe(true);
    });

    it('should filter by actorId', () => {
      const results = logger.query({ actorId: 'u1' });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.actorId === 'u1')).toBe(true);
    });

    it('should filter by action', () => {
      const results = logger.query({ action: 'compile' });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.action === 'compile')).toBe(true);
    });

    it('should filter by outcome', () => {
      const results = logger.query({ outcome: 'success' });
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.outcome === 'success')).toBe(true);
    });

    it('should combine multiple filters', () => {
      const results = logger.query({ tenantId: 't1', outcome: 'success' });
      expect(results).toHaveLength(1);
      expect(results[0].actorId).toBe('u1');
      expect(results[0].action).toBe('compile');
    });

    it('should filter by date range', async () => {
      const freshLogger = new AuditLogger();
      const before = new Date();
      freshLogger.log(createEvent({ action: 'early' }));
      await sleep(50);
      const mid = new Date();
      await sleep(50);
      freshLogger.log(createEvent({ action: 'late' }));
      const after = new Date();

      const earlyResults = freshLogger.query({ since: before, until: mid });
      expect(earlyResults).toHaveLength(1);
      expect(earlyResults[0].action).toBe('early');

      const lateResults = freshLogger.query({ since: mid, until: after });
      expect(lateResults).toHaveLength(1);
      expect(lateResults[0].action).toBe('late');
    });

    it('should apply limit', () => {
      const results = logger.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should apply offset', () => {
      const all = logger.query({});
      const offset = logger.query({ offset: 2 });
      expect(offset).toHaveLength(2);
      expect(offset[0].id).toBe(all[2].id);
    });

    it('should apply limit and offset together', () => {
      const results = logger.query({ limit: 1, offset: 1 });
      expect(results).toHaveLength(1);
      const all = logger.query({});
      expect(results[0].id).toBe(all[1].id);
    });

    it('should return empty array when no events match', () => {
      const results = logger.query({ tenantId: 'nonexistent' });
      expect(results).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Export
  // ===========================================================================

  describe('export()', () => {
    beforeEach(() => {
      logger.log(
        createEvent({
          tenantId: 't1',
          actorId: 'u1',
          action: 'compile',
          outcome: 'success',
          metadata: { file: 'scene.hs' },
        })
      );
      logger.log(
        createEvent({
          tenantId: 't1',
          actorId: 'u2',
          action: 'deploy',
          outcome: 'failure',
          metadata: { reason: 'timeout' },
        })
      );
    });

    it('should export as JSON', () => {
      const json = logger.export({ tenantId: 't1' }, 'json');
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].tenantId).toBe('t1');
      expect(parsed[0].timestamp).toBeDefined();
      expect(typeof parsed[0].timestamp).toBe('string'); // ISO string
    });

    it('should export as CSV with headers', () => {
      const csv = logger.export({ tenantId: 't1' }, 'csv');
      const lines = csv.split('\n');

      expect(lines[0]).toBe(
        'id,timestamp,tenantId,actorId,actorType,action,resource,resourceId,outcome,metadata,clientIp,userAgent'
      );
      expect(lines).toHaveLength(3); // header + 2 data rows
    });

    it('should handle CSV with special characters', () => {
      logger.log(
        createEvent({
          tenantId: 't1',
          action: 'action,with,commas',
          metadata: { key: 'value "quoted"' },
        })
      );

      const csv = logger.export({ tenantId: 't1' }, 'csv');
      // Should contain escaped commas and quotes
      expect(csv).toContain('"action,with,commas"');
    });

    it('should return header-only CSV when no events match', () => {
      const csv = logger.export({ tenantId: 'nonexistent' }, 'csv');
      expect(csv).toBe(
        'id,timestamp,tenantId,actorId,actorType,action,resource,resourceId,outcome,metadata,clientIp,userAgent'
      );
    });

    it('should export empty JSON array when no events match', () => {
      const json = logger.export({ tenantId: 'nonexistent' }, 'json');
      expect(JSON.parse(json)).toEqual([]);
    });
  });

  // ===========================================================================
  // Retention policy and purge
  // ===========================================================================

  describe('retention and purge', () => {
    it('should set and get retention policy per tenant', () => {
      logger.setRetentionPolicy('t1', 90);
      logger.setRetentionPolicy('t2', 365);

      expect(logger.getRetentionPolicy('t1')).toBe(90);
      expect(logger.getRetentionPolicy('t2')).toBe(365);
      expect(logger.getRetentionPolicy('t3')).toBeUndefined();
    });

    it('should reject non-positive retention periods', () => {
      expect(() => logger.setRetentionPolicy('t1', 0)).toThrow();
      expect(() => logger.setRetentionPolicy('t1', -1)).toThrow();
    });

    it('should purge expired events', () => {
      // Create events with manipulated timestamps via custom storage
      const storage = new InMemoryAuditStorage();
      const customLogger = new AuditLogger(storage);

      // Log events (they get current timestamps)
      customLogger.log(createEvent({ tenantId: 't1', action: 'old-event' }));
      customLogger.log(createEvent({ tenantId: 't1', action: 'new-event' }));
      customLogger.log(createEvent({ tenantId: 't2', action: 'other-tenant' }));

      // Manually manipulate storage for testing: make the first event 100 days old
      const allEvents = storage.getAll();
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

      // Replace storage with events having modified timestamps
      const modifiedStorage = new InMemoryAuditStorage();
      modifiedStorage.append({ ...allEvents[0], timestamp: oldDate });
      modifiedStorage.append({ ...allEvents[1] }); // current timestamp
      modifiedStorage.append({ ...allEvents[2] }); // current timestamp

      const testLogger = new AuditLogger(modifiedStorage);
      testLogger.setRetentionPolicy('t1', 30); // 30 days retention for t1

      const purged = testLogger.purgeExpired();
      expect(purged).toBe(1);
      expect(testLogger.getEventCount()).toBe(2);
    });

    it('should not purge events when no policies are set', () => {
      logger.log(createEvent());
      const purged = logger.purgeExpired();
      expect(purged).toBe(0);
      expect(logger.getEventCount()).toBe(1);
    });

    it('should not purge events within retention period', () => {
      logger.log(createEvent({ tenantId: 't1' }));
      logger.setRetentionPolicy('t1', 365);

      const purged = logger.purgeExpired();
      expect(purged).toBe(0);
      expect(logger.getEventCount()).toBe(1);
    });
  });

  // ===========================================================================
  // Event count
  // ===========================================================================

  describe('getEventCount()', () => {
    it('should return total count with no filter', () => {
      logger.log(createEvent());
      logger.log(createEvent());
      logger.log(createEvent());

      expect(logger.getEventCount()).toBe(3);
    });

    it('should return filtered count', () => {
      logger.log(createEvent({ tenantId: 't1' }));
      logger.log(createEvent({ tenantId: 't1' }));
      logger.log(createEvent({ tenantId: 't2' }));

      expect(logger.getEventCount({ tenantId: 't1' })).toBe(2);
      expect(logger.getEventCount({ tenantId: 't2' })).toBe(1);
      expect(logger.getEventCount({ tenantId: 't3' })).toBe(0);
    });
  });

  // ===========================================================================
  // Append-only guarantee
  // ===========================================================================

  describe('append-only guarantee', () => {
    it('should not expose update or delete methods on AuditLogger', () => {
      // The AuditLogger API should not have update/delete/remove methods
      const proto = Object.getOwnPropertyNames(AuditLogger.prototype);
      expect(proto).not.toContain('update');
      expect(proto).not.toContain('delete');
      expect(proto).not.toContain('remove');
      expect(proto).not.toContain('modify');
    });

    it('should not allow modification of logged events via returned reference', () => {
      logger.log(createEvent({ metadata: { key: 'value' } }));
      const queried = logger.query({})[0];

      // The stored event is frozen, so mutation should either throw
      // or be silently ignored. Either way, the original must remain intact.
      let threw = false;
      try {
        (queried as { action: string }).action = 'TAMPERED';
      } catch {
        threw = true;
      }

      const queriedAgain = logger.query({})[0];
      // The stored event must still have the original action
      expect(queriedAgain.action).not.toBe('TAMPERED');
      // In strict mode (ESM/vitest), frozen objects throw on assignment
      expect(threw).toBe(true);
    });

    it('should store events immutably', () => {
      const event = logger.log(createEvent({ action: 'original' }));
      const allEvents = logger.query({});

      expect(allEvents).toHaveLength(1);
      expect(allEvents[0].action).toBe('original');

      // Returned event from log() should also not affect storage
      // (event is frozen copy)
      try {
        (event as { action: string }).action = 'TAMPERED';
      } catch {
        // Object.freeze may throw in strict mode
      }

      const freshQuery = logger.query({});
      expect(freshQuery[0].action).toBe('original');
    });
  });

  // ===========================================================================
  // Custom storage backend
  // ===========================================================================

  describe('custom storage backend', () => {
    it('should accept a custom storage backend via constructor', () => {
      const customStorage: AuditStorageBackend = {
        events: [] as any[],
        append(event: any) {
          this.events.push(event);
        },
        getAll() {
          return [...this.events];
        },
        getCount() {
          return this.events.length;
        },
        removeWhere(predicate: any) {
          const before = this.events.length;
          this.events = this.events.filter((e: any) => !predicate(e));
          return before - this.events.length;
        },
      } as any;

      const customLogger = new AuditLogger(customStorage);
      customLogger.log(createEvent());

      expect(customLogger.getEventCount()).toBe(1);
      expect((customStorage as any).events).toHaveLength(1);
    });
  });
});

// =============================================================================
// AuditQuery — Fluent query builder
// =============================================================================

describe('AuditQuery (fluent builder)', () => {
  it('should build a filter with all fields', () => {
    const since = new Date('2026-01-01');
    const until = new Date('2026-02-01');

    const filter = new AuditQuery()
      .tenant('t1')
      .actor('user1')
      .actorType('user')
      .action('compile')
      .resource('scene')
      .resourceId('scene-123')
      .outcome('success')
      .since(since)
      .until(until)
      .limit(100)
      .offset(0)
      .build();

    expect(filter.tenantId).toBe('t1');
    expect(filter.actorId).toBe('user1');
    expect(filter.actorType).toBe('user');
    expect(filter.action).toBe('compile');
    expect(filter.resource).toBe('scene');
    expect(filter.resourceId).toBe('scene-123');
    expect(filter.outcome).toBe('success');
    expect(filter.since).toBe(since);
    expect(filter.until).toBe(until);
    expect(filter.limit).toBe(100);
    expect(filter.offset).toBe(0);
  });

  it('should build a partial filter', () => {
    const filter = new AuditQuery().tenant('t1').action('deploy').build();

    expect(filter.tenantId).toBe('t1');
    expect(filter.action).toBe('deploy');
    expect(filter.actorId).toBeUndefined();
    expect(filter.outcome).toBeUndefined();
  });

  it('should build an empty filter', () => {
    const filter = new AuditQuery().build();
    expect(Object.keys(filter).length).toBe(0);
  });

  it('should be chainable (all methods return this)', () => {
    const query = new AuditQuery();
    const result = query.tenant('t1').actor('u1').action('compile');
    expect(result).toBe(query); // same instance
  });

  it('should work with AuditLogger.query()', () => {
    const logger = new AuditLogger();
    logger.log(createEvent({ tenantId: 't1', action: 'compile', outcome: 'success' }));
    logger.log(createEvent({ tenantId: 't1', action: 'deploy', outcome: 'failure' }));
    logger.log(createEvent({ tenantId: 't2', action: 'compile', outcome: 'success' }));

    const filter = new AuditQuery().tenant('t1').outcome('success').build();
    const results = logger.query(filter);

    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('compile');
  });
});

// =============================================================================
// ComplianceReporter — SOC2 and GDPR reports
// =============================================================================

describe('ComplianceReporter', () => {
  let logger: AuditLogger;
  let reporter: ComplianceReporter;
  const dateRange = {
    start: new Date('2026-01-01'),
    end: new Date('2026-12-31'),
  };

  beforeEach(() => {
    logger = new AuditLogger();
    reporter = new ComplianceReporter(logger);

    // Seed with various event types
    logger.log(createEvent({ tenantId: 't1', action: 'login', outcome: 'success', actorId: 'u1' }));
    logger.log(createEvent({ tenantId: 't1', action: 'login', outcome: 'denied', actorId: 'u2' }));
    logger.log(
      createEvent({ tenantId: 't1', action: 'update_config', outcome: 'success', actorId: 'u1' })
    );
    logger.log(
      createEvent({ tenantId: 't1', action: 'deploy', outcome: 'success', actorId: 'u1' })
    );
    logger.log(
      createEvent({
        tenantId: 't1',
        action: 'read',
        outcome: 'success',
        actorId: 'u1',
        resource: 'user_data',
      })
    );
    logger.log(
      createEvent({ tenantId: 't1', action: 'consent_granted', outcome: 'success', actorId: 'u1' })
    );
    logger.log(
      createEvent({
        tenantId: 't1',
        action: 'delete',
        outcome: 'success',
        actorId: 'u1',
        resource: 'user_data',
      })
    );
    logger.log(
      createEvent({ tenantId: 't1', action: 'compile', outcome: 'success', actorId: 'u3' })
    );
  });

  describe('generateSOC2Report()', () => {
    it('should return a report with type SOC2', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.type).toBe('SOC2');
    });

    it('should include generatedAt timestamp', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.generatedAt).toBeDefined();
      expect(new Date(report.generatedAt)).toBeInstanceOf(Date);
    });

    it('should include tenantId', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.tenantId).toBe('t1');
    });

    it('should include summary with correct counts', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);

      expect(report.summary.totalEvents).toBe(8);
      expect(report.summary.successCount).toBe(7);
      expect(report.summary.deniedCount).toBe(1);
      expect(report.summary.failureCount).toBe(0);
      expect(report.summary.uniqueActors).toBeGreaterThanOrEqual(2);
    });

    it('should have three sections: Access, Configuration, Security', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);

      expect(report.sections).toHaveLength(3);
      expect(report.sections[0].title).toBe('Access Events');
      expect(report.sections[1].title).toBe('Configuration Changes');
      expect(report.sections[2].title).toBe('Security Events');
    });

    it('should categorize login events as Access Events', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);
      const accessSection = report.sections[0];

      expect(accessSection.count).toBeGreaterThan(0);
      const loginItems = accessSection.items.filter((i) => i.action === 'login');
      expect(loginItems.length).toBeGreaterThanOrEqual(1);
    });

    it('should categorize config changes as Configuration Changes', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);
      const configSection = report.sections[1];

      expect(configSection.count).toBeGreaterThan(0);
      const configItems = configSection.items.filter((i) => i.action === 'update_config');
      expect(configItems.length).toBe(1);
    });

    it('should categorize denied events as Security Events', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);
      const securitySection = report.sections[2];

      const deniedItems = securitySection.items.filter((i) => i.outcome === 'denied');
      expect(deniedItems.length).toBeGreaterThanOrEqual(1);
    });

    it('should return structured report items', () => {
      const report = reporter.generateSOC2Report('t1', dateRange);
      const item = report.sections[0].items[0];

      expect(item.timestamp).toBeDefined();
      expect(item.actor).toBeDefined();
      expect(item.actorType).toBeDefined();
      expect(item.action).toBeDefined();
      expect(item.resource).toBeDefined();
      expect(item.outcome).toBeDefined();
      expect(item.details).toBeDefined();
    });
  });

  describe('generateGDPRReport()', () => {
    it('should return a report with type GDPR', () => {
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.type).toBe('GDPR');
    });

    it('should have three sections: Data Access, Consent, Deletion', () => {
      const report = reporter.generateGDPRReport('t1', dateRange);

      expect(report.sections).toHaveLength(3);
      expect(report.sections[0].title).toBe('Data Access Log');
      expect(report.sections[1].title).toBe('Consent Records');
      expect(report.sections[2].title).toBe('Deletion Requests');
    });

    it('should include data access events in Data Access Log', () => {
      const report = reporter.generateGDPRReport('t1', dateRange);
      const dataAccessSection = report.sections[0];

      const readItems = dataAccessSection.items.filter((i) => i.action === 'read');
      expect(readItems.length).toBeGreaterThanOrEqual(1);
    });

    it('should include consent events in Consent Records', () => {
      const report = reporter.generateGDPRReport('t1', dateRange);
      const consentSection = report.sections[1];

      const consentItems = consentSection.items.filter((i) => i.action === 'consent_granted');
      expect(consentItems.length).toBe(1);
    });

    it('should include deletion events in Deletion Requests', () => {
      const report = reporter.generateGDPRReport('t1', dateRange);
      const deletionSection = report.sections[2];

      const deleteItems = deletionSection.items.filter((i) => i.action === 'delete');
      expect(deleteItems.length).toBe(1);
    });

    it('should include summary with correct total', () => {
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.summary.totalEvents).toBe(8);
    });

    it('should include date range in summary', () => {
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.summary.dateRange.start).toBe(dateRange.start.toISOString());
      expect(report.summary.dateRange.end).toBe(dateRange.end.toISOString());
    });
  });

  describe('reports for empty tenants', () => {
    it('should generate SOC2 report with zero counts for unknown tenant', () => {
      const report = reporter.generateSOC2Report('nonexistent', dateRange);
      expect(report.summary.totalEvents).toBe(0);
      expect(report.sections.every((s) => s.count === 0)).toBe(true);
    });

    it('should generate GDPR report with zero counts for unknown tenant', () => {
      const report = reporter.generateGDPRReport('nonexistent', dateRange);
      expect(report.summary.totalEvents).toBe(0);
      expect(report.sections.every((s) => s.count === 0)).toBe(true);
    });
  });
});
