/**
 * Stage 1 change 2: `?` and `= default` after a field value.
 *
 * The spec corpus runner (`scripts/holo-ci/check-spec-corpus.mjs`) replays
 * `hsplus-spec-corpus.v0.jsonl` against the WASM `.hs` reader only. These
 * tests are the `.hsplus` proof for the rows that change under this reader.
 * Mark names match the `.hs` PropertyNode: `optional`, `default_value`.
 * They live on `node.fieldMarks`, keyed by property name. The property value
 * itself stays the value it was before the mark.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import {
  HoloScriptPlusParser,
  type HSPlusFieldMark,
  type HSPlusNode,
} from '../HoloScriptPlusParser';

const require = createRequire(import.meta.url);
const wasm = require('../../../../compiler-wasm/pkg-node/holoscript_wasm.js') as {
  validate_detailed: (source: string) => string;
};

function parseSource(source: string): { success: boolean; errors: Array<{ message: string }>; node: HSPlusNode } {
  const result = new HoloScriptPlusParser().parse(source);
  const root = result.ast.root as HSPlusNode;
  return { success: result.success, errors: result.errors, node: root };
}

function nodeWith(root: HSPlusNode, key: string): HSPlusNode {
  const found = findNode(root, key);
  if (!found) throw new Error(`No node stores property ${key}`);
  return found;
}

function findNode(node: HSPlusNode, key: string): HSPlusNode | undefined {
  if (node.properties && Object.prototype.hasOwnProperty.call(node.properties, key)) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, key);
    if (found) return found;
  }
  return undefined;
}

function mark(node: HSPlusNode, key: string): HSPlusFieldMark | undefined {
  return node.fieldMarks?.[key];
}

describe('HoloScriptPlus field optional and default marks', () => {
  it('optional-001: provider: String? is optional and required stays a plain field', () => {
    const source = `@trait Config {
  provider: String?
  required: String
}`;
    const { success, errors, node } = parseSource(source);
    expect(errors).toEqual([]);
    expect(success).toBe(true);
    const config = nodeWith(node, 'provider');
    expect(config.properties?.provider).toEqual({ __ref: 'String' });
    expect(mark(config, 'provider')).toEqual({ optional: true });
    expect(config.properties?.required).toEqual({ __ref: 'String' });
    expect(mark(config, 'required')).toBeUndefined();
  });

  it('unknown-binding-002: Celsius? is optional beside @unknown', () => {
    const source = `@trait Reading {
  @unknown
  value: Celsius?
}`;
    const { success, node } = parseSource(source);
    expect(success).toBe(true);
    const reading = nodeWith(node, 'value');
    expect(reading.properties?.value).toEqual({ __ref: 'Celsius' });
    expect(mark(reading, 'value')).toEqual({ optional: true });
  });

  it('default-005: auto_register: Bool = true keeps Bool and stores default true', () => {
    const source = `@trait Config {
  auto_register: Bool = true
}`;
    const { success, errors, node } = parseSource(source);
    expect(errors).toEqual([]);
    expect(success).toBe(true);
    const config = nodeWith(node, 'auto_register');
    expect(config.properties?.auto_register).toEqual({ __ref: 'Bool' });
    expect(mark(config, 'auto_register')).toEqual({ default_value: true });
  });

  it('default-001: Temperature = 20.0 stores the default and keeps the type', () => {
    const source = `@trait Sensor {
  @unknown
  reading: Temperature = 20.0
  display: reading
}`;
    const { success, node } = parseSource(source);
    expect(success).toBe(true);
    const sensor = nodeWith(node, 'reading');
    expect(sensor.properties?.reading).toEqual({ __ref: 'Temperature' });
    expect(mark(sensor, 'reading')).toEqual({ default_value: 20 });
    expect(sensor.properties?.display).toEqual({ __ref: 'reading' });
    expect(mark(sensor, 'display')).toBeUndefined();
  });

  it('default-004: a guarded default keeps ?? as null-coalesce', () => {
    const source = `@trait Sensor {
  @unknown
  raw: Temperature
  calibrated: Temperature = raw ?? 0.0
}`;
    const { success, node } = parseSource(source);
    expect(success).toBe(true);
    const sensor = nodeWith(node, 'calibrated');
    expect(sensor.properties?.calibrated).toEqual({ __ref: 'Temperature' });
    expect(mark(sensor, 'calibrated')).toEqual({
      default_value: {
        type: 'binary',
        operator: '??',
        left: { __ref: 'raw' },
        right: 0,
      },
    });
    expect(sensor.properties?.raw).toEqual({ __ref: 'Temperature' });
    expect(mark(sensor, 'raw')).toBeUndefined();
  });

  it('default-003: Temperature = raw is a plus syntax success and stays an invalid .hs program', () => {
    const source = `@trait Sensor {
  @unknown
  raw: Temperature
  calibrated: Temperature = raw
}`;
    const { success, errors, node } = parseSource(source);
    expect(errors).toEqual([]);
    expect(success).toBe(true);
    const sensor = nodeWith(node, 'calibrated');
    expect(sensor.properties?.calibrated).toEqual({ __ref: 'Temperature' });
    expect(mark(sensor, 'calibrated')).toEqual({ default_value: { __ref: 'raw' } });

    const hs = JSON.parse(wasm.validate_detailed(source)) as {
      valid?: boolean;
      errors?: Array<{ message?: string }>;
    };
    expect(hs.valid).toBe(false);
    const detail = (hs.errors ?? []).map((error) => error.message ?? '').join(' | ');
    expect(detail).toContain('default of field');
  });

  it('stores both marks when .hs allows Type? = expr', () => {
    const source = `@trait wasm_api {
  llm_provider_id: String? = null
}`;
    const { success, errors, node } = parseSource(source);
    expect(errors).toEqual([]);
    expect(success).toBe(true);
    const trait = nodeWith(node, 'llm_provider_id');
    expect(trait.properties?.llm_provider_id).toEqual({ __ref: 'String' });
    expect(mark(trait, 'llm_provider_id')).toEqual({ optional: true, default_value: null });

    const hs = JSON.parse(wasm.validate_detailed(source)) as { valid?: boolean };
    expect(hs.valid).toBe(true);
  });

  it('leaves a plain reading: Temperature field unchanged', () => {
    const source = `@trait Sensor { reading: Temperature }`;
    const { success, node } = parseSource(source);
    expect(success).toBe(true);
    const sensor = nodeWith(node, 'reading');
    expect(sensor.properties?.reading).toEqual({ __ref: 'Temperature' });
    expect(sensor.fieldMarks).toBeUndefined();
  });

  it('leaves a plain maxHP: 100 field unchanged', () => {
    const source = `@trait Health { maxHP: 100 }`;
    const { success, node } = parseSource(source);
    expect(success).toBe(true);
    const health = nodeWith(node, 'maxHP');
    expect(health.properties?.maxHP).toBe(100);
    expect(health.fieldMarks).toBeUndefined();
  });

  it('coalesce-001: a ?? b stays null-coalesce and is not an optional mark', () => {
    const source = `@trait T {
  a: Num
  b: a ?? 3
}`;
    const { success, node } = parseSource(source);
    expect(success).toBe(true);
    const trait = nodeWith(node, 'b');
    expect(trait.properties?.b).toEqual({
      type: 'binary',
      operator: '??',
      left: { __ref: 'a' },
      right: 3,
    });
    expect(trait.fieldMarks).toBeUndefined();
    expect(trait.properties?.a).toEqual({ __ref: 'Num' });
  });

  it('keeps a ternary ? : and does not store an optional mark', () => {
    const source = `object "Test" {
  isEnabled: isActive ? true : false
}`;
    const { success, node } = parseSource(source);
    expect(success).toBe(true);
    const object = nodeWith(node, 'isEnabled');
    expect(object.properties?.isEnabled).toEqual({
      type: 'ternary',
      condition: { __ref: 'isActive' },
      trueValue: true,
      falseValue: false,
    });
    expect(object.fieldMarks).toBeUndefined();
  });

  it('keeps ?. optional chaining on the reference', () => {
    const source = `object "T" { val: user?.name }`;
    const { success, node } = parseSource(source);
    expect(success).toBe(true);
    const object = nodeWith(node, 'val');
    expect(object.properties?.val).toEqual({ __ref: 'user?.name' });
    expect(object.fieldMarks).toBeUndefined();
  });
});
