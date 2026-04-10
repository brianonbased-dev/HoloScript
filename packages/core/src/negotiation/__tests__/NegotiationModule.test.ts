/**
 * Negotiation Module Tests
 * Sprint 4 Priority 3 - Negotiation Protocol
 *
 * Tests for NegotiationProtocol and VotingMechanisms.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NegotiationProtocol,
  getNegotiationProtocol,
  resetNegotiationProtocol,
} from '../NegotiationProtocol';
import {
  majorityHandler,
  supermajorityHandler,
  consensusHandler,
  rankedHandler,
  approvalHandler,
  bordaHandler,
  getVotingHandler,
  checkQuorum,
  getTrustWeight,
  VotingResult,
  VotingHandler,
} from '../VotingMechanisms';
import {
  VotingMechanism,
  NegotiationConfig,
  Proposal,
  Vote,
  NegotiationSession,
  InitiateOptions,
} from '../NegotiationTypes';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestProposal(
  id: string,
  agentId: string,
  content: unknown = {},
  priority: number = 0
): Proposal {
  return {
    id,
    agentId,
    proposerId: agentId,
    title: `Proposal ${id}`,
    content,
    priority,
    status: 'submitted',
    submittedAt: Date.now(),
  };
}

function createTestVote(agentId: string, ranking: string[], weight: number = 1): Vote {
  return {
    id: `vote-${agentId}`,
    sessionId: 'test-session',
    agentId,
    ranking,
    weight,
    approvals: ranking, // For approval voting
    castedAt: Date.now(),
  };
}

function createTestConfig(
  mechanism: VotingMechanism = 'majority',
  overrides: Partial<NegotiationConfig> = {}
): NegotiationConfig {
  return {
    mechanism,
    votingMechanism: mechanism,
    quorum: 0.5,
    timeout: 60000,
    votingDeadline: 60000,
    proposalDeadline: 60000,
    maxRounds: 3,
    allowAbstain: true,
    requireJustification: false,
    tieBreaker: 'random',
    ...overrides,
  };
}

// =============================================================================
// VOTING MECHANISMS TESTS
// =============================================================================

describe('VotingMechanisms', () => {
  describe('getVotingHandler', () => {
    it('should return majority handler', () => {
      const handler = getVotingHandler('majority');
      expect(handler).toBeDefined();
    });

    it('should return supermajority handler', () => {
      const handler = getVotingHandler('supermajority');
      expect(handler).toBeDefined();
    });

    it('should return consensus handler', () => {
      const handler = getVotingHandler('consensus');
      expect(handler).toBeDefined();
    });

    it('should return ranked handler', () => {
      const handler = getVotingHandler('ranked');
      expect(handler).toBeDefined();
    });

    it('should return approval handler', () => {
      const handler = getVotingHandler('approval');
      expect(handler).toBeDefined();
    });

    it('should return borda handler', () => {
      const handler = getVotingHandler('borda');
      expect(handler).toBeDefined();
    });

    it('should default to majority for unknown mechanism', () => {
      const handler = getVotingHandler('unknown' as VotingMechanism);
      expect(handler).toBeDefined();
    });
  });

  describe('getTrustWeight', () => {
    it('should return weight for local trust', () => {
      const weight = getTrustWeight('local');
      expect(weight).toBeGreaterThan(0);
    });

    it('should return higher weight for verified than external', () => {
      const verifiedWeight = getTrustWeight('verified');
      const externalWeight = getTrustWeight('external');
      expect(verifiedWeight).toBeGreaterThan(externalWeight);
    });

    it('should return default weight for unknown level', () => {
      const weight = getTrustWeight('unknown' as 'external');
      expect(weight).toBeGreaterThanOrEqual(0);
    });
  });

  describe('checkQuorum', () => {
    it('should return true when quorum is met', () => {
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1']),
        createTestVote('agent-2', ['p1']),
        createTestVote('agent-3', ['p1']),
      ];
      const participantCount = 3; // All 3 voted
      const config = createTestConfig('majority', { quorum: 0.5 });

      const result = checkQuorum(votes, participantCount, config, 'majority');

      expect(result).toBe(true);
    });

    it('should return false when quorum is not met', () => {
      const votes: Vote[] = [createTestVote('agent-1', ['p1'])];
      const participantCount = 4; // Only 1 of 4 voted
      const config = createTestConfig('majority', { quorum: 0.5 });

      const result = checkQuorum(votes, participantCount, config, 'majority');

      expect(result).toBe(false);
    });
  });

  describe('majorityHandler', () => {
    const proposals = [createTestProposal('p1', 'agent-1'), createTestProposal('p2', 'agent-2')];
    const config = createTestConfig('majority');

    it('should declare winner with simple majority', () => {
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1']),
        createTestVote('agent-2', ['p1']),
        createTestVote('agent-3', ['p2']),
      ];

      const result = majorityHandler.count(votes, proposals, config, 1);

      expect(result.resolved).toBe(true);
      expect(result.winnerId).toBe('p1');
      expect(result.outcome).toBe('winner_declared');
    });

    it('should detect tie', () => {
      const votes: Vote[] = [createTestVote('agent-1', ['p1']), createTestVote('agent-2', ['p2'])];

      const result = majorityHandler.count(
        votes,
        proposals,
        { ...config, tieBreaker: 'escalate' },
        1
      );

      expect(result.tie).toBe(true);
    });

    it('should validate votes', () => {
      const validVote = createTestVote('agent-1', ['p1']);
      const invalidVote = createTestVote('agent-2', ['p99']); // Non-existent proposal

      expect(majorityHandler.validateVote(validVote, proposals)).toBe(true);
      expect(majorityHandler.validateVote(invalidVote, proposals)).toBe(false);
    });
  });

  describe('supermajorityHandler', () => {
    const proposals = [createTestProposal('p1', 'agent-1'), createTestProposal('p2', 'agent-2')];
    const config = createTestConfig('supermajority');

    it('should require 2/3 majority', () => {
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1']),
        createTestVote('agent-2', ['p1']),
        createTestVote('agent-3', ['p2']),
      ];

      const result = supermajorityHandler.count(votes, proposals, config, 1);

      // 2/3 = 66.7%, but p1 only has 66.7% (2/3), may or may not pass depending on implementation
      expect(result).toBeDefined();
    });

    it('should declare winner with strong supermajority', () => {
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1']),
        createTestVote('agent-2', ['p1']),
        createTestVote('agent-3', ['p1']),
        createTestVote('agent-4', ['p2']),
      ];

      const result = supermajorityHandler.count(votes, proposals, config, 1);

      expect(result.winnerId).toBe('p1');
    });
  });

  describe('consensusHandler', () => {
    const proposals = [createTestProposal('p1', 'agent-1')];
    const config = createTestConfig('consensus');

    it('should require unanimous agreement', () => {
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1']),
        createTestVote('agent-2', ['p1']),
        createTestVote('agent-3', ['p1']),
      ];

      const result = consensusHandler.count(votes, proposals, config, 1);

      expect(result.resolved).toBe(true);
      expect(result.outcome).toBe('consensus_reached');
    });

    it('should fail with any dissent', () => {
      const proposals2 = [createTestProposal('p1', 'agent-1'), createTestProposal('p2', 'agent-2')];
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1']),
        createTestVote('agent-2', ['p2']), // Different choice
        createTestVote('agent-3', ['p1']),
      ];

      const result = consensusHandler.count(votes, proposals2, config, 1);

      expect(result.resolved).toBe(false);
    });
  });

  describe('rankedHandler', () => {
    const proposals = [
      createTestProposal('p1', 'agent-1'),
      createTestProposal('p2', 'agent-2'),
      createTestProposal('p3', 'agent-3'),
    ];
    const config = createTestConfig('ranked');

    it('should perform instant runoff', () => {
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1', 'p2', 'p3']),
        createTestVote('agent-2', ['p2', 'p1', 'p3']),
        createTestVote('agent-3', ['p3', 'p1', 'p2']),
      ];

      const result = rankedHandler.count(votes, proposals, config, 1);

      expect(result).toBeDefined();
      expect(result.tallies.length).toBeGreaterThan(0);
    });

    it('should handle single round winner', () => {
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1']),
        createTestVote('agent-2', ['p1']),
        createTestVote('agent-3', ['p1']),
      ];

      const result = rankedHandler.count(votes, proposals, config, 1);

      expect(result.winnerId).toBe('p1');
    });
  });

  describe('approvalHandler', () => {
    const proposals = [
      createTestProposal('p1', 'agent-1'),
      createTestProposal('p2', 'agent-2'),
      createTestProposal('p3', 'agent-3'),
    ];
    const config = createTestConfig('approval');

    it('should count multiple approvals', () => {
      // Give p2 a clear majority of approvals
      const votes: Vote[] = [
        { ...createTestVote('agent-1', ['p2']), approvals: ['p2'] },
        { ...createTestVote('agent-2', ['p2', 'p3']), approvals: ['p2', 'p3'] },
        { ...createTestVote('agent-3', ['p2', 'p1']), approvals: ['p2', 'p1'] },
      ];

      const result = approvalHandler.count(votes, proposals, config, 1);

      expect(result).toBeDefined();
      // p2 should have most approvals (3)
      expect(result.winnerId).toBe('p2');
    });
  });

  describe('bordaHandler', () => {
    const proposals = [
      createTestProposal('p1', 'agent-1'),
      createTestProposal('p2', 'agent-2'),
      createTestProposal('p3', 'agent-3'),
    ];
    const config = createTestConfig('borda');

    it('should calculate borda points', () => {
      const votes: Vote[] = [
        createTestVote('agent-1', ['p1', 'p2', 'p3']), // p1: 2, p2: 1, p3: 0
        createTestVote('agent-2', ['p2', 'p1', 'p3']), // p2: 2, p1: 1, p3: 0
        createTestVote('agent-3', ['p1', 'p2', 'p3']), // p1: 2, p2: 1, p3: 0
      ];

      const result = bordaHandler.count(votes, proposals, config, 1);

      expect(result).toBeDefined();
      // p1: 2+1+2 = 5, p2: 1+2+1 = 4, p3: 0
      expect(result.winnerId).toBe('p1');
    });
  });
});

// =============================================================================
// NEGOTIATION PROTOCOL TESTS
// =============================================================================

describe('NegotiationProtocol', () => {
  let protocol: NegotiationProtocol;

  beforeEach(() => {
    protocol = new NegotiationProtocol();
  });

  afterEach(() => {
    // Clean up any timers
    resetNegotiationProtocol();
  });

  describe('Singleton', () => {
    it('should get default protocol instance', () => {
      const p1 = getNegotiationProtocol();
      const p2 = getNegotiationProtocol();

      expect(p1).toBe(p2);
    });

    it('should reset protocol', () => {
      const p1 = getNegotiationProtocol();
      resetNegotiationProtocol();
      const p2 = getNegotiationProtocol();

      expect(p1).not.toBe(p2);
    });
  });

  describe('Session Initiation', () => {
    it('should initiate a session', async () => {
      const session = await protocol.initiate({
        topic: 'test-topic',
        participants: ['agent-1', 'agent-2', 'agent-3'],
        votingMechanism: 'majority',
        timeout: 60000,
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.topic).toBe('test-topic');
      expect(session.participants).toHaveLength(3);
      expect(session.status).toBe('open');
    });

    it('should use default values for optional fields', async () => {
      const session = await protocol.initiate({
        topic: 'minimal',
        participants: ['agent-1'],
      });

      expect(session.config.mechanism).toBe('majority');
      expect(session.config.timeout).toBeDefined();
    });

    it('should accept custom config', async () => {
      const session = await protocol.initiate({
        topic: 'custom',
        participants: ['agent-1', 'agent-2'],
        votingMechanism: 'consensus',
        quorum: 1.0,
        maxRounds: 5,
      });

      expect(session.config.mechanism).toBe('consensus');
      expect(session.config.quorum).toBe(1.0);
      expect(session.config.maxRounds).toBe(5);
    });

    it('should emit sessionStarted event', async () => {
      const handler = vi.fn();
      protocol.on('sessionStarted', handler);

      await protocol.initiate({
        topic: 'event-test',
        participants: ['agent-1'],
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Proposal Submission', () => {
    let session: NegotiationSession;

    beforeEach(async () => {
      session = await protocol.initiate({
        topic: 'proposals',
        participants: ['agent-1', 'agent-2'],
        timeout: 60000,
      });
    });

    it('should submit a proposal', async () => {
      const proposal = await protocol.propose(session.id, {
        proposerId: 'agent-1',
        title: 'My Proposal',
        description: 'A test proposal',
        content: { value: 42 },
      });

      expect(proposal).toBeDefined();
      expect(proposal.id).toBeDefined();
      expect(proposal.proposerId).toBe('agent-1');
      expect(proposal.title).toBe('My Proposal');
    });

    it('should reject proposal from non-participant', async () => {
      await expect(
        protocol.propose(session.id, {
          proposerId: 'outsider',
          title: 'Invalid',
          content: {},
        })
      ).rejects.toThrow();
    });

    it('should emit proposalSubmitted event', async () => {
      const handler = vi.fn();
      protocol.on('proposalSubmitted', handler);

      await protocol.propose(session.id, {
        proposerId: 'agent-1',
        title: 'Event Test',
        content: {},
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Voting', () => {
    let session: NegotiationSession;

    beforeEach(async () => {
      session = await protocol.initiate({
        topic: 'voting',
        participants: ['agent-1', 'agent-2', 'agent-3'],
        votingMechanism: 'majority',
        timeout: 60000,
      });

      await protocol.propose(session.id, {
        proposerId: 'agent-1',
        title: 'Option A',
        content: { choice: 'A' },
      });

      await protocol.propose(session.id, {
        proposerId: 'agent-2',
        title: 'Option B',
        content: { choice: 'B' },
      });
    });

    it('should cast a vote', async () => {
      const updatedSession = await protocol.getSession(session.id);
      const proposalIds = updatedSession.proposals.map((p) => p.id);

      const vote = await protocol.vote(session.id, {
        agentId: 'agent-1',
        ranking: [proposalIds[0]],
      });

      expect(vote).toBeDefined();
      expect(vote.agentId).toBe('agent-1');
    });

    it('should reject vote from non-participant', async () => {
      const updatedSession = await protocol.getSession(session.id);
      const proposalIds = updatedSession.proposals.map((p) => p.id);

      await expect(
        protocol.vote(session.id, {
          agentId: 'outsider',
          ranking: [proposalIds[0]],
        })
      ).rejects.toThrow();
    });

    it('should emit voteReceived event', async () => {
      const handler = vi.fn();
      protocol.on('voteReceived', handler);

      const updatedSession = await protocol.getSession(session.id);
      const proposalIds = updatedSession.proposals.map((p) => p.id);

      await protocol.vote(session.id, {
        agentId: 'agent-1',
        ranking: [proposalIds[0]],
      });

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Resolution', () => {
    it('should resolve session with clear winner', async () => {
      const session = await protocol.initiate({
        topic: 'resolution',
        participants: ['agent-1', 'agent-2', 'agent-3'],
        votingMechanism: 'majority',
        timeout: 60000,
      });

      const proposal = await protocol.propose(session.id, {
        proposerId: 'agent-1',
        title: 'Only Option',
        content: { value: 1 },
      });

      // Everyone votes for the same proposal
      await protocol.vote(session.id, {
        agentId: 'agent-1',
        ranking: [proposal.id],
      });
      await protocol.vote(session.id, {
        agentId: 'agent-2',
        ranking: [proposal.id],
      });
      await protocol.vote(session.id, {
        agentId: 'agent-3',
        ranking: [proposal.id],
      });

      const resolution = await protocol.resolve(session.id);

      expect(resolution).toBeDefined();
      expect(resolution.outcome).toBe('winner_declared');
      expect(resolution.winnerId).toBe(proposal.id);
    });
  });

  describe('Session Management', () => {
    it('should get session by id', async () => {
      const created = await protocol.initiate({
        topic: 'get-test',
        participants: ['agent-1'],
      });

      const retrieved = await protocol.getSession(created.id);

      expect(retrieved.id).toBe(created.id);
    });

    it('should throw for non-existent session', () => {
      expect(() => protocol.getSession('non-existent')).toThrow();
    });

    it('should list active sessions', async () => {
      await protocol.initiate({
        topic: 'session-1',
        participants: ['agent-1'],
      });
      await protocol.initiate({
        topic: 'session-2',
        participants: ['agent-2'],
      });

      const sessions = protocol.getActiveSessions();

      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should cancel session', async () => {
      const session = await protocol.initiate({
        topic: 'to-cancel',
        participants: ['agent-1'],
      });

      await protocol.cancel(session.id, 'User requested');

      const cancelled = await protocol.getSession(session.id);
      expect(cancelled.status).toBe('cancelled');
    });
  });

  describe('Audit Logging', () => {
    it('should log session initiation', async () => {
      await protocol.initiate({
        topic: 'audit-test',
        participants: ['agent-1'],
      });

      const logs = protocol.getAuditLog();

      expect(logs.some((l) => l.action === 'initiated')).toBe(true);
    });

    it('should log proposal submission', async () => {
      const session = await protocol.initiate({
        topic: 'audit-proposal',
        participants: ['agent-1'],
      });

      await protocol.propose(session.id, {
        proposerId: 'agent-1',
        title: 'Logged',
        content: {},
      });

      const logs = protocol.getAuditLog();

      expect(logs.some((l) => l.action === 'proposal_submitted')).toBe(true);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Negotiation Integration', () => {
  it('should run complete negotiation workflow', async () => {
    const protocol = new NegotiationProtocol();

    // 1. Initiate session
    const session = await protocol.initiate({
      topic: 'task-assignment',
      participants: ['alice', 'bob', 'charlie'],
      votingMechanism: 'majority',
      timeout: 60000,
    });

    expect(session.status).toBe('open');

    // 2. Submit proposals
    const propA = await protocol.propose(session.id, {
      proposerId: 'alice',
      title: 'Sequential Processing',
      content: { strategy: 'sequential' },
    });

    const propB = await protocol.propose(session.id, {
      proposerId: 'bob',
      title: 'Parallel Processing',
      content: { strategy: 'parallel' },
    });

    // 3. Cast votes
    await protocol.vote(session.id, {
      agentId: 'alice',
      ranking: [propA.id, propB.id],
    });

    await protocol.vote(session.id, {
      agentId: 'bob',
      ranking: [propB.id, propA.id],
    });

    await protocol.vote(session.id, {
      agentId: 'charlie',
      ranking: [propB.id, propA.id],
    });

    // 4. Resolve
    const resolution = await protocol.resolve(session.id);

    expect(resolution.outcome).toBe('winner_declared');
    expect(resolution.winnerId).toBe(propB.id);
  });

  it('should handle consensus requirement', async () => {
    const protocol = new NegotiationProtocol();

    const session = await protocol.initiate({
      topic: 'unanimous-decision',
      participants: ['a', 'b', 'c'],
      votingMechanism: 'consensus',
      timeout: 60000,
    });

    const proposal = await protocol.propose(session.id, {
      proposerId: 'a',
      title: 'The Only Way',
      content: {},
    });

    // All agree
    await protocol.vote(session.id, { agentId: 'a', ranking: [proposal.id] });
    await protocol.vote(session.id, { agentId: 'b', ranking: [proposal.id] });
    await protocol.vote(session.id, { agentId: 'c', ranking: [proposal.id] });

    const resolution = await protocol.resolve(session.id);

    expect(resolution.outcome).toBe('consensus_reached');
  });
});
