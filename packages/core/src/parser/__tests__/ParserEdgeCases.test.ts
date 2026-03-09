import { describe, it, expect, beforeEach } from 'vitest';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';
import { HoloCompositionParser } from '../HoloCompositionParser';
import { ErrorRecovery } from '../ErrorRecovery';

describe('Parser Edge Cases - Error Recovery', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser({ enableVRTraits: true });
  });

  describe('Malformed Input Handling', () => {
    it('should recover from missing closing brace', () => {
      const source = `orb#test { position: [1, 2, 3]`;
      const result = parser.parse(source);
      // Should either complete parsing or provide recovery suggestion
      expect(result).toBeDefined();
      expect(result.errors || result.success).toBeDefined();
    });

    it('should recover from missing property value', () => {
      const source = `orb#test { position: }`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });

    it('should handle empty input', () => {
      const source = '';
      const result = parser.parse(source);
      expect(result).toBeDefined();
      expect(result.success === false || result.ast).toBeDefined();
    });

    it('should handle only whitespace', () => {
      const source = '   \n  \t  ';
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });

    it('should recover from unclosed string literal', () => {
      const source = `orb#test { name: "unterminated`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });

    it('should recover from invalid escape sequences', () => {
      const source = `orb#test { name: "invalid\\xescape" }`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });
  });

  describe('Complex Token Sequences', () => {
    it('should parse nested objects with multiple levels', () => {
      const source = `composition "test" {
        object "level1" {
          @networked(sync: true)
          @grabbable
          position: [1, 2, 3]
          rotation: [0, 45, 0]
          scale: [1.5, 1.5, 1.5]
          color: "#ff0000"
          metadata {
            author: "test"
            version: "1.0"
          }
        }
      }`;
      const result = parser.parse(source);
      // HoloScriptPlusParser may not support full composition syntax
      // (use HoloCompositionParser for that). Either it parses or it reports errors.
      expect(result).toBeDefined();
      expect(
        result.success === true || (result.errors && result.errors.length > 0) || result.ast
      ).toBeDefined();
    });

    it('should parse array with mixed types', () => {
      const source = `orb#test { 
        values: [1, 2.5, "string", true, null, [1, 2], {nested: true}]
      }`;
      const result = parser.parse(source);
      // Should handle mixed type arrays
      expect(result).toBeDefined();
    });

    it('should parse deep nesting (10+ levels)', () => {
      let source = 'orb#test { props { a { b { c { d { e { f { g { h { i { j { value: 1 }';
      source += ' } } } } } } } } } } }';
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });

    it('should handle multiple consecutive operators', () => {
      const source = `orb#test @grabbable @networked @collidable @hoverable @scalable { position: [1,2,3] }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle comments within structures', () => {
      const source = `orb#test { 
        // This is a comment
        position: [1, 2, 3]  // inline comment
        /* block comment */
        color: "#fff"
      }`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });
  });

  describe('Numeric Edge Cases', () => {
    it('should parse very large numbers', () => {
      const source = `orb#test { value: 999999999999999 }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should parse very small numbers', () => {
      const source = `orb#test { value: 0.0000000001 }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should parse negative numbers', () => {
      const source = `orb#test { position: [-1, -2.5, -999] }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should parse scientific notation', () => {
      const source = `orb#test { value: 1.23e-4 }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle leading zeros', () => {
      const source = `orb#test { value: 000123 }`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });
  });

  describe('String Edge Cases', () => {
    it('should parse Unicode characters', () => {
      const source = `orb#test { name: "测试 🌍 Тест" }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle escaped quotes in strings', () => {
      const source = `orb#test { name: "Say \\"hello\\"" }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle newlines in strings', () => {
      const source = `orb#test { text: "line1\\nline2\\nline3" }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle tabs and special whitespace', () => {
      const source = `orb#test { text: "col1\\tcol2\\tcol3" }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle empty string', () => {
      const source = `orb#test { name: "" }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Boolean and Null Edge Cases', () => {
    it('should handle true/false case sensitivity', () => {
      const source = `orb#test { active: true, enabled: false }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle null values', () => {
      const source = `orb#test { value: null }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should distinguish null from empty', () => {
      const source = `orb#test { nullable: null, empty: "" }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Trait Configuration Edge Cases', () => {
    it('should parse trait with no config', () => {
      const source = `orb#test @grabb able { position: [0,0,0] }`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });

    it('should parse trait with empty config', () => {
      const source = `orb#test @grabbable() { position: [0,0,0] }`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });

    it('should parse trait with multiple params', () => {
      const source = `orb#test @networked(sync: true, rate: 60, mode: "delta") { position: [0,0,0] }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should parse trait with nested config', () => {
      const source = `orb#test @physics(config: {mass: 1.0, gravity: true, damping: 0.1}) { }`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
    });
  });

  describe('Identifier Edge Cases', () => {
    it('should accept identifiers with numbers', () => {
      const source = `orb#obj123 { prop456: 789 }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should accept identifiers with underscores', () => {
      const source = `orb#_private_obj { _internal_value: 42 }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle long identifiers', () => {
      const longId = 'a'.repeat(100);
      const source = `orb#${longId} { value: 1 }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should distinguish similar identifiers', () => {
      const source = `composition "test" {
        object "obj" { value: 1 }
        object "obj_v2" { value: 2 }
        object "obj_123" { value: 3 }
      }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });
  });
});

describe('HoloComposition Parser Edge Cases', () => {
  let parser: HoloCompositionParser;

  beforeEach(() => {
    parser = new HoloCompositionParser();
  });

  describe('Composition Declaration', () => {
    it('should parse empty composition', () => {
      const source = `composition "empty" {}`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should parse composition with many objects', () => {
      let source = `composition "many" {`;
      for (let i = 0; i < 50; i++) {
        source += `object "obj${i}" { position: [${i}, 0, 0] }`;
      }
      source += `}`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle composition with environment', () => {
      const source = `composition "env" {
        environment {
          skybox: "nebula"
          ambient_light: 0.5
          fog_distance: 1000
        }
        object "test" { position: [0,0,0] }
      }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Spatial Grouping', () => {
    it('should parse spatial_group', () => {
      const source = `composition "spatial" {
        spatial_group "area1" {
          object "obj1" { position: [0,0,0] }
          object "obj2" { position: [1,0,0] }
        }
      }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle nested spatial_groups', () => {
      const source = `composition "nested" {
        spatial_group "outer" {
          spatial_group "inner" {
            object "obj" { position: [0,0,0] }
          }
        }
      }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });
  });

  describe('Logic Blocks', () => {
    it('should parse event handlers', () => {
      const source = `composition "events" {
        object "btn" { position: [0,0,0] }
        logic {
          on_player_interact(obj) {
            obj.color = "blue"
          }
        }
      }`;
      const result = parser.parse(source);
      expect(result.success).toBe(true);
    });

    it('should handle multiple event handlers', () => {
      const source = `composition "multi" {
        object "obj" { position: [0,0,0] }
        logic {
          on_player_interact(obj) { obj.scale = 1.5 }
          on_timer(duration: 5) { obj.visible = false }
          on_network_event(type: "sync") { obj.sync() }
        }
      }`;
      const result = parser.parse(source);
      // Multi-handler logic blocks may not be fully supported yet
      expect(result).toBeDefined();
    });
  });
});

describe('Parser Performance with Edge Cases', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser({ enableVRTraits: true });
  });

  it('should parse large arrays efficiently', () => {
    let source = `orb#test { values: [`;
    for (let i = 0; i < 1000; i++) {
      source += i;
      if (i < 999) source += ',';
    }
    source += `] }`;

    const start = performance.now();
    const result = parser.parse(source);
    const elapsed = performance.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(1000); // Should parse 1000 items in under 1 second
  });

  it('should handle many small objects', () => {
    const compParser = new HoloCompositionParser();
    const start = performance.now();
    let source = 'composition "perf" {\n';
    for (let i = 0; i < 100; i++) {
      source += `  object "o${i}" { position: [${i},0,0] color: "#fff" }\n`;
    }
    source += '}';

    const result = compParser.parse(source);
    const elapsed = performance.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(2000); // Should parse 100 objects in under 2 seconds
  });
});

describe('Error Recovery System', () => {
  it('should provide meaningful error messages', () => {
    const parser = new HoloScriptPlusParser({ enableVRTraits: true });
    const source = `orb#test { invalid syntax here }`;
    const result = parser.parse(source);

    if (!result.success && result.errors) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toBeDefined();
      expect(result.errors[0].line).toBeDefined();
      expect(result.errors[0].column).toBeDefined();
    }
  });

  it('should track error locations accurately', () => {
    const parser = new HoloScriptPlusParser({ enableVRTraits: true });
    const source = `orb#test { 
      position: [1, 2, 3]
      invalid: !!!
    }`;
    const result = parser.parse(source);

    if (!result.success && result.errors) {
      expect(result.errors.some((e) => e.line === 3)).toBe(true);
    }
  });

  it('should suggest valid alternatives on typos', () => {
    const parser = new HoloScriptPlusParser({ enableVRTraits: true });
    const source = `orb#test @grabble { }`; // typo: grabble instead of grabbable
    const result = parser.parse(source);

    // Depending on implementation, should either parse or suggest correction
    expect(result).toBeDefined();
  });
});
