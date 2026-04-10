import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';

describe('Trait Constraints Validation', () => {
  let parser: HoloScriptPlusParser;
  let typeChecker: HoloScriptTypeChecker;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
    typeChecker = new HoloScriptTypeChecker();
  });

  it('should report error when @physics is missing @collidable', () => {
    const code = `
      orb test {
        @physics(mass: 1.0)
      }
    `;
    const parseResult = parser.parse(code);
    const checkResult = typeChecker.check(parseResult.ast.body);

    expect(checkResult.valid).toBe(false);
    expect(
      checkResult.diagnostics.some(
        (d) =>
          d.message.includes('Physics enabled objects must be collidable') ||
          d.message.includes('requires @collidable')
      )
    ).toBe(true);
  });

  it('should report error when @grabbable is missing @physics', () => {
    const code = `
      orb test {
        @grabbable
        @collidable
      }
    `;
    const parseResult = parser.parse(code);
    const checkResult = typeChecker.check(parseResult.ast.body);

    expect(checkResult.valid).toBe(false);
    expect(
      checkResult.diagnostics.some(
        (d) =>
          d.message.includes('Grabbable objects require physics') ||
          d.message.includes('requires @physics')
      )
    ).toBe(true);
  });

  it('should report error for conflicting traits (@static and @physics)', () => {
    const code = `
      orb test {
        @static
        @physics
      }
    `;
    const parseResult = parser.parse(code);
    const checkResult = typeChecker.check(parseResult.ast.body);

    expect(checkResult.valid).toBe(false);
    expect(
      checkResult.diagnostics.some(
        (d) =>
          d.message.includes('Static objects cannot have physics') ||
          d.message.includes('conflicts with @physics')
      )
    ).toBe(true);
  });
});
