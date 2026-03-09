import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SelfImprovementPipeline } from '../SelfImprovementPipeline';
import type { FailedGeneration } from '../SelfImprovementPipeline';

function makeFailure(overrides: Partial<FailedGeneration> = {}): FailedGeneration {
  return {
    id: 'fail-1',
    timestamp: Date.now(),
    prompt: 'Create a sphere',
    generatedCode: 'object "Ball" { geometry: "sper" }',
    errors: ['unknown geometry type: sper'],
    fileType: '.hsplus',
    category: 'validation-error',
    ...overrides,
  };
}

describe('SelfImprovementPipeline', () => {
  let pipeline: SelfImprovementPipeline;

  beforeEach(() => {
    pipeline = new SelfImprovementPipeline({ autoFlushInterval: 0, autoCorrect: true });
  });

  afterEach(() => {
    pipeline.dispose();
  });

  it('capture increments stats', () => {
    pipeline.capture(makeFailure());
    const stats = pipeline.getStats();
    expect(stats.totalCaptures).toBe(1);
    expect(stats.byCategory['validation-error']).toBe(1);
  });

  it('auto-corrects geometry typos', () => {
    const corrected = pipeline.attemptAutoCorrection(makeFailure());
    expect(corrected).toBeDefined();
    expect(corrected).toContain('sphere');
    expect(corrected).not.toContain('sper');
  });

  it('auto-corrects missing closing braces', () => {
    const corrected = pipeline.attemptAutoCorrection(
      makeFailure({
        generatedCode: 'object "Box" {',
        errors: ["expected '}'"],
      })
    );
    expect(corrected).toContain('}');
  });

  it('auto-corrects property name typos', () => {
    const corrected = pipeline.attemptAutoCorrection(
      makeFailure({
        generatedCode: 'rotate.y = 45',
        errors: ['unknown property'],
      })
    );
    expect(corrected).toContain('rotation.y');
  });

  it('generates training examples on capture with correction', () => {
    pipeline.capture(makeFailure());
    const examples = pipeline.getTrainingExamples();
    expect(examples.length).toBeGreaterThanOrEqual(2); // fix + prompt + explanation
    expect(examples[0].metadata.source).toBe('self-improvement');
  });

  it('toJSONL outputs valid JSONL', () => {
    pipeline.capture(makeFailure());
    const jsonl = pipeline.toJSONL();
    const lines = jsonl.split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('captureParseError convenience method', () => {
    pipeline.captureParseError('make box', 'object {', ['unexpected token']);
    expect(pipeline.getStats().totalCaptures).toBe(1);
    expect(pipeline.getStats().byCategory['parse-error']).toBe(1);
  });

  it('captureValidationError convenience method', () => {
    pipeline.captureValidationError('make circle', 'object "C" {}', ['invalid property name']);
    expect(pipeline.getStats().byCategory['validation-error']).toBe(1);
  });

  it('provideCorrection adds examples', () => {
    pipeline.capture(
      makeFailure({ id: 'f1', errors: ['runtime crash'], category: 'runtime-error' })
    );
    const before = pipeline.getTrainingExamples().length;
    pipeline.provideCorrection('f1', 'object "Ball" { geometry: "sphere" }');
    expect(pipeline.getTrainingExamples().length).toBeGreaterThan(before);
  });

  it('getPendingFailures excludes corrected', () => {
    pipeline.capture(makeFailure()); // auto-corrects
    pipeline.capture(
      makeFailure({ id: 'f2', errors: ['runtime crash'], category: 'runtime-error' })
    ); // no auto-correction
    const pending = pipeline.getPendingFailures();
    // The first was auto-corrected, second has no matching pattern → pending
    expect(pending.length).toBe(1);
  });

  it('clear resets everything', () => {
    pipeline.capture(makeFailure());
    pipeline.clear();
    expect(pipeline.getStats().totalCaptures).toBe(0);
    expect(pipeline.getTrainingExamples().length).toBe(0);
  });

  it('buffer flushes at maxBufferSize', () => {
    const smallPipeline = new SelfImprovementPipeline({
      autoFlushInterval: 0,
      maxBufferSize: 2,
      autoCorrect: true,
    });
    smallPipeline.capture(makeFailure({ id: 'a' }));
    smallPipeline.capture(makeFailure({ id: 'b' }));
    expect(smallPipeline.getStats().totalCaptures).toBe(2);
    smallPipeline.dispose();
  });
});
