/**
 * NormProvenance Tests
 *
 * Validates the "norm provenance" addition to the CulturalTrace system:
 *  - The new {@link NormProvenance} type carries source/agent/corpus/declaration-site.
 *  - {@link CulturalNorm} and {@link CulturalTraceTrait} accept (optional) provenance.
 *  - Round-trip via {@link serializeNormProvenance} / {@link deserializeNormProvenance}
 *    is lossless for known fields.
 *  - **Backward compatibility**: pre-provenance norms (no `provenance` field) and
 *    pre-provenance traces (no `normProvenance` field) still parse cleanly, and
 *    deserialization never throws on missing or partial input.
 *  - {@link UNKNOWN_NORM_PROVENANCE} is the explicit absent-provenance sentinel.
 *
 * Source: 2026-03-10_confabulation-vw-backprop-AUTONOMIZE
 *         (todo_2026-03-10_confabulation-vw-backprop-AUTONOMIZE_8)
 */

import { describe, it, expect } from 'vitest';
import { readJson, jsonClone } from '../../errors/safeJsonParse';
import {
  BUILTIN_NORM_PROVENANCE,
  BUILTIN_NORMS,
  UNKNOWN_NORM_PROVENANCE,
  deserializeNormProvenance,
  getBuiltinNorm,
  normalizeNormProvenance,
  serializeNormProvenance,
} from '../CultureTraits';
import type {
  CulturalNorm,
  CulturalTraceTrait,
  NormProvenance,
} from '../CultureTraits';

describe('NormProvenance — sentinel + normalize', () => {
  it('UNKNOWN_NORM_PROVENANCE is frozen and shaped correctly', () => {
    expect(UNKNOWN_NORM_PROVENANCE).toEqual({ source: 'unknown' });
    expect(Object.isFrozen(UNKNOWN_NORM_PROVENANCE)).toBe(true);
  });

  it('normalizeNormProvenance maps undefined → UNKNOWN_NORM_PROVENANCE shape', () => {
    expect(normalizeNormProvenance(undefined)).toEqual({ source: 'unknown' });
    expect(normalizeNormProvenance(null)).toEqual({ source: 'unknown' });
  });

  it('normalizeNormProvenance preserves all known fields', () => {
    const input: NormProvenance = {
      source: 'agent',
      sourceAgentId: 'did:agent:alpha',
      sourceCorpus: 'CRSEC-2024',
      declarationSite: { file: 'examples/cultural.holo', line: 110, column: 4 },
      originInteractionId: 'session_42',
      confidenceClassification: 'genuine',
      recordedAtIso: '2026-04-19T12:00:00.000Z',
    };
    expect(normalizeNormProvenance(input)).toEqual(input);
  });

  it('normalizeNormProvenance fills in source="unknown" when missing', () => {
    const partial = { sourceAgentId: 'did:agent:beta' } as Partial<NormProvenance>;
    const out = normalizeNormProvenance(partial);
    expect(out.source).toBe('unknown');
    expect(out.sourceAgentId).toBe('did:agent:beta');
  });

  it('returns a new object — does not retain a reference to UNKNOWN_NORM_PROVENANCE', () => {
    const a = normalizeNormProvenance(undefined);
    const b = normalizeNormProvenance(undefined);
    expect(a).not.toBe(UNKNOWN_NORM_PROVENANCE);
    expect(a).not.toBe(b);
  });
});

describe('NormProvenance — serialize / deserialize round-trip', () => {
  it('round-trips a fully-populated provenance via JSON', () => {
    const original: NormProvenance = {
      source: 'declaration_site',
      sourceAgentId: 'did:agent:gamma',
      sourceCorpus: '@holoscript/core/BUILTIN_NORMS',
      declarationSite: { file: 'a.holo', line: 1, column: 2 },
      originInteractionId: 'sess_1',
      confidenceClassification: 'confabulated',
      recordedAtIso: '2026-04-19T00:00:00.000Z',
    };
    const wire = JSON.stringify(serializeNormProvenance(original));
    const restored = deserializeNormProvenance(readJson(wire) as unknown);
    expect(restored).toEqual(original);
  });

  it('round-trips each NormProvenanceSource value', () => {
    const sources: NormProvenance['source'][] = [
      'agent',
      'corpus',
      'declaration_site',
      'builtin',
      'observation',
      'unknown',
    ];
    for (const source of sources) {
      const wire = JSON.stringify(serializeNormProvenance({ source }));
      expect(deserializeNormProvenance(readJson(wire) as unknown).source).toBe(source);
    }
  });

  it('serializeNormProvenance always emits a source field', () => {
    expect(serializeNormProvenance(undefined)).toEqual({ source: 'unknown' });
    expect(serializeNormProvenance(null)).toEqual({ source: 'unknown' });
    // partial provenance promoted to canonical shape
    const out = serializeNormProvenance({
      sourceAgentId: 'did:agent:zeta',
    } as NormProvenance);
    expect(out.source).toBe('unknown');
    expect(out.sourceAgentId).toBe('did:agent:zeta');
  });

  it('declarationSite without a file is dropped during deserialization', () => {
    // Hostile / malformed payload — must not throw.
    const out = deserializeNormProvenance({
      source: 'declaration_site',
      declarationSite: { line: 5 },
    });
    expect(out.source).toBe('declaration_site');
    expect(out.declarationSite).toBeUndefined();
  });

  it('unknown confidenceClassification is dropped during deserialization', () => {
    const out = deserializeNormProvenance({
      source: 'agent',
      confidenceClassification: 'fabricated', // not in the taxonomy
    });
    expect(out.source).toBe('agent');
    expect(out.confidenceClassification).toBeUndefined();
  });
});

describe('NormProvenance — backward compatibility (deserialize)', () => {
  it('returns UNKNOWN sentinel shape for null / undefined / non-object inputs', () => {
    expect(deserializeNormProvenance(undefined)).toEqual({ source: 'unknown' });
    expect(deserializeNormProvenance(null)).toEqual({ source: 'unknown' });
    expect(deserializeNormProvenance('not-an-object')).toEqual({ source: 'unknown' });
    expect(deserializeNormProvenance(42)).toEqual({ source: 'unknown' });
  });

  it('coerces unknown source strings to "unknown" instead of throwing', () => {
    const out = deserializeNormProvenance({ source: 'sky-net-prophecy' });
    expect(out.source).toBe('unknown');
  });

  it('parses a partial record produced by an older writer', () => {
    // Older code might only have written sourceAgentId.
    const out = deserializeNormProvenance({ sourceAgentId: 'did:agent:legacy' });
    expect(out.source).toBe('unknown');
    expect(out.sourceAgentId).toBe('did:agent:legacy');
  });

  it('never throws on hostile / malformed input', () => {
    expect(() => deserializeNormProvenance({ source: 123, declarationSite: 'x' })).not.toThrow();
    expect(() => deserializeNormProvenance([])).not.toThrow();
  });
});

describe('CulturalNorm — backward compatibility', () => {
  it('CulturalNorm without `provenance` is still a valid value', () => {
    // This compiles because `provenance` is optional. The runtime
    // cost is zero — older norm loaders pass through unchanged.
    const legacy: CulturalNorm = {
      id: 'legacy_norm',
      name: 'Legacy Norm',
      description: 'A norm declared before the provenance field existed.',
      category: 'cooperation',
      enforcement: 'soft',
      scope: 'zone',
      activationThreshold: 0.5,
      strength: 'moderate',
    };
    expect(legacy.provenance).toBeUndefined();
    // Coercing through normalizeNormProvenance produces the unknown sentinel.
    expect(normalizeNormProvenance(legacy.provenance)).toEqual({ source: 'unknown' });
  });

  it('every BUILTIN_NORMS entry carries BUILTIN_NORM_PROVENANCE', () => {
    expect(BUILTIN_NORMS.length).toBeGreaterThan(0);
    for (const norm of BUILTIN_NORMS) {
      expect(norm.provenance).toBe(BUILTIN_NORM_PROVENANCE);
      expect(norm.provenance?.source).toBe('builtin');
      expect(norm.provenance?.sourceCorpus).toBe('@holoscript/core/BUILTIN_NORMS');
    }
  });

  it('BUILTIN_NORM_PROVENANCE is frozen', () => {
    expect(Object.isFrozen(BUILTIN_NORM_PROVENANCE)).toBe(true);
  });

  it('getBuiltinNorm preserves provenance', () => {
    const n = getBuiltinNorm('no_griefing');
    expect(n).toBeDefined();
    expect(n?.provenance?.source).toBe('builtin');
  });

  it('round-trips a CulturalNorm with provenance via JSON without losing the field', () => {
    const norm: CulturalNorm = {
      id: 'agent_proposed_kindness',
      name: 'Be Kind',
      description: 'Proposed by an agent during a session.',
      category: 'cooperation',
      enforcement: 'advisory',
      scope: 'session',
      activationThreshold: 0.5,
      strength: 'weak',
      provenance: {
        source: 'agent',
        sourceAgentId: 'did:agent:alpha',
        recordedAtIso: '2026-04-19T12:00:00.000Z',
        confidenceClassification: 'genuine',
      },
    };
    const wire = JSON.stringify(norm);
    const restored = readJson(wire) as CulturalNorm;
    expect(restored.provenance).toEqual(norm.provenance);
    // Deserialize-via-helper also succeeds.
    expect(deserializeNormProvenance(restored.provenance)).toEqual(norm.provenance);
  });

  it('round-trips a pre-provenance CulturalNorm with no field loss', () => {
    const legacy: CulturalNorm = {
      id: 'legacy_norm',
      name: 'Legacy Norm',
      description: 'Pre-provenance.',
      category: 'cooperation',
      enforcement: 'soft',
      scope: 'zone',
      activationThreshold: 0.5,
      strength: 'moderate',
    };
    const restored = jsonClone(legacy) as CulturalNorm;
    expect(restored.provenance).toBeUndefined();
    expect(restored).toEqual(legacy);
  });
});

describe('CulturalTraceTrait — backward compatibility', () => {
  it('CulturalTraceTrait without `normProvenance` is still a valid value', () => {
    const trace: CulturalTraceTrait = {
      traceType: 'marker',
      intensity: 0.5,
      decayRate: 0.01,
      label: 'rest_stop',
      perceptionRadius: 5,
    };
    expect(trace.normProvenance).toBeUndefined();
  });

  it('CulturalTraceTrait can carry the unified NormProvenance shape', () => {
    const trace: CulturalTraceTrait = {
      traceType: 'signal',
      intensity: 0.9,
      decayRate: 0.05,
      label: 'hazard',
      perceptionRadius: 10,
      creatorId: 'agent_observer_1',
      normProvenance: {
        source: 'observation',
        originInteractionId: 'session_99',
        confidenceClassification: 'genuine',
        recordedAtIso: '2026-04-19T12:00:00.000Z',
      },
    };
    expect(trace.normProvenance?.source).toBe('observation');
  });

  it('round-trips a CulturalTraceTrait with normProvenance via JSON', () => {
    const trace: CulturalTraceTrait = {
      traceType: 'artifact',
      intensity: 0.8,
      decayRate: 0,
      label: 'monument',
      perceptionRadius: 20,
      normProvenance: {
        source: 'declaration_site',
        declarationSite: { file: 'examples/04-cultural.holo', line: 110 },
      },
    };
    const wire = JSON.stringify(trace);
    const restored = readJson(wire) as CulturalTraceTrait;
    expect(restored.normProvenance).toEqual(trace.normProvenance);
  });
});
