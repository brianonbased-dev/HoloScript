/**
 * Voting Round
 *
 * Manages voting on contributions in collective intelligence sessions.
 */

import type { IHiveContribution } from '@holoscript/core';

export interface Vote {
  contributionId: string;
  voterId: string;
  vote: 'support' | 'oppose';
  weight: number;
  timestamp: number;
}

export interface VotingResult {
  contributionId: string;
  supportVotes: number;
  opposeVotes: number;
  netScore: number;
  weightedScore: number;
  voterIds: string[];
}

export interface VotingRoundConfig {
  minVotesRequired: number;
  superMajorityThreshold: number; // 0-1, e.g., 0.67 for 2/3 majority
  allowAbstain: boolean;
  weightByConfidence: boolean;
}

const DEFAULT_CONFIG: VotingRoundConfig = {
  minVotesRequired: 2,
  superMajorityThreshold: 0.5,
  allowAbstain: true,
  weightByConfidence: true,
};

/**
 * Manages voting on a set of contributions
 */
export class VotingRound {
  private config: VotingRoundConfig;
  private votes: Map<string, Vote[]> = new Map(); // contributionId -> votes
  private contributions: Map<string, IHiveContribution> = new Map();
  private closed = false;

  constructor(config: Partial<VotingRoundConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a contribution for voting
   */
  registerContribution(contribution: IHiveContribution): void {
    if (this.closed) {
      throw new Error('Voting round is closed');
    }
    this.contributions.set(contribution.id, contribution);
    this.votes.set(contribution.id, []);
  }

  /**
   * Cast a vote on a contribution
   */
  castVote(
    contributionId: string,
    voterId: string,
    vote: 'support' | 'oppose',
    voterConfidence?: number
  ): void {
    if (this.closed) {
      throw new Error('Voting round is closed');
    }

    if (!this.contributions.has(contributionId)) {
      throw new Error(`Contribution ${contributionId} not registered`);
    }

    const existingVotes = this.votes.get(contributionId) ?? [];

    // Check for duplicate vote
    if (existingVotes.some((v) => v.voterId === voterId)) {
      throw new Error(`${voterId} has already voted on ${contributionId}`);
    }

    // Calculate weight
    let weight = 1;
    if (this.config.weightByConfidence && voterConfidence !== undefined) {
      weight = voterConfidence;
    }

    existingVotes.push({
      contributionId,
      voterId,
      vote,
      weight,
      timestamp: Date.now(),
    });

    this.votes.set(contributionId, existingVotes);
  }

  /**
   * Get current results for a contribution
   */
  getResult(contributionId: string): VotingResult | undefined {
    const votes = this.votes.get(contributionId);
    if (!votes) {
      return undefined;
    }

    let supportVotes = 0;
    let opposeVotes = 0;
    let weightedSupport = 0;
    let weightedOppose = 0;

    for (const vote of votes) {
      if (vote.vote === 'support') {
        supportVotes++;
        weightedSupport += vote.weight;
      } else {
        opposeVotes++;
        weightedOppose += vote.weight;
      }
    }

    return {
      contributionId,
      supportVotes,
      opposeVotes,
      netScore: supportVotes - opposeVotes,
      weightedScore: weightedSupport - weightedOppose,
      voterIds: votes.map((v) => v.voterId),
    };
  }

  /**
   * Get all results, ranked by score
   */
  getAllResults(): VotingResult[] {
    const results: VotingResult[] = [];

    for (const contributionId of this.contributions.keys()) {
      const result = this.getResult(contributionId);
      if (result) {
        results.push(result);
      }
    }

    // Sort by weighted score, then by raw vote count
    return results.sort((a, b) => {
      if (b.weightedScore !== a.weightedScore) {
        return b.weightedScore - a.weightedScore;
      }
      return b.netScore - a.netScore;
    });
  }

  /**
   * Check if a contribution has reached super-majority
   */
  hasSuperMajority(contributionId: string): boolean {
    const result = this.getResult(contributionId);
    if (!result) {
      return false;
    }

    const totalVotes = result.supportVotes + result.opposeVotes;
    if (totalVotes < this.config.minVotesRequired) {
      return false;
    }

    const supportRatio = result.supportVotes / totalVotes;
    return supportRatio >= this.config.superMajorityThreshold;
  }

  /**
   * Get contributions that have reached super-majority
   */
  getApprovedContributions(): IHiveContribution[] {
    const approved: IHiveContribution[] = [];

    for (const [contributionId, contribution] of this.contributions) {
      if (this.hasSuperMajority(contributionId)) {
        approved.push(contribution);
      }
    }

    return approved;
  }

  /**
   * Get the top-ranked contribution
   */
  getWinner(): IHiveContribution | undefined {
    const results = this.getAllResults();
    if (results.length === 0) {
      return undefined;
    }

    const winnerId = results[0].contributionId;
    return this.contributions.get(winnerId);
  }

  /**
   * Close the voting round
   */
  close(): void {
    this.closed = true;
  }

  /**
   * Check if voting is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get voting statistics
   */
  getStatistics(): {
    totalContributions: number;
    totalVotes: number;
    participationRate: number;
    hasConsensus: boolean;
  } {
    let totalVotes = 0;
    for (const votes of this.votes.values()) {
      totalVotes += votes.length;
    }

    const voterSet = new Set<string>();
    for (const votes of this.votes.values()) {
      for (const vote of votes) {
        voterSet.add(vote.voterId);
      }
    }

    const results = this.getAllResults();
    const hasConsensus = results.length > 0 && this.hasSuperMajority(results[0].contributionId);

    return {
      totalContributions: this.contributions.size,
      totalVotes,
      participationRate:
        this.contributions.size > 0
          ? totalVotes / (this.contributions.size * voterSet.size || 1)
          : 0,
      hasConsensus,
    };
  }
}
