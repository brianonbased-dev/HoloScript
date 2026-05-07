/**
 * Tests for agent-negotiation.ts (task_1778114573371_xsp6).
 *
 * Coverage targets per task description:
 *  - state machine: quote / accept / reject / execute / settle / dispute
 *  - reference flow: A request_quote -> B quote -> A accept -> B execute -> co-signed settle
 *  - rejection path
 *  - dispute path (from settled and from executed)
 *  - illegal-transition rejection
 *  - wrong-actor rejection (responder cannot accept their own quote, etc.)
 *  - terminal-state rejection (no double-settle, no transition out of rejected)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  NEGOTIATION_PROTOCOL,
  TERMINAL_STATES,
  _resetNegotiations,
  advanceNegotiation,
  checkTransition,
  createNegotiation,
  getNegotiation,
  listNegotiationsForTeam,
  settleNegotiation,
  type NegotiationQuote,
} from '../agent-negotiation';

const TEAM_ID = 'team_test_xsp6';
const ALICE = 'agent_alice';
const BOB = 'agent_bob';
const CAROL = 'agent_carol';
const ALICE_ADDR = '0x000000000000000000000000000000000000aaaa';
const BOB_ADDR = '0x000000000000000000000000000000000000bbbb';

const VALID_QUOTE: NegotiationQuote = {
  toolName: 'analyze_code',
  description: 'Run holo_validate_quality on the named module.',
  price: 0.05,
  currency: 'USDC',
  slaSeconds: 60,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

function freshOpenNegotiation() {
  return createNegotiation({
    teamId: TEAM_ID,
    initiatorAgentId: ALICE,
    initiatorAgentName: 'alice',
    responderAgentId: BOB,
    responderAgentName: 'bob',
    request: { toolName: 'analyze_code', capabilityQuery: 'code-quality:typescript' },
    signerAddress: ALICE_ADDR,
  });
}

describe('agent-negotiation: state machine', () => {
  beforeEach(() => {
    _resetNegotiations();
  });

  it('exports the v1 protocol identifier', () => {
    expect(NEGOTIATION_PROTOCOL).toBe('holomesh.negotiation.v1');
  });

  it('lists terminal states correctly', () => {
    expect(TERMINAL_STATES.has('rejected')).toBe(true);
    expect(TERMINAL_STATES.has('settled')).toBe(true);
    expect(TERMINAL_STATES.has('disputed')).toBe(true);
    expect(TERMINAL_STATES.has('open')).toBe(false);
    expect(TERMINAL_STATES.has('quoted')).toBe(false);
  });

  it('checkTransition: legal open -> quoted by responder', () => {
    const r = checkTransition('open', 'quote', 'responder');
    expect(r.ok).toBe(true);
    expect(r.nextState).toBe('quoted');
  });

  it('checkTransition: rejects responder accepting own quote', () => {
    const r = checkTransition('quoted', 'accept', 'responder');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong-actor');
  });

  it('checkTransition: rejects illegal action from open', () => {
    const r = checkTransition('open', 'execute', 'responder');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('illegal-transition');
  });

  it('checkTransition: rejects transitions out of rejected (terminal)', () => {
    const r = checkTransition('rejected', 'accept', 'initiator');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('terminal-state');
  });

  it('checkTransition: settled is terminal except for dispute', () => {
    const r1 = checkTransition('settled', 'execute', 'responder');
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe('terminal-state');
    const r2 = checkTransition('settled', 'dispute', 'initiator');
    expect(r2.ok).toBe(true);
    expect(r2.nextState).toBe('disputed');
  });
});

describe('agent-negotiation: lifecycle', () => {
  beforeEach(() => {
    _resetNegotiations();
  });

  it('createNegotiation creates an open negotiation with seq=0 request_quote event', () => {
    const n = freshOpenNegotiation();
    expect(n.state).toBe('open');
    expect(n.events).toHaveLength(1);
    expect(n.events[0].action).toBe('request_quote');
    expect(n.events[0].seq).toBe(0);
    expect(n.events[0].authorRole).toBe('initiator');
    expect(n.events[0].signerAddress).toBe(ALICE_ADDR);
    expect(n.protocol).toBe(NEGOTIATION_PROTOCOL);
  });

  it('createNegotiation rejects self-trade', () => {
    expect(() =>
      createNegotiation({
        teamId: TEAM_ID,
        initiatorAgentId: ALICE,
        initiatorAgentName: 'alice',
        responderAgentId: ALICE,
        responderAgentName: 'alice',
        request: { toolName: 't', capabilityQuery: 'q' },
      }),
    ).toThrow(/distinct/);
  });

  it('getNegotiation and listNegotiationsForTeam find the created negotiation', () => {
    const n = freshOpenNegotiation();
    expect(getNegotiation(n.id)?.id).toBe(n.id);
    const list = listNegotiationsForTeam(TEAM_ID);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(n.id);
    expect(listNegotiationsForTeam('other-team')).toHaveLength(0);
  });

  it('reference flow: request_quote -> quote -> accept -> execute -> settle', () => {
    const n = freshOpenNegotiation();

    const r1 = advanceNegotiation({
      negotiationId: n.id,
      action: 'quote',
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      payload: { quote: VALID_QUOTE },
    });
    expect(r1.ok).toBe(true);
    expect(r1.negotiation?.state).toBe('quoted');
    expect(r1.negotiation?.quote?.price).toBe(0.05);

    const r2 = advanceNegotiation({
      negotiationId: n.id,
      action: 'accept',
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
    });
    expect(r2.ok).toBe(true);
    expect(r2.negotiation?.state).toBe('accepted');

    const r3 = advanceNegotiation({
      negotiationId: n.id,
      action: 'execute',
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      payload: { result: { findings: 7, score: 0.91 } },
    });
    expect(r3.ok).toBe(true);
    expect(r3.negotiation?.state).toBe('executed');

    const r4 = settleNegotiation({
      negotiationId: n.id,
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
      initiatorSignature: '0xinitsig',
      initiatorAddress: ALICE_ADDR,
      responderSignature: '0xrespsig',
      responderAddress: BOB_ADDR,
    });
    expect(r4.ok).toBe(true);
    expect(r4.negotiation?.state).toBe('settled');
    expect(r4.negotiation?.receipt).toBeDefined();
    expect(r4.negotiation?.receipt?.initiatorSignature).toBe('0xinitsig');
    expect(r4.negotiation?.receipt?.responderSignature).toBe('0xrespsig');
    expect(r4.negotiation?.receipt?.finalQuote.price).toBe(0.05);
    expect(r4.negotiation?.receipt?.resultHash).toMatch(/^0x[0-9a-f]{64}$/);

    // Five legal events: request_quote, quote, accept, execute, settle
    expect(r4.negotiation?.events.map((e) => e.action)).toEqual([
      'request_quote',
      'quote',
      'accept',
      'execute',
      'settle',
    ]);
  });

  it('allows responder to submit the co-signed settlement receipt', () => {
    const n = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n.id,
      action: 'quote',
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      payload: { quote: VALID_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'accept',
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'execute',
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      payload: { result: { ok: true } },
    });

    const r = settleNegotiation({
      negotiationId: n.id,
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      initiatorSignature: '0xinitsig',
      initiatorAddress: ALICE_ADDR,
      responderSignature: '0xrespsig',
      responderAddress: BOB_ADDR,
    });

    expect(r.ok).toBe(true);
    expect(r.negotiation?.state).toBe('settled');
    expect(r.event?.authorRole).toBe('responder');
  });

  it('reject path: initiator can reject a quote', () => {
    const n = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n.id,
      action: 'quote',
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      payload: { quote: VALID_QUOTE },
    });
    const r = advanceNegotiation({
      negotiationId: n.id,
      action: 'reject',
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
      payload: { reason: 'price too high' },
    });
    expect(r.ok).toBe(true);
    expect(r.negotiation?.state).toBe('rejected');
    // No further transitions allowed.
    const r2 = advanceNegotiation({
      negotiationId: n.id,
      action: 'accept',
      authorAgentId: ALICE,
    });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('terminal-state');
  });

  it('dispute path: from executed (skip-settle)', () => {
    const n = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n.id, action: 'quote', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { quote: VALID_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'accept', authorAgentId: ALICE, signerAddress: ALICE_ADDR,
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'execute', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { result: { ok: false } },
    });
    const r = advanceNegotiation({
      negotiationId: n.id,
      action: 'dispute',
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
      payload: { reason: 'output did not match SLA' },
    });
    expect(r.ok).toBe(true);
    expect(r.negotiation?.state).toBe('disputed');
  });

  it('dispute path: responder can dispute from executed', () => {
    const n = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n.id, action: 'quote', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { quote: VALID_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'accept', authorAgentId: ALICE, signerAddress: ALICE_ADDR,
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'execute', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { result: { ok: true } },
    });
    const r = advanceNegotiation({
      negotiationId: n.id,
      action: 'dispute',
      authorAgentId: BOB,
      signerAddress: BOB_ADDR,
      payload: { reason: 'initiator did not acknowledge receipt' },
    });
    expect(r.ok).toBe(true);
    expect(r.negotiation?.state).toBe('disputed');
    expect(r.event?.authorRole).toBe('responder');
  });

  it('dispute path: from settled', () => {
    const n = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n.id, action: 'quote', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { quote: VALID_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'accept', authorAgentId: ALICE, signerAddress: ALICE_ADDR,
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'execute', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { result: { ok: true } },
    });
    settleNegotiation({
      negotiationId: n.id, authorAgentId: ALICE, signerAddress: ALICE_ADDR,
      initiatorSignature: '0x1', initiatorAddress: ALICE_ADDR,
      responderSignature: '0x2', responderAddress: BOB_ADDR,
    });
    const r = advanceNegotiation({
      negotiationId: n.id, action: 'dispute', authorAgentId: ALICE, signerAddress: ALICE_ADDR,
      payload: { reason: 'reviewer flagged result post hoc' },
    });
    expect(r.ok).toBe(true);
    expect(r.negotiation?.state).toBe('disputed');
  });
});

describe('agent-negotiation: invariant enforcement', () => {
  beforeEach(() => {
    _resetNegotiations();
  });

  it('rejects accept before a quote is on the table', () => {
    const n = freshOpenNegotiation();
    const r = advanceNegotiation({
      negotiationId: n.id, action: 'accept', authorAgentId: ALICE,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('illegal-transition');
  });

  it('rejects responder accepting their own quote (wrong actor)', () => {
    const n = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n.id, action: 'quote', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { quote: VALID_QUOTE },
    });
    const r = advanceNegotiation({
      negotiationId: n.id, action: 'accept', authorAgentId: BOB, signerAddress: BOB_ADDR,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong-actor');
  });

  it('rejects third party (not a negotiation party)', () => {
    const n = freshOpenNegotiation();
    const r = advanceNegotiation({
      negotiationId: n.id, action: 'quote', authorAgentId: CAROL,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-a-party');
  });

  it('rejects malformed quote (missing required fields)', () => {
    const n = freshOpenNegotiation();
    const badQuote = { toolName: 'x', description: 'y', price: -1, currency: 'USD',
      slaSeconds: 10, expiresAt: VALID_QUOTE.expiresAt } as any;
    const r = advanceNegotiation({
      negotiationId: n.id, action: 'quote', authorAgentId: BOB,
      payload: { quote: badQuote },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/non-negative/);
  });

  it('rejects settle without prior execute', () => {
    const n = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n.id, action: 'quote', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { quote: VALID_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'accept', authorAgentId: ALICE, signerAddress: ALICE_ADDR,
    });
    // Note: no execute step — settle must fail.
    const r = settleNegotiation({
      negotiationId: n.id, authorAgentId: ALICE, signerAddress: ALICE_ADDR,
      initiatorSignature: '0x1', initiatorAddress: ALICE_ADDR,
      responderSignature: '0x2', responderAddress: BOB_ADDR,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/execute/);
  });

  it('rejects partial settle without mutating a receipt', () => {
    const n = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n.id, action: 'quote', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { quote: VALID_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'accept', authorAgentId: ALICE, signerAddress: ALICE_ADDR,
    });
    advanceNegotiation({
      negotiationId: n.id, action: 'execute', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { result: { ok: true } },
    });

    const r = advanceNegotiation({
      negotiationId: n.id,
      action: 'settle',
      authorAgentId: ALICE,
      signerAddress: ALICE_ADDR,
      payload: {
        partialReceipt: {
          initiatorSignature: '0xonly-one-leg',
          initiatorAddress: ALICE_ADDR,
        },
      },
    });

    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing-counter-signature');
    expect(getNegotiation(n.id)?.receipt).toBeUndefined();
    expect(getNegotiation(n.id)?.state).toBe('executed');
  });

  it('returns not-found for unknown negotiationId', () => {
    const r = advanceNegotiation({
      negotiationId: 'nego_does_not_exist', action: 'quote', authorAgentId: BOB,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-found');
  });

  it('produces deterministic resultHash from execute payload', () => {
    const n1 = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n1.id, action: 'quote', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { quote: VALID_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n1.id, action: 'accept', authorAgentId: ALICE, signerAddress: ALICE_ADDR,
    });
    advanceNegotiation({
      negotiationId: n1.id, action: 'execute', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { result: { findings: 7, score: 0.91 } },
    });
    const r1 = settleNegotiation({
      negotiationId: n1.id, authorAgentId: ALICE, signerAddress: ALICE_ADDR,
      initiatorSignature: '0x1', initiatorAddress: ALICE_ADDR,
      responderSignature: '0x2', responderAddress: BOB_ADDR,
    });

    // Build a second identical negotiation and confirm hash determinism.
    _resetNegotiations();
    const n2 = freshOpenNegotiation();
    advanceNegotiation({
      negotiationId: n2.id, action: 'quote', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { quote: VALID_QUOTE },
    });
    advanceNegotiation({
      negotiationId: n2.id, action: 'accept', authorAgentId: ALICE, signerAddress: ALICE_ADDR,
    });
    advanceNegotiation({
      negotiationId: n2.id, action: 'execute', authorAgentId: BOB,
      signerAddress: BOB_ADDR, payload: { result: { findings: 7, score: 0.91 } },
    });
    const r2 = settleNegotiation({
      negotiationId: n2.id, authorAgentId: ALICE, signerAddress: ALICE_ADDR,
      initiatorSignature: '0x1', initiatorAddress: ALICE_ADDR,
      responderSignature: '0x2', responderAddress: BOB_ADDR,
    });
    expect(r1.negotiation?.receipt?.resultHash).toBe(r2.negotiation?.receipt?.resultHash);
  });
});
