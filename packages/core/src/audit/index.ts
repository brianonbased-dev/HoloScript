/**
 * Audit Logging & Compliance Module
 *
 * Provides append-only audit event logging, fluent query building,
 * and SOC2/GDPR compliance report generation.
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
