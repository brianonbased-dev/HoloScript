import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  ASTProgram,
  HSPlusCompileResult,
  HSPlusNode,
  HSPlusParseResult,
  HSPlusStructField,
} from '../ast';

describe('HoloScript+ public AST mirror', () => {
  it('preserves structured fields and parser name provenance', () => {
    const field: HSPlusStructField = {
      name: 'reading',
      projection: 'typed',
      type: 'i32',
      annotations: ['unknown'],
    };
    const node: HSPlusNode = {
      type: 'struct',
      name: 'SensorReading',
      nameOrigin: 'explicit',
      fields: [field],
      body: '@unknown reading: i32',
    };
    const ast: ASTProgram = {
      type: 'Program',
      children: [node],
      body: [node],
      version: '1.0',
      root: node,
      imports: [],
      hasState: false,
      hasVRTraits: false,
      hasControlFlow: false,
    };
    const compatibilityResult: HSPlusCompileResult = {
      success: false,
      errors: [],
    };
    const result: HSPlusParseResult = {
      success: true,
      errors: [],
      ast,
    };

    expect(compatibilityResult.ast).toBeUndefined();
    expect(result.ast.root.fields?.[0]).toEqual(field);
    expect(result.ast.root.nameOrigin).toBe('explicit');
    expectTypeOf(result.ast.children).toEqualTypeOf<HSPlusNode[]>();
    expectTypeOf(result.ast.root.fields).toEqualTypeOf<HSPlusStructField[] | undefined>();
  });
});
