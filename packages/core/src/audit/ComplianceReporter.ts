/**
 * Compliance Reporter — Generates SOC2 and GDPR compliance reports
 *
 * Produces structured JSON reports from audit event data to support
 * compliance auditing and regulatory requirements.
 *
 * @version 3.3.0
 * @Sprint Sprint 9: Audit Logging & Compliance
 */

import type { AuditLogger, AuditEvent } from './AuditLogger';

// =============================================================================
// Types
// =============================================================================

/**
 * Date range for compliance report queries.
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * A single section within a compliance report.
 */
export interface ReportSection {
  title: string;
  description: string;
  items: ReportItem[];
  count: number;
}

/**
 * A single item (row) within a report section.
 */
export interface ReportItem {
  timestamp: string;
  actor: string;
  actorType: string;
  action: string;
  resource: string;
  resourceId?: string;
  outcome: string;
  details: Record<string, unknown>;
}

/**
 * Summary statistics for a compliance report.
 */
export interface ReportSummary {
  totalEvents: number;
  successCount: number;
  failureCount: number;
  deniedCount: number;
  uniqueActors: number;
  uniqueResources: number;
  dateRange: { start: string; end: string };
}

/**
 * Full compliance report structure.
 */
export interface ComplianceReport {
  type: 'SOC2' | 'GDPR';
  generatedAt: string;
  tenantId: string;
  summary: ReportSummary;
  sections: ReportSection[];
}

// =============================================================================
// Helper functions
// =============================================================================

function eventToReportItem(event: AuditEvent): ReportItem {
  return {
    timestamp: event.timestamp.toISOString(),
    actor: event.actorId,
    actorType: event.actorType,
    action: event.action,
    resource: event.resource,
    resourceId: event.resourceId,
    outcome: event.outcome,
    details: event.metadata,
  };
}

function buildSummary(events: AuditEvent[], dateRange: DateRange): ReportSummary {
  const actors = new Set<string>();
  const resources = new Set<string>();
  let successCount = 0;
  let failureCount = 0;
  let deniedCount = 0;

  for (const event of events) {
    actors.add(event.actorId);
    resources.add(event.resource);
    if (event.outcome === 'success') successCount++;
    else if (event.outcome === 'failure') failureCount++;
    else if (event.outcome === 'denied') deniedCount++;
  }

  return {
    totalEvents: events.length,
    successCount,
    failureCount,
    deniedCount,
    uniqueActors: actors.size,
    uniqueResources: resources.size,
    dateRange: {
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    },
  };
}

// =============================================================================
// SOC2 action categories
// =============================================================================

const SOC2_ACCESS_ACTIONS = [
  'login',
  'logout',
  'authenticate',
  'authorize',
  'access',
  'view',
  'read',
];
const SOC2_CONFIG_ACTIONS = [
  'configure',
  'update_config',
  'set_policy',
  'create',
  'update',
  'delete',
  'deploy',
  'publish',
];
const SOC2_SECURITY_ACTIONS = ['deny', 'block', 'revoke', 'suspend', 'alert', 'scan', 'audit'];

// =============================================================================
// GDPR action categories
// =============================================================================

const GDPR_DATA_ACCESS_ACTIONS = ['read', 'view', 'access', 'download', 'export', 'query'];
const GDPR_CONSENT_ACTIONS = [
  'consent',
  'withdraw_consent',
  'update_consent',
  'consent_granted',
  'consent_revoked',
];
const GDPR_DELETION_ACTIONS = [
  'delete',
  'erase',
  'purge',
  'anonymize',
  'forget',
  'right_to_erasure',
];

// =============================================================================
// ComplianceReporter
// =============================================================================

/**
 * Generates structured compliance reports (SOC2, GDPR) from audit logs.
 */
export class ComplianceReporter {
  private logger: AuditLogger;

  constructor(logger: AuditLogger) {
    this.logger = logger;
  }

  /**
   * Generate a SOC2 compliance report for a tenant over a date range.
   *
   * Includes sections for:
   * - Access Events: login, logout, authentication, authorization
   * - Configuration Changes: settings modifications, deployments
   * - Security Events: denials, blocks, revocations, alerts
   */
  generateSOC2Report(tenantId: string, dateRange: DateRange): ComplianceReport {
    const allEvents = this.logger.query({
      tenantId,
      since: dateRange.start,
      until: dateRange.end,
    });

    const accessEvents = allEvents.filter(
      (e) =>
        SOC2_ACCESS_ACTIONS.some((a) => e.action.toLowerCase().includes(a)) ||
        e.outcome === 'denied'
    );

    const configEvents = allEvents.filter((e) =>
      SOC2_CONFIG_ACTIONS.some((a) => e.action.toLowerCase().includes(a))
    );

    const securityEvents = allEvents.filter(
      (e) =>
        SOC2_SECURITY_ACTIONS.some((a) => e.action.toLowerCase().includes(a)) ||
        e.outcome === 'denied'
    );

    const sections: ReportSection[] = [
      {
        title: 'Access Events',
        description: 'Records of user authentication, authorization, and access control events.',
        items: accessEvents.map(eventToReportItem),
        count: accessEvents.length,
      },
      {
        title: 'Configuration Changes',
        description:
          'Records of system configuration modifications, deployments, and policy changes.',
        items: configEvents.map(eventToReportItem),
        count: configEvents.length,
      },
      {
        title: 'Security Events',
        description:
          'Records of security-related events including access denials, blocks, and alerts.',
        items: securityEvents.map(eventToReportItem),
        count: securityEvents.length,
      },
    ];

    return {
      type: 'SOC2',
      generatedAt: new Date().toISOString(),
      tenantId,
      summary: buildSummary(allEvents, dateRange),
      sections,
    };
  }

  /**
   * Generate a GDPR compliance report for a tenant over a date range.
   *
   * Includes sections for:
   * - Data Access Log: records of personal data access
   * - Consent Records: consent grants, withdrawals, and updates
   * - Deletion Requests: right-to-erasure and data deletion events
   */
  generateGDPRReport(tenantId: string, dateRange: DateRange): ComplianceReport {
    const allEvents = this.logger.query({
      tenantId,
      since: dateRange.start,
      until: dateRange.end,
    });

    const dataAccessEvents = allEvents.filter((e) =>
      GDPR_DATA_ACCESS_ACTIONS.some((a) => e.action.toLowerCase().includes(a))
    );

    const consentEvents = allEvents.filter((e) =>
      GDPR_CONSENT_ACTIONS.some((a) => e.action.toLowerCase().includes(a))
    );

    const deletionEvents = allEvents.filter((e) =>
      GDPR_DELETION_ACTIONS.some((a) => e.action.toLowerCase().includes(a))
    );

    const sections: ReportSection[] = [
      {
        title: 'Data Access Log',
        description: 'Records of personal data access events for data subject rights compliance.',
        items: dataAccessEvents.map(eventToReportItem),
        count: dataAccessEvents.length,
      },
      {
        title: 'Consent Records',
        description: 'Records of consent grants, withdrawals, and modifications.',
        items: consentEvents.map(eventToReportItem),
        count: consentEvents.length,
      },
      {
        title: 'Deletion Requests',
        description: 'Records of data deletion requests and right-to-erasure fulfillment.',
        items: deletionEvents.map(eventToReportItem),
        count: deletionEvents.length,
      },
    ];

    return {
      type: 'GDPR',
      generatedAt: new Date().toISOString(),
      tenantId,
      summary: buildSummary(allEvents, dateRange),
      sections,
    };
  }
}
