/**
 * usePartState tests
 *
 * Verifies param→SDF substitution: changing a param value flows through to
 * the SDF JSON tree via buildCurrentSDF().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePartState } from '../usePartState';
import { DEFAULT_PART_DEFINITION, type PartDefinition } from '../defaultPart';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset store to defaults between tests via setDefinition. */
function resetStore() {
  usePartState.getState().setDefinition(DEFAULT_PART_DEFINITION);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePartState', () => {
  beforeEach(() => {
    resetStore();
  });

  it('initialises with default param values from the definition', () => {
    const { paramValues, definition } = usePartState.getState();
    for (const param of definition.params) {
      expect(paramValues[param.name]).toBe(param.value);
    }
  });

  it('setParamValue updates a single param, leaving others unchanged', () => {
    const { setParamValue, paramValues: before } = usePartState.getState();
    const firstParam = DEFAULT_PART_DEFINITION.params[0]!;
    const otherParams = DEFAULT_PART_DEFINITION.params.slice(1);

    const newValue = firstParam.min + (firstParam.max - firstParam.min) * 0.5;
    setParamValue(firstParam.name, newValue);

    const { paramValues: after } = usePartState.getState();
    expect(after[firstParam.name]).toBeCloseTo(newValue, 6);

    // Other params are unchanged
    for (const p of otherParams) {
      expect(after[p.name]).toBe(before[p.name]);
    }
  });

  it('buildCurrentSDF returns a non-null object with type field', () => {
    const { buildCurrentSDF } = usePartState.getState();
    const sdf = buildCurrentSDF();
    expect(sdf).not.toBeNull();
    expect(typeof sdf).toBe('object');
    expect((sdf as { type: string }).type).toBeTruthy();
  });

  it('buildCurrentSDF reflects updated holeRadius in the SDF tree', () => {
    const { setParamValue, buildCurrentSDF } = usePartState.getState();

    // Set holeRadius to a known value
    setParamValue('holeRadius', 0.42);
    const sdf = buildCurrentSDF() as {
      type: string;
      operation: string;
      children: Array<{ type: string; primitive: string; params: { radius?: number } }>;
    };

    expect(sdf.type).toBe('csg');
    expect(sdf.operation).toBe('difference');

    // The second child is the hole cylinder
    const hole = sdf.children[1];
    expect(hole).toBeDefined();
    expect(hole!.primitive).toBe('cylinder');
    expect(hole!.params.radius).toBeCloseTo(0.42, 6);
  });

  it('buildCurrentSDF reflects updated thickness in the box halfY', () => {
    const { setParamValue, buildCurrentSDF } = usePartState.getState();

    setParamValue('thickness', 0.6);
    const sdf = buildCurrentSDF() as {
      children: Array<{ params: { halfY?: number } }>;
    };

    // First child is the plate box; halfY = thickness * 0.5
    const plate = sdf.children[0];
    expect(plate).toBeDefined();
    expect(plate!.params.halfY).toBeCloseTo(0.3, 6);
  });

  it('getLiveParams returns params with currentValue reflecting store state', () => {
    const { setParamValue, getLiveParams } = usePartState.getState();
    setParamValue('holeRadius', 0.1);

    const liveParams = getLiveParams();
    const holeParam = liveParams.find((p) => p.name === 'holeRadius');
    expect(holeParam).toBeDefined();
    expect(holeParam!.currentValue).toBeCloseTo(0.1, 6);
  });

  it('setDefinition replaces the definition and resets param values to new defaults', () => {
    const customDef: PartDefinition = {
      name: 'test-cube',
      params: [
        {
          name: 'size',
          label: 'Size',
          min: 0.1,
          max: 2.0,
          step: 0.1,
          value: 1.0,
          unit: 'u',
          format: (v) => v.toFixed(1),
        },
      ],
      buildSDF: (params) => ({
        type: 'primitive',
        primitive: 'box',
        params: { halfX: params['size'] ?? 1, halfY: params['size'] ?? 1, halfZ: params['size'] ?? 1 },
      }),
      bounds: { min: [-2, -2, -2], max: [2, 2, 2] },
    };

    usePartState.getState().setDefinition(customDef);

    const state = usePartState.getState();
    expect(state.definition.name).toBe('test-cube');
    expect(state.paramValues['size']).toBe(1.0);

    const sdf = state.buildCurrentSDF() as {
      type: string;
      params: { halfX: number };
    };
    expect(sdf.type).toBe('primitive');
    expect(sdf.params.halfX).toBeCloseTo(1.0, 6);
  });
});
