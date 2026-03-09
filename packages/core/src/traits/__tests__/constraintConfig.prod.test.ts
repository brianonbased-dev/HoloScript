/**
 * constraintConfig Production Tests
 *
 * loadConstraintsFromConfig validation (valid/invalid/edge cases).
 */

import { describe, it, expect } from 'vitest';
import { loadConstraintsFromConfig } from '../constraintConfig';

describe('loadConstraintsFromConfig — Production', () => {
  it('returns empty for null/undefined', () => {
    expect(loadConstraintsFromConfig(null)).toEqual([]);
    expect(loadConstraintsFromConfig(undefined)).toEqual([]);
  });

  it('returns empty for non-object', () => {
    expect(loadConstraintsFromConfig('string')).toEqual([]);
    expect(loadConstraintsFromConfig(42)).toEqual([]);
  });

  it('returns empty for missing traitConstraints', () => {
    expect(loadConstraintsFromConfig({})).toEqual([]);
  });

  it('returns empty for non-array traitConstraints', () => {
    expect(loadConstraintsFromConfig({ traitConstraints: 'not-array' })).toEqual([]);
  });

  it('parses valid requires constraint', () => {
    const config = {
      traitConstraints: [
        {
          type: 'requires',
          source: 'physics',
          targets: ['collidable'],
          message: 'Physics needs collision.',
        },
      ],
    };
    const result = loadConstraintsFromConfig(config);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('requires');
    expect(result[0].source).toBe('physics');
    expect(result[0].targets).toEqual(['collidable']);
  });

  it('parses conflicts constraint', () => {
    const config = {
      traitConstraints: [
        {
          type: 'conflicts',
          source: 'static',
          targets: ['physics'],
          message: 'Static conflicts physics.',
        },
      ],
    };
    expect(loadConstraintsFromConfig(config)).toHaveLength(1);
  });

  it('parses oneof constraint', () => {
    const config = {
      traitConstraints: [
        {
          type: 'oneof',
          source: 'interaction',
          targets: ['grab', 'click'],
          message: 'One interaction.',
        },
      ],
    };
    expect(loadConstraintsFromConfig(config)).toHaveLength(1);
  });

  it('includes optional suggestion', () => {
    const config = {
      traitConstraints: [
        {
          type: 'requires',
          source: 'a',
          targets: ['b'],
          message: 'A needs B.',
          suggestion: 'Add @b trait.',
        },
      ],
    };
    const result = loadConstraintsFromConfig(config);
    expect(result[0].suggestion).toBe('Add @b trait.');
  });

  it('skips invalid entries', () => {
    const config = {
      traitConstraints: [
        null,
        { type: 'invalid', source: 'x', targets: ['y'] },
        { type: 'requires', source: '', targets: ['y'] }, // empty source
        { type: 'requires', source: 'x', targets: [] }, // empty targets
        { type: 'requires', source: 'x', targets: [123] }, // non-string target
        { type: 'requires', source: 'valid', targets: ['dep'], message: 'ok' }, // valid
      ],
    };
    const result = loadConstraintsFromConfig(config);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('valid');
  });

  it('handles message as optional', () => {
    const config = {
      traitConstraints: [
        {
          type: 'requires',
          source: 'a',
          targets: ['b'],
        },
      ],
    };
    const result = loadConstraintsFromConfig(config);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBeUndefined();
  });
});
