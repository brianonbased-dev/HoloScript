'use client';

/**
 * ParametricSlidersPanel
 *
 * Right-rail panel for /create?mode=part.
 *
 * Renders a slider per param from usePartState(). On change (debounced 200ms)
 * POSTs /api/manufacturing/mesh with the current SDF JSON, updating the
 * preview geometry state in usePartState and surfacing the printability result
 * to PrintabilityReportPanel via the shared store.
 *
 * Preview rendering: mounts a dedicated 3D canvas (R3F) in the center column
 * when mode=part. This panel only owns the sliders + "Download STL" button.
 *
 * Architecture: no @holoscript/engine import here — all SDF evaluation happens
 * server-side via the API routes (see KEY ARCHITECTURE FACT in task spec).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { usePartState } from './usePartState';
import type { PrintabilityReport } from './PrintabilityReportPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MeshResult {
  positions: number[];
  indices: number[];
  printability: PrintabilityReport;
}

export interface ParametricSlidersPanelProps {
  onClose?: () => void;
  /** Called with fresh mesh data after each successful fetch. */
  onMeshResult?: (result: MeshResult) => void;
}

// ── Slider row ────────────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2 border-b border-studio-border/40 last:border-0">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-studio-muted font-medium">{label}</span>
        <span className="text-studio-text font-mono tabular-nums">
          {format(value)} <span className="text-studio-muted">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-studio-accent cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-studio-muted/50">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ParametricSlidersPanel({ onClose, onMeshResult }: ParametricSlidersPanelProps) {
  const getLiveParams = usePartState((s) => s.getLiveParams);
  const setParamValue = usePartState((s) => s.setParamValue);
  const buildCurrentSDF = usePartState((s) => s.buildCurrentSDF);
  const definition = usePartState((s) => s.definition);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasResult, setHasResult] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMesh = useCallback(async () => {
    const sdf = buildCurrentSDF();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/manufacturing/mesh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdf,
          resolution: [40, 40, 40],
          bounds: definition.bounds,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as MeshResult;
      setHasResult(true);
      onMeshResult?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [buildCurrentSDF, definition.bounds, onMeshResult]);

  // Trigger initial mesh fetch on mount
  useEffect(() => {
    void fetchMesh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleParamChange = useCallback(
    (name: string, value: number) => {
      setParamValue(name, value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchMesh();
      }, 200);
    },
    [setParamValue, fetchMesh]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleDownloadSTL = async () => {
    const sdf = buildCurrentSDF();
    try {
      const res = await fetch('/api/manufacturing/stl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdf,
          resolution: [40, 40, 40],
          bounds: definition.bounds,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${definition.name}.stl`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Download failures are silent — user can retry
    }
  };

  const liveParams = getLiveParams();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-studio-muted">
            Parameters
          </span>
          {loading && (
            <RefreshCw
              className="h-3 w-3 text-studio-accent animate-spin"
              aria-label="Computing mesh…"
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          {onClose && (
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close parametric sliders panel"
              className="rounded p-0.5 text-studio-muted hover:text-studio-text hover:bg-white/[0.06] transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Part name chip */}
      <div className="px-3 py-2 border-b border-studio-border/40">
        <span className="text-[10px] font-mono text-studio-muted bg-studio-surface rounded px-1.5 py-0.5">
          {definition.name}.holo
        </span>
      </div>

      {/* Sliders */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {liveParams.map((param) => (
          <SliderRow
            key={param.name}
            label={param.label}
            value={param.currentValue}
            min={param.min}
            max={param.max}
            step={param.step}
            unit={param.unit}
            format={param.format}
            onChange={(v) => handleParamChange(param.name, v)}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 rounded-lg border border-studio-error/30 bg-studio-error/10 px-2.5 py-1.5 text-[11px] text-studio-error">
          {error}
        </div>
      )}

      {/* Download STL */}
      <div className="shrink-0 border-t border-studio-border px-3 py-2.5">
        <button
          onClick={() => void handleDownloadSTL()}
          disabled={!hasResult || loading}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface py-2 text-[11px] font-medium text-studio-muted transition hover:border-studio-accent hover:text-studio-text disabled:cursor-not-allowed disabled:opacity-40"
          title="Download STL file"
        >
          <Download className="h-3.5 w-3.5" />
          Download STL
        </button>
      </div>
    </div>
  );
}
