'use client';

/**
 * SimRunReportPanel
 *
 * Right-rail panel for /create?mode=sim.
 *
 * Displays the run report from the most recent POST /api/simulation/run:
 *   - solver, steps × dt, wall time, field names
 *   - numeric stats (filtered to numbers)
 *   - finalStateDigest (truncated) with copy button
 *   - determinism badge: shown when two consecutive identical-config runs match digests
 *
 * Labelled "RUN REPORT" — not a contract receipt.
 * State comes from useSimState (single source of truth).
 */

import React, { useCallback, useState } from 'react';
import { X, CheckCircle2, Copy, Check, Beaker } from 'lucide-react';
import { useSimState } from './useSimState';

// ── Sub-components ────────────────────────────────────────────────────────────

function DigestRow({ digest, copied, onCopy }: { digest: string; copied: boolean; onCopy: () => void }) {
  const truncated = digest.length > 16 ? `${digest.slice(0, 8)}…${digest.slice(-8)}` : digest;
  return (
    <div className="flex items-center justify-between text-[11px] py-1.5">
      <span className="text-studio-muted">State digest</span>
      <div className="flex items-center gap-1">
        <span className="font-mono tabular-nums text-studio-text/80 text-[10px]">{truncated}</span>
        <button
          onClick={onCopy}
          title={copied ? 'Copied!' : 'Copy full digest'}
          aria-label={copied ? 'Digest copied' : 'Copy digest'}
          className="rounded p-0.5 text-studio-muted hover:text-studio-text hover:bg-white/[0.06] transition"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-400" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function DeterminismBadge({ match }: { match: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
        match
          ? 'bg-green-500/10 text-green-400 border-green-500/20'
          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      }`}
    >
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {match ? 'Run twice = same digest' : 'Digest changed (config modified)'}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SimRunReportPanelProps {
  onClose?: () => void;
}

export function SimRunReportPanel({ onClose }: SimRunReportPanelProps) {
  const result = useSimState((s) => s.result);
  const lastDigest = useSimState((s) => s.lastDigest);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!result?.runReport?.finalStateDigest) return;
    void navigator.clipboard.writeText(result.runReport.finalStateDigest).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [result]);

  const report = result?.runReport ?? null;

  // Numeric stats only — filter out strings, arrays, objects
  const numericStats: Array<[string, number]> = result?.stats
    ? (Object.entries(result.stats).filter(
        (entry): entry is [string, number] => {
          const v = entry[1];
          return typeof v === 'number' && Number.isFinite(v);
        }
      ))
    : [];

  // Determinism: two runs with the same digest means the result matched the previous
  const showDeterminismBadge =
    report !== null &&
    lastDigest !== null &&
    report.finalStateDigest === lastDigest;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Beaker className="h-3.5 w-3.5 text-studio-muted" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-studio-muted">
            Run Report
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close sim run report panel"
            className="rounded p-0.5 text-studio-muted hover:text-studio-text hover:bg-white/[0.06] transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!report ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-8 text-center">
            <Beaker className="h-8 w-8 text-studio-muted/30" aria-hidden="true" />
            <p className="text-[11px] text-studio-muted/60">
              Run a simulation to see the report.
            </p>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {/* Determinism badge — only shown when two consecutive runs match */}
            {showDeterminismBadge && <DeterminismBadge match />}

            {/* Run summary */}
            <div className="rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Solver</span>
                <span className="font-mono text-studio-text text-[10px]">{report.solver}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Steps × Δt</span>
                <span className="font-mono tabular-nums text-studio-text">
                  {report.steps} × {report.dt}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Wall time</span>
                <span className="font-mono tabular-nums text-studio-text">
                  {report.wallMs.toFixed(1)} ms
                </span>
              </div>
              {report.fieldNames.length > 0 && (
                <div className="flex items-start justify-between text-[11px]">
                  <span className="text-studio-muted shrink-0">Fields</span>
                  <span className="font-mono text-studio-text text-[10px] text-right">
                    {report.fieldNames.join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Numeric stats */}
            {numericStats.length > 0 && (
              <div className="rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-2 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted/70 mb-1">
                  Stats
                </div>
                {numericStats.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-[11px]">
                    <span className="text-studio-muted">{key}</span>
                    <span className="font-mono tabular-nums text-studio-text">
                      {Math.abs(value) < 0.001 || Math.abs(value) >= 1e6
                        ? value.toExponential(3)
                        : value.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Digest */}
            <div className="rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-1">
              <DigestRow digest={report.finalStateDigest} copied={copied} onCopy={handleCopy} />
            </div>

            <p className="text-[9px] text-studio-muted/40 leading-snug">
              This is a run report with a state digest — not a SimulationContract receipt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
