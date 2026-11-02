import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MISSING_MCP_API_KEY_ERROR, publishHolo } from '../publish';

// @holoscript/config is mocked so this test needs no workspace build; with no OAuth and no env key it yields no headers.
vi.mock('@holoscript/config', () => ({ mcpAuthHeadersAsync: async () => ({}) }));

const here = dirname(fileURLToPath(import.meta.url));
const saved = { ...process.env };

function holoFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'holo-pub-'));
  const f = join(dir, 'a.holo');
  writeFileSync(f, 'composition "A" {}');
  return f;
}

afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

describe('publishHolo fail closed', () => {
  it('uses the agreed wording', () => {
    expect(MISSING_MCP_API_KEY_ERROR).toBe(
      'HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart.'
    );
  });

  it('refuses a blank --api-key with no env key and does not fetch', async () => {
    for (const k of [
      'HOLOSCRIPT_MCP_API_KEY',
      'HOLOSCRIPT_API_KEY',
      'MCP_API_KEY',
      'HOLOSCRIPT_MCP_CLIENT_ID',
      'HOLOSCRIPT_MCP_CLIENT_SECRET',
    ]) {
      delete process.env[k];
    }
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(publishHolo({ holoPath: holoFile(), apiKey: '   ' })).rejects.toThrow(
      MISSING_MCP_API_KEY_ERROR
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not read or return the body of a failed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('secret-body', { status: 401 }))
    );
    const r = await publishHolo({ holoPath: holoFile(), apiKey: ' k ' });
    expect(r.ok).toBe(false);
    expect(r.responseBody).toBe('');
  });

  it('cli prints the response only on success and names only the new env var', () => {
    const cli = readFileSync(join(here, '../cli.ts'), 'utf8');
    expect(cli).toMatch(/if \(result\.ok\) log\(/);
    expect(cli).not.toMatch(/HOLOSCRIPT_API_KEY|\bMCP_API_KEY\b/);
  });
});
