'use client';

/**
 * useAvatarModeState — Zustand store for /create?mode=avatar.
 *
 * Mirrors useGameState / useSimState conventions:
 *   - preset (avatar template) + per-param overrides (scale, expressionCount)
 *   - building flag
 *   - result from the last POST /api/avatar/compile (VRM-rig descriptor + report + gates)
 *   - build() fires the request (no debounce — explicit "Build Rig" click)
 *
 * Distinct from the legacy `avatarStore` (the deprecated POC part-composer at the
 * standalone /avatar route). This store backs the consolidated create-mode surface.
 *
 * No @holoscript/core or /engine import — the avatar-rig derivation is server-side
 * (the W.695 server-API pattern: parseHolo + humanoid-rig derivation in the route).
 */

import { create } from 'zustand';
import {
  AVATAR_PRESETS,
  getAvatarPresetById,
  getAvatarPresetParams,
  type AvatarPreset,
} from './presets';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One derived-rig gate row for the Rig Ledger / verify card. */
export interface AvatarGate {
  id: string;
  label: string;
  /** true = derivation satisfied this gate. */
  pass: boolean;
  detail: string;
}

/** A single VRM humanoid bone slot in the derived rig descriptor. */
export interface AvatarBone {
  /** VRM humanoid bone name (e.g. "hips", "leftUpperArm"). */
  vrmBone: string;
  /** Node name the bone maps to in the composition. */
  node: string;
  /** Whether this is one of the VRM required-humanoid bones. */
  required: boolean;
}

export interface AvatarBuildReport {
  /** Derivation target id. */
  target: string;
  /** Title from the derived rig (composition metadata name). */
  title: string;
  /** Total humanoid bones in the derived rig. */
  boneCount: number;
  /** Number of VRM required-humanoid bones present (0..7). */
  requiredBonesPresent: number;
  /** Total VRM required-humanoid bones. */
  requiredBonesTotal: number;
  /** 0..1 fraction of required-humanoid bones present. */
  boneCoverage: number;
  /** Derived expression presets. */
  expressionCount: number;
  /** Surface layers (hair + clothing + accessory templates). */
  layerCount: number;
  /** Avatar root uniform scale. */
  scale: number;
  /** sha256 hex of the canonical rig-descriptor JSON — deterministic fingerprint. */
  rigDigest: string;
  /** Byte size of the rig-descriptor JSON. */
  rigBytes: number;
  wallMs: number;
}

export interface AvatarBuildResult {
  /** Canonical VRM-1.0-shaped rig descriptor (downloadable on Ship). */
  rig: {
    name: string;
    version: '1.0';
    scale: number;
    humanoid_bones: Record<string, string>;
    expressions: Array<{ preset: string; target_shape_keys: string[] }>;
    layers: string[];
  };
  bones: AvatarBone[];
  report: AvatarBuildReport;
  /** Derived-rig gates — the verify-card / SimContract-style status. */
  gates: AvatarGate[];
}

export interface AvatarModeStateData {
  preset: AvatarPreset;
  /** Per-param overrides keyed by name (scale, expressionCount). */
  paramOverrides: Record<string, number>;
  building: boolean;
  result: AvatarBuildResult | null;
  error: string | null;
  /** rigDigest from the previous build — determinism badge in the rig ledger. */
  lastDigest: string | null;
}

export interface AvatarModeStateActions {
  setPreset: (presetId: string) => void;
  setParamOverride: (name: string, value: number) => void;
  /** POST /api/avatar/compile with current preset source + option overrides. */
  build: () => Promise<void>;
  clearResult: () => void;
}

export type AvatarModeState = AvatarModeStateData & AvatarModeStateActions;

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PRESET = AVATAR_PRESETS[0]!;

function buildInitialOverrides(preset: AvatarPreset): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const p of getAvatarPresetParams(preset.id)) {
    overrides[p.name] = p.value;
  }
  return overrides;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAvatarModeState = create<AvatarModeState>()((set, get) => ({
  preset: DEFAULT_PRESET,
  paramOverrides: buildInitialOverrides(DEFAULT_PRESET),
  building: false,
  result: null,
  error: null,
  lastDigest: null,

  setPreset: (presetId: string) => {
    const preset = getAvatarPresetById(presetId) ?? DEFAULT_PRESET;
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
      if (typeof paramOverrides['scale'] === 'number') {
        options['scale'] = paramOverrides['scale'];
      }
      if (typeof paramOverrides['expressionCount'] === 'number') {
        options['expressionCount'] = Math.round(paramOverrides['expressionCount']);
      }

      const res = await fetch('/api/avatar/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: preset.source, options }),
      });

      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as AvatarBuildResult;

      const prevDigest = prevResult?.report?.rigDigest ?? null;

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
