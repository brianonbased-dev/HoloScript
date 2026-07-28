'use client';

/**
 * PrintabilityReportPanel
 *
 * Right-rail panel for /create?mode=part.
 *
 * Displays the PrintabilityReport from the most recent /api/manufacturing/mesh
 * response — watertight/manifold badges, volume, overhang count, recommendation
 * chip, and fitsBuildVolume for a user-selected printer preset.
 *
 * State: the panel accepts a `report` prop (from ParametricSlidersPanel via the
 * parent page) rather than managing its own fetch — single source of truth.
 */

import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, AlertCircle, Printer } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrintabilityReport {
  watertight: boolean;
  manifold: boolean;
  volume: number;
  recommendation: 'printable' | 'needs-supports' | 'not-printable';
  overhangs: { count: number };
  overhangFraction?: number;
}

export interface PrintabilityReportPanelProps {
  report: PrintabilityReport | null;
  onClose?: () => void;
}

// ── Printer presets ───────────────────────────────────────────────────────────

interface PrinterPreset {
  id: string;
  label: string;
  /** Build volume in mm, [x, y, z]. */
  buildVolumeMm: [number, number, number];
}

/**
 * Common FDM printer bed sizes — clearly labelled as presets, not exact specs.
 * Volume in mm.
 */
const PRINTER_PRESETS: PrinterPreset[] = [
  { id: 'ender3', label: 'Ender 3 / 220×220×250 mm', buildVolumeMm: [220, 220, 250] },
  { id: 'p1s', label: 'Bambu P1S / 256×256×256 mm', buildVolumeMm: [256, 256, 256] },
  { id: 'mk4', label: 'Prusa MK4 / 250×210×220 mm', buildVolumeMm: [250, 210, 220] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check if a part with the given bounding-box volume (m³) fits in a printer's
 * build volume. The "part volume" here is the SDF mesh volume (m³); we use a
 * very rough heuristic: cube-root of volume gives effective edge length, then
 * convert to mm.
 *
 * This is an indicative check — real slicers use exact bounding boxes.
 */
function fitsBuildVolume(volumeM3: number, preset: PrinterPreset): boolean {
  const edgeLengthMm = Math.cbrt(volumeM3) * 1000; // m → mm, cube-root heuristic
  const [bx, by, bz] = preset.buildVolumeMm;
  return edgeLengthMm <= bx && edgeLengthMm <= by && edgeLengthMm <= bz;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({
  ok,
  label,
  trueLabel,
  falseLabel,
}: {
  ok: boolean;
  label: string;
  trueLabel?: string;
  falseLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between text-[11px] py-1.5 border-b border-studio-border/30 last:border-0">
      <span className="text-studio-muted">{label}</span>
      <div
        className={`flex items-center gap-1 font-medium ${ok ? 'text-green-400' : 'text-red-400'}`}
      >
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-label="pass" />
        ) : (
          <XCircle className="h-3.5 w-3.5" aria-label="fail" />
        )}
        {ok ? (trueLabel ?? 'Yes') : (falseLabel ?? 'No')}
      </div>
    </div>
  );
}

function RecommendationChip({ rec }: { rec: PrintabilityReport['recommendation'] }) {
  const cfg = {
    printable: {
      label: 'Printable',
      className: 'bg-green-500/10 text-green-400 border-green-500/20',
      icon: CheckCircle2,
    },
    'needs-supports': {
      label: 'Needs Supports',
      className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: AlertCircle,
    },
    'not-printable': {
      label: 'Not Printable',
      className: 'bg-red-500/10 text-red-400 border-red-500/20',
      icon: XCircle,
    },
  }[rec];

  const Icon = cfg.icon;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${cfg.className}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {cfg.label}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PrintabilityReportPanel({ report, onClose }: PrintabilityReportPanelProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>(PRINTER_PRESETS[0]!.id);

  const preset = PRINTER_PRESETS.find((p) => p.id === selectedPreset) ?? PRINTER_PRESETS[0]!;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Printer className="h-3.5 w-3.5 text-studio-muted" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-studio-muted">
            Printability
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close printability report panel"
            className="rounded p-0.5 text-studio-muted hover:text-studio-text hover:bg-white/[0.06] transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!report ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-8 text-center">
            <Printer className="h-8 w-8 text-studio-muted/30" aria-hidden="true" />
            <p className="text-[11px] text-studio-muted/60">
              Adjust sliders to generate a printability report.
            </p>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {/* Recommendation chip */}
            <RecommendationChip rec={report.recommendation} />

            {/* Mesh checks */}
            <div className="rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-1">
              <Badge ok={report.watertight} label="Watertight" trueLabel="Yes" falseLabel="No" />
              <Badge ok={report.manifold} label="Manifold" trueLabel="Yes" falseLabel="No" />
            </div>

            {/* Metrics */}
            <div className="rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Volume</span>
                <span className="font-mono tabular-nums text-studio-text">
                  {report.volume.toFixed(4)} m³
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-studio-muted">Overhangs</span>
                <span className="font-mono tabular-nums text-studio-text">
                  {report.overhangs.count} faces
                </span>
              </div>
              {report.overhangFraction !== undefined && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-studio-muted">Overhang fraction</span>
                  <span className="font-mono tabular-nums text-studio-text">
                    {(report.overhangFraction * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>

            {/* Printer preset selection */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted/70">
                Printer preset
              </div>
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                aria-label="Select printer preset"
                className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] text-studio-text focus:border-studio-accent outline-none"
              >
                {PRINTER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              {/* Fits build volume indicator */}
              {preset && (
                <div
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                    fitsBuildVolume(report.volume, preset)
                      ? 'border-green-500/20 bg-green-500/5 text-green-400'
                      : 'border-amber-500/20 bg-amber-500/5 text-amber-400'
                  }`}
                >
                  {fitsBuildVolume(report.volume, preset) ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {fitsBuildVolume(report.volume, preset)
                    ? 'Fits build volume (est.)'
                    : 'May exceed build volume (est.)'}
                </div>
              )}

              <p className="text-[9px] text-studio-muted/40 leading-snug">
                Volume estimate only — use a slicer for exact positioning.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
