/**
 * @holoscript/core - Voting Mechanisms
 *
 * Implementations of various voting algorithms for agent negotiation.
 * Part of HoloScript v3.1 Agentic Choreography.
 *
 * Supported mechanisms:
 * - Majority: Simple majority wins
 * - Supermajority: 2/3 threshold required
 * - Weighted: Vote weight by trust level
 * - Consensus: All must agree
 * - Ranked Choice: Instant runoff voting
 * - Approval: Multiple approval voting
 * - Borda Count: Point-based ranking
 *
 * @version 3.1.0
 * @milestone v3.1 (March 2026)
 */

import type {
  Vote,
  VoteTally,
  VotingMechanism,
  Proposal,
  ResolutionOutcome,
  NegotiationConfig,
} from './NegotiationTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result from a voting round
 */
export interface VotingResult {
  /** Final tallies */
  tallies: VoteTally[];
  /** Winner ID (if determined) */
  winnerId?: string;
  /** Whether resolution was reached */
  resolved: boolean;
  /** Outcome type */
  outcome: ResolutionOutcome;
  /** Tie detected */
  tie?: boolean;
  /** Eliminated proposals (for ranked choice) */
  eliminated?: string[];
  /** Consensus level (0-1) */
  consensusLevel?: number;
  /** Dissenters */
  dissenters?: string[];
}

/**
 * Voting mechanism handler interface
 */
export interface VotingHandler {
  /** Count votes and determine result */
  count(
    votes: Vote[],
    proposals: Proposal[],
    config: NegotiationConfig,
    round: number
  ): VotingResult;

  /** Validate a vote for this mechanism */
  validateVote(vote: Vote, proposals: Proposal[]): boolean;

  /** Get required quorum for this mechanism */
  getRequiredQuorum(config: NegotiationConfig): number;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate total weight of all votes
 */
function getTotalWeight(votes: Vote[]): number {
  return votes.reduce((sum, v) => sum + v.weight, 0);
}

/**
 * Build initial tally structure
 */
function initializeTallies(proposals: Proposal[]): Map<string, VoteTally> {
  const tallies = new Map<string, VoteTally>();
  for (const p of proposals) {
    tallies.set(p.id, {
      proposalId: p.id,
      voteCount: 0,
      weightedScore: 0,
      approvalCount: 0,
      bordaPoints: 0,
      percentage: 0,
    });
  }
  return tallies;
}

/**
 * Convert tallies map to sorted array
 */
function talliesToArray(tallies: Map<string, VoteTally>, totalWeight: number): VoteTally[] {
  const arr = Array.from(tallies.values());
  // Calculate percentages
  for (const t of arr) {
    t.percentage = totalWeight > 0 ? (t.weightedScore / totalWeight) * 100 : 0;
  }
  // Sort by weighted score descending
  return arr.sort((a, b) => b.weightedScore - a.weightedScore);
}

/**
 * Find ties at the top
 */
function findTies(tallies: VoteTally[]): VoteTally[] {
  if (tallies.length < 2) return [];
  const topScore = tallies[0].weightedScore;
  return tallies.filter((t) => t.weightedScore === topScore);
}

/**
 * Apply tie-breaker
 */
function breakTie(
  tied: VoteTally[],
  proposals: Proposal[],
  config: NegotiationConfig
): string | undefined {
  if (tied.length === 0) return undefined;
  if (tied.length === 1) return tied[0].proposalId;

  switch (config.tieBreaker) {
    case 'random':
      return tied[Math.floor(Math.random() * tied.length)].proposalId;

    case 'seniority': {
      // Earliest submitted proposal wins
      const proposalMap = new Map(proposals.map((p) => [p.id, p]));
      const sorted = [...tied].sort((a, b) => {
        const pa = proposalMap.get(a.proposalId);
        const pb = proposalMap.get(b.proposalId);
        return (pa?.submittedAt || 0) - (pb?.submittedAt || 0);
      });
      return sorted[0].proposalId;
    }

    case 'priority': {
      // Highest priority proposal wins
      const proposalMap = new Map(proposals.map((p) => [p.id, p]));
      const sorted = [...tied].sort((a, b) => {
        const pa = proposalMap.get(a.proposalId);
        const pb = proposalMap.get(b.proposalId);
        return (pb?.priority || 0) - (pa?.priority || 0);
      });
      return sorted[0].proposalId;
    }

    case 'proposer':
      // First in tied list (arbitrary but deterministic)
      return tied[0].proposalId;

    case 'escalate':
    default:
      return undefined; // No winner, escalate
  }
}

// =============================================================================
// MAJORITY VOTING
// =============================================================================

/**
 * Simple majority voting (>50% wins)
 */
export const majorityHandler: VotingHandler = {
  count(votes, proposals, config, _round): VotingResult {
    const tallies = initializeTallies(proposals);
    const totalWeight = getTotalWeight(votes);

    // Count first-choice votes
    for (const vote of votes) {
      if (vote.ranking.length > 0) {
        const firstChoice = vote.ranking[0];
        const tally = tallies.get(firstChoice);
        if (tally) {
          tally.voteCount++;
          tally.weightedScore += vote.weight;
        }
      }
    }

    const sorted = talliesToArray(tallies, totalWeight);
    const ties = findTies(sorted);

    // Check if top has majority
    if (sorted.length > 0 && sorted[0].percentage > 50) {
      return {
        tallies: sorted,
        winnerId: sorted[0].proposalId,
        resolved: true,
        outcome: 'winner_declared',
        consensusLevel: sorted[0].percentage / 100,
      };
    }

    // Check for tie
    if (ties.length > 1) {
      const tieBreakWinner = breakTie(ties, proposals, config);
      if (tieBreakWinner) {
        return {
          tallies: sorted,
          winnerId: tieBreakWinner,
          resolved: true,
          outcome: 'tie_broken',
          tie: true,
        };
      }
      return {
        tallies: sorted,
        resolved: false,
        outcome: 'deadlock',
        tie: true,
      };
    }

    // No majority but has a leader
    if (sorted.length > 0) {
      return {
        tallies: sorted,
        winnerId: sorted[0].proposalId,
        resolved: true,
        outcome: 'winner_declared',
        consensusLevel: sorted[0].percentage / 100,
      };
    }

    return {
      tallies: sorted,
      resolved: false,
      outcome: 'deadlock',
    };
  },

  validateVote(vote, proposals) {
    if (vote.ranking.length === 0) return false;
    const proposalIds = new Set(proposals.map((p) => p.id));
    return proposalIds.has(vote.ranking[0]);
  },

  getRequiredQuorum(config) {
    return config.quorum || 0.5;
  },
};

// =============================================================================
// SUPERMAJORITY VOTING
// =============================================================================

/**
 * Supermajority voting (≥66.67% wins)
 */
export const supermajorityHandler: VotingHandler = {
  count(votes, proposals, _config, _round): VotingResult {
    const tallies = initializeTallies(proposals);
    const totalWeight = getTotalWeight(votes);

    for (const vote of votes) {
      if (vote.ranking.length > 0) {
        const firstChoice = vote.ranking[0];
        const tally = tallies.get(firstChoice);
        if (tally) {
          tally.voteCount++;
          tally.weightedScore += vote.weight;
        }
      }
    }

    const sorted = talliesToArray(tallies, totalWeight);
    const threshold = 66.67;

    if (sorted.length > 0 && sorted[0].percentage >= threshold) {
      return {
        tallies: sorted,
        winnerId: sorted[0].proposalId,
        resolved: true,
        outcome: 'winner_declared',
        consensusLevel: sorted[0].percentage / 100,
      };
    }

    return {
      tallies: sorted,
      resolved: false,
      outcome: 'deadlock',
    };
  },

  validateVote(vote, proposals) {
    return majorityHandler.validateVote(vote, proposals);
  },

  getRequiredQuorum(config) {
    return config.quorum || 0.67;
  },
};

// =============================================================================
// WEIGHTED VOTING
// =============================================================================

/**
 * Weighted voting (trust-level based weights)
 */
export const weightedHandler: VotingHandler = {
  count(votes, proposals, config, round): VotingResult {
    // Same as majority but weights already applied
    return majorityHandler.count(votes, proposals, config, round);
  },

  validateVote(vote, proposals) {
    return majorityHandler.validateVote(vote, proposals);
  },

  getRequiredQuorum(config) {
    return config.quorum || 0.5;
  },
};

// =============================================================================
// CONSENSUS VOTING
// =============================================================================

/**
 * Consensus voting (all must agree)
 */
export const consensusHandler: VotingHandler = {
  count(votes, proposals, _config, _round): VotingResult {
    if (votes.length === 0) {
      return {
        tallies: [],
        resolved: false,
        outcome: 'deadlock',
      };
    }

    const tallies = initializeTallies(proposals);
    const totalWeight = getTotalWeight(votes);

    // Count first choices
    const firstChoices = new Map<string, string[]>();
    for (const vote of votes) {
      if (vote.ranking.length > 0) {
        const choice = vote.ranking[0];
        const tally = tallies.get(choice);
        if (tally) {
          tally.voteCount++;
          tally.weightedScore += vote.weight;
        }
        if (!firstChoices.has(choice)) {
          firstChoices.set(choice, []);
        }
        firstChoices.get(choice)!.push(vote.agentId);
      }
    }

    const sorted = talliesToArray(tallies, totalWeight);

    // Check if all votes are for the same proposal
    if (firstChoices.size === 1) {
      const winnerId = Array.from(firstChoices.keys())[0];
      return {
        tallies: sorted,
        winnerId,
        resolved: true,
        outcome: 'consensus_reached',
        consensusLevel: 1.0,
      };
    }

    // No consensus - identify dissenters
    const leader = sorted[0];
    const leaderVoters = new Set(firstChoices.get(leader.proposalId) || []);
    const dissenters = votes.filter((v) => !leaderVoters.has(v.agentId)).map((v) => v.agentId);

    return {
      tallies: sorted,
      resolved: false,
      outcome: 'deadlock',
      consensusLevel: leader.percentage / 100,
      dissenters,
    };
  },

  validateVote(vote, proposals) {
    return majorityHandler.validateVote(vote, proposals);
  },

  getRequiredQuorum() {
    return 1.0; // All must participate
  },
};

// =============================================================================
// RANKED CHOICE (INSTANT RUNOFF)
// =============================================================================

/**
 * Ranked choice voting with instant runoff
 */
export const rankedHandler: VotingHandler = {
  count(votes, proposals, _config, _round): VotingResult {
    const eliminated = new Set<string>();
    const runoffVotes = votes.map((v) => ({
      ...v,
      currentRanking: [...v.ranking],
    }));
    const totalWeight = getTotalWeight(votes);
    let rounds = 0;
    const maxRounds = proposals.length;

    while (rounds < maxRounds) {
      rounds++;

      // Count current first choices
      const tallies = initializeTallies(proposals.filter((p) => !eliminated.has(p.id)));

      for (const vote of runoffVotes) {
        // Find first non-eliminated choice
        const validChoice = vote.currentRanking.find((id) => !eliminated.has(id));
        if (validChoice) {
          const tally = tallies.get(validChoice);
          if (tally) {
            tally.voteCount++;
            tally.weightedScore += vote.weight;
          }
        }
      }

      const sorted = talliesToArray(tallies, totalWeight);

      // Check for majority
      if (sorted.length > 0 && sorted[0].percentage > 50) {
        return {
          tallies: sorted,
          winnerId: sorted[0].proposalId,
          resolved: true,
          outcome: 'winner_declared',
          eliminated: Array.from(eliminated),
          consensusLevel: sorted[0].percentage / 100,
        };
      }

      // Eliminate lowest
      if (sorted.length > 1) {
        const loser = sorted[sorted.length - 1];
        eliminated.add(loser.proposalId);
      } else if (sorted.length === 1) {
        // Only one left
        return {
          tallies: sorted,
          winnerId: sorted[0].proposalId,
          resolved: true,
          outcome: 'winner_declared',
          eliminated: Array.from(eliminated),
        };
      } else {
        break;
      }
    }

    return {
      tallies: [],
      resolved: false,
      outcome: 'deadlock',
      eliminated: Array.from(eliminated),
    };
  },

  validateVote(vote, proposals) {
    if (vote.ranking.length === 0) return false;
    const proposalIds = new Set(proposals.map((p) => p.id));
    return vote.ranking.every((id) => proposalIds.has(id));
  },

  getRequiredQuorum(config) {
    return config.quorum || 0.5;
  },
};

// =============================================================================
// APPROVAL VOTING
// =============================================================================

/**
 * Approval voting (vote for multiple acceptable options)
 */
export const approvalHandler: VotingHandler = {
  count(votes, proposals, config, _round): VotingResult {
    const tallies = initializeTallies(proposals);
    const totalVotes = votes.length;

    for (const vote of votes) {
      const approvals = vote.approvals || vote.ranking;
      for (const proposalId of approvals) {
        const tally = tallies.get(proposalId);
        if (tally) {
          tally.voteCount++;
          tally.weightedScore += vote.weight;
          tally.approvalCount = (tally.approvalCount || 0) + 1;
        }
      }
    }

    const sorted = talliesToArray(
      tallies,
      votes.reduce((s, v) => s + v.weight, 0)
    );
    const ties = findTies(sorted);

    if (ties.length > 1) {
      const tieBreakWinner = breakTie(ties, proposals, config);
      if (tieBreakWinner) {
        return {
          tallies: sorted,
          winnerId: tieBreakWinner,
          resolved: true,
          outcome: 'tie_broken',
          tie: true,
        };
      }
    }

    if (sorted.length > 0) {
      return {
        tallies: sorted,
        winnerId: sorted[0].proposalId,
        resolved: true,
        outcome: 'winner_declared',
        consensusLevel: totalVotes > 0 ? (sorted[0].approvalCount || 0) / totalVotes : 0,
      };
    }

    return {
      tallies: sorted,
      resolved: false,
      outcome: 'deadlock',
    };
  },

  validateVote(vote, proposals) {
    const approvals = vote.approvals || vote.ranking;
    if (approvals.length === 0) return false;
    const proposalIds = new Set(proposals.map((p) => p.id));
    return approvals.every((id) => proposalIds.has(id));
  },

  getRequiredQuorum(config) {
    return config.quorum || 0.5;
  },
};

// =============================================================================
// BORDA COUNT
// =============================================================================

/**
 * Borda count voting (points by rank position)
 */
export const bordaHandler: VotingHandler = {
  count(votes, proposals, config, _round): VotingResult {
    const tallies = initializeTallies(proposals);
    const n = proposals.length;

    for (const vote of votes) {
      // Award points: n-1 for 1st, n-2 for 2nd, etc.
      for (let i = 0; i < vote.ranking.length; i++) {
        const proposalId = vote.ranking[i];
        const tally = tallies.get(proposalId);
        if (tally) {
          const points = (n - 1 - i) * vote.weight;
          tally.bordaPoints = (tally.bordaPoints || 0) + points;
          tally.weightedScore += points;
          tally.voteCount++;
        }
      }
    }

    const sorted = talliesToArray(tallies, n * votes.reduce((s, v) => s + v.weight, 0));
    const ties = findTies(sorted);

    if (ties.length > 1) {
      const tieBreakWinner = breakTie(ties, proposals, config);
      if (tieBreakWinner) {
        return {
          tallies: sorted,
          winnerId: tieBreakWinner,
          resolved: true,
          outcome: 'tie_broken',
          tie: true,
        };
      }
    }

    if (sorted.length > 0) {
      return {
        tallies: sorted,
        winnerId: sorted[0].proposalId,
        resolved: true,
        outcome: 'winner_declared',
      };
    }

    return {
      tallies: sorted,
      resolved: false,
      outcome: 'deadlock',
    };
  },

  validateVote(vote, proposals) {
    return rankedHandler.validateVote(vote, proposals);
  },

  getRequiredQuorum(config) {
    return config.quorum || 0.5;
  },
};

// =============================================================================
// MECHANISM REGISTRY
// =============================================================================

/**
 * Get handler for a voting mechanism
 */
export function getVotingHandler(mechanism: VotingMechanism): VotingHandler {
  switch (mechanism) {
    case 'majority':
      return majorityHandler;
    case 'supermajority':
      return supermajorityHandler;
    case 'weighted':
      return weightedHandler;
    case 'consensus':
      return consensusHandler;
    case 'ranked':
      return rankedHandler;
    case 'approval':
      return approvalHandler;
    case 'borda':
      return bordaHandler;
    case 'custom':
    default:
      return majorityHandler;
  }
}

/**
 * Check if quorum is met
 */
export function checkQuorum(
  votes: Vote[],
  participants: number,
  config: NegotiationConfig,
  mechanism: VotingMechanism
): boolean {
  const handler = getVotingHandler(mechanism);
  const requiredQuorum = handler.getRequiredQuorum(config);
  const participation = participants > 0 ? votes.length / participants : 0;
  return participation >= requiredQuorum;
}

/**
 * Get trust-based vote weight
 */
export function getTrustWeight(trustLevel: 'local' | 'verified' | 'external'): number {
  switch (trustLevel) {
    case 'local':
      return 1.0;
    case 'verified':
      return 0.8;
    case 'external':
      return 0.5;
    default:
      return 0.5;
  }
}
