import { describe, expect, it } from 'vitest';
import {
  generateHoloScriptGbnf,
  isHoloScriptGrammarPreset,
  DEFAULT_PRIMITIVE_SHAPES,
  DEFAULT_OBJECT_KEYWORDS,
} from '../holoscript-gbnf';

describe('generateHoloScriptGbnf', () => {
  it('emits a well-formed GBNF with a root rule and the core productions', () => {
    const gbnf = generateHoloScriptGbnf();

    expect(gbnf).toContain('root ::=');
    expect(gbnf).toContain('object ::= object-kw sp string ws traits block');
    expect(gbnf).toContain('material ::= material-kw sp string ws traits block');
    expect(gbnf).toContain('primitive ::= prim-shape (sp obj-id)? ws block');
    expect(gbnf).toContain('trait ::= "@" ident trait-args?');
    expect(gbnf).toContain('property ::= ident ws ":" ws value (ws ",")?');
    expect(gbnf).toContain('value ::= number | string | boolean | null | array');
  });

  it('constrains terminals to the PRODUCTION lexer (no exponent, no tree-sitter extras)', () => {
    const gbnf = generateHoloScriptGbnf();

    // number = -?[0-9]+(\.[0-9]+)? — the production lexer allows no exponent form.
    expect(gbnf).toContain('number ::= "-"? [0-9]+ ("." [0-9]+)?');
    expect(gbnf).not.toContain('[eE]');
    // identifiers cannot start with a digit.
    expect(gbnf).toContain('ident ::= [a-zA-Z_] [a-zA-Z0-9_]*');
  });

  it('includes every default primitive shape and object keyword as a literal', () => {
    const gbnf = generateHoloScriptGbnf();
    for (const shape of DEFAULT_PRIMITIVE_SHAPES) expect(gbnf).toContain(`"${shape}"`);
    for (const kw of DEFAULT_OBJECT_KEYWORDS) expect(gbnf).toContain(`"${kw}"`);
  });

  it('is deterministic (stable output for stable input, so it hashes cleanly)', () => {
    expect(generateHoloScriptGbnf()).toBe(generateHoloScriptGbnf());
  });

  it('widens with caller-supplied keyword / shape sets', () => {
    const gbnf = generateHoloScriptGbnf({
      primitiveShapes: ['widget'],
      objectKeywords: ['gadget'],
      materialKeywords: ['substance'],
    });
    expect(gbnf).toContain('"widget"');
    expect(gbnf).toContain('"gadget"');
    expect(gbnf).toContain('"substance"');
  });

  it('can drop the require-a-definition constraint', () => {
    expect(generateHoloScriptGbnf({ requireDefinition: true })).toContain('root ::= ws (def ws)+');
    expect(generateHoloScriptGbnf({ requireDefinition: false })).toContain('root ::= ws (def ws)*');
  });

  it('recognizes the built-in grammar presets and rejects others', () => {
    expect(isHoloScriptGrammarPreset('holoscript')).toBe(true);
    expect(isHoloScriptGrammarPreset('holoscript-subset')).toBe(true);
    expect(isHoloScriptGrammarPreset('json')).toBe(false);
    expect(isHoloScriptGrammarPreset('')).toBe(false);
  });
});
