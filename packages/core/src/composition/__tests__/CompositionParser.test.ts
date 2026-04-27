/**
 * Tests for CompositionParser.ts
 * Covers: parsePosition, parseScale, CompositionParser, parseComposition, parseHoloComposition, CompositionParseError
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock parsers before importing CompositionParser
vi.mock('../../parser/HoloCompositionParser.js', () => ({
  parseHolo: vi.fn(),
}));
vi.mock('../../parser/HoloScriptPlusParser.js', () => ({
  parse: vi.fn(),
}));

import {
  parsePosition,
  parseScale,
  CompositionParser,
  CompositionParseError,
  parseComposition,
  parseHoloComposition,
} from '../CompositionParser.js';
import { parseHolo } from '../../parser/HoloCompositionParser.js';
import { parse as parseHsPlusParser } from '../../parser/HoloScriptPlusParser.js';

const mockParseHolo = vi.mocked(parseHolo);
const mockParseHsPlus = vi.mocked(parseHsPlusParser);

// Minimal valid .holo AST
function makeMinimalHoloAST(name = 'TestScene') {
  return {
    name,
    environment: undefined,
    state: undefined,
    templates: [],
    spatialGroups: [],
    objects: [],
    logic: undefined,
  };
}

// ---------------------------------------------------------------------------
// parsePosition
// ---------------------------------------------------------------------------

describe('parsePosition', () => {
  it('returns zero vector for undefined', () => {
    expect(parsePosition(undefined)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('returns zero vector for null', () => {
    expect(parsePosition(null)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('parses array [x, y, z]', () => {
    expect(parsePosition([1, 2, 3])).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('parses partial array [x, y]', () => {
    const result = parsePosition([5, 10]);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
    expect(result.z).toBe(0);
  });

  it('parses {x, y, z} object', () => {
    expect(parsePosition({ x: 4, y: 5, z: 6 })).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('parses object with partial fields', () => {
    const result = parsePosition({ x: 7 });
    expect(result.x).toBe(7);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  it('handles non-numeric array values', () => {
    const result = parsePosition(['a', 'b', 'c']);
    expect(result).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('handles float values', () => {
    expect(parsePosition([1.5, 2.7, 3.9])).toEqual({ x: 1.5, y: 2.7, z: 3.9 });
  });

  it('handles negative values', () => {
    expect(parsePosition([-1, -2, -3])).toEqual({ x: -1, y: -2, z: -3 });
  });
});

// ---------------------------------------------------------------------------
// parseScale
// ---------------------------------------------------------------------------

describe('parseScale', () => {
  it('returns unit vector for undefined', () => {
    expect(parseScale(undefined)).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('returns unit vector for null', () => {
    expect(parseScale(null)).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('parses numeric scalar as uniform scale', () => {
    expect(parseScale(2)).toEqual({ x: 2, y: 2, z: 2 });
  });

  it('parses array [x, y, z]', () => {
    expect(parseScale([2, 3, 4])).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('parses array [x, y] — z defaults to 1', () => {
    const result = parseScale([2, 3]);
    expect(result.x).toBe(2);
    expect(result.y).toBe(3);
    expect(result.z).toBe(1);
  });

  it('parses {x, y, z} object', () => {
    expect(parseScale({ x: 0.5, y: 2, z: 1 })).toEqual({ x: 0.5, y: 2, z: 1 });
  });

  it('handles non-numeric values by returning 1', () => {
    const result = parseScale(['a', 'b', 'c']);
    expect(result).toEqual({ x: 1, y: 1, z: 1 });
  });

  it('handles zero scale as falsy (returns unit vector)', () => {
    expect(parseScale(0)).toEqual({ x: 1, y: 1, z: 1 });
  });
});

// ---------------------------------------------------------------------------
// CompositionParseError
// ---------------------------------------------------------------------------

describe('CompositionParseError', () => {
  it('is an Error subclass', () => {
    const err = new CompositionParseError('test', []);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CompositionParseError);
  });

  it('has correct name', () => {
    const err = new CompositionParseError('test', []);
    expect(err.name).toBe('CompositionParseError');
  });

  it('stores errors array', () => {
    const errors = ['err1', 'err2'];
    const err = new CompositionParseError('test', errors);
    expect(err.errors).toEqual(errors);
  });

  it('message includes the base message', () => {
    const err = new CompositionParseError('Parse failed', ['x']);
    expect(err.message).toContain('Parse failed');
  });
});

// ---------------------------------------------------------------------------
// CompositionParser — .holo parsing
// ---------------------------------------------------------------------------

describe('CompositionParser — .holo parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses a minimal .holo source without error', () => {
    const ast = makeMinimalHoloAST('MyScene');
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('composition "MyScene" {}', 'holo');
    expect(result.name).toBe('MyScene');
    expect(result.objects).toHaveLength(0);
  });

  it('throws CompositionParseError on parse failure', () => {
    mockParseHolo.mockReturnValue({ success: false, ast: null, errors: ['syntax error'] });

    const parser = new CompositionParser();
    expect(() => parser.parse('bad code', 'holo')).toThrow(CompositionParseError);
  });

  it('returns ParsedComposition with all required fields', () => {
    const ast = makeMinimalHoloAST('Scene');
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');

    expect(result).toMatchObject({
      name: expect.any(String),
      objects: expect.any(Array),
      state: expect.any(Object),
      logic: expect.any(Object),
      templates: expect.any(Map),
      environment: expect.any(Object),
    });
  });

  it('processes objects from AST', () => {
    const ast = {
      ...makeMinimalHoloAST('Test'),
      objects: [
        {
          name: 'cube1',
          template: null,
          properties: [{ key: 'geometry', value: 'cube' }, { key: 'position', value: [1, 2, 3] }],
          children: [],
        },
      ],
    };
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].id).toBe('cube1');
    expect(result.objects[0].position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('processes state from AST', () => {
    const ast = {
      ...makeMinimalHoloAST('Test'),
      state: {
        properties: [
          { key: 'count', value: 5 },
          { key: 'label', value: 'hello' },
        ],
      },
    };
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');
    expect(result.state['count']).toBe(5);
    expect(result.state['label']).toBe('hello');
  });

  it('processes environment from AST', () => {
    const ast = {
      ...makeMinimalHoloAST('Test'),
      environment: {
        properties: [
          { key: 'skybox', value: 'sunset' },
          { key: 'ambient_light', value: 0.5 },
        ],
      },
    };
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');
    expect(result.environment.skybox).toBe('sunset');
    expect(result.environment.ambientLight).toBe(0.5);
  });

  it('processes templates from AST', () => {
    const ast = {
      ...makeMinimalHoloAST('Test'),
      templates: [
        {
          name: 'BallTemplate',
          properties: [],
          state: { properties: [{ key: 'color', value: 'red' }] },
          actions: [],
        },
      ],
    };
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');
    expect(result.templates.has('BallTemplate')).toBe(true);
    expect(result.templates.get('BallTemplate')?.state['color']).toBe('red');
  });

  it('processes logic actions from AST', () => {
    const ast = {
      ...makeMinimalHoloAST('Test'),
      logic: {
        actions: [
          { name: 'jump', parameters: [{ name: 'height' }], body: {} },
        ],
        handlers: [],
      },
    };
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');
    expect(result.logic.actions.has('jump')).toBe(true);
    expect(result.logic.actions.get('jump')?.params).toContain('height');
  });

  it('processes frame handler from logic', () => {
    const ast = {
      ...makeMinimalHoloAST('Test'),
      logic: {
        actions: [],
        handlers: [{ event: 'frame', parameters: [], body: {} }],
      },
    };
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');
    expect(result.logic.frameHandlers).toHaveLength(1);
  });

  it('processes keydown handler from logic', () => {
    const ast = {
      ...makeMinimalHoloAST('Test'),
      logic: {
        actions: [],
        handlers: [{ event: 'keydown', parameters: [], body: {} }],
      },
    };
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');
    expect(result.logic.keyboardHandlers.has('on_keydown')).toBe(true);
  });

  it('processes spatial groups', () => {
    const ast = {
      ...makeMinimalHoloAST('Test'),
      spatialGroups: [
        {
          name: 'group1',
          properties: [{ key: 'position', value: [0, 0, 0] }],
          objects: [
            {
              name: 'obj1',
              template: null,
              properties: [{ key: 'position', value: [1, 0, 0] }],
              children: [],
            },
          ],
          groups: [],
        },
      ],
    };
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'holo');
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].id).toBe('obj1');
  });
});

// ---------------------------------------------------------------------------
// CompositionParser — .hsplus parsing
// ---------------------------------------------------------------------------

describe('CompositionParser — .hsplus parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses an hsplus source without error', () => {
    mockParseHsPlus.mockReturnValue({
      success: true,
      ast: { body: [] },
      errors: [],
    });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'hsplus');
    expect(result).toBeDefined();
    expect(result.objects).toHaveLength(0);
  });

  it('throws CompositionParseError on hsplus failure', () => {
    mockParseHsPlus.mockReturnValue({ success: false, errors: ['bad'], ast: null });

    const parser = new CompositionParser();
    expect(() => parser.parse('bad', 'hsplus')).toThrow(CompositionParseError);
  });

  it('parses orb objects from hsplus', () => {
    mockParseHsPlus.mockReturnValue({
      success: true,
      ast: {
        body: [
          {
            type: 'orb',
            name: 'planet1',
            traits: ['@physics'],
            props: { position: [0, 5, 0] },
          },
        ],
      },
      errors: [],
    });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'hsplus');
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].id).toBe('planet1');
    expect(result.objects[0].type).toBe('sphere');
  });

  it('parses function definitions from hsplus', () => {
    mockParseHsPlus.mockReturnValue({
      success: true,
      ast: {
        body: [
          {
            type: 'function',
            name: 'move',
            params: ['dx', 'dy'],
            body: {},
          },
        ],
      },
      errors: [],
    });

    const parser = new CompositionParser();
    const result = parser.parse('source', 'hsplus');
    expect(result.logic.actions.has('move')).toBe(true);
    expect(result.logic.actions.get('move')?.params).toEqual(['dx', 'dy']);
  });
});

// ---------------------------------------------------------------------------
// parseComposition convenience function
// ---------------------------------------------------------------------------

describe('parseComposition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls parseHolo for .holo type', () => {
    const ast = makeMinimalHoloAST('Foo');
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    parseComposition('source', 'holo');
    expect(mockParseHolo).toHaveBeenCalledOnce();
  });

  it('calls parseHsPlus for hsplus type', () => {
    mockParseHsPlus.mockReturnValue({ success: true, ast: { body: [] }, errors: [] });
    parseComposition('source', 'hsplus');
    expect(mockParseHsPlus).toHaveBeenCalledOnce();
  });

  it('defaults to holo file type', () => {
    const ast = makeMinimalHoloAST('Default');
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });
    parseComposition('source');
    expect(mockParseHolo).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// parseHoloComposition convenience function
// ---------------------------------------------------------------------------

describe('parseHoloComposition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses using holo parser', () => {
    const ast = makeMinimalHoloAST('HoloScene');
    mockParseHolo.mockReturnValue({ success: true, ast, errors: [] });

    const result = parseHoloComposition('source');
    expect(result.name).toBe('HoloScene');
    expect(mockParseHolo).toHaveBeenCalledOnce();
  });

  it('throws on parse failure', () => {
    mockParseHolo.mockReturnValue({ success: false, ast: null, errors: ['fail'] });
    expect(() => parseHoloComposition('bad')).toThrow(CompositionParseError);
  });
});
