/**
 * Sprint 46 — @holoscript/mcp-server acceptance tests
 * Covers: suggestTraits(), generateObject(), keyword-to-trait mappings
 */
import { describe, it, expect } from 'vitest';
import { suggestTraits, generateObject } from '../generators';

// ═══════════════════════════════════════════════
// suggestTraits
// ═══════════════════════════════════════════════
describe('suggestTraits', () => {
  it('is a function', () => {
    expect(typeof suggestTraits).toBe('function');
  });

  it('returns an object with traits, reasoning, confidence', () => {
    const result = suggestTraits('a glowing orb');
    expect(result).toHaveProperty('traits');
    expect(result).toHaveProperty('reasoning');
    expect(result).toHaveProperty('confidence');
  });

  it('traits is an array of strings', () => {
    const { traits } = suggestTraits('some object');
    expect(Array.isArray(traits)).toBe(true);
  });

  it('reasoning is a Record<string, string>', () => {
    const { reasoning } = suggestTraits('grab and throw it');
    expect(typeof reasoning).toBe('object');
    for (const val of Object.values(reasoning)) {
      expect(typeof val).toBe('string');
    }
  });

  it('confidence is a number between 0 and 1', () => {
    const { confidence } = suggestTraits('object');
    expect(typeof confidence).toBe('number');
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('detects "grab" keyword → @grabbable', () => {
    const { traits } = suggestTraits('object you can grab');
    expect(traits).toContain('@grabbable');
  });

  it('detects "throw" keyword → @throwable', () => {
    const { traits } = suggestTraits('throwable ball');
    expect(traits).toContain('@throwable');
    expect(traits).toContain('@grabbable');
  });

  it('detects "physics" keyword → @physics and @collidable', () => {
    const { traits } = suggestTraits('physics-enabled cube');
    expect(traits).toContain('@physics');
    expect(traits).toContain('@collidable');
  });

  it('detects "glow" → @glowing', () => {
    const { traits } = suggestTraits('glowing orb');
    expect(traits).toContain('@glowing');
  });

  it('detects "sync" → @networked and @synced', () => {
    const { traits } = suggestTraits('sync this object');
    expect(traits).toContain('@networked');
    expect(traits).toContain('@synced');
  });

  it('returns default @pointable when no keywords match', () => {
    // Use gibberish that contains none of the TRAIT_KEYWORDS substrings
    const { traits } = suggestTraits('zzz qqq xyzzy bbbb');
    expect(traits).toContain('@pointable');
  });

  it('includes reasoning entry for each suggested trait', () => {
    const { traits, reasoning } = suggestTraits('grab and bounce');
    for (const trait of traits) {
      expect(reasoning[trait]).toBeDefined();
    }
  });

  it('confidence increases with more traits', () => {
    const few = suggestTraits('plain object');
    const many = suggestTraits('grab throw bounce physics glow sync');
    expect(many.confidence).toBeGreaterThanOrEqual(few.confidence);
  });

  it('accepts optional context string', () => {
    const result = suggestTraits('an object', 'it should be grabbable');
    expect(result.traits).toContain('@grabbable');
  });

  it('context string contributes to detection', () => {
    const withCtx = suggestTraits('box', 'it should glow');
    expect(withCtx.traits).toContain('@glowing');
  });
});

// ═══════════════════════════════════════════════
// generateObject
// ═══════════════════════════════════════════════
describe('generateObject', () => {
  it('is a function', () => {
    expect(typeof generateObject).toBe('function');
  });

  it('returns code, traits, geometry, format', () => {
    const result = generateObject('a red cube');
    expect(result).toHaveProperty('code');
    expect(result).toHaveProperty('traits');
    expect(result).toHaveProperty('geometry');
    expect(result).toHaveProperty('format');
  });

  it('code is a non-empty string', () => {
    const { code } = generateObject('a blue sphere');
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
  });

  it('detects "cube" → geometry = "cube"', () => {
    const { geometry } = generateObject('a small cube');
    expect(geometry).toBe('cube');
  });

  it('detects "ball" → geometry = "sphere"', () => {
    const { geometry } = generateObject('a bouncy ball');
    expect(geometry).toBe('sphere');
  });

  it('detects "cylinder" → geometry = "cylinder"', () => {
    const { geometry } = generateObject('a shiny cylinder');
    expect(geometry).toBe('cylinder');
  });

  it('detects "ring" → geometry = "torus"', () => {
    const { geometry } = generateObject('a gold ring');
    expect(geometry).toBe('torus');
  });

  it('defaults to sphere when no geometry keyword', () => {
    const { geometry } = generateObject('unknown object xyzzy');
    expect(geometry).toBe('sphere');
  });

  it('format defaults to "hsplus"', () => {
    const { format } = generateObject('a sphere');
    expect(format).toBe('hsplus');
  });

  it('respects format option "hs"', () => {
    const { format } = generateObject('a sphere', { format: 'hs' });
    expect(format).toBe('hs');
  });

  it('respects format option "holo"', () => {
    const { format } = generateObject('a sphere', { format: 'holo' });
    expect(format).toBe('holo');
  });

  it('includes the color in the generated code', () => {
    const { code } = generateObject('a red box');
    expect(code).toContain('#ff0000');
  });

  it('uses default cyan color when no color keyword', () => {
    const { code } = generateObject('a mystery widget xyzzy');
    expect(code).toContain('#00ffff');
  });

  it('generated code contains composition keyword for hsplus', () => {
    const { code } = generateObject('a cube');
    expect(code).toContain('composition');
  });

  it('traits array is returned and is an array', () => {
    const { traits } = generateObject('a grabbable cube');
    expect(Array.isArray(traits)).toBe(true);
  });

  it('includeDocs option adds a comment to the code', () => {
    const { code } = generateObject('a glowing sphere', { includeDocs: true });
    expect(code).toMatch(/\/\//);
  });
});
