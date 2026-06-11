'use client';

/**
 * SimParamsPanel
 *
 * Right-rail panel for /create?mode=sim.
 *
 * Renders:
 *   - Preset dropdown (solver selector)
 *   - 2–4 numeric inputs for the preset's headline params (steps, dt, + per-preset fields)
 *   - Run button with running spinner
 *
 * No debounce — simulations are heavier than meshes; explicit Run click only.
 *
 * Architecture: no @holoscript/engine import — computation is server-side.
 */

import React from 'react';
import { RefreshCw, Play, X } from 'lucide-react';
import { useSimState } from './useSimState';
import { SIM_PRESETS, getPresetParams } from './presets';

// ── Input row ─────────────────────────────────────────────────────────────────

function NumericInputRow({
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
          {format(value)}{unit ? <span className="text-studio-muted ml-1">{unit}</span> : null}
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

export interface SimParamsPanelProps {
  onClose?: () => void;
}

export function SimParamsPanel({ onClose }: SimParamsPanelProps) {
  const preset = useSimState((s) => s.preset);
  const paramOverrides = useSimState((s) => s.paramOverrides);
  const running = useSimState((s) => s.running);
  const error = useSimState((s) => s.error);
  const setPreset = useSimState((s) => s.setPreset);
  const setParamOverride = useSimState((s) => s.setParamOverride);
  const run = useSimState((s) => s.run);

  const presetParams = getPresetParams(preset.id);

  const handleRun = () => {
    void run();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-studio-muted">
            Sim Params
          </span>
          {running && (
            <RefreshCw
              className="h-3 w-3 text-studio-accent animate-spin"
              aria-label="Running simulation…"
            />
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close sim params panel"
            className="rounded p-0.5 text-studio-muted hover:text-studio-text hover:bg-white/[0.06] transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Preset dropdown */}
      <div className="px-3 py-2.5 border-b border-studio-border/40">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted/70 mb-1.5">
          Solver preset
        </div>
        <select
          value={preset.id}
          onChange={(e) => setPreset(e.target.value)}
          aria-label="Select simulation preset"
          className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] text-studio-text focus:border-studio-accent outline-none"
        >
          {SIM_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-studio-muted/50 leading-snug">
          {preset.description}
        </p>
      </div>

      {/* Param inputs */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {presetParams.map((param) => {
          const currentValue = paramOverrides[param.name] ?? param.value;
          return (
            <NumericInputRow
              key={param.name}
              label={param.label}
              value={currentValue}
              min={param.min}
              max={param.max}
              step={param.step}
              unit={param.unit}
              format={param.format}
              onChange={(v) => setParamOverride(param.name, v)}
            />
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 rounded-lg border border-studio-error/30 bg-studio-error/10 px-2.5 py-1.5 text-[11px] text-studio-error">
          {error}
        </div>
      )}

      {/* Run button */}
      <div className="shrink-0 border-t border-studio-border px-3 py-2.5">
        <button
          onClick={handleRun}
          disabled={running}
          aria-label="Run simulation"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface py-2 text-[11px] font-medium text-studio-muted transition hover:border-studio-accent hover:text-studio-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {running ? 'Running…' : 'Run Simulation'}
        </button>
      </div>
    </div>
  );
}
