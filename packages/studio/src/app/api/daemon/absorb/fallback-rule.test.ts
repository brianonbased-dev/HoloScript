import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fbAuth = vi.hoisted(() => ({ session: { user: { id: 'user-owner' } } as unknown, token: 'gho_owner' as string | null }));
vi.mock('next-auth', () => ({ getServerSession: async () => fbAuth.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
// The workspace owner check (#620) has its own real-filesystem test in
// fallback-workspace-owner.test.ts; here every path counts as owned.
vi.mock('@/lib/workspace/workspaceOwner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workspace/workspaceOwner')>()),
  assertWorkspaceOwner: (_s: unknown, p: string) => ({ ok: true, resolved: p, workspaceDir: p, workspaceId: 'ws', project: {} }),
}));
vi.mock('@/app/api/github/_shared', () => ({ getGitHubToken: async () => fbAuth.token }));

// Treasurer's rule, end to end: the REAL callMcpTool and mcpClearlyDidNotRun,
// only fetch is faked. Falls back to /api/absorb/scan ONLY when MCP was refused
// before anything was sent, or answered a clean pre-charge 4xx
// (400/401/402/403/422). Everything else "may have run": no second charge.
vi.mock('@holoscript/config', () => ({
  ENDPOINTS: { HOLOSCRIPT_MCP: 'https://mcp.test', ABSORB_SERVICE: 'https://absorb.test' },
  getAbsorbKey: () => 'service-key',
  getMcpApiKey: () => '',
}));
vi.mock('@/lib/absorb/projectState', () => ({ recordAbsorbJob: vi.fn() }));

import { POST } from './route';

const SCAN = 'https://absorb.test/api/absorb/scan';
const IMPORT = { projectPath: '/ws/ws-1/repo', projectId: 'proj-1', depth: 'shallow', tier: 'medium' };

function post(): NextRequest {
  return new NextRequest('http://localhost/api/daemon/absorb', {
    method: 'POST',
    body: JSON.stringify(IMPORT),
    headers: { 'Content-Type': 'application/json' },
  });
}
const thrown = (code: string) => () => {
  throw Object.assign(new TypeError('fetch failed'), { cause: { code } });
};
const status = (s: number) => () => new Response('{"error":"x"}', { status: s });
/** 200 headers, then the body stream errors mid-read. */
const midStream = (code: string) => () =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0","res'));
        c.error(Object.assign(new TypeError('terminated'), { cause: { code } }));
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

let mcp: () => Response | Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock = vi.fn(async (url: string) =>
    url === SCAN ? new Response('{"graphId":"g1","cost":10}', { status: 200 }) : mcp()
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function scanned(): Promise<boolean> {
  await POST(post());
  return fetchMock.mock.calls.some((c) => c[0] === SCAN);
}

describe("absorb fallback: Treasurer's rule", () => {
  describe('nothing was sent or a clean pre-charge 4xx: falls back to /scan', () => {
    it('ECONNREFUSED', async () => { mcp = thrown('ECONNREFUSED'); expect(await scanned()).toBe(true); });
    it('400 validation', async () => { mcp = status(400); expect(await scanned()).toBe(true); });
    it('401 auth', async () => { mcp = status(401); expect(await scanned()).toBe(true); });
    it('402 payment', async () => { mcp = status(402); expect(await scanned()).toBe(true); });
    it('403 auth', async () => { mcp = status(403); expect(await scanned()).toBe(true); });
    it('422 validation', async () => { mcp = status(422); expect(await scanned()).toBe(true); });
  });

  describe('may have run, or the fallback host is unreachable too: never falls back', () => {
    it('ENOTFOUND (DNS: /scan is on the same host; Mapping N3)', async () => { mcp = thrown('ENOTFOUND'); expect(await scanned()).toBe(false); });
    it('EAI_AGAIN (DNS: same host)', async () => { mcp = thrown('EAI_AGAIN'); expect(await scanned()).toBe(false); });
    it('404', async () => { mcp = status(404); expect(await scanned()).toBe(false); });
    it('406', async () => { mcp = status(406); expect(await scanned()).toBe(false); });
    it('408 request timeout', async () => { mcp = status(408); expect(await scanned()).toBe(false); });
    it('409 conflict', async () => { mcp = status(409); expect(await scanned()).toBe(false); });
    it('429 rate limit', async () => { mcp = status(429); expect(await scanned()).toBe(false); });
    it('500', async () => { mcp = status(500); expect(await scanned()).toBe(false); });
    it('502', async () => { mcp = status(502); expect(await scanned()).toBe(false); });
    it('503', async () => { mcp = status(503); expect(await scanned()).toBe(false); });
    it('ECONNRESET before headers', async () => { mcp = thrown('ECONNRESET'); expect(await scanned()).toBe(false); });
    it('reset mid-response', async () => { mcp = midStream('ECONNRESET'); expect(await scanned()).toBe(false); });
    it('aborted stream', async () => { mcp = midStream('UND_ERR_ABORTED'); expect(await scanned()).toBe(false); });
    it('truncated body', async () => {
      mcp = () => new Response('{"jsonrpc":"2.0","result":{"cont', { status: 200 });
      expect(await scanned()).toBe(false);
    });
    it('unparseable body', async () => {
      mcp = () => new Response('<html>gateway</html>', { status: 200 });
      expect(await scanned()).toBe(false);
    });
    it('timeout after send', async () => {
      mcp = () => { throw new DOMException('The operation timed out.', 'TimeoutError'); };
      expect(await scanned()).toBe(false);
    });
  });
});