import { readFileSync } from 'node:fs';

import { isKnown } from '@holoscript/meaning';
import { describe, expect, it } from 'vitest';

import { lowerHSPlusUnknownStructsToMeaning } from '../../semantics/HSPlusStructMeaningLowering';
import type { HSPlusNode } from '../../types/HoloScriptPlus';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

const source = readFileSync(
  new URL('../../../../../examples/hsplus/systems/typed-sensor-service.hsplus', import.meta.url),
  'utf8'
);

function topLevelNodes(root: HSPlusNode): HSPlusNode[] {
  return root.type === 'fragment' ? (root.children ?? []) : [root];
}

describe('general-purpose .hsplus systems fixture', () => {
  it('recognizes and lowers a typed record beside raw service declarations without agent syntax', () => {
    const result = new HoloScriptPlusParser({ strict: true }).parse(source);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);

    const declarations = topLevelNodes(result.ast.root);
    expect(declarations.map(({ type, name }) => [type, name])).toEqual([
      ['struct', 'SensorReading'],
      ['interface', 'SensorDevice'],
      ['class', 'SensorService'],
    ]);

    const [reading, device, service] = declarations;
    expect(reading.body).toContain('@unknown temperature_c?: float = sensorFallbackCelsius()');
    expect(device.body).toContain('read(): SensorReading');
    expect(service.body).toContain('ingest(device: SensorDevice): SensorReading');

    expect(reading.fields).toEqual([
      { projection: 'typed', name: 'device_id', type: 'string' },
      {
        projection: 'typed',
        name: 'temperature_c',
        type: 'float',
        annotations: ['unknown'],
        optional: true,
        defaultSource: 'sensorFallbackCelsius()',
      },
      { projection: 'typed', name: 'sequence', type: 'i64' },
      { projection: 'typed', name: 'healthy', type: 'bool' },
    ]);
    const meaning = lowerHSPlusUnknownStructsToMeaning(source, {
      sourceId: 'examples/hsplus/systems/typed-sensor-service.hsplus',
    });
    expect(meaning).toMatchObject({
      schema: 'holoscript.hsplus-unknown-struct-meaning.v1',
      format: '.hsplus',
      parser: 'HoloScriptPlusParser',
      sourceId: 'examples/hsplus/systems/typed-sensor-service.hsplus',
    });
    expect(meaning.structs.map(({ name }) => name)).toEqual(['SensorReading']);

    const lowered = meaning.structs[0].unknownFields;
    expect(lowered).toHaveLength(1);
    expect(lowered[0]).toMatchObject({
      key: 'temperature_c',
      typeName: 'float',
      optional: true,
      declaredDefault: 'sensorFallbackCelsius()',
    });
    expect(isKnown(lowered[0].initial)).toBe(false);

    // Honest current boundary: interface/class members remain raw and none of
    // these declarations claims type checking or native execution.
    expect(device.fields).toBeUndefined();
    expect(service.fields).toBeUndefined();
    expect(reading.children).toEqual([]);
    expect(reading.properties).toEqual({});
  });
});
