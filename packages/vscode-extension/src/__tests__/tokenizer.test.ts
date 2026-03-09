/**
 * Tests for HoloScript Semantic Tokens Tokenizer
 *
 * Tests the tokenize() function directly — it's a 160-line pure function
 * with no VS Code dependencies. We replicate the necessary constants here
 * to test the tokenizer logic in isolation.
 */

import { describe, it, expect } from 'vitest';

// Replicate the tokenizer constants and function from semanticTokensProvider.ts
const TOKEN_TYPES = [
  'namespace',
  'class',
  'type',
  'parameter',
  'variable',
  'property',
  'function',
  'decorator',
  'keyword',
  'string',
  'number',
  'operator',
  'comment',
  'enumMember',
] as const;

const TOKEN_MODIFIERS = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
] as const;

const KEYWORDS = new Set([
  'composition',
  'object',
  'template',
  'spatial_group',
  'environment',
  'state',
  'logic',
  'using',
  'import',
  'from',
  'if',
  'else',
  'for',
  'while',
  'return',
  'spawn',
  'emit',
  'true',
  'false',
  'null',
  'let',
  'const',
  'function',
]);

const BUILTIN_TRAITS = new Set([
  'grabbable',
  'throwable',
  'collidable',
  'physics',
  'gravity',
  'trigger',
  'pointable',
  'hoverable',
  'clickable',
  'draggable',
  'scalable',
  'glowing',
  'transparent',
  'spinning',
  'floating',
  'billboard',
  'pulse',
  'animated',
  'look_at',
  'outline',
  'proximity',
  'behavior_tree',
  'emotion',
  'goal_oriented',
  'perception',
  'memory',
  'cloth',
  'soft_body',
  'fluid',
  'buoyancy',
  'rope',
  'wind',
  'joint',
  'rigidbody',
  'destruction',
  'rotatable',
  'stackable',
  'snappable',
  'breakable',
  'character',
  'patrol',
  'networked',
  'anchor',
  'spatial_audio',
  'reverb_zone',
  'voice_proximity',
  'teleport',
  'ui_panel',
  'particle_system',
  'weather',
  'day_night',
  'lod',
  'hand_tracking',
  'haptic',
  'portal',
  'mirror',
]);

const EVENT_HANDLERS = new Set([
  'on_click',
  'on_hover',
  'on_enter',
  'on_exit',
  'on_grab',
  'on_release',
  'on_collision',
  'on_trigger',
  'on_update',
]);

const COMMON_PROPERTIES = new Set([
  'position',
  'rotation',
  'scale',
  'color',
  'opacity',
  'geometry',
  'model',
  'material',
  'texture',
  'skybox',
  'ambient_light',
  'mass',
  'velocity',
  'friction',
  'restitution',
]);

interface TokenInfo {
  line: number;
  startChar: number;
  length: number;
  tokenType: number;
  tokenModifiers: number;
}

function tokenize(text: string): TokenInfo[] {
  const tokens: TokenInfo[] = [];
  const lines = text.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let pos = 0;

    while (pos < line.length) {
      const wsMatch = line.slice(pos).match(/^[ \t]+/);
      if (wsMatch) {
        pos += wsMatch[0].length;
        continue;
      }

      if (line.slice(pos).startsWith('//')) {
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: line.length - pos,
          tokenType: TOKEN_TYPES.indexOf('comment'),
          tokenModifiers: 0,
        });
        break;
      }
      if (line.slice(pos).startsWith('/*')) {
        const endPos = line.indexOf('*/', pos + 2);
        const len = endPos >= 0 ? endPos + 2 - pos : line.length - pos;
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: len,
          tokenType: TOKEN_TYPES.indexOf('comment'),
          tokenModifiers: 0,
        });
        pos += len;
        continue;
      }

      const traitMatch = line.slice(pos).match(/^@([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (traitMatch) {
        const isBuiltin = BUILTIN_TRAITS.has(traitMatch[1]);
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: traitMatch[0].length,
          tokenType: TOKEN_TYPES.indexOf('decorator'),
          tokenModifiers: isBuiltin ? 1 << TOKEN_MODIFIERS.indexOf('defaultLibrary') : 0,
        });
        pos += traitMatch[0].length;
        continue;
      }

      const stringMatch = line.slice(pos).match(/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/);
      if (stringMatch) {
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: stringMatch[0].length,
          tokenType: TOKEN_TYPES.indexOf('string'),
          tokenModifiers: 0,
        });
        pos += stringMatch[0].length;
        continue;
      }

      const numberMatch = line.slice(pos).match(/^-?(?:0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)/);
      if (numberMatch) {
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: numberMatch[0].length,
          tokenType: TOKEN_TYPES.indexOf('number'),
          tokenModifiers: 0,
        });
        pos += numberMatch[0].length;
        continue;
      }

      const identMatch = line.slice(pos).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (identMatch) {
        const word = identMatch[0];
        let tokenType: number;
        let modifiers = 0;

        if (KEYWORDS.has(word)) {
          tokenType = TOKEN_TYPES.indexOf('keyword');
          modifiers = 1 << TOKEN_MODIFIERS.indexOf('defaultLibrary');
        } else if (EVENT_HANDLERS.has(word)) {
          tokenType = TOKEN_TYPES.indexOf('function');
          modifiers = 1 << TOKEN_MODIFIERS.indexOf('defaultLibrary');
        } else if (COMMON_PROPERTIES.has(word)) {
          tokenType = TOKEN_TYPES.indexOf('property');
        } else {
          const colonBefore = line.slice(0, pos).trim().endsWith(':');
          if (colonBefore) {
            tokenType = TOKEN_TYPES.indexOf('variable');
          } else {
            const afterIdent = line.slice(pos + word.length).trimStart();
            tokenType = afterIdent.startsWith(':')
              ? TOKEN_TYPES.indexOf('property')
              : TOKEN_TYPES.indexOf('variable');
          }
        }

        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: word.length,
          tokenType,
          tokenModifiers: modifiers,
        });
        pos += word.length;
        continue;
      }

      const opMatch = line.slice(pos).match(/^(?:=>|->|&&|\|\||[+\-*\/%<>=!&|^~?:])/);
      if (opMatch) {
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: opMatch[0].length,
          tokenType: TOKEN_TYPES.indexOf('operator'),
          tokenModifiers: 0,
        });
        pos += opMatch[0].length;
        continue;
      }
      pos++;
    }
  }
  return tokens;
}

// Helper to find token type name
function typeName(idx: number): string {
  return TOKEN_TYPES[idx];
}

describe('tokenize', () => {
  describe('keywords', () => {
    it('recognizes composition keyword', () => {
      const tokens = tokenize('composition "Test" {}');
      expect(typeName(tokens[0].tokenType)).toBe('keyword');
    });

    it('recognizes object keyword', () => {
      const tokens = tokenize('object "Cube" {}');
      expect(typeName(tokens[0].tokenType)).toBe('keyword');
    });

    it('recognizes control flow keywords', () => {
      const tokens = tokenize('if else for while return');
      for (const tok of tokens) {
        expect(typeName(tok.tokenType)).toBe('keyword');
      }
    });
  });

  describe('traits', () => {
    it('recognizes builtin trait with defaultLibrary modifier', () => {
      const tokens = tokenize('@grabbable');
      expect(typeName(tokens[0].tokenType)).toBe('decorator');
      expect(tokens[0].tokenModifiers).toBeGreaterThan(0); // defaultLibrary bit set
    });

    it('recognizes custom trait without defaultLibrary', () => {
      const tokens = tokenize('@my_custom_trait');
      expect(typeName(tokens[0].tokenType)).toBe('decorator');
      expect(tokens[0].tokenModifiers).toBe(0); // no modifier
    });

    it('captures full trait name length', () => {
      const tokens = tokenize('@physics');
      expect(tokens[0].length).toBe(8); // @physics = 8 chars
    });
  });

  describe('strings', () => {
    it('double-quoted string', () => {
      const tokens = tokenize('"Hello World"');
      expect(typeName(tokens[0].tokenType)).toBe('string');
      expect(tokens[0].length).toBe(13);
    });

    it('single-quoted string', () => {
      const tokens = tokenize("'value'");
      expect(typeName(tokens[0].tokenType)).toBe('string');
    });
  });

  describe('numbers', () => {
    it('integer', () => {
      const tokens = tokenize('42');
      expect(typeName(tokens[0].tokenType)).toBe('number');
    });

    it('decimal', () => {
      const tokens = tokenize('3.14');
      expect(typeName(tokens[0].tokenType)).toBe('number');
    });

    it('negative number', () => {
      const tokens = tokenize('-10.5');
      expect(typeName(tokens[0].tokenType)).toBe('number');
    });

    it('hex number', () => {
      const tokens = tokenize('0xFF');
      expect(typeName(tokens[0].tokenType)).toBe('number');
    });
  });

  describe('comments', () => {
    it('single-line comment consumes rest of line', () => {
      const tokens = tokenize('// this is a comment');
      expect(tokens.length).toBe(1);
      expect(typeName(tokens[0].tokenType)).toBe('comment');
      expect(tokens[0].length).toBe(20);
    });

    it('inline comment after code', () => {
      const tokens = tokenize('object // comment');
      expect(tokens.length).toBe(2);
      expect(typeName(tokens[0].tokenType)).toBe('keyword');
      expect(typeName(tokens[1].tokenType)).toBe('comment');
    });

    it('block comment', () => {
      const tokens = tokenize('/* block */');
      expect(typeName(tokens[0].tokenType)).toBe('comment');
    });
  });

  describe('properties', () => {
    it('identifies property before colon', () => {
      const tokens = tokenize('position: 1.0');
      expect(typeName(tokens[0].tokenType)).toBe('property');
    });

    it('identifies event handler', () => {
      const tokens = tokenize('on_click');
      expect(typeName(tokens[0].tokenType)).toBe('function');
    });
  });

  describe('operators', () => {
    it('arrow operator', () => {
      const tokens = tokenize('=>');
      expect(typeName(tokens[0].tokenType)).toBe('operator');
    });

    it('logical operators', () => {
      const tokens = tokenize('&&');
      expect(typeName(tokens[0].tokenType)).toBe('operator');
    });
  });

  describe('multi-line', () => {
    it('tracks line numbers correctly', () => {
      const tokens = tokenize('object "A" {}\nobject "B" {}');
      const lineZeros = tokens.filter((t) => t.line === 0);
      const lineOnes = tokens.filter((t) => t.line === 1);
      expect(lineZeros.length).toBeGreaterThan(0);
      expect(lineOnes.length).toBeGreaterThan(0);
    });
  });
});
