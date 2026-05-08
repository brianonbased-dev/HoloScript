import { describe, expect, it } from 'vitest';
import { tools } from '../tools';
import { handlePremortemTool } from '../premortem-handler';

describe('holo_premortem', () => {
  it('registers the tool definition in the public tool list', () => {
    const tool = tools.find((t) => t.name === 'holo_premortem');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema?.properties?.target).toBeDefined();
    expect(tool?.inputSchema?.properties?.content).toBeDefined();
    expect(tool?.inputSchema?.properties?.context).toBeDefined();
  });

  it('returns structured output for a simple plan (no-provider fallback)', async () => {
    const result = await handlePremortemTool({
      target: 'Launch a new REST API with JWT auth and Redis caching',
      context: 'Ship deadline is Friday. Target audience is early adopters.',
    });

    expect(result).toBeDefined();
    expect(result.meta.target).toBe('Launch a new REST API with JWT auth and Redis caching');
    expect(typeof result.verdict).toBe('string');
    expect(typeof result.summary).toBe('string');
    expect(result.failureStories).toBeDefined();
    expect(typeof result.failureStories.mostLikely).toBe('object');
    expect(typeof result.failureStories.mostDangerous).toBe('object');
    expect(Array.isArray(result.earlyWarningSigns)).toBe(true);
    expect(typeof result.hiddenAssumption).toBe('object');
    expect(typeof result.revisedPlan).toBe('string');
    expect(Array.isArray(result.irreducibleRisks)).toBe(true);
  });

  it('reads a file when target is a path and content is omitted', async () => {
    const result = await handlePremortemTool({
      target: './vitest.config.ts',
    });

    expect(result).toBeDefined();
    expect(result.meta.target).toMatch(/^file:/);
  });

  it('resolves "this" to a mode directive or falls back gracefully', async () => {
    const result = await handlePremortemTool({
      target: 'this',
    });

    expect(result).toBeDefined();
    expect(result.meta.target).toMatch(/^this:/);
  });

  it('rejects when target is neither builtin nor an existing file and content is empty', async () => {
    await expect(
      handlePremortemTool({
        target: '/nonexistent/path/to/file.xyz',
      })
    ).rejects.toThrow('holo_premortem:');
  });
});
