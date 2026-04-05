/**
 * Done-Log Audit Logic
 *
 * Absorbed from mcp-server/src/holomesh/http-routes.ts.
 * Verifies commit proof, detects duplicates, calculates verification rate.
 */

import type { DoneLogEntry } from './board-types';

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
  if (['uncommit', 'local-uncommitted', 'local_uncommitted', 'none', 'n/a', 'na'].includes(hash.toLowerCase())) {
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
  const verificationRate = denominator > 0 ? Math.round((verified.length / denominator) * 100) : 100;

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
      message: unverified.length === 0
        ? 'All tasks have commit proof.'
        : `${unverified.length} tasks need verification — missing or invalid commit proof.`,
    },
  };
}
