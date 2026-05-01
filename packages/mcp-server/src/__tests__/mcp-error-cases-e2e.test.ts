import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleTool } from '../handlers';

vi.mock('@holoscript/llm-provider', () => ({
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

  it('parse_hs handles invalid syntax with error array', async () => {
    const result = (await handleTool('parse_hs', {
      code: 'not valid holoscript {',
    })) as Record<string, unknown>;
    // Parser may return success=true with warnings/errors rather than throwing
    expect(typeof result).toBe('object');
    expect(Array.isArray(result.errors)).toBe(true);
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

  it('render_preview fails without code', async () => {
    await expect(handleTool('render_preview', {
      format: 'html',
    })).rejects.toThrow();
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
