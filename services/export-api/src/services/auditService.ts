/**
 * Audit Service
 *
 * Business logic for audit log queries and integrity verification.
 * SOC 2 CC7.2: Security event monitoring and review.
 *
 * In production, this would interface with a PostgreSQL database
 * with partitioned tables (monthly partitions per ADR-004).
 */

import { auditStore, type AuditLogEntry } from '../middleware/auditLog.js';
import { logger } from '../utils/logger.js';

export interface AuditQueryParams {
  limit?: number;
  offset?: number;
  identity?: string;
  method?: string;
  path?: string;
  startDate?: string;
  endDate?: string;
}

export interface AuditQueryResult {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class AuditService {
  /**
   * Query audit log entries with filtering and pagination.
   */
  query(params: AuditQueryParams): AuditQueryResult {
    const limit = Math.min(params.limit ?? 50, 1000);
    const offset = params.offset ?? 0;

    const result = auditStore.query({
      ...params,
      limit,
      offset,
    });

    return {
      entries: result.entries,
      total: result.total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      hasMore: offset + limit < result.total,
    };
  }

  /**
   * Verify the integrity of the audit log chain.
   * ADR-004: Append-only with integrity hashes.
   */
  verifyIntegrity(): { valid: boolean; totalEntries: number; firstTamperedIndex: number } {
    const result = auditStore.verifyIntegrity();
    const totalEntries = auditStore.count;

    if (!result.valid) {
      logger.error({
        firstTamperedIndex: result.firstTamperedIndex,
        totalEntries,
      }, 'Audit log integrity violation detected');
    }

    return {
      valid: result.valid,
      totalEntries,
      firstTamperedIndex: result.firstTamperedIndex,
    };
  }

  /**
   * Get audit log statistics.
   */
  getStats(): {
    totalEntries: number;
    integrityValid: boolean;
  } {
    return {
      totalEntries: auditStore.count,
      integrityValid: auditStore.verifyIntegrity().valid,
    };
  }
}

export const auditService = new AuditService();
