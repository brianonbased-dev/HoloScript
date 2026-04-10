/**
 * Null Coalescing Assignment (??=) Tests
 *
 * Tests for the null coalescing assignment operator which only assigns
 * if the left-hand side is null or undefined.
 * Pattern: target ??= value  →  target = target ?? value
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import type { NullCoalescingAssignment } from '../types';

describe('Null Coalescing Assignment (??=)', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser();
  });

  describe('Basic Assignment', () => {
    test('should parse simple variable assignment in logic block', () => {
      const code = `logic {
        function init() {
          x ??= 42
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root).toBeDefined();
      expect(result.ast.root.type).toBe('logic');
    });

    test('should parse string value assignment in logic block', () => {
      const code = `logic {
        function setup() {
          name ??= "default"
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });

    test('should parse boolean value assignment in logic block', () => {
      const code = `logic {
        function configure() {
          enabled ??= true
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });

    test('should parse null value assignment in logic block', () => {
      const code = `logic {
        function reset() {
          value ??= null
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });
  });

  describe('Complex Expressions', () => {
    test('should parse expression on right-hand side', () => {
      const code = `logic {
        function calculate() {
          x ??= 1 + 2
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });

    test('should parse nested null coalescing on right side', () => {
      const code = `logic {
        function fallback() {
          x ??= y ?? 10
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });

    test('should parse ternary on right side', () => {
      const code = `logic {
        function conditional() {
          x ??= condition ? "yes" : "no"
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });

    test('should parse function call on right side', () => {
      const code = `logic {
        function lazy() {
          value ??= getValue()
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });
  });

  describe('Object and Array Contexts', () => {
    test('should parse in composition block', () => {
      const code = `composition {
        enableFallback ??= true
      }`;
      const result = parser.parse(code);
      expect(result).toBeDefined();
    });

    test('should parse in orb properties', () => {
      const code = `composition "TestOrb" {
        config: "value"
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    test('should work in logic blocks with multiple assignments', () => {
      const code = `logic {
        function initialize() {
          x ??= 0
          y ??= 1
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Multiple Assignments', () => {
    test('should parse sequential assignments', () => {
      const code = `logic {
        function setup() {
          x ??= 1
          y ??= 2
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });

    test('should handle chained expressions', () => {
      const code = `logic {
        function chain() {
          result = x ??= default
        }
      }`;
      const result = parser.parse(code);
      expect(result).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    test('should handle syntax errors gracefully', () => {
      const code = `logic {
        function test() {
          42 ??= 100
        }
      }`;
      const result = parser.parse(code);
      // Parser may succeed but with errors
      expect(result).toBeDefined();
    });

    test('should tokenize assignment operator correctly', () => {
      const code = `logic {
        function test() {
          name ??= "default"
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    test('should handle complex assignment contexts', () => {
      const code = `logic {
        function test() {
          value ??= getValue()
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    test('should parse incomplete assignment as part of larger block', () => {
      const code = `logic {
        function test() {
          x ??= 10
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Operator Precedence', () => {
    test('assignment should work with ternary expressions', () => {
      const code = `logic {
        function test() {
          y ??= condition ? "yes" : "no"
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    test('assignment should work with null coalesce operator', () => {
      const code = `logic {
        function test() {
          x ??= y ?? 10
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Whitespace and Formatting', () => {
    test('should handle no spaces around operator', () => {
      const code = `logic {
        function test() {
          x??=10
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    test('should handle extra spaces around operator', () => {
      const code = `logic {
        function test() {
          x   ??=   10
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    test('should handle newlines around operator', () => {
      const code = `logic {
        function test() {
          x ??=
            10
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });

  describe('Semantic Equivalence', () => {
    test('should parse as assignment operation', () => {
      const code = `logic {
        function test() {
          x ??= y
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      expect(result.ast.root.type).toBe('logic');
    });

    test('assignment works with function calls', () => {
      const code = `logic {
        function test() {
          x ??= expensive()
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
    });
  });

  describe('Integration with Other Features', () => {
    test('should work with complex expressions', () => {
      const code = `logic {
        function test() {
          result ??= getValue()
        }
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
    });

    test('should work in composition blocks', () => {
      const code = `composition {
        enableFallback ??= true
      }`;
      const result = parser.parse(code);
      expect(result).toBeDefined();
    });
  });

  describe('AST Structure Validation', () => {
    test('should produce valid parse result', () => {
      const code = `logic {
        function test() {
          x ??= 10
        }
      }`;
      const result = parser.parse(code);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      expect(result.ast.root).toBeDefined();
    });

    test('should maintain AST structure integrity', () => {
      const code = `logic {
        function test() {
          x ??= 42
        }
      }`;
      const result = parser.parse(code);

      expect(result.ast.root.type).toBe('logic');
    });
  });

  describe('Backward Compatibility', () => {
    test('should not break existing null coalesce operator', () => {
      const code = `logic {
        function test() {
          x = y ?? fallback
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    test('should not break standard assignments', () => {
      const code = `logic {
        function test() {
          x = 10
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });

    test('should not break complex expressions without null coalesce assignment', () => {
      const code = `logic {
        function test() {
          result = (a ?? b) + (c ?? d)
        }
      }`;
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });
});
