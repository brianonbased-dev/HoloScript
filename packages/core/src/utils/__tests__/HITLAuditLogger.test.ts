import { describe, it, expect } from 'vitest';
import { HITLAuditLogger, AuditEntry } from '../HITLAuditLogger';

/**
 * Helper to build a minimal audit entry.
 */
function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'entry-1',
    timestamp: Date.now(),
    agentId: 'agent-a',
    action: 'deploy',
    decision: 'approved',
    confidence: 0.95,
    riskScore: 0.1,
    ...overrides,
  };
}

describe('HITLAuditLogger', () => {
  // =========== log (Node environment — no window) ===========

  it('log does not throw in Node environment', async () => {
    await expect(HITLAuditLogger.log(makeEntry())).resolves.toBeUndefined();
  });

  it('log with isViolation flag succeeds', async () => {
    await expect(
      HITLAuditLogger.log(makeEntry({ isViolation: true, violations: [{ rule: 'safety' }] }))
    ).resolves.toBeUndefined();
  });

  it('log with optional fields succeeds', async () => {
    await expect(
      HITLAuditLogger.log(makeEntry({ approver: 'human-1', reason: 'manual override' }))
    ).resolves.toBeUndefined();
  });

  // =========== getLogs (Node env — no localStorage) ===========

  it('getLogs returns empty array in Node environment', async () => {
    const logs = await HITLAuditLogger.getLogs();
    expect(logs).toEqual([]);
  });

  it('getLogs with agentId filter returns empty in Node', async () => {
    const logs = await HITLAuditLogger.getLogs({ agentId: 'agent-a' });
    expect(logs).toEqual([]);
  });

  it('getLogs with decision filter returns empty in Node', async () => {
    const logs = await HITLAuditLogger.getLogs({ decision: 'denied' });
    expect(logs).toEqual([]);
  });

  it('getLogs with both filters returns empty in Node', async () => {
    const logs = await HITLAuditLogger.getLogs({ agentId: 'x', decision: 'approved' });
    expect(logs).toEqual([]);
  });

  // =========== AuditEntry shape ===========

  it('AuditEntry interface satisfies required fields', () => {
    const entry = makeEntry();
    expect(entry.id).toBe('entry-1');
    expect(entry.agentId).toBe('agent-a');
    expect(entry.action).toBe('deploy');
    expect(entry.decision).toBe('approved');
    expect(entry.confidence).toBe(0.95);
    expect(entry.riskScore).toBe(0.1);
  });

  it('AuditEntry optional fields are accessible', () => {
    const entry = makeEntry({ approver: 'admin', reason: 'policy', isViolation: false });
    expect(entry.approver).toBe('admin');
    expect(entry.reason).toBe('policy');
    expect(entry.isViolation).toBe(false);
  });

  // =========== STORAGE_KEY and MAX_ENTRIES constants ===========

  it('STORAGE_KEY is holoscript_hitl_audit_log', () => {
    // Access the private static via bracket notation
    expect((HITLAuditLogger as any).STORAGE_KEY).toBe('holoscript_hitl_audit_log');
  });

  it('MAX_ENTRIES is 1000', () => {
    expect((HITLAuditLogger as any).MAX_ENTRIES).toBe(1000);
  });
});
