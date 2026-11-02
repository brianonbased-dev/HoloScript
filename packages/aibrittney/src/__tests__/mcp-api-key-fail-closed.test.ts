import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  McpClient,
  defaultMcpConfig,
  MCP_API_KEY_ENV,
  MISSING_MCP_API_KEY_ERROR,
} from '../mcp-client.js';

// Fail-closed migration: the MCP key is read from HOLOSCRIPT_MCP_API_KEY only.
const OLD_NAMES = ['HOLOSCRIPT_API_KEY', 'MCP_API_KEY'];

function clearKeyEnv(): void {
  for (const name of [MCP_API_KEY_ENV, ...OLD_NAMES])
    vi.stubEnv(name, undefined as unknown as string);
}

describe('HOLOSCRIPT_MCP_API_KEY fail-closed (mcp-client reader)', () => {
  beforeEach(clearKeyEnv);
  afterEach(() => vi.unstubAllEnvs());

  it('reads only HOLOSCRIPT_MCP_API_KEY', () => {
    expect(MCP_API_KEY_ENV).toBe('HOLOSCRIPT_MCP_API_KEY');
  });

  it('(a) old names alone give a clear error naming HOLOSCRIPT_MCP_API_KEY and send nothing', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'old-key-value');
    vi.stubEnv('MCP_API_KEY', 'old-key-value-2');
    const fetchImpl = vi.fn();
    const cfg = defaultMcpConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(cfg.apiKey).toBe('');
    const result = await new McpClient(cfg).callTool({ server: 's', tool: 't', args: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/HOLOSCRIPT_MCP_API_KEY is not set/);
    expect(result.error).not.toMatch(/\bHOLOSCRIPT_API_KEY\b/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('(b) HOLOSCRIPT_MCP_API_KEY is used for the OAuth registration', async () => {
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', 'new-key-value');
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const bodies = [
      { client_id: 'c', client_secret: 's' },
      { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 },
      { ok: true },
    ];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(bodies[seen.length - 1]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const cfg = defaultMcpConfig({
      endpoint: 'https://orch.example.com',
      oauthEndpoint: 'https://oauth.example.com',
      fetchImpl,
    });
    expect(cfg.apiKey).toBe('new-key-value');
    const result = await new McpClient(cfg).callTool({ server: 's', tool: 't', args: {} });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(seen[0].init)).toContain('new-key-value');
    expect(seen[seen.length - 1].url).toBe('https://orch.example.com/tools/call');
  });

  it('(c) no aibrittney source file reads or names the old key vars', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== '__tests__') walk(p);
        } else if (/\.(ts|mts|cts|js|mjs)$/.test(name)) {
          readFileSync(p, 'utf8')
            .split(/\r?\n/)
            .forEach((line, i) => {
              if (/\b(HOLOSCRIPT_API_KEY|MCP_API_KEY)\b/.test(line)) hits.push(p + ':' + (i + 1));
            });
        }
      }
    };
    walk(srcDir);
    expect(hits).toEqual([]);
  });
  it('(d) the error text is the exact user-facing wording', () => {
    expect(MISSING_MCP_API_KEY_ERROR).toBe(
      'HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart.'
    );
    expect(MISSING_MCP_API_KEY_ERROR.startsWith('mcp-client:')).toBe(false);
  });

  it('(e) a whitespace-only HOLOSCRIPT_MCP_API_KEY counts as unset', async () => {
    vi.stubEnv('HOLOSCRIPT_MCP_API_KEY', '  \t\n ');
    const fetchImpl = vi.fn();
    const cfg = defaultMcpConfig({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(cfg.apiKey).toBe('');
    const result = await new McpClient(cfg).callTool({ server: 's', tool: 't', args: {} });
    expect(result.error).toBe(MISSING_MCP_API_KEY_ERROR);
    const direct = new McpClient({
      endpoint: 'x',
      apiKey: '   ',
      timeoutMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect((await direct.callTool({ server: 's', tool: 't', args: {} })).error).toBe(
      MISSING_MCP_API_KEY_ERROR
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('(f) register/token errors never include the server response body', async () => {
    const secretish = { client_id: 'cid-LEAK', client_secret: 'sec-LEAK', detail: 'x'.repeat(500) };
    const cases: Array<Array<{ status: number; body: unknown }>> = [
      [{ status: 500, body: secretish }],
      [{ status: 200, body: { client_id: 'cid-LEAK' } }],
      [
        { status: 200, body: { client_id: 'c', client_secret: 's' } },
        { status: 400, body: secretish },
      ],
      [
        { status: 200, body: { client_id: 'c', client_secret: 's' } },
        { status: 200, body: secretish },
      ],
    ];
    for (const steps of cases) {
      let i = 0;
      const fetchImpl = (async () => {
        const st = steps[Math.min(i++, steps.length - 1)];
        return new Response(JSON.stringify(st.body), {
          status: st.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;
      const client = new McpClient({
        endpoint: 'https://o.example',
        oauthEndpoint: 'https://a.example',
        apiKey: 'k',
        timeoutMs: 5000,
        fetchImpl,
      });
      const result = await client.callTool({ server: 's', tool: 't', args: {} });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/^oauth\//);
      expect(result.error).not.toMatch(/LEAK|xxxx/);
      expect((result.error ?? '').length).toBeLessThanOrEqual(80);
    }
  });
});
