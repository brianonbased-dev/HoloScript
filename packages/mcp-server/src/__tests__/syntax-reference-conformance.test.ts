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

type Verdict = {
  parser: 'holo' | 'pipeline' | 'hsplus';
  ok: boolean;
  errors: string[];
};

/** Leading `//` comment lines carry no grammar; the first real line picks the parser. */
function stripLeadingComments(code: string): string {
  return code.replace(/^(?:\s*\/\/[^\n]*(?:\n|$))+/, '').trimStart();
}

function messages(errors: ReadonlyArray<unknown> | undefined): string[] {
  return (errors || []).map((error) => {
    const message = (error as { message?: unknown } | null)?.message;
    return message ? String(message) : String(error);
  });
}

/**
 * Parse an example with the parser its own tool uses: compositions go to the
 * .holo parser, pipelines to parsePipeline (what parse_pipeline runs), and
 * everything else to the .hsplus parser. Pipelines were sent to the .hsplus
 * parser until the pipelines topic arrived in 721b4608da; that was never the
 * parser a pipeline is read with.
 */
function parseSyntaxExample(code: string): Verdict {
  const trimmed = stripLeadingComments(code);
  if (/^composition\s+"/.test(trimmed)) {
    const result = parseHolo(code);
    const errors = messages(result.errors);
    return { parser: 'holo', ok: result.success !== false && errors.length === 0, errors };
  }

  if (/^pipeline\s+"/.test(trimmed)) {
    const result = parsePipeline(code);
    const errors = messages(result.errors);
    return { parser: 'pipeline', ok: result.success === true && errors.length === 0, errors };
  }

  const result = new HoloScriptPlusParser().parse(code);
  const errors = messages(result.errors);
  return { parser: 'hsplus', ok: result.success === true && errors.length === 0, errors };
}

function describeFailure(topic: string, label: string, verdict: Verdict): string {
  return [
    `get_syntax_reference(${topic}) example "${label}" failed`,
    `parser=${verdict.parser}`,
    `errors=${verdict.errors.join('; ') || '(none)'}`,
  ].join(' | ');
}

/**
 * A counter-example ("What does NOT work") is the one example that must NOT
 * parse. It is still checked, both ways: the WRONG half has to fail (a "don't do
 * this" that parses teaches a superstition) and the RIGHT half, the part a reader
 * copies, has to parse like any other example.
 */
const COUNTER_EXAMPLE = /NOT work/i;
const RIGHT_MARKER = /\/\/ RIGHT[^\n]*\n/;

describe('get_syntax_reference grammar conformance', () => {
  it('returns only examples accepted by the production parser path', async () => {
    let checked = 0;
    let counterExamples = 0;
    for (const topic of Object.keys(SYNTAX_DOCS)) {
      const doc = (await handleTool('get_syntax_reference', { topic })) as SyntaxReference;
      expect(doc.topic).toBe(topic);
      expect(doc.examples.length).toBeGreaterThan(0);

      for (const example of doc.examples) {
        if (COUNTER_EXAMPLE.test(example.description)) {
          counterExamples++;
          const halves = example.code.split(RIGHT_MARKER);
          expect(halves, `${topic}: counter-example needs one "// RIGHT" half`).toHaveLength(2);
          const [wrong, right] = halves;
          const wrongVerdict = parseSyntaxExample(stripLeadingComments(wrong));
          if (wrongVerdict.ok) {
            throw new Error(
              `get_syntax_reference(${topic}) counter-example "${example.description}" parses, ` +
                `so it teaches nothing | parser=${wrongVerdict.parser}`
            );
          }
          const rightVerdict = parseSyntaxExample(stripLeadingComments(right));
          if (!rightVerdict.ok) {
            throw new Error(describeFailure(topic, `${example.description} (RIGHT)`, rightVerdict));
          }
          checked++;
          continue;
        }

        const verdict = parseSyntaxExample(example.code);
        if (!verdict.ok) {
          throw new Error(describeFailure(topic, example.description, verdict));
        }
        checked++;
      }
    }
    // Guard against a vacuous pass: every topic has examples, and the one known
    // counter-example (pipelines) is still recognised as one.
    expect(checked).toBeGreaterThanOrEqual(Object.keys(SYNTAX_DOCS).length);
    expect(counterExamples).toBeGreaterThanOrEqual(1);
  });
});
