import { describe, expect, it } from 'vitest';
import {
  generateHoloScriptGbnf,
  isHoloScriptGrammarPreset,
  DEFAULT_PRIMITIVE_SHAPES,
  DEFAULT_OBJECT_KEYWORDS,
} from '../holoscript-gbnf';

// The root-less first subset (the `holoscript-subset` preset). The default, whole-program
// grammar is checked against the language in holoscript-gbnf.acceptance.test.ts.
const SUBSET = { root: 'definitions' } as const;

describe('generateHoloScriptGbnf', () => {
  it('defaults to one whole composition program', () => {
    const gbnf = generateHoloScriptGbnf();
    expect(gbnf).toContain('root ::= ws composition ws');
    expect(gbnf).toContain(
      'composition ::= "composition" sp string hs "{" ws member (wsp member)* ws "}"'
    );
    expect(gbnf).not.toContain('def ::=');
  });

  it('emits a well-formed subset GBNF with a root rule and the core productions', () => {
    const gbnf = generateHoloScriptGbnf(SUBSET);

    expect(gbnf).toContain('root ::=');
    expect(gbnf).toContain('object ::= object-kw sp string ws traits block');
    expect(gbnf).toContain('material ::= material-kw sp string ws traits block');
    expect(gbnf).toContain('primitive ::= prim-shape (sp obj-id)? ws block');
    expect(gbnf).toContain('trait ::= "@" ident trait-args?');
    expect(gbnf).toContain('property ::= ident ws ":" ws value (ws ",")?');
    expect(gbnf).toContain('value ::= number | string | boolean | null | array');
  });

  it.each([
    ['composition', {}],
    ['definitions', SUBSET],
  ] as const)(
    'constrains terminals to the PRODUCTION lexer (%s root: no exponent, no tree-sitter extras)',
    (_root, options) => {
      const gbnf = generateHoloScriptGbnf(options);

      // number = -?[0-9]+(\.[0-9]+)? — the production lexer allows no exponent form.
      expect(gbnf).toContain('number ::= "-"? [0-9]+ ("." [0-9]+)?');
      expect(gbnf).not.toContain('[eE]');
      // identifiers cannot start with a digit.
      expect(gbnf).toMatch(/ident ::= \[a-zA-Z_\] (\[a-zA-Z0-9_\]\*|ident-tail)/);
    }
  );

  it.each([
    ['composition', {}],
    ['definitions', SUBSET],
  ] as const)(
    'includes every default primitive shape and object keyword as a literal (%s root)',
    (_root, options) => {
      const gbnf = generateHoloScriptGbnf(options);
      for (const shape of DEFAULT_PRIMITIVE_SHAPES) expect(gbnf).toContain(`"${shape}"`);
      for (const kw of DEFAULT_OBJECT_KEYWORDS) expect(gbnf).toContain(`"${kw}"`);
    }
  );

  it('is deterministic (stable output for stable input, so it hashes cleanly)', () => {
    expect(generateHoloScriptGbnf()).toBe(generateHoloScriptGbnf());
    expect(generateHoloScriptGbnf(SUBSET)).toBe(generateHoloScriptGbnf(SUBSET));
  });

  it('widens with caller-supplied keyword / shape sets', () => {
    const gbnf = generateHoloScriptGbnf({
      ...SUBSET,
      primitiveShapes: ['widget'],
      objectKeywords: ['gadget'],
      materialKeywords: ['substance'],
    });
    expect(gbnf).toContain('"widget"');
    expect(gbnf).toContain('"gadget"');
    expect(gbnf).toContain('"substance"');
  });

  it('can drop the require-a-definition constraint', () => {
    expect(generateHoloScriptGbnf({ ...SUBSET, requireDefinition: true })).toContain(
      'root ::= ws (def ws)+'
    );
    expect(generateHoloScriptGbnf({ ...SUBSET, requireDefinition: false })).toContain(
      'root ::= ws (def ws)*'
    );
    expect(generateHoloScriptGbnf({ requireDefinition: false })).toContain(
      'composition ::= "composition" sp string hs "{" ws (member (wsp member)*)? ws "}"'
    );
  });

  it('recognizes the built-in grammar presets and rejects others', () => {
    expect(isHoloScriptGrammarPreset('holoscript')).toBe(true);
    expect(isHoloScriptGrammarPreset('holoscript-subset')).toBe(true);
    expect(isHoloScriptGrammarPreset('json')).toBe(false);
    expect(isHoloScriptGrammarPreset('')).toBe(false);
  });
});
