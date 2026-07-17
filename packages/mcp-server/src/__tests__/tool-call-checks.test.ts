/**
 * tool-call-checks.test.ts — the REAL FounderGate/x402 ToolCallCheck wired at
 * both CallTool fold points (dependency-sovereignty-ladder follow-up).
 *
 * Contract:
 *   1. FounderGate branch denies exact-four custody-class tool names and
 *      prohibited operations (force-push/hard-reset), classifying the NAME
 *      only — args are data and never steer authority routing.
 *   2. x402 branch fail-closes on unregistered tool names once the live
 *      registry is known — on both transports, even for the trusted local
 *      stdio caller (admin:*).
 *   3. x402 branch denies insufficient HTTP scopes pre-dispatch.
 *   4. Behavior-neutrality regression: every tool name in the live scope map
 *      passes the FounderGate branch (no current tool is founder-denied).
 *   5. End-to-end: a denial through gateToolCall throws ToolCallGateDeniedError
 *      without dispatching.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  founderGateX402ToolCallCheck,
  normalizeToolNameForAuthorityRouting,
  FOUNDER_GATE_CHECK_ID,
  FRAME_DECLARATION_CHECK_ID,
  X402_SCOPE_CHECK_ID,
  FOUNDER_GATE_X402_CHECK_ID,
} from '../tool-call-checks';
import { gateToolCall, ToolCallGateDeniedError } from '../tool-call-gate';
import type { ToolCallCheckDecision, ToolCallGateContext } from '../tool-call-gate';
import {
  registerKnownTools,
  getToolsForScope,
  __resetKnownToolsForTest,
} from '../security/tool-scopes';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-call-checks-test-'));
process.env.HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH = path.join(TMP_DIR, 'tool-calls.ndjson');

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH;
});

const stdioCtx: ToolCallGateContext = { transport: 'stdio', callerId: null };

function httpCtx(scopes: string[]): ToolCallGateContext {
  return { transport: 'http', callerId: 'agent-test', scopes };
}

async function runCheck(
  name: string,
  ctx: ToolCallGateContext
): Promise<ToolCallCheckDecision> {
  return await founderGateX402ToolCallCheck({ name, args: {} }, ctx);
}

describe('founderGateX402ToolCallCheck', () => {
  beforeEach(() => {
    // Registry unknown by default: the unregistered-name fail-close is
    // exercised explicitly in the tests that register tools.
    __resetKnownToolsForTest();
  });

  it('normalizes snake_case tool names into classifier prose', () => {
    expect(normalizeToolNameForAuthorityRouting('transfer_custody_authority')).toBe(
      'transfer custody authority'
    );
    expect(normalizeToolNameForAuthorityRouting('force_push-main')).toBe('force push main');
  });

  it('FounderGate denies an exact-four custody-class tool name', async () => {
    const decision = await runCheck('transfer_custody_authority', stdioCtx);
    expect(decision.allowed).toBe(false);
    expect(decision.check).toBe(FOUNDER_GATE_CHECK_ID);
    expect(decision.reason).toContain('spend-or-custody');
  });

  it('FounderGate denies prohibited operations (never approvable)', async () => {
    const decision = await runCheck('force_push_main', httpCtx(['admin:*']));
    expect(decision.allowed).toBe(false);
    expect(decision.check).toBe(FOUNDER_GATE_CHECK_ID);
  });

  it('allows a registered tool for the trusted local stdio caller', async () => {
    registerKnownTools(['parse_holo']);
    const decision = await runCheck('parse_holo', stdioCtx);
    expect(decision.allowed).toBe(true);
    expect(decision.check).toBe(FOUNDER_GATE_X402_CHECK_ID);
  });

  it('fail-closes on an unregistered tool name once the registry is known — even stdio/admin', async () => {
    registerKnownTools(['parse_holo']);
    const stdioDenied = await runCheck('spoofed_tool_name', stdioCtx);
    expect(stdioDenied.allowed).toBe(false);
    expect(stdioDenied.check).toBe(X402_SCOPE_CHECK_ID);
    expect(stdioDenied.reason).toContain('not a registered tool');

    const httpDenied = await runCheck('spoofed_tool_name', httpCtx(['admin:*']));
    expect(httpDenied.allowed).toBe(false);
    expect(httpDenied.check).toBe(X402_SCOPE_CHECK_ID);
  });

  it('denies insufficient HTTP scopes pre-dispatch', async () => {
    registerKnownTools(['holo_secrets_grant']);
    const denied = await runCheck('holo_secrets_grant', httpCtx(['tools:read']));
    expect(denied.allowed).toBe(false);
    expect(denied.check).toBe(X402_SCOPE_CHECK_ID);
    expect(denied.reason).toContain('Insufficient scope');
  });

  it('allows a sufficiently-scoped HTTP caller', async () => {
    registerKnownTools(['parse_holo']);
    const decision = await runCheck('parse_holo', httpCtx(['tools:read']));
    expect(decision.allowed).toBe(true);
  });

  it('auto-denies a registered MCP tool outside the active brain allowlist', async () => {
    registerKnownTools(['parse_hs', 'compile_holoscript']);
    const decision = await runCheck('compile_holoscript', {
      ...httpCtx(['tools:write']),
      frameDeclaration: {
        domain: 'holoscript-language',
        horizon: '2026-07',
        capability_tier: 2,
        trust_tier: 2,
        allowed_tools: ['parse_hs'],
        denied_domains: [],
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.check).toBe(FRAME_DECLARATION_CHECK_ID);
    expect(decision.reason).toContain('frame_violation');
    expect(decision.violation).toMatchObject({
      event: 'frame_violation',
      violationType: 'tool_not_allowed',
      tool: 'compile_holoscript',
    });
  });

  it('allows a registered MCP tool inside the active brain allowlist', async () => {
    registerKnownTools(['parse_hs']);
    const decision = await runCheck('parse_hs', {
      ...httpCtx(['tools:read']),
      frameDeclaration: {
        domain: 'holoscript-language',
        horizon: '2026-07',
        capability_tier: 2,
        trust_tier: 2,
        allowed_tools: ['parse_hs'],
        denied_domains: [],
      },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.check).toBe(FOUNDER_GATE_X402_CHECK_ID);
  });

  it('fails closed when frame metadata is present but malformed', async () => {
    registerKnownTools(['parse_hs']);
    const decision = await runCheck('parse_hs', {
      ...httpCtx(['tools:read']),
      frameDeclaration: null,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.check).toBe(FRAME_DECLARATION_CHECK_ID);
    expect(decision.violation?.violationType).toBe('undeclared_frame');
  });

  it('REGRESSION: no live scope-mapped tool name is founder-denied (behavior-neutral surface)', async () => {
    const scopes = ['tools:read', 'tools:write', 'tools:admin', 'tools:codebase', 'tools:browser'];
    const liveNames = [...new Set(scopes.flatMap((scope) => getToolsForScope(scope)))];
    expect(liveNames.length).toBeGreaterThan(100); // sanity: the live map is loaded

    const founderDenied: string[] = [];
    for (const name of liveNames) {
      const decision = await runCheck(name, stdioCtx);
      if (!decision.allowed && decision.check === FOUNDER_GATE_CHECK_ID) {
        founderDenied.push(name);
      }
    }
    expect(founderDenied).toEqual([]);
  });

  it('end-to-end: gateToolCall denies pre-dispatch with ToolCallGateDeniedError', async () => {
    registerKnownTools(['parse_holo']);
    let dispatched = false;

    await expect(
      gateToolCall(
        { name: 'spoofed_tool_name', args: {} },
        stdioCtx,
        async () => {
          dispatched = true;
          return {};
        },
        { check: founderGateX402ToolCallCheck }
      )
    ).rejects.toBeInstanceOf(ToolCallGateDeniedError);

    expect(dispatched).toBe(false);
  });

  it('persists frame_violation in the central gate receipt', async () => {
    registerKnownTools(['parse_hs', 'compile_holoscript']);
    const receiptPath = process.env.HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH!;
    fs.rmSync(receiptPath, { force: true });

    await expect(
      gateToolCall(
        { name: 'compile_holoscript', args: {} },
        {
          ...httpCtx(['tools:write']),
          frameDeclaration: {
            domain: 'holoscript-language',
            horizon: '2026-07',
            capability_tier: 2,
            trust_tier: 2,
            allowed_tools: ['parse_hs'],
            denied_domains: [],
          },
        },
        async () => ({}),
        { check: founderGateX402ToolCallCheck }
      )
    ).rejects.toBeInstanceOf(ToolCallGateDeniedError);

    const [receipt] = fs
      .readFileSync(receiptPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(receipt.frameViolation).toMatchObject({
      event: 'frame_violation',
      violationType: 'tool_not_allowed',
      tool: 'compile_holoscript',
    });
  });
});
