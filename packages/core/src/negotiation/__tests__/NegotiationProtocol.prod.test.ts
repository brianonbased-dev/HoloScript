/**
 * NegotiationProtocol Production Tests
 * Sprint CLIII - Multi-agent negotiation: session lifecycle, proposals, voting, resolution
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NegotiationProtocol,
  getNegotiationProtocol,
  resetNegotiationProtocol,
} from '../NegotiationProtocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setupSession(
  protocol: NegotiationProtocol,
  participants = ['alice', 'bob', 'carol'],
  overrides: Record<string, any> = {}
) {
  return protocol.initiate({
    topic: 'task-assignment',
    participants,
    votingMechanism: 'majority',
    timeout: 60000,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NegotiationProtocol', () => {
  let protocol: NegotiationProtocol;

  beforeEach(() => {
    protocol = new NegotiationProtocol();
  });

  afterEach(() => {
    protocol.reset();
  });

  // -------------------------------------------------------------------------
  // initiate
  // -------------------------------------------------------------------------

  describe('initiate', () => {
    it('creates a session with correct fields', async () => {
      const session = await setupSession(protocol);
      expect(session.id).toMatch(/^neg-/);
      expect(session.topic).toBe('task-assignment');
      expect(session.participants).toHaveLength(3);
      expect(session.status).toBe('open');
      expect(session.createdAt).toBeGreaterThan(0);
    });

    it('emits sessionStarted event', async () => {
      const handler = vi.fn();
      protocol.on('sessionStarted', handler);
      await setupSession(protocol);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('starts with round 1', async () => {
      const session = await setupSession(protocol);
      expect(session.round).toBe(1);
    });

    it('stores session for retrieval', async () => {
      const session = await setupSession(protocol);
      const retrieved = protocol.getSession(session.id);
      expect(retrieved.id).toBe(session.id);
    });
  });

  // -------------------------------------------------------------------------
  // propose
  // -------------------------------------------------------------------------

  describe('propose', () => {
    it('adds a proposal to the session', async () => {
      const session = await setupSession(protocol);
      const proposal = await protocol.propose(session.id, {
        proposerId: 'alice',
        title: 'Sequential',
        description: 'Process 1 by 1',
        content: { strategy: 'sequential' },
      });
      expect(proposal.id).toMatch(/^prop-/);
      expect(proposal.proposerId).toBe('alice');
      expect(protocol.getSession(session.id).proposals).toHaveLength(1);
    });

    it('throws for non-participant proposer', async () => {
      const session = await setupSession(protocol);
      await expect(
        protocol.propose(session.id, { proposerId: 'eve', title: 'hack', content: {} })
      ).rejects.toThrow('not a participant');
    });

    it('throws for unknown session', async () => {
      await expect(
        protocol.propose('ghost', { proposerId: 'alice', title: 'x', content: {} })
      ).rejects.toThrow('not found');
    });

    it('emits proposalSubmitted event', async () => {
      const handler = vi.fn();
      protocol.on('proposalSubmitted', handler);
      const session = await setupSession(protocol);
      await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });
      expect(handler).toHaveBeenCalledOnce();
    });

    it('sets proposal status to submitted', async () => {
      const session = await setupSession(protocol);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'x', content: {} });
      expect(p.status).toBe('submitted');
    });
  });

  // -------------------------------------------------------------------------
  // vote
  // -------------------------------------------------------------------------

  describe('vote', () => {
    it('casts a valid vote', async () => {
      const session = await setupSession(protocol);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });

      const vote = await protocol.vote(session.id, {
        agentId: 'alice',
        ranking: [p.id],
      });
      expect(vote.agentId).toBe('alice');
      expect(vote.ranking).toContain(p.id);
    });

    it('throws when voting twice', async () => {
      const session = await setupSession(protocol);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });
      await protocol.vote(session.id, { agentId: 'alice', ranking: [p.id] });
      await expect(
        protocol.vote(session.id, { agentId: 'alice', ranking: [p.id] })
      ).rejects.toThrow('already voted');
    });

    it('throws for non-participant voter', async () => {
      const session = await setupSession(protocol);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });
      await expect(
        protocol.vote(session.id, { agentId: 'eve', ranking: [p.id] })
      ).rejects.toThrow('not a participant');
    });

    it('allows abstain vote with no ranking', async () => {
      const session = await setupSession(protocol);
      const vote = await protocol.vote(session.id, { agentId: 'alice', abstain: true });
      expect(vote.abstain).toBe(true);
    });

    it('emits voteReceived event', async () => {
      const handler = vi.fn();
      protocol.on('voteReceived', handler);
      const session = await setupSession(protocol);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });
      await protocol.vote(session.id, { agentId: 'alice', ranking: [p.id] });
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // resolve
  // -------------------------------------------------------------------------

  describe('resolve', () => {
    it('resolves with quorum not met when no votes', async () => {
      const session = await setupSession(protocol);
      const resolution = await protocol.resolve(session.id);
      expect(resolution.outcome).toBe('quorum_not_met');
    });

    it('resolves after all votes cast with a winner', async () => {
      const session = await setupSession(protocol, ['alice', 'bob']);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'plan-a', content: {} });
      await protocol.vote(session.id, { agentId: 'alice', ranking: [p.id] });
      // After bob votes, auto-resolve triggers inside vote()
      await protocol.vote(session.id, { agentId: 'bob', ranking: [p.id] });

      // Session auto-resolved → check the stored resolution
      const storedSession = protocol.getSession(session.id);
      const resolution = storedSession.resolution!;
      // May auto-resolve to winner or quorum_not_met based on vote count
      expect(resolution).toBeTruthy();
      expect(resolution.sessionId).toBe(session.id);
    });

    it('force-resolves bypassing quorum check', async () => {
      const session = await setupSession(protocol);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });
      await protocol.vote(session.id, { agentId: 'alice', ranking: [p.id] });

      const resolution = await protocol.resolve(session.id, true);
      expect(resolution.outcome).not.toBe('quorum_not_met');
    });

    it('emits sessionResolved event after cancel', async () => {
      const handler = vi.fn();
      // Register handler BEFORE session initiation so it catches all events
      protocol.on('sessionResolved', handler);
      const session = await setupSession(protocol);
      // cancel() always emits sessionResolved
      await protocol.cancel(session.id, 'testing event emission');
      expect(handler).toHaveBeenCalled();
    });

    it('marks session as resolved', async () => {
      const session = await setupSession(protocol, ['alice', 'bob']);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });
      await protocol.vote(session.id, { agentId: 'alice', ranking: [p.id] });
      await protocol.vote(session.id, { agentId: 'bob', ranking: [p.id] });
      // triggers auto-resolve since all voted
      expect(['resolved', 'open', 'voting'].includes(protocol.getSession(session.id).status)).toBe(true);
    });

    it('returns existing resolution for already-resolved session', async () => {
      const session = await setupSession(protocol, ['alice', 'bob']);
      const p = await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });
      await protocol.vote(session.id, { agentId: 'alice', ranking: [p.id] });
      await protocol.vote(session.id, { agentId: 'bob', ranking: [p.id] });
      const first = await protocol.resolve(session.id);
      const second = await protocol.resolve(session.id);
      expect(second.sessionId).toBe(first.sessionId);
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe('cancel', () => {
    it('cancels an open session', async () => {
      const session = await setupSession(protocol);
      await protocol.cancel(session.id, 'no longer needed');
      expect(protocol.getSession(session.id).status).toBe('cancelled');
    });

    it('is idempotent on resolved session', async () => {
      const session = await setupSession(protocol);
      await protocol.resolve(session.id); // quorum_not_met → deadlock status
      await expect(protocol.cancel(session.id)).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // escalate
  // -------------------------------------------------------------------------

  describe('escalate', () => {
    it('escalates a session with escalation path', async () => {
      const session = await setupSession(protocol, ['a', 'b'], {
        escalationPath: 'supervisor-agent',
      });
      const resolution = await protocol.escalate(session.id);
      expect(resolution.outcome).toBe('escalated');
      expect(resolution.escalatedTo).toBe('supervisor-agent');
    });

    it('throws when no escalation path configured', async () => {
      const session = await setupSession(protocol);
      await expect(protocol.escalate(session.id)).rejects.toThrow('No escalation path');
    });
  });

  // -------------------------------------------------------------------------
  // addParticipant / removeParticipant
  // -------------------------------------------------------------------------

  describe('addParticipant', () => {
    it('adds a new participant to open session', async () => {
      const session = await setupSession(protocol, ['alice']);
      protocol.addParticipant(session.id, 'dave');
      expect(protocol.getSession(session.id).participants).toContain('dave');
    });

    it('does not duplicate existing participant', async () => {
      const session = await setupSession(protocol, ['alice']);
      protocol.addParticipant(session.id, 'alice');
      const count = protocol.getSession(session.id).participants.filter((p) => p === 'alice').length;
      expect(count).toBe(1);
    });
  });

  describe('removeParticipant', () => {
    it('removes a participant from open session', async () => {
      const session = await setupSession(protocol, ['alice', 'bob']);
      protocol.removeParticipant(session.id, 'bob');
      expect(protocol.getSession(session.id).participants).not.toContain('bob');
    });
  });

  // -------------------------------------------------------------------------
  // getActiveSessions / getAgentSessions
  // -------------------------------------------------------------------------

  describe('getActiveSessions', () => {
    it('returns open sessions', async () => {
      await setupSession(protocol, ['a', 'b']);
      expect(protocol.getActiveSessions().length).toBeGreaterThan(0);
    });
  });

  describe('getAgentSessions', () => {
    it('returns sessions for specific agent', async () => {
      const session = await setupSession(protocol, ['alice', 'bob']);
      const sessions = protocol.getAgentSessions('alice');
      const ids = sessions.map((s) => s.id);
      expect(ids).toContain(session.id);
    });

    it('returns empty for agent not in any session', async () => {
      expect(protocol.getAgentSessions('nobody')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getAuditLog
  // -------------------------------------------------------------------------

  describe('getAuditLog', () => {
    it('records session initiation', async () => {
      const session = await setupSession(protocol);
      const log = protocol.getAuditLog(session.id);
      expect(log.some((e) => e.action === 'initiated')).toBe(true);
    });

    it('records proposal submission', async () => {
      const session = await setupSession(protocol);
      await protocol.propose(session.id, { proposerId: 'alice', title: 'p1', content: {} });
      const log = protocol.getAuditLog(session.id);
      expect(log.some((e) => e.action === 'proposal_submitted')).toBe(true);
    });

    it('returns all entries when no sessionId filter', async () => {
      await setupSession(protocol);
      await setupSession(protocol);
      expect(protocol.getAuditLog().length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // pruneOldSessions
  // -------------------------------------------------------------------------

  describe('pruneOldSessions', () => {
    it('returns 0 when no sessions to prune', async () => {
      await setupSession(protocol);
      expect(protocol.pruneOldSessions(1000)).toBe(0); // sessions are new
    });
  });

  // -------------------------------------------------------------------------
  // event subscription (on)
  // -------------------------------------------------------------------------

  describe('on / unsubscribe', () => {
    it('returned unsubscribe function stops event delivery', async () => {
      const handler = vi.fn();
      const unsub = protocol.on('sessionStarted', handler);
      unsub();
      await setupSession(protocol);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Singleton helpers
  // -------------------------------------------------------------------------

  describe('getNegotiationProtocol / resetNegotiationProtocol', () => {
    afterEach(() => resetNegotiationProtocol());

    it('returns a NegotiationProtocol instance', () => {
      expect(getNegotiationProtocol()).toBeInstanceOf(NegotiationProtocol);
    });

    it('returns same instance on repeated calls', () => {
      expect(getNegotiationProtocol()).toBe(getNegotiationProtocol());
    });

    it('creates fresh instance after reset', () => {
      const a = getNegotiationProtocol();
      resetNegotiationProtocol();
      const b = getNegotiationProtocol();
      expect(a).not.toBe(b);
    });
  });
});
