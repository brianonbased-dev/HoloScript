import { afterEach, describe, expect, it, vi } from 'vitest';
import { Layer3MCPClient } from '../agents/spatial-comms/Layer3MCP';
import { MISSING_MCP_API_KEY_ERROR } from '../mcp-api-key';

type Private = {
  sendMCPRequest(r: unknown): Promise<unknown>;
  mcpToolCall(s: string, t: string, a: Record<string, unknown>): Promise<unknown>;
};
const client = (apiKey: string): Private =>
  new Layer3MCPClient('agent-1', {
    apiKey,
    endpoint: 'http://mcp.test',
    timeout: 1000,
  }) as unknown as Private;

afterEach(() => vi.unstubAllGlobals());

describe('Layer3MCPClient refuses without a key, before fetch', () => {
  it.each([
    ['empty', ''],
    ['whitespace-only', ' \t\n '],
  ])('%s key: sendMCPRequest and mcpToolCall throw and never fetch', async (_label, key) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = client(key);
    await expect(c.sendMCPRequest({ command: 'x', params: {} })).rejects.toThrow(
      MISSING_MCP_API_KEY_ERROR
    );
    await expect(c.mcpToolCall('srv', 'tool', {})).rejects.toThrow(MISSING_MCP_API_KEY_ERROR);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the trimmed key and reports only the numeric status on failure', async () => {
    const fetchMock = vi.fn(
      async () => new Response('secret-body', { status: 502, statusText: 'secret-status' })
    );
    vi.stubGlobal('fetch', fetchMock);
    const c = client('  k1  ');
    const e1 = (await c
      .sendMCPRequest({ command: 'x', params: {} })
      .catch((e: unknown) => e)) as Error;
    const e2 = (await c.mcpToolCall('s', 't', {}).catch((e: unknown) => e)) as Error;
    expect(e1.message).toBe('MCP HTTP 502');
    expect(e2.message).toBe('MCP Tool Call HTTP 502');
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> };
    expect(init.headers['x-mcp-api-key']).toBe('k1');
  });
});
