import { describe, it, expect, beforeEach } from 'vitest';
import { VotingRound } from '../VotingRound';
import type { IHiveContribution } from '../../extensions';

function contribution(id: string, agentId = 'agent-1'): IHiveContribution {
  return {
    id,
    agentId,
    timestamp: Date.now(),
    type: 'idea',
    content: `Idea ${id}`,
    confidence: 0.8,
  };
}

describe('VotingRound', () => {
  let round: VotingRound;

  beforeEach(() => {
    round = new VotingRound();
  });

  it('starts open', () => {
    expect(round.isClosed()).toBe(false);
  });

  it('registerContribution adds to round', () => {
    round.registerContribution(contribution('c1'));
    const stats = round.getStatistics();
    expect(stats.totalContributions).toBe(1);
  });

  it('registerContribution throws when closed', () => {
    round.close();
    expect(() => round.registerContribution(contribution('c1'))).toThrow('closed');
  });

  it('castVote records vote', () => {
    round.registerContribution(contribution('c1'));
    round.castVote('c1', 'voter-1', 'support');
    const r = round.getResult('c1');
    expect(r?.supportVotes).toBe(1);
    expect(r?.opposeVotes).toBe(0);
  });

  it('castVote throws when closed', () => {
    round.registerContribution(contribution('c1'));
    round.close();
    expect(() => round.castVote('c1', 'voter-1', 'support')).toThrow('closed');
  });

  it('castVote throws for unregistered contribution', () => {
    expect(() => round.castVote('nope', 'voter-1', 'support')).toThrow('not registered');
  });

  it('castVote throws on duplicate vote', () => {
    round.registerContribution(contribution('c1'));
    round.castVote('c1', 'voter-1', 'support');
    expect(() => round.castVote('c1', 'voter-1', 'oppose')).toThrow('already voted');
  });

  it('oppose votes are counted', () => {
    round.registerContribution(contribution('c1'));
    round.castVote('c1', 'voter-1', 'oppose');
    const r = round.getResult('c1');
    expect(r?.opposeVotes).toBe(1);
    expect(r?.netScore).toBe(-1);
  });

  it('weightByConfidence applies voter confidence as weight', () => {
    round = new VotingRound({ weightByConfidence: true });
    round.registerContribution(contribution('c1'));
    round.castVote('c1', 'voter-1', 'support', 0.9);
    round.castVote('c1', 'voter-2', 'oppose', 0.3);
    const r = round.getResult('c1');
    expect(r?.weightedScore).toBeCloseTo(0.6);
  });

  it('getResult returns undefined for unknown contribution', () => {
    expect(round.getResult('nope')).toBeUndefined();
  });

  it('getAllResults sorts by weighted score', () => {
    round.registerContribution(contribution('c1'));
    round.registerContribution(contribution('c2'));
    round.castVote('c1', 'v1', 'support');
    round.castVote('c2', 'v1', 'support');
    round.castVote('c2', 'v2', 'support');
    const results = round.getAllResults();
    expect(results[0].contributionId).toBe('c2');
    expect(results[1].contributionId).toBe('c1');
  });

  it('hasSuperMajority returns true when threshold met', () => {
    round = new VotingRound({ superMajorityThreshold: 0.5, minVotesRequired: 2 });
    round.registerContribution(contribution('c1'));
    round.castVote('c1', 'v1', 'support');
    round.castVote('c1', 'v2', 'support');
    expect(round.hasSuperMajority('c1')).toBe(true);
  });

  it('hasSuperMajority returns false below threshold', () => {
    round = new VotingRound({ superMajorityThreshold: 0.67, minVotesRequired: 2 });
    round.registerContribution(contribution('c1'));
    round.castVote('c1', 'v1', 'support');
    round.castVote('c1', 'v2', 'oppose');
    expect(round.hasSuperMajority('c1')).toBe(false);
  });

  it('hasSuperMajority returns false below minVotesRequired', () => {
    round = new VotingRound({ superMajorityThreshold: 0.5, minVotesRequired: 5 });
    round.registerContribution(contribution('c1'));
    round.castVote('c1', 'v1', 'support');
    expect(round.hasSuperMajority('c1')).toBe(false);
  });

  it('hasSuperMajority returns false for unknown contribution', () => {
    expect(round.hasSuperMajority('nope')).toBe(false);
  });

  it('getApprovedContributions returns approved only', () => {
    round = new VotingRound({ superMajorityThreshold: 0.5, minVotesRequired: 2 });
    round.registerContribution(contribution('c1'));
    round.registerContribution(contribution('c2'));
    round.castVote('c1', 'v1', 'support');
    round.castVote('c1', 'v2', 'support');
    round.castVote('c2', 'v1', 'oppose');
    round.castVote('c2', 'v2', 'oppose');
    const approved = round.getApprovedContributions();
    expect(approved).toHaveLength(1);
    expect(approved[0].id).toBe('c1');
  });

  it('getWinner returns top-ranked contribution', () => {
    round.registerContribution(contribution('c1'));
    round.registerContribution(contribution('c2'));
    round.castVote('c1', 'v1', 'support');
    round.castVote('c2', 'v1', 'support');
    round.castVote('c2', 'v2', 'support');
    expect(round.getWinner()?.id).toBe('c2');
  });

  it('getWinner returns undefined with no contributions', () => {
    expect(round.getWinner()).toBeUndefined();
  });

  it('close prevents further voting', () => {
    round.registerContribution(contribution('c1'));
    round.close();
    expect(round.isClosed()).toBe(true);
    expect(() => round.castVote('c1', 'v1', 'support')).toThrow();
  });

  it('getStatistics returns correct stats', () => {
    round = new VotingRound({ superMajorityThreshold: 0.5, minVotesRequired: 1 });
    round.registerContribution(contribution('c1'));
    round.registerContribution(contribution('c2'));
    round.castVote('c1', 'v1', 'support');
    round.castVote('c2', 'v1', 'support');
    round.castVote('c2', 'v2', 'support');
    const stats = round.getStatistics();
    expect(stats.totalContributions).toBe(2);
    expect(stats.totalVotes).toBe(3);
    expect(stats.hasConsensus).toBe(true);
  });

  it('getStatistics empty round', () => {
    const stats = round.getStatistics();
    expect(stats.totalContributions).toBe(0);
    expect(stats.totalVotes).toBe(0);
    expect(stats.hasConsensus).toBe(false);
    expect(stats.participationRate).toBe(0);
  });
});
