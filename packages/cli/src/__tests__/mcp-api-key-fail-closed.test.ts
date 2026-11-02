import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  DEPRECATED_MCP_API_KEY_WARNING,
  MCP_API_KEY_ENV,
  MISSING_MCP_API_KEY_ERROR,
  SETUP_MCP_MISSING_KEY_ERROR,
  readJsonBody,
  resolveCliMcpApiKey,
  safeErrorText,
  resolveMcpApiKey,
} from '../mcp-api-key';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('HOLOSCRIPT_MCP_API_KEY fail-closed (cli readers)', () => {
  it('reads only HOLOSCRIPT_MCP_API_KEY', () => {
    expect(MCP_API_KEY_ENV).toBe('HOLOSCRIPT_MCP_API_KEY');
    expect(resolveMcpApiKey({ HOLOSCRIPT_MCP_API_KEY: 'new-key' })).toBe('new-key');
  });

  it('old names alone resolve to empty (no fallback)', () => {
    expect(resolveMcpApiKey({ HOLOSCRIPT_API_KEY: 'old-key', MCP_API_KEY: 'old-2' })).toBe('');
  });

  it('whitespace-only counts as unset, for env and arg', () => {
    expect(resolveMcpApiKey({ HOLOSCRIPT_MCP_API_KEY: '  \t\n ' })).toBe('');
    expect(resolveMcpApiKey({}, '   ')).toBe('');
    expect(resolveMcpApiKey({ HOLOSCRIPT_MCP_API_KEY: ' k ' }, '  ')).toBe('k');
  });

  it('an existing cli key argument still wins over the env', () => {
    expect(resolveMcpApiKey({ HOLOSCRIPT_MCP_API_KEY: 'env-key' }, 'arg-key')).toBe('arg-key');
  });

  it('the error is the exact user-facing wording and never contains a key', () => {
    expect(MISSING_MCP_API_KEY_ERROR).toBe(
      'HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart.'
    );
  });

  it('setup-mcp E006 tells the user to rerun setup-mcp, not restart', () => {
    expect(SETUP_MCP_MISSING_KEY_ERROR).toBe(
      'HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key"), then run hs setup-mcp again.'
    );
    const cli = readFileSync(join(src, 'cli.ts'), 'utf8');
    expect(cli).toContain("cliError('E006', SETUP_MCP_MISSING_KEY_ERROR");
    expect(cli).not.toContain("cliError('E006', MISSING_MCP_API_KEY_ERROR");
  });

  it('non-JSON bodies throw a fixed text with no body or parser message', async () => {
    const bad = {
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0: <html>secret-BODY');
      },
    };
    await expect(readJsonBody(bad, 'orchestrator')).rejects.toThrow(
      /^orchestrator: response was not JSON$/
    );
    const err = (await readJsonBody(bad, 'mcp').catch((e: unknown) => e)) as Error;
    expect(String(err.message)).toBe('mcp: response was not JSON');
    expect(String(err.message)).not.toContain('secret-BODY');
    expect(String(err.message)).not.toContain('Unexpected token');
    await expect(readJsonBody({ json: async () => ({ ok: 1 }) }, 'x')).resolves.toEqual({ ok: 1 });
    expect(safeErrorText(new Error('fixed'))).toBe('fixed');
    expect(safeErrorText({ body: 'secret-BODY' })).toBe('unknown error');
  });

  it('generate_with_brittney wraps both json() calls and logs caught errors as message only', () => {
    const gen = readFileSync(join(src, 'scripts', 'generate_with_brittney.ts'), 'utf8');
    expect(gen).not.toMatch(/response\.json\(\)/);
    expect(gen).toContain("readJsonBody<JsonRpcToolResponse>(response, 'mcp')");
    expect(gen).toContain("readJsonBody<JsonMap>(response, 'orchestrator')");
    expect(gen).toContain('safeErrorText(err)');
    expect(gen).toContain("'Direct MCP call failed:', safeErrorText(mcpErr)");
    expect(gen).not.toMatch(/console\.[a-z]+\([^;]*,\s*(err|mcpErr)\)/);
  });

  it('setup-mcp and generate_with_brittney use the shared reader and never print the key', () => {
    const cli = readFileSync(join(src, 'cli.ts'), 'utf8');
    const gen = readFileSync(join(src, 'scripts', 'generate_with_brittney.ts'), 'utf8');
    for (const s of [cli, gen]) {
      expect(s).not.toMatch(/\bHOLOSCRIPT_API_KEY\b/);
      expect(s).not.toMatch(/process\.env\[?.?MCP_API_KEY/);
    }
    expect(cli).toContain('resolveCliMcpApiKey(process.env, options.input)');
    expect(gen).toContain('resolveMcpApiKey()');
    expect(gen).not.toContain('resolveCliMcpApiKey');
    expect(gen).toMatch(
      /if \(!mcpApiKey\) \{\s*console\.error\(MISSING_MCP_API_KEY_ERROR\);\s*process\.exit\(1\);/
    );
    expect(gen).not.toMatch(/console\.[a-z]+\([^)]*mcpApiKey/);
    expect(gen).not.toMatch(/await response\.text\(\)/);
  });
});

describe('published cli: HOLOSCRIPT_API_KEY deprecated alias (8.x)', () => {
  const run = (env: Record<string, string | undefined>, arg?: string) => {
    const warnings: string[] = [];
    const key = resolveCliMcpApiKey(env, arg, (m) => warnings.push(m));
    return { key, warnings };
  };

  it('new name works with no warning', () => {
    expect(run({ HOLOSCRIPT_MCP_API_KEY: ' new-val ' })).toEqual({ key: 'new-val', warnings: [] });
  });

  it('old name alone works and warns by name only, never the value', () => {
    const r = run({ HOLOSCRIPT_API_KEY: 'old-SECRET-val' });
    expect(r.key).toBe('old-SECRET-val');
    expect(r.warnings).toEqual([DEPRECATED_MCP_API_KEY_WARNING]);
    expect(r.warnings.join()).toContain('HOLOSCRIPT_API_KEY');
    expect(r.warnings.join()).toContain('HOLOSCRIPT_MCP_API_KEY');
    expect(r.warnings.join()).not.toContain('old-SECRET-val');
  });

  it('both set: new wins, no warning', () => {
    expect(run({ HOLOSCRIPT_MCP_API_KEY: 'new-val', HOLOSCRIPT_API_KEY: 'old-val' })).toEqual({
      key: 'new-val',
      warnings: [],
    });
  });

  it('whitespace-only new name falls through to the old name, with the warning', () => {
    const r = run({ HOLOSCRIPT_MCP_API_KEY: '   ', HOLOSCRIPT_API_KEY: 'old-val' });
    expect(r.key).toBe('old-val');
    expect(r.warnings).toHaveLength(1);
  });

  it('neither set (or whitespace-only) fails closed with no warning', () => {
    expect(run({})).toEqual({ key: '', warnings: [] });
    expect(run({ HOLOSCRIPT_MCP_API_KEY: ' ', HOLOSCRIPT_API_KEY: '\t' })).toEqual({
      key: '',
      warnings: [],
    });
    expect(run({ MCP_API_KEY: 'x' })).toEqual({ key: '', warnings: [] });
  });

  it('an explicit arg still wins over both, with no warning', () => {
    expect(run({ HOLOSCRIPT_API_KEY: 'old' }, 'arg-val')).toEqual({ key: 'arg-val', warnings: [] });
  });

  it('the default warn writes to stderr, not stdout', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      resolveCliMcpApiKey({ HOLOSCRIPT_API_KEY: 'old-SECRET-val' });
      expect(err).toHaveBeenCalledTimes(1);
      expect(String(err.mock.calls[0][0])).not.toContain('old-SECRET-val');
      expect(out).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
      out.mockRestore();
    }
  });
});
