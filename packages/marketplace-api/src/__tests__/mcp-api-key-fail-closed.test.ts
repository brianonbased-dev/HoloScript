import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  MCP_API_KEY_ENV,
  MISSING_MCP_API_KEY_ERROR,
  readJsonBody,
  readMcpApiKey,
} from '../mcp-api-key';
import { McpProtocolPublisher } from '../VRRTwinService';

const here = dirname(fileURLToPath(import.meta.url));
const code = (rel: string): string =>
  readFileSync(join(here, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('HOLOSCRIPT_MCP_API_KEY strict reader (fail closed)', () => {
  it('uses the agreed wording, verbatim', () => {
    expect(MCP_API_KEY_ENV).toBe('HOLOSCRIPT_MCP_API_KEY');
    expect(MISSING_MCP_API_KEY_ERROR).toBe(
      'HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart.'
    );
  });

  it('reads only HOLOSCRIPT_MCP_API_KEY, trimmed', () => {
    expect(readMcpApiKey({ HOLOSCRIPT_MCP_API_KEY: '  k1  ' })).toBe('k1');
  });

  it('ignores the old names (no alias, no fallback)', () => {
    expect(readMcpApiKey({ HOLOSCRIPT_API_KEY: 'old', MCP_API_KEY: 'old2' })).toBe('');
  });

  it('treats whitespace-only as unset', () => {
    expect(readMcpApiKey({ HOLOSCRIPT_MCP_API_KEY: ' \t\n ' })).toBe('');
    expect(readMcpApiKey({ HOLOSCRIPT_MCP_API_KEY: 'env' }, '   ')).toBe('env');
  });

  it('lets a non-blank explicit key win', () => {
    expect(readMcpApiKey({ HOLOSCRIPT_MCP_API_KEY: 'env' }, ' arg ')).toBe('arg');
  });

  it('throws a fixed message without body text on non-JSON', async () => {
    const res = { json: async () => JSON.parse('<html>secret-body</html>') };
    const err = (await readJsonBody(res, 'probe').catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('probe: response was not JSON');
  });
});

describe('readers in this package', () => {
  const files = ['../VRRTwinService.ts'];
  it.each(files)('%s reads no retired key name and puts no body text in errors', (f) => {
    const s = code(f);
    expect(s).not.toMatch(/\bHOLOSCRIPT_API_KEY\b/);
    expect(s).not.toMatch(/process\.env(\.|\[')MCP_API_KEY\b/);
    expect(s).not.toMatch(/Error\([^;]*\.text\(\)/);
    expect(s).not.toMatch(/\.text\(\)\)?\.slice/);
  });
});

describe('McpProtocolPublisher (fail closed)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not fetch when the key is missing or blank', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await new McpProtocolPublisher('https://mcp.example', '   ').publish({} as never);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.status).toBe('error');
    expect(r.message).toBe(MISSING_MCP_API_KEY_ERROR);
  });

  it('keeps no body on HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('secret-body', { status: 401 }))
    );
    const r = await new McpProtocolPublisher('https://mcp.example', 'k').publish({} as never);
    expect(r.raw).toBeNull();
    expect(JSON.stringify(r)).not.toContain('secret-body');
  });

  it('uses a fixed message for a non-JSON success body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>secret-body</html>', { status: 200 }))
    );
    const r = await new McpProtocolPublisher('https://mcp.example', 'k').publish({} as never);
    expect(JSON.stringify(r)).not.toContain('secret-body');
  });
});
