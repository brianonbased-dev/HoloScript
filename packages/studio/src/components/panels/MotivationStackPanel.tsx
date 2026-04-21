'use client';

/**
 * MotivationStackPanel — stacked reward / motivation signals for agent monitoring.
 *
 * Each row shows a normalized scalar with provenance (source) so reward debugging
 * does not depend on log archaeology. Props-driven for later wiring to live telemetry.
 */

import React, { useMemo } from 'react';
import clsx from 'clsx';

export type MotivationSignalKind = 'intrinsic' | 'extrinsic' | 'social';

export interface MotivationSignal {
  id: string;
  label: string;
  /** 0..1 normalized strength */
  value: number;
  /** Subsystem or trait that emitted the scalar (e.g. trait:vrt.reward) */
  source?: string;
  kind?: MotivationSignalKind;
}

const KIND_STYLES: Record<MotivationSignalKind, { bar: string; dot: string }> = {
  intrinsic: { bar: 'from-emerald-500/70 to-emerald-400/30', dot: 'bg-emerald-400' },
  extrinsic: { bar: 'from-amber-500/70 to-amber-400/30', dot: 'bg-amber-400' },
  social: { bar: 'from-violet-500/70 to-violet-400/30', dot: 'bg-violet-400' },
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export interface MotivationStackPanelProps {
  signals: MotivationSignal[];
  /** Optional title override */
  title?: string;
  className?: string;
}

export function MotivationStackPanel({
  signals,
  title = 'Motivation stack',
  className,
}: MotivationStackPanelProps) {
  const sorted = useMemo(
    () =>
      [...signals].sort(
        (a, b) => clamp01(b.value) - clamp01(a.value) || a.label.localeCompare(b.label)
      ),
    [signals]
  );

  return (
    <div
      className={clsx('space-y-2 rounded-lg border border-studio-border/60 bg-studio-panel/20 p-2', className)}
      role="region"
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold text-studio-text">{title}</h4>
        <span className="text-[9px] text-studio-muted tabular-nums">{sorted.length} signals</span>
      </div>

      {sorted.length === 0 ? (
        <p className="py-2 text-center text-[10px] text-studio-muted">No motivation signals.</p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((s) => {
            const v = clamp01(s.value);
            const kind = s.kind ?? 'intrinsic';
            const styles = KIND_STYLES[kind] ?? KIND_STYLES.intrinsic;
            return (
              <li key={s.id} className="space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-studio-text">
                    <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', styles.dot)} title={kind} />
                    <span className="truncate font-medium">{s.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-studio-muted">{(v * 100).toFixed(0)}%</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded bg-studio-panel/50"
                  title={`${s.label}: ${v.toFixed(3)}`}
                >
                  <div
                    className={clsx(
                      'h-full rounded bg-gradient-to-r transition-[width] duration-300 ease-out',
                      styles.bar
                    )}
                    style={{ width: `${v * 100}%` }}
                  />
                </div>
                {s.source ? (
                  <div className="truncate font-mono text-[9px] text-studio-muted/90" title={s.source}>
                    {s.source}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Demo defaults aligned with SDT-style monitoring (static seed; callers may perturb). */
export const MOTIVATION_STACK_DEMO: MotivationSignal[] = [
  {
    id: 'autonomy',
    label: 'Autonomy / goal choice',
    value: 0.72,
    source: 'trait:planner.goal_select',
    kind: 'intrinsic',
  },
  {
    id: 'competence',
    label: 'Competence / verifiable progress',
    value: 0.65,
    source: 'world:task_completion',
    kind: 'intrinsic',
  },
  {
    id: 'extrinsic',
    label: 'Extrinsic / board priority',
    value: 0.55,
    source: 'holomesh:prioritySortKey',
    kind: 'extrinsic',
  },
  {
    id: 'relatedness',
    label: 'Relatedness / team visibility',
    value: 0.41,
    source: 'holomesh:presence',
    kind: 'social',
  },
  {
    id: 'novelty',
    label: 'Novelty / information gain',
    value: 0.38,
    source: 'absorb:graph_delta',
    kind: 'intrinsic',
  },
];
