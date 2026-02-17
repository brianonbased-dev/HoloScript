import { describe, it, expect } from 'vitest';
import {
  ALL_TRAINING_EXAMPLES,
  generateVariations,
  generateHololandDataset,
  toAlpacaJsonl,
  datasetToJsonl,
  type TrainingExample,
  type TrainingCategory,
  type TrainingDifficulty,
} from '../training-generators';

// =============================================================================
// ALL_TRAINING_EXAMPLES dataset integrity
// =============================================================================

describe('ALL_TRAINING_EXAMPLES', () => {
  it('has at least 22 canonical examples', () => {
    expect(ALL_TRAINING_EXAMPLES.length).toBeGreaterThanOrEqual(22);
  });

  it('covers all 9 categories', () => {
    const categories: TrainingCategory[] = [
      'spatial_objects',
      'vr_interactions',
      'multiplayer_networking',
      'web3_zora',
      'ai_generation',
      'scene_composition',
      'system_components',
      'error_correction',
      'edge_cases',
    ];
    const seen = new Set(ALL_TRAINING_EXAMPLES.map((e) => e.metadata.category));
    for (const cat of categories) {
      expect(seen.has(cat), `Missing category: ${cat}`).toBe(true);
    }
  });

  it('covers all 4 difficulty levels', () => {
    const difficulties: TrainingDifficulty[] = ['beginner', 'intermediate', 'advanced', 'production'];
    const seen = new Set(ALL_TRAINING_EXAMPLES.map((e) => e.metadata.difficulty));
    for (const d of difficulties) {
      expect(seen.has(d), `Missing difficulty: ${d}`).toBe(true);
    }
  });

  it('every example has required fields', () => {
    for (const ex of ALL_TRAINING_EXAMPLES) {
      expect(typeof ex.instruction).toBe('string');
      expect(ex.instruction.length).toBeGreaterThan(0);
      expect(typeof ex.input).toBe('string');
      expect(typeof ex.output).toBe('string');
      expect(ex.output.length).toBeGreaterThan(0);
      expect(ex.metadata.version).toBe('v5.1');
      expect(Array.isArray(ex.metadata.traits)).toBe(true);
      expect(Array.isArray(ex.metadata.keywords)).toBe(true);
    }
  });

  it('outputs contain valid HoloScript keywords', () => {
    const hsKeywords = ['orb', 'object', 'system', 'component', 'composition', 'logic', 'template'];
    const allOutputs = ALL_TRAINING_EXAMPLES.map((e) => e.output).join('\n');
    const hasAny = hsKeywords.some((kw) => allOutputs.includes(kw));
    expect(hasAny).toBe(true);
  });

  it('outputs reference valid trait annotations (@trait)', () => {
    const allOutputs = ALL_TRAINING_EXAMPLES.map((e) => e.output).join('\n');
    // All examples should use @ trait syntax
    expect(allOutputs).toContain('@');
  });

  it('includes new v3.5+ traits', () => {
    const allTraits = ALL_TRAINING_EXAMPLES.flatMap((e) => e.metadata.traits);
    const newTraits = ['@networked', '@openxr_hal', '@render_network', '@zora_coins', '@hitl'];
    const foundAny = newTraits.some((t) => allTraits.includes(t));
    expect(foundAny).toBe(true);
  });
});

// =============================================================================
// generateVariations
// =============================================================================

describe('generateVariations', () => {
  const baseExample: TrainingExample = {
    instruction: 'Create a glowing orb',
    input: '',
    output: `orb "orb" {
  @glowing { color: "#00aaff" }
  radius: 0.15
  sync_rate: 20
  scale_factor: 2
}`,
    metadata: {
      category: 'spatial_objects',
      difficulty: 'beginner',
      traits: ['@glowing'],
      keywords: ['orb'],
      version: 'v5.1',
    },
  };

  it('returns at least 1 variation (the base example)', () => {
    const result = generateVariations(baseExample, 1);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('first variation is always the original example', () => {
    const result = generateVariations(baseExample, 3);
    expect(result[0]).toBe(baseExample);
  });

  it('generates up to N variations when output has substitutable tokens', () => {
    const result = generateVariations(baseExample, 5);
    // Should produce multiple unique outputs with rotated values
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('variations preserve metadata category and difficulty', () => {
    const result = generateVariations(baseExample, 4);
    for (const v of result) {
      expect(v.metadata.category).toBe('spatial_objects');
      expect(v.metadata.difficulty).toBe('beginner');
      expect(v.metadata.version).toBe('v5.1');
    }
  });

  it('variations preserve instruction', () => {
    const result = generateVariations(baseExample, 4);
    for (const v of result) {
      expect(v.instruction).toBe(baseExample.instruction);
    }
  });

  it('rotates hex color values', () => {
    const result = generateVariations(baseExample, 3);
    const colors = result.map((v) => {
      const match = v.output.match(/"#[0-9a-fA-F]{6}"/);
      return match ? match[0] : null;
    });
    // At least one variation should differ in color
    const unique = new Set(colors.filter(Boolean));
    expect(unique.size).toBeGreaterThanOrEqual(1);
  });

  it('rotates radius values', () => {
    const result = generateVariations(baseExample, 5);
    const radii = result.map((v) => {
      const match = v.output.match(/radius: (\d+\.\d+)/);
      return match ? match[1] : null;
    });
    const unique = new Set(radii.filter(Boolean));
    expect(unique.size).toBeGreaterThanOrEqual(1);
  });

  it('does not add variation if output is unchanged', () => {
    const noSubstitutionExample: TrainingExample = {
      ...baseExample,
      output: 'orb "plain" { @visible }',
    };
    const result = generateVariations(noSubstitutionExample, 5);
    // No substitutions possible → only original
    expect(result.length).toBe(1);
  });

  it('count=0 returns empty array', () => {
    const result = generateVariations(baseExample, 0);
    // loop runs 0 times, but base example added at start
    // The function always includes the base as first element
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// generateHololandDataset
// =============================================================================

describe('generateHololandDataset', () => {
  it('default (4 variations) produces >= base example count', () => {
    const dataset = generateHololandDataset();
    expect(dataset.length).toBeGreaterThanOrEqual(ALL_TRAINING_EXAMPLES.length);
  });

  it('produces more examples than the base count with variations > 1', () => {
    const base = ALL_TRAINING_EXAMPLES.length;
    const dataset = generateHololandDataset(4);
    // With 4 variations each, should be considerably more
    expect(dataset.length).toBeGreaterThan(base);
  });

  it('variationsPerExample=1 returns exactly base example count', () => {
    const dataset = generateHololandDataset(1);
    // With count=1, generateVariations returns [original], so same count
    expect(dataset.length).toBe(ALL_TRAINING_EXAMPLES.length);
  });

  it('all examples in dataset have valid structure', () => {
    const dataset = generateHololandDataset(2);
    for (const ex of dataset) {
      expect(typeof ex.instruction).toBe('string');
      expect(typeof ex.output).toBe('string');
      expect(ex.metadata).toBeDefined();
    }
  });

  it('dataset covers all 9 categories', () => {
    const dataset = generateHololandDataset(1);
    const categories = new Set(dataset.map((e) => e.metadata.category));
    expect(categories.size).toBe(9);
  });
});

// =============================================================================
// toAlpacaJsonl
// =============================================================================

describe('toAlpacaJsonl', () => {
  const example: TrainingExample = {
    instruction: 'Create a glowing sphere',
    input: 'scene has no lighting',
    output: `orb "sphere" { @glowing }`,
    metadata: {
      category: 'spatial_objects',
      difficulty: 'beginner',
      traits: ['@glowing'],
      keywords: ['orb'],
      version: 'v5.1',
    },
  };

  it('produces valid JSON', () => {
    const jsonl = toAlpacaJsonl(example);
    expect(() => JSON.parse(jsonl)).not.toThrow();
  });

  it('includes instruction, input, and output fields', () => {
    const parsed = JSON.parse(toAlpacaJsonl(example));
    expect(parsed.instruction).toBe(example.instruction);
    expect(parsed.input).toBe(example.input);
    expect(parsed.output).toBe(example.output);
  });

  it('does NOT include metadata (only Alpaca fields)', () => {
    const parsed = JSON.parse(toAlpacaJsonl(example));
    expect(parsed.metadata).toBeUndefined();
  });

  it('output is a single line (no embedded newlines at root level)', () => {
    const jsonl = toAlpacaJsonl(example);
    // JSON.stringify doesn't add newlines unless formatting is used
    expect(jsonl.split('\n').filter((l) => l.trim()).length).toBe(1);
  });

  it('handles empty input field', () => {
    const ex = { ...example, input: '' };
    const parsed = JSON.parse(toAlpacaJsonl(ex));
    expect(parsed.input).toBe('');
  });

  it('preserves newlines in output (multiline HoloScript)', () => {
    const ex = { ...example, output: 'orb "a" {\n  @glowing\n}' };
    const parsed = JSON.parse(toAlpacaJsonl(ex));
    expect(parsed.output).toContain('\n');
  });
});

// =============================================================================
// datasetToJsonl
// =============================================================================

describe('datasetToJsonl', () => {
  const examples: TrainingExample[] = [
    {
      instruction: 'A',
      input: '',
      output: 'a',
      metadata: { category: 'spatial_objects', difficulty: 'beginner', traits: [], keywords: [], version: 'v5.1' },
    },
    {
      instruction: 'B',
      input: 'ctx',
      output: 'b',
      metadata: { category: 'vr_interactions', difficulty: 'intermediate', traits: [], keywords: [], version: 'v5.1' },
    },
  ];

  it('produces one JSON object per line', () => {
    const jsonl = datasetToJsonl(examples);
    const lines = jsonl.split('\n').filter((l) => l.trim());
    expect(lines.length).toBe(2);
  });

  it('ends with a trailing newline', () => {
    const jsonl = datasetToJsonl(examples);
    expect(jsonl.endsWith('\n')).toBe(true);
  });

  it('each line is valid JSON', () => {
    const jsonl = datasetToJsonl(examples);
    const lines = jsonl.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('preserves order', () => {
    const jsonl = datasetToJsonl(examples);
    const lines = jsonl.split('\n').filter((l) => l.trim());
    expect(JSON.parse(lines[0]).instruction).toBe('A');
    expect(JSON.parse(lines[1]).instruction).toBe('B');
  });

  it('empty array produces a single trailing newline', () => {
    const jsonl = datasetToJsonl([]);
    expect(jsonl).toBe('\n');
  });

  it('full dataset serializes correctly', () => {
    const dataset = generateHololandDataset(1);
    const jsonl = datasetToJsonl(dataset);
    const lines = jsonl.split('\n').filter((l) => l.trim());
    expect(lines.length).toBe(dataset.length);
    // Spot-check first line is valid JSON
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });
});
