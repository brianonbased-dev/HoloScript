/**
 * Done-Log Audit Logic (FW-0.3)
 *
 * Absorbed from mcp-server/src/holomesh/http-routes.ts.
 * Verifies commit proof, detects duplicates, checks monotonic timestamps,
 * and provides per-agent/per-source statistics.
 *
 * Two APIs:
 * - `auditDoneLog(entries)` — the original function (unchanged signature)
 * - `DoneLogAuditor` class — richer audit with stats, violations, and Team integration
 */

import type { DoneLogEntry } from './board-types';

// ── Types ──

export interface AuditResult {
  total: number;
  proofRequiredTotal: number;
  nonProofEntries: number;
  verified: number;
  unverified: number;
  duplicates: number;
  unverifiedTasks: Array<{
    taskId: string;
    title: string;
    completedBy: string;
    summary: string;
    timestamp: string;
  }>;
  duplicateTasks: Array<{ title: string; count: number }>;
  health: {
    verificationRate: number;
    message: string;
  };
}

/** A single violation found by the auditor. */
export interface AuditViolation {
  /** Which check produced this violation. */
  rule:
    | 'missing-completedBy'
    | 'missing-summary'
    | 'missing-commit'
    | 'duplicate-entry'
    | 'non-monotonic-timestamp';
  /** Human-readable description. */
  message: string;
  /** The entry that triggered the violation. */
  entry: DoneLogEntry;
}

/** Per-agent completion statistics. */
export interface AgentStats {
  agent: string;
  completed: number;
  verified: number;
  unverified: number;
}

/** Per-source completion statistics. */
export interface SourceStats {
  source: string;
  completed: number;
}

/** Completion rate bucket for a time period. */
export interface CompletionBucket {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  completed: number;
}

/** Full statistics from DoneLogAuditor.stats(). */
export interface DoneLogStats {
  total: number;
  byAgent: AgentStats[];
  bySource: SourceStats[];
  completionOverTime: CompletionBucket[];
}

/** Combined audit + stats result from DoneLogAuditor. */
export interface FullAuditResult {
  /** Original AuditResult (backward compatible). */
  audit: AuditResult;
  /** Structural violations (missing fields, duplicates, non-monotonic). */
  violations: AuditViolation[];
  /** Statistics breakdown. */
  stats: DoneLogStats;
}

// ── Helper Functions ──

/** Check if a done-log entry is a report/session summary (not real task work). */
export function isLikelyReportEntry(entry: { title?: string; summary?: string }): boolean {
  const title = (entry.title || '').toLowerCase();
  const summary = (entry.summary || '').toLowerCase();
  return title.startsWith('[report]') || summary.startsWith('session end');
}

/** Check if a commit hash looks like real git proof. */
export function isCommitProof(commitHash?: string): boolean {
  if (!commitHash) return false;
  const hash = commitHash.trim();
  if (!hash) return false;
  if (
    ['uncommit', 'local-uncommitted', 'local_uncommitted', 'none', 'n/a', 'na'].includes(
      hash.toLowerCase()
    )
  ) {
    return false;
  }
  return /^[0-9a-f]{7,40}$/i.test(hash);
}

/** Audit a done log: verify commits, find duplicates, calculate health. */
export function auditDoneLog(doneLog: DoneLogEntry[]): AuditResult {
  const proofRequired = doneLog.filter((e) => !isLikelyReportEntry(e));
  const nonProofEntries = doneLog.filter((e) => isLikelyReportEntry(e));

  const verified = proofRequired.filter((e) => isCommitProof(e.commitHash));
  const unverified = proofRequired.filter((e) => !isCommitProof(e.commitHash));

  const duplicateMap = new Map<string, number>();
  for (const e of doneLog) {
    duplicateMap.set(e.title, (duplicateMap.get(e.title) || 0) + 1);
  }
  const duped = [...duplicateMap.entries()]
    .filter(([, count]) => count > 1)
    .map(([title, count]) => ({ title, count }));

  const denominator = proofRequired.length;
  const verificationRate =
    denominator > 0 ? Math.round((verified.length / denominator) * 100) : 100;

  return {
    total: doneLog.length,
    proofRequiredTotal: proofRequired.length,
    nonProofEntries: nonProofEntries.length,
    verified: verified.length,
    unverified: unverified.length,
    duplicates: duped.length,
    unverifiedTasks: unverified.map((e) => ({
      taskId: e.taskId,
      title: e.title,
      completedBy: e.completedBy,
      summary: e.summary,
      timestamp: e.timestamp,
    })),
    duplicateTasks: duped,
    health: {
      verificationRate,
      message:
        unverified.length === 0
          ? 'All tasks have commit proof.'
          : `${unverified.length} tasks need verification — missing or invalid commit proof.`,
    },
  };
}

// ── DoneLogAuditor Class ──

/**
 * Stateless auditor that inspects a done-log for structural violations
 * and computes aggregate statistics. Designed for Team.audit() integration.
 */
export class DoneLogAuditor {
  constructor(private readonly entries: DoneLogEntry[]) {}

  /**
   * Run all audit checks and return violations.
   *
   * Checks:
   * 1. Every done task has completedBy, summary, and commit proof
   * 2. No duplicate entries (by taskId)
   * 3. Timestamps are monotonically increasing
   */
  audit(): AuditViolation[] {
    const violations: AuditViolation[] = [];

    const seenIds = new Map<string, DoneLogEntry>();

    let prevTimestamp = '';

    for (const entry of this.entries) {
      // Skip report entries — they don't need the same rigor
      if (isLikelyReportEntry(entry)) continue;

      // Check required fields
      if (!entry.completedBy) {
        violations.push({
          rule: 'missing-completedBy',
          message: `Task "${entry.title}" (${entry.taskId}) has no completedBy field.`,
          entry,
        });
      }

      if (!entry.summary) {
        violations.push({
          rule: 'missing-summary',
          message: `Task "${entry.title}" (${entry.taskId}) has no summary.`,
          entry,
        });
      }

      if (!isCommitProof(entry.commitHash)) {
        violations.push({
          rule: 'missing-commit',
          message: `Task "${entry.title}" (${entry.taskId}) has no valid commit proof.`,
          entry,
        });
      }

      // Duplicate check by taskId
      if (seenIds.has(entry.taskId)) {
        violations.push({
          rule: 'duplicate-entry',
          message: `Task "${entry.title}" (${entry.taskId}) appears more than once in the done log.`,
          entry,
        });
      } else {
        seenIds.set(entry.taskId, entry);
      }

      // Monotonic timestamp check
      if (prevTimestamp && entry.timestamp < prevTimestamp) {
        violations.push({
          rule: 'non-monotonic-timestamp',
          message: `Task "${entry.title}" (${entry.taskId}) timestamp ${entry.timestamp} is before previous ${prevTimestamp}.`,
          entry,
        });
      }
      prevTimestamp = entry.timestamp;
    }

    return violations;
  }

  /** Get aggregate statistics over the done log. */
  stats(): DoneLogStats {
    // By agent
    const agentMap = new Map<string, { completed: number; verified: number; unverified: number }>();
    for (const entry of this.entries) {
      const agent = entry.completedBy || 'unknown';
      const existing = agentMap.get(agent) ?? { completed: 0, verified: 0, unverified: 0 };
      existing.completed++;
      if (isCommitProof(entry.commitHash)) {
        existing.verified++;
      } else {
        existing.unverified++;
      }
      agentMap.set(agent, existing);
    }

    // By source — extract source prefix from taskId (e.g., "task_synth_" → "synthesizer")
    const sourceMap = new Map<string, number>();
    for (const entry of this.entries) {
      // Best-effort source detection from summary or taskId pattern
      let source = 'manual';
      if (entry.taskId.includes('synth')) source = 'synthesizer';
      else if (entry.summary?.includes('scout')) source = 'scout';
      else if (entry.summary?.includes('derive')) source = 'derive';
      sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);
    }

    // Completion over time (by date)
    const dateMap = new Map<string, number>();
    for (const entry of this.entries) {
      const date = entry.timestamp.slice(0, 10); // YYYY-MM-DD
      dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
    }

    return {
      total: this.entries.length,
      byAgent: Array.from(agentMap.entries())
        .map(([agent, s]) => ({ agent, ...s }))
        .sort((a, b) => b.completed - a.completed),
      bySource: Array.from(sourceMap.entries())
        .map(([source, completed]) => ({ source, completed }))
        .sort((a, b) => b.completed - a.completed),
      completionOverTime: Array.from(dateMap.entries())
        .map(([date, completed]) => ({ date, completed }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /** Run full audit: original AuditResult + violations + stats. */
  fullAudit(): FullAuditResult {
    return {
      audit: auditDoneLog(this.entries),
      violations: this.audit(),
      stats: this.stats(),
    };
  }
}
