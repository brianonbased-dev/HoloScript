'use client';

/**
 * GameGateLedgerPanel
 *
 * Right-rail "verify card" for /create?mode=game — the gamedev GATES-ledger view.
 *
 * Displays the derived-gameplay gate status from the most recent
 * POST /api/game/compile, plus the build report (counts, html digest, wall time)
 * and a determinism badge (two identical-config builds → identical html digest).
 *
 * This is a BUILD report with a state digest — NOT a full SimulationContract
 * receipt. The honest framing matches SimRunReportPanel.
 *
 * State comes from useGameState (single source of truth).
 */

import React, { useCallback, useState } from 'react';
import { X, CheckCircle2, XCircle, Copy, Check, Trophy } from 'lucide-react';
import { useGameState } from './useGameState';

function GateRow({ pass, label, detail }: { pass: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {pass ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400 mt-0.5" aria-hidden="true" />
      ) : (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />
      )}
      <div className="flex flex-col min-w-0">
        <span className={`text-[11px] ${pass ? 'text-studio-text' : 'text-amber-400'}`}>{label}</span>
        <span className="text-[10px] text-studio-muted/60 truncate">{detail}</span>
      </div>
    </div>
  );
}

function DigestRow({ digest, copied, onCopy }: { digest: string; copied: boolean; onCopy: () => void }) {
  const truncated = digest.length > 16 ? `${digest.slice(0, 8)}…${digest.slice(-8)}` : digest;
  return (
    <div className="flex items-center justify-between text-[11px] py-1.5">
      <span className="text-studio-muted">HTML digest</span>
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
      {match ? 'Build twice = same HTML digest' : 'Digest changed (source/params modified)'}
    </div>
  );
}

export interface GameGateLedgerPanelProps {
  onClose?: () => void;
}

export function GameGateLedgerPanel({ onClose }: GameGateLedgerPanelProps) {
  const result = useGameState((s) => s.result);
  const lastDigest = useGameState((s) => s.lastDigest);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!result?.report?.htmlDigest) return;
    void navigator.clipboard.writeText(result.report.htmlDigest).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [result]);

  const report = result?.report ?? null;
  const gates = result?.gates ?? [];
  const passCount = gates.filter((g) => g.pass).length;

  const showDeterminismBadge =
    report !== null && lastDigest !== null && report.htmlDigest === lastDigest;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-studio-muted" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-studio-muted">
            Gate Ledger
          </span>
          {gates.length > 0 && (
            <span className="text-[10px] font-mono text-studio-muted/70">
              {passCount}/{gates.length}
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close game gate ledger panel"
            className="rounded p-0.5 text-studio-muted hover:text-studio-text hover:bg-white/[0.06] transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!report ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-8 text-center">
            <Trophy className="h-8 w-8 text-studio-muted/30" aria-hidden="true" />
            <p className="text-[11px] text-studio-muted/60">Build a game to see the gate ledger.</p>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {/* Determinism badge */}
            {showDeterminismBadge && <DeterminismBadge match />}

            {/* Gates */}
            <div className="rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted/70 mb-1">
                Gameplay gates
              </div>
              {gates.map((g) => (
                <GateRow key={g.id} pass={g.pass} label={g.label} detail={g.detail} />
              ))}
            </div>

            {/* Build summary */}
            <div className="rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Title</span>
                <span className="font-mono text-studio-text text-[10px] truncate ml-2">{report.title}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Entities</span>
                <span className="font-mono tabular-nums text-studio-text text-[10px]">
                  {report.collectibles}c · {report.hazards}h · {report.npcs}n · {report.tiers}t
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Time × Hearts</span>
                <span className="font-mono tabular-nums text-studio-text">
                  {report.timeLimit}s × {report.hearts}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">HTML size</span>
                <span className="font-mono tabular-nums text-studio-text">
                  {(report.htmlBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Build time</span>
                <span className="font-mono tabular-nums text-studio-text">
                  {report.wallMs.toFixed(1)} ms
                </span>
              </div>
            </div>

            {/* Digest */}
            <div className="rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-1">
              <DigestRow digest={report.htmlDigest} copied={copied} onCopy={handleCopy} />
            </div>

            <p className="text-[9px] text-studio-muted/40 leading-snug">
              This is a build report with derived-gameplay gates and a state digest — not a full
              SimulationContract receipt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
