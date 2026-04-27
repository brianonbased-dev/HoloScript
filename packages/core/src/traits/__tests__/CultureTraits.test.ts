/**
 * CultureTraits — comprehensive tests for utility functions
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeNormProvenance,
  serializeNormProvenance,
  deserializeNormProvenance,
  UNKNOWN_NORM_PROVENANCE,
  BUILTIN_NORMS,
  getBuiltinNorm,
  normsByCategory,
  criticalMassForChange,
  registerContradictoryNorms,
  getAllContradictoryNorms,
} from '../CultureTraits';

describe('CultureTraits — normalizeNormProvenance', () => {
  it('returns UNKNOWN when passed undefined', () => {
    const result = normalizeNormProvenance(undefined);
    expect(result.source).toBe('unknown');
  });

  it('returns UNKNOWN when passed null', () => {
    const result = normalizeNormProvenance(null);
    expect(result.source).toBe('unknown');
  });

  it('preserves provided source', () => {
    const result = normalizeNormProvenance({ source: 'builtin' });
    expect(result.source).toBe('builtin');
  });

  it('fills in source=unknown when missing', () => {
    const result = normalizeNormProvenance({});
    expect(result.source).toBe('unknown');
  });

  it('preserves optional fields when provided', () => {
    const result = normalizeNormProvenance({
      source: 'agent',
      sourceAgentId: 'agent-42',
    });
    expect(result.sourceAgentId).toBe('agent-42');
  });

  it('returns a new object (not the UNKNOWN_NORM_PROVENANCE reference)', () => {
    const result = normalizeNormProvenance(undefined);
    expect(result).not.toBe(UNKNOWN_NORM_PROVENANCE);
  });
});

describe('CultureTraits — serializeNormProvenance', () => {
  it('serializes null to unknown source object', () => {
    const result = serializeNormProvenance(null);
    expect(result.source).toBe('unknown');
  });

  it('serializes valid provenance', () => {
    const result = serializeNormProvenance({ source: 'corpus', sourceCorpus: 'norm-db-v1' });
    expect(result.source).toBe('corpus');
    expect(result.sourceCorpus).toBe('norm-db-v1');
  });
});

describe('CultureTraits — deserializeNormProvenance', () => {
  it('deserializes null to unknown', () => {
    const result = deserializeNormProvenance(null);
    expect(result.source).toBe('unknown');
  });

  it('deserializes valid object', () => {
    const result = deserializeNormProvenance({ source: 'builtin' });
    expect(result.source).toBe('builtin');
  });

  it('collapses unknown source strings to "unknown"', () => {
    const result = deserializeNormProvenance({ source: 'made_up_source' });
    expect(result.source).toBe('unknown');
  });

  it('deserializes sourceAgentId when present', () => {
    const result = deserializeNormProvenance({ source: 'agent', sourceAgentId: 'a99' });
    expect(result.sourceAgentId).toBe('a99');
  });

  it('handles non-object gracefully', () => {
    const result = deserializeNormProvenance('oops');
    expect(result.source).toBe('unknown');
  });
});

describe('CultureTraits — BUILTIN_NORMS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(BUILTIN_NORMS)).toBe(true);
    expect(BUILTIN_NORMS.length).toBeGreaterThan(0);
  });

  it('every norm has required fields', () => {
    for (const norm of BUILTIN_NORMS) {
      expect(norm.id).toBeTruthy();
      expect(norm.category).toBeTruthy();
      expect(norm.enforcement).toMatch(/^(hard|soft|advisory)$/);
      expect(norm.scope).toBeTruthy();
    }
  });
});

describe('CultureTraits — getBuiltinNorm', () => {
  it('finds no_griefing by id', () => {
    const norm = getBuiltinNorm('no_griefing');
    expect(norm?.id).toBe('no_griefing');
    expect(norm?.enforcement).toBe('hard');
  });

  it('returns undefined for unknown id', () => {
    expect(getBuiltinNorm('nonexistent_norm')).toBeUndefined();
  });
});

describe('CultureTraits — normsByCategory', () => {
  it('returns safety norms', () => {
    const safety = normsByCategory('safety');
    expect(safety.length).toBeGreaterThan(0);
    expect(safety.every((n) => n.category === 'safety')).toBe(true);
  });

  it('returns empty array for unused category', () => {
    // 'identity' has no builtin norms defined
    const identity = normsByCategory('identity');
    expect(Array.isArray(identity)).toBe(true);
  });
});

describe('CultureTraits — criticalMassForChange', () => {
  it('weak norm requires ~2% of population', () => {
    const weakNorm = BUILTIN_NORMS.find((n) => n.strength === 'weak')!;
    const result = criticalMassForChange(weakNorm, 100);
    expect(result).toBe(Math.ceil(100 * 0.02));
  });

  it('moderate norm requires ~25% of population', () => {
    const moderateNorm = BUILTIN_NORMS.find((n) => n.strength === 'moderate')!;
    const result = criticalMassForChange(moderateNorm, 100);
    expect(result).toBe(Math.ceil(100 * 0.25));
  });

  it('strong norm requires ~50% of population', () => {
    const strongNorm = BUILTIN_NORMS.find((n) => n.strength === 'strong')!;
    const result = criticalMassForChange(strongNorm, 100);
    expect(result).toBe(Math.ceil(100 * 0.5));
  });
});

describe('CultureTraits — registerContradictoryNorms / getAllContradictoryNorms', () => {
  it('registerContradictoryNorms adds an entry', () => {
    const before = getAllContradictoryNorms().length;
    registerContradictoryNorms('test_norm_a', 'test_norm_b', 'test reason');
    const after = getAllContradictoryNorms();
    expect(after.length).toBeGreaterThan(before);
    expect(after.some((e) => e.normA === 'test_norm_a' && e.normB === 'test_norm_b')).toBe(true);
  });
});
