import { describe, it, expect, beforeEach } from 'vitest';
import { auditLogHandler } from '../AuditLogTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('AuditLogTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const baseCfg = {
    tenantId: 'acme-corp-001',
    enabled: true,
    maxEntries: 1000,
    retentionDays: 90,
    minSeverity: 'info' as const,
    enableHashChain: true,
    logReads: false,
    categories: [] as any[],
    complianceFrameworks: ['soc2' as const],
    enableRealTimeEvents: true,
  };

  beforeEach(() => {
    node = createMockNode('audit-node');
    ctx = createMockContext();
    attachTrait(auditLogHandler, node, baseCfg, ctx);
  });

  // =========================================================================
  // Initialization
  // =========================================================================

  it('initializes with correct state', () => {
    const state = (node as any).__auditLogState;
    expect(state).toBeDefined();
    expect(state.entries.length).toBe(1); // Self-init entry
    expect(state.totalEntryCount).toBe(1);
    expect(state.entries[0].action).toBe('audit.initialize');
  });

  it('rejects without tenantId', () => {
    const n = createMockNode('bad');
    const c = createMockContext();
    attachTrait(auditLogHandler, n, { tenantId: '' }, c);
    expect(getEventCount(c, 'audit_error')).toBe(1);
  });

  // =========================================================================
  // Logging
  // =========================================================================

  it('logs audit events', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: { org: 'Acme' },
      result: 'success',
      userId: 'admin-1',
    });
    const state = (node as any).__auditLogState;
    expect(state.entries.length).toBe(2); // init + new entry
    expect(state.entries[1].action).toBe('tenant.create');
    expect(state.entries[1].actor.userId).toBe('admin-1');
  });

  it('categorizes actions automatically', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'rbac.role.assign',
      details: {},
    });
    const state = (node as any).__auditLogState;
    const entry = state.entries[state.entries.length - 1];
    expect(entry.category).toBe('rbac');
  });

  it('infers severity from action and result', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'scene.delete',
      details: {},
      result: 'success',
    });
    const state = (node as any).__auditLogState;
    const entry = state.entries[state.entries.length - 1];
    expect(entry.severity).toBe('warning'); // delete actions are warnings
  });

  it('respects minimum severity filter', () => {
    const cfg = { ...baseCfg, minSeverity: 'warning' as const };
    const n = createMockNode('min-sev');
    const c = createMockContext();
    attachTrait(auditLogHandler, n, cfg, c);
    sendEvent(auditLogHandler, n, cfg, c, {
      type: 'audit_log',
      action: 'scene.read',
      severity: 'info',
      details: {},
    });
    // Note: logReads is false, but even if it were true, the info severity would be filtered
    const state = (n as any).__auditLogState;
    // Only the init entry should exist
    expect(state.entries.length).toBe(1);
  });

  it('filters reads when logReads is false', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'scene.read',
      details: {},
    });
    const state = (node as any).__auditLogState;
    // Only the init entry
    expect(state.entries.length).toBe(1);
  });

  it('logs reads when logReads is true', () => {
    const cfg = { ...baseCfg, logReads: true };
    const n = createMockNode('log-reads');
    const c = createMockContext();
    attachTrait(auditLogHandler, n, cfg, c);
    sendEvent(auditLogHandler, n, cfg, c, {
      type: 'audit_log',
      action: 'scene.read',
      details: {},
    });
    const state = (n as any).__auditLogState;
    expect(state.entries.length).toBe(2);
  });

  // =========================================================================
  // Hash Chain Integrity
  // =========================================================================

  it('builds hash chain when enabled', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'rbac.role.assign',
      details: {},
    });
    const state = (node as any).__auditLogState;
    const entries = state.entries;
    expect(entries[0].entryHash).toBeDefined();
    expect(entries[1].previousHash).toBe(entries[0].entryHash);
    expect(entries[2].previousHash).toBe(entries[1].entryHash);
  });

  it('passes integrity check on valid chain', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'rbac.role.assign',
      details: {},
    });
    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_integrity_check',
    });
    const result = getLastEvent(ctx, 'audit_integrity_result') as any;
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(3); // init + 2
  });

  it('detects a broken chain link', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    // Break the LINK. This is all the old test did, despite being named for
    // tamper detection: it never modified any entry's content.
    const state = (node as any).__auditLogState;
    state.entries[1].previousHash = 'tampered';
    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_integrity_check',
    });
    const result = getLastEvent(ctx, 'audit_integrity_result') as any;
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.brokenReason).toBe('previous_hash_mismatch');
  });

  // The forgery that passed on the published 8.7.0 package: rewrite who did it
  // and what they did to, leave every chain pointer alone.
  it('detects a rewritten actor and resource with the chain links left intact', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      actor: { userId: 'alice', role: 'viewer' },
      resource: 'tenant/acme',
      details: {},
    });
    const state = (node as any).__auditLogState;
    const target = state.entries[1];
    const linksBefore = state.entries.map((e: any) => [e.previousHash, e.entryHash]);

    target.actor.userId = 'mallory';
    target.actor.role = 'root';
    target.resource = 'DOMAIN-ADMIN';

    // Nothing about the chain pointers changed — only the content did.
    expect(state.entries.map((e: any) => [e.previousHash, e.entryHash])).toEqual(linksBefore);

    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, { type: 'audit_integrity_check' });
    const result = getLastEvent(ctx, 'audit_integrity_result') as any;
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.brokenReason).toBe('entry_content_modified');
  });

  it('detects a changed severity, result or details', () => {
    for (const mutate of [
      (e: any) => (e.severity = 'info'),
      (e: any) => (e.result = 'success'),
      (e: any) => (e.details = { amount: 1_000_000 }),
      (e: any) => (e.timestamp = '2020-01-01T00:00:00.000Z'),
    ]) {
      const local = createMockNode('audit-node-mutate');
      attachTrait(auditLogHandler, local, baseCfg, ctx);
      sendEvent(auditLogHandler, local, baseCfg, ctx, {
        type: 'audit_log',
        action: 'tenant.create',
        severity: 'critical',
        result: 'failure',
        details: { amount: 1 },
      });
      mutate((local as any).__auditLogState.entries[1]);
      ctx.clearEvents();
      sendEvent(auditLogHandler, local, baseCfg, ctx, { type: 'audit_integrity_check' });
      const result = getLastEvent(ctx, 'audit_integrity_result') as any;
      expect(result.valid).toBe(false);
      expect(result.brokenReason).toBe('entry_content_modified');
    }
  });

  it('uses a real SHA-256 digest, not the old 31-bit hash', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    const state = (node as any).__auditLogState;
    expect(state.entries[1].entryHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('reports an unverified chain as not valid, never as valid', () => {
    const offCfg = { ...baseCfg, enableHashChain: false };
    const local = createMockNode('audit-node-chain-off');
    attachTrait(auditLogHandler, local, offCfg, ctx);
    sendEvent(auditLogHandler, local, offCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    ctx.clearEvents();
    sendEvent(auditLogHandler, local, offCfg, ctx, { type: 'audit_integrity_check' });
    const result = getLastEvent(ctx, 'audit_integrity_result') as any;
    expect(result.valid).toBe(false);
    expect(result.unverified).toBe(true);
    expect(result.reason).toBe('hash_chain_disabled');
  });

  // =========================================================================
  // Compliance Tags
  // =========================================================================

  it('tags entries with compliance frameworks', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    const state = (node as any).__auditLogState;
    const entry = state.entries[state.entries.length - 1];
    expect(entry.complianceTags).toContain('soc2');
  });

  // =========================================================================
  // Querying
  // =========================================================================

  it('queries audit log with filters', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
      userId: 'admin-1',
    });
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'rbac.role.assign',
      details: {},
      userId: 'admin-2',
    });
    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_query',
      queryId: 'q1',
      userId: 'admin-1',
      limit: 10,
    });
    const result = getLastEvent(ctx, 'audit_query_result') as any;
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].actor.userId).toBe('admin-1');
  });

  it('queries by category', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'rbac.role.assign',
      details: {},
    });
    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_query',
      queryId: 'q2',
      category: 'rbac',
      limit: 10,
    });
    const result = getLastEvent(ctx, 'audit_query_result') as any;
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].category).toBe('rbac');
  });

  it('supports pagination', () => {
    for (let i = 0; i < 5; i++) {
      sendEvent(auditLogHandler, node, baseCfg, ctx, {
        type: 'audit_log',
        action: `scene.update.${i}`,
        details: { index: i },
        severity: 'warning',
      });
    }
    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_query',
      queryId: 'page1',
      limit: 2,
      offset: 0,
    });
    const page1 = getLastEvent(ctx, 'audit_query_result') as any;
    expect(page1.entries.length).toBe(2);
    expect(page1.total).toBe(6); // 1 init + 5 added

    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_query',
      queryId: 'page2',
      limit: 2,
      offset: 2,
    });
    const page2 = getLastEvent(ctx, 'audit_query_result') as any;
    expect(page2.entries.length).toBe(2);
  });

  // =========================================================================
  // Statistics
  // =========================================================================

  it('returns audit statistics', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'scene.delete',
      details: {},
    });
    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_stats',
      queryId: 'stats1',
    });
    const stats = getLastEvent(ctx, 'audit_stats_result') as any;
    expect(stats.totalEntryCount).toBe(3);
    expect(stats.currentEntries).toBe(3);
    expect(stats.severityCounts.info).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // Export
  // =========================================================================

  it('exports audit log data', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    ctx.clearEvents();
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_export',
      queryId: 'exp1',
      format: 'json',
    });
    const result = getLastEvent(ctx, 'audit_export_result') as any;
    expect(result.format).toBe('json');
    expect(result.entryCount).toBeGreaterThanOrEqual(2);
  });

  // =========================================================================
  // Real-time Events
  // =========================================================================

  it('emits real-time events when enabled', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'tenant.create',
      details: {},
    });
    expect(getEventCount(ctx, 'audit_entry_created')).toBe(1);
  });

  it('emits critical event alerts', () => {
    sendEvent(auditLogHandler, node, baseCfg, ctx, {
      type: 'audit_log',
      action: 'security.breach',
      details: {},
      severity: 'critical',
    });
    expect(getEventCount(ctx, 'audit_critical_event')).toBe(1);
  });

  // =========================================================================
  // Detach
  // =========================================================================

  it('cleans up on detach', () => {
    auditLogHandler.onDetach?.(
      node as any,
      { ...auditLogHandler.defaultConfig, ...baseCfg },
      ctx as any
    );
    expect((node as any).__auditLogState).toBeUndefined();
  });
});
