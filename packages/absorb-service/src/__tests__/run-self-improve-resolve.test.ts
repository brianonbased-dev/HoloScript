import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLLMComplete } from '../self-improvement/run-self-improve';
import { MISSING_MCP_API_KEY_ERROR } from '../mcp-api-key';

const cold = () => new Response(JSON.stringify({ status: 'cold' }), { status: 200 });

describe('run-self-improve /serve/resolve key order', () => {
  beforeEach(() => {
    for (const k of [
      'HOLO_SELF_IMPROVE_LLM_URL',
      'ANTHROPIC_API_KEY',
      'BRITTNEY_FLEET_RESOLVE_KEY',
      'HOLOSCRIPT_MCP_API_KEY',
    ]) {
      vi.stubEnv(k, '');
    }
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'old-name-must-not-count');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const keyUsed = async (): Promise<string> => {
    const fetchMock = vi.fn(async () => cold());
    vi.stubGlobal('fetch', fetchMock);
    await expect(buildLLMComplete()({ system: 's', user: 'u' })).rejects.toThrow();
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> };
    return init.headers['x-mcp-api-key'];
  };

  it('BRITTNEY_FLEET_RESOLVE_KEY wins, trimmed', async () => {
    vi.stubEnv('BRITTNEY_FLEET_RESOLVE_KEY', ' fleet ');
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', 'mcp');
    expect(await keyUsed()).toBe('fleet');
  });

  it('a whitespace-only BRITTNEY_FLEET_RESOLVE_KEY falls through to HOLOSCRIPT_MCP_API_KEY', async () => {
    vi.stubEnv('BRITTNEY_FLEET_RESOLVE_KEY', '   ');
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', ' mcp ');
    expect(await keyUsed()).toBe('mcp');
  });

  it('with neither set it throws the agreed error and never fetches', async () => {
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', ' ');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(buildLLMComplete()({ system: 's', user: 'u' })).rejects.toThrow(
      MISSING_MCP_API_KEY_ERROR
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
