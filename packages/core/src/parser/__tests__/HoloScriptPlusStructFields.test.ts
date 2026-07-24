import { describe, expect, it } from 'vitest';

import {
  HoloScriptPlusParser,
  type HSPlusNode,
  type HSPlusStructField,
} from '../HoloScriptPlusParser';

function parseStruct(source: string): {
  node: HSPlusNode;
  success: boolean;
  errors: Array<{ message: string }>;
} {
  const result = new HoloScriptPlusParser().parse(source);
  const root = result.ast.root as HSPlusNode;
  const node = root.type === 'fragment' ? root.children?.[0] : root;
  if (!node) throw new Error('Expected parsed struct node');
  return { node, success: result.success, errors: result.errors };
}

describe('HoloScriptPlusParser struct fields', () => {
  it('adds an aligned typed field view while preserving the raw body', () => {
    const source = `struct SensorReading {
  @unknown reading: i32,
  calibrated: bool
}`;

    const { node, success } = parseStruct(source);

    expect(success).toBe(true);
    expect(node.type).toBe('struct');
    expect(node.name).toBe('SensorReading');
    expect(node.nameOrigin).toBe('explicit');
    expect(node.body).toBe('@unknown reading: i32,\n  calibrated: bool');
    expect(node.fields satisfies HSPlusStructField[] | undefined).toEqual([
      {
        projection: 'typed',
        name: 'reading',
        type: 'i32',
        annotations: ['unknown'],
      },
      { projection: 'typed', name: 'calibrated', type: 'bool' },
    ]);
  });

  it('marks a fallback struct identity as synthetic instead of presenting it as authored', () => {
    const { node, success } = parseStruct('struct { @unknown value: i32 }');

    expect(success).toBe(true);
    expect(node.name).toBe('anonymous');
    expect(node.nameOrigin).toBe('synthetic');
  });

  it('marks value-shaped legacy members opaque instead of relabeling them as types', () => {
    const { node, success } = parseStruct(`struct Config {
  timeout: 5000
  enabled: true
  tags: ["a", "b"]
  nested: { x: 1 }
}`);

    expect(success).toBe(true);
    expect(node.body).toBe(
      'timeout: 5000\n  enabled: true\n  tags: ["a", "b"]\n  nested: { x: 1 }'
    );
    expect(node.fields).toEqual([
      { projection: 'preserved-opaque', name: 'timeout' },
      { projection: 'preserved-opaque', name: 'enabled' },
      { projection: 'preserved-opaque', name: 'tags' },
      { projection: 'preserved-opaque', name: 'nested' },
    ]);
  });

  it('preserves optionality and authored defaults on typed and @unknown fields', () => {
    const { node, success } = parseStruct(`struct FormatterConfig {
  @unknown reading?: i32 = sensorFallback()
  indentSize: number = 2
  name?: string
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'reading',
        type: 'i32',
        annotations: ['unknown'],
        optional: true,
        defaultSource: 'sensorFallback()',
      },
      {
        projection: 'typed',
        name: 'indentSize',
        type: 'number',
        defaultSource: '2',
      },
      { projection: 'typed', name: 'name', type: 'string', optional: true },
    ]);
  });

  it('admits nested generics, arrays, tuples, unions, and qualified type names', () => {
    const { node, success } = parseStruct(`struct Registry {
  readings: Map<string, Result<i32>>,
  ids: Domain.Identifier[]
  window: [i32, string]
  value: i32 | string
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'readings',
        type: 'Map<string, Result<i32>>',
      },
      { projection: 'typed', name: 'ids', type: 'Domain.Identifier[]' },
      { projection: 'typed', name: 'window', type: '[i32, string]' },
      { projection: 'typed', name: 'value', type: 'i32 | string' },
    ]);
  });

  it('admits multiline nested generic types without retaining layout tokens', () => {
    const { node, success } = parseStruct(`struct Registry {
  @unknown readings: Map<
    string,
    Result<i32>
  >[]
  ready: bool
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'readings',
        type: 'Map<string, Result<i32>>[]',
        annotations: ['unknown'],
      },
      { projection: 'typed', name: 'ready', type: 'bool' },
    ]);
  });

  it('preserves TypeScript-style semicolon field separators without poisoning types', () => {
    const { node, success } = parseStruct('struct Reading { @unknown value: i32; ready: bool; }');

    expect(success).toBe(true);
    expect(node.body).toBe('@unknown value: i32; ready: bool;');
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'value',
        type: 'i32',
        annotations: ['unknown'],
      },
      { projection: 'typed', name: 'ready', type: 'bool' },
    ]);
  });

  it('keeps trailing comments out of canonical type text', () => {
    const { node, success } = parseStruct(`struct Reading {
  @unknown value: i32 // sensor may not have reported yet
  ready: bool
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'value',
        type: 'i32',
        annotations: ['unknown'],
      },
      { projection: 'typed', name: 'ready', type: 'bool' },
    ]);
  });

  it('keeps a newline inside a block comment as a top-level field boundary', () => {
    const { node, success } = parseStruct(`struct Reading {
  first: i32 /* comment
  */ second: bool
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      { projection: 'typed', name: 'first', type: 'i32' },
      { projection: 'typed', name: 'second', type: 'bool' },
    ]);
  });

  it('excludes a multiline trailing comment from an authored default boundary', () => {
    const { node, success } = parseStruct(`struct Reading {
  @unknown first?: i32 = fallback() /* comment
  */ second: bool
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'first',
        type: 'i32',
        annotations: ['unknown'],
        optional: true,
        defaultSource: 'fallback()',
      },
      { projection: 'typed', name: 'second', type: 'bool' },
    ]);
  });

  it('keeps initializer generic commas nested while comparisons remain operators', () => {
    const { node, success } = parseStruct(`struct Defaults {
  cache: T = make<Map<string, i32>>();
  choice: T = choose<A, B>()
  enabled: bool = threshold > 0
  limit: number = value < cap
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'cache',
        type: 'T',
        defaultSource: 'make<Map<string, i32>>()',
      },
      {
        projection: 'typed',
        name: 'choice',
        type: 'T',
        defaultSource: 'choose<A, B>()',
      },
      {
        projection: 'typed',
        name: 'enabled',
        type: 'bool',
        defaultSource: 'threshold > 0',
      },
      {
        projection: 'typed',
        name: 'limit',
        type: 'number',
        defaultSource: 'value < cap',
      },
    ]);
  });

  it('does not treat semicolons inside escaped string defaults as field separators', () => {
    const { node, success } = parseStruct(
      String.raw`struct Defaults { value: string = "a\n;b"; ready: bool; }`
    );

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'value',
        type: 'string',
        defaultSource: String.raw`"a\n;b"`,
      },
      { projection: 'typed', name: 'ready', type: 'bool' },
    ]);
  });

  it('does not let generic-call lookahead cross a comma field boundary', () => {
    const { node, success } = parseStruct(
      'struct Defaults { value: bool = left < right, other: T = factory > (0), ready: bool }'
    );

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'value',
        type: 'bool',
        defaultSource: 'left < right',
      },
      {
        projection: 'typed',
        name: 'other',
        type: 'T',
        defaultSource: 'factory > (0)',
      },
      { projection: 'typed', name: 'ready', type: 'bool' },
    ]);
  });

  it('preserves the raw struct path tolerance for parameter lists', () => {
    const { node, success } = parseStruct('struct Packet(seed: i32) { value: i32 }');

    expect(success).toBe(true);
    expect(node.name).toBe('Packet');
    expect(node.fields).toEqual([{ projection: 'typed', name: 'value', type: 'i32' }]);
  });

  it('preserves unsupported unannotated type forms as explicit opaque projections', () => {
    const { node, success } = parseStruct(`struct Compatibility {
  objectType: { x: number, y: number }
  conditional: T extends U ? X : Y
  literalType: "ready"
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      { projection: 'preserved-opaque', name: 'objectType' },
      { projection: 'preserved-opaque', name: 'conditional' },
      { projection: 'preserved-opaque', name: 'literalType' },
    ]);
  });

  it('treats lexer keywords as contextual struct field names', () => {
    const { node, success } = parseStruct('struct ModuleInfo { state: string[] }');

    expect(success).toBe(true);
    expect(node.fields).toEqual([{ projection: 'typed', name: 'state', type: 'string[]' }]);
  });

  it.each([
    'struct Reading { @unknown value: i32 @secret }',
    'struct Reading { @unknown value: i32 + 1 }',
    'struct Reading { @unknown value: Map<> }',
    'struct Reading { @unknown value: Map<string,,i32> }',
    'struct Reading { @unknown value: i32 | }',
    'struct Reading { @unknown value: i32 nonsense }',
    'struct Reading { @unknown value: i32> }',
    'struct Reading { @unknown value: 5000 }',
    'struct Reading { @unknown value: T extends U ? X : Y }',
  ])('fails closed on unsupported annotated type syntax: %s', (source) => {
    const { node, success } = parseStruct(source);

    expect(success).toBe(false);
    expect(node.fields).toEqual([]);
  });

  it.each(['secret', 'nullable'])('fails closed on unsupported @%s modifiers', (modifier) => {
    const { node, success, errors } = parseStruct(`struct Reading {
  @${modifier} value: i32
}`);

    expect(success).toBe(false);
    expect(node.fields).toEqual([]);
    expect(errors.some((error) => error.message.includes('only @unknown is admitted'))).toBe(true);
  });

  it.each([
    'struct Reading { @unknown value }',
    'struct Reading { @unknown : i32 }',
    'struct Reading { @unknown value: }',
    'struct Reading { @unknown @unknown value: i32 }',
    'struct Reading { @unknown(reason: "x") value: i32 }',
    'struct Reading { @unknown value: i32 = }',
  ])('fails closed on malformed annotated fields: %s', (source) => {
    const { node, success } = parseStruct(source);

    expect(success).toBe(false);
    expect(node.fields).toEqual([]);
  });

  it.each([
    'struct Reading { value: i32 @unknown }',
    'struct Reading { value: i32 @unknown other: i64 }',
    'struct Reading { value: @unknown i32 }',
    'struct Reading { value: i32 = 0 @unknown }',
  ])('rejects live @unknown outside the admitted prefix position: %s', (source) => {
    const { node, success } = parseStruct(source);

    expect(success).toBe(false);
    expect(node.fields).toEqual([]);
  });

  it.each([
    'struct Reading { @unknown; value: i32 }',
    'struct Reading { @;unknown value: i32 }',
    'struct Reading { value;: i32 }',
    'struct Reading { @unknown value;: i32 }',
    'struct Reading { @unknown value?;: i32 }',
  ])('does not bind a field header across a semicolon separator: %s', (source) => {
    const { node, success } = parseStruct(source);

    expect(success).toBe(false);
    expect(node.fields).toEqual([]);
  });

  it.each([
    `struct Reading { @ /* comment
*/ unknown value: i32 }`,
    `struct Reading { value /* comment
*/ : i32 }`,
    `struct Reading { @unknown value /* comment
*/ : i32 }`,
    `struct Reading { @unknown value? /* comment
*/ : i32 }`,
  ])('does not hide a field-header newline inside a block comment: %s', (source) => {
    const { node, success } = parseStruct(source);

    expect(success).toBe(false);
    expect(node.fields).toEqual([]);
  });

  it('allows a block-comment newline between a complete modifier and its field', () => {
    const { node, success } = parseStruct(`struct Reading {
  @unknown /* annotation explanation
  */ value: i32
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'value',
        type: 'i32',
        annotations: ['unknown'],
      },
    ]);
  });

  it('ignores @unknown and semicolons inside comments and quoted initializer text', () => {
    const { node, success } = parseStruct(`struct Reading {
  @unknown /* ; is comment text */ value: i32
  label: string = "@unknown; still text"
  ready: bool // @unknown is comment text
}`);

    expect(success).toBe(true);
    expect(node.fields).toEqual([
      {
        projection: 'typed',
        name: 'value',
        type: 'i32',
        annotations: ['unknown'],
      },
      {
        projection: 'typed',
        name: 'label',
        type: 'string',
        defaultSource: '"@unknown; still text"',
      },
      { projection: 'typed', name: 'ready', type: 'bool' },
    ]);
  });

  it('does not float @unknown onto a neighboring field after a malformed declaration', () => {
    const { node, success } = parseStruct(`struct Reading {
  @unknown missing_type:
  calibrated: bool
}`);

    expect(success).toBe(false);
    expect(node.fields).toEqual([{ projection: 'typed', name: 'calibrated', type: 'bool' }]);
  });

  it('fails duplicate names and omits the ambiguous duplicate projection', () => {
    const { node, success, errors } = parseStruct(`struct Reading {
  value: i32
  @unknown value: i64
}`);

    expect(success).toBe(false);
    expect(node.fields).toEqual([{ projection: 'typed', name: 'value', type: 'i32' }]);
    expect(errors.some((error) => error.message.includes('binding ambiguous'))).toBe(true);
  });
});
