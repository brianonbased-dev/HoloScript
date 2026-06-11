// @vitest-environment node
/**
 * SimParamsPanel — UI contract tests (store layer)
 *
 * Validates the store contract the panel renders against:
 * preset presence, param bounds, format functions, override propagation.
 * Does NOT render React (avoids lucide-react/R3F ESM transform issues in Node).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSimState } from '../useSimState';
import { SIM_PRESETS, getPresetParams } from '../presets';

function resetStore() {
  useSimState.getState().setPreset(SIM_PRESETS[0]!.id);
}

describe('SimParamsPanel — UI contract (store layer)', () => {
  beforeEach(resetStore);

  it('SIM_PRESETS has at least one entry', () => {
    expect(SIM_PRESETS.length).toBeGreaterThanOrEqual(1);
  });

  it('each preset has required shape fields', () => {
    for (const preset of SIM_PRESETS) {
      expect(typeof preset.id).toBe('string');
      expect(typeof preset.label).toBe('string');
      expect(typeof preset.solver).toBe('string');
      expect(typeof preset.steps).toBe('number');
      expect(typeof preset.dt).toBe('number');
      expect(preset.kind === 'particles' || preset.kind === 'scalarField').toBe(true);
      expect(preset.dt).toBeGreaterThan(0);
      expect(Number.isFinite(preset.dt)).toBe(true);
      expect(preset.steps).toBeGreaterThan(0);
    }
  });

  it('getPresetParams returns 2–4 params per preset', () => {
    for (const preset of SIM_PRESETS) {
      const params = getPresetParams(preset.id);
      expect(params.length).toBeGreaterThanOrEqual(2);
      expect(params.length).toBeLessThanOrEqual(4);
    }
  });

  it('each preset param has valid bounds and format', () => {
    for (const preset of SIM_PRESETS) {
      const params = getPresetParams(preset.id);
      for (const p of params) {
        expect(p.min).toBeLessThan(p.max);
        expect(p.value).toBeGreaterThanOrEqual(p.min);
        expect(p.value).toBeLessThanOrEqual(p.max);
        const formatted = p.format(p.value);
        expect(typeof formatted).toBe('string');
        expect(formatted.length).toBeGreaterThan(0);
      }
    }
  });

  it('store initialises with first preset and correct default overrides', () => {
    const { preset, paramOverrides } = useSimState.getState();
    expect(preset.id).toBe(SIM_PRESETS[0]!.id);
    expect(paramOverrides['steps']).toBe(preset.steps);
    expect(paramOverrides['dt']).toBe(preset.dt);
  });

  it('setParamOverride propagates to store paramOverrides', () => {
    useSimState.getState().setParamOverride('steps', 777);
    expect(useSimState.getState().paramOverrides['steps']).toBe(777);
  });

  it('setPreset with a valid id switches the preset', () => {
    const secondId = SIM_PRESETS[1]?.id;
    if (!secondId) return; // only one preset — skip
    useSimState.getState().setPreset(secondId);
    expect(useSimState.getState().preset.id).toBe(secondId);
  });

  it('setPreset with an unknown id falls back to first preset', () => {
    useSimState.getState().setPreset('nonexistent-solver-xyz');
    expect(useSimState.getState().preset.id).toBe(SIM_PRESETS[0]!.id);
  });

  it('running defaults to false', () => {
    expect(useSimState.getState().running).toBe(false);
  });

  it('result defaults to null', () => {
    expect(useSimState.getState().result).toBeNull();
  });
});
