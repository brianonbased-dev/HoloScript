/**
 * POST /api/public/tool dispatches with an explicit anonymous caller, never with no context
 * (task x5ku). What that caller does is proven in fork-sandbox-canary.test.ts (X004, X005,
 * X007): nobody's scopes, and a self-declared manifest tier read as 'unverified'. This file pins
 * that the anonymous route really passes it. public-tool-endpoint.test.ts re-implements the
 * route with a mock dispatcher, so it cannot see this wiring.
 */
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

describe('POST /api/public/tool passes an explicit anonymous caller', () => {
  it('dispatches with publicAnonymousContext(), never with no context', () => {
    const route = block('if (!PUBLIC_ANON_TOOLS.has(tool))', '// GET /api/public/feed');
    expect(route).toContain('_handleSingleToolLogic(tool, args, publicAnonymousContext())');
    expect(route).not.toMatch(/_handleSingleToolLogic\(\s*tool\s*,\s*args\s*\)/);
  });
});
