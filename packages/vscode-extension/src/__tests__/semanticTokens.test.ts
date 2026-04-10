import { describe, it, expect } from 'vitest';
import { TOKEN_TYPES, TOKEN_MODIFIERS } from '../semanticTokensProvider';

describe('Semantic Tokens', () => {
  describe('TOKEN_TYPES', () => {
    it('should have required token types', () => {
      expect(TOKEN_TYPES).toContain('namespace');
      expect(TOKEN_TYPES).toContain('class');
      expect(TOKEN_TYPES).toContain('decorator');
      expect(TOKEN_TYPES).toContain('keyword');
      expect(TOKEN_TYPES).toContain('property');
      expect(TOKEN_TYPES).toContain('variable');
      expect(TOKEN_TYPES).toContain('function');
      expect(TOKEN_TYPES).toContain('string');
      expect(TOKEN_TYPES).toContain('number');
      expect(TOKEN_TYPES).toContain('comment');
      expect(TOKEN_TYPES).toContain('operator');
    });

    it('should have correct number of token types', () => {
      expect(TOKEN_TYPES.length).toBeGreaterThanOrEqual(10);
    });

    it('should have unique token types', () => {
      const uniqueTypes = new Set(TOKEN_TYPES);
      expect(uniqueTypes.size).toBe(TOKEN_TYPES.length);
    });

    it('should all be non-empty strings', () => {
      for (const type of TOKEN_TYPES) {
        expect(type.length).toBeGreaterThan(0);
        expect(typeof type).toBe('string');
      }
    });
  });

  describe('TOKEN_MODIFIERS', () => {
    it('should have required modifiers', () => {
      expect(TOKEN_MODIFIERS).toContain('declaration');
      expect(TOKEN_MODIFIERS).toContain('definition');
      expect(TOKEN_MODIFIERS).toContain('readonly');
    });

    it('should have unique modifiers', () => {
      const uniqueModifiers = new Set(TOKEN_MODIFIERS);
      expect(uniqueModifiers.size).toBe(TOKEN_MODIFIERS.length);
    });

    it('should all be non-empty strings', () => {
      for (const modifier of TOKEN_MODIFIERS) {
        expect(modifier.length).toBeGreaterThan(0);
        expect(typeof modifier).toBe('string');
      }
    });
  });

  describe('token type indices', () => {
    it('should be able to find decorator index', () => {
      const decoratorIndex = TOKEN_TYPES.indexOf('decorator');
      expect(decoratorIndex).toBeGreaterThanOrEqual(0);
    });

    it('should be able to find keyword index', () => {
      const keywordIndex = TOKEN_TYPES.indexOf('keyword');
      expect(keywordIndex).toBeGreaterThanOrEqual(0);
    });

    it('should be able to find property index', () => {
      const propertyIndex = TOKEN_TYPES.indexOf('property');
      expect(propertyIndex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('HoloScript-specific tokens', () => {
    it('should have decorator type for traits', () => {
      expect(TOKEN_TYPES).toContain('decorator');
    });

    it('should have namespace for composition names', () => {
      expect(TOKEN_TYPES).toContain('namespace');
    });

    it('should have class type for object/template names', () => {
      expect(TOKEN_TYPES).toContain('class');
    });

    it('should have enumMember for constants', () => {
      expect(TOKEN_TYPES).toContain('enumMember');
    });
  });

  describe('modifier bitmask support', () => {
    it('should have modifiers that can be combined', () => {
      // In VS Code semantic tokens, modifiers are combined using bitmasks
      // Each modifier represents a power of 2
      const modifierCount = TOKEN_MODIFIERS.length;
      expect(modifierCount).toBeLessThanOrEqual(16); // VS Code supports up to 16 modifiers
    });

    it('should have declaration and definition modifiers', () => {
      expect(TOKEN_MODIFIERS).toContain('declaration');
      expect(TOKEN_MODIFIERS).toContain('definition');
    });

    it('should have defaultLibrary for built-in traits', () => {
      expect(TOKEN_MODIFIERS).toContain('defaultLibrary');
    });
  });
});
