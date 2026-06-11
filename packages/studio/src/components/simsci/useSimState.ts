'use client';

/**
 * useSimState — Zustand store for /create?mode=sim.
 *
 * Mirrors the conventions of usePartState:
 *   - preset + custom param overrides (steps, dt, per-solver config fields)
 *   - running flag
 *   - result from the last POST /api/simulation/run
 *   - lastDigest for determinism badge in SimRunReportPanel
 *   - run() fires the request (no debounce — explicit button click)
 *
 * No @holoscript/engine import — all computation is server-side.
 */

import { create } from 'zustand';
import { SIM_PRESETS, getPresetById, getPresetParams, type SimPreset } from './presets';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimRunReport {
  solver: string;
  steps: number;
  dt: number;
  finalStateDigest: string;
  wallMs: number;
  fieldNames: string[];
}

export interface SimRunResult {
  kind: 'particles' | 'scalarField';
  positions?: number[];
  field?: { resolution: [number, number, number]; values: number[] };
  stats: Record<string, unknown>;
  runReport: SimRunReport;
}

export interface SimStateData {
  /** Active preset. */
  preset: SimPreset;
  /**
   * Per-param overrides keyed by param name.
   * 'steps' and 'dt' are top-level; solver config params are stored flat here
   * and merged into the request body by run().
   */
  paramOverrides: Record<string, number>;
  running: boolean;
  result: SimRunResult | null;
  error: string | null;
  /** Digest from the previous run — used by SimRunReportPanel for determinism badge. */
  lastDigest: string | null;
}

export interface SimStateActions {
  setPreset: (presetId: string) => void;
  setParamOverride: (name: string, value: number) => void;
  /** POST /api/simulation/run with current preset + overrides. */
  run: () => Promise<void>;
  clearResult: () => void;
}

export type SimState = SimStateData & SimStateActions;

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PRESET = SIM_PRESETS[0]!;

function buildInitialOverrides(preset: SimPreset): Record<string, number> {
  return {
    steps: preset.steps,
    dt: preset.dt,
  };
}

/**
 * Build the request body for POST /api/simulation/run.
 *
 * param overrides whose names match a key in the preset's config
 * (determined by their configPath prefix 'config.') are merged into config.
 * 'steps' and 'dt' map to the top-level fields.
 */
/**
 * Clone-on-write deep set: descends `path` into `obj`, shallow-cloning each
 * level so the preset's default config object is never mutated.
 */
function setDeep(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i] as string;
    const next = cur[key];
    cur[key] =
      typeof next === 'object' && next !== null ? { ...(next as Record<string, unknown>) } : {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1] as string] = value;
}

function buildRequestBody(
  preset: SimPreset,
  overrides: Record<string, number>
): { solver: string; config: Record<string, unknown>; steps: number; dt: number } {
  // Start from preset defaults
  const config: Record<string, unknown> = { ...preset.config };

  // Apply config overrides AT THEIR DESCRIPTOR configPath. A flat write under
  // the param NAME (the previous behavior) silently missed nested parser keys
  // like sources.internal.hotspot.heat_output — the slider became a no-op.
  const descriptors = getPresetParams(preset.id);
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'steps' || key === 'dt') continue;
    const descriptor = descriptors.find((p) => p.name === key);
    if (descriptor && descriptor.configPath.startsWith('config.')) {
      setDeep(config, descriptor.configPath.slice('config.'.length).split('.'), value);
    } else {
      config[key] = value;
    }
  }

  const steps = typeof overrides['steps'] === 'number' ? overrides['steps'] : preset.steps;
  const dt = typeof overrides['dt'] === 'number' ? overrides['dt'] : preset.dt;

  return {
    solver: preset.solver,
    config,
    steps: Math.round(steps),
    dt,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSimState = create<SimState>()((set, get) => ({
  preset: DEFAULT_PRESET,
  paramOverrides: buildInitialOverrides(DEFAULT_PRESET),
  running: false,
  result: null,
  error: null,
  lastDigest: null,

  setPreset: (presetId: string) => {
    const preset = getPresetById(presetId) ?? DEFAULT_PRESET;
    set({
      preset,
      paramOverrides: buildInitialOverrides(preset),
      result: null,
      error: null,
      lastDigest: null,
    });
  },

  setParamOverride: (name: string, value: number) => {
    set((s) => ({
      paramOverrides: { ...s.paramOverrides, [name]: value },
    }));
  },

  run: async () => {
    const { preset, paramOverrides, result: prevResult } = get();
    set({ running: true, error: null });

    try {
      const body = buildRequestBody(preset, paramOverrides);

      const res = await fetch('/api/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as SimRunResult;

      // Capture lastDigest from the previous result before overwriting
      const prevDigest = prevResult?.runReport?.finalStateDigest ?? null;

      set({
        result: data,
        lastDigest: prevDigest,
        running: false,
        error: null,
      });
    } catch (err) {
      set({
        running: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  clearResult: () => {
    set({ result: null, error: null, lastDigest: null });
  },
}));
