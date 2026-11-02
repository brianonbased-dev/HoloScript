import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  MCP_API_KEY_ENV,
  MISSING_MCP_API_KEY_ERROR,
  requireMcpApiKey,
  getMcpApiKey,
  mcpAuthHeaders,
  validateConfig,
} from '../index';

const here = dirname(fileURLToPath(import.meta.url));
const code = (rel: string): string =>
  readFileSync(join(here, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('@holoscript/config HOLOSCRIPT_MCP_API_KEY (fail closed)', () => {
  it('exports the agreed name and wording', () => {
    expect(MCP_API_KEY_ENV).toBe('HOLOSCRIPT_MCP_API_KEY');
    expect(MISSING_MCP_API_KEY_ERROR).toBe(
      'HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart.'
    );
  });

  it('requireMcpApiKey throws the agreed error when unset, blank, or only old names are set', () => {
    delete process.env.HOLOSCRIPT_MCP_API_KEY;
    process.env.HOLOSCRIPT_API_KEY = 'old';
    process.env.MCP_API_KEY = 'old2';
    expect(() => requireMcpApiKey()).toThrow(MISSING_MCP_API_KEY_ERROR);
    process.env.HOLOSCRIPT_MCP_API_KEY = '   ';
    expect(() => requireMcpApiKey()).toThrow(MISSING_MCP_API_KEY_ERROR);
    expect(mcpAuthHeaders()).toEqual({});
  });

  it('trims the key and never echoes it in the error', () => {
    process.env.HOLOSCRIPT_MCP_API_KEY = '  real-key  ';
    expect(getMcpApiKey()).toBe('real-key');
    expect(requireMcpApiKey()).toBe('real-key');
    expect(MISSING_MCP_API_KEY_ERROR).not.toContain('real-key');
  });

  it('validateConfig treats whitespace-only as missing', () => {
    expect(typeof validateConfig).toBe('function');
    const s = code('../validate.ts');
    expect(s).toMatch(/'HOLOSCRIPT_MCP_API_KEY'/);
    expect(s).not.toMatch(/\bHOLOSCRIPT_API_KEY\b/);
    expect(s).toMatch(/\(process\.env\[k\] \?\? ''\)\.trim\(\)/);
  });

  it('auth.ts reads no retired name and puts no OAuth body in errors', () => {
    const s = code('../auth.ts');
    expect(s).not.toMatch(/\bHOLOSCRIPT_API_KEY\b/);
    expect(s).not.toMatch(/process\.env\.MCP_API_KEY\b/);
    expect(s).not.toMatch(/res\.text\(\)/);
    expect(s).toMatch(/OAuth token response was not JSON/);
  });
});
