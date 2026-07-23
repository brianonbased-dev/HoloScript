import { describe, expect, it, vi } from 'vitest';
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
