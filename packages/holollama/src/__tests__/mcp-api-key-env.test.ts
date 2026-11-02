import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildHoloMeshReadOnlyBridge } from '../index.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('HOLOSCRIPT_MCP_API_KEY migration (holollama)', () => {
  it('the read-only bridge names HOLOSCRIPT_MCP_API_KEY by default', () => {
    const bridge = buildHoloMeshReadOnlyBridge({
      teamId: 't',
      generatedAt: '2026-11-02T00:00:00.000Z',
    });
    expect(bridge.mesh.apiKeyEnv).toBe('HOLOSCRIPT_MCP_API_KEY');
    expect(bridge.mesh.authHeader).toBe('Authorization: Bearer $HOLOSCRIPT_MCP_API_KEY');
  });

  it('an explicit --api-key-env still wins and only the name is reported', () => {
    const bridge = buildHoloMeshReadOnlyBridge({ apiKeyEnv: 'MY_KEY_ENV', generatedAt: 'x' });
    expect(bridge.mesh.apiKeyEnv).toBe('MY_KEY_ENV');
  });

  it('the ai-ecosystem-basic template lists only HOLOSCRIPT_MCP_API_KEY', () => {
    const env = readFileSync(
      join(here, '..', '..', 'templates', 'ai-ecosystem-basic', '.env.example'),
      'utf8'
    );
    expect(env).toMatch(/^HOLOSCRIPT_MCP_API_KEY=$/m);
    expect(env).not.toMatch(/\b(HOLOSCRIPT_API_KEY|MCP_API_KEY)=/);
  });

  it('no holollama source file names the old key vars', () => {
    const src =
      readFileSync(join(here, '..', 'index.ts'), 'utf8') +
      readFileSync(join(here, '..', 'cli.ts'), 'utf8');
    expect(src).not.toMatch(/\bHOLOSCRIPT_API_KEY\b/);
    expect(src).not.toMatch(/(?<!HOLOSCRIPT_)\bMCP_API_KEY\b/);
  });
});
