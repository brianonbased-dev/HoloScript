import { isKnown } from '@holoscript/meaning';
import { describe, expect, it } from 'vitest';

import {
  HSPlusStructMeaningLoweringError,
  lowerHSPlusUnknownStructsToMeaning,
} from '../HSPlusStructMeaningLowering';

describe('lowerHSPlusUnknownStructsToMeaning', () => {
  it('lowers parser-admitted @unknown record fields without reparsing raw bodies', () => {
    const projection = lowerHSPlusUnknownStructsToMeaning(
      `struct SensorReading {
  device_id: string
  @unknown temperature_c?: float = sensorFallbackCelsius()
  sequence: i64
}

struct PlainRecord {
  label: string
}

struct LegacyConfig {
  timeout: 5000
}`,
      { sourceId: 'sensor-service.hsplus' }
    );

    expect(projection).toMatchObject({
      schema: 'holoscript.hsplus-unknown-struct-meaning.v1',
      format: '.hsplus',
      parser: 'HoloScriptPlusParser',
      sourceId: 'sensor-service.hsplus',
    });
    expect(projection.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(projection.structs).toHaveLength(1);
    expect(projection.structs[0]).toMatchObject({
      name: 'SensorReading',
      source: {
        line: 1,
        column: 1,
      },
      unknownFields: [
        {
          key: 'temperature_c',
          typeName: 'float',
          optional: true,
          declaredDefault: 'sensorFallbackCelsius()',
        },
      ],
    });
    expect(isKnown(projection.structs[0].unknownFields[0].initial)).toBe(false);
  });

  it('preserves source declaration order and excludes structs with no lowered unknowns', () => {
    const projection = lowerHSPlusUnknownStructsToMeaning(`struct First {
  @unknown alpha: i32
}
struct Plain {
  value: string
}
struct Second {
  @unknown beta: i64
  @unknown gamma?: bool = false
}`);

    expect(projection.structs.map(({ name }) => name)).toEqual(['First', 'Second']);
    expect(
      projection.structs.map(({ unknownFields }) => unknownFields.map(({ key }) => key))
    ).toEqual([['alpha'], ['beta', 'gamma']]);
  });

  it('fails closed when strict parsing cannot establish an exact field projection', () => {
    expect(() =>
      lowerHSPlusUnknownStructsToMeaning('struct Broken { @unknown value: Map<> }')
    ).toThrowError(HSPlusStructMeaningLoweringError);

    try {
      lowerHSPlusUnknownStructsToMeaning('struct Broken { @unknown value: Map<> }');
    } catch (error) {
      expect(error).toBeInstanceOf(HSPlusStructMeaningLoweringError);
      expect((error as HSPlusStructMeaningLoweringError).code).toBe('invalid-source');
    }
  });

  it('rejects parser-synthesized names without conflating them with an authored name', () => {
    expect(() => lowerHSPlusUnknownStructsToMeaning('struct { @unknown value: i32 }')).toThrowError(
      HSPlusStructMeaningLoweringError
    );
    try {
      lowerHSPlusUnknownStructsToMeaning('struct { @unknown value: i32 }');
    } catch (error) {
      expect((error as HSPlusStructMeaningLoweringError).code).toBe('invalid-struct');
    }

    const explicit = lowerHSPlusUnknownStructsToMeaning('struct anonymous { @unknown value: i32 }');
    expect(explicit.structs.map(({ name }) => name)).toEqual(['anonymous']);
  });
});
