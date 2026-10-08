/**
 * POST /mcp (tools/call) and POST /tools/call run the tool-call gate, driven through the REAL
 * http-server.ts over real HTTP (task 6fef, #463).
 *
 * Why this exists: #463's first tests read the route source as text. The pre-review deleted the
 * line that hands the caller's frame to the gate, and separately pinned the mode to observe; the
 * text tests stayed green both times. So this file boots the server and speaks to both routes in
 * both modes. The mode is read per call, so each test sets HOLOSCRIPT_STATELESS_TOOL_GATE itself.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  bootRealHttpServer,
  REAL_SERVER_ADMIN_KEY,
  restoreRealHttpServerEnv,
  type RealHttpServer,
  type Reply,
} from './real-http-server-harness';
import { getAuditLogger } from '../security/audit-log';

const FRAME_KEY = 'holoscript.dev/frame-declaration';
const frameAllowing = (tools: string[]) => ({
  [FRAME_KEY]: {
    domain: 'holoscript-language',
    horizon: '2026-07',
    capability_tier: 2,
    trust_tier: 2,
    allowed_tools: tools,
    denied_domains: [],
  },
});
const PARSE_ARGS = { code: 'object Cube {}' };

let server: RealHttpServer;
let bootLines = '';
let readToken = '';

beforeAll(async () => {
  const info = vi.spyOn(console, 'info');
  server = await bootRealHttpServer({ sandboxPrefix: 'mcp-stateless-gate-' });
  bootLines = info.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
  info.mockRestore();
  readToken = await server.tokenWithScope('tools:read');
}, 240_000);

afterAll(() => restoreRealHttpServerEnv());

afterEach(() => {
  delete process.env.HOLOSCRIPT_STATELESS_TOOL_GATE;
  vi.restoreAllMocks();
});

const viaMcp = (tool: string, args: unknown, meta?: unknown, token = REAL_SERVER_ADMIN_KEY) =>
  server.request('POST', '/mcp', {
    token,
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: args, ...(meta ? { _meta: meta } : {}) },
    },
  });

const viaToolsCall = (tool: string, args: unknown, meta?: unknown, token = REAL_SERVER_ADMIN_KEY) =>
  server.request('POST', '/tools/call', {
    token,
    body: { tool, args, ...(meta ? { _meta: meta } : {}) },
  });

const mcpError = (reply: Reply) =>
  reply.body.error as { code?: number; data?: unknown } | undefined;

describe('the stateless tool routes run the tool-call gate (real server)', () => {
  it('the server states the mode it landed on, once, at startup', () => {
    expect(bootLines).toContain(
      'Tool-call gate on POST /mcp, POST /tools/call, POST /a2a/tasks and POST /a2a: observe (HOLOSCRIPT_STATELESS_TOOL_GATE="")'
    );
  });

  it('observe (the default): a call outside the caller frame runs, and the log says what enforce would refuse', async () => {
    const warn = vi.spyOn(console, 'warn');
    const outside = frameAllowing(['compile_holoscript']);

    const mcp = await viaMcp('parse_hs', PARSE_ARGS, outside);
    expect(mcp.status).toBe(200);
    expect(mcpError(mcp), JSON.stringify(mcp.body)).toBeUndefined();
    expect(mcp.body.result).toBeDefined();

    const rest = await viaToolsCall('parse_hs', PARSE_ARGS, outside);
    expect(rest.status, JSON.stringify(rest.body)).toBe(200);
    expect(rest.body.success).toBe(true);

    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[ToolCallGate] observe: would deny "parse_hs"');
    expect(logged).toContain('(check: frame-declaration)');
  });

  it('enforce: the same calls are refused before dispatch, on both routes', async () => {
    process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
    const outside = frameAllowing(['compile_holoscript']);

    const mcp = await viaMcp('parse_hs', PARSE_ARGS, outside);
    expect(mcpError(mcp)).toMatchObject({ code: -32003, data: { deniedBy: 'frame-declaration' } });

    const rest = await viaToolsCall('parse_hs', PARSE_ARGS, outside);
    expect(rest.status).toBe(403);
    expect(rest.body).toMatchObject({ success: false, deniedBy: 'frame-declaration' });
  });

  it('enforce: a call inside the caller frame runs', async () => {
    process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
    const mcp = await viaMcp('parse_hs', PARSE_ARGS, frameAllowing(['parse_hs']));
    expect(mcpError(mcp), JSON.stringify(mcp.body)).toBeUndefined();
    expect(mcp.body.result).toBeDefined();
  });

  it('enforce: a near-miss spelling of the switch still enforces', async () => {
    process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = ' Enforce ';
    const mcp = await viaMcp('parse_hs', PARSE_ARGS, frameAllowing(['compile_holoscript']));
    expect(mcpError(mcp)).toMatchObject({ code: -32003 });
  });

  it('enforce: a scope shortfall is still answered by the triple gate, as before this gate', async () => {
    process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
    // tools:read cannot run compile_holoscript. No frame, so only scope is in question.
    const mcp = await viaMcp(
      'compile_holoscript',
      { code: 'object Cube {}' },
      undefined,
      readToken
    );
    expect(mcpError(mcp), JSON.stringify(mcp.body)).toMatchObject({ code: -32000 });

    const rest = await viaToolsCall(
      'compile_holoscript',
      { code: 'object Cube {}' },
      undefined,
      readToken
    );
    expect(rest.status, JSON.stringify(rest.body)).toBe(500);
    expect(rest.body.deniedBy).toBeUndefined();
  });

  describe('POST /a2a/tasks runs the same gate and the same switch', () => {
    const viaA2a = (skillId: string, args: unknown, meta?: unknown) =>
      server.request('POST', '/a2a/tasks', {
        token: REAL_SERVER_ADMIN_KEY,
        body: { skillId, arguments: args, ...(meta ? { _meta: meta } : {}) },
      });
    const state = (r: Reply) => (r.body.status as { state?: string } | undefined)?.state;
    const text = (r: Reply) => JSON.stringify(r.body);

    it('enforce: a founder-class tool is refused before dispatch (failed task naming the gate)', async () => {
      process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
      const r = await viaA2a('transfer_custody_authority', {});
      expect(state(r), text(r)).toBe('failed');
      expect(text(r)).toContain('Refused by the tool-call gate');
      expect(text(r)).toContain('founder-gate-exact-four');
    });

    it('enforce: a call outside the caller frame (_meta) is refused too', async () => {
      process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
      const r = await viaA2a('parse_hs', PARSE_ARGS, frameAllowing(['compile_holoscript']));
      expect(state(r), text(r)).toBe('failed');
      expect(text(r)).toContain('frame-declaration');
    });

    it('enforce control: an ordinary allowed tool still runs', async () => {
      process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
      const r = await viaA2a('parse_hs', PARSE_ARGS);
      expect(state(r), text(r)).toBe('completed');
      expect(text(r)).not.toContain('tool-call gate');
    });

    it('observe (default): the founder-class call is not refused by the gate, and the log says what enforce would refuse', async () => {
      const warn = vi.spyOn(console, 'warn');
      const r = await viaA2a('transfer_custody_authority', {});
      expect(text(r)).not.toContain('Refused by the tool-call gate');
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('[ToolCallGate] observe: would deny "transfer_custody_authority"');
    });

    it('observe (default): a call outside the frame runs and the observe line appears', async () => {
      const warn = vi.spyOn(console, 'warn');
      const r = await viaA2a('parse_hs', PARSE_ARGS, frameAllowing(['compile_holoscript']));
      expect(state(r), text(r)).toBe('completed');
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('[ToolCallGate] observe: would deny "parse_hs"');
      expect(logged).toContain('(check: frame-declaration)');
    });
  });

  describe('POST /a2a (JSON-RPC a2a.sendMessage) runs the same gate, with the frame from params._meta', () => {
    let rpcId = 100;
    const viaA2aRpc = (skillId: string, args: unknown, meta?: unknown) =>
      server.request('POST', '/a2a', {
        token: REAL_SERVER_ADMIN_KEY,
        body: {
          jsonrpc: '2.0',
          id: ++rpcId,
          method: 'a2a.sendMessage',
          params: {
            message: { role: 'user', parts: [{ type: 'text', text: `run ${skillId}` }] },
            skillId,
            arguments: args,
            ...(meta ? { _meta: meta } : {}),
          },
        },
      });
    const state = (r: Reply) =>
      ((r.body.result as { status?: { state?: string } } | undefined)?.status)?.state;
    const text = (r: Reply) => JSON.stringify(r.body);
    const auditedPaths = (tool: string) =>
      getAuditLogger()
        .query({ toolName: tool, limit: 100_000 })
        .entries.map((e) => (e.request as { path?: string } | undefined)?.path);

    it('enforce: a founder-class tool is refused before dispatch', async () => {
      process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
      const r = await viaA2aRpc('transfer_custody_authority', {});
      expect(state(r), text(r)).toBe('failed');
      expect(text(r)).toContain('Refused by the tool-call gate');
      expect(text(r)).toContain('founder-gate-exact-four');
    });

    it('enforce: a call outside the frame declared in params._meta is refused', async () => {
      process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
      const r = await viaA2aRpc('parse_hs', PARSE_ARGS, frameAllowing(['compile_holoscript']));
      expect(state(r), text(r)).toBe('failed');
      expect(text(r)).toContain('frame-declaration');
    });

    it('enforce control: a call inside its declared frame still runs', async () => {
      process.env.HOLOSCRIPT_STATELESS_TOOL_GATE = 'enforce';
      const r = await viaA2aRpc('parse_hs', PARSE_ARGS, frameAllowing(['parse_hs']));
      expect(state(r), text(r)).toBe('completed');
      expect(text(r)).not.toContain('tool-call gate');
    });

    it('observe (default): a call outside the frame runs and the observe line appears', async () => {
      const warn = vi.spyOn(console, 'warn');
      const r = await viaA2aRpc('parse_hs', PARSE_ARGS, frameAllowing(['compile_holoscript']));
      expect(state(r), text(r)).toBe('completed');
      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('[ToolCallGate] observe: would deny "parse_hs"');
      expect(logged).toContain('(check: frame-declaration)');
    });

    it('the audit log files each A2A call under the route it came in on', async () => {
      const tool = 'validate_holoscript';
      await viaA2aRpc(tool, PARSE_ARGS);
      await server.request('POST', '/a2a/tasks', {
        token: REAL_SERVER_ADMIN_KEY,
        body: { skillId: tool, arguments: PARSE_ARGS },
      });
      const paths = auditedPaths(tool);
      expect(paths, JSON.stringify(paths)).toContain('/a2a');
      expect(paths, JSON.stringify(paths)).toContain('/a2a/tasks');
    });
  });
});
