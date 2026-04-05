/**
 * DoneLogAuditor tests (FW-0.3)
 *
 * Tests the done-log audit logic: violations, stats, and Team.audit() integration.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  DoneLogAuditor,
  auditDoneLog,
  isLikelyReportEntry,
  isCommitProof,
} from '../board/audit';
import type { DoneLogEntry } from '../board/board-types';
import { Team } from '../team';

// ── Helpers ──

function makeEntry(overrides: Partial<DoneLogEntry> = {}): DoneLogEntry {
  return {
    taskId: `task_${Math.random().toString(36).slice(2, 6)}`,
    title: 'Fix the widget',
    completedBy: 'agent-a',
    commitHash: 'abc1234',
    timestamp: '2026-04-05T10:00:00Z',
    summary: 'Fixed the widget by refactoring X',
    ...overrides,
  };
}

// ── isLikelyReportEntry ──

describe('isLikelyReportEntry', () => {
  it('detects [report] prefix in title', () => {
    expect(isLikelyReportEntry({ title: '[report] Session summary' })).toBe(true);
  });

  it('detects "session end" prefix in summary', () => {
    expect(isLikelyReportEntry({ summary: 'session end — 5 tasks done' })).toBe(true);
  });

  it('returns false for normal entries', () => {
    expect(isLikelyReportEntry({ title: 'Fix bug', summary: 'Refactored code' })).toBe(false);
  });
});

// ── isCommitProof ──

describe('isCommitProof', () => {
  it('accepts valid short hash', () => {
    expect(isCommitProof('abc1234')).toBe(true);
  });

  it('accepts valid full hash', () => {
    expect(isCommitProof('abc1234567890abc1234567890abc1234567890a')).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isCommitProof(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isCommitProof('')).toBe(false);
  });

  it('rejects "none"', () => {
    expect(isCommitProof('none')).toBe(false);
  });

  it('rejects "local-uncommitted"', () => {
    expect(isCommitProof('local-uncommitted')).toBe(false);
  });

  it('rejects non-hex strings', () => {
    expect(isCommitProof('not-a-hash!')).toBe(false);
  });
});

// ── auditDoneLog (backward compat) ──

describe('auditDoneLog', () => {
  it('returns 100% verification for empty log', () => {
    const result = auditDoneLog([]);
    expect(result.total).toBe(0);
    expect(result.health.verificationRate).toBe(100);
  });

  it('counts verified and unverified', () => {
    const entries = [
      makeEntry({ commitHash: 'abc1234' }),
      makeEntry({ commitHash: undefined }),
    ];
    const result = auditDoneLog(entries);
    expect(result.verified).toBe(1);
    expect(result.unverified).toBe(1);
    expect(result.health.verificationRate).toBe(50);
  });

  it('detects duplicate titles', () => {
    const entries = [
      makeEntry({ taskId: 't1', title: 'Same title' }),
      makeEntry({ taskId: 't2', title: 'Same title' }),
    ];
    const result = auditDoneLog(entries);
    expect(result.duplicates).toBe(1);
    expect(result.duplicateTasks[0].title).toBe('Same title');
    expect(result.duplicateTasks[0].count).toBe(2);
  });

  it('excludes report entries from proof requirement', () => {
    const entries = [
      makeEntry({ title: '[report] Session end', commitHash: undefined }),
      makeEntry({ commitHash: 'abc1234' }),
    ];
    const result = auditDoneLog(entries);
    expect(result.nonProofEntries).toBe(1);
    expect(result.proofRequiredTotal).toBe(1);
    expect(result.health.verificationRate).toBe(100);
  });
});

// ── DoneLogAuditor.audit() ──

describe('DoneLogAuditor.audit()', () => {
  it('returns no violations for well-formed entries', () => {
    const entries = [
      makeEntry({ timestamp: '2026-04-05T10:00:00Z' }),
      makeEntry({ timestamp: '2026-04-05T11:00:00Z' }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const violations = auditor.audit();
    expect(violations).toHaveLength(0);
  });

  it('detects missing completedBy', () => {
    const entries = [makeEntry({ completedBy: '' })];
    const auditor = new DoneLogAuditor(entries);
    const violations = auditor.audit();
    expect(violations.some(v => v.rule === 'missing-completedBy')).toBe(true);
  });

  it('detects missing summary', () => {
    const entries = [makeEntry({ summary: '' })];
    const auditor = new DoneLogAuditor(entries);
    const violations = auditor.audit();
    expect(violations.some(v => v.rule === 'missing-summary')).toBe(true);
  });

  it('detects missing commit proof', () => {
    const entries = [makeEntry({ commitHash: undefined })];
    const auditor = new DoneLogAuditor(entries);
    const violations = auditor.audit();
    expect(violations.some(v => v.rule === 'missing-commit')).toBe(true);
  });

  it('detects duplicate taskId entries', () => {
    const entries = [
      makeEntry({ taskId: 'dup-1', timestamp: '2026-04-05T10:00:00Z' }),
      makeEntry({ taskId: 'dup-1', timestamp: '2026-04-05T11:00:00Z' }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const violations = auditor.audit();
    expect(violations.some(v => v.rule === 'duplicate-entry')).toBe(true);
  });

  it('detects non-monotonic timestamps', () => {
    const entries = [
      makeEntry({ taskId: 't1', timestamp: '2026-04-05T12:00:00Z' }),
      makeEntry({ taskId: 't2', timestamp: '2026-04-05T10:00:00Z' }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const violations = auditor.audit();
    expect(violations.some(v => v.rule === 'non-monotonic-timestamp')).toBe(true);
  });

  it('skips report entries from field checks', () => {
    const entries = [
      makeEntry({ title: '[report] Session summary', commitHash: undefined, summary: '' }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const violations = auditor.audit();
    // Report entries should not trigger missing-commit or missing-summary
    expect(violations).toHaveLength(0);
  });
});

// ── DoneLogAuditor.stats() ──

describe('DoneLogAuditor.stats()', () => {
  it('returns zero stats for empty log', () => {
    const auditor = new DoneLogAuditor([]);
    const stats = auditor.stats();
    expect(stats.total).toBe(0);
    expect(stats.byAgent).toHaveLength(0);
    expect(stats.bySource).toHaveLength(0);
    expect(stats.completionOverTime).toHaveLength(0);
  });

  it('groups by agent', () => {
    const entries = [
      makeEntry({ taskId: 't1', completedBy: 'alice' }),
      makeEntry({ taskId: 't2', completedBy: 'alice' }),
      makeEntry({ taskId: 't3', completedBy: 'bob' }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const stats = auditor.stats();
    expect(stats.byAgent).toHaveLength(2);
    const alice = stats.byAgent.find(a => a.agent === 'alice');
    expect(alice?.completed).toBe(2);
    const bob = stats.byAgent.find(a => a.agent === 'bob');
    expect(bob?.completed).toBe(1);
  });

  it('tracks verified vs unverified per agent', () => {
    const entries = [
      makeEntry({ taskId: 't1', completedBy: 'alice', commitHash: 'abc1234' }),
      makeEntry({ taskId: 't2', completedBy: 'alice', commitHash: undefined }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const stats = auditor.stats();
    const alice = stats.byAgent.find(a => a.agent === 'alice');
    expect(alice?.verified).toBe(1);
    expect(alice?.unverified).toBe(1);
  });

  it('detects synthesizer source from taskId', () => {
    const entries = [
      makeEntry({ taskId: 'task_synth_001' }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const stats = auditor.stats();
    expect(stats.bySource.some(s => s.source === 'synthesizer')).toBe(true);
  });

  it('groups completion over time by date', () => {
    const entries = [
      makeEntry({ taskId: 't1', timestamp: '2026-04-05T10:00:00Z' }),
      makeEntry({ taskId: 't2', timestamp: '2026-04-05T14:00:00Z' }),
      makeEntry({ taskId: 't3', timestamp: '2026-04-06T10:00:00Z' }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const stats = auditor.stats();
    expect(stats.completionOverTime).toHaveLength(2);
    expect(stats.completionOverTime[0]).toEqual({ date: '2026-04-05', completed: 2 });
    expect(stats.completionOverTime[1]).toEqual({ date: '2026-04-06', completed: 1 });
  });

  it('sorts agents by completed count descending', () => {
    const entries = [
      makeEntry({ taskId: 't1', completedBy: 'low' }),
      makeEntry({ taskId: 't2', completedBy: 'high' }),
      makeEntry({ taskId: 't3', completedBy: 'high' }),
      makeEntry({ taskId: 't4', completedBy: 'high' }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const stats = auditor.stats();
    expect(stats.byAgent[0].agent).toBe('high');
    expect(stats.byAgent[1].agent).toBe('low');
  });
});

// ── DoneLogAuditor.fullAudit() ──

describe('DoneLogAuditor.fullAudit()', () => {
  it('returns combined audit, violations, and stats', () => {
    const entries = [
      makeEntry({ taskId: 't1', timestamp: '2026-04-05T10:00:00Z' }),
      makeEntry({ taskId: 't2', timestamp: '2026-04-05T11:00:00Z', commitHash: undefined }),
    ];
    const auditor = new DoneLogAuditor(entries);
    const result = auditor.fullAudit();

    // audit (backward compat)
    expect(result.audit.total).toBe(2);
    expect(result.audit.verified).toBe(1);
    expect(result.audit.unverified).toBe(1);

    // violations
    expect(result.violations.some(v => v.rule === 'missing-commit')).toBe(true);

    // stats
    expect(result.stats.total).toBe(2);
  });
});

// ── Team.audit() integration ──

describe('Team.audit()', () => {
  it('audits local done log (empty)', async () => {
    const team = new Team({
      name: 'test-team',
      agents: [],
    });
    const result = await team.audit();
    expect(result.audit.total).toBe(0);
    expect(result.violations).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });

  it('audits remote done log via listBoard', async () => {
    const team = new Team({
      name: 'remote-team',
      agents: [],
      boardUrl: 'https://example.com',
      boardApiKey: 'test-key',
    });

    // Mock fetch for the remote board call
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        board: {
          open: [],
          claimed: [],
          done_log: [
            {
              taskId: 't1',
              title: 'Remote task',
              completedBy: 'remote-agent',
              commitHash: 'abcdef1',
              timestamp: '2026-04-05T10:00:00Z',
              summary: 'Done remotely',
            },
            {
              taskId: 't2',
              title: 'Another remote task',
              completedBy: 'remote-agent',
              timestamp: '2026-04-05T11:00:00Z',
              summary: 'Also done',
            },
          ],
        },
      })),
    );

    const result = await team.audit();
    expect(result.audit.total).toBe(2);
    expect(result.audit.verified).toBe(1);
    expect(result.stats.byAgent).toHaveLength(1);
    expect(result.stats.byAgent[0].agent).toBe('remote-agent');

    fetchSpy.mockRestore();
  });
});
