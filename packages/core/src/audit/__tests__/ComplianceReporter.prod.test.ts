/**
 * ComplianceReporter Production Tests
 *
 * SOC2 + GDPR report generation from mocked AuditLogger.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ComplianceReporter, type DateRange } from '../ComplianceReporter';

function makeEvent(overrides: Record<string, any> = {}) {
  return {
    id: 'evt-1',
    tenantId: 't1',
    actorId: 'user1',
    actorType: 'user' as const,
    action: 'login',
    resource: 'session',
    resourceId: 'sess-1',
    outcome: 'success' as const,
    timestamp: new Date('2026-01-15'),
    metadata: {},
    ...overrides,
  };
}

function makeMockLogger(events: ReturnType<typeof makeEvent>[]) {
  return { query: () => events } as any;
}

describe('ComplianceReporter — Production', () => {
  const dateRange: DateRange = {
    start: new Date('2026-01-01'),
    end: new Date('2026-02-01'),
  };

  describe('SOC2 Report', () => {
    it('generates with correct type and tenant', () => {
      const reporter = new ComplianceReporter(makeMockLogger([]));
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.type).toBe('SOC2');
      expect(report.tenantId).toBe('t1');
    });

    it('has 3 sections', () => {
      const reporter = new ComplianceReporter(makeMockLogger([]));
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.sections).toHaveLength(3);
      expect(report.sections.map((s) => s.title)).toEqual([
        'Access Events',
        'Configuration Changes',
        'Security Events',
      ]);
    });

    it('categorizes login as access event', () => {
      const events = [makeEvent({ action: 'login' })];
      const reporter = new ComplianceReporter(makeMockLogger(events));
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.sections[0].count).toBe(1);
    });

    it('categorizes deploy as config change', () => {
      const events = [makeEvent({ action: 'deploy' })];
      const reporter = new ComplianceReporter(makeMockLogger(events));
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.sections[1].count).toBe(1);
    });

    it('categorizes deny as security event', () => {
      const events = [makeEvent({ action: 'deny', outcome: 'denied' })];
      const reporter = new ComplianceReporter(makeMockLogger(events));
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.sections[2].count).toBeGreaterThanOrEqual(1);
    });

    it('summary counts events', () => {
      const events = [
        makeEvent({ outcome: 'success' }),
        makeEvent({ outcome: 'failure' }),
        makeEvent({ outcome: 'denied' }),
      ];
      const reporter = new ComplianceReporter(makeMockLogger(events));
      const report = reporter.generateSOC2Report('t1', dateRange);
      expect(report.summary.totalEvents).toBe(3);
      expect(report.summary.successCount).toBe(1);
      expect(report.summary.failureCount).toBe(1);
      expect(report.summary.deniedCount).toBe(1);
    });
  });

  describe('GDPR Report', () => {
    it('generates with correct type', () => {
      const reporter = new ComplianceReporter(makeMockLogger([]));
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.type).toBe('GDPR');
    });

    it('has 3 sections', () => {
      const reporter = new ComplianceReporter(makeMockLogger([]));
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.sections).toHaveLength(3);
      expect(report.sections.map((s) => s.title)).toEqual([
        'Data Access Log',
        'Consent Records',
        'Deletion Requests',
      ]);
    });

    it('categorizes read as data access', () => {
      const events = [makeEvent({ action: 'read' })];
      const reporter = new ComplianceReporter(makeMockLogger(events));
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.sections[0].count).toBe(1);
    });

    it('categorizes consent_granted as consent record', () => {
      const events = [makeEvent({ action: 'consent_granted' })];
      const reporter = new ComplianceReporter(makeMockLogger(events));
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.sections[1].count).toBe(1);
    });

    it('categorizes erase as deletion request', () => {
      const events = [makeEvent({ action: 'erase' })];
      const reporter = new ComplianceReporter(makeMockLogger(events));
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.sections[2].count).toBe(1);
    });

    it('tracks unique actors and resources', () => {
      const events = [
        makeEvent({ actorId: 'user1', resource: 'file' }),
        makeEvent({ actorId: 'user2', resource: 'file' }),
        makeEvent({ actorId: 'user1', resource: 'db' }),
      ];
      const reporter = new ComplianceReporter(makeMockLogger(events));
      const report = reporter.generateGDPRReport('t1', dateRange);
      expect(report.summary.uniqueActors).toBe(2);
      expect(report.summary.uniqueResources).toBe(2);
    });
  });
});
