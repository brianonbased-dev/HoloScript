/**
 * SelfImprovementPipeline B3 tests — prove the parseHolo validation
 * gate blocks training-data poisoning.
 *
 * See NORTH_STAR DT-14 / meeting-absorb-ast-migration / Gemini A1 map
 * (SelfImprovementPipeline marked "Orchestrates the AI generating
 * .holo/.hsplus files. Passes raw source strings around."). B3 closes
 * that gap by routing every auto-corrected candidate and every
 * agent-provided correctedCode through `parseHolo()` before the
 * training example is emitted.
 */

import { describe, it, expect } from 'vitest';
import { SelfImprovementPipeline, type FailedGeneration } from './SelfImprovementPipeline';

/**
 * A syntactically valid `.hsplus` fragment that parseHolo accepts cleanly.
 */
const VALID_HSPLUS = `composition "Valid" {
  object "Alpha" {
    position: [0, 0, 0]
    @grabbable
  }
}
`;

/**
 * A malformed fragment that parses with errors — used to assert that
 * agent-provided "fixes" that still don't parse get rejected.
 */
const STILL_BROKEN_HSPLUS = `composition "Broken" {
  object "Alpha" {
    position: [0, 0, 0]
    @grabbable
`; // missing two closing braces

function makeFailure(
  overrides: Partial<FailedGeneration> = {}
): FailedGeneration {
  return {
    id: 'test-fail-1',
    timestamp: Date.now(),
    prompt: 'Create a scene with a grabbable sphere',
    generatedCode: 'composition "Broken" { object "Alpha" { @grabbable',
    errors: ["expected '}'"],
    fileType: '.hsplus',
    category: 'parse-error',
    ...overrides,
  };
}

describe('SelfImprovementPipeline B3 — parseHolo validation gate', () => {
  it('accepts an agent-provided correctedCode that parses cleanly', () => {
    const pipeline = new SelfImprovementPipeline({
      autoCorrect: false, // we provide correctedCode directly
      autoFlushInterval: 0,
    });

    pipeline.capture(
      makeFailure({
        correctedCode: VALID_HSPLUS,
      })
    );

    const stats = pipeline.getStats();
    expect(stats.totalCaptures).toBe(1);
    expect(stats.totalExamples).toBeGreaterThan(0);
    expect(stats.autoCorrectionsRejected).toBe(0);

    pipeline.dispose();
  });

  it('rejects an agent-provided correctedCode that still fails to parse', () => {
    const pipeline = new SelfImprovementPipeline({
      autoCorrect: false,
      autoFlushInterval: 0,
    });

    pipeline.capture(
      makeFailure({
        // "fix" different from generatedCode, but still malformed
        correctedCode: STILL_BROKEN_HSPLUS,
      })
    );

    const stats = pipeline.getStats();
    expect(stats.totalCaptures).toBe(1);
    expect(stats.totalExamples).toBe(0); // poisoning blocked
    expect(stats.autoCorrectionsRejected).toBe(1);

    pipeline.dispose();
  });

  it('rejects an auto-correction that produced new text but still does not parse', () => {
    const pipeline = new SelfImprovementPipeline({
      autoCorrect: true,
      autoFlushInterval: 0,
    });

    // The default "missing closing brace" CORRECTION_PATTERN appends `}`
    // characters. Stray invalid syntax (bracket where brace expected)
    // is NOT fixable by brace-balancing — the regex fix produces
    // new text that the parser still rejects. The B3 gate must
    // reject this candidate before a poisoned example enters the
    // training set.
    //
    // Using mismatched bracket types: `[` instead of `{` as the
    // composition opening delimiter. Even after the fix pattern
    // appends `}` to balance counts, the parser rejects the
    // composition's `[`.
    pipeline.capture(
      makeFailure({
        generatedCode: 'composition "Broken" [ object "Alpha" { @grabbable',
        errors: ["expected '}'"],
      })
    );

    const stats = pipeline.getStats();
    expect(stats.totalCaptures).toBe(1);
    // Either the auto-correction was rejected (gate fired) or no
    // correction was produced at all. Both outcomes are acceptable;
    // what is NOT acceptable is a broken correction reaching the
    // training set.
    expect(stats.totalExamples).toBe(0);

    pipeline.dispose();
  });

  it('validatesAsHoloSource returns false on empty / whitespace-only input', () => {
    const pipeline = new SelfImprovementPipeline({
      autoFlushInterval: 0,
    });

    expect(pipeline.validatesAsHoloSource('')).toBe(false);
    expect(pipeline.validatesAsHoloSource('   \n\t  ')).toBe(false);

    pipeline.dispose();
  });

  it('validatesAsHoloSource returns true on clean .hsplus source', () => {
    const pipeline = new SelfImprovementPipeline({
      autoFlushInterval: 0,
    });

    expect(pipeline.validatesAsHoloSource(VALID_HSPLUS)).toBe(true);

    pipeline.dispose();
  });

  it('validatesAsHoloSource returns false on malformed source', () => {
    const pipeline = new SelfImprovementPipeline({
      autoFlushInterval: 0,
    });

    expect(pipeline.validatesAsHoloSource(STILL_BROKEN_HSPLUS)).toBe(false);

    pipeline.dispose();
  });

  it('clear() resets autoCorrectionsRejected counter', () => {
    const pipeline = new SelfImprovementPipeline({
      autoCorrect: false,
      autoFlushInterval: 0,
    });

    pipeline.capture(
      makeFailure({ correctedCode: STILL_BROKEN_HSPLUS })
    );
    expect(pipeline.getStats().autoCorrectionsRejected).toBe(1);

    pipeline.clear();
    expect(pipeline.getStats().autoCorrectionsRejected).toBe(0);

    pipeline.dispose();
  });
});
