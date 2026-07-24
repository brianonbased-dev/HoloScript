import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleTool } from '../handlers';
import { coreTools } from '../tools';

vi.mock('@holoscript/llm-provider', () => ({
  LOCAL_DEFAULT_MODEL: 'test-local-model',
  createProviderManager: vi.fn(() => ({
    getRegisteredProviders: () => ['mock'],
    getProvider: () => ({
      generateHoloScript: vi.fn(async () => ({
        code: 'composition "Test" { object "Cube" { geometry: "cube" } }',
        provider: 'mock',
        detectedTraits: [],
      })),
    }),
  })),
}));

vi.mock('../renderer', () => ({
  renderPreview: vi.fn(async ({ code }: { code?: string }) => {
    if (typeof code !== 'string') throw new Error('render_preview requires code');
    return {
      success: true,
      url: 'http://localhost:3000/api/scene/test/thumbnail',
      previewUrl: 'http://localhost:3000/scene/test',
    };
  }),
  createShareLink: vi.fn(
    async ({
      title = 'HoloScript Scene',
      description = 'Interactive 3D scene built with HoloScript',
    }: {
      title?: string;
      description?: string;
    }) => ({
      playgroundUrl: 'http://localhost:3000/scene/test',
      embedUrl: 'http://localhost:3000/embed/test',
      tweetText: `${title} ${description} http://localhost:3000/scene/test`,
    })
  ),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('MCP Tool Error Cases', () => {
  it('throws for unknown tool name', async () => {
    await expect(handleTool('no_such_tool_xyz', {})).rejects.toThrow(/Unknown tool/);
  });

  it('throws for empty tool name', async () => {
    await expect(handleTool('', {})).rejects.toThrow(/Unknown tool/);
  });

  it('validate_holoscript detects errors in malformed code', async () => {
    const result = (await handleTool('validate_holoscript', {
      code: 'composition "Broken" { object "x" {',
    })) as Record<string, unknown>;
    expect(result.valid).toBe(false);
    expect((result.errors as unknown[]).length).toBeGreaterThan(0);
  });

  it('validate_holoscript accepts content as a compatibility alias', async () => {
    const result = (await handleTool('validate_holoscript', {
      content: 'composition "Alias" { object "Cube" { geometry: "cube" } }',
      format: 'holo',
    })) as Record<string, unknown>;
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('validate_holoscript accepts the canonical native machine syntax', async () => {
    const result = (await handleTool('validate_holoscript', {
      code: `function main(): i32 {
        slot value: i32 = 2
        store(value, 5)
        return load(value)
      }`,
      format: 'hs',
    })) as Record<string, unknown>;

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.validator).toBe('rust-wasm');
  });

  it('validate_holoscript accepts the hs-machine-v7 fixed-array and slice contract', async () => {
    const result = (await handleTool('validate_holoscript', {
      code: `struct Delta { amount: i32 }

function main(): i32 {
  slot delta: Delta = Delta(2)
  slot values: [i32; 4] = [1, 2, 3, 4]
  let direct_index: i32 = 2
  let slice_index: i32 = 1

  store(
    values[1..4][slice_index],
    load(values[direct_index]) + load(delta.amount)
  )
  return load(values[direct_index])
}`,
      format: 'hs',
    })) as Record<string, unknown>;

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.validator).toBe('rust-wasm');
  });

  it('validate_holoscript auto-routes an explicit agent brain through the hsplus authority', async () => {
    const result = (await handleTool('validate_holoscript', {
      code: `
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
`,
    })) as Record<string, unknown>;

    expect(result.valid).toBe(true);
    expect(result.format).toBe('hsplus');
    expect(result.validator).toBe('typescript-hsplus');
    expect(result.errors).toEqual([]);
  });

  it('validate_holoscript keeps HS010 ahead of native machine parsing', async () => {
    const result = (await handleTool('validate_holoscript', {
      code: 'function main(): i32 { return process(5) }',
      format: 'hs',
      capabilityManifest: {
        protocol: 'holoscript.capability.v1',
        declaredCapabilities: ['holoscript:validate', 'filesystem:read:local-source'],
        attestation: {
          manifestHash: 'sha256:test',
          signer: 'codex-test',
          trustTier: 'verified',
          attestedAt: '2026-06-30T00:00:00.000Z',
        },
      },
    })) as Record<string, unknown>;

    expect(result.valid).toBe(false);
    expect(result.validator).toBe('rust-wasm');
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'HS010', message: expect.stringContaining('process') }),
    ]);
  });

  it('validate_holoscript reports a clear error when source is missing', async () => {
    const result = (await handleTool('validate_holoscript', {
      format: 'holo',
    })) as Record<string, unknown>;
    expect(result.valid).toBe(false);
    expect(result.error).toBeUndefined();
    expect((result.errors as Array<Record<string, unknown>>)[0].code).toBe('missing-code');
    expect((result.errors as Array<Record<string, unknown>>)[0].message).toContain(
      'requires a string `code` argument'
    );
  });

  it('validate_holoscript returns a local fallback receipt when sandbox gating denies source', async () => {
    const result = (await handleTool('validate_holoscript', {
      code: 'composition "Unsafe" { object "Runner" { note: "process" } }',
      format: 'holo',
      sourcePath: 'experiments/holoshell-human-os-frontier/unsafe.holo',
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toContain('ForkSandboxGate denied HoloScript payload');
    const receipt = result.validationUnavailableReceipt as Record<string, unknown>;
    expect(receipt.kind).toBe('ValidationUnavailableReceipt');
    expect(receipt.failedCheck).toBe('capability_manifest');
    expect(receipt.capabilityManifestTemplate).toMatchObject({
      protocol: 'holoscript.capability.v1',
      declaredCapabilities: ['holoscript:validate', 'filesystem:read:local-source'],
    });
    expect(receipt.localFallback).toMatchObject({
      exact: true,
      sourcePath: 'experiments/holoshell-human-os-frontier/unsafe.holo',
      command: [
        'pnpm',
        'exec',
        'holoscript',
        'validate',
        'experiments/holoshell-human-os-frontier/unsafe.holo',
      ],
    });
  });

  it('validate_holoscript accepts local source with a verified read-only validation manifest', async () => {
    const result = (await handleTool('validate_holoscript', {
      code: 'composition "ManifestedLocal" { object "Runner" { note: "process" } }',
      format: 'holo',
      sourcePath: 'compositions/codex-brain.hsplus',
      capabilityManifest: {
        protocol: 'holoscript.capability.v1',
        declaredCapabilities: ['holoscript:validate', 'filesystem:read:local-source'],
        attestation: {
          manifestHash: 'sha256:test',
          signer: 'codex-test',
          trustTier: 'verified',
          attestedAt: '2026-06-30T00:00:00.000Z',
        },
      },
    })) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('parse_hs handles invalid syntax with error array', async () => {
    const result = (await handleTool('parse_hs', {
      code: 'not valid holoscript {',
    })) as Record<string, unknown>;
    expect(typeof result).toBe('object');
    expect(Array.isArray(result.errors)).toBe(true);
    expect((result.errors as unknown[]).length).toBeGreaterThan(0);
    expect(result.success).toBe(false);
  });

  it('parse_hs fails loudly when a trait block swallows an object body', async () => {
    const result = (await handleTool('parse_hs', {
      code: 'orb Spirit @spatial_audio {\n  geometry: "sphere"\n}',
    })) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(JSON.stringify(result.errors)).toContain('looks like an object body');
  });

  it('parse_hs optionally returns bounded HoloMeaning for @unknown structs', async () => {
    const result = (await handleTool('parse_hs', {
      code: `struct AgentObservation {
  id: string
  @unknown confidence?: float = inferConfidence()
}`,
      format: 'hsplus',
      includeUnknownStructMeaning: true,
      sourceId: 'agent-observation.hsplus',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      hsplusUnknownStructMeaning: {
        schema: 'holoscript.hsplus-unknown-struct-meaning.v1',
        format: '.hsplus',
        parser: 'HoloScriptPlusParser',
        sourceId: 'agent-observation.hsplus',
        structs: [
          {
            name: 'AgentObservation',
            unknownFields: [
              {
                key: 'confidence',
                typeName: 'float',
                optional: true,
                declaredDefault: 'inferConfidence()',
              },
            ],
          },
        ],
      },
    });
    expect((result.hsplusUnknownStructMeaning as { sourceDigest: string }).sourceDigest).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
  });

  it('parse_hs advertises the opt-in projection without broadening its default contract', () => {
    const parseTool = coreTools.find((tool) => tool.name === 'parse_hs');

    expect(parseTool?.inputSchema).toMatchObject({
      properties: {
        includeUnknownStructMeaning: { type: 'boolean' },
        sourceId: { type: 'string' },
      },
      required: ['code'],
    });
  });

  it('parse_hs keeps HoloMeaning out of the default compatibility payload', async () => {
    const result = (await handleTool('parse_hs', {
      code: 'struct AgentObservation { @unknown confidence: float }',
      format: 'hsplus',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result).not.toHaveProperty('hsplusUnknownStructMeaning');
  });

  it('parse_hs defaults the opt-in meaning projection to the hsplus format', async () => {
    const result = (await handleTool('parse_hs', {
      code: 'struct AgentObservation { @unknown confidence: float }',
      includeUnknownStructMeaning: true,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: true,
      hsplusUnknownStructMeaning: {
        format: '.hsplus',
        structs: [{ name: 'AgentObservation' }],
      },
    });
  });

  it('parse_hs rejects an empty source identity for an opted-in meaning receipt', async () => {
    const result = (await handleTool('parse_hs', {
      code: 'struct AgentObservation { @unknown confidence: float }',
      includeUnknownStructMeaning: true,
      sourceId: '   ',
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      errorStage: 'hsplus-unknown-struct-meaning',
      errorCode: 'invalid-source-id',
    });
    expect(result).not.toHaveProperty('hsplusUnknownStructMeaning');
  });

  it('parse_hs reports the strict meaning stage when struct identity is ambiguous', async () => {
    const result = (await handleTool('parse_hs', {
      code: `struct Reading { @unknown value: i32 }
struct Reading { @unknown replacement: i64 }`,
      format: 'hsplus',
      includeUnknownStructMeaning: true,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      errorStage: 'hsplus-unknown-struct-meaning',
      errorCode: 'duplicate-struct',
    });
    expect(result.error).toContain('Duplicate HoloScript+ struct "Reading"');
    expect(result).not.toHaveProperty('hsplusUnknownStructMeaning');
  });

  it('parse_hs refuses to relabel native .hs meaning as the bounded .hsplus projection', async () => {
    const result = (await handleTool('parse_hs', {
      code: 'struct Reading { @unknown value: i32 }',
      format: 'hs',
      includeUnknownStructMeaning: true,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      errorStage: 'hsplus-unknown-struct-meaning',
      errorCode: 'unsupported-format',
    });
    expect(result.error).toContain('requires format "hsplus"');
  });

  it('generate_scene fails gracefully without description', async () => {
    const result = (await handleTool('generate_scene', {
      description: '',
    })) as Record<string, unknown>;
    // Should return a result, possibly empty or with fallback
    expect(typeof result).toBe('object');
  });

  it('list_traits returns error shape for unknown category', async () => {
    const result = (await handleTool('list_traits', {
      category: 'no-such-category-xyz',
    })) as Record<string, unknown>;
    // Unknown category returns error info with sample valid categories
    expect(typeof result.error).toBe('string');
    expect(Array.isArray(result.validCategoriesSample)).toBe(true);
  });

  it('explain_trait handles unknown trait gracefully', async () => {
    const result = (await handleTool('explain_trait', {
      trait: '@no_such_trait_12345',
    })) as Record<string, unknown>;
    expect(typeof result).toBe('object');
    expect(result.error).toContain('Unknown trait');
    expect(Array.isArray(result.allTraits)).toBe(true);
  });

  it('create_share_link generates fallback without code', async () => {
    const result = (await handleTool('create_share_link', {
      title: 'Missing Code',
    })) as Record<string, unknown>;
    // Creates a share link even without code (fallback behavior)
    expect(typeof result.playgroundUrl).toBe('string');
    expect(typeof result.tweetText).toBe('string');
  });

  it('create_share_link returns a playground URL for a sample artifact', async () => {
    const result = (await handleTool('create_share_link', {
      code: 'composition "SampleArtifact" { object "Cube" { geometry: "cube" color: "#ff0000" } }',
      title: 'Sample Artifact',
      description: 'A test artifact shared via room',
      platform: 'generic',
    })) as Record<string, unknown>;
    expect(typeof result.playgroundUrl).toBe('string');
    expect(result.playgroundUrl as string).toMatch(/^https?:\/\//);
  });

  it('render_preview fails without code', async () => {
    await expect(
      handleTool('render_preview', {
        format: 'html',
      })
    ).rejects.toThrow();
  });

  it('edit_holo returns error shape for unsupported operation', async () => {
    const result = (await handleTool('edit_holo', {
      code: 'composition "Test" {}',
      instruction: 'make it blue',
      operation: 'invalid-op-xyz',
    })) as Record<string, unknown>;
    // edit_holo returns { success: false, error } instead of throwing
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('browser_launch validates schema strictly', async () => {
    await expect(
      handleTool('browser_launch', {
        // missing required url
      })
    ).rejects.toThrow();
  });

  it('handles concurrent tool calls without cross-contamination', async () => {
    const calls = [
      handleTool('validate_holoscript', { code: 'composition "A" {}' }),
      handleTool('validate_holoscript', { code: 'composition "Broken" { object "x" {' }),
      handleTool('list_traits', {}),
    ];
    const [r1, r2, r3] = await Promise.all(calls);
    expect((r1 as Record<string, unknown>).valid).toBe(true);
    expect((r2 as Record<string, unknown>).valid).toBe(false);
    // list_traits with no args returns { total, categories, ... }
    expect(typeof (r3 as Record<string, unknown>).total).toBe('number');
    expect(Array.isArray((r3 as Record<string, unknown>).list)).toBe(true);
  });
});
