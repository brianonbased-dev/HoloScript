/**
 * Negotiation MCP tools — tests for the MCP-shape adapters that expose the
 * xsp6 / qe2i agent-negotiation primitives via standard MCP protocol
 * (task_1778175122619_xk5l).
 *
 * Coverage:
 *  - Tool registration (catalog + name predicate)
 *  - Happy path for each tool (request_quote, quote, accept, reject, execute,
 *    settle, dispute, list, get) — full cycle
 *  - G.GOLD.013 paired false-cases for state-mutating tools:
 *      * settle with wrong actor (not a party) → MCP error response
 *      * accept against the wrong state → illegal-transition
 *      * dispute against an unknown id → not-found
 *      * execute when caller is not the responder → wrong-actor
 *  - Chain-anchor settle path (useChainAnchor: true) returns deterministic
 *    anchor result with the EIP-712 hash + tx hash from MockSigner
 *    (F.041 / W.GOLD.514 echo).
 *
 * G.GOLD.013: every assertion compares against a literal expected value
 * (state names, role strings, terminal-state booleans), not a recomputed
 * expression of the input.
 * G.GOLD.015: tests target the failure categories that bite the ecosystem —
 * wrong-actor dispatch, terminal-state lockout, signature-coverage gaps,
 * canonicalization drift via the chain anchor.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleNegotiationTool,
  isNegotiationToolName,
  negotiationToolDefinitions,
} from '../negotiation-mcp-tools';
import {
  _resetNegotiations,
  type NegotiationQuote,
} from '../holomesh/agent-negotiation';

const TEAM_ID = 'team_test_xk5l';
const ALICE = 'agent_alice_xk5l';
const BOB = 'agent_bob_xk5l';
const CAROL = 'agent_carol_xk5l';
const ALICE_ADDR = '0x000000000000000000000000000000000000aaaa';
const BOB_ADDR = '0x000000000000000000000000000000000000bbbb';

const VALID_QUOTE: NegotiationQuote = {
  toolName: 'analyze_code',
  description: 'Run holo_validate_quality on the named module.',
  price: 5,
  currency: 'USDC',
  slaSeconds: 60,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

async function startCycle(opts: { id?: string } = {}) {
  return (await handleNegotiationTool('negotiation_request_quote', {
    teamId: TEAM_ID,
    initiatorAgentId: ALICE,
    initiatorAgentName: 'alice',
    responderAgentId: BOB,
    responderAgentName: 'bob',
    request: { toolName: 'analyze_code', capabilityQuery: 'code-quality:typescript' },
    signerAddress: ALICE_ADDR,
    ...(opts.id ? { id: opts.id } : {}),
  })) as { ok: boolean; negotiation?: { id: string; state: string }; event?: unknown; error?: string };
}

describe('negotiation MCP tool registration', () => {
  it('publishes nine tools with the documented names', () => {
    expect(negotiationToolDefinitions).toHaveLength(9);
    const names = negotiationToolDefinitions.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'negotiation_accept',
        'negotiation_dispute',
        'negotiation_execute',
        'negotiation_get',
        'negotiation_list',
        'negotiation_quote',
        'negotiation_reject',
        'negotiation_request_quote',
        'negotiation_settle',
      ].sort(),
    );
  });

  it('isNegotiationToolName recognizes the published tools and rejects others', () => {
    expect(isNegotiationToolName('negotiation_request_quote')).toBe(true);
    expect(isNegotiationToolName('negotiation_settle')).toBe(true);
    expect(isNegotiationToolName('negotiation_get')).toBe(true);
    expect(isNegotiationToolName('compile_to_unity')).toBe(false);
    expect(isNegotiationToolName('')).toBe(false);
  });

  it('input schemas declare required fields per tool', () => {
    const byName = new Map(negotiationToolDefinitions.map((t) => [t.name, t]));
    expect(
      (byName.get('negotiation_request_quote')!.inputSchema as { required?: string[] }).required,
    ).toContain('teamId');
    expect(
      (byName.get('negotiation_quote')!.inputSchema as { required?: string[] }).required,
    ).toContain('quote');
    expect(
      (byName.get('negotiation_settle')!.inputSchema as { required?: string[] }).required,
    ).toContain('initiatorSignature');
    expect(
      (byName.get('negotiation_dispute')!.inputSchema as { required?: string[] }).required,
    ).toContain('authorAgentId');
  });
});

describe('negotiation MCP tools — full happy-path cycle', () => {
  beforeEach(() => {
    _resetNegotiations();
  });

  it('completes request_quote → quote → accept → execute → settle, returning the receipt', async () => {
    // 1. request_quote: starts in 'open'
    const start = await startCycle();
    expect(start.ok).toBe(true);
    expect(start.negotiation?.state).toBe('open');
    const negotiationId = start.negotiation!.id;

    // 2. quote: open → quoted (responder)
    const q = (await handleNegotiationTool('negotiation_quote', {
      negotiationId,
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      quote: VALID_QUOTE,
    })) as { ok: boolean; negotiation?: { state: string; quote?: NegotiationQuote } };
    expect(q.ok).toBe(true);
    expect(q.negotiation?.state).toBe('quoted');
    expect(q.negotiation?.quote?.price).toBe(5);

    // 3. accept: quoted → accepted (initiator)
    const a = (await handleNegotiationTool('negotiation_accept', {
      negotiationId,
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
    })) as { ok: boolean; negotiation?: { state: string } };
    expect(a.ok).toBe(true);
    expect(a.negotiation?.state).toBe('accepted');

    // 4. execute: accepted → executed (responder posts result)
    const e = (await handleNegotiationTool('negotiation_execute', {
      negotiationId,
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      result: { score: 0.92 },
    })) as { ok: boolean; negotiation?: { state: string } };
    expect(e.ok).toBe(true);
    expect(e.negotiation?.state).toBe('executed');

    // 5. settle: executed → settled with both signatures
    const s = (await handleNegotiationTool('negotiation_settle', {
      negotiationId,
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
      initiatorSignature: '0xinitiator-sig',
      initiatorAddress: ALICE_ADDR,
      responderSignature: '0xresponder-sig',
      responderAddress: BOB_ADDR,
    })) as {
      ok: boolean;
      negotiation?: { state: string };
      receipt?: { initiatorAddress: string; responderAddress: string; protocol: string };
    };
    expect(s.ok).toBe(true);
    expect(s.negotiation?.state).toBe('settled');
    expect(s.receipt?.initiatorAddress).toBe(ALICE_ADDR);
    expect(s.receipt?.responderAddress).toBe(BOB_ADDR);
    expect(s.receipt?.protocol).toBe('holomesh.negotiation.v1');
  });

  it('reject path: quoted → rejected (terminal)', async () => {
    const start = await startCycle();
    const id = start.negotiation!.id;
    await handleNegotiationTool('negotiation_quote', {
      negotiationId: id,
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      quote: VALID_QUOTE,
    });
    const r = (await handleNegotiationTool('negotiation_reject', {
      negotiationId: id,
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
      reason: 'price too high',
    })) as { ok: boolean; negotiation?: { state: string } };
    expect(r.ok).toBe(true);
    expect(r.negotiation?.state).toBe('rejected');
  });

  it('dispute path from executed: skips settle and goes terminal', async () => {
    const start = await startCycle();
    const id = start.negotiation!.id;
    await handleNegotiationTool('negotiation_quote', {
      negotiationId: id,
      authorAgentId: BOB,
      quote: VALID_QUOTE,
    });
    await handleNegotiationTool('negotiation_accept', {
      negotiationId: id,
      authorAgentId: ALICE,
    });
    await handleNegotiationTool('negotiation_execute', {
      negotiationId: id,
      authorAgentId: BOB,
      result: { failed: true },
    });
    const d = (await handleNegotiationTool('negotiation_dispute', {
      negotiationId: id,
      authorAgentId: ALICE,
      reason: 'result diverged from contract',
    })) as { ok: boolean; negotiation?: { state: string } };
    expect(d.ok).toBe(true);
    expect(d.negotiation?.state).toBe('disputed');
  });

  it('negotiation_list returns negotiations for a team newest-first; negotiation_get fetches a known id', async () => {
    const a = await startCycle({ id: 'nego_test_a' });
    const b = await startCycle({ id: 'nego_test_b' });
    expect(a.ok && b.ok).toBe(true);

    const list = (await handleNegotiationTool('negotiation_list', {
      teamId: TEAM_ID,
      limit: 10,
    })) as { ok: boolean; count: number; negotiations: Array<{ id: string }> };
    expect(list.ok).toBe(true);
    expect(list.count).toBe(2);
    expect(new Set(list.negotiations.map((n) => n.id))).toEqual(
      new Set(['nego_test_a', 'nego_test_b']),
    );

    const got = (await handleNegotiationTool('negotiation_get', {
      negotiationId: 'nego_test_a',
    })) as { ok: boolean; negotiation?: { id: string } };
    expect(got.ok).toBe(true);
    expect(got.negotiation?.id).toBe('nego_test_a');
  });
});

describe('negotiation MCP tools — G.GOLD.013 paired false cases', () => {
  beforeEach(() => {
    _resetNegotiations();
  });

  it('settle by a non-party returns reason="not-a-party" (not a thrown error)', async () => {
    const start = await startCycle();
    const id = start.negotiation!.id;
    await handleNegotiationTool('negotiation_quote', {
      negotiationId: id,
      authorAgentId: BOB,
      quote: VALID_QUOTE,
    });
    await handleNegotiationTool('negotiation_accept', {
      negotiationId: id,
      authorAgentId: ALICE,
    });
    await handleNegotiationTool('negotiation_execute', {
      negotiationId: id,
      authorAgentId: BOB,
      result: { ok: true },
    });
    // Carol is not a party to this negotiation — must be rejected with
    // structured reason, NOT thrown.
    const s = (await handleNegotiationTool('negotiation_settle', {
      negotiationId: id,
      authorAgentId: CAROL,
      initiatorSignature: '0xx',
      initiatorAddress: ALICE_ADDR,
      responderSignature: '0xy',
      responderAddress: BOB_ADDR,
    })) as { ok: boolean; reason?: string; error?: string };
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('not-a-party');
    expect(typeof s.error).toBe('string');
  });

  it('accept against the wrong state (still in `open`, no quote yet) returns reason="illegal-transition"', async () => {
    const start = await startCycle();
    const id = start.negotiation!.id;
    const r = (await handleNegotiationTool('negotiation_accept', {
      negotiationId: id,
      authorAgentId: ALICE,
    })) as { ok: boolean; reason?: string };
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('illegal-transition');
  });

  it('execute by the initiator (not the responder) returns reason="wrong-actor"', async () => {
    const start = await startCycle();
    const id = start.negotiation!.id;
    await handleNegotiationTool('negotiation_quote', {
      negotiationId: id,
      authorAgentId: BOB,
      quote: VALID_QUOTE,
    });
    await handleNegotiationTool('negotiation_accept', {
      negotiationId: id,
      authorAgentId: ALICE,
    });
    const r = (await handleNegotiationTool('negotiation_execute', {
      negotiationId: id,
      authorAgentId: ALICE,
      result: { not: 'allowed' },
    })) as { ok: boolean; reason?: string };
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong-actor');
  });

  it('dispute against an unknown id returns reason="not-found"', async () => {
    const r = (await handleNegotiationTool('negotiation_dispute', {
      negotiationId: 'nego_does_not_exist',
      authorAgentId: ALICE,
    })) as { ok: boolean; reason?: string };
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-found');
  });

  it('request_quote with the same agent on both sides returns illegal-transition (not silent success)', async () => {
    const r = (await handleNegotiationTool('negotiation_request_quote', {
      teamId: TEAM_ID,
      initiatorAgentId: ALICE,
      initiatorAgentName: 'alice',
      responderAgentId: ALICE,
      responderAgentName: 'alice',
      request: { toolName: 'analyze_code', capabilityQuery: 'q' },
    })) as { ok: boolean; reason?: string; error?: string };
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('illegal-transition');
    expect(r.error).toMatch(/distinct/);
  });

  it('settle with missing required signature fields returns a structured error', async () => {
    const start = await startCycle();
    const id = start.negotiation!.id;
    const r = (await handleNegotiationTool('negotiation_settle', {
      negotiationId: id,
      authorAgentId: ALICE,
      initiatorSignature: '',
      initiatorAddress: '',
      responderSignature: '',
      responderAddress: '',
    })) as { ok: boolean; error?: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/required/);
  });
});

describe('negotiation MCP tools — chain-anchor settle (F.041 / W.GOLD.514)', () => {
  beforeEach(() => {
    _resetNegotiations();
  });

  it('useChainAnchor: true uses MockSigner and returns a deterministic anchor result', async () => {
    const start = await startCycle();
    const id = start.negotiation!.id;
    await handleNegotiationTool('negotiation_quote', {
      negotiationId: id,
      authorAgentId: BOB,
      quote: VALID_QUOTE,
    });
    await handleNegotiationTool('negotiation_accept', {
      negotiationId: id,
      authorAgentId: ALICE,
    });
    await handleNegotiationTool('negotiation_execute', {
      negotiationId: id,
      authorAgentId: BOB,
      result: { ok: true },
    });

    const FIXED_HASH = '0x' + 'aa'.repeat(32);
    const r = (await handleNegotiationTool('negotiation_settle', {
      negotiationId: id,
      authorAgentId: ALICE,
      initiatorSignature: '0xinitiator-sig',
      initiatorAddress: ALICE_ADDR,
      responderSignature: '0xresponder-sig',
      responderAddress: BOB_ADDR,
      useChainAnchor: true,
      mockChainAnchor: {
        address: '0x000000000000000000000000000000000000beef',
        chainId: 8453,
        fixedTxHash: FIXED_HASH,
      },
    })) as {
      ok: boolean;
      negotiation?: { state: string; receipt?: { settlementTxHash?: string } };
      anchor?: { eip712Hash: string; txHash: string; chainId: number; status: number | null };
    };

    expect(r.ok).toBe(true);
    expect(r.negotiation?.state).toBe('settled');
    expect(r.anchor?.txHash).toBe(FIXED_HASH);
    expect(r.anchor?.chainId).toBe(8453);
    expect(r.anchor?.status).toBe(1);
    // EIP-712 hash is 0x-prefixed 32-byte hex (66 chars total).
    expect(r.anchor?.eip712Hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(r.negotiation?.receipt?.settlementTxHash).toBe(FIXED_HASH);
  });
});
