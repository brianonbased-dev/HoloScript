'use client';

/**
 * SelfImproveRunsPanel — at-a-glance view of autonomous self-improve runs.
 *
 * Surfaces the run receipts persisted by /api/self-improve/status so the
 * founder can perceive the system's continuous self-improvement state without
 * shelling a script (D.081 operate-surface obligation, F.099 show-don't-reference).
 *
 * Displays:
 *  - Pass-rate trend: proposalsPassing / proposalsGenerated across all runs
 *  - Last run: timestamp + abortReason + iteration count + duration
 *  - Recent run history: compact table of the last ~10 runs
 *
 * Hosted on /integrations alongside ConnectorStatusOverview (reuses the same
 * home as requested by the task description).
 *
 * @module integrations/SelfImproveRunsPanel
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, Zap, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

// ─── API response types (mirrors route.ts) ──────────────────────────────────

interface SelfImproveReceipt {
  runAt: string;
  runId: string;
  mode: string;
  abortReason: 'converged' | 'max_iterations' | 'max_failures' | 'no_targets' | null;
  iterations: number;
  proposalsGenerated: number;
  proposalsPassing: number;
  passRate: number | null;
  finalQualityPercent: number | null;
  totalDurationMs: number;
  rootDir?: string;
}

interface RunsSummary {
  totalRuns: number;
  overallPassRate: number | null;
  lastRunAt: string | null;
  lastAbortReason: string | null;
}

interface StatusResponse {
  summary: RunsSummary;
  receipts: SelfImproveReceipt[];
}

// ─── Visual helpers ──────────────────────────────────────────────────────────

const ABORT_LABEL: Record<string, string> = {
  converged: 'converged',
  max_iterations: 'max iter',
  max_failures: 'max fails',
  no_targets: 'no targets',
};

function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function passRateColor(rate: number | null): string {
  if (rate === null) return 'text-studio-muted';
  if (rate >= 0.7) return 'text-emerald-400';
  if (rate >= 0.4) return 'text-amber-300';
  return 'text-rose-400';
}

function AbortBadge({ reason }: { reason: string | null }) {
  if (!reason) return <span className="text-studio-muted text-[10px]">—</span>;
  const isGood = reason === 'converged';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono',
        isGood ? 'bg-emerald-500/20 text-emerald-300' : 'bg-studio-border text-studio-muted'
      )}
    >
      {isGood ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
      {ABORT_LABEL[reason] ?? reason}
    </span>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

const REFRESH_MS = 30_000;

export function SelfImproveRunsPanel() {
  const [summary, setSummary] = useState<RunsSummary | null>(null);
  const [receipts, setReceipts] = useState<SelfImproveReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/self-improve/status?limit=20', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as StatusResponse;
      setSummary(data.summary);
      setReceipts(data.receipts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const lastReceipt = receipts[0] ?? null;
  const hasRuns = (summary?.totalRuns ?? 0) > 0;

  return (
    <section className="border-b border-studio-border bg-studio-bg px-6 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-studio-muted" />
          <div>
            <h2 className="text-sm font-semibold text-studio-text">Self-Improve Runs</h2>
            <p className="text-xs text-studio-muted">
              {hasRuns
                ? `${summary!.totalRuns} run${summary!.totalRuns !== 1 ? 's' : ''} · overall pass-rate: `
                : 'No runs recorded yet — fleet jobs post receipts via POST /api/self-improve/status'}
              {hasRuns && (
                <span className={clsx('font-mono', passRateColor(summary!.overallPassRate))}>
                  {summary!.overallPassRate != null ? `${summary!.overallPassRate}%` : '—'}
                </span>
              )}
              {hasRuns && summary?.lastAbortReason && (
                <>
                  {' · last stop: '}
                  <span className="font-mono">
                    {ABORT_LABEL[summary.lastAbortReason] ?? summary.lastAbortReason}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {summary?.lastRunAt && (
            <span className="text-[11px] text-studio-muted">{timeAgo(summary.lastRunAt)}</span>
          )}
          {hasRuns && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[11px] text-studio-muted underline hover:text-studio-text"
            >
              {expanded ? 'collapse' : 'history'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-studio-border px-2.5 py-1 text-xs text-studio-muted transition-colors hover:text-studio-text disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-400">
          Status fetch failed: {error}
        </div>
      )}

      {/* No-runs placeholder */}
      {!error && !loading && !hasRuns && (
        <div className="text-xs text-studio-muted italic">
          Post a receipt after a run:{' '}
          <code className="rounded bg-studio-border/40 px-1 text-[11px]">
            curl -X POST /api/self-improve/status -d
            &apos;&#123;&quot;proposalsGenerated&quot;:3,...&#125;&apos;
          </code>
        </div>
      )}

      {/* Latest run summary row */}
      {lastReceipt && (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {/* Pass-rate */}
          <div className="flex flex-col rounded-lg border border-studio-border bg-white/[0.02] px-3 py-2">
            <span className={clsx('text-lg font-mono', passRateColor(lastReceipt.passRate))}>
              {lastReceipt.passRate != null ? `${Math.round(lastReceipt.passRate * 100)}%` : '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-studio-muted">
              pass-rate (last)
            </span>
          </div>

          {/* Quality score */}
          <div className="flex flex-col rounded-lg border border-studio-border bg-white/[0.02] px-3 py-2">
            <span
              className={clsx(
                'text-lg font-mono',
                lastReceipt.finalQualityPercent != null
                  ? lastReceipt.finalQualityPercent >= 70
                    ? 'text-emerald-400'
                    : lastReceipt.finalQualityPercent >= 40
                      ? 'text-amber-300'
                      : 'text-rose-400'
                  : 'text-studio-muted'
              )}
            >
              {lastReceipt.finalQualityPercent != null
                ? `${Math.round(lastReceipt.finalQualityPercent)}%`
                : '—'}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-studio-muted">quality</span>
          </div>

          {/* Proposals passing */}
          <div className="flex flex-col rounded-lg border border-studio-border bg-white/[0.02] px-3 py-2">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-mono text-studio-text">
                {lastReceipt.proposalsPassing}
              </span>
              <span className="text-sm text-studio-muted">/ {lastReceipt.proposalsGenerated}</span>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-studio-muted">
              proposals passing
            </span>
          </div>

          {/* Abort reason */}
          <div className="flex flex-col rounded-lg border border-studio-border bg-white/[0.02] px-3 py-2">
            <div className="mt-0.5">
              <AbortBadge reason={lastReceipt.abortReason} />
            </div>
            <span className="text-[10px] uppercase tracking-wide text-studio-muted mt-1">
              stop reason · {fmtDuration(lastReceipt.totalDurationMs)}
            </span>
          </div>
        </div>
      )}

      {/* History table (expandable) */}
      {expanded && receipts.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-studio-border text-left text-[10px] uppercase tracking-wide text-studio-muted">
                <th className="pb-1 pr-3 font-medium">Run</th>
                <th className="pb-1 pr-3 font-medium">Pass-rate</th>
                <th className="pb-1 pr-3 font-medium">Proposals</th>
                <th className="pb-1 pr-3 font-medium">Iters</th>
                <th className="pb-1 pr-3 font-medium">Quality</th>
                <th className="pb-1 pr-3 font-medium">Stop</th>
                <th className="pb-1 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {receipts.slice(0, 15).map((r) => (
                <tr
                  key={r.runId}
                  className="border-b border-studio-border/40 hover:bg-white/[0.01]"
                >
                  <td className="py-1.5 pr-3 text-studio-muted" title={r.runAt}>
                    {timeAgo(r.runAt)}
                  </td>
                  <td className={clsx('py-1.5 pr-3 font-mono', passRateColor(r.passRate))}>
                    {r.passRate != null ? `${Math.round(r.passRate * 100)}%` : '—'}
                  </td>
                  <td className="py-1.5 pr-3 text-studio-text">
                    {r.proposalsPassing !== r.proposalsGenerated ? (
                      <>
                        <span className="text-emerald-400">{r.proposalsPassing}</span>
                        <span className="text-studio-muted">/{r.proposalsGenerated}</span>
                      </>
                    ) : (
                      <span className="text-emerald-400">{r.proposalsPassing}</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-studio-text">{r.iterations}</td>
                  <td className="py-1.5 pr-3 font-mono text-studio-text">
                    {r.finalQualityPercent != null ? `${Math.round(r.finalQualityPercent)}%` : '—'}
                  </td>
                  <td className="py-1.5 pr-3">
                    <AbortBadge reason={r.abortReason} />
                  </td>
                  <td className="py-1.5 font-mono text-studio-muted">
                    {fmtDuration(r.totalDurationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
