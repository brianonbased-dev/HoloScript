/**
 * constraintConfig Tests
 *
 * Tests the config-driven trait constraint loader: loadConstraintsFromConfig
 * and loadConstraintsFromFile (graceful degradation when file not found).
 */

import { describe, it, expect } from 'vitest';
import { loadConstraintsFromConfig, loadConstraintsFromFile } from '../constraintConfig';

describe('constraintConfig', () => {
  describe('loadConstraintsFromConfig', () => {
    it('returns empty array for null input', () => {
      expect(loadConstraintsFromConfig(null)).toEqual([]);
    });

    it('returns empty array for undefined input', () => {
      expect(loadConstraintsFromConfig(undefined)).toEqual([]);
    });

    it('returns empty array for non-object input', () => {
      expect(loadConstraintsFromConfig('string')).toEqual([]);
      expect(loadConstraintsFromConfig(42)).toEqual([]);
      expect(loadConstraintsFromConfig(true)).toEqual([]);
    });

    it('returns empty array when traitConstraints is missing', () => {
      expect(loadConstraintsFromConfig({})).toEqual([]);
    });

    it('returns empty array when traitConstraints is not an array', () => {
      expect(loadConstraintsFromConfig({ traitConstraints: 'not-array' })).toEqual([]);
      expect(loadConstraintsFromConfig({ traitConstraints: {} })).toEqual([]);
    });

    it('parses a valid "requires" constraint', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [
          {
            type: 'requires',
            source: 'myTrait',
            targets: ['depTrait'],
            message: 'myTrait needs depTrait.',
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('requires');
      expect(result[0].source).toBe('myTrait');
      expect(result[0].targets).toEqual(['depTrait']);
      expect(result[0].message).toBe('myTrait needs depTrait.');
    });

    it('parses a valid "conflicts" constraint', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [
          {
            type: 'conflicts',
            source: 'traitA',
            targets: ['traitB'],
            message: 'A conflicts with B.',
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('conflicts');
    });

    it('parses a valid "oneof" constraint', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [
          {
            type: 'oneof',
            source: 'interaction',
            targets: ['grabbable', 'clickable'],
            message: 'Only one interaction mode.',
          },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('oneof');
      expect(result[0].targets).toEqual(['grabbable', 'clickable']);
    });

    it('includes suggestion when provided', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [
          {
            type: 'requires',
            source: 'a',
            targets: ['b'],
            message: 'Need b.',
            suggestion: 'Add @b to the orb.',
          },
        ],
      });

      expect(result[0].suggestion).toBe('Add @b to the orb.');
    });

    it('sets message/suggestion to undefined when not strings', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [
          {
            type: 'requires',
            source: 'a',
            targets: ['b'],
            message: 123,
            suggestion: null,
          },
        ],
      });

      expect(result[0].message).toBeUndefined();
      expect(result[0].suggestion).toBeUndefined();
    });

    it('skips entries with invalid type', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [
          { type: 'invalid', source: 'a', targets: ['b'] },
          { type: 'requires', source: 'a', targets: ['b'] },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('requires');
    });

    it('skips entries with empty source', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [{ type: 'requires', source: '', targets: ['b'] }],
      });

      expect(result).toHaveLength(0);
    });

    it('skips entries with empty targets array', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [{ type: 'requires', source: 'a', targets: [] }],
      });

      expect(result).toHaveLength(0);
    });

    it('skips entries with non-string targets', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [{ type: 'requires', source: 'a', targets: [123, 'b'] }],
      });

      expect(result).toHaveLength(0);
    });

    it('skips null/non-object entries in array', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [
          null,
          undefined,
          'string',
          42,
          { type: 'requires', source: 'a', targets: ['b'] },
        ],
      });

      expect(result).toHaveLength(1);
    });

    it('handles multiple valid constraints', () => {
      const result = loadConstraintsFromConfig({
        traitConstraints: [
          { type: 'requires', source: 'a', targets: ['b'] },
          { type: 'conflicts', source: 'c', targets: ['d', 'e'] },
          { type: 'oneof', source: 'f', targets: ['g', 'h', 'i'] },
        ],
      });

      expect(result).toHaveLength(3);
    });
  });

  describe('loadConstraintsFromFile', () => {
    it('returns empty array when file does not exist', async () => {
      const result = await loadConstraintsFromFile('nonexistent-path.json');
      expect(result).toEqual([]);
    });

    it('returns empty array for default path when file does not exist', async () => {
      const result = await loadConstraintsFromFile();
      expect(result).toEqual([]);
    });
  });
});
