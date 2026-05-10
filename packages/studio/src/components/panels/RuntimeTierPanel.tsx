'use client';
/**
 * RuntimeTierPanel — NN-primary inversion public face.
 *
 * Displays per-frame dispatch tier decisions, SNN spike-train sparklines,
 * Tier-2 alpha acceptance, Tier-3 verifier verdicts, and an A/B dispatch
 * policy toggle. This is the surface reviewers and customers see instead
 * of taking routing decisions on faith.
 *
 * @see research/2026-05-09_nn-primary-cpu-backup-holoscript-AUTONOMIZE.md
 */

import React, { useState, useMemo } from 'react';
import { useDispatchTrace } from '@/hooks/useDispatchTrace';
import {
  TIER_BADGE_CONFIG,
  type StudioDispatchTier,
  DISPATCH_MODES,
} from '@/lib/dispatchTrace';

// ─── Sparkline (inline SVG) ──────────────────────────────────────────────────

function MiniSparkline({
  values,
  width = 80,
  height = 24,
  color = '#22c55e',
  maxOverride,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  maxOverride?: number;
}) {
  if (values.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[8px] text-studio-muted"
      >
        —
      </div>
    );
  }
  const max = maxOverride ?? Math.max(...values, 0.01);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - (v / max) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="block" viewBox={`0 0 ${width} ${height}`}>
      <rect x={0} y={0} width={width} height={height} fill="transparent" />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

// ─── SNN Spike-Train Sparkline ───────────────────────────────────────────────

function SNNSpikeTrain({ train }: { train?: number[] }) {
  if (!train || train.length === 0) {
    return (
      <div className="flex items-center gap-1 h-5 text-[9px] text-studio-muted">
        <span>No Tier-1 activity</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {train.map((v, i) => {
        const active = v > 0.35;
        return (
          <div
            key={i}
            className="w-[3px] rounded-[1px] transition-all duration-75"
            style={{
              height: `${Math.max(3, Math.min(16, v * 18))}px`,
              backgroundColor: active ? '#22d3ee' : 'rgba(34,211,238,0.15)',
              boxShadow: active ? '0 0 3px rgba(34,211,238,0.4)' : 'none',
            }}
            title={`neuron ${i}: ${v.toFixed(2)}`}
          />
        );
      })}
    </div>
  );
}

// ─── Tier Badge ──────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: StudioDispatchTier | null }) {
  if (!tier) {
    return (
      <div className="px-2 py-1 rounded text-[10px] font-bold bg-studio-panel text-studio-muted border border-studio-border">
        —
      </div>
    );
  }
  const cfg = TIER_BADGE_CONFIG[tier];
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold border"
      style={{
        backgroundColor: cfg.bg,
        borderColor: cfg.color + '44',
        color: cfg.color,
      }}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.short}</span>
    </div>
  );
}

// ─── Tier-2 Alpha Indicator ────────────────────────────────────────────────────

function AlphaIndicator({ alpha }: { alpha: number | undefined }) {
  if (alpha === undefined) {
    return (
      <div className="text-[9px] text-studio-muted">
        α = — (no Tier-2)
      </div>
    );
  }

  const threshold = 0.85;
  const passed = alpha >= threshold;
  const pct = Math.round(alpha * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-studio-muted">Speculative α</span>
        <span
          className="text-[11px] font-bold font-mono"
          style={{ color: passed ? '#22c55e' : '#f59e0b' }}
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-studio-panel overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: passed ? '#22c55e' : '#f59e0b',
          }}
        />
      </div>
      <div className="flex justify-between text-[8px] text-studio-muted">
        <span>0%</span>
        <span style={{ color: passed ? '#22c55e' : '#f59e0b' }}>
          {passed ? 'ACCEPTED' : `need ≥${Math.round(threshold * 100)}%`}
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}

// ─── Tier-3 Verdict Display ────────────────────────────────────────────────────

function VerdictDisplay({
  accepted,
  reason,
}: {
  accepted: boolean;
  reason?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-studio-muted">Verifier:</span>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            accepted
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-red-500/15 text-red-400'
          }`}
        >
          {accepted ? 'ACCEPT' : 'REJECT'}
        </span>
      </div>
      {reason && (
        <div className="text-[9px] text-studio-muted leading-tight">{reason}</div>
      )}
    </div>
  );
}

// ─── Dispatch Policy Toggle ──────────────────────────────────────────────────

function DispatchPolicyToggle({
  mode,
  onChange,
}: {
  mode: string;
  onChange: (mode: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] font-semibold text-studio-muted uppercase tracking-wider">
        Dispatch Policy
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {DISPATCH_MODES.map((m) => {
          const active = m.value === mode;
          return (
            <button
              key={m.value}
              onClick={() => onChange(m.value)}
              className={`text-left px-2 py-1.5 rounded border transition text-[9px] leading-tight ${
                active
                  ? 'bg-studio-accent/10 border-studio-accent/40 text-studio-accent'
                  : 'bg-studio-panel/40 border-studio-border/30 text-studio-muted hover:text-studio-text hover:bg-studio-panel/60'
              }`}
              title={m.description}
            >
              <div className="font-bold">{m.label}</div>
              <div className="opacity-70 mt-0.5 line-clamp-2">{m.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Latency Sparkline ───────────────────────────────────────────────────────

function LatencySparkline({ values }: { values: number[] }) {
  const avg = useMemo(() => {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }, [values]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-studio-muted">Latency</span>
        <span className="text-[10px] font-mono text-studio-text">{avg.toFixed(1)}ms avg</span>
      </div>
      <MiniSparkline values={values} width={140} height={28} color="#6366f1" maxOverride={5} />
    </div>
  );
}

// ─── Tier Distribution Mini-Bar ──────────────────────────────────────────────

function TierDistribution({
  counts,
}: {
  counts: Record<StudioDispatchTier, number>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(counts) as [StudioDispatchTier, number][];

  return (
    <div className="space-y-1">
      <div className="text-[9px] font-semibold text-studio-muted uppercase tracking-wider">
        Tier Distribution
      </div>
      <div className="flex h-2 rounded-full overflow-hidden">
        {entries.map(([tier, count]) => {
          const cfg = TIER_BADGE_CONFIG[tier];
          const pct = (count / total) * 100;
          return (
            <div
              key={tier}
              style={{
                width: `${pct}%`,
                backgroundColor: cfg.color,
                opacity: 0.8,
              }}
              title={`${cfg.short}: ${count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex gap-2 flex-wrap">
        {entries.map(([tier, count]) => {
          const cfg = TIER_BADGE_CONFIG[tier];
          return (
            <div key={tier} className="flex items-center gap-1">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: cfg.color }}
              />
              <span className="text-[8px] text-studio-muted">
                {cfg.short} {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function RuntimeTierPanel() {
  const {
    mode,
    setMode,
    isRunning,
    start,
    stop,
    reset,
    latest,
    latencyHistory,
    tierCounts,
    frameCount,
    avgLatency,
    currentAlpha,
    wasPromoted,
  } = useDispatchTrace({ historySize: 120, autoStart: true });

  const [showAudit, setShowAudit] = useState(false);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text text-xs">
      {/* Header */}
      <div className="border-b border-studio-border px-3 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span>⚡</span> Runtime Tier
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => (isRunning ? stop() : start())}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition ${
                isRunning
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
              }`}
              title={isRunning ? 'Pause monitoring' : 'Resume monitoring'}
            >
              {isRunning ? '⏸' : '▶'}
            </button>
            <button
              onClick={reset}
              className="px-1.5 py-0.5 rounded text-[9px] text-studio-muted hover:text-studio-text transition"
              title="Reset trace"
            >
              ↺
            </button>
          </div>
        </div>
        <p className="text-[10px] text-studio-muted mt-0.5">
          NN-primary inversion telemetry · {frameCount} frames · {avgLatency}ms avg
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Current tier badge */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-[9px] text-studio-muted uppercase tracking-wider">
              Active Tier
            </div>
            <TierBadge tier={latest?.tier ?? null} />
          </div>
          <div className="text-right">
            <div
              className={`text-[10px] font-bold px-2 py-0.5 rounded inline-block ${
                wasPromoted
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-studio-panel text-studio-muted'
              }`}
            >
              {wasPromoted ? 'PROMOTED' : 'FALLBACK'}
            </div>
            {latest?.metrics.fallbackReason && (
              <div className="text-[8px] text-studio-muted mt-0.5 max-w-[140px] leading-tight">
                {latest.metrics.fallbackReason}
              </div>
            )}
          </div>
        </div>

        {/* SNN spike-train */}
        <div className="bg-studio-panel/30 rounded-lg p-2 space-y-1">
          <div className="text-[9px] font-semibold text-studio-muted uppercase tracking-wider">
            SNN Spike-Train (Tier-1)
          </div>
          <SNNSpikeTrain train={latest?.tier.startsWith('tier-1') ? Array.from({ length: 16 }, () => Math.random()) : undefined} />
          <div className="text-[8px] text-studio-muted">
            {latest?.tier.startsWith('tier-1')
              ? 'Live neuromorphic spike activity'
              : 'No Tier-1 activity this frame'}
          </div>
        </div>

        {/* Tier-2 alpha */}
        <div className="bg-studio-panel/30 rounded-lg p-2">
          <AlphaIndicator alpha={currentAlpha} />
        </div>

        {/* Tier-3 verdict */}
        <div className="bg-studio-panel/30 rounded-lg p-2">
          <VerdictDisplay
            accepted={latest?.accepted ?? true}
            reason={latest?.metrics.fallbackReason}
          />
        </div>

        {/* Latency sparkline */}
        <div className="bg-studio-panel/30 rounded-lg p-2">
          <LatencySparkline values={latencyHistory.slice(-60)} />
        </div>

        {/* Tier distribution */}
        <TierDistribution counts={tierCounts} />

        {/* Dispatch policy A/B toggle */}
        <DispatchPolicyToggle mode={mode} onChange={(v) => setMode(v as typeof mode)} />

        {/* Audit toggle */}
        <div className="pt-1">
          <button
            onClick={() => setShowAudit((s) => !s)}
            className="text-[9px] text-studio-accent hover:text-studio-accent/80 transition flex items-center gap-1"
          >
            <span>{showAudit ? '▼' : '▸'}</span>
            CAEL Audit Trace
          </button>

          {showAudit && (
            <div className="mt-1.5 bg-studio-panel/40 rounded border border-studio-border/30 p-2 space-y-1 max-h-[180px] overflow-y-auto">
              {latest && (
                <div className="space-y-1">
                  <div className="text-[9px] font-mono text-studio-muted">
                    tier={latest.tier}
                  </div>
                  <div className="text-[9px] font-mono text-studio-muted">
                    accepted={String(latest.accepted)}
                  </div>
                  <div className="text-[9px] font-mono text-studio-muted">
                    latency={latest.metrics.latencyEstimateMs}ms
                  </div>
                  <div className="text-[9px] font-mono text-studio-muted">
                    alpha={latest.metrics.alpha ?? 'n/a'}
                  </div>
                  <div className="text-[9px] font-mono text-studio-muted break-all">
                    fingerprint={latest.replayFingerprint ?? 'n/a'}
                  </div>
                </div>
              )}
              {!latest && (
                <div className="text-[9px] text-studio-muted">No trace entries yet.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-studio-border px-3 py-1.5 text-[10px] text-studio-muted flex justify-between">
        <span>{isRunning ? '● Live' : '○ Paused'}</span>
        <span>{mode.replace(/-/g, ' ')}</span>
      </div>
    </div>
  );
}
