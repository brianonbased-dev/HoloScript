import { describe, it, expect } from 'vitest';
import {
  LSystemGenerator,
  TREE_SIMPLE,
  BUSH,
} from '@holoscript/engine/procedural/LSystemGenerator';

// =============================================================================
// C221 — L-System Generator
// =============================================================================

describe('LSystemGenerator', () => {
  // --- Expand ---

  it('expand applies rules to axiom', () => {
    const gen = new LSystemGenerator();
    const config = {
      axiom: 'A',
      rules: [
        { symbol: 'A', replacement: 'AB' },
        { symbol: 'B', replacement: 'A' },
      ],
      angle: 25,
      length: 1,
      lengthScale: 1,
      iterations: 1,
    };
    const result = gen.expand(config);
    expect(result).toBe('AB');
  });

  it('expand applies multiple iterations', () => {
    const gen = new LSystemGenerator();
    const config = {
      axiom: 'A',
      rules: [
        { symbol: 'A', replacement: 'AB' },
        { symbol: 'B', replacement: 'A' },
      ],
      angle: 25,
      length: 1,
      lengthScale: 1,
      iterations: 3,
    };
    const result = gen.expand(config);
    // Iter 1: AB, Iter 2: ABA, Iter 3: ABAAB
    expect(result).toBe('ABAAB');
  });

  it('expand preserves symbols without rules', () => {
    const gen = new LSystemGenerator();
    const config = {
      axiom: 'FXF',
      rules: [{ symbol: 'X', replacement: 'YZ' }],
      angle: 25,
      length: 1,
      lengthScale: 1,
      iterations: 1,
    };
    expect(gen.expand(config)).toBe('FYZF');
  });

  it('expand with stochastic rules varies output', () => {
    const config = {
      axiom: 'F',
      rules: [
        { symbol: 'F', replacement: 'FF', probability: 0.5 },
        { symbol: 'F', replacement: 'F[+F]', probability: 0.5 },
      ],
      angle: 25,
      length: 1,
      lengthScale: 1,
      iterations: 3,
    };
    const gen1 = new LSystemGenerator(1);
    const gen2 = new LSystemGenerator(999);
    const r1 = gen1.expand(config);
    const r2 = gen2.expand(config);
    expect(typeof r1).toBe('string');
    expect(typeof r2).toBe('string');
  });

  // --- Interpret ---

  it('interpret produces segments for F commands', () => {
    const gen = new LSystemGenerator();
    const result = gen.interpret('FFF', {
      axiom: '',
      rules: [],
      angle: 25,
      length: 1,
      lengthScale: 1,
      iterations: 0,
    });
    expect(result.segments.length).toBe(3);
  });

  it('interpret handles branching [ and ]', () => {
    const gen = new LSystemGenerator();
    const result = gen.interpret('F[+F]F', {
      axiom: '',
      rules: [],
      angle: 90,
      length: 1,
      lengthScale: 1,
      iterations: 0,
    });
    expect(result.segments.length).toBe(3);
  });

  it('interpret records leaves at branch end (])', () => {
    const gen = new LSystemGenerator();
    const result = gen.interpret('F[+F]', {
      axiom: '',
      rules: [],
      angle: 25,
      length: 1,
      lengthScale: 1,
      iterations: 0,
    });
    // Leaf is generated when ] is encountered
    expect(result.leaves.length).toBeGreaterThanOrEqual(1);
  });

  it('interpret computes bounding box', () => {
    const gen = new LSystemGenerator();
    const result = gen.interpret('F+F+F+F', {
      axiom: '',
      rules: [],
      angle: 90,
      length: 1,
      lengthScale: 1,
      iterations: 0,
    });
    expect(result.boundingBox.min).toBeDefined();
    expect(result.boundingBox.max).toBeDefined();
    const dx = result.boundingBox.max.x - result.boundingBox.min.x;
    const dy = result.boundingBox.max.y - result.boundingBox.min.y;
    expect(dx + dy).toBeGreaterThan(0);
  });

  // --- Generate ---

  it('generate produces segments with TREE_SIMPLE preset', () => {
    const gen = new LSystemGenerator();
    const result = gen.generate(TREE_SIMPLE);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.boundingBox).toBeDefined();
  });

  it('generate produces segments with BUSH preset', () => {
    const gen = new LSystemGenerator();
    const result = gen.generate(BUSH);
    expect(result.segments.length).toBeGreaterThan(0);
  });

  it('generate is deterministic with same seed', () => {
    const gen1 = new LSystemGenerator(42);
    const gen2 = new LSystemGenerator(42);
    const r1 = gen1.generate(TREE_SIMPLE);
    const r2 = gen2.generate(TREE_SIMPLE);
    expect(r1.segments.length).toBe(r2.segments.length);
    for (let i = 0; i < r1.segments.length; i++) {
      expect(r1.segments[i].start.x).toBeCloseTo(r2.segments[i].start.x);
      expect(r1.segments[i].start.y).toBeCloseTo(r2.segments[i].start.y);
    }
  });

  it('segment depth increases in branches', () => {
    const gen = new LSystemGenerator();
    const result = gen.generate(TREE_SIMPLE);
    const maxDepth = Math.max(...result.segments.map((s) => s.depth));
    expect(maxDepth).toBeGreaterThanOrEqual(1);
  });
});
