/**
 * Training Schema Tests
 *
 * Gap 1: Validates training example schema and validation functions.
 */

import { describe, it, expect } from 'vitest';
import { validateTrainingExample } from '../schema';
import type { TrainingExample } from '../schema';

describe('validateTrainingExample', () => {
  const validExample: TrainingExample = {
    instruction: 'Create a grabbable cube',
    input: '',
    output: 'object "Cube" @grabbable { position: [0,1,0] }',
    metadata: {
      category: 'vr-interaction',
      difficulty: 'beginner',
      traits: ['grabbable'],
      keywords: ['vr', 'interaction'],
      version: '6.0.0',
    },
  };

  it('validates a correct training example', () => {
    const result = validateTrainingExample(validExample);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects null input', () => {
    const result = validateTrainingExample(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('root');
  });

  it('rejects missing instruction', () => {
    const result = validateTrainingExample({
      ...validExample,
      instruction: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'instruction')).toBe(true);
  });

  it('rejects missing output', () => {
    const result = validateTrainingExample({
      ...validExample,
      output: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'output')).toBe(true);
  });

  it('rejects missing metadata', () => {
    const { metadata, ...noMeta } = validExample;
    const result = validateTrainingExample(noMeta);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'metadata')).toBe(true);
  });

  it('warns about missing traits array', () => {
    const result = validateTrainingExample({
      ...validExample,
      metadata: {
        ...validExample.metadata,
        traits: 'not-an-array' as any,
      },
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
