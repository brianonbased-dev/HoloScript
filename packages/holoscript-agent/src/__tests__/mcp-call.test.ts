import { describe, it, expect, vi } from 'vitest';
import { runTool, isProductiveMcpTool, isProductiveToolUse } from '../tools.js';
import type { ToolUseBlock } from '@holoscript/llm-provider';

function use(input: Record<string, unknown>): ToolUseBlock {
  return { type: 'tool_use', id: 'u1', name: 'mcp_call', input };
}

describe('isProductiveMcpTool', () => {
  it('true for artifact-producing/validating tools', () => {
    for (const t of ['compile_holoscript', 'compile_to_quest', 'validate_holoscript', 'generate_scene', 'solve_logic', 'create_world']) {
      expect(isProductiveMcpTool(t)).toBe(true);
    }
  });
  it('false for read-only query/get/list tools', () => {
    for (const t of ['holo_query_codebase', 'list_traits', 'get_examples', 'parse_hs', '']) {
      expect(isProductiveMcpTool(t)).toBe(false);
    }
  });
});

describe('isProductiveToolUse(mcp_call)', () => {
  it('is productive only when the invoked tool produces an artifact', () => {
    expect(isProductiveToolUse(use({ tool: 'compile_holoscript' }))).toBe(true);
    expect(isProductiveToolUse(use({ tool: 'holo_query_codebase' }))).toBe(false);
  });
});

describe('runTool — mcp_call', () => {
  it('routes to the injected invokeMcpTool callback and returns its text', async () => {
    const invokeMcpTool = vi.fn(async () => ({ ok: true, text: 'VALID: scene parsed OK' }));
    const res = await runTool(use({ tool: 'validate_holoscript', args: { code: '#version 6.0.0\nscene "S" {}' } }), { invokeMcpTool });
    expect(invokeMcpTool).toHaveBeenCalledWith('validate_holoscript', { code: '#version 6.0.0\nscene "S" {}' });
    expect(res.is_error).toBeUndefined();
    expect(res.content).toContain('VALID');
  });

  it('returns an error result when the MCP tool fails (ok:false)', async () => {
    const invokeMcpTool = vi.fn(async () => ({ ok: false, text: 'mcp_call compile_holoscript error: parse failed' }));
    const res = await runTool(use({ tool: 'compile_holoscript', args: {} }), { invokeMcpTool });
    expect(res.is_error).toBe(true);
    expect(res.content).toContain('parse failed');
  });

  it('errors clearly when no invoke callback is injected', async () => {
    const res = await runTool(use({ tool: 'validate_holoscript' }), {});
    expect(res.is_error).toBe(true);
    expect(String(res.content)).toContain('capability not available');
  });

  it('errors when tool name is missing', async () => {
    const invokeMcpTool = vi.fn(async () => ({ ok: true, text: '' }));
    const res = await runTool(use({ args: {} }), { invokeMcpTool });
    expect(res.is_error).toBe(true);
    expect(invokeMcpTool).not.toHaveBeenCalled();
  });
});
