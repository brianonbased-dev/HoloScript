import { describe, expect, it } from 'vitest';
import { tools } from '../tools';
import { handleCriticTool } from '../critic-handler';

describe('holo_critic', () => {
  it('registers the tool definition in the public tool list', () => {
    const tool = tools.find((t) => t.name === 'holo_critic');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema?.properties?.target).toBeDefined();
    expect(tool?.inputSchema?.properties?.content).toBeDefined();
    expect(tool?.inputSchema?.properties?.mode).toBeDefined();
  });

  it('returns structured output for code mode (no-provider fallback)', async () => {
    const result = await handleCriticTool({
      target: 'tests',
      content: 'function add(a,b){return a+b}',
      mode: 'code',
    });

    expect(result).toBeDefined();
    expect(result.meta.target).toBe('tests');
    expect(result.meta.mode).toBe('code');
    expect(typeof result.verdict).toBe('string');
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('returns structured output for pitch mode (no-provider fallback)', async () => {
    const result = await handleCriticTool({
      target: 'pitch',
      content: 'We are 10x faster than the competition.',
      mode: 'pitch',
    });

    expect(result).toBeDefined();
    expect(result.meta.mode).toBe('pitch');
    expect(typeof result.verdict).toBe('string');
    expect(Array.isArray(result.findings)).toBe(true);
  });

  it('reads a file when target is a path and content is omitted', async () => {
    const result = await handleCriticTool({
      target: './vitest.config.ts',
      mode: 'code',
    });

    expect(result).toBeDefined();
    expect(result.meta.target).toMatch(/^file:/);
  });

  it('rejects when target is neither builtin nor an existing file and content is empty', async () => {
    await expect(
      handleCriticTool({
        target: '/nonexistent/path/to/file.xyz',
        mode: 'code',
      })
    ).rejects.toThrow('holo_critic:');
  });
});
