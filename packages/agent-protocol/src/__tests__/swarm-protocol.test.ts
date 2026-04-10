import { describe, it, expect } from 'vitest';
import { SwarmOrchestrator } from '../swarm-protocol';
import type { SwarmParticipant, Signal, Vote } from '../swarm-protocol';
import type { AgentIdentity, SwarmProtocolSpec } from '../index';

// =============================================================================
// MOCKS
// =============================================================================

const identity: AgentIdentity = {
  id: 'swarm-test-001',
  name: 'SwarmTestOrchestrator',
  domain: 'testing',
  version: '1.0.0',
  capabilities: ['swarm'],
};

function makeParticipant(
  id: string,
  proposal: unknown,
  initialStrength: number,
  voteStrategy: (signals: Signal[]) => Vote[]
): SwarmParticipant {
  return {
    agentId: id,
    propose: async (_task: string): Promise<Signal> => ({
      proposalId: `prop-${id}`,
      authorId: id,
      content: proposal,
      strength: initialStrength,
      timestamp: Date.now(),
    }),
    vote: async (_task: string, signals: Signal[]): Promise<Vote[]> => voteStrategy(signals),
  };
}

/** Simple strategy: amplify first signal, dampen all others */
function amplifyFirst(voterId: string, delta: number) {
  return (signals: Signal[]): Vote[] =>
    signals.map((s, i) => ({
      voterId,
      proposalId: s.proposalId,
      amplify: i === 0,
      delta,
    }));
}

/** Everyone amplifies every signal equally */
function amplifyAll(voterId: string, delta: number) {
  return (signals: Signal[]): Vote[] =>
    signals.map((s) => ({
      voterId,
      proposalId: s.proposalId,
      amplify: true,
      delta,
    }));
}

/** Everyone dampens every signal */
function dampenAll(voterId: string, delta: number) {
  return (signals: Signal[]): Vote[] =>
    signals.map((s) => ({
      voterId,
      proposalId: s.proposalId,
      amplify: false,
      delta,
    }));
}

// =============================================================================
// TESTS
// =============================================================================

describe('SwarmOrchestrator', () => {
  it('converges when all agents amplify one proposal', async () => {
    const spec: SwarmProtocolSpec = {
      quorum: 0.5,
      convergenceThreshold: 0.8,
      maxRounds: 10,
    };

    // Agent A proposes strongly, Agent B proposes weakly
    // Both amplify the first signal (Agent A's proposal)
    const participants = [
      makeParticipant('a', 'Good idea', 0.7, amplifyFirst('a', 0.2)),
      makeParticipant('b', 'Weak idea', 0.3, amplifyFirst('b', 0.2)),
    ];

    const orchestrator = new SwarmOrchestrator(identity, spec, participants, 0.95);
    const result = await orchestrator.run('Pick the best idea');

    expect(result.status).toBe('converged');
    expect(result.convergedProposal).not.toBeNull();
    expect(result.convergedProposal!.proposalId).toBe('prop-a');
    expect(result.totalRounds).toBeLessThanOrEqual(10);
  });

  it('reaches max rounds without convergence when signals are balanced', async () => {
    const spec: SwarmProtocolSpec = {
      quorum: 0.9, // very high quorum — hard to reach
      convergenceThreshold: 0.95,
      maxRounds: 3,
    };

    // Both agents amplify all signals equally — no differentiation
    const participants = [
      makeParticipant('a', 'Idea A', 0.5, amplifyAll('a', 0.05)),
      makeParticipant('b', 'Idea B', 0.5, amplifyAll('b', 0.05)),
    ];

    const orchestrator = new SwarmOrchestrator(identity, spec, participants, 0.95);
    const result = await orchestrator.run('Balanced debate');

    expect(result.status).toBe('max_rounds');
    expect(result.totalRounds).toBe(3);
    // Should still pick strongest as convergedProposal
    expect(result.convergedProposal).not.toBeNull();
  });

  it('quorum fails when all signals decay to zero', async () => {
    const spec: SwarmProtocolSpec = {
      quorum: 0.5,
      convergenceThreshold: 0.5,
      maxRounds: 10,
    };

    // Both agents dampen everything — signals will decay to nothing
    const participants = [
      makeParticipant('a', 'Bad', 0.2, dampenAll('a', 0.3)),
      makeParticipant('b', 'Also bad', 0.2, dampenAll('b', 0.3)),
    ];

    const orchestrator = new SwarmOrchestrator(identity, spec, participants, 0.5);
    const result = await orchestrator.run('Nothing works');

    expect(result.status).toBe('quorum_failed');
    expect(result.convergedProposal).toBeNull();
  });

  it('records all rounds with signals and votes', async () => {
    const spec: SwarmProtocolSpec = {
      quorum: 0.5,
      convergenceThreshold: 0.99, // unreachable
      maxRounds: 2,
    };

    const participants = [
      makeParticipant('a', 'X', 0.5, amplifyAll('a', 0.01)),
      makeParticipant('b', 'Y', 0.5, amplifyAll('b', 0.01)),
    ];

    const orchestrator = new SwarmOrchestrator(identity, spec, participants);
    const result = await orchestrator.run('Round tracking');

    expect(result.rounds).toHaveLength(2);
    for (const round of result.rounds) {
      expect(round.signals.length).toBeGreaterThan(0);
      expect(round.votes.length).toBeGreaterThan(0);
      expect(round.signalsAfterVoting.length).toBeGreaterThan(0);
    }
  });
});
