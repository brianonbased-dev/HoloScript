import { describe, it, expect } from 'vitest';
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
} from '../VotingMechanisms';
import type { Vote, Proposal, NegotiationConfig } from '../NegotiationTypes';

function vote(agentId: string, ranking: string[], weight = 1, approvals?: string[]): Vote {
  return { agentId, ranking, weight, timestamp: Date.now(), approvals };
}

function proposal(id: string, priority = 1, submittedAt = 0): Proposal {
  return {
    id,
    agentId: 'proposer',
    content: {},
    priority,
    status: 'submitted',
    submittedAt,
  } as Proposal;
}

const cfg = (overrides: Partial<NegotiationConfig> = {}): NegotiationConfig => ({
  mechanism: 'majority',
  ...overrides,
});

describe('Majority handler', () => {
  const pA = proposal('A');
  const pB = proposal('B');

  it('declares winner with >50%', () => {
    const votes = [vote('a1', ['A']), vote('a2', ['A']), vote('a3', ['B'])];
    const r = majorityHandler.count(votes, [pA, pB], cfg(), 1);
    expect(r.resolved).toBe(true);
    expect(r.winnerId).toBe('A');
    expect(r.outcome).toBe('winner_declared');
  });

  it('declares leader even without majority', () => {
    const pC = proposal('C');
    // A=2 (40%), B=1, C=2 → tie. Instead: A=3 (43%), B=2, C=2
    const votes = [
      vote('a1', ['A']),
      vote('a2', ['A']),
      vote('a3', ['A']),
      vote('a4', ['B']),
      vote('a5', ['B']),
      vote('a6', ['C']),
      vote('a7', ['C']),
    ];
    const r = majorityHandler.count(votes, [pA, pB, pC], cfg(), 1);
    expect(r.resolved).toBe(true);
    expect(r.winnerId).toBe('A');
  });

  it('resolves tie with tieBreaker=seniority', () => {
    const pEarly = proposal('X', 1, 100);
    const pLate = proposal('Y', 1, 200);
    const votes = [vote('a1', ['X']), vote('a2', ['Y'])];
    const r = majorityHandler.count(votes, [pEarly, pLate], cfg({ tieBreaker: 'seniority' }), 1);
    expect(r.winnerId).toBe('X');
    expect(r.tie).toBe(true);
  });

  it('resolves tie with tieBreaker=priority', () => {
    const pLow = proposal('X', 1, 100);
    const pHigh = proposal('Y', 99, 200);
    const votes = [vote('a1', ['X']), vote('a2', ['Y'])];
    const r = majorityHandler.count(votes, [pLow, pHigh], cfg({ tieBreaker: 'priority' }), 1);
    expect(r.winnerId).toBe('Y');
  });

  it('deadlocks on tie with tieBreaker=escalate', () => {
    const votes = [vote('a1', ['A']), vote('a2', ['B'])];
    const r = majorityHandler.count(votes, [pA, pB], cfg({ tieBreaker: 'escalate' }), 1);
    expect(r.resolved).toBe(false);
    expect(r.outcome).toBe('deadlock');
    expect(r.tie).toBe(true);
  });

  it('validates vote has ranking', () => {
    expect(majorityHandler.validateVote(vote('x', []), [pA])).toBe(false);
    expect(majorityHandler.validateVote(vote('x', ['A']), [pA])).toBe(true);
    expect(majorityHandler.validateVote(vote('x', ['ZZZ']), [pA])).toBe(false);
  });

  it('getRequiredQuorum defaults to 0.5', () => {
    expect(majorityHandler.getRequiredQuorum(cfg())).toBe(0.5);
    expect(majorityHandler.getRequiredQuorum(cfg({ quorum: 0.8 }))).toBe(0.8);
  });
});

describe('Supermajority handler', () => {
  const pA = proposal('A');
  const pB = proposal('B');

  it('resolves at ≥66.67%', () => {
    // 3 of 4 = 75%
    const votes = [vote('a1', ['A']), vote('a2', ['A']), vote('a3', ['A']), vote('a4', ['B'])];
    const r = supermajorityHandler.count(votes, [pA, pB], cfg(), 1);
    expect(r.resolved).toBe(true);
    expect(r.winnerId).toBe('A');
  });

  it('deadlocks below 66.67%', () => {
    // 2 of 3 = 66.66% < 66.67%
    const votes = [vote('a1', ['A']), vote('a2', ['A']), vote('a3', ['B'])];
    const r = supermajorityHandler.count(votes, [pA, pB], cfg(), 1);
    expect(r.resolved).toBe(false);
    expect(r.outcome).toBe('deadlock');
  });

  it('getRequiredQuorum defaults to 0.67', () => {
    expect(supermajorityHandler.getRequiredQuorum(cfg())).toBe(0.67);
  });
});

describe('Consensus handler', () => {
  const pA = proposal('A');
  const pB = proposal('B');

  it('reaches consensus when all agree', () => {
    const votes = [vote('a1', ['A']), vote('a2', ['A']), vote('a3', ['A'])];
    const r = consensusHandler.count(votes, [pA, pB], cfg(), 1);
    expect(r.resolved).toBe(true);
    expect(r.outcome).toBe('consensus_reached');
    expect(r.consensusLevel).toBe(1.0);
  });

  it('deadlocks with dissenters', () => {
    const votes = [vote('a1', ['A']), vote('a2', ['B'])];
    const r = consensusHandler.count(votes, [pA, pB], cfg(), 1);
    expect(r.resolved).toBe(false);
    expect(r.dissenters?.length).toBeGreaterThan(0);
  });

  it('deadlocks on empty votes', () => {
    const r = consensusHandler.count([], [pA], cfg(), 1);
    expect(r.resolved).toBe(false);
    expect(r.outcome).toBe('deadlock');
  });

  it('requires 1.0 quorum', () => {
    expect(consensusHandler.getRequiredQuorum(cfg())).toBe(1.0);
  });
});

describe('Ranked choice handler', () => {
  const pA = proposal('A');
  const pB = proposal('B');
  const pC = proposal('C');

  it('instant win with initial majority', () => {
    const votes = [vote('a1', ['A']), vote('a2', ['A']), vote('a3', ['B'])];
    const r = rankedHandler.count(votes, [pA, pB, pC], cfg(), 1);
    expect(r.resolved).toBe(true);
    expect(r.winnerId).toBe('A');
  });

  it('eliminates lowest and redistributes', () => {
    // A=2, B=2, C=1 → C eliminated → C voters had 2nd choice B
    const votes = [
      vote('a1', ['A', 'B']),
      vote('a2', ['A', 'B']),
      vote('a3', ['B', 'A']),
      vote('a4', ['B', 'A']),
      vote('a5', ['C', 'B', 'A']),
    ];
    const r = rankedHandler.count(votes, [pA, pB, pC], cfg(), 1);
    expect(r.resolved).toBe(true);
    expect(r.winnerId).toBe('B'); // B gets C's vote → 3 vs 2
    expect(r.eliminated).toContain('C');
  });

  it('validates all ranking entries', () => {
    expect(rankedHandler.validateVote(vote('x', ['A', 'B']), [pA, pB])).toBe(true);
    expect(rankedHandler.validateVote(vote('x', ['A', 'ZZZ']), [pA, pB])).toBe(false);
    expect(rankedHandler.validateVote(vote('x', []), [pA])).toBe(false);
  });
});

describe('Approval handler', () => {
  const pA = proposal('A');
  const pB = proposal('B');
  const pC = proposal('C');

  it('counts multiple approvals per voter', () => {
    const votes = [
      vote('a1', ['A', 'B'], 1, ['A', 'B']),
      vote('a2', ['B', 'C'], 1, ['B', 'C']),
      vote('a3', ['A'], 1, ['A']),
    ];
    const r = approvalHandler.count(votes, [pA, pB, pC], cfg(), 1);
    expect(r.resolved).toBe(true);
    // B has 2 approvals, A has 2, C has 1 — tie between A and B
    // Without specific tie-breaker, first in sort wins
  });

  it('falls back to ranking if no approvals field', () => {
    const votes = [vote('a1', ['A']), vote('a2', ['A', 'B'])];
    const r = approvalHandler.count(votes, [pA, pB], cfg(), 1);
    expect(r.resolved).toBe(true);
    expect(r.winnerId).toBe('A');
  });
});

describe('Borda handler', () => {
  const pA = proposal('A');
  const pB = proposal('B');
  const pC = proposal('C');

  it('awards points by rank (n-1, n-2, ...)', () => {
    // 3 proposals: 1st=2pts, 2nd=1pt, 3rd=0pts
    const votes = [
      vote('a1', ['A', 'B', 'C']),
      vote('a2', ['B', 'A', 'C']),
      vote('a3', ['A', 'C', 'B']),
    ];
    const r = bordaHandler.count(votes, [pA, pB, pC], cfg(), 1);
    expect(r.resolved).toBe(true);
    expect(r.winnerId).toBe('A');
    // A: 2+1+2=5pts, B: 1+2+0=3pts, C: 0+0+1=1pt
    const tallyA = r.tallies.find((t) => t.proposalId === 'A');
    expect(tallyA?.bordaPoints).toBe(5);
  });

  it('handles weights', () => {
    // Weight 2 voter boosts their choice
    const votes = [vote('a1', ['A', 'B'], 2), vote('a2', ['B', 'A'], 1)];
    const r = bordaHandler.count(votes, [pA, pB], cfg(), 1);
    // A: 1*2 + 0*1 = 2, B: 0*2 + 1*1 = 1
    expect(r.winnerId).toBe('A');
  });
});

describe('getVotingHandler', () => {
  it.each([
    'majority',
    'supermajority',
    'weighted',
    'consensus',
    'ranked',
    'approval',
    'borda',
  ] as const)('returns handler for %s', (mechanism) => {
    const handler = getVotingHandler(mechanism);
    expect(handler.count).toBeDefined();
    expect(handler.validateVote).toBeDefined();
    expect(handler.getRequiredQuorum).toBeDefined();
  });

  it('defaults to majority for custom/unknown', () => {
    expect(getVotingHandler('custom')).toBe(majorityHandler);
  });
});

describe('checkQuorum', () => {
  it('returns true when participation meets requirement', () => {
    const votes = [vote('a1', ['A']), vote('a2', ['A'])];
    expect(checkQuorum(votes, 4, cfg({ quorum: 0.5 }), 'majority')).toBe(true);
  });

  it('returns false when participation below requirement', () => {
    const votes = [vote('a1', ['A'])];
    expect(checkQuorum(votes, 4, cfg({ quorum: 0.5 }), 'majority')).toBe(false);
  });

  it('handles zero participants', () => {
    expect(checkQuorum([], 0, cfg(), 'majority')).toBe(false);
  });
});

describe('getTrustWeight', () => {
  it('returns correct weights', () => {
    expect(getTrustWeight('local')).toBe(1.0);
    expect(getTrustWeight('verified')).toBe(0.8);
    expect(getTrustWeight('external')).toBe(0.5);
  });
});
