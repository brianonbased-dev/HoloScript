/**
 * Audit Logging & Compliance Module
 *
 * Provides append-only audit event logging, fluent query building,
 * and SOC2/GDPR-SHAPED report generation. Those reports summarise self-reported
 * events; they are not attestations and must not be handed to an auditor as
 * evidence. See ComplianceReporter.ts.
 *
 * @version 3.3.0
 * @Sprint Sprint 9: Audit Logging & Compliance
 */

// Core Audit Logger
export {
  AuditLogger,
  InMemoryAuditStorage,
  type AuditEvent,
  type AuditEventInput,
  type AuditQueryFilter,
  type AuditStorageBackend,
} from './AuditLogger';

// Fluent Query Builder
export { AuditQuery } from './AuditQueryBuilder';

// Compliance Reporter
export {
  ComplianceReporter,
  type DateRange,
  type ReportSection,
  type ReportItem,
  type ReportSummary,
  type ComplianceReport,
} from './ComplianceReporter';
