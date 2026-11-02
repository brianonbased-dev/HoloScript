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
  const files = ['../headset-share/index.ts'];
  it.each(files)('%s reads no retired key name and puts no body text in errors', (f) => {
    const s = code(f);
    expect(s).not.toMatch(/\bHOLOSCRIPT_API_KEY\b/);
    expect(s).not.toMatch(/process\.env(\.|\[')MCP_API_KEY\b/);
    expect(s).not.toMatch(/Error\([^;]*\.text\(\)/);
    expect(s).not.toMatch(/\.text\(\)\)?\.slice/);
  });

  it('relay keeps HOLOMESH_API_KEY as a documented separate-credential fallback', () => {
    const raw = readFileSync(join(here, '../headset-share/index.ts'), 'utf8');
    expect(raw).toMatch(/HOLOMESH_API_KEY is a separate HoloMesh credential/);
    expect(code('../headset-share/index.ts')).toMatch(
      /readMcpApiKey\(process\.env, options\.apiKey\) \|\| \(process\.env\.HOLOMESH_API_KEY \?\? ''\)\.trim\(\)/
    );
  });
});
