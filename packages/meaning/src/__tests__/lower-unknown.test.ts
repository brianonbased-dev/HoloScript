import { describe, expect, it } from 'vitest';
import { lowerUnknownField, lowerUnknownFields } from '../lower-unknown';
import { isKnown, orElse } from '../uncertain';

describe('lowerUnknownField — @unknown surface annotation → Uncertain', () => {
  it('lowers an @unknown field to an unknown(underdetermined) initial state', () => {
    const lowered = lowerUnknownField({
      key: 'reading',
      annotations: ['unknown'],
      value: { type: 'Identifier', name: 'Temperature' },
    });
    expect(lowered).not.toBeNull();
    expect(lowered!.key).toBe('reading');
    expect(lowered!.typeName).toBe('Temperature');
    expect(lowered!.optional).toBe(false);
    expect(isKnown(lowered!.initial)).toBe(false);
    if (!isKnown(lowered!.initial)) {
      expect(lowered!.initial.reason).toBe('underdetermined');
      // No structured gap: gap codes are family-scoped resolver vocabulary; a surface
      // declaration has no resolver family.
      expect(lowered!.initial.gap).toBeUndefined();
    }
  });

  it('returns null for a plain field — no epistemic state to lower', () => {
    expect(lowerUnknownField({ key: 'label', value: { type: 'String' } })).toBeNull();
    expect(lowerUnknownField({ key: 'label', annotations: [] })).toBeNull();
    expect(lowerUnknownField({ key: 'label' })).toBeNull();
  });

  it('carries the ? presence axis through untouched — the two axes stay independent', () => {
    const lowered = lowerUnknownField({
      key: 'value',
      optional: true,
      annotations: ['unknown'],
      value: { type: 'Identifier', name: 'Celsius' },
    });
    expect(lowered!.optional).toBe(true);
    expect(isKnown(lowered!.initial)).toBe(false);
  });

  it('typeName is null when the value is not a bare type identifier', () => {
    const lowered = lowerUnknownField({
      key: 'reading',
      annotations: ['unknown'],
      value: { type: 'Number' },
    });
    expect(lowered!.typeName).toBeNull();
  });

  it('declaredDefault passes the AST node through; initial STAYS unknown — a fallback is not knowledge', () => {
    const withDefault = lowerUnknownField({
      key: 'reading',
      annotations: ['unknown'],
      value: { type: 'Identifier', name: 'Temperature' },
      default_value: { type: 'Number', value: 20, raw: '20.0' },
    });
    expect(withDefault!.declaredDefault).toEqual({ type: 'Number', value: 20, raw: '20.0' });
    expect(isKnown(withDefault!.initial)).toBe(false); // the default did NOT make it known

    const withoutDefault = lowerUnknownField({ key: 'reading', annotations: ['unknown'] });
    expect(withoutDefault!.declaredDefault).toBeNull();
  });

  it('the lowered initial composes with the Uncertain combinators (the point of the bridge)', () => {
    const lowered = lowerUnknownField({ key: 'reading', annotations: ['unknown'] })!;
    // A consumer must supply a fallback to extract a value — same contract the compiler
    // enforces at the surface with `??`.
    expect(orElse(lowered.initial as never, 20)).toBe(20);
  });

  it('lowerUnknownFields filters a mixed property list to its @unknown members', () => {
    const lowered = lowerUnknownFields([
      { key: 'reading', annotations: ['unknown'], value: { type: 'Identifier', name: 'Temp' } },
      { key: 'label', value: { type: 'String' } },
      { key: 'level', annotations: ['unknown'] },
    ]);
    expect(lowered.map((l) => l.key)).toEqual(['reading', 'level']);
  });
});
