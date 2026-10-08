import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import {
  resolveCanonicalSourceSurface,
  validateCanonicalSource,
} from '../CanonicalSourceValidator';

const validHolo = `
composition "DiagnosticRoute" {
  object "Beacon" {
    geometry: "sphere"
  }
}
`;

const validAgentBrain = `
#brain DiagnosticAgent
#version 1.0.0
#target edge

identity {
  domain: "diagnostic-routing"
  capability_tags: ["validation"]
}

behavior on_task {
  recall { query: "canonical diagnostics" }
}
`;

describe('canonical source diagnostic routing', () => {
  it('resolves paths and URIs without confusing .hsplus with .hs', () => {
    expect(resolveCanonicalSourceSurface({ fileName: 'world.holo' })).toBe('holo');
    expect(resolveCanonicalSourceSurface({ fileName: 'file:///agent.hsplus?version=2' })).toBe(
      'hsplus'
    );
    expect(resolveCanonicalSourceSurface({ fileName: 'logic.hs#L3' })).toBe('hs');
  });

  it('routes .holo through HoloCompositionParser without invoking Rust/WASM', () => {
    const validateHsDetailed = vi.fn();
    const result = validateCanonicalSource(
      { fileName: 'world.holo', source: validHolo },
      { validateHsDetailed }
    );

    expect(result).toMatchObject({
      valid: true,
      surface: 'holo',
      validator: 'holo-parser',
      errors: [],
    });
    expect(result.ast).toBeDefined();
    expect(validateHsDetailed).not.toHaveBeenCalled();
  });

  // The .holo parser parses all of these "successfully" into an empty composition.
  // Until 2026-10-08 this validator passed that verdict on, so validate_holoscript,
  // `holoscript validate`, the LSP and the framework generator all called them valid.
  it.each([
    ['empty source', '', 'HS1001'],
    ['symbol noise', '{{{@@@', 'HS1005'],
    ['an SQL statement', 'SELECT * FROM users;', 'HS1003'],
    ['JSON', '{"scene": {"objects": []}}', 'HS1004'],
    ['prose', 'this is not holo at all', 'HS1004'],
  ])('refuses %s, which the parser alone accepts', (_label, source, code) => {
    const result = validateCanonicalSource({ surface: 'holo', source });

    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain(code);
    for (const e of result.errors) {
      expect(e.line).toBeGreaterThanOrEqual(1);
      expect(e.column).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps an explicitly declared empty composition valid, as it always was', () => {
    // The strict layer alone refuses this with HS1004; whether an empty program is
    // valid is an open grammar decision (strict/ERROR_CONTRACT.md), not this one's.
    for (const source of ['composition "A" {}', '// draft\ncomposition "A" {\n}\n']) {
      expect(validateCanonicalSource({ surface: 'holo', source })).toMatchObject({
        valid: true,
        errors: [],
      });
    }
    // The word alone is not a root: prose that mentions it is still refused.
    const prose = validateCanonicalSource({ surface: 'holo', source: 'A composition of things' });
    expect(prose.valid).toBe(false);
  });

  it.each([
    'composition "A" { , }',
    'composition "A" { foo bar baz }',
    'composition "A" {} DROP TABLE users',
    'composition "A" {} hello world',
  ])('does not waive "nothing parsed" for junk inside or after an empty root: %s', (source) => {
    const result = validateCanonicalSource({ surface: 'holo', source });
    expect(result.valid).toBe(false);
  });

  it('leaves a source the parser already rejects with only the parser errors', () => {
    const unbalanced = 'composition "Open" {\n  object "A" { geometry: "cube" }\n';
    const parserOnly = new HoloCompositionParser().parse(unbalanced);
    expect(parserOnly.errors.length).toBeGreaterThan(0);

    const result = validateCanonicalSource({ surface: 'holo', source: unbalanced });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(parserOnly.errors.length);
    expect(result.errors.every((e) => !String(e.code ?? '').startsWith('HS10'))).toBe(true);
  });

  it('still accepts real programs: every file in the strict layer must-accept corpus', () => {
    const corpus = path.resolve(__dirname, '../../../strict/corpus/real');
    const files = readdirSync(corpus).filter((f) => f.endsWith('.holo'));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const result = validateCanonicalSource({
        surface: 'holo',
        source: readFileSync(path.join(corpus, file), 'utf8'),
      });
      expect({ file, errors: result.errors }).toEqual({ file, errors: [] });
      expect(result.valid).toBe(true);
    }
  });

  it('preprocesses an explicit #brain and routes it through HoloScriptPlusParser', () => {
    const result = validateCanonicalSource({
      fileName: 'agent.hsplus',
      source: validAgentBrain,
    });

    expect(result).toMatchObject({
      valid: true,
      surface: 'hsplus',
      validator: 'typescript-hsplus',
      errors: [],
      preprocessedAgentBrain: true,
      agentBrainHeader: {
        brainName: 'DiagnosticAgent',
        version: '1.0.0',
        targets: ['edge'],
      },
    });
    expect(result.ast).toBeDefined();
  });

  it('rejects unsupported explicit-brain syntax at the authored source location', () => {
    const source = ['#brain MappedAgent', '', 'behavior on_task {', '  ???', '}'].join('\n');
    const result = validateCanonicalSource({ fileName: 'mapped.hsplus', source });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HSP109',
          line: 4,
          column: 3,
        }),
      ])
    );
  });

  it('uses only the injected Rust/WASM authority for .hs diagnostics', () => {
    const validateHsDetailed = vi.fn(() =>
      JSON.stringify({
        valid: false,
        errors: [{ message: 'expected expression', line: 2, column: 7 }],
      })
    );
    const source = 'function main(): i32 { return }';
    const result = validateCanonicalSource(
      { fileName: 'logic.hs', source },
      { validateHsDetailed }
    );

    expect(validateHsDetailed).toHaveBeenCalledOnce();
    expect(validateHsDetailed).toHaveBeenCalledWith(source);
    expect(result).toMatchObject({
      valid: false,
      surface: 'hs',
      validator: 'rust-wasm',
      errors: [
        {
          severity: 'error',
          message: 'expected expression',
          line: 2,
          column: 7,
        },
      ],
    });
  });

  it('fails closed when the .hs authority is missing or violates its contract', () => {
    const unavailable = validateCanonicalSource({
      fileName: 'logic.hs',
      source: 'function main(): i32 { return 1 }',
    });
    expect(unavailable.valid).toBe(false);
    expect(unavailable.errors[0].code).toBe('HS-VALIDATOR-UNAVAILABLE');

    const malformed = validateCanonicalSource(
      {
        surface: 'hs',
        source: 'function main(): i32 { return 1 }',
      },
      { validateHsDetailed: () => 'not-json' }
    );
    expect(malformed.valid).toBe(false);
    expect(malformed.errors[0].code).toBe('HS-VALIDATOR-CONTRACT');
  });
});
