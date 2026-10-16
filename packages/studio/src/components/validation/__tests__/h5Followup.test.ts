/**
 * H5 follow-up: rules 1/11 honesty, FDA label retained, folding helpers, stale-pass guard.
 */
import { describe, it, expect } from 'vitest';
import { buildKnownTraitSet } from '@holoscript/core';
import {
  collisionTraitKnown,
  formatConformanceAuditExport,
  evaluateConformanceRules,
  rulesAfterCheckerFailure,
  DEFAULT_RULES,
  type ConformanceRule,
} from '../ConformanceSuitePanel';
import { normalizeTraitName, traitNameKey } from '../compilerConformance';

describe('H5 follow-up helpers', () => {
  it('@collision is not in buildKnownTraitSet, so collisionTraitKnown is false', () => {
    const known = buildKnownTraitSet();
    expect(known.has('collision')).toBe(false);
    expect(collisionTraitKnown(known)).toBe(false);
  });

  it('formatConformanceAuditExport keeps the FDA-Compliant label (not removed)', () => {
    const rules: ConformanceRule[] = DEFAULT_RULES.map((r) => ({
      ...r,
      status: 'not_checked',
      message: 'x',
    }));
    const text = formatConformanceAuditExport(rules, '2026-10-15T00:00:00.000Z');
    expect(text).toContain('FDA-Compliant');
    expect(text).toContain('HoloScript FDA-Compliant Conformance Audit Ledger');
  });

  it('TraitName-equivalent folding: FaceMesh spellings share a key', () => {
    expect(traitNameKey('FaceMesh')).toBe(traitNameKey('face_mesh'));
    expect(traitNameKey('face-mesh')).toBe(traitNameKey('FACE_MESH'));
    expect(traitNameKey('facemesh')).toBe(traitNameKey('face__mesh'));
    expect(normalizeTraitName('@GrabBable')).toBe('grab_bable');
  });
});

describe('stale-pass guard', () => {
  it('evaluateConformanceRules lets a throwing evaluator propagate (runSuite catches)', () => {
    expect(() =>
      evaluateConformanceRules([], 'composition "A" { object "C" { geometry: "cube" } }\n', () => {
        throw new Error('simulated checker failure');
      })
    ).toThrow(/simulated checker failure/);
  });

  it('rulesAfterCheckerFailure marks every rule not_checked (no stale passed)', () => {
    const rules = rulesAfterCheckerFailure(new Error('boom'));
    expect(rules.length).toBe(DEFAULT_RULES.length);
    for (const r of rules) {
      expect(r.status).toBe('not_checked');
      expect(r.status).not.toBe('passed');
      expect(r.message).toMatch(/checker stopped/i);
    }
  });
});
