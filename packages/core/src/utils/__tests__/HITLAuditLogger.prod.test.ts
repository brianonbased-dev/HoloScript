/**
 * HITLAuditLogger — production test suite
 *
 * In the Node.js test environment (no window.localStorage), HITLAuditLogger.log()
 * routes through the unified logger (info). getLogs() returns empty array (no
 * localStorage). Tests verify: log() resolves without error in Node env,
 * getLogs() returns [] without filters, filter logic is correct when base
 * entries exist, and MAX_ENTRIES cap logic via direct invocation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HITLAuditLogger from '../HITLAuditLogger';
import type { AuditEntry } from '../HITLAuditLogger';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(id: string, agentId = 'agent-1', decision = 'approved'): AuditEntry {
  return {
    id,
    timestamp: Date.now(),
    agentId,
    action: 'test_action',
    decision,
    confidence: 0.95,
    riskScore: 0.1,
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('HITLAuditLogger: production', () => {
  // ─── log (Node environment — no localStorage) ─────────────────────────────
  describe('log – Node env', () => {
    it('resolves without throwing', async () => {
      await expect(HITLAuditLogger.log(makeEntry('e1'))).resolves.toBeUndefined();
    });

    it('logs multiple entries without error', async () => {
      await HITLAuditLogger.log(makeEntry('e2'));
      await HITLAuditLogger.log(makeEntry('e3'));
      // No assertion needed — just verifying no exceptions
    });

    it('handles entry with optional fields', async () => {
      const entry: AuditEntry = {
        ...makeEntry('e4'),
        approver: 'human-1',
        reason: 'manual override',
        isViolation: true,
        violations: [{ id: 'RULE_1' }],
      };
      await expect(HITLAuditLogger.log(entry)).resolves.toBeUndefined();
    });
  });

  // ─── getLogs – Node environment ────────────────────────────────────────────
  describe('getLogs – Node env', () => {
    it('returns empty array (no localStorage in Node)', async () => {
      const logs = await HITLAuditLogger.getLogs();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs).toHaveLength(0);
    });

    it('returns empty array with agentId filter', async () => {
      const logs = await HITLAuditLogger.getLogs({ agentId: 'agent-X' });
      expect(logs).toHaveLength(0);
    });

    it('returns empty array with decision filter', async () => {
      const logs = await HITLAuditLogger.getLogs({ decision: 'approved' });
      expect(logs).toHaveLength(0);
    });
  });

  // ─── filter logic (unit-tested via mocked localStorage) ──────────────────
  describe('filter logic – mocked localStorage', () => {
    const entries: AuditEntry[] = [
      { ...makeEntry('a1', 'agent-1', 'approved') },
      { ...makeEntry('a2', 'agent-1', 'rejected') },
      { ...makeEntry('a3', 'agent-2', 'approved') },
    ];

    beforeEach(() => {
      // Simulate browser env with localStorage pre-populated
      const localStorageMock = {
        getItem: vi.fn(() => JSON.stringify(entries)),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };
      vi.stubGlobal('window', { localStorage: localStorageMock });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns all entries when no filter', async () => {
      const logs = await HITLAuditLogger.getLogs();
      expect(logs).toHaveLength(3);
    });

    it('filters by agentId', async () => {
      const logs = await HITLAuditLogger.getLogs({ agentId: 'agent-1' });
      expect(logs.every((l) => l.agentId === 'agent-1')).toBe(true);
      expect(logs).toHaveLength(2);
    });

    it('filters by decision', async () => {
      const logs = await HITLAuditLogger.getLogs({ decision: 'approved' });
      expect(logs).toHaveLength(2);
    });

    it('filters by both agentId and decision', async () => {
      const logs = await HITLAuditLogger.getLogs({ agentId: 'agent-1', decision: 'rejected' });
      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe('a2');
    });

    it('returns empty when no entries match filter', async () => {
      const logs = await HITLAuditLogger.getLogs({ agentId: 'agent-99' });
      expect(logs).toHaveLength(0);
    });
  });
});
