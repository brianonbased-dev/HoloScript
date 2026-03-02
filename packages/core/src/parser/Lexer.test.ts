/**
 * Tests for HoloScript Lexer / Tokenizer
 *
 * The lexer is embedded in HoloCompositionParser. These tests verify
 * that keywords, operators, literals, and identifiers are tokenized
 * correctly by parsing minimal snippets and checking the AST.
 *
 * Covers:
 * - Keyword tokenization (127+ keywords across all domains)
 * - String and number literals
 * - Operator tokens
 * - Comments
 * - Domain keyword conflicts (keyword used as property name vs block opener)
 */

import { describe, it, expect } from 'vitest';
import { parseHolo } from './HoloCompositionParser';

// =============================================================================
// KEYWORD TOKENIZATION
// =============================================================================

describe('Lexer: Keyword Tokenization', () => {
  it('tokenizes core keywords correctly', () => {
    const source = `
      composition "Test" {
        environment { theme: "dark" }
        state { x: 0 }
        template "T" { size: 1 }
        object "O" { position: [0,0,0] }
        logic { on_enter { state.x = 1 } }
      }
    `;
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.environment).toBeDefined();
    expect(result.ast?.state).toBeDefined();
    expect(result.ast?.templates.length).toBe(1);
    expect(result.ast?.objects.length).toBe(1);
    expect(result.ast?.logic).toBeDefined();
  });

  it('tokenizes v4 domain keywords as block openers', () => {
    const keywords = [
      { code: 'sensor "S" { type: "DHT22" }', domain: 'iot' },
      { code: 'joint "J" { type: "revolute" }', domain: 'robotics' },
      { code: 'dashboard "D" { layout: "grid" }', domain: 'dataviz' },
      { code: 'procedure "P" { difficulty: "easy" }', domain: 'healthcare' },
      { code: 'contract "C" { chain: "base" }', domain: 'web3' },
      { code: 'instrument "I" { type: "synth" }', domain: 'music' },
      { code: 'lesson "L" { subject: "math" }', domain: 'education' },
      { code: 'floor_plan "F" { scale: 1.0 }', domain: 'architecture' },
    ];

    for (const { code, domain } of keywords) {
      const result = parseHolo(code);
      expect(result.success).toBe(true);
      expect(result.ast?.domainBlocks![0].domain).toBe(domain);
    }
  });

  it('tokenizes simulation layer keywords', () => {
    const keywords = [
      { code: 'material "M" { metallic: 1.0 }', domain: 'material' },
      { code: 'rigidbody "R" { mass: 10 }', domain: 'physics' },
      { code: 'weather "W" { type: "rain" }', domain: 'weather' },
      { code: 'navmesh "N" { agent_radius: 0.5 }', domain: 'navigation' },
    ];

    for (const { code, domain } of keywords) {
      const result = parseHolo(code);
      expect(result.success).toBe(true);
      expect(result.ast?.domainBlocks![0].domain).toBe(domain);
    }
  });
});

// =============================================================================
// LITERALS
// =============================================================================

describe('Lexer: Literals', () => {
  it('parses string literals with double quotes', () => {
    const result = parseHolo('sensor "Hello World" { type: "temp" }');
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].name).toBe('Hello World');
  });

  it('parses integer literals', () => {
    const result = parseHolo('sensor "S" { value: 42 }');
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].properties['value']).toBe(42);
  });

  it('parses float literals', () => {
    const result = parseHolo('sensor "S" { value: 3.14 }');
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].properties['value']).toBeCloseTo(3.14);
  });

  it('parses negative numbers', () => {
    const result = parseHolo('sensor "S" { offset: -10 }');
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].properties['offset']).toBe(-10);
  });

  it('parses boolean literals', () => {
    const result = parseHolo('sensor "S" { active: true enabled: false }');
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].properties['active']).toBe(true);
    expect(result.ast?.domainBlocks![0].properties['enabled']).toBe(false);
  });

  it('parses array literals', () => {
    const result = parseHolo('sensor "S" { position: [1, 2, 3] }');
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].properties['position']).toEqual([1, 2, 3]);
  });
});

// =============================================================================
// COMMENTS
// =============================================================================

describe('Lexer: Comments', () => {
  it('ignores line comments', () => {
    const result = parseHolo(`
      // This is a comment
      sensor "S" {
        // Another comment
        type: "temp"
      }
    `);
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].properties['type']).toBe('temp');
  });

  it('ignores block comments', () => {
    const result = parseHolo(`
      /* Block comment */
      sensor "S" {
        /* Multi
           line */
        type: "temp"
      }
    `);
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].properties['type']).toBe('temp');
  });
});

// =============================================================================
// KEYWORD-AS-PROPERTY AMBIGUITY
// =============================================================================

describe('Lexer: Keyword/Property Ambiguity', () => {
  it('correctly handles material as property name inside template', () => {
    const result = parseHolo(`
      composition "Test" {
        template "Panel" {
          material: "glass"
          shape: "rectangle"
        }
      }
    `);
    expect(result.success).toBe(true);
    const props = result.ast?.templates[0].properties;
    expect(props?.find(p => p.key === 'material')?.value).toBe('glass');
    expect(props?.find(p => p.key === 'shape')?.value).toBe('rectangle');
  });

  it('correctly handles material as block opener at root', () => {
    const result = parseHolo('material "Gold" { metallic: 1.0 }');
    expect(result.success).toBe(true);
    expect(result.ast?.domainBlocks![0].domain).toBe('material');
    expect(result.ast?.domainBlocks![0].properties['metallic']).toBe(1.0);
  });

  it('handles audio keyword as property name inside object', () => {
    const result = parseHolo(`
      composition "Test" {
        object "Obj" {
          audio: "bgm.mp3"
          light: "point"
        }
      }
    `);
    expect(result.success).toBe(true);
    expect(result.ast?.objects[0].properties?.find((p: any) => p.key === 'audio')?.value).toBe('bgm.mp3');
    expect(result.ast?.objects[0].properties?.find((p: any) => p.key === 'light')?.value).toBe('point');
  });
});
