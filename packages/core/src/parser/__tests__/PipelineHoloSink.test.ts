/**
 * Tests for the `sink type: "holo"` primitive and the `params {}` block.
 *
 * These were added 2026-04-17 to support the drug-discovery flagship pipeline
 * (examples/pipelines/drug-discovery-flagship.hs). Both had TS interface slots
 * but no parser/compiler wiring until this change.
 *
 * If one of these tests fails, check:
 *   - PipelineParser.ts `paramsBlock` extraction (~line 525)
 *   - PipelineParser.ts sink `template` field extraction (~line 433)
 *   - PipelineCompiler.ts genSink() `if (sink.type === 'holo')` branch
 *   - PipelineCompiler.ts compilePipeline() params injection
 */
import { describe, it, expect } from 'vitest';
import { parsePipeline } from '../PipelineParser';
import { compilePipelineSourceToNode } from '../PipelineCompiler';

describe('Pipeline — params block', () => {
  const source = `
    pipeline "ParamTest" {
      params {
        default_target: "EGFR"
        max_hits: "5"
      }

      source Dummy {
        type: "list"
        items: [{ id: 1 }]
      }

      sink Out {
        type: "stdout"
      }
    }
  `;

  it('parses params block into Pipeline.params', () => {
    const result = parsePipeline(source);
    expect(result.success).toBe(true);
    expect(result.pipeline?.params).toEqual({
      default_target: 'EGFR',
      max_hits: '5',
    });
  });

  it('emits params initialization in compiled output', () => {
    const result = parsePipeline(source);
    expect(result.success).toBe(true);
    const compiled = compilePipelineSourceToNode(source);
    expect(compiled.success).toBe(true);
    expect(compiled.code).toContain('const params = {};');
    expect(compiled.code).toContain('params["default_target"]');
    expect(compiled.code).toContain('params["max_hits"]');
  });

  it('supports env-var fallback in params via interpolate helper', () => {
    const fallbackSrc = `
      pipeline "Fallback" {
        params {
          target: "\${env.TARGET_GENE:-EGFR}"
        }
        source Dummy { type: "list", items: [{}] }
        sink Out { type: "stdout" }
      }
    `;
    const compiled = compilePipelineSourceToNode(fallbackSrc);
    // Compiler escapes template interpolation as a runtime-resolved string
    expect(compiled.code).toMatch(/params\["target"\] = interpolate\(/);
    // interpolate() helper now supports env.VAR:-default
    expect(compiled.code).toContain('env\\.([A-Z_][A-Z0-9_]*)(?::-(.*))?');
  });
});

describe('Pipeline — sink type: "holo"', () => {
  // Template uses pipe-style heredoc to avoid nested-quote escaping fragility.
  // Pipeline grammar supports `template: |` per PipelineParser.ts ~line 488.
  const source = `
    pipeline "HoloEmit" {
      source Seed {
        type: "list"
        items: [{ target: "EGFR" }]
      }

      sink BindingScene {
        type: "holo"
        path: "out/\${target}.holo"
        template: "composition HoloEmit { @molecule }"
      }
    }
  `;

  it('parses holo sink with path + template fields', () => {
    const result = parsePipeline(source);
    // Print errors on failure so debugging is possible without re-running
    if (!result.success) console.error('parse errors:', result.errors);
    expect(result.success).toBe(true);
    const holoSink = result.pipeline?.sinks.find((s) => s.name === 'BindingScene');
    expect(holoSink).toBeDefined();
    expect(holoSink?.type).toBe('holo');
    expect(holoSink?.path).toBe('out/${target}.holo');
    expect(holoSink?.template).toContain('@molecule');
  });

  it('compiles holo sink to writeFile + SHA-256 hash', () => {
    const compiled = compilePipelineSourceToNode(source);
    expect(compiled.success).toBe(true);
    const code = compiled.code ?? '';
    // Essential primitives for a holo sink:
    expect(code).toContain(`import { writeFile } from 'node:fs/promises';`);
    expect(code).toContain(`import { createHash } from 'node:crypto';`);
    expect(code).toContain(`'sha256'`);
    // Interpolation targets: record fields, env.VAR, params.X
    expect(code).toContain(`expr.trim().split('.')`);
    expect(code).toMatch(/parts\[0\] === 'env'/);
    expect(code).toMatch(/parts\[0\] === 'params'/);
    // Output should be exposed for downstream sinks:
    expect(code).toContain('output.holo_path');
    expect(code).toContain('output.hash');
  });

  it('rejects unsafe template expressions (no arbitrary JS)', () => {
    // The holo-sink template interpolator must guard against injection via ${...}
    // Only dotted property access is allowed. Check that the safety regex is
    // emitted in the compiled code (as a string literal in the generated JS).
    const compiled = compilePipelineSourceToNode(source);
    const code = compiled.code ?? '';
    // The safety check — `expr.trim().split('.')` + regex allowlist — must exist
    expect(code).toContain(`expr.trim()`);
    expect(code).toContain(`[a-zA-Z_]`);
    // The generated code must refuse expressions that don't match (fall through to `return match`)
    expect(code).toContain(`return match;`);
  });
});

describe('Pipeline — params + holo sink integration', () => {
  it('drug-discovery-flagship-shape pipeline parses cleanly', () => {
    const result = parsePipeline(`
      pipeline "DrugDiscoveryFlagshipMini" {
        params {
          target_gene: "EGFR"
          drug_name: "osimertinib"
        }

        source TargetLookup {
          type: "mcp"
          server: "bio-research"
          tool: "chembl__target_search"
          args: { gene_symbol: "\${params.target_gene}" }
        }

        source StructureFetch {
          type: "mcp"
          server: "holoscript-mcp"
          tool: "alphafold_fetch_structure"
          args: { uniprot: "P00533" }
        }

        sink Composition {
          type: "holo"
          path: "out/\${params.target_gene}.holo"
          template: "composition Test { @protein_structure }"
        }

        sink Audit {
          type: "filesystem"
          path: "out/audit.jsonl"
          format: "jsonl"
          append: true
        }
      }
    `);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.pipeline?.name).toBe('DrugDiscoveryFlagshipMini');
    expect(result.pipeline?.params?.target_gene).toBe('EGFR');
    expect(result.pipeline?.sources.map((s) => s.type)).toEqual(['mcp', 'mcp']);
    expect(result.pipeline?.sinks.map((s) => s.type)).toEqual(['holo', 'filesystem']);
  });
});
