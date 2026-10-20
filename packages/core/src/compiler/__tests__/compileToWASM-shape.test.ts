/** compileToWASM refuses anything that is not a Composition AST or source text (second-seat N1). */
import { describe, it, expect } from 'vitest';
import { compileToWASM } from '../WASMCompiler';
import { parseHolo } from '../../parser/HoloCompositionParser';

describe('compileToWASM input shape', () => {
  it.each([[{}], [{ type: 'Object', objects: [] }], [{ name: 'x' }], [[]], [null], [42]])('refuses %j with an HS1009 TypeError', (x) => {
    expect(() => compileToWASM(x as never)).toThrow(TypeError);
    expect(() => compileToWASM(x as never)).toThrow(/HS1009/);
  });
  it('a real composition (AST and source) still compiles', () => {
    const ast = parseHolo('composition "C" { object "Cube" { position: [0, 1, 0] } }').ast!;
    expect(ast.type).toBe('Composition');
    expect(compileToWASM(ast).wat).toContain('Cube');
    expect(compileToWASM('object Cube { position: [0, 1, 0] }' as never).wat).toContain('Cube');
  });
  it.each([
    [{ type: 'Composition', objects: 5 }],
    [{ type: 'Composition', objects: [null] }],
    [{ type: 'Composition', objects: [{}] }],
    [{ objects: [{ name: 'a', properties: 7 }] }],
  ])('an inner failure on %j carries HS1009, not a raw TypeError', (x) => {
    let caught: unknown;
    try {
      compileToWASM(x as never);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toMatch(/^compileToWASM: .*\(HS1009\)/);
    expect((caught as { code?: string }).code).toBe('HS1009');
    expect((caught as { cause?: unknown }).cause).toBeInstanceOf(Error);
  });
});
