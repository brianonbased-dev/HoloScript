import { describe, expect, it } from 'vitest';
import {
  FocusedDPOSplitter,
  checkHoloCorpusRowReallyValid,
  type ASTSegment,
} from './FocusedDPOSplitter';

type ParserLike = { parse(source: string): unknown };

const SOURCE = `composition "DPO_Validation" {
  object "Clean" {
    geometry: "sphere"
  }
}
`;

const COMPOSITION_ONLY_AST = {
  type: 'Composition',
  name: 'DPO_Validation',
  loc: { start: { line: 1, column: 0 }, end: { line: 5, column: 1 } },
  objects: [],
};

const FULL_AST = {
  type: 'Composition',
  name: 'DPO_Validation',
  loc: { start: { line: 1, column: 0 }, end: { line: 5, column: 1 } },
  objects: [
    {
      type: 'Object',
      name: 'Clean',
      loc: { start: { line: 2, column: 2 }, end: { line: 4, column: 3 } },
      properties: [],
      traits: [],
    },
  ],
};

const COMPOSITION_SEGMENT: ASTSegment = {
  kind: 'composition',
  name: 'DPO_Validation',
  source: SOURCE.trimEnd(),
  startLine: 1,
  endLine: 5,
  depth: 0,
};

function parserReturning(result: unknown): ParserLike {
  return {
    parse: () => result,
  };
}

function setParser(splitter: FocusedDPOSplitter, parser: ParserLike): void {
  (splitter as unknown as { parser: ParserLike }).parser = parser;
}

describe('FocusedDPOSplitter B3 corpus guard', () => {
  it('quarantines parser success:true rows that still carry errors', () => {
    const result = checkHoloCorpusRowReallyValid(
      SOURCE,
      parserReturning({
        success: true,
        ast: FULL_AST,
        errors: [{ message: 'success flag lied about this row' }],
        warnings: [],
      }) as any
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('parse-errors');
    expect(result.nodeCountFidelity).toBe(true);
  });

  it('quarantines rows whose AST drops source-level semantic nodes', () => {
    const result = checkHoloCorpusRowReallyValid(
      SOURCE,
      parserReturning({
        success: true,
        ast: COMPOSITION_ONLY_AST,
        errors: [],
        warnings: [],
      }) as any
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('node-count-loss');
    expect(result.nodeCountFidelity).toBe(false);
  });

  it('records newline verdict drift as a quarantine reason code', () => {
    const result = checkHoloCorpusRowReallyValid(SOURCE.trimEnd(), {
      parse: (source: string) =>
        source.endsWith('\n')
          ? { success: true, ast: FULL_AST, errors: [], warnings: [] }
          : {
              success: true,
              ast: FULL_AST,
              errors: [{ message: 'no-final-newline drift' }],
              warnings: [],
            },
    } as any);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['parse-errors', 'newline-verdict-drift'])
    );
  });

  it('excludes success:true plus errors rows before accepted DPO output', () => {
    const splitter = new FocusedDPOSplitter({
      validatePairs: true,
      minPairsPerSegment: 1,
      maxPairsPerSegment: 2,
      minQualityScore: 0.5,
    });
    setParser(
      splitter,
      parserReturning({
        success: true,
        ast: FULL_AST,
        errors: [{ message: 'poisoned corpus row' }],
        warnings: [],
      })
    );

    const result = splitter.process(SOURCE, 'poisoned.holo');

    expect(result.stats.totalPairs).toBeGreaterThan(0);
    expect(result.stats.validPairs).toBe(0);
    expect(result.stats.rejectedPairs).toBe(result.stats.totalPairs);
    expect(result.pairs).toHaveLength(0);
  });

  it('keeps AST node-loss rows quarantined with reason metadata', () => {
    const splitter = new FocusedDPOSplitter({
      validatePairs: true,
      minPairsPerSegment: 1,
      maxPairsPerSegment: 2,
      minQualityScore: 0.5,
    });
    setParser(
      splitter,
      parserReturning({
        success: true,
        ast: COMPOSITION_ONLY_AST,
        errors: [],
        warnings: [],
      })
    );

    const generated = splitter.generatePairsForSegment(COMPOSITION_SEGMENT, SOURCE, 'lossy.holo');
    const accepted = splitter.process(SOURCE, 'lossy.holo');

    expect(generated.length).toBeGreaterThan(0);
    for (const pair of generated) {
      expect(pair.metadata.chosenValid).toBe(false);
      expect(pair.metadata.chosenQuarantineReasons).toContain('node-count-loss');
      expect(pair.metadata.qualityScore).toBeLessThan(0.5);
    }
    expect(accepted.stats.validPairs).toBe(0);
    expect(accepted.pairs).toHaveLength(0);
  });
});
