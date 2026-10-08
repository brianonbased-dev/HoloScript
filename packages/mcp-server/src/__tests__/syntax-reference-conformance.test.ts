import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHolo } from '../../../core/src/parser/HoloCompositionParser';
import { HoloScriptPlusParser } from '../../../core/src/parser/HoloScriptPlusParser';
import { OUTCOME_KINDS_EXAMPLE, SYNTAX_DOCS } from '../documentation';
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

function parseSyntaxExample(code: string): {
  parser: 'holo' | 'hsplus';
  ok: boolean;
  errors: string[];
} {
  const trimmed = code.trimStart();
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

describe('outcome kinds syntax (accepted/refused on actions) is accepted by both production parsers', () => {
  it('the outcomes example parses through the .hsplus and .holo parsers with no outcome diagnostics', async () => {
    const doc = (await handleTool('get_syntax_reference', {
      topic: 'outcomes',
    })) as SyntaxReference;
    expect(doc.examples.map((e) => e.code)).toEqual([OUTCOME_KINDS_EXAMPLE]);

    const hsplus = new HoloScriptPlusParser().parse(OUTCOME_KINDS_EXAMPLE);
    expect(hsplus.errors).toEqual([]);
    expect(hsplus.warnings ?? []).toEqual([]);

    const holo = parseHolo(OUTCOME_KINDS_EXAMPLE);
    expect(holo.errors).toEqual([]);
    expect(holo.warnings).toEqual([]);
    const rent = holo.ast!.logic!.actions.find((a) => a.name === 'rent')!;
    expect(rent.outcomes!.map((o) => `${o.name}:${o.kind}`)).toEqual([
      'rented:accepted',
      'fine_unpaid:refused',
      'bad_count:refused',
      'over_limit:refused',
    ]);
  });

  it('the docs page shows exactly the example this test parses', () => {
    const page = readFileSync(
      path.resolve(__dirname, '../../../../docs/language/reference-hsplus-state.md'),
      'utf8'
    ).replace(/\r\n/g, '\n');
    expect(page).toContain(`\`\`\`hsplus\n${OUTCOME_KINDS_EXAMPLE}\n\`\`\``);
  });

  it('a planted kind mismatch in the same example is refused by both parsers', () => {
    const broken = OUTCOME_KINDS_EXAMPLE.replace(
      'return { allowed: false, outcome: "over_limit" }',
      'return { allowed: true, outcome: "over_limit" }'
    );
    expect(broken).not.toBe(OUTCOME_KINDS_EXAMPLE);
    const hsplus = new HoloScriptPlusParser().parse(broken);
    expect(hsplus.errors.map((e: any) => e.code)).toEqual(['HSP502']);
    const holo = parseHolo(broken);
    expect(holo.errors.map((e) => e.code)).toEqual(['HSP502']);
  });
});
