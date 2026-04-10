import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { HoloScriptCodeParser } from '../HoloScriptCodeParser';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';

describe('Better Type Inference', () => {
  let parser: HoloScriptPlusParser;
  let typeChecker: HoloScriptTypeChecker;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
    typeChecker = new HoloScriptTypeChecker();
  });

  it('should infer number, string, boolean literals', () => {
    expect(typeChecker.inferType(1.5).type).toBe('number');
    expect(typeChecker.inferType('hello').type).toBe('string');
    expect(typeChecker.inferType(true).type).toBe('boolean');
  });

  it('should infer vec2, vec3, vec4 from number arrays', () => {
    expect(typeChecker.inferType([1, 2]).type).toBe('vec2');
    expect(typeChecker.inferType([1, 2, 3]).type).toBe('vec3');
    expect(typeChecker.inferType([1, 2, 3, 4]).type).toBe('vec4');
    expect(typeChecker.inferType([1, 2, 3, 4, 5]).type).toBe('array');
  });

  it('should infer color from hex and rgba strings', () => {
    expect(typeChecker.inferType('#ff0000').type).toBe('color');
    expect(typeChecker.inferType('#abc').type).toBe('color');
    expect(typeChecker.inferType('rgba(255, 0, 0, 1)').type).toBe('color');
    expect(typeChecker.inferType('not-a-color').type).toBe('string');
  });

  it('should narrow string to color with context', () => {
    const expected = { type: 'color' as any };
    expect(typeChecker.inferTypeWithContext('#ff0', expected).type).toBe('color');
    // Even if it doesn't look like a color literal, context might accept it (e.g. named color)
    expect(typeChecker.inferTypeWithContext('red', expected).type).toBe('color');
  });

  it('should narrow array to euler or quat with context', () => {
    const expectedEuler = { type: 'euler' as any };
    const expectedQuat = { type: 'quat' as any };

    expect(typeChecker.inferTypeWithContext([0, 90, 0], expectedEuler).type).toBe('euler');
    expect(typeChecker.inferTypeWithContext([0, 0, 0, 1], expectedQuat).type).toBe('quat');
  });

  it('should infer spatial types in orb properties', () => {
    const code = `
      orb test {
        position: [0, 1, 0]
        color: "#ffffff"
        rotation: [0, 45, 0]
        custom_vec: [1, 2]
      }
    `;
    const result = parser.parse(code);
    typeChecker.check(result.ast.body);

    const orbType = typeChecker.getType('test');
    expect(orbType?.type).toBe('orb');

    const props = orbType?.properties;
    expect(props?.get('position')?.type).toBe('vec3');
    expect(props?.get('color')?.type).toBe('color');
    expect(props?.get('rotation')?.type).toBe('euler');
    expect(props?.get('custom_vec')?.type).toBe('vec2');
  });

  it('should report error on type mismatch', () => {
    const codeParser = new HoloScriptCodeParser();
    const code = `
      let count: number = "not-a-number"
    `;
    const result = codeParser.parse(code);
    expect(result.ast.length).toBeGreaterThan(0);
    const checkResult = typeChecker.check(result.ast);

    expect(checkResult.valid).toBe(false);
    expect(checkResult.diagnostics.some((d) => d.message.includes('Type mismatch'))).toBe(true);
  });

  it('should report error on spatial type mismatch', () => {
    const codeParser = new HoloScriptCodeParser();
    const code = `
      let pos: vec3 = [1, 2] // Needs 3 numbers
    `;
    const result = codeParser.parse(code);
    const checkResult = typeChecker.check(result.ast);

    expect(checkResult.diagnostics.some((d) => d.message.includes('Type mismatch'))).toBe(true);
    expect(checkResult.valid).toBe(false);
  });
});
