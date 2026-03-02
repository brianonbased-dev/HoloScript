/**
 * Audit Log Trait
 *
 * Centralized audit logging for HoloScript enterprise multi-tenant deployments.
 * Captures and manages immutable audit trails for all tenant operations.
 *
 * Features:
 * - Structured audit log entries with actor, action, resource, and result
 * - Severity levels (info, warning, error, critical)
 * - Configurable retention policies
 * - Query/filter capabilities for compliance reporting
 * - Export to external SIEM systems
 * - Tamper detection via hash chains
 * - Compliance mode for SOC 2, GDPR, HIPAA
 *
 * @version 1.0.0
 * @category enterprise
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Audit log severity levels */
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

/** Audit log categories aligned with enterprise operations */
export type AuditCategory =
  | 'tenant'
  | 'rbac'
  | 'quota'
  | 'sso'
  | 'scene'
  | 'trait'
  | 'export'
  | 'asset'
  | 'user'
  | 'billing'
  | 'system'
  | 'security';

/** Compliance frameworks */
export type ComplianceFramework = 'soc2' | 'gdpr' | 'hipaa' | 'iso27001' | 'pci_dss';

/** A single audit log entry */
export interface AuditLogEntry {
  /** Unique entry identifier */
  entryId: string;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Tenant context */
  tenantId: string;
  /** Actor who performed the action */
  actor: {
    /** User ID */
    userId: string;
    /** User's role at time of action */
    role?: string;
    /** IP address */
    ipAddress?: string;
    /** User agent */
    userAgent?: string;
    /** Session ID */
    sessionId?: string;
  };
  /** Action performed */
  action: string;
  /** Category of the action */
  category: AuditCategory;
  /** Severity level */
  severity: AuditSeverity;
  /** Resource affected */
  resource?: {
    type: string;
    id: string;
    name?: string;
  };
  /** Action result */
  result: 'success' | 'failure' | 'denied' | 'error';
  /** Detailed information */
  details: Record<string, unknown>;
  /** Previous hash for chain integrity */
  previousHash?: string;
  /** Hash of this entry */
  entryHash?: string;
  /** Compliance tags */
  complianceTags?: ComplianceFramework[];
}

/** Audit log query parameters */
export interface AuditLogQuery {
  /** Filter by tenant */
  tenantId?: string;
  /** Filter by actor user ID */
  userId?: string;
  /** Filter by action */
  action?: string;
  /** Filter by category */
  category?: AuditCategory;
  /** Filter by severity (minimum) */
  minSeverity?: AuditSeverity;
  /** Filter by result */
  result?: string;
  /** Start time (ISO 8601) */
  startTime?: string;
  /** End time (ISO 8601) */
  endTime?: string;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Compliance framework filter */
  complianceFramework?: ComplianceFramework;
}

/** Audit log configuration for trait handler */
export interface AuditLogConfig {
  /** Tenant this audit log belongs to */
  tenantId: string;
  /** Whether audit logging is enabled */
  enabled: boolean;
  /** Maximum entries to retain in memory */
  maxEntries: number;
  /** Retention period in days (0 = forever) */
  retentionDays: number;
  /** Minimum severity to log */
  minSeverity: AuditSeverity;
  /** Whether to enable hash chain integrity */
  enableHashChain: boolean;
  /** Whether to log read operations (verbose) */
  logReads: boolean;
  /** Categories to log (empty = all) */
  categories: AuditCategory[];
  /** Compliance frameworks to tag entries for */
  complianceFrameworks: ComplianceFramework[];
  /** External SIEM webhook URL */
  siemWebhookUrl?: string;
  /** Whether to emit events for real-time monitoring */
  enableRealTimeEvents: boolean;
}

/** Internal state for audit log */
interface AuditLogState {
  /** All audit log entries */
  entries: AuditLogEntry[];
  /** Last entry hash for chain integrity */
  lastHash: string;
  /** Entry count (monotonically increasing, survives trim) */
  totalEntryCount: number;
  /** Severity counters */
  severityCounts: Record<AuditSeverity, number>;
  /** Category counters */
  categoryCounts: Record<string, number>;
  /** Integrity check results */
  lastIntegrityCheck?: {
    timestamp: string;
    valid: boolean;
    entriesChecked: number;
    brokenAt?: number;
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

/**
 * Simple hash function for audit chain integrity.
 * In production, this would use SHA-256 or similar.
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

function categorizeAction(action: string): AuditCategory {
  const prefix = action.split('.')[0];
  const categoryMap: Record<string, AuditCategory> = {
    tenant: 'tenant',
    rbac: 'rbac',
    quota: 'quota',
    sso: 'sso',
    scene: 'scene',
    trait: 'trait',
    export: 'export',
    asset: 'asset',
    user: 'user',
    billing: 'billing',
    system: 'system',
    security: 'security',
  };
  return categoryMap[prefix] || 'system';
}

function inferSeverity(action: string, result: string): AuditSeverity {
  if (result === 'denied') return 'warning';
  if (result === 'error') return 'error';

  // Security-related actions
  if (action.includes('security') || action.includes('breach')) return 'critical';
  if (action.includes('delete') || action.includes('remove')) return 'warning';
  if (action.includes('decommission') || action.includes('suspend')) return 'warning';

  return 'info';
}

// =============================================================================
// AUDIT LOG TRAIT HANDLER
// =============================================================================

export const auditLogHandler: TraitHandler<AuditLogConfig> = {
  name: 'audit_log' as any,

  defaultConfig: {
    tenantId: '',
    enabled: true,
    maxEntries: 100_000,
    retentionDays: 90,
    minSeverity: 'info',
    enableHashChain: true,
    logReads: false,
    categories: [],
    complianceFrameworks: [],
    siemWebhookUrl: undefined,
    enableRealTimeEvents: true,
  },

  onAttach(node, config, context) {
    if (!config.tenantId) {
      context.emit('audit_error', {
        node,
        error: 'TENANT_ID_REQUIRED',
        message: 'Audit log must be associated with a tenant',
      });
      return;
    }

    const state: AuditLogState = {
      entries: [],
      lastHash: '00000000',
      totalEntryCount: 0,
      severityCounts: { info: 0, warning: 0, error: 0, critical: 0 },
      categoryCounts: {},
    };

    (node as any).__auditLogState = state;

    // Log our own initialization
    const initEntry = createAuditEntry(config, state, {
      action: 'audit.initialize',
      category: 'system',
      severity: 'info',
      result: 'success',
      details: {
        maxEntries: config.maxEntries,
        retentionDays: config.retentionDays,
        complianceFrameworks: config.complianceFrameworks,
      },
      actor: { userId: 'system' },
    });
    state.entries.push(initEntry);
  },

  onDetach(node, config, _context) {
    const state = (node as any).__auditLogState as AuditLogState | undefined;
    if (state) {
      // Create final entry
      createAuditEntry(config, state, {
        action: 'audit.teardown',
        category: 'system',
        severity: 'warning',
        result: 'success',
        details: {
          totalEntries: state.totalEntryCount,
          finalEntriesInMemory: state.entries.length,
        },
        actor: { userId: 'system' },
      });
    }
    delete (node as any).__auditLogState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = (node as any).__auditLogState as AuditLogState | undefined;
    if (!state || !config.enabled) return;

    // Trim entries exceeding max
    if (state.entries.length > config.maxEntries) {
      const excess = state.entries.length - config.maxEntries;
      state.entries.splice(0, excess);
    }

    // Enforce retention policy
    if (config.retentionDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - config.retentionDays);
      const cutoffStr = cutoff.toISOString();

      let trimIndex = 0;
      while (trimIndex < state.entries.length && state.entries[trimIndex].timestamp < cutoffStr) {
        trimIndex++;
      }
      if (trimIndex > 0) {
        state.entries.splice(0, trimIndex);
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__auditLogState as AuditLogState | undefined;
    if (!state) return;

    if (event.type === 'audit_log') {
      if (!config.enabled) return;

      const action = (event as any).action as string;
      const details = ((event as any).details as Record<string, unknown>) || {};
      const result = ((event as any).result as string) || 'success';
      const userId = (event as any).userId || (event as any).actorId || 'system';
      const tenantId = (event as any).tenantId || config.tenantId;

      const category = categorizeAction(action);
      const severity = (event as any).severity || inferSeverity(action, result);

      // Check severity filter
      if (SEVERITY_ORDER[severity as AuditSeverity] < SEVERITY_ORDER[config.minSeverity]) {
        return;
      }

      // Check category filter
      if (config.categories.length > 0 && !config.categories.includes(category)) {
        return;
      }

      // Check if this is a read operation
      if (!config.logReads && (action.includes('.read') || action.includes('.view') || action.includes('.query'))) {
        return;
      }

      const entry = createAuditEntry(config, state, {
        action,
        category,
        severity: severity as AuditSeverity,
        result: result as 'success' | 'failure' | 'denied' | 'error',
        details,
        actor: {
          userId,
          role: (event as any).actorRole,
          ipAddress: (event as any).ipAddress,
          sessionId: (event as any).sessionId,
        },
        resource: (event as any).resource,
        tenantId,
      });

      state.entries.push(entry);

      // Real-time event emission
      if (config.enableRealTimeEvents) {
        context.emit('audit_entry_created', {
          node,
          entry,
        });
      }

      // SIEM webhook notification for critical events
      if (config.siemWebhookUrl && severity === 'critical') {
        context.emit('audit_siem_notify', {
          node,
          webhookUrl: config.siemWebhookUrl,
          entry,
        });
      }

      // Critical event alerting
      if (severity === 'critical') {
        context.emit('audit_critical_event', {
          node,
          tenantId,
          entry,
        });
      }
    } else if (event.type === 'audit_query') {
      const query = (event as any) as AuditLogQuery & { queryId?: string };

      let results = [...state.entries];

      // Apply filters
      if (query.tenantId) {
        results = results.filter((e) => e.tenantId === query.tenantId);
      }
      if (query.userId) {
        results = results.filter((e) => e.actor.userId === query.userId);
      }
      if (query.action) {
        results = results.filter((e) => e.action.includes(query.action!));
      }
      if (query.category) {
        results = results.filter((e) => e.category === query.category);
      }
      if (query.minSeverity) {
        const minOrder = SEVERITY_ORDER[query.minSeverity];
        results = results.filter((e) => SEVERITY_ORDER[e.severity] >= minOrder);
      }
      if (query.result) {
        results = results.filter((e) => e.result === query.result);
      }
      if (query.startTime) {
        results = results.filter((e) => e.timestamp >= query.startTime!);
      }
      if (query.endTime) {
        results = results.filter((e) => e.timestamp <= query.endTime!);
      }
      if (query.complianceFramework) {
        results = results.filter(
          (e) => e.complianceTags && e.complianceTags.includes(query.complianceFramework!)
        );
      }

      const total = results.length;
      const offset = query.offset || 0;
      const limit = query.limit || 100;
      results = results.slice(offset, offset + limit);

      context.emit('audit_query_result', {
        node,
        queryId: query.queryId,
        tenantId: config.tenantId,
        entries: results,
        total,
        offset,
        limit,
      });
    } else if (event.type === 'audit_integrity_check') {
      if (!config.enableHashChain) {
        context.emit('audit_integrity_result', {
          node,
          valid: true,
          reason: 'hash_chain_disabled',
          entriesChecked: 0,
        });
        return;
      }

      let valid = true;
      let brokenAt: number | undefined;
      let previousHash = '00000000';

      for (let i = 0; i < state.entries.length; i++) {
        const entry = state.entries[i];
        if (entry.previousHash !== previousHash) {
          valid = false;
          brokenAt = i;
          break;
        }
        previousHash = entry.entryHash || '00000000';
      }

      state.lastIntegrityCheck = {
        timestamp: new Date().toISOString(),
        valid,
        entriesChecked: state.entries.length,
        brokenAt,
      };

      context.emit('audit_integrity_result', {
        node,
        valid,
        entriesChecked: state.entries.length,
        brokenAt,
        timestamp: state.lastIntegrityCheck.timestamp,
      });

      if (!valid) {
        context.emit('audit_log', {
          action: 'security.integrity_violation',
          tenantId: config.tenantId,
          severity: 'critical',
          result: 'error',
          details: { brokenAt, entriesChecked: state.entries.length },
        });
      }
    } else if (event.type === 'audit_stats') {
      context.emit('audit_stats_result', {
        node,
        queryId: (event as any).queryId,
        tenantId: config.tenantId,
        totalEntryCount: state.totalEntryCount,
        currentEntries: state.entries.length,
        severityCounts: { ...state.severityCounts },
        categoryCounts: { ...state.categoryCounts },
        lastIntegrityCheck: state.lastIntegrityCheck,
        oldestEntry: state.entries[0]?.timestamp,
        newestEntry: state.entries[state.entries.length - 1]?.timestamp,
      });
    } else if (event.type === 'audit_export') {
      const format = ((event as any).format as string) || 'json';
      const query = (event as any).query as AuditLogQuery | undefined;

      let entries = state.entries;
      if (query) {
        // Apply same filters as audit_query
        if (query.startTime) entries = entries.filter((e) => e.timestamp >= query.startTime!);
        if (query.endTime) entries = entries.filter((e) => e.timestamp <= query.endTime!);
        if (query.category) entries = entries.filter((e) => e.category === query.category);
        if (query.minSeverity) {
          const minOrder = SEVERITY_ORDER[query.minSeverity];
          entries = entries.filter((e) => SEVERITY_ORDER[e.severity] >= minOrder);
        }
      }

      context.emit('audit_export_result', {
        node,
        queryId: (event as any).queryId,
        tenantId: config.tenantId,
        format,
        entryCount: entries.length,
        data: entries,
      });
      context.emit('audit_log', {
        action: 'audit.export',
        tenantId: config.tenantId,
        details: { format, entryCount: entries.length },
        timestamp: new Date().toISOString(),
      });
    }
  },
};

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function createAuditEntry(
  config: AuditLogConfig,
  state: AuditLogState,
  params: {
    action: string;
    category: AuditCategory;
    severity: AuditSeverity;
    result: 'success' | 'failure' | 'denied' | 'error';
    details: Record<string, unknown>;
    actor: { userId: string; role?: string; ipAddress?: string; sessionId?: string };
    resource?: { type: string; id: string; name?: string };
    tenantId?: string;
  }
): AuditLogEntry {
  state.totalEntryCount++;

  const entryId = `audit_${state.totalEntryCount}_${Date.now()}`;
  const previousHash = state.lastHash;

  const entry: AuditLogEntry = {
    entryId,
    timestamp: new Date().toISOString(),
    tenantId: params.tenantId || config.tenantId,
    actor: params.actor,
    action: params.action,
    category: params.category,
    severity: params.severity,
    resource: params.resource,
    result: params.result,
    details: params.details,
    previousHash: config.enableHashChain ? previousHash : undefined,
    complianceTags:
      config.complianceFrameworks.length > 0 ? [...config.complianceFrameworks] : undefined,
  };

  // Compute hash
  if (config.enableHashChain) {
    const hashInput = `${entryId}:${entry.timestamp}:${entry.action}:${previousHash}`;
    entry.entryHash = simpleHash(hashInput);
    state.lastHash = entry.entryHash;
  }

  // Update counters
  state.severityCounts[params.severity] = (state.severityCounts[params.severity] || 0) + 1;
  state.categoryCounts[params.category] = (state.categoryCounts[params.category] || 0) + 1;

  return entry;
}

export default auditLogHandler;
