import { describe, it, expect } from 'vitest';
import { mapVpsToTraits } from '../index';

describe('niantic-lgm-plugin stub', () => {
  it('maps high-confidence anchors to @anchor traits', () => {
    const r = mapVpsToTraits({
      anchors: [
        { id: 'a1', lat: 37.7749, lon: -122.4194, alt: 10, confidence: 0.9 },
        { id: 'a2', lat: 40.7128, lon: -74.006, confidence: 0.3 },
      ],
    });
    const anchors = r.traits.filter((t) => t.kind === '@anchor');
    expect(anchors.length).toBe(1);
    expect(anchors[0].target_id).toBe('a1');
    expect(r.unresolved).toContain('a2');
  });

  it('emits @geospatial coverage trait when tile bounds given', () => {
    const r = mapVpsToTraits({
      anchors: [],
      coverage_tile: { s2_cell_id: '808fba', bounds: [37, -122, 38, -121] },
    });
    const geo = r.traits.find((t) => t.kind === '@geospatial');
    expect(geo?.params.s2_cell_id).toBe('808fba');
    expect(geo?.params.bounds).toEqual([37, -122, 38, -121]);
  });
});
