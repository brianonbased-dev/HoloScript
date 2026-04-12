'use client';

/**
 * CredibilityDashboard — Professional V&V credibility overview for SimSci solvers.
 *
 * Displays:
 * 1. Traffic-light indicators per solver type (red=Level 0, yellow=Level 1, green=Level 2+)
 * 2. Expandable benchmark results per solver
 * 3. Convergence plots from ConvergenceAnalysis data (log-log scale via Chart.js)
 * 4. Links to V&V report PDFs
 *
 * Credibility levels follow ASME V&V 10/20 conventions:
 *   Level 0 — No verification (red)
 *   Level 1 — Code verification only, no convergence study (yellow)
 *   Level 2 — Grid convergence + analytical benchmarks pass (green)
 *   Level 3 — Level 2 + validation against experimental data (bright green)
 */

import { useState, useMemo } from 'react';
import {
  Shield,
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

/** Solver types matching engine/simulation/verification/ReportGenerator.ts */
export type SolverType =
  | 'thermal'
  | 'structural'
  | 'hydraulic'
  | 'acoustic'
  | 'fdtd'
  | 'cfd'
  | 'molecular-dynamics';

/** Credibility level per ASME V&V 10/20 */
export type CredibilityLevel = 0 | 1 | 2 | 3;

/** A single convergence data point for plotting */
export interface ConvergencePoint {
  meshSize: number;
  errorL2: number;
  errorLinf: number;
}

/** Convergence study data for a benchmark */
export interface ConvergenceData {
  benchmarkName: string;
  points: ConvergencePoint[];
  observedOrderL2: number;
  observedOrderLinf: number;
  theoreticalOrder?: number;
  richardsonEstimate?: number;
  gci?: number;
}

/** A benchmark result for display */
export interface BenchmarkEntry {
  name: string;
  solver: SolverType;
  analyticalSolution: string;
  passed: boolean;
  errorMetric: string;
  errorValue: number;
  tolerance: number;
  convergence?: ConvergenceData;
  reference?: string;
}

/** Per-solver credibility summary */
export interface SolverCredibility {
  solver: SolverType;
  level: CredibilityLevel;
  totalBenchmarks: number;
  passedBenchmarks: number;
  failedBenchmarks: number;
  hasConvergenceStudy: boolean;
  hasValidation: boolean;
  benchmarks: BenchmarkEntry[];
  reportUrl?: string;
}

/** Dashboard props */
export interface CredibilityDashboardProps {
  /** Software version string */
  softwareVersion: string;
  /** Per-solver credibility data */
  solvers: SolverCredibility[];
  /** Callback when user clicks a solver for detail */
  onSolverSelect?: (solver: SolverType) => void;
  /** Optional CSS class */
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<CredibilityLevel, { color: string; bg: string; border: string; label: string; description: string }> = {
  0: {
    color: 'text-red-400',
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    label: 'Level 0',
    description: 'No verification',
  },
  1: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/30',
    label: 'Level 1',
    description: 'Code verification only',
  },
  2: {
    color: 'text-green-400',
    bg: 'bg-green-500/15',
    border: 'border-green-500/30',
    label: 'Level 2',
    description: 'Grid convergence + benchmarks',
  },
  3: {
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    label: 'Level 3',
    description: 'Validated against experiments',
  },
};

const SOLVER_LABELS: Record<SolverType, string> = {
  thermal: 'Thermal',
  structural: 'Structural (TET4/TET10)',
  hydraulic: 'Hydraulic',
  acoustic: 'Acoustic',
  fdtd: 'FDTD Electromagnetic',
  cfd: 'CFD (Navier-Stokes)',
  'molecular-dynamics': 'Molecular Dynamics',
};

function TrafficLight({ level }: { level: CredibilityLevel }) {
  const config = LEVEL_CONFIG[level];
  return (
    <div className="flex items-center gap-1.5" title={`${config.label}: ${config.description}`}>
      {/* Three dots: red, yellow, green */}
      <div className="flex gap-0.5">
        <div
          className={`h-2.5 w-2.5 rounded-full border ${
            level === 0
              ? 'bg-red-500 border-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
              : 'bg-red-500/20 border-red-500/20'
          }`}
        />
        <div
          className={`h-2.5 w-2.5 rounded-full border ${
            level === 1
              ? 'bg-yellow-500 border-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.5)]'
              : 'bg-yellow-500/20 border-yellow-500/20'
          }`}
        />
        <div
          className={`h-2.5 w-2.5 rounded-full border ${
            level >= 2
              ? 'bg-green-500 border-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]'
              : 'bg-green-500/20 border-green-500/20'
          }`}
        />
      </div>
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
}

// ── Convergence Plot (Canvas-based, no Chart.js dependency at render time) ──

function ConvergencePlot({ data }: { data: ConvergenceData }) {
  const PLOT_W = 320;
  const PLOT_H = 180;
  const PAD = { top: 20, right: 20, bottom: 35, left: 50 };
  const innerW = PLOT_W - PAD.left - PAD.right;
  const innerH = PLOT_H - PAD.top - PAD.bottom;

  const plotData = useMemo(() => {
    const points = data.points
      .filter((p) => p.errorL2 > 0 && p.meshSize > 0)
      .sort((a, b) => a.meshSize - b.meshSize);

    if (points.length < 2) return null;

    const logH = points.map((p) => Math.log10(p.meshSize));
    const logE = points.map((p) => Math.log10(p.errorL2));

    const minLogH = Math.min(...logH);
    const maxLogH = Math.max(...logH);
    const minLogE = Math.min(...logE);
    const maxLogE = Math.max(...logE);

    const rangeH = maxLogH - minLogH || 1;
    const rangeE = maxLogE - minLogE || 1;

    // Add 10% padding
    const padH = rangeH * 0.1;
    const padE = rangeE * 0.1;

    const scaleX = (v: number) => PAD.left + ((v - (minLogH - padH)) / (rangeH + 2 * padH)) * innerW;
    const scaleY = (v: number) => PAD.top + (1 - (v - (minLogE - padE)) / (rangeE + 2 * padE)) * innerH;

    const svgPoints = points.map((p, i) => ({
      x: scaleX(logH[i]),
      y: scaleY(logE[i]),
      h: p.meshSize,
      e: p.errorL2,
    }));

    // Reference slope line (theoretical order)
    const refOrder = data.theoreticalOrder ?? Math.round(data.observedOrderL2);
    const refStartLogH = minLogH - padH;
    const refEndLogH = maxLogH + padH;
    const refMidLogE = (minLogE + maxLogE) / 2;
    const refStartLogE = refMidLogE - refOrder * ((refStartLogH + refEndLogH) / 2 - refStartLogH);
    const refEndLogE = refMidLogE + refOrder * (refEndLogH - (refStartLogH + refEndLogH) / 2);

    return {
      svgPoints,
      refLine: {
        x1: scaleX(refStartLogH),
        y1: scaleY(refStartLogE),
        x2: scaleX(refEndLogH),
        y2: scaleY(refEndLogE),
      },
      refOrder,
      xTicks: logH.map((lh, i) => ({ x: scaleX(lh), label: points[i].meshSize.toFixed(3) })),
      yTicks: logE.map((le, i) => ({ y: scaleY(le), label: points[i].errorL2.toExponential(1) })),
    };
  }, [data, innerW, innerH]);

  if (!plotData) {
    return (
      <div className="flex items-center justify-center h-[180px] text-[11px] text-studio-muted">
        Insufficient data for convergence plot
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-studio-muted font-semibold uppercase tracking-wider">
        {data.benchmarkName} — Convergence (log-log)
      </div>
      <svg width={PLOT_W} height={PLOT_H} className="block">
        {/* Grid area background */}
        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="#0d0d14" rx={2} />

        {/* Reference slope line (dashed) */}
        <line
          x1={plotData.refLine.x1}
          y1={plotData.refLine.y1}
          x2={plotData.refLine.x2}
          y2={plotData.refLine.y2}
          stroke="#4b5563"
          strokeWidth={1}
          strokeDasharray="4 3"
          clipPath={`rect(${PAD.top},${PAD.left + innerW},${PAD.top + innerH},${PAD.left})`}
        />

        {/* Data line */}
        <polyline
          points={plotData.svgPoints.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
        />

        {/* Data points */}
        {plotData.svgPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#3b82f6" stroke="#1e3a5f" strokeWidth={1}>
            <title>h={p.h.toFixed(4)}, L2={p.e.toExponential(3)}</title>
          </circle>
        ))}

        {/* X-axis ticks */}
        {plotData.xTicks.map((t, i) => (
          <g key={`xt-${i}`}>
            <line x1={t.x} y1={PAD.top + innerH} x2={t.x} y2={PAD.top + innerH + 4} stroke="#6b7280" strokeWidth={0.5} />
            <text x={t.x} y={PAD.top + innerH + 14} textAnchor="middle" fill="#9ca3af" fontSize={8}>
              {t.label}
            </text>
          </g>
        ))}

        {/* Y-axis ticks */}
        {plotData.yTicks.map((t, i) => (
          <g key={`yt-${i}`}>
            <line x1={PAD.left - 4} y1={t.y} x2={PAD.left} y2={t.y} stroke="#6b7280" strokeWidth={0.5} />
            <text x={PAD.left - 6} y={t.y + 3} textAnchor="end" fill="#9ca3af" fontSize={8}>
              {t.label}
            </text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={PAD.left + innerW / 2} y={PLOT_H - 2} textAnchor="middle" fill="#9ca3af" fontSize={9}>
          Mesh size (h)
        </text>
        <text
          x={10}
          y={PAD.top + innerH / 2}
          textAnchor="middle"
          fill="#9ca3af"
          fontSize={9}
          transform={`rotate(-90, 10, ${PAD.top + innerH / 2})`}
        >
          L2 Error
        </text>

        {/* Order annotation */}
        <text x={PLOT_W - PAD.right} y={PAD.top + 12} textAnchor="end" fill="#6b7280" fontSize={8}>
          p={data.observedOrderL2.toFixed(2)} (ref: {plotData.refOrder})
        </text>
      </svg>

      {/* GCI / Richardson summary below the plot */}
      {(data.gci !== undefined || data.richardsonEstimate !== undefined) && (
        <div className="flex gap-4 text-[10px] text-studio-muted">
          {data.richardsonEstimate !== undefined && (
            <span>Richardson: {data.richardsonEstimate.toExponential(4)}</span>
          )}
          {data.gci !== undefined && (
            <span>GCI: {(data.gci * 100).toFixed(2)}%</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Solver Card ──────────────────────────────────────────────────────────────

function SolverCard({ solver, onSelect }: { solver: SolverCredibility; onSelect?: (s: SolverType) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showConvergence, setShowConvergence] = useState(false);
  const config = LEVEL_CONFIG[solver.level];
  const benchmarksWithConvergence = solver.benchmarks.filter((b) => b.convergence);

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} overflow-hidden`}>
      {/* Header — always visible */}
      <button
        onClick={() => {
          setExpanded(!expanded);
          onSelect?.(solver.solver);
        }}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:brightness-110 transition"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-studio-muted shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-studio-muted shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-studio-text truncate">
              {SOLVER_LABELS[solver.solver]}
            </span>
            <TrafficLight level={solver.level} />
          </div>
          <div className="text-[10px] text-studio-muted mt-0.5">
            {solver.passedBenchmarks}/{solver.totalBenchmarks} benchmarks passed
            {solver.hasConvergenceStudy && ' | Convergence verified'}
            {solver.hasValidation && ' | Experimentally validated'}
          </div>
        </div>

        {/* Pass/fail badge */}
        <div className="shrink-0">
          {solver.failedBenchmarks === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          ) : (
            <XCircle className="h-4 w-4 text-red-400" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-studio-border/50 px-3 py-2.5 space-y-3">
          {/* Benchmark table */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
              Benchmark Results
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-studio-muted border-b border-studio-border/30">
                    <th className="text-left py-1 pr-2">Benchmark</th>
                    <th className="text-left py-1 pr-2">Metric</th>
                    <th className="text-right py-1 pr-2">Error</th>
                    <th className="text-right py-1 pr-2">Tolerance</th>
                    <th className="text-center py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {solver.benchmarks.map((b, i) => (
                    <tr key={i} className="border-b border-studio-border/10">
                      <td className="py-1 pr-2 text-studio-text">{b.name}</td>
                      <td className="py-1 pr-2 text-studio-muted">{b.errorMetric}</td>
                      <td className="py-1 pr-2 text-right font-mono">{b.errorValue.toExponential(3)}</td>
                      <td className="py-1 pr-2 text-right font-mono text-studio-muted">
                        {b.tolerance.toExponential(3)}
                      </td>
                      <td className="py-1 text-center">
                        {b.passed ? (
                          <CheckCircle2 className="h-3 w-3 text-green-400 inline" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-400 inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Convergence plots toggle */}
          {benchmarksWithConvergence.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowConvergence(!showConvergence)}
                className="flex items-center gap-1 text-[10px] font-semibold text-studio-accent hover:brightness-125 transition"
              >
                {showConvergence ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Convergence Plots ({benchmarksWithConvergence.length})
              </button>

              {showConvergence && (
                <div className="space-y-3">
                  {benchmarksWithConvergence.map((b, i) => (
                    <ConvergencePlot key={i} data={b.convergence!} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* V&V Report PDF link */}
          {solver.reportUrl && (
            <a
              href={solver.reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] text-studio-accent hover:brightness-125 transition"
            >
              <FileText className="h-3 w-3" />
              V&V Report (PDF)
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export function CredibilityDashboard({
  softwareVersion,
  solvers,
  onSolverSelect,
  className = '',
}: CredibilityDashboardProps) {
  const summary = useMemo(() => {
    const totalBenchmarks = solvers.reduce((s, sv) => s + sv.totalBenchmarks, 0);
    const totalPassed = solvers.reduce((s, sv) => s + sv.passedBenchmarks, 0);
    const minLevel = solvers.length > 0 ? Math.min(...solvers.map((s) => s.level)) : 0;
    const maxLevel = solvers.length > 0 ? Math.max(...solvers.map((s) => s.level)) : 0;
    const solversAtLevel2Plus = solvers.filter((s) => s.level >= 2).length;
    return { totalBenchmarks, totalPassed, minLevel, maxLevel, solversAtLevel2Plus };
  }, [solvers]);

  return (
    <div className={`flex flex-col bg-studio-panel text-studio-text ${className}`}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Shield className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold uppercase tracking-wider">
          V&V Credibility Dashboard
        </span>
        <span className="ml-auto text-[10px] text-studio-muted">v{softwareVersion}</span>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 border-b border-studio-border/50 px-3 py-2 bg-studio-surface/50">
        <div className="flex items-center gap-1.5">
          {summary.totalPassed === summary.totalBenchmarks && summary.totalBenchmarks > 0 ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
          ) : summary.totalPassed > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-red-400" />
          )}
          <span className="text-[11px] font-semibold">
            {summary.totalPassed}/{summary.totalBenchmarks} benchmarks passed
          </span>
        </div>
        <div className="text-[10px] text-studio-muted">
          {summary.solversAtLevel2Plus}/{solvers.length} solvers at Level 2+
        </div>
        <div className="text-[10px] text-studio-muted">
          Range: Level {summary.minLevel} - Level {summary.maxLevel}
        </div>
      </div>

      {/* Solver cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {solvers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-studio-muted">
            <Shield className="h-8 w-8 mb-2 opacity-30" />
            <span className="text-[11px]">No solver credibility data available</span>
            <span className="text-[10px] mt-1">Run verification benchmarks to populate this dashboard</span>
          </div>
        ) : (
          solvers.map((solver) => (
            <SolverCard key={solver.solver} solver={solver} onSelect={onSolverSelect} />
          ))
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 border-t border-studio-border px-3 py-2">
        <div className="flex items-center gap-4 text-[9px] text-studio-muted">
          <span className="font-semibold uppercase tracking-wider">Credibility Levels:</span>
          {([0, 1, 2, 3] as CredibilityLevel[]).map((level) => (
            <span key={level} className={`flex items-center gap-1 ${LEVEL_CONFIG[level].color}`}>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {LEVEL_CONFIG[level].label}: {LEVEL_CONFIG[level].description}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CredibilityDashboard;
