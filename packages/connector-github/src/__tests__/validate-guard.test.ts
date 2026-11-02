import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubConnector } from '../GitHubConnector';
import { MISSING_MCP_API_KEY_ERROR } from '../mcp-api-key';

type Validate = { validateHoloScriptScene(a: Record<string, unknown>): Promise<unknown> };

function connector(getContent: ReturnType<typeof vi.fn>): Validate {
  const c = new GitHubConnector({ token: 't' }) as unknown as Record<string, unknown>;
  c.octokit = { rest: { repos: { getContent } } };
  return c as unknown as Validate;
}
const args = { owner: 'o', repo: 'r', files: ['a.holo'] };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GitHubConnector validate_holoscript key guard', () => {
  it.each([
    ['unset', ''],
    ['whitespace-only', '  \t '],
  ])('%s key: fails closed before reading files or calling fetch', async (_l, key) => {
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', key);
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'old-name-must-not-count');
    const getContent = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await connector(getContent).validateHoloScriptScene(args);
    expect(r).toEqual({ success: false, message: MISSING_MCP_API_KEY_ERROR });
    expect(getContent).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the trimmed key and reports only the HTTP status', async () => {
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', ' k1 ');
    const getContent = vi.fn(async () => ({
      data: { content: Buffer.from('x').toString('base64') },
    }));
    const fetchMock = vi.fn(async () => new Response('secret-body', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await connector(getContent).validateHoloScriptScene(args);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> };
    expect(init.headers['x-mcp-api-key']).toBe('k1');
    expect(JSON.stringify(r)).toContain('validate_holoscript HTTP 401');
    expect(JSON.stringify(r)).not.toContain('secret-body');
  });
});
