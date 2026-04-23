/**
 * @holoscript/niantic-lgm-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 7 (Niantic LGM / VPS). Low-confidence anchors
 * MUST be routed to `unresolved`, not emitted as trusted traits.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { mapVpsToTraits, type LgmVpsResponse } from '../index';

describe('CONTRACT: niantic-lgm-plugin adapter', () => {
  it('exposes mapVpsToTraits at stable public path', () => {
    expect(typeof mod.mapVpsToTraits).toBe('function');
  });

  it('high-confidence anchors emit @anchor traits', () => {
    const r = mapVpsToTraits({
      anchors: [
        { id: 'a1', lat: 40.7, lon: -74.0, confidence: 0.9 },
        { id: 'a2', lat: 40.71, lon: -74.01, confidence: 1.0 },
      ],
    });
    expect(r.traits.length).toBe(2);
    for (const t of r.traits) expect(t.kind).toBe('@anchor');
    expect(r.unresolved).toEqual([]);
  });

  it('anchors with confidence < 0.5 go to unresolved list, NOT emitted as traits', () => {
    const r = mapVpsToTraits({
      anchors: [
        { id: 'good', lat: 1, lon: 1, confidence: 0.8 },
        { id: 'shaky', lat: 2, lon: 2, confidence: 0.3 },
      ],
    });
    expect(r.traits.length).toBe(1);
    expect(r.traits[0].target_id).toBe('good');
    expect(r.unresolved).toEqual(['shaky']);
  });

  it('coverage_tile emits a single @geospatial trait with target_id "coverage"', () => {
    const resp: LgmVpsResponse = {
      anchors: [],
      coverage_tile: { s2_cell_id: 'abc123', bounds: [1, 2, 3, 4] },
    };
    const r = mapVpsToTraits(resp);
    const geo = r.traits.find((t) => t.kind === '@geospatial');
    expect(geo).toBeDefined();
    expect(geo!.target_id).toBe('coverage');
    expect(geo!.params.s2_cell_id).toBe('abc123');
  });

  it('missing alt defaults to 0 on trait params', () => {
    const r = mapVpsToTraits({ anchors: [{ id: 'a', lat: 0, lon: 0, confidence: 0.9 }] });
    expect(r.traits[0].params.alt).toBe(0);
  });

  it('missing heading defaults to 0 on trait params', () => {
    const r = mapVpsToTraits({ anchors: [{ id: 'a', lat: 0, lon: 0, confidence: 0.9 }] });
    expect(r.traits[0].params.heading).toBe(0);
  });

  it('anchor without confidence field is treated as trusted (default 1)', () => {
    const r = mapVpsToTraits({ anchors: [{ id: 'nc', lat: 0, lon: 0 }] });
    expect(r.traits.length).toBe(1);
    expect(r.traits[0].params.confidence).toBe(1);
  });

  it('empty response → no traits, no unresolved, no throw', () => {
    expect(() => mapVpsToTraits({ anchors: [] })).not.toThrow();
    const r = mapVpsToTraits({ anchors: [] });
    expect(r.traits).toEqual([]);
    expect(r.unresolved).toEqual([]);
  });
});
