import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('POST /tools/call auth wiring', () => {
  it('uses caller auth instead of minting an internal admin proxy', () => {
    const source = readFileSync(new URL('../http-server.ts', import.meta.url), 'utf8');
    const start = source.indexOf("if (url === '/tools/call' && req.method === 'POST')");
    const end = source.indexOf('// POST /api/share', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const block = source.slice(start, end);
    expect(block).toContain('const requestAuth = await authenticateRequest(req);');
    expect(block).toContain('if (!requestAuth.active)');
    expect(block).toContain('securedToolExecution(tool, args || {}, requestAuth');
    expect(block).not.toContain("scopes: ['admin:*']");
    expect(block).not.toContain("agentId: 'orchestrator-proxy'");
  });
});
