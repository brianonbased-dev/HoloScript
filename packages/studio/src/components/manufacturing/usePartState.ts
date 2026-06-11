'use client';

/**
 * usePartState — Zustand store for /create part mode.
 *
 * Holds the current part's SDF definition and live param values.
 * Exposes helpers to update individual params and compute the current SDF JSON.
 *
 * The SDF is NOT stored in the store — it is derived on-demand via
 * `buildCurrentSDF()` to avoid serializing a nested object tree on every
 * slider tick.
 */

import { create } from 'zustand';
import { DEFAULT_PART_DEFINITION, type PartDefinition, type PartParam } from './defaultPart';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PartParamValue {
  name: string;
  value: number;
}

export interface PartStateData {
  /** Part definition (shape + param schema). */
  definition: PartDefinition;
  /** Current param values keyed by param name. */
  paramValues: Record<string, number>;
}

export interface PartStateActions {
  /** Update a single param value by name. */
  setParamValue: (name: string, value: number) => void;
  /** Replace the entire part definition (resets param values to definition defaults). */
  setDefinition: (def: PartDefinition) => void;
  /**
   * Build and return the current SDF JSON tree by calling the definition's
   * `buildSDF` with the live param values. Pure derivation — no side effects.
   */
  buildCurrentSDF: () => unknown;
  /**
   * Return params as an ordered array merged with their current live values.
   * Useful for rendering sliders without accessing the definition directly.
   */
  getLiveParams: () => Array<PartParam & { currentValue: number }>;
}

export type PartState = PartStateData & PartStateActions;

// ── Store factory (exported for testing) ─────────────────────────────────────

function buildInitialValues(def: PartDefinition): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of def.params) {
    out[p.name] = p.value;
  }
  return out;
}

export const usePartState = create<PartState>()((set, get) => ({
  definition: DEFAULT_PART_DEFINITION,
  paramValues: buildInitialValues(DEFAULT_PART_DEFINITION),

  setParamValue: (name, value) => {
    set((s) => ({
      paramValues: { ...s.paramValues, [name]: value },
    }));
  },

  setDefinition: (def) => {
    set({
      definition: def,
      paramValues: buildInitialValues(def),
    });
  },

  buildCurrentSDF: () => {
    const { definition, paramValues } = get();
    return definition.buildSDF(paramValues);
  },

  getLiveParams: () => {
    const { definition, paramValues } = get();
    return definition.params.map((p) => ({
      ...p,
      currentValue: paramValues[p.name] ?? p.value,
    }));
  },
}));
