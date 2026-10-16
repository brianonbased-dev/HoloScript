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
});
