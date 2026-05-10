'use client';
/**
 * DispatchTraceCAELPanel — Render dispatch trace through the CAEL viewer.
 *
 * Consumes dispatch.decision events from the Studio bus, formats them as
 * CAEL-compatible trace entries, and renders a legible audit table so
 * reviewers can see the routing decision chain without reading code.
 *
 * This component is intended to be mounted inside the RuntimeTierPanel
 * audit view or standalone in a diagnostics context.
 *
 * @see useStudioCAELSession — the CAEL session hook that records ui.* events
 * @see useDispatchTrace — the hook that emits dispatch.decision bus events
 */

import React, { useEffect, useRef, useState } from 'react';
import { useStudioBus } from '@/hooks/useStudioBus';
import {
  TIER_BADGE_CONFIG,
  type StudioDispatchTier,
  type StudioDispatchDecision,
} from '@/lib/dispatchTrace';

interface CAELTraceRow {
  frame: number;
  timestamp: number;
  tier: StudioDispatchTier;
  accepted: boolean;
  latencyMs: number;
  alpha?: number | null;
  mode: string;
  reason?: string | null;
  fingerprint?: string | null;
}

const MAX_ROWS = 200;

export function DispatchTraceCAELPanel() {
  const { on } = useStudioBus();
  const [rows, setRows] = useState<CAELTraceRow[]>([]);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<CAELTraceRow[]>([]);

  useEffect(() => {
    const unsub = on('dispatch.decision', (data: unknown) => {
      if (paused) return;
      const d = data as Record<string, unknown>;
      const row: CAELTraceRow = {
        frame: typeof d.frame === 'number' ? d.frame : 0,
        timestamp: Date.now(),
        tier: String(d.tier) as StudioDispatchTier,
        accepted: Boolean(d.accepted),
        latencyMs: typeof d.latencyMs === 'number' ? d.latencyMs : 0,
        alpha: d.alpha === null ? undefined : typeof d.alpha === 'number' ? d.alpha : undefined,
        mode: String(d.mode ?? 'unknown'),
        reason: d.fallbackReason === null ? undefined : String(d.fallbackReason ?? ''),
        fingerprint: d.fingerprint === null ? undefined : String(d.fingerprint ?? ''),
      };

      rowsRef.current.push(row);
      if (rowsRef.current.length > MAX_ROWS) {
        rowsRef.current.shift();
      }
      setRows(rowsRef.current.slice());
    });
    return unsub;
  }, [on, paused]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rows.length]);

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>🔗</span> Dispatch CAEL Trace
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaused((p) => !p)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition ${
              paused
                ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
            }`}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? '▶' : '⏸'}
          </button>
          <button
            onClick={() => {
              rowsRef.current = [];
              setRows([]);
            }}
            className="px-1.5 py-0.5 rounded text-[9px] text-studio-muted hover:text-studio-text transition"
            title="Clear"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Trace table */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <table className="w-full text-[9px]">
          <thead className="sticky top-0 bg-studio-panel z-10">
            <tr className="border-b border-studio-border text-studio-muted text-left">
              <th className="px-2 py-1 font-semibold">#F</th>
              <th className="px-2 py-1 font-semibold">Tier</th>
              <th className="px-2 py-1 font-semibold">Status</th>
              <th className="px-2 py-1 font-semibold">Latency</th>
              <th className="px-2 py-1 font-semibold">α</th>
              <th className="px-2 py-1 font-semibold">Mode</th>
              <th className="px-2 py-1 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-studio-muted">
                  No dispatch trace entries yet.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const cfg = TIER_BADGE_CONFIG[r.tier];
              return (
                <tr
                  key={`${r.frame}-${i}`}
                  className="border-b border-studio-border/30 hover:bg-studio-panel/40 transition"
                >
                  <td className="px-2 py-1 font-mono text-studio-muted">{r.frame}</td>
                  <td className="px-2 py-1">
                    <span
                      className="inline-flex items-center gap-1 px-1 rounded text-[8px] font-bold"
                      style={{ backgroundColor: cfg.bg, color: cfg.color }}
                    >
                      <span>{cfg.icon}</span>
                      <span>{cfg.short}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <span
                      className={`text-[8px] font-bold px-1 rounded ${
                        r.accepted
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {r.accepted ? 'ACCEPT' : 'REJECT'}
                    </span>
                  </td>
                  <td className="px-2 py-1 font-mono text-studio-muted">
                    {r.latencyMs.toFixed(1)}ms
                  </td>
                  <td className="px-2 py-1 font-mono">
                    {typeof r.alpha === 'number' ? `${Math.round(r.alpha * 100)}%` : '—'}
                  </td>
                  <td className="px-2 py-1 text-studio-muted">{r.mode}</td>
                  <td
                    className="px-2 py-1 text-studio-muted max-w-[120px] truncate"
                    title={r.reason ?? ''}
                  >
                    {r.reason || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-studio-border px-3 py-1.5 text-[10px] text-studio-muted flex justify-between">
        <span>{rows.length} entries · max {MAX_ROWS}</span>
        <span>{paused ? '⏸ Paused' : '● Live'}</span>
      </div>
    </div>
  );
}
