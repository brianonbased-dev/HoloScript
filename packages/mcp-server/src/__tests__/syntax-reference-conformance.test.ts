import { describe, expect, it } from 'vitest';
import { parsePipeline } from '@holoscript/core';
import { parseHolo } from '../../../core/src/parser/HoloCompositionParser';
import { HoloScriptPlusParser } from '../../../core/src/parser/HoloScriptPlusParser';
import { SYNTAX_DOCS } from '../documentation';
import { handleTool } from '../handlers';

type SyntaxExample = {
  description: string;
  code: string;
};

type SyntaxReference = {
  topic: string;
  description: string;
  syntax: string;
  examples: SyntaxExample[];
};

function parseSyntaxExample(fullCode: string): {
  parser: 'holo' | 'hsplus' | 'pipeline';
  ok: boolean;
  errors: string[];
} {
  // A "what does NOT work" example shows the mistake first and the fix after a
  // `// RIGHT` line. syntax-docs-parse.test.ts proves the mistake fails; here the part
  // a reader should copy has to parse.
  const rightMarker = /\/\/ RIGHT[^\n]*\n/;
  const code = rightMarker.test(fullCode) ? fullCode.split(rightMarker)[1] : fullCode;
  const trimmed = code.trimStart();
  // Pipelines (.hs) go through the pipeline parser, their production path.
  if (/^pipeline\s+"/.test(trimmed)) {
    const result = parsePipeline(code);
    const errors = (result.errors || []).map((error: any) =>
      error?.message ? String(error.message) : String(error)
    );
    return { parser: 'pipeline', ok: result.success === true && errors.length === 0, errors };
  }
  if (/^composition\s+"/.test(trimmed)) {
    const result = parseHolo(code);
    const errors = (result.errors || []).map((error: any) =>
      error?.message ? String(error.message) : String(error)
    );
    return {
      parser: 'holo',
      ok: result.success !== false && errors.length === 0,
      errors,
    };
  }

  const parser = new HoloScriptPlusParser();
  const result = parser.parse(code);
  const errors = (result.errors || []).map((error: any) =>
    error?.message ? String(error.message) : String(error)
  );
  return {
    parser: 'hsplus',
    ok: result.success === true && errors.length === 0,
    errors,
  };
}

describe('get_syntax_reference grammar conformance', () => {
  it('returns only examples accepted by the production parser path', async () => {
    for (const topic of Object.keys(SYNTAX_DOCS)) {
      const doc = (await handleTool('get_syntax_reference', { topic })) as SyntaxReference;
      expect(doc.topic).toBe(topic);
      expect(doc.examples.length).toBeGreaterThan(0);

      for (const example of doc.examples) {
        const verdict = parseSyntaxExample(example.code);
        if (!verdict.ok) {
          throw new Error(
            [
              `get_syntax_reference(${topic}) example "${example.description}" failed`,
              `parser=${verdict.parser}`,
              `errors=${verdict.errors.join('; ') || '(none)'}`,
            ].join(' | ')
          );
        }
      }
    }
  });
});
