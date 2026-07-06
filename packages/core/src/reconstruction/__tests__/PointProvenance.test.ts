/**
 * PointProvenance tests — the observed-vs-invented moat axis.
 * @see ../PointProvenance.ts
 */
import { describe, it, expect } from 'vitest';
import {
  provenanceClassToCode,
  provenanceCodeToClass,
  provenanceHistogram,
  uniformProvenance,
  POINT_PROVENANCE_CODE,
  HOLOMAP_CAPTURE_DEFAULT_PROVENANCE,
  type PointProvenanceClass,
} from '../PointProvenance';

describe('PointProvenance', () => {
  it('round-trips class <-> code', () => {
    const classes: PointProvenanceClass[] = [
      'observed',
      'interpolated',
      'nlos-inferred',
      'generative-extended',
    ];
    for (const cls of classes) {
      expect(provenanceCodeToClass(provenanceClassToCode(cls))).toBe(cls);
    }
    expect(POINT_PROVENANCE_CODE.observed).toBe(0);
    expect(POINT_PROVENANCE_CODE.interpolated).toBe(1);
    expect(POINT_PROVENANCE_CODE['generative-extended']).toBe(2);
    expect(POINT_PROVENANCE_CODE['nlos-inferred']).toBe(3);
  });

  it('counts nlos-inferred (code 3) as its own class, separate from generative-extended', () => {
    const codes = Uint8Array.from([0, 3, 3, 2]); // 1 observed, 2 nlos-inferred, 1 generative
    const h = provenanceHistogram(codes);
    expect(h.observed).toBe(1);
    expect(h['nlos-inferred']).toBe(2);
    expect(h['generative-extended']).toBe(1);
    expect(h.total).toBe(4);
    // nlos-inferred is NOT observed (line-of-sight) → does not raise observedFraction.
    expect(h.observedFraction).toBe(0.25);
  });

  it('still lumps unknown/corrupt codes into the lowest-trust class', () => {
    const codes = Uint8Array.from([3, 7, 99]); // 1 nlos-inferred, 2 unknown -> generative
    const h = provenanceHistogram(codes);
    expect(h['nlos-inferred']).toBe(1);
    expect(h['generative-extended']).toBe(2);
  });

  it('fails an unknown/corrupt code toward LOWER trust, never to observed', () => {
    expect(provenanceCodeToClass(99)).toBe('generative-extended');
    expect(provenanceCodeToClass(-1)).toBe('generative-extended');
  });

  it('computes a histogram with the observedFraction', () => {
    const codes = Uint8Array.from([0, 0, 1, 2]); // 2 observed, 1 interpolated, 1 generative
    const h = provenanceHistogram(codes);
    expect(h.observed).toBe(2);
    expect(h.interpolated).toBe(1);
    expect(h['generative-extended']).toBe(1);
    expect(h.total).toBe(4);
    expect(h.observedFraction).toBe(0.5);
  });

  it('handles an empty histogram without dividing by zero', () => {
    const h = provenanceHistogram(new Uint8Array(0));
    expect(h.total).toBe(0);
    expect(h.observedFraction).toBe(0);
  });

  it('uniformProvenance fills every point with one class code', () => {
    expect(Array.from(uniformProvenance(3, 'generative-extended'))).toEqual([2, 2, 2]);
    expect(Array.from(uniformProvenance(2, 'observed'))).toEqual([0, 0]);
  });

  it('the honest raw-capture default is observed', () => {
    expect(HOLOMAP_CAPTURE_DEFAULT_PROVENANCE).toBe('observed');
  });
});
