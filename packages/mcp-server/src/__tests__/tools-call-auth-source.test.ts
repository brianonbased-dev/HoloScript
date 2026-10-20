import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../http-server.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start, startMarker).toBeGreaterThanOrEqual(0);
  expect(end, endMarker).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('POST /tools/call auth wiring', () => {
  it('uses caller auth instead of minting an internal admin proxy', () => {
    const route = block(
      "if (url === '/tools/call' && req.method === 'POST')",
      '// POST /api/share'
    );
    expect(route).toContain('const requestAuth = await authenticateRequest(req);');
    expect(route).toContain('if (!requestAuth.active)');
    expect(route).toMatch(/gatedStatelessToolExecution\(\s*tool,\s*args \|\| \{\},\s*requestAuth,/);
    expect(route).not.toContain("scopes: ['admin:*']");
    expect(route).not.toContain("agentId: 'orchestrator-proxy'");
  });
});

// task 6fef: the stateless routes skipped the tool-call gate, so an agent's frame (sent in
// `_meta` on exactly these routes) limited nothing in production. Both now pass through it.
describe('the stateless tool routes go through the tool-call gate', () => {
  it('POST /tools/call gates the call with the frame from body._meta and answers a refusal', () => {
    const route = block(
      "if (url === '/tools/call' && req.method === 'POST')",
      '// POST /api/share'
    );
    expect(route).toContain('(body as { _meta?: unknown })._meta');
    expect(route).toContain('gateError instanceof ToolCallGateDeniedError');
    expect(route).not.toMatch(/await securedToolExecution\(/);
  });

  it('POST /mcp tools/call gates the call with the frame from params._meta and answers a refusal', () => {
    const route = block("if (method === 'tools/call') {", '// Fallback for other methods');
    expect(route).toMatch(/gatedStatelessToolExecution\(\s*name,/);
    expect(route).toContain('(params as { _meta?: unknown })._meta');
    expect(route).toContain('gateError instanceof ToolCallGateDeniedError');
    expect(route).not.toMatch(/await securedToolExecution\(/);
  });

  it('the shared helper runs the founder-and-frame check, reads the frame, and takes its mode from the env', () => {
    const helper = block('async function gatedStatelessToolExecution(', '\n}\n');
    expect(helper).toContain('frameDeclarationFromMcpMeta(meta)');
    // Scope stays with securedToolExecution's triple gate (#463 pre-review).
    expect(helper).toContain('check: founderGateFrameToolCallCheck');
    expect(helper).toContain('enforcement: statelessToolGateMode()');
    const mode = block('function statelessToolGateMode()', '\n}\n');
    expect(mode).toContain('toolGateEnforcementFrom(process.env.HOLOSCRIPT_STATELESS_TOOL_GATE)');
  });
});
