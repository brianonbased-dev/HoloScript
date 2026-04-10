import { describe, it, expect } from 'vitest';
import {
  expressionToValue,
  programToInternalAST,
  extractWorldSettings,
  orbToASTNode,
  parseHoloScriptSimplified,
  parseProperties,
  parseValue,
  escapeHoloString,
  formatHoloValue,
  type CoreExpression,
  type CoreProgram,
  type CoreOrbDeclaration,
  type CoreOrbProperty,
} from '../HoloScriptIO';

// ============================================================================
// expressionToValue
// ============================================================================

describe('expressionToValue', () => {
  it('converts NumberLiteral', () => {
    expect(expressionToValue({ type: 'NumberLiteral', value: 42 })).toBe(42);
  });

  it('converts StringLiteral', () => {
    expect(expressionToValue({ type: 'StringLiteral', value: 'hello' })).toBe('hello');
  });

  it('converts BooleanLiteral true', () => {
    expect(expressionToValue({ type: 'BooleanLiteral', value: true })).toBe(true);
  });

  it('converts BooleanLiteral false', () => {
    expect(expressionToValue({ type: 'BooleanLiteral', value: false })).toBe(false);
  });

  it('converts NullLiteral', () => {
    expect(expressionToValue({ type: 'NullLiteral' })).toBeNull();
  });

  it('converts ArrayLiteral', () => {
    const expr: CoreExpression = {
      type: 'ArrayLiteral',
      elements: [
        { type: 'NumberLiteral', value: 1 },
        { type: 'NumberLiteral', value: 2 },
        { type: 'NumberLiteral', value: 3 },
      ],
    };
    expect(expressionToValue(expr)).toEqual([1, 2, 3]);
  });

  it('converts ObjectLiteral', () => {
    const expr: CoreExpression = {
      type: 'ObjectLiteral',
      properties: [
        {
          key: { type: 'Identifier', name: 'x' },
          value: { type: 'NumberLiteral', value: 10 },
        },
        {
          key: { type: 'StringLiteral', value: 'y' },
          value: { type: 'StringLiteral', value: 'hello' },
        },
      ],
    };
    expect(expressionToValue(expr)).toEqual({ x: 10, y: 'hello' });
  });

  it('converts Vec3Literal to [x, y, z] array', () => {
    const expr: CoreExpression = {
      type: 'Vec3Literal',
      x: { type: 'NumberLiteral', value: 1 },
      y: { type: 'NumberLiteral', value: 2 },
      z: { type: 'NumberLiteral', value: 3 },
    };
    expect(expressionToValue(expr)).toEqual([1, 2, 3]);
  });

  it('converts ColorLiteral', () => {
    expect(expressionToValue({ type: 'ColorLiteral', value: '#ff0000' })).toBe('#ff0000');
  });

  it('converts Identifier to its name', () => {
    expect(expressionToValue({ type: 'Identifier', name: 'myVar' })).toBe('myVar');
  });

  it('returns null for unknown expression types', () => {
    expect(expressionToValue({ type: 'UnknownType' })).toBeNull();
  });
});

// ============================================================================
// parseValue (simplified fallback parser utility)
// ============================================================================

describe('parseValue', () => {
  it('parses boolean true', () => {
    expect(parseValue('true')).toBe(true);
  });

  it('parses boolean false', () => {
    expect(parseValue('false')).toBe(false);
  });

  it('parses integers', () => {
    expect(parseValue('42')).toBe(42);
  });

  it('parses negative floats', () => {
    expect(parseValue('-3.14')).toBeCloseTo(-3.14);
  });

  it('parses arrays', () => {
    expect(parseValue('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('parses double-quoted strings', () => {
    expect(parseValue('"hello world"')).toBe('hello world');
  });

  it('parses single-quoted strings', () => {
    expect(parseValue("'hello'")).toBe('hello');
  });

  it('strips trailing commas', () => {
    expect(parseValue('42,')).toBe(42);
  });

  it('returns raw string for unrecognized values', () => {
    expect(parseValue('some_identifier')).toBe('some_identifier');
  });
});

// ============================================================================
// parseProperties
// ============================================================================

describe('parseProperties', () => {
  it('parses key: value pairs from multiline string', () => {
    const content = `
      name: "TestScene"
      gravity: -9.81
      enabled: true
    `;
    const props = parseProperties(content);
    expect(props['name']).toBe('TestScene');
    expect(props['gravity']).toBeCloseTo(-9.81);
    expect(props['enabled']).toBe(true);
  });

  it('skips comments and empty lines', () => {
    const content = `
      // This is a comment
      key1: "value1"

      key2: 42
    `;
    const props = parseProperties(content);
    expect(Object.keys(props)).toHaveLength(2);
    expect(props['key1']).toBe('value1');
  });

  it('returns empty object for empty content', () => {
    expect(parseProperties('')).toEqual({});
  });
});

// ============================================================================
// escapeHoloString
// ============================================================================

describe('escapeHoloString', () => {
  it('escapes backslashes', () => {
    expect(escapeHoloString('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('escapes double quotes', () => {
    expect(escapeHoloString('say "hello"')).toBe('say \\"hello\\"');
  });

  it('returns unchanged string with no special chars', () => {
    expect(escapeHoloString('plain text')).toBe('plain text');
  });
});

// ============================================================================
// formatHoloValue
// ============================================================================

describe('formatHoloValue', () => {
  it('formats null', () => {
    expect(formatHoloValue(null)).toBe('null');
  });

  it('formats undefined', () => {
    expect(formatHoloValue(undefined)).toBe('null');
  });

  it('formats strings with quotes', () => {
    expect(formatHoloValue('hello')).toBe('"hello"');
  });

  it('formats numbers', () => {
    expect(formatHoloValue(3.14)).toBe('3.14');
  });

  it('formats booleans', () => {
    expect(formatHoloValue(true)).toBe('true');
    expect(formatHoloValue(false)).toBe('false');
  });

  it('formats arrays', () => {
    expect(formatHoloValue([1, 2, 3])).toBe('[1, 2, 3]');
  });

  it('formats nested arrays', () => {
    expect(formatHoloValue([1, [2, 3]])).toBe('[1, [2, 3]]');
  });

  it('formats objects', () => {
    const result = formatHoloValue({ x: 1, y: 'hello' });
    expect(result).toBe('{ x: 1, y: "hello" }');
  });
});

// ============================================================================
// extractWorldSettings
// ============================================================================

describe('extractWorldSettings', () => {
  it('maps "light" property to ambient_light', () => {
    const props: CoreOrbProperty[] = [
      { type: 'OrbProperty', name: 'light', value: { type: 'BooleanLiteral', value: true } },
    ];
    const settings = extractWorldSettings(props);
    expect(settings.ambient_light).toEqual({ color: '#404040', intensity: 0.5 });
  });

  it('maps "background" property to skybox', () => {
    const props: CoreOrbProperty[] = [
      {
        type: 'OrbProperty',
        name: 'background',
        value: { type: 'ColorLiteral', value: '#87CEEB' },
      },
    ];
    const settings = extractWorldSettings(props);
    expect(settings.skybox).toBe('#87CEEB');
  });

  it('maps "gravity" property to physics object', () => {
    const props: CoreOrbProperty[] = [
      { type: 'OrbProperty', name: 'gravity', value: { type: 'NumberLiteral', value: -9.81 } },
    ];
    const settings = extractWorldSettings(props);
    expect(settings.physics).toEqual({ enabled: true, gravity: -9.81 });
  });

  it('passes through unknown properties', () => {
    const props: CoreOrbProperty[] = [
      { type: 'OrbProperty', name: 'custom', value: { type: 'StringLiteral', value: 'hello' } },
    ];
    const settings = extractWorldSettings(props);
    expect(settings.custom).toBe('hello');
  });
});

// ============================================================================
// orbToASTNode
// ============================================================================

describe('orbToASTNode', () => {
  it('converts a basic orb to an object node', () => {
    const orb: CoreOrbDeclaration = {
      type: 'OrbDeclaration',
      name: 'TestOrb',
      properties: [
        { type: 'OrbProperty', name: 'color', value: { type: 'ColorLiteral', value: '#ff0000' } },
      ],
    };
    const node = orbToASTNode(orb);
    expect(node.type).toBe('object');
    expect(node.name).toBe('TestOrb');
    expect(node.properties.color).toBe('#ff0000');
  });

  it('detects camera type from mesh property', () => {
    const orb: CoreOrbDeclaration = {
      type: 'OrbDeclaration',
      name: 'MainCam',
      properties: [
        {
          type: 'OrbProperty',
          name: 'geometry',
          value: { type: 'StringLiteral', value: 'camera' },
        },
      ],
    };
    const node = orbToASTNode(orb);
    expect(node.type).toBe('camera');
  });

  it('detects light type from geometry value', () => {
    const orb: CoreOrbDeclaration = {
      type: 'OrbDeclaration',
      name: 'SunLight',
      properties: [
        { type: 'OrbProperty', name: 'geometry', value: { type: 'StringLiteral', value: 'light' } },
      ],
    };
    const node = orbToASTNode(orb);
    expect(node.type).toBe('light');
  });

  it('expands scalar scale to [s, s, s]', () => {
    const orb: CoreOrbDeclaration = {
      type: 'OrbDeclaration',
      name: 'Scaled',
      properties: [
        { type: 'OrbProperty', name: 'scale', value: { type: 'NumberLiteral', value: 2 } },
      ],
    };
    const node = orbToASTNode(orb);
    expect(node.properties.scale).toEqual([2, 2, 2]);
  });

  it('sets type to spatial_group when orb has children', () => {
    const child: CoreOrbDeclaration = {
      type: 'OrbDeclaration',
      name: 'Child',
      properties: [],
    };
    const orb: CoreOrbDeclaration = {
      type: 'OrbDeclaration',
      name: 'Parent',
      properties: [],
      children: [child],
    };
    const node = orbToASTNode(orb);
    expect(node.type).toBe('spatial_group');
    expect(node.children).toHaveLength(1);
    expect(node.children[0].name).toBe('Child');
  });
});

// ============================================================================
// programToInternalAST
// ============================================================================

describe('programToInternalAST', () => {
  it('converts a program with a world declaration to internal AST', () => {
    const program: CoreProgram = {
      type: 'Program',
      sourceType: 'holo',
      body: [
        {
          type: 'WorldDeclaration',
          name: 'TestWorld',
          properties: [
            {
              type: 'OrbProperty',
              name: 'background',
              value: { type: 'ColorLiteral', value: '#000' },
            },
          ],
          children: [
            {
              type: 'OrbDeclaration',
              name: 'Sphere',
              properties: [
                {
                  type: 'OrbProperty',
                  name: 'geometry',
                  value: { type: 'StringLiteral', value: 'sphere' },
                },
              ],
            },
          ],
        },
      ],
    };

    const ast = programToInternalAST(program);
    expect(ast.composition).toBeDefined();
    expect(ast.composition!.name).toBe('TestWorld');
    expect(ast.composition!.nodes).toHaveLength(1);
    expect(ast.composition!.nodes[0].name).toBe('Sphere');
    expect(ast.composition!.settings?.skybox).toBe('#000');
  });

  it('returns empty AST when no world declarations', () => {
    const program: CoreProgram = {
      type: 'Program',
      sourceType: 'holo',
      body: [{ type: 'ImportStatement' }],
    };
    const ast = programToInternalAST(program);
    expect(ast.composition).toBeUndefined();
  });
});

// ============================================================================
// parseHoloScriptSimplified (fallback parser)
// ============================================================================

describe('parseHoloScriptSimplified', () => {
  it('parses a composition block with name', () => {
    const source = `
      composition "MyScene" {
        meta {
          author: "Test"
          version: "1.0"
        }
        object "Cube" {
          position: [0, 1, 0]
          color: "#ff0000"
        }
      }
    `;
    const ast = parseHoloScriptSimplified(source);
    expect(ast.composition).toBeDefined();
    expect(ast.composition!.name).toBe('MyScene');
  });

  it('returns empty AST when no composition block found', () => {
    const ast = parseHoloScriptSimplified('random text without composition');
    expect(ast.composition).toBeUndefined();
  });

  it('strips comments before parsing', () => {
    const source = `
      // This is a comment
      composition "Test" {
        /* block comment */
        object "Box" {
          color: "red"
        }
      }
    `;
    const ast = parseHoloScriptSimplified(source);
    expect(ast.composition).toBeDefined();
    expect(ast.composition!.name).toBe('Test');
  });
});
