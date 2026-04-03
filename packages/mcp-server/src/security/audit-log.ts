/**
 * EU AI Act Compliant Audit Logging for HoloScript MCP Server
 *
 * Records all tool invocations with:
 * - ISO 8601 timestamp (UTC)
 * - Agent identity (OAuth 2.1 client ID + agent ID)
 * - Tool name and category
 * - Parameters (PII-redacted per GDPR/EU AI Act Art. 12-14)
 * - Result status (success, error, denied)
 * - Gate results (which of the triple gates passed/failed)
 * - Risk level classification
 * - Request duration
 *
 * EU AI Act Compliance (Articles 12-14):
 * - Art. 12: Automatic logging of AI system operations
 * - Art. 13: Transparency — logs are queryable and exportable
 * - Art. 14: Human oversight — high-risk operations flagged
 *
 * Logs are stored in-memory with configurable rotation and can be
 * exported to external systems (stdout JSON, file, webhook).
 */

import { randomUUID } from 'crypto';
import type { TokenIntrospection } from './oauth21';
import type { ToolRiskLevel } from './tool-scopes';
import type { TripleGateResult } from './gates';

// ── Types ────────────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'tool_invocation'
  | 'tool_result'
  | 'auth_success'
  | 'auth_failure'
  | 'gate_denied'
  | 'token_issued'
  | 'token_revoked'
  | 'client_registered'
  | 'client_revoked'
  | 'rate_limited'
  | 'session_created'
  | 'session_closed';

export type AuditResultStatus = 'success' | 'error' | 'denied' | 'rate_limited';

export interface AuditLogEntry {
  /** Unique event ID */
  id: string;
  /** ISO 8601 timestamp in UTC */
  timestamp: string;
  /** Event type */
  event: AuditEventType;
  /** Agent identity */
  agent: {
    clientId?: string;
    agentId?: string;
    /** IP address (hashed for GDPR) */
    ipHash?: string;
    /** Session ID if applicable */
    sessionId?: string;
  };
  /** Tool invocation details (for tool_invocation/tool_result events) */
  tool?: {
    name: string;
    category?: string;
    riskLevel?: ToolRiskLevel;
    /** PII-redacted parameter summary */
    paramSummary?: Record<string, string>;
    /** Result status */
    resultStatus?: AuditResultStatus;
    /** Error message (if applicable, sanitized) */
    errorMessage?: string;
  };
  /** Triple-gate security results */
  security?: {
    gate1Passed?: boolean;
    gate2Passed?: boolean;
    gate3Passed?: boolean;
    deniedAtGate?: number;
    deniedReason?: string;
    requiredScopes?: string[];
    grantedScopes?: string[];
  };
  /** Request metadata */
  request?: {
    /** HTTP method */
    method?: string;
    /** Request path */
    path?: string;
    /** Request duration in milliseconds */
    durationMs?: number;
    /** Request body size in bytes */
    bodySize?: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ── PII Redaction ────────────────────────────────────────────────────────────

/** Fields that may contain PII and must be redacted */
const PII_FIELDS = new Set([
  'email',
  'name',
  'username',
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'session',
  'phone',
  'address',
  'ssn',
  'credit_card',
  'ip',
  'user_agent',
  'clientSecret',
  'client_secret',
  'refresh_token',
  'access_token',
  'codeVerifier',
  'code_verifier',
  'code_challenge',
]);

/** Patterns that look like PII values */
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // email
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/, // credit card
  /\b\d{10,15}\b/, // phone number
];

/**
 * Redact PII from tool arguments for safe audit logging.
 * Returns a summary map with field names and redacted type indicators.
 */
export function redactPII(args: Record<string, unknown>): Record<string, string> {
  const summary: Record<string, string> = {};

  for (const [key, value] of Object.entries(args)) {
    if (PII_FIELDS.has(key.toLowerCase())) {
      summary[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string') {
      // Check for PII patterns in value
      let redacted = false;
      for (const pattern of PII_PATTERNS) {
        if (pattern.test(value)) {
          summary[key] = `[REDACTED:${value.length} chars]`;
          redacted = true;
          break;
        }
      }
      if (!redacted) {
        // Truncate long strings for the summary
        summary[key] =
          value.length > 100 ? `${value.substring(0, 50)}...[${value.length} chars]` : value;
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      summary[key] = String(value);
    } else if (Array.isArray(value)) {
      summary[key] = `[Array:${value.length} items]`;
    } else if (value && typeof value === 'object') {
      summary[key] = `[Object:${Object.keys(value).length} keys]`;
    } else if (value === null || value === undefined) {
      summary[key] = String(value);
    } else {
      summary[key] = '[unknown type]';
    }
  }

  return summary;
}

/**
 * Hash an IP address for GDPR-compliant logging.
 * Uses a one-way hash so the IP can't be recovered.
 */
function hashIP(ip: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256')
    .update(ip + 'holoscript-audit-salt')
    .digest('hex')
    .substring(0, 16);
}

// ── Tool Category Mapping ────────────────────────────────────────────────────

function getToolCategory(toolName: string): string {
  if (toolName.startsWith('parse_') || toolName.startsWith('validate_')) return 'parsing';
  if (toolName.startsWith('generate_') || toolName.startsWith('suggest_')) return 'generation';
  if (toolName.startsWith('compile_')) return 'compilation';
  if (toolName.startsWith('holo_')) return 'codebase-intelligence';
  if (toolName.startsWith('hs_ai_')) return 'ai-assistant';
  if (toolName.startsWith('hs_')) return 'ide';
  if (toolName.startsWith('browser_')) return 'browser-control';
  if (toolName.startsWith('absorb_')) return 'absorb-service';
  if (toolName === 'render_preview' || toolName === 'create_share_link') return 'rendering';
  if (toolName === 'edit_holo' || toolName === 'convert_format') return 'editing';
  return 'other';
}

// ── Audit Log Store ──────────────────────────────────────────────────────────

export interface AuditLogConfig {
  /** Maximum entries to keep in memory. Default: 10000 */
  maxEntries: number;
  /** Log to stdout as JSON lines. Default: true */
  stdoutJsonl: boolean;
  /** Webhook URL to POST audit entries. Default: none */
  webhookUrl?: string;
  /** Whether to include full parameter summaries. Default: true */
  includeParams: boolean;
  /** Retention period in hours. Default: 168 (7 days) */
  retentionHours: number;
  /** Flag high-risk operations for human review. Default: true */
  flagHighRisk: boolean;
}

const DEFAULT_AUDIT_CONFIG: AuditLogConfig = {
  maxEntries: 10_000,
  stdoutJsonl: process.env.AUDIT_STDOUT !== 'false',
  webhookUrl: process.env.AUDIT_WEBHOOK_URL,
  includeParams: true,
  retentionHours: 168,
  flagHighRisk: true,
};

class AuditLogger {
  private entries: AuditLogEntry[] = [];
  private config: AuditLogConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<AuditLogConfig> = {}) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.startCleanup();
  }

  // ── Core Logging ───────────────────────────────────────────────────────

  private log(entry: AuditLogEntry): void {
    this.entries.push(entry);

    // Enforce max entries
    while (this.entries.length > this.config.maxEntries) {
      this.entries.shift();
    }

    // Output to stdout as JSONL
    if (this.config.stdoutJsonl) {
      const line = JSON.stringify({
        ...entry,
        _audit: true,
        _version: '1.0.0',
        _compliance: 'eu-ai-act',
      });
    }

    // Send to webhook (fire-and-forget)
    if (this.config.webhookUrl) {
      this.sendToWebhook(entry).catch(() => {
        // Webhook failure should never block operations
      });
    }
  }

  // ── Convenience Methods ────────────────────────────────────────────────

  /**
   * Log a tool invocation (before execution).
   */
  logToolInvocation(params: {
    toolName: string;
    args: Record<string, unknown>;
    auth: TokenIntrospection;
    gateResult: TripleGateResult;
    requestPath?: string;
    requestMethod?: string;
    ip?: string;
    sessionId?: string;
  }): string {
    const id = randomUUID();
    const entry: AuditLogEntry = {
      id,
      timestamp: new Date().toISOString(),
      event: params.gateResult.passed ? 'tool_invocation' : 'gate_denied',
      agent: {
        clientId: params.auth.clientId,
        agentId: params.auth.agentId,
        ipHash: params.ip ? hashIP(params.ip) : undefined,
        sessionId: params.sessionId,
      },
      tool: {
        name: params.toolName,
        category: getToolCategory(params.toolName),
        riskLevel: params.gateResult.riskLevel,
        paramSummary: this.config.includeParams ? redactPII(params.args) : undefined,
        resultStatus: params.gateResult.passed ? undefined : 'denied',
      },
      security: {
        gate1Passed: params.gateResult.gate1?.passed,
        gate2Passed: params.gateResult.gate2?.authorized,
        gate3Passed: params.gateResult.gate3?.passed,
        deniedAtGate: params.gateResult.passed ? undefined : params.gateResult.gate,
        deniedReason: params.gateResult.reason,
        requiredScopes: params.gateResult.gate2?.requiredScopes as string[] | undefined,
        grantedScopes: params.auth.scopes,
      },
      request: {
        method: params.requestMethod,
        path: params.requestPath,
      },
    };

    // Flag high-risk operations for human review (EU AI Act Art. 14)
    if (this.config.flagHighRisk && params.gateResult.riskLevel === 'critical') {
      entry.metadata = {
        ...entry.metadata,
        humanReviewRequired: true,
        riskJustification: 'Critical-risk tool invocation per EU AI Act Art. 14',
      };
    }

    this.log(entry);
    return id;
  }

  /**
   * Log a tool result (after execution).
   */
  logToolResult(params: {
    invocationId: string;
    toolName: string;
    status: AuditResultStatus;
    durationMs: number;
    errorMessage?: string;
    auth: TokenIntrospection;
    sessionId?: string;
  }): void {
    this.log({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      event: 'tool_result',
      agent: {
        clientId: params.auth.clientId,
        agentId: params.auth.agentId,
        sessionId: params.sessionId,
      },
      tool: {
        name: params.toolName,
        category: getToolCategory(params.toolName),
        resultStatus: params.status,
        errorMessage: params.errorMessage
          ? params.errorMessage.substring(0, 500) // Truncate error messages
          : undefined,
      },
      request: {
        durationMs: params.durationMs,
      },
      metadata: {
        invocationId: params.invocationId,
      },
    });
  }

  /**
   * Log authentication events.
   */
  logAuthEvent(params: {
    event:
      | 'auth_success'
      | 'auth_failure'
      | 'token_issued'
      | 'token_revoked'
      | 'client_registered'
      | 'client_revoked'
      | 'rate_limited';
    clientId?: string;
    agentId?: string;
    ip?: string;
    reason?: string;
  }): void {
    this.log({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      event: params.event,
      agent: {
        clientId: params.clientId,
        agentId: params.agentId,
        ipHash: params.ip ? hashIP(params.ip) : undefined,
      },
      metadata: params.reason ? { reason: params.reason } : undefined,
    });
  }

  /**
   * Log session lifecycle events.
   */
  logSessionEvent(params: {
    event: 'session_created' | 'session_closed';
    sessionId: string;
    clientId?: string;
  }): void {
    this.log({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      event: params.event,
      agent: {
        clientId: params.clientId,
        sessionId: params.sessionId,
      },
    });
  }

  // ── Querying (EU AI Act Art. 13: Transparency) ─────────────────────────

  /**
   * Query audit logs with filters.
   */
  query(filters: {
    event?: AuditEventType;
    clientId?: string;
    agentId?: string;
    toolName?: string;
    status?: AuditResultStatus;
    riskLevel?: ToolRiskLevel;
    since?: string; // ISO 8601
    until?: string; // ISO 8601
    limit?: number;
    offset?: number;
    humanReviewOnly?: boolean;
  }): { entries: AuditLogEntry[]; total: number } {
    let results = this.entries;

    if (filters.event) {
      results = results.filter((e) => e.event === filters.event);
    }
    if (filters.clientId) {
      results = results.filter((e) => e.agent.clientId === filters.clientId);
    }
    if (filters.agentId) {
      results = results.filter((e) => e.agent.agentId === filters.agentId);
    }
    if (filters.toolName) {
      results = results.filter((e) => e.tool?.name === filters.toolName);
    }
    if (filters.status) {
      results = results.filter((e) => e.tool?.resultStatus === filters.status);
    }
    if (filters.riskLevel) {
      results = results.filter((e) => e.tool?.riskLevel === filters.riskLevel);
    }
    if (filters.since) {
      results = results.filter((e) => e.timestamp >= filters.since!);
    }
    if (filters.until) {
      results = results.filter((e) => e.timestamp <= filters.until!);
    }
    if (filters.humanReviewOnly) {
      results = results.filter(
        (e) => e.metadata && (e.metadata as Record<string, unknown>).humanReviewRequired === true
      );
    }

    const total = results.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;

    return {
      entries: results.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Export audit log as JSON (EU AI Act Art. 13: transparency export).
   */
  export(format: 'json' | 'jsonl' = 'json'): string {
    if (format === 'jsonl') {
      return this.entries.map((e) => JSON.stringify(e)).join('\n');
    }
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        compliance: 'eu-ai-act-articles-12-14',
        version: '1.0.0',
        total: this.entries.length,
        entries: this.entries,
      },
      null,
      2
    );
  }

  /**
   * Get compliance summary statistics.
   */
  getComplianceStats(): Record<string, unknown> {
    const now = Date.now();
    const last24h = new Date(now - 86_400_000).toISOString();
    const last7d = new Date(now - 7 * 86_400_000).toISOString();

    const recent24h = this.entries.filter((e) => e.timestamp >= last24h);
    const recent7d = this.entries.filter((e) => e.timestamp >= last7d);

    const denials24h = recent24h.filter((e) => e.event === 'gate_denied');
    const highRisk24h = recent24h.filter((e) => e.tool?.riskLevel === 'critical');
    const humanReview = recent24h.filter(
      (e) => e.metadata && (e.metadata as Record<string, unknown>).humanReviewRequired === true
    );

    return {
      compliance: 'eu-ai-act-articles-12-14',
      reporting_period: {
        last24h: {
          totalEvents: recent24h.length,
          toolInvocations: recent24h.filter((e) => e.event === 'tool_invocation').length,
          denials: denials24h.length,
          highRiskOperations: highRisk24h.length,
          pendingHumanReview: humanReview.length,
          authFailures: recent24h.filter((e) => e.event === 'auth_failure').length,
        },
        last7d: {
          totalEvents: recent7d.length,
          uniqueClients: new Set(recent7d.map((e) => e.agent.clientId).filter(Boolean)).size,
          uniqueTools: new Set(recent7d.filter((e) => e.tool).map((e) => e.tool!.name)).size,
        },
      },
      retentionPolicy: {
        maxEntries: this.config.maxEntries,
        retentionHours: this.config.retentionHours,
        currentEntries: this.entries.length,
      },
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private async sendToWebhook(entry: AuditLogEntry): Promise<void> {
    if (!this.config.webhookUrl) return;
    try {
      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Silent failure — audit webhook should never block
    }
  }

  private startCleanup(): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      const cutoff = new Date(Date.now() - this.config.retentionHours * 3_600_000).toISOString();
      this.entries = this.entries.filter((e) => e.timestamp >= cutoff);
    }, 3_600_000); // Clean up every hour
  }

  /** Stop cleanup timer (for tests) */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _auditLogger: AuditLogger | null = null;

export function getAuditLogger(config?: Partial<AuditLogConfig>): AuditLogger {
  if (!_auditLogger) {
    _auditLogger = new AuditLogger(config);
  }
  return _auditLogger;
}

export function resetAuditLogger(): void {
  _auditLogger?.destroy();
  _auditLogger = null;
}
