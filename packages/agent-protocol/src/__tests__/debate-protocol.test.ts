import { describe, it, expect } from 'vitest';
import { DebateOrchestrator } from '../debate-protocol';
import type { DebateParticipant, DebateJudge, Position, Challenge, Defense } from '../debate-protocol';
import type { AgentIdentity, DebateProtocolSpec } from '../index';

// =============================================================================
// MOCKS
// =============================================================================

const identity: AgentIdentity = {
  id: 'debate-test-001',
  name: 'DebateTestOrchestrator',
  domain: 'testing',
  version: '1.0.0',
  capabilities: ['debate'],
};

function makeParticipant(id: string, claim: string, confidence: number): DebateParticipant {
  return {
    agentId: id,
    propose: async (_topic: string): Promise<Position> => ({
      agentId: id,
      claim,
      reasoning: `${id} reasons`,
      confidence,
      evidence: [`${id}-evidence`],
    }),
    challenge: async (_topic: string, pos: Position): Promise<Challenge> => ({
      challengerId: id,
      targetAgentId: pos.agentId,
      objection: `${id} objects to ${pos.agentId}`,
      counterEvidence: [],
    }),
    defend: async (_topic: string, own: Position, ch: Challenge): Promise<Defense> => ({
      defenderId: id,
      response: `${id} defends against ${ch.challengerId}`,
      revisedConfidence: own.confidence,
      concessions: [],
    }),
    vote: async (_topic: string, positions: Position[]): Promise<string> => {
      // Vote for the position with highest confidence
      const best = positions.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
      return best.agentId;
    },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('DebateOrchestrator', () => {
  it('requires at least 2 participants', () => {
    const spec: DebateProtocolSpec = { rounds: 1, agents: ['a'], resolutionStrategy: 'majority' };
    expect(
      () => new DebateOrchestrator(identity, spec, [makeParticipant('a', 'claim', 0.8)])
    ).toThrow('at least 2 participants');
  });

  it('runs a majority-vote debate and picks a winner', async () => {
    const spec: DebateProtocolSpec = {
      rounds: 2,
      agents: ['alice', 'bob', 'carol'],
      resolutionStrategy: 'majority',
    };

    const participants = [
      makeParticipant('alice', 'Position A', 0.9),
      makeParticipant('bob', 'Position B', 0.5),
      makeParticipant('carol', 'Position C', 0.3),
    ];

    const orchestrator = new DebateOrchestrator(identity, spec, participants);
    const result = await orchestrator.run('What is the best approach?');

    expect(result.status).toBe('resolved');
    expect(result.rounds).toHaveLength(2);
    expect(result.resolution.strategy).toBe('majority');
    // Alice has highest confidence, so bob and carol vote for her
    expect(result.resolution.winner).toBe('alice');
  });

  it('runs a judge-based debate', async () => {
    const spec: DebateProtocolSpec = {
      rounds: 1,
      agents: ['p1', 'p2'],
      resolutionStrategy: 'judge',
    };

    const participants = [
      makeParticipant('p1', 'Claim 1', 0.7),
      makeParticipant('p2', 'Claim 2', 0.8),
    ];

    const judge: DebateJudge = {
      judge: async (_topic, _rounds) => ({
        winnerId: 'p2',
        reasoning: 'p2 had stronger evidence',
      }),
    };

    const orchestrator = new DebateOrchestrator(identity, spec, participants, judge);
    const result = await orchestrator.run('Judge debate');

    expect(result.status).toBe('resolved');
    expect(result.resolution.strategy).toBe('judge');
    expect(result.resolution.winner).toBe('p2');
    expect(result.resolution.judgeReasoning).toBe('p2 had stronger evidence');
  });

  it('runs a consensus debate — all confident agents converge', async () => {
    const spec: DebateProtocolSpec = {
      rounds: 1,
      agents: ['x', 'y'],
      resolutionStrategy: 'consensus',
    };

    // Both agents have equal high confidence — consensus should be reached
    const participants = [
      makeParticipant('x', 'Same idea', 0.9),
      makeParticipant('y', 'Same idea', 0.9),
    ];

    const orchestrator = new DebateOrchestrator(identity, spec, participants);
    const result = await orchestrator.run('Consensus test');

    expect(result.status).toBe('resolved');
    expect(result.resolution.strategy).toBe('consensus');
    expect(result.resolution.consensusReached).toBe(true);
  });

  it('throws if judge strategy used without a judge', async () => {
    const spec: DebateProtocolSpec = {
      rounds: 1,
      agents: ['a', 'b'],
      resolutionStrategy: 'judge',
    };

    const participants = [
      makeParticipant('a', 'Claim A', 0.5),
      makeParticipant('b', 'Claim B', 0.5),
    ];

    const orchestrator = new DebateOrchestrator(identity, spec, participants);
    await expect(orchestrator.run('No judge')).rejects.toThrow('requires a DebateJudge');
  });
});
