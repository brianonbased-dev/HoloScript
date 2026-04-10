import { describe, it, expect } from 'vitest';
import { HoloScriptFormatter } from '../index';

describe('Range Formatting', () => {
  const formatter = new HoloScriptFormatter({
    indentSize: 2,
    braceStyle: 'same-line',
  });

  const source = `
composition "Test" {
    object "Cube" {
      position: [0, 0, 0]
      
    scale: [1, 1, 1]
    }
}
`;

  it('should format a specific range preserving context', () => {
    // We want to format lines 5-6 (the object body content)
    // Line 5 is empty (but might have whitespace), Line 6 is '    scale: [1, 1, 1]' (wrong indent)
    // 0-indexed:
    // 0: empty
    // 1: composition "Test" {
    // 2:     object "Cube" {
    // 3:       position: [0, 0, 0]
    // 4:
    // 5:     scale: [1, 1, 1]
    // 6:     }
    // 7: }

    // Let's format just the scale line (line 6 in 1-based, index 5 in 0-based array split)
    // But the ranges passed to formatRange are usually line numbers (0-based or 1-based depending on impl).
    // Let's assume 0-based startLine and endLine (exclusive or inclusive? usually inclusive in VSCode logic or line range).
    // Let's define the interface in index.ts first, but here assuming startLine, endLine (inclusive).

    // Target Line: '    scale: [1, 1, 1]' -> should become '      scale: [1, 1, 1]' (indent 6, 3 levels deep? No 2 levels deep: Comp > Obj)
    // Composition (0)
    //   Object (2)
    //     Prop (4)

    // Using default indent 2:
    // composition {
    //   object {
    //     position...
    //     scale...
    //   }
    // }

    // So 'scale' should have 4 spaces.

    // In the input:
    // composition...
    //     object... (4 spaces) -> should be 2
    //       position... (6 spaces) -> should be 4
    //     scale... (4 spaces) -> should be 4

    // Wait, the input has indentation issues.
    // If we format everything:
    // composition "Test" {
    //   object "Cube" {
    //     position: [0, 0, 0]
    //
    //     scale: [1, 1, 1]
    //   }
    // }

    // We want to format specific lines.
    // If formatting ONLY line 6 (index 5): '    scale: [1, 1, 1]'
    // It should end up as '    scale: [1, 1, 1]' (4 spaces).

    const range = { startLine: 5, endLine: 5 }; // 0-based
    const result = formatter.formatRange(source, range);

    expect(result.formatted).toBe('    scale: [1, 1, 1]');
  });
});
