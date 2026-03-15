/**
 * HoloScript+ File Tests - Memory Optimized
 *
 * Tests that parse actual .hsplus files from fixtures and examples
 * Optimized to prevent OOM issues by using representative trait sampling
 * instead of testing all 1800+ VR traits.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import {
  CORE_VR_INTERACTION_TRAITS,
  HUMANOID_AVATAR_TRAITS,
  AUDIO_TRAITS,
  PHYSICS_EXPANSION_TRAITS
} from '../constants';

// Single parser instance - reused across all tests
const parser = new HoloScriptPlusParser({ enableVRTraits: true });

// Inline file loading to avoid module overhead
const fixturesDir = resolve(__dirname, 'fixtures');
const examplesDir = resolve(__dirname, '../../../../examples');

function loadFixture(name: string): string {
  const filePath = name.endsWith('.hsplus')
    ? join(fixturesDir, name)
    : join(fixturesDir, `${name}.hsplus`);
  return readFileSync(filePath, 'utf-8');
}

function loadExample(name: string): string {
  const filePath = name.endsWith('.hsplus')
    ? join(examplesDir, name)
    : join(examplesDir, `${name}.hsplus`);
  return readFileSync(filePath, 'utf-8');
}

describe('HoloScript+ File Parsing (Memory Optimized)', () => {
  // ==========================================================================
  // Fixture File Tests
  // ==========================================================================

  describe('Fixture Files', () => {
    it('parses basic-orb.hsplus', () => {
      const result = parser.parse(loadFixture('basic-orb'));
      expect(result).toBeDefined();
      expect(result.ast).toBeDefined();
    });

    it('parses traits-basic.hsplus', () => {
      const result = parser.parse(loadFixture('traits-basic'));
      expect(result).toBeDefined();
      expect(result.ast).toBeDefined();
    });

    it('parses humanoid-avatar.hsplus', () => {
      const result = parser.parse(loadFixture('humanoid-avatar'));
      expect(result).toBeDefined();
      expect(result.ast).toBeDefined();
    });

    it('parses stretchable-atoms.hsplus', () => {
      const result = parser.parse(loadFixture('stretchable-atoms'));
      expect(result).toBeDefined();
      expect(result.ast).toBeDefined();
    });

    it('parses all fixtures without throwing', () => {
      const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.hsplus'));
      expect(fixtures.length).toBeGreaterThan(0);

      for (const fixture of fixtures) {
        expect(() => parser.parse(loadFixture(fixture))).not.toThrow();
      }
    });
  });

  // ==========================================================================
  // Example File Tests
  // ==========================================================================

  describe('Example Files', () => {
    it('parses vr-interactions.hsplus', () => {
      const result = parser.parse(loadExample('vr-interactions'));
      expect(result).toBeDefined();
      expect(result.ast).toBeDefined();
    });

    it('parses researcher-viralist.hsplus', () => {
      const result = parser.parse(loadExample('researcher-viralist'));
      expect(result).toBeDefined();
      expect(result.ast).toBeDefined();
    });

    it('parses all examples without throwing', () => {
      if (!existsSync(examplesDir)) return;
      const examples = readdirSync(examplesDir).filter((f) => f.endsWith('.hsplus'));
      expect(examples.length).toBeGreaterThan(0);

      for (const example of examples) {
        expect(() => parser.parse(loadExample(example))).not.toThrow();
      }
    });
  });

  // ==========================================================================
  // Trait Coverage Tests - OPTIMIZED to prevent OOM
  // ==========================================================================

  describe('Trait Coverage - Representative Sample', () => {
    it('parses core VR interaction traits', () => {
      // Test a few key traits from each category instead of all 1800+
      const sampleTraits = CORE_VR_INTERACTION_TRAITS.slice(0, 5);
      for (const trait of sampleTraits) {
        const source = `orb#test @${trait} { position: [0, 0, 0] }`;
        expect(() => parser.parse(source)).not.toThrow();
      }
    });

    it('parses humanoid avatar traits', () => {
      const sampleTraits = HUMANOID_AVATAR_TRAITS.slice(0, 3);
      for (const trait of sampleTraits) {
        const source = `avatar#test @${trait} { name: "test" }`;
        expect(() => parser.parse(source)).not.toThrow();
      }
    });

    it('parses audio traits', () => {
      const sampleTraits = AUDIO_TRAITS.slice(0, 3);
      for (const trait of sampleTraits) {
        const source = `orb#test @${trait} { volume: 0.5 }`;
        expect(() => parser.parse(source)).not.toThrow();
      }
    });

    it('parses physics traits', () => {
      const sampleTraits = PHYSICS_EXPANSION_TRAITS.slice(0, 3);
      for (const trait of sampleTraits) {
        const source = `orb#test @${trait} { mass: 1.0 }`;
        expect(() => parser.parse(source)).not.toThrow();
      }
    });

    it('validates trait categories exist', () => {
      expect(CORE_VR_INTERACTION_TRAITS.length).toBeGreaterThan(0);
      expect(HUMANOID_AVATAR_TRAITS.length).toBeGreaterThan(0);
      expect(AUDIO_TRAITS.length).toBeGreaterThan(0);
      expect(PHYSICS_EXPANSION_TRAITS.length).toBeGreaterThan(0);
    });

    it('validates key traits are present', () => {
      expect(CORE_VR_INTERACTION_TRAITS).toContain('grabbable');
      expect(HUMANOID_AVATAR_TRAITS).toContain('skeleton');
      expect(PHYSICS_EXPANSION_TRAITS).toContain('stretchable');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('handles empty file', () => {
      expect(() => parser.parse('')).not.toThrow();
    });

    it('handles comment-only file', () => {
      expect(() => parser.parse('// comment\\n// another')).not.toThrow();
    });

    it('handles whitespace-only file', () => {
      expect(() => parser.parse('   \\n\\n   \\t\\t   ')).not.toThrow();
    });

    it('handles multiple traits on single line', () => {
      const result = parser.parse(
        'orb#test @grabbable @throwable @hoverable { position: [0,0,0] }'
      );
      expect(result).toBeDefined();
      expect(result.ast.root.traits.has('grabbable')).toBe(true);
    });

    it('handles traits with complex config', () => {
      const source = `avatar#npc @skeleton(type: "humanoid", ik_enabled: true) { name: "NPC" }`;
      const result = parser.parse(source);
      expect(result).toBeDefined();
      expect(result.ast.root.traits.has('skeleton')).toBe(true);
    });
  });
});