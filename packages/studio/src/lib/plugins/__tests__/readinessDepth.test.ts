import { describe, expect, it } from 'vitest';
import { READINESS_DEPTH_LABELS, normalizeReadinessDepth } from '../types';

describe('plugin readiness depth', () => {
  it('normalizes missing legacy metadata to preview', () => {
    expect(normalizeReadinessDepth(undefined)).toBe('sketch');
    expect(normalizeReadinessDepth(null)).toBe('sketch');
  });

  it('keeps real metadata explicit', () => {
    expect(normalizeReadinessDepth('real')).toBe('real');
    expect(READINESS_DEPTH_LABELS.real).toBe('Real');
    expect(READINESS_DEPTH_LABELS.sketch).toBe('Preview');
  });
});
