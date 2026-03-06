/**
 * VotingRound.prod.test.ts
 *
 * Production tests for VotingRound — contribution registration, vote casting,
 * duplicate detection, weighted scores, super-majority, winner selection,
 * closed-state guards, and statistics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VotingRound } from '../VotingRound';
import type { IHiveContribution } from '../../extensions';

function makeContrib(id: string): IHiveContribution {
  return { id, agentId: 'agent-1', type: 'insight', content: `Content ${id}`, confidence: 0.9, timestamp: Date.now() } as any;
}

describe('VotingRound', () => {
  let round: VotingRound;

  beforeEach(() => { round = new VotingRound({ minVotesRequired: 2, superMajorityThreshold: 0.5 }); });

  // -------------------------------------------------------------------------
  // registerContribution
  // -------------------------------------------------------------------------
  describe('registerContribution()', () => {
    it('registers a contribution', () => {
      round.registerContribution(makeContrib('c1'));
      expect(round.getResult('c1')).toBeDefined();
    });

    it('throws when round is closed', () => {
      round.close();
      expect(() => round.registerContribution(makeContrib('c1'))).toThrow('closed');
    });
  });

  // -------------------------------------------------------------------------
  // castVote
  // -------------------------------------------------------------------------
  describe('castVote()', () => {
    it('records a support vote', () => {
      round.registerContribution(makeContrib('c1'));
      round.castVote('c1', 'voter-a', 'support');
      expect(round.getResult('c1')!.supportVotes).toBe(1);
    });

    it('records an oppose vote', () => {
      round.registerContribution(makeContrib('c1'));
      round.castVote('c1', 'voter-a', 'oppose');
      expect(round.getResult('c1')!.opposeVotes).toBe(1);
    });

    it('throws on duplicate vote by same voter', () => {
      round.registerContribution(makeContrib('c1'));
      round.castVote('c1', 'voter-a', 'support');
      expect(() => round.castVote('c1', 'voter-a', 'oppose')).toThrow('already voted');
    });

    it('throws for unregistered contribution', () => {
      expect(() => round.castVote('ghost', 'voter-a', 'support')).toThrow();
    });

    it('throws when round is closed', () => {
      round.registerContribution(makeContrib('c1'));
      round.close();
      expect(() => round.castVote('c1', 'voter-a', 'support')).toThrow('closed');
    });
  });

  // -------------------------------------------------------------------------
  // getResult
  // -------------------------------------------------------------------------
  describe('getResult()', () => {
    it('returns undefined for unknown contribution', () => {
      expect(round.getResult('ghost')).toBeUndefined();
    });

    it('netScore = supportVotes - opposeVotes', () => {
      round.registerContribution(makeContrib('c1'));
      round.castVote('c1', 'a', 'support');
      round.castVote('c1', 'b', 'support');
      round.castVote('c1', 'c', 'oppose');
      expect(round.getResult('c1')!.netScore).toBe(1);
    });

    it('voterIds contains all voters', () => {
      round.registerContribution(makeContrib('c1'));
      round.castVote('c1', 'a', 'support');
      round.castVote('c1', 'b', 'oppose');
      expect(round.getResult('c1')!.voterIds).toContain('a');
      expect(round.getResult('c1')!.voterIds).toContain('b');
    });

    it('weightedScore uses voterConfidence when weightByConfidence=true', () => {
      const r = new VotingRound({ weightByConfidence: true });
      r.registerContribution(makeContrib('c1'));
      r.castVote('c1', 'a', 'support', 0.8);
      r.castVote('c1', 'b', 'support', 0.4);
      expect(r.getResult('c1')!.weightedScore).toBeCloseTo(1.2, 5);
    });
  });

  // -------------------------------------------------------------------------
  // getAllResults
  // -------------------------------------------------------------------------
  describe('getAllResults()', () => {
    it('returns empty array when no contributions', () => {
      expect(round.getAllResults()).toHaveLength(0);
    });

    it('sorted by weightedScore descending', () => {
      round.registerContribution(makeContrib('a'));
      round.registerContribution(makeContrib('b'));
      round.castVote('a', 'v1', 'support');
      round.castVote('a', 'v2', 'support');
      round.castVote('b', 'v3', 'support');
      const results = round.getAllResults();
      expect(results[0].weightedScore).toBeGreaterThanOrEqual(results[1].weightedScore);
    });
  });

  // -------------------------------------------------------------------------
  // hasSuperMajority
  // -------------------------------------------------------------------------
  describe('hasSuperMajority()', () => {
    it('returns false with too few votes', () => {
      round.registerContribution(makeContrib('c1'));
      round.castVote('c1', 'a', 'support'); // only 1 vote, need 2
      expect(round.hasSuperMajority('c1')).toBe(false);
    });

    it('returns true when support ratio >= threshold with enough votes', () => {
      round.registerContribution(makeContrib('c1'));
      round.castVote('c1', 'a', 'support');
      round.castVote('c1', 'b', 'support'); // 2 support, 0 oppose, ratio=1.0 >= 0.5
      expect(round.hasSuperMajority('c1')).toBe(true);
    });

    it('returns false when oppose outnumbers support below threshold', () => {
      const r = new VotingRound({ minVotesRequired: 2, superMajorityThreshold: 0.7 });
      r.registerContribution(makeContrib('c1'));
      r.castVote('c1', 'a', 'support');
      r.castVote('c1', 'b', 'oppose');
      r.castVote('c1', 'c', 'oppose'); // 1/3 support < 0.7
      expect(r.hasSuperMajority('c1')).toBe(false);
    });

    it('returns false for unknown contribution', () => {
      expect(round.hasSuperMajority('ghost')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getApprovedContributions / getWinner
  // -------------------------------------------------------------------------
  describe('getApprovedContributions / getWinner', () => {
    it('getApprovedContributions returns approved items', () => {
      round.registerContribution(makeContrib('a'));
      round.registerContribution(makeContrib('b'));
      round.castVote('a', 'v1', 'support');
      round.castVote('a', 'v2', 'support');
      // b has no votes — not approved
      const approved = round.getApprovedContributions();
      expect(approved.map(c => c.id)).toContain('a');
      expect(approved.map(c => c.id)).not.toContain('b');
    });

    it('getWinner returns top-scored contribution', () => {
      round.registerContribution(makeContrib('a'));
      round.registerContribution(makeContrib('b'));
      round.castVote('a', 'v1', 'support');
      round.castVote('a', 'v2', 'support');
      round.castVote('b', 'v3', 'oppose');
      expect(round.getWinner()!.id).toBe('a');
    });

    it('getWinner returns undefined when no contributions', () => {
      expect(round.getWinner()).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // close / isClosed
  // -------------------------------------------------------------------------
  describe('close() / isClosed()', () => {
    it('starts open', () => { expect(round.isClosed()).toBe(false); });
    it('isClosed returns true after close()', () => {
      round.close();
      expect(round.isClosed()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getStatistics
  // -------------------------------------------------------------------------
  describe('getStatistics()', () => {
    it('0 contributions: totalVotes=0', () => {
      expect(round.getStatistics().totalVotes).toBe(0);
    });

    it('counts total contributions', () => {
      round.registerContribution(makeContrib('a'));
      round.registerContribution(makeContrib('b'));
      expect(round.getStatistics().totalContributions).toBe(2);
    });

    it('counts total votes across all contributions', () => {
      round.registerContribution(makeContrib('a'));
      round.registerContribution(makeContrib('b'));
      round.castVote('a', 'v1', 'support');
      round.castVote('b', 'v2', 'oppose');
      expect(round.getStatistics().totalVotes).toBe(2);
    });

    it('hasConsensus is true when winner has super-majority', () => {
      round.registerContribution(makeContrib('a'));
      round.castVote('a', 'v1', 'support');
      round.castVote('a', 'v2', 'support');
      expect(round.getStatistics().hasConsensus).toBe(true);
    });
  });
});
