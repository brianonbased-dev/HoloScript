// @vitest-environment node
/**
 * ParametricSlidersPanel — UI contract tests (store layer).
 *
 * Verifies the store contract that the panel renders against:
 * param presence, bounds, format, and the downstream SDF effect.
 * Does NOT render React (avoids lucide-react/R3F ESM transform issues in Node).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePartState } from '../usePartState';
import { DEFAULT_PART_DEFINITION } from '../defaultPart';

function resetStore() {
  usePartState.getState().setDefinition(DEFAULT_PART_DEFINITION);
}

describe('ParametricSlidersPanel — UI contract (store layer)', () => {
  beforeEach(resetStore);

  it('getLiveParams returns one entry per default param', () => {
    const live = usePartState.getState().getLiveParams();
    expect(live).toHaveLength(DEFAULT_PART_DEFINITION.params.length);
  });

  it('each live param has a label, unit, min < max, and currentValue within range', () => {
    const live = usePartState.getState().getLiveParams();
    for (const p of live) {
      expect(p.label).toBeTruthy();
      expect(p.unit).toBeTruthy();
      expect(p.min).toBeLessThan(p.max);
      expect(p.currentValue).toBeGreaterThanOrEqual(p.min);
      expect(p.currentValue).toBeLessThanOrEqual(p.max);
    }
  });

  it('each live param format function returns a string', () => {
    const live = usePartState.getState().getLiveParams();
    for (const p of live) {
      const formatted = p.format(p.currentValue);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    }
  });

  it('setParamValue at min value propagates to getLiveParams().currentValue', () => {
    const { setParamValue, getLiveParams } = usePartState.getState();
    const firstParam = DEFAULT_PART_DEFINITION.params[0]!;

    setParamValue(firstParam.name, firstParam.min);

    const live = getLiveParams();
    const updated = live.find((p) => p.name === firstParam.name)!;
    expect(updated.currentValue).toBeCloseTo(firstParam.min, 6);
  });

  it('setParamValue at max value propagates to getLiveParams().currentValue', () => {
    const { setParamValue, getLiveParams } = usePartState.getState();
    const firstParam = DEFAULT_PART_DEFINITION.params[0]!;

    setParamValue(firstParam.name, firstParam.max);

    const live = getLiveParams();
    const updated = live.find((p) => p.name === firstParam.name)!;
    expect(updated.currentValue).toBeCloseTo(firstParam.max, 6);
  });

  it('buildCurrentSDF after param change yields an SDF node containing the new value', () => {
    const { setParamValue, buildCurrentSDF } = usePartState.getState();

    // Set both params to non-default values
    setParamValue('holeRadius', 0.15);
    setParamValue('thickness', 0.5);

    const sdf = buildCurrentSDF() as {
      type: string;
      children: Array<{
        primitive: string;
        params: { radius?: number; halfY?: number };
      }>;
    };

    expect(sdf.type).toBe('csg');

    // Box (plate) halfY = thickness * 0.5 = 0.25
    const plate = sdf.children.find((c) => c.primitive === 'box');
    expect(plate).toBeDefined();
    expect(plate!.params.halfY).toBeCloseTo(0.25, 6);

    // Cylinder (hole) radius = 0.15
    const hole = sdf.children.find((c) => c.primitive === 'cylinder');
    expect(hole).toBeDefined();
    expect(hole!.params.radius).toBeCloseTo(0.15, 6);
  });

  it('definition.bounds is non-null and has correct shape', () => {
    const { definition } = usePartState.getState();
    const { bounds } = definition;
    expect(bounds.min).toHaveLength(3);
    expect(bounds.max).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(bounds.min[i]).toBeLessThan(bounds.max[i]!);
    }
  });
});
