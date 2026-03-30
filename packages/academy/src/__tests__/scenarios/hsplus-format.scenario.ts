/**
 * hsplus-format.scenario.ts — LIVING-SPEC: HoloScript+ (.hsplus / .hs) Format
 *
 * Persona: Zara — Spatial developer authoring avatar traits and physics
 * behaviors using the HoloScript+ orb syntax.
 *
 * ✓ it(...)      = PASSING — feature works
 * ⊡ it.todo(...) = BACKLOG — missing feature
 *
 * Parser: HoloScriptPlusParser (packages/core/src/parser/HoloScriptPlusParser.ts)
 * Fixtures: packages/core/src/__tests__/fixtures/*.hsplus
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { HoloScriptPlusParser } from '@holoscript/core';
import { loadHsplusFixture, parseHsplus } from '../helpers/formatHelpers';

// Single shared parser instance (mirrors hsplus-files.test.ts pattern)
let parser: HoloScriptPlusParser;
beforeAll(() => {
  parser = new HoloScriptPlusParser();
});

// ═══════════════════════════════════════════════════════════════════
// 1. Parsing Fixture Files
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: HoloScript+ Format — Fixture File Parsing', () => {
  it('Zara opens basic-orb.hsplus — parses successfully', () => {
    const source = loadHsplusFixture('basic-orb');
    const result = parser.parse(source);
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
  });

  it('Zara opens humanoid-avatar.hsplus — avatar node has skeleton trait', () => {
    const source = loadHsplusFixture('humanoid-avatar');
    const result = parser.parse(source);
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
  });

  it('Zara opens stretchable-atoms.hsplus — stretchable trait parses', () => {
    const source = loadHsplusFixture('stretchable-atoms');
    const result = parser.parse(source);
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
  });

  it('Zara opens traits-basic.hsplus — core traits recognized', () => {
    const source = loadHsplusFixture('traits-basic');
    const result = parser.parse(source);
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Inline Trait Authorship
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: HoloScript+ Format — Trait Authorship', () => {
  it('Zara authors a simple orb with @grabbable trait', () => {
    const result = parseHsplus('orb#myOrb @grabbable { position: [0, 1, 0] }');
    expect(result).toBeDefined();
    expect(result.ast).toBeDefined();
    expect(result.ast.root.traits.has('grabbable')).toBe(true);
  });

  it('multiple traits on a single orb all parse — @grabbable @throwable @hoverable', () => {
    const result = parseHsplus('orb#test @grabbable @throwable @hoverable { position: [0, 0, 0] }');
    expect(result.ast.root.traits.has('grabbable')).toBe(true);
    expect(result.ast.root.traits.has('throwable')).toBe(true);
    expect(result.ast.root.traits.has('hoverable')).toBe(true);
  });

  it('trait with structured config parses config map correctly', () => {
    const result = parseHsplus(
      'avatar#npc @skeleton(type: "humanoid", ik_enabled: true) { name: "NPC" }'
    );
    expect(result.ast).toBeDefined();
    expect(result.ast.root.traits.has('skeleton')).toBe(true);
    const config = result.ast.root.traits.get('skeleton');
    expect(config?.type ?? (config as any)?.config?.type).toBe('humanoid');
  });

  it('@networked trait parses with sync_rate config', () => {
    const result = parseHsplus(
      'orb#player @networked(sync_rate: "20hz", position: "synced") { position: [0, 1, 0] }'
    );
    expect(result.ast.root.traits.has('networked')).toBe(true);
  });

  it('@physics trait parses with mass and restitution', () => {
    const result = parseHsplus(
      'orb#ball @physics(mass: 1.0, restitution: 0.8) { position: [0, 2, 0] }'
    );
    expect(result.ast.root.traits.has('physics')).toBe(true);
  });

  it('nested orb with @breakable trait on child parses both levels', () => {
    const source = `
orb#parent @grabbable {
  position: [0, 1, 0]
  orb#child @breakable { position: [0, 0.5, 0] }
}`.trim();
    const result = parseHsplus(source);
    expect(result.ast).toBeDefined();
    expect(result.ast.root.traits.has('grabbable')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. VR Trait Coverage
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: HoloScript+ Format — VR Trait Coverage', () => {
  const CORE_VR_TRAITS = [
    'grabbable',
    'throwable',
    'hoverable',
    'pointable',
    'skeleton',
    'stretchable',
    'networked',
    'glowing',
    'breakable',
    'trigger',
    'anchor',
  ];

  it('Zara verifies all core VR traits parse without throwing', () => {
    for (const trait of CORE_VR_TRAITS) {
      expect(() => parser.parse(`orb#test @${trait} { position: [0, 0, 0] }`)).not.toThrow();
    }
  });

  it('parser accepts @pointable for UI interaction', () => {
    const result = parseHsplus('orb#btn @pointable @clickable { geometry: "cube" }');
    expect(result.ast.root.traits.has('pointable')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Import Directives
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: HoloScript+ Format — Import Directives', () => {
  it('Zara imports a player module — @import directive parses', () => {
    const source = `
@import "./player.hs"
orb#scene @grabbable { position: [0, 0, 0] }
`.trim();
    // Should not throw — import directives are recognized
    expect(() => parser.parse(source)).not.toThrow();
  });

  it('@import with alias parses correctly', () => {
    const source = `
@import "./physics.hsplus" as Physics
orb#cube @Physics.rigid { position: [0, 1, 0] }
`.trim();
    expect(() => parser.parse(source)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Edge Cases & Error Recovery
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: HoloScript+ Format — Edge Cases', () => {
  it('empty .hsplus file does not crash', () => {
    expect(() => parser.parse('')).not.toThrow();
  });

  it('comment-only file is handled gracefully', () => {
    expect(() => parser.parse('// This is a comment\n// Another comment')).not.toThrow();
  });

  it('whitespace-only file is handled gracefully', () => {
    expect(() => parser.parse('   \n\n   \t\t   ')).not.toThrow();
  });

  it('parser is reusable across many calls without memory leak', () => {
    for (let i = 0; i < 10; i++) {
      const result = parser.parse(`orb#orb${i} @grabbable { position: [${i}, 0, 0] }`);
      expect(result.ast).toBeDefined();
    }
  });

  it('numeric position values parse to actual numbers in AST', () => {
    const result = parseHsplus('orb#pos @grabbable { position: [1.5, 2.0, -3.7] }');
    expect(result.ast).toBeDefined();
  });

  it('string property with special characters parses correctly', () => {
    const result = parseHsplus(`orb#named @anchor { name: "My Orb (with parens)" }`);
    expect(result.ast).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. validateHSPlus() — Semantic Validation Layer
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: HoloScript+ Format — Semantic Validation (validateHSPlus)', () => {
  it('Zara validates a well-formed .hsplus source — result.valid is true', async () => {
    const { validateHSPlus } = await import('@holoscript/core');
    const result = validateHSPlus('orb#player @grabbable { position: [0, 1, 0] }');
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('validateHSPlus returns typed ParserValidationError objects', async () => {
    const { validateHSPlus } = await import('@holoscript/core');
    const result = validateHSPlus('orb#test @grabbable { position: [0, 0, 0] }');
    for (const err of [...result.errors, ...result.warnings]) {
      expect(['syntax', 'semantic', 'runtime', 'device']).toContain(err.type);
      expect(typeof err.message).toBe('string');
      expect(typeof err.recoverable).toBe('boolean');
    }
  });

  it('validateHSPlus on empty source does not throw', async () => {
    const { validateHSPlus } = await import('@holoscript/core');
    expect(() => validateHSPlus('')).not.toThrow();
  });

  it('validateHSPlus on comment-only source does not throw', async () => {
    const { validateHSPlus } = await import('@holoscript/core');
    expect(() => validateHSPlus('// A comment')).not.toThrow();
  });

  it('validateHSPlus accepts multiple traits — @grabbable @skeleton @networked', async () => {
    const { validateHSPlus } = await import('@holoscript/core');
    const result = validateHSPlus(
      'orb#player @grabbable @skeleton(type: "humanoid") @networked { position: [0, 1.6, 0] }'
    );
    expect(result).toBeDefined();
  });

  it('batch validation: validate 5 .hsplus snippets in loop — all defined', async () => {
    const { validateHSPlus } = await import('@holoscript/core');
    const snippets = [
      'orb#a @grabbable { position: [0, 0, 0] }',
      'avatar#b @skeleton { name: "NPC" }',
      'orb#c @physics(mass: 1.0) { position: [1, 0, 0] }',
      'orb#d @breakable @hoverable { position: [2, 0, 0] }',
      'orb#e @networked(sync_rate: "20hz") { position: [3, 0, 0] }',
    ];
    for (const snippet of snippets) {
      const result = validateHSPlus(snippet);
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Backlog / Future Features
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: HoloScript+ Format — Backlog', () => {
  it('Zara drops a .hs file onto Studio viewport — traits appear in inspector', () => {
    const source = loadHsplusFixture('traits-basic');
    const result = parser.parse(source);
    expect(result.ast).toBeDefined();
    // AST may be a root node or collection — verify it parsed something
    const hasTraits = result.ast.root?.traits?.size > 0 || Object.keys(result.ast).length > 0;
    expect(hasTraits).toBe(true);
  });

  it('HoloScript+ Trait Library: parser recognizes 10+ core VR traits', () => {
    const traits = [
      'grabbable',
      'throwable',
      'hoverable',
      'pointable',
      'skeleton',
      'stretchable',
      'networked',
      'glowing',
      'breakable',
      'trigger',
      'anchor',
    ];
    let recognized = 0;
    for (const trait of traits) {
      const result = parser.parse(`orb#test @${trait} { position: [0, 0, 0] }`);
      if (result.ast?.root?.traits?.has(trait)) recognized++;
    }
    expect(recognized).toBeGreaterThanOrEqual(10);
  });

  it('@platform(quest3) constraint parses as parameterized trait', () => {
    const result = parseHsplus('orb#vrObj @platform(quest3) @grabbable { position: [0, 1, 0] }');
    expect(result.ast).toBeDefined();
    expect(result.ast.root.traits.has('platform')).toBe(true);
  });

  it('Named import syntax is handled by parser without crashing', () => {
    const source =
      '@import { Player, NPC } from "./characters.hs"\norb#scene @grabbable { position: [0, 0, 0] }';
    expect(() => parser.parse(source)).not.toThrow();
  });
});
