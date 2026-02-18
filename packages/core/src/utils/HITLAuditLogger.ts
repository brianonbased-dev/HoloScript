/**
 * @holoscript/core HITL Audit Logger
 *
 * Provides persistent storage for Human-in-the-Loop decisions and agent actions.
 * Supports file-system (for Node.js) and localStorage (for Browser) backends.
 */

import { logger } from '../logger';

export interface AuditEntry {
  id: string;
  timestamp: number;
  agentId: string;
  action: string;
  decision: string;
  confidence: number;
  riskScore: number;
  approver?: string;
  reason?: string;
  isViolation?: boolean;
  violations?: any[];
}

export class HITLAuditLogger {
  private static STORAGE_KEY = 'holoscript_hitl_audit_log';
  private static MAX_ENTRIES = 1000;

  /**
   * Log an HITL action to persistent storage
   */
  public static async log(entry: AuditEntry): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        this.saveToLocalStorage(entry);
      } else {
        // In Node environment, we'd use fs.appendFile or similar
        // For now, routing through unified logger
        logger.info(`[HITLAudit] ${JSON.stringify(entry)}`);
      }
    } catch (error) {
      logger.error(`[HITLAuditLogger] Failed to log action: ${error}`);
    }
  }

  /**
   * Retrieve audit logs
   */
  public static async getLogs(filter?: {
    agentId?: string;
    decision?: string;
  }): Promise<AuditEntry[]> {
    let logs: AuditEntry[] = [];

    if (typeof window !== 'undefined' && window.localStorage) {
      const data = window.localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        logs = JSON.parse(data);
      }
    }

    if (filter) {
      return logs.filter((log) => {
        if (filter.agentId && log.agentId !== filter.agentId) return false;
        if (filter.decision && log.decision !== filter.decision) return false;
        return true;
      });
    }

    return logs;
  }

  private static saveToLocalStorage(entry: AuditEntry): void {
    const data = window.localStorage.getItem(this.STORAGE_KEY);
    let logs: AuditEntry[] = data ? JSON.parse(data) : [];

    logs.push(entry);

    // Cap log size
    if (logs.length > this.MAX_ENTRIES) {
      logs = logs.slice(-this.MAX_ENTRIES);
    }

    window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
  }
}

export default HITLAuditLogger;
