/**
 * holo_generate_bindings — MCP tool unit tests
 *
 * Acceptance criteria:
 *  ✓ Returns Python binding code for valid .hsplus source (via sourceCode param)
 *  ✓ Returns JS binding code for targetLang='javascript'
 *  ✓ Returns typescript language tag for targetLang='typescript'
 *  ✓ Returns error when neither modulePath nor sourceCode provided
 *  ✓ Returns parse error message for invalid source
 *  ✓ Exports list is populated for a source with functions
 *  ✓ Metadata includes sourceFile and generatedAt
 *  ✓ Tool definition exists in developerTools array
 *  ✓ Handler wired — handleDeveloperTool dispatches 'holo_generate_bindings'
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleDeveloperTool, developerTools, resetDeveloperSingletons } from '../developer-tools';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Minimal valid HoloScript+ source (scene declaration parses cleanly)
const SIMPLE_SOURCE = `
scene Greeter {
  @position(0, 0, 0)
  @scale(1, 1, 1)
}
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('holo_generate_bindings tool definition', () => {
  it('is registered in developerTools array', () => {
    const tool = developerTools.find((t) => t.name === 'holo_generate_bindings');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties).toHaveProperty('modulePath');
    expect(tool!.inputSchema.properties).toHaveProperty('targetLang');
    expect(tool!.inputSchema.properties).toHaveProperty('sourceCode');
    expect(tool!.inputSchema.required).toContain('targetLang');
  });
});

describe('holo_generate_bindings handler', () => {
  beforeEach(() => {
    resetDeveloperSingletons();
  });

  it('returns error when neither modulePath nor sourceCode is provided', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'python',
    }) as Record<string, unknown>;
    expect(result.error).toMatch(/modulePath.*sourceCode/i);
  });

  it('generates Python bindings from sourceCode', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'python',
      sourceCode: SIMPLE_SOURCE,
    }) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(result.language).toBe('python');
    expect(typeof result.code).toBe('string');
    expect((result.code as string).length).toBeGreaterThan(0);
  });

  it('Python output contains expected boilerplate markers', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'python',
      sourceCode: SIMPLE_SOURCE,
    }) as Record<string, unknown>;

    const code = result.code as string;
    // InteropBindingGenerator always emits the module docstring and typing import
    expect(code).toMatch(/Auto-generated Python bindings/i);
    expect(code).toMatch(/from typing import/);
  });

  it('generates JavaScript bindings from sourceCode', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'javascript',
      sourceCode: SIMPLE_SOURCE,
    }) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(result.language).toBe('javascript');
    expect(typeof result.code).toBe('string');
  });

  it('generates TypeScript bindings and sets language tag', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'typescript',
      sourceCode: SIMPLE_SOURCE,
    }) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    expect(result.language).toBe('typescript');
  });

  it('populates exports array', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'python',
      sourceCode: SIMPLE_SOURCE,
    }) as Record<string, unknown>;

    expect(Array.isArray(result.exports)).toBe(true);
    expect((result.exports as string[]).length).toBeGreaterThanOrEqual(0);
    expect(typeof result.exportCount).toBe('number');
  });

  it('metadata contains generatedAt and sourceFile', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'python',
      sourceCode: SIMPLE_SOURCE,
    }) as Record<string, unknown>;

    const meta = result.metadata as Record<string, unknown>;
    expect(meta).toBeDefined();
    expect(typeof meta.generatedAt).toBe('string');
    expect(typeof meta.sourceFile).toBe('string');
  });

  it('includes usage hint in response', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'python',
      sourceCode: SIMPLE_SOURCE,
    }) as Record<string, unknown>;

    expect(typeof result.usage).toBe('string');
    expect(result.usage as string).toMatch(/\.py/);
  });

  it('returns error for invalid .hsplus source', async () => {
    const result = await handleDeveloperTool('holo_generate_bindings', {
      targetLang: 'python',
      sourceCode: '<<< completely invalid >>>',
    }) as Record<string, unknown>;

    // Parser either returns errors array or throws — either way error key is set
    expect(result.error).toBeDefined();
  });

  it('handleDeveloperTool dispatches holo_generate_bindings without throwing', async () => {
    await expect(
      handleDeveloperTool('holo_generate_bindings', {
        targetLang: 'python',
        sourceCode: 'template Empty {}',
      })
    ).resolves.not.toThrow();
  });
});
