/**
 * Audit Log Middleware
 *
 * Records all API requests in an append-only audit log with integrity hashing.
 * SOC 2 CC7.2: Log security-relevant events.
 * ADR-004: Append-only audit logs with integrity hashes.
 *
 * Each log entry contains:
 * - Request metadata (method, path, status, duration)
 * - Identity information (who performed the action)
 * - Integrity hash (SHA-256 chain linking to previous entry)
 * - Timestamp (ISO 8601)
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/** Audit log entry */
export interface AuditLogEntry {
  /** Unique entry ID */
  id: string;
  /** Request ID for correlation */
  requestId: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Response status code */
  statusCode: number;
  /** Request duration in ms */
  durationMs: number;
  /** Authenticated identity */
  identity: {
    sub: string;
    role: string;
    authMethod: string;
  } | null;
  /** Client IP address */
  clientIp: string;
  /** User agent */
  userAgent: string;
  /** SHA-256 integrity hash (chain) */
  integrityHash: string;
  /** Hash of the previous entry (chain link) */
  previousHash: string;
}

/** In-memory audit log store (replace with database in production) */
class AuditStore {
  private entries: AuditLogEntry[] = [];
  private lastHash: string = '0'.repeat(64); // Genesis hash

  /**
   * Append a new audit entry.
   * ADR-004: Append-only, entries cannot be modified or deleted.
   */
  append(entry: Omit<AuditLogEntry, 'id' | 'integrityHash' | 'previousHash'>): AuditLogEntry {
    const id = crypto.randomUUID();
    const previousHash = this.lastHash;

    // Compute integrity hash: SHA-256(previousHash + entry data)
    const hashInput = `${previousHash}|${entry.timestamp}|${entry.requestId}|${entry.method}|${entry.path}|${entry.statusCode}|${entry.identity?.sub ?? 'anonymous'}`;
    const integrityHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    const fullEntry: AuditLogEntry = {
      ...entry,
      id,
      integrityHash,
      previousHash,
    };

    this.entries.push(fullEntry);
    this.lastHash = integrityHash;

    return fullEntry;
  }

  /**
   * Query audit entries (read-only).
   */
  query(options?: {
    limit?: number;
    offset?: number;
    identity?: string;
    method?: string;
    path?: string;
    startDate?: string;
    endDate?: string;
  }): { entries: AuditLogEntry[]; total: number } {
    let filtered = [...this.entries];

    if (options?.identity) {
      filtered = filtered.filter((e) => e.identity?.sub === options.identity);
    }
    if (options?.method) {
      filtered = filtered.filter((e) => e.method === options.method);
    }
    if (options?.path) {
      filtered = filtered.filter((e) => e.path.startsWith(options.path!));
    }
    if (options?.startDate) {
      filtered = filtered.filter((e) => e.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      filtered = filtered.filter((e) => e.timestamp <= options.endDate!);
    }

    const total = filtered.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    const entries = filtered.slice(offset, offset + limit);

    return { entries, total };
  }

  /**
   * Verify the integrity chain.
   * Returns the index of the first tampered entry, or -1 if valid.
   */
  verifyIntegrity(): { valid: boolean; firstTamperedIndex: number } {
    let previousHash = '0'.repeat(64);

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      if (entry.previousHash !== previousHash) {
        return { valid: false, firstTamperedIndex: i };
      }

      const hashInput = `${previousHash}|${entry.timestamp}|${entry.requestId}|${entry.method}|${entry.path}|${entry.statusCode}|${entry.identity?.sub ?? 'anonymous'}`;
      const expectedHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      if (entry.integrityHash !== expectedHash) {
        return { valid: false, firstTamperedIndex: i };
      }

      previousHash = entry.integrityHash;
    }

    return { valid: true, firstTamperedIndex: -1 };
  }

  /** Get total entry count */
  get count(): number {
    return this.entries.length;
  }
}

export const auditStore = new AuditStore();

/**
 * Audit logging middleware.
 *
 * Records the request on response finish (to capture status code and duration).
 */
export function auditLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Hook into response finish event
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;

    const entry = auditStore.append({
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      identity: req.identity
        ? {
            sub: req.identity.sub,
            role: req.identity.role,
            authMethod: req.identity.authMethod,
          }
        : null,
      clientIp: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });

    // Log audit entry
    logger.info({
      auditId: entry.id,
      requestId: entry.requestId,
      method: entry.method,
      path: entry.path,
      status: entry.statusCode,
      durationMs: entry.durationMs,
      identity: entry.identity?.sub,
    }, 'Audit log entry');
  });

  next();
}
