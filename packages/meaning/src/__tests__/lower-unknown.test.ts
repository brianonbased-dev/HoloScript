import { describe, expect, it } from 'vitest';
import {
  type LowerableHSPlusStructDeclaration,
  lowerUnknownField,
  lowerUnknownFields,
  lowerUnknownHSPlusStructFields,
  lowerUnknownStructFields,
} from '../lower-unknown';
import { isKnown, orElse } from '../uncertain';

function injectedHSPlusStruct(fields: unknown[]): LowerableHSPlusStructDeclaration {
  return { name: 'Injected', fields } as unknown as LowerableHSPlusStructDeclaration;
}

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

  it('lowers aligned native struct annotations without inventing optionality or a default', () => {
    const lowered = lowerUnknownStructFields({
      name: 'Sensor',
      fields: ['reading', 'calibrated', 'drift'],
      field_types: ['i32', 'bool', 'i64'],
      field_annotations: [['unknown'], [], ['unknown']],
    });
    expect(lowered.map(({ key, typeName }) => [key, typeName])).toEqual([
      ['reading', 'i32'],
      ['drift', 'i64'],
    ]);
    expect(lowered.every((field) => field.optional === false)).toBe(true);
    expect(lowered.every((field) => field.declaredDefault === null)).toBe(true);
    expect(lowered.every((field) => !isKnown(field.initial))).toBe(true);
  });

  it('adapts object-shaped HoloScript+ fields with exact annotation-to-field binding', () => {
    const lowered = lowerUnknownHSPlusStructFields({
      name: 'Sensor',
      body: '\n  reading: Celsius\n  calibrated: bool\n  drift: i64\n',
      fields: [
        { projection: 'typed', name: 'reading', type: 'Celsius' },
        {
          projection: 'typed',
          name: 'calibrated',
          type: 'bool',
          annotations: ['unknown'],
          optional: true,
          defaultSource: 'sensorFallback()',
        },
        { projection: 'typed', name: 'drift', type: 'i64', annotations: ['unknown'] },
      ],
    });

    expect(
      lowered.map(({ key, typeName, optional, declaredDefault }) => ({
        key,
        typeName,
        optional,
        declaredDefault,
      }))
    ).toEqual([
      {
        key: 'calibrated',
        typeName: 'bool',
        optional: true,
        declaredDefault: 'sensorFallback()',
      },
      { key: 'drift', typeName: 'i64', optional: false, declaredDefault: null },
    ]);
    expect(lowered.every((field) => !isKnown(field.initial))).toBe(true);
  });

  it('ignores honest opaque and unannotated fields without reparsing their raw body', () => {
    expect(
      lowerUnknownHSPlusStructFields({
        name: 'LegacyPacket',
        body: 'code: i32',
        fields: [{ projection: 'preserved-opaque', name: 'code', optional: true }],
      })
    ).toEqual([]);
    expect(
      lowerUnknownHSPlusStructFields({
        name: 'PlainPacket',
        fields: [
          { projection: 'typed', name: 'code', type: 'i32' },
          { projection: 'typed', name: 'ready', type: 'bool', annotations: [] },
        ],
      })
    ).toEqual([]);
  });

  it('rejects duplicate field names because annotation binding would be ambiguous', () => {
    expect(() =>
      lowerUnknownHSPlusStructFields(
        injectedHSPlusStruct([
          {
            projection: 'typed',
            name: 'reading',
            type: 'i32',
            annotations: ['unknown'],
          },
          { projection: 'preserved-opaque', name: 'reading' },
        ])
      )
    ).toThrow(TypeError);
    expect(() =>
      lowerUnknownHSPlusStructFields(
        injectedHSPlusStruct([
          { projection: 'typed', name: 'reading', type: 'i32' },
          { projection: 'typed', name: 'reading', type: 'i64' },
        ])
      )
    ).toThrow(/ambiguous/);
  });

  it('rejects non-canonical injected names and type whitespace', () => {
    expect(() =>
      lowerUnknownHSPlusStructFields(
        injectedHSPlusStruct([{ projection: 'typed', name: ' value ', type: 'i32' }])
      )
    ).toThrow(/canonical whitespace/);
    expect(() =>
      lowerUnknownHSPlusStructFields(
        injectedHSPlusStruct([{ projection: 'typed', name: 'value', type: ' i32 ' }])
      )
    ).toThrow(/canonical whitespace/);
  });

  it.each([
    [{ projection: 'typed', name: 'missing' }, /requires a non-empty type/],
    [{ projection: 'typed', name: 'empty', type: '   ' }, /requires a non-empty type/],
    [
      {
        projection: 'typed',
        name: 'unsupported',
        type: 'i32',
        annotations: ['deprecated'],
      },
      /Unsupported .*@deprecated/,
    ],
    [
      {
        projection: 'typed',
        name: 'duplicate',
        type: 'i32',
        annotations: ['unknown', 'unknown'],
      },
      /Duplicate .*@unknown/,
    ],
    [
      {
        projection: 'preserved-opaque',
        name: 'opaqueUnknown',
        annotations: ['unknown'],
      },
      /requires projection "typed"/,
    ],
    [
      {
        projection: 'future-opaque',
        name: 'nonTypedUnknown',
        annotations: ['unknown'],
      },
      /requires projection "typed"/,
    ],
    [
      {
        projection: 'preserved-opaque',
        name: 'opaqueAnnotation',
        annotations: ['deprecated'],
      },
      /cannot carry type or annotations/,
    ],
    [
      { projection: 'preserved-opaque', name: 'opaqueType', type: 'i32' },
      /cannot carry type or annotations/,
    ],
    [
      {
        projection: 'preserved-opaque',
        name: 'opaqueDefault',
        defaultSource: '0',
      },
      /cannot carry a default initializer/,
    ],
  ])('rejects runtime-invalid injected HoloScript+ field %#', (field, diagnostic) => {
    expect(() => lowerUnknownHSPlusStructFields(injectedHSPlusStruct([field]))).toThrowError(
      diagnostic
    );
  });
});
