'use client';

/**
 * useGameState — Zustand store for /create?mode=game.
 *
 * Mirrors useSimState conventions:
 *   - preset (game template) + per-param overrides (timeLimit, hearts)
 *   - building flag
 *   - result from the last POST /api/game/compile (playable HTML + game spec + gates)
 *   - build() fires the request (no debounce — explicit "Build & Play" click)
 *
 * No @holoscript/core or /engine import — the canvas2d-game compile is server-side
 * (the engine/core dynamic-import-with-webpackIgnore pattern, W.695).
 */

import { create } from 'zustand';
import { GAME_PRESETS, getGamePresetById, getGamePresetParams, type GamePreset } from './presets';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One derived-gameplay gate row for the Gate Ledger / verify card. */
export interface GameGate {
  id: string;
  label: string;
  /** true = derivation satisfied this gate (e.g. a player entity exists). */
  pass: boolean;
  detail: string;
}

export interface GameBuildReport {
  /** canvas2d-game export target. */
  target: string;
  /** Title from the derived GameSpec. */
  title: string;
  /** Derived gameplay counts. */
  playerPresent: boolean;
  collectibles: number;
  hazards: number;
  npcs: number;
  goalPresent: boolean;
  tiers: number;
  timeLimit: number;
  hearts: number;
  /** sha256 hex of the compiled HTML — deterministic build fingerprint. */
  htmlDigest: string;
  /** Byte size of the playable HTML. */
  htmlBytes: number;
  wallMs: number;
}

export interface GameBuildResult {
  /** Self-contained playable HTML game (canvas2d-game ExportManager output). */
  html: string;
  report: GameBuildReport;
  /** Derived gameplay gates — the verify-card / SimContract-style status. */
  gates: GameGate[];
}

export interface GameStateData {
  preset: GamePreset;
  /** Per-param overrides keyed by name (timeLimit, hearts) → compile options. */
  paramOverrides: Record<string, number>;
  building: boolean;
  result: GameBuildResult | null;
  error: string | null;
  /** htmlDigest from the previous build — determinism badge in the gate ledger. */
  lastDigest: string | null;
}

export interface GameStateActions {
  setPreset: (presetId: string) => void;
  setParamOverride: (name: string, value: number) => void;
  /** POST /api/game/compile with current preset source + option overrides. */
  build: () => Promise<void>;
  clearResult: () => void;
}

export type GameState = GameStateData & GameStateActions;

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PRESET = GAME_PRESETS[0]!;

function buildInitialOverrides(preset: GamePreset): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const p of getGamePresetParams(preset.id)) {
    overrides[p.name] = p.value;
  }
  return overrides;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGameState = create<GameState>()((set, get) => ({
  preset: DEFAULT_PRESET,
  paramOverrides: buildInitialOverrides(DEFAULT_PRESET),
  building: false,
  result: null,
  error: null,
  lastDigest: null,

  setPreset: (presetId: string) => {
    const preset = getGamePresetById(presetId) ?? DEFAULT_PRESET;
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

  build: async () => {
    const { preset, paramOverrides, result: prevResult } = get();
    set({ building: true, error: null });

    try {
      const options: Record<string, number> = {};
      if (typeof paramOverrides['timeLimit'] === 'number') {
        options['timeLimit'] = Math.round(paramOverrides['timeLimit']);
      }
      if (typeof paramOverrides['hearts'] === 'number') {
        options['hearts'] = Math.round(paramOverrides['hearts']);
      }

      const res = await fetch('/api/game/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: preset.source, options }),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as GameBuildResult;

      const prevDigest = prevResult?.report?.htmlDigest ?? null;

      set({
        result: data,
        lastDigest: prevDigest,
        building: false,
        error: null,
      });
    } catch (err) {
      set({
        building: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  clearResult: () => {
    set({ result: null, error: null, lastDigest: null });
  },
}));
