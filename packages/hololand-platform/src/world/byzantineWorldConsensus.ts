/**
 * Byzantine-resistant quorum for multi-agent HoloLand world creation.
 *
 * Invariants:
 * - A voter contributes at most one effective vote: if they vote multiple times,
 *   the last vote in array order wins (simulates equivocation resolution).
 * - Votes reference `proposalId`; unknown ids are ignored.
 * - Acceptance requires at least `quorumSize = 2f + 1` approving votes for one proposal,
 *   where `f` is `byzantineFaults` and the ensemble must satisfy `N >= 3f + 1`.
 */

export interface WorldProposal<T = unknown> {
  id: string;
  proposerId: string;
  /** Commitment to canonical world bytes (e.g. SHA-256 hex). */
  contentHash: string;
  /** Optional opaque payload (scene handle, CRDT doc id, etc.). */
  payload?: T;
}

export interface WorldCreationVote {
  proposalId: string;
  voterId: string;
  /** If false, counts as withholding support (not counted toward quorum). */
  approve: boolean;
}

export interface ByzantineConsensusConfig {
  /** Total agents in the ensemble (honest + Byzantine). */
  totalAgents: number;
  /** Max Byzantine agents to tolerate; quorum = 2f+1; needs N >= 3f+1. */
  byzantineFaults: number;
}

export type WorldCreationResolution<T = unknown> =
  | {
      status: 'accepted';
      winningProposal: WorldProposal<T>;
      /** Distinct voters who approved the winning proposal (post-deduplication). */
      approvingVoters: string[];
      quorumSize: number;
    }
  | {
      status: 'pending';
      reason: string;
    }
  | {
      status: 'rejected';
      reason: string;
    };

function quorumForFaults(f: number): number {
  return 2 * f + 1;
}

function minAgentsForFaults(f: number): number {
  return 3 * f + 1;
}

/**
 * Resolve which world proposal (if any) reaches Byzantine quorum.
 */
export function resolveWorldCreation<T = unknown>(
  proposals: WorldProposal<T>[],
  votes: WorldCreationVote[],
  config: ByzantineConsensusConfig
): WorldCreationResolution<T> {
  const { totalAgents: N, byzantineFaults: f } = config;

  if (!Number.isInteger(N) || N < 1) {
    return { status: 'rejected', reason: 'totalAgents must be a positive integer' };
  }
  if (!Number.isInteger(f) || f < 0) {
    return { status: 'rejected', reason: 'byzantineFaults must be a non-negative integer' };
  }
  if (N < minAgentsForFaults(f)) {
    return {
      status: 'rejected',
      reason: `Need at least ${minAgentsForFaults(f)} agents to tolerate ${f} Byzantine faults (got N=${N})`,
    };
  }

  if (proposals.length === 0) {
    return { status: 'rejected', reason: 'No world proposals' };
  }

  const proposalById = new Map(proposals.map((p) => [p.id, p]));
  const quorumSize = quorumForFaults(f);

  /** Last vote per voter (global across proposals). */
  const lastVoteByVoter = new Map<string, WorldCreationVote>();
  for (const v of votes) {
    if (!v.voterId || !v.proposalId) continue;
    lastVoteByVoter.set(v.voterId, v);
  }

  /** proposalId -> set of voterIds who approved */
  const approvals = new Map<string, Set<string>>();

  for (const [, v] of lastVoteByVoter) {
    if (!v.approve) continue;
    if (!proposalById.has(v.proposalId)) continue;
    let set = approvals.get(v.proposalId);
    if (!set) {
      set = new Set();
      approvals.set(v.proposalId, set);
    }
    set.add(v.voterId);
  }

  let maxApprovals = 0;
  for (const p of proposals) {
    maxApprovals = Math.max(maxApprovals, approvals.get(p.id)?.size ?? 0);
  }

  let bestId: string | null = null;
  let bestCount = 0;

  for (const p of proposals) {
    const count = approvals.get(p.id)?.size ?? 0;
    if (count < quorumSize) continue;
    if (
      bestId === null ||
      count > bestCount ||
      (count === bestCount && p.id < bestId)
    ) {
      bestCount = count;
      bestId = p.id;
    }
  }

  if (bestId === null) {
    return {
      status: 'pending',
      reason: `No proposal reached quorum (need ${quorumSize} approving votes, best=${maxApprovals})`,
    };
  }

  const winning = proposalById.get(bestId)!;
  const approvingVoters = Array.from(approvals.get(bestId) ?? []);

  return {
    status: 'accepted',
    winningProposal: winning,
    approvingVoters,
    quorumSize,
  };
}
