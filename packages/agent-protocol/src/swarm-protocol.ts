/**
 * Swarm Consensus Protocol: Broadcast -> Vote -> Converge
 *
 * Emergent consensus via pheromone-like signal propagation:
 * 1. Each agent broadcasts a proposal with a signal strength
 * 2. Agents reinforce signals they agree with (amplify) or dampen those they don't
 * 3. After each round, signals decay — only strong consensus survives
 * 4. Convergence when one proposal exceeds the threshold, or max rounds reached
 */

import type { SwarmProtocolSpec, AgentIdentity } from './index';

// =============================================================================
// TYPES
// =============================================================================

export interface Signal {
  proposalId: string;
  authorId: string;
  content: unknown;
  strength: number; // 0.0 - 1.0
  timestamp: number;
}

export interface Vote {
  voterId: string;
  proposalId: string;
  amplify: boolean; // true = strengthen, false = dampen
  delta: number; // how much to change (0.0 - 1.0)
  reasoning?: string;
}

export interface SwarmRound {
  round: number;
  signals: Signal[];
  votes: Vote[];
  signalsAfterVoting: Signal[];
}

export interface SwarmResult {
  task: string;
  rounds: SwarmRound[];
  convergedProposal: Signal | null;
  status: 'converged' | 'max_rounds' | 'quorum_failed';
  totalRounds: number;
  totalDurationMs: number;
}

/** Adapter for a swarm participant */
export interface SwarmParticipant {
  readonly agentId: string;
  /** Generate a proposal signal for the task */
  propose(task: string): Promise<Signal>;
  /** Vote on all active signals */
  vote(task: string, signals: Signal[]): Promise<Vote[]>;
}

// =============================================================================
// SWARM ORCHESTRATOR
// =============================================================================

/** Signal decay factor applied each round (0.0-1.0) */
const DEFAULT_DECAY = 0.9;
/** Minimum signal strength before pruning */
const MIN_SIGNAL = 0.05;

export class SwarmOrchestrator {
  readonly identity: AgentIdentity;
  private readonly spec: SwarmProtocolSpec;
  private readonly participants: SwarmParticipant[];
  private readonly decay: number;

  constructor(
    identity: AgentIdentity,
    spec: SwarmProtocolSpec,
    participants: SwarmParticipant[],
    decay: number = DEFAULT_DECAY
  ) {
    this.identity = identity;
    this.spec = spec;
    this.participants = participants;
    this.decay = decay;
  }

  async run(task: string): Promise<SwarmResult> {
    const startedAt = Date.now();
    const rounds: SwarmRound[] = [];

    // Initial proposals from all participants
    let signals = await this.broadcastProposals(task);

    for (let r = 0; r < this.spec.maxRounds; r++) {
      // Collect votes from all participants
      const allVotes = await this.collectVotes(task, signals);

      // Apply votes to signals
      const updatedSignals = this.applyVotes(signals, allVotes);

      // Apply decay and prune weak signals
      const decayedSignals = this.decayAndPrune(updatedSignals);

      rounds.push({
        round: r,
        signals: [...signals],
        votes: allVotes,
        signalsAfterVoting: decayedSignals,
      });

      signals = decayedSignals;

      // Check convergence
      const converged = this.checkConvergence(signals);
      if (converged) {
        return {
          task,
          rounds,
          convergedProposal: converged,
          status: 'converged',
          totalRounds: r + 1,
          totalDurationMs: Date.now() - startedAt,
        };
      }

      // Check quorum — need enough active signals
      if (signals.length === 0) {
        return {
          task,
          rounds,
          convergedProposal: null,
          status: 'quorum_failed',
          totalRounds: r + 1,
          totalDurationMs: Date.now() - startedAt,
        };
      }
    }

    // Max rounds — pick strongest signal if any
    const strongest = signals.length > 0
      ? signals.reduce((a, b) => (a.strength >= b.strength ? a : b))
      : null;

    return {
      task,
      rounds,
      convergedProposal: strongest,
      status: 'max_rounds',
      totalRounds: this.spec.maxRounds,
      totalDurationMs: Date.now() - startedAt,
    };
  }

  private async broadcastProposals(task: string): Promise<Signal[]> {
    const proposals = await Promise.all(
      this.participants.map(p => p.propose(task))
    );
    return proposals;
  }

  private async collectVotes(task: string, signals: Signal[]): Promise<Vote[]> {
    const allVotes: Vote[] = [];
    for (const participant of this.participants) {
      const votes = await participant.vote(task, signals);
      allVotes.push(...votes);
    }
    return allVotes;
  }

  private applyVotes(signals: Signal[], votes: Vote[]): Signal[] {
    // Group votes by proposal
    const votesByProposal = new Map<string, Vote[]>();
    for (const vote of votes) {
      const existing = votesByProposal.get(vote.proposalId) ?? [];
      existing.push(vote);
      votesByProposal.set(vote.proposalId, existing);
    }

    return signals.map(signal => {
      const proposalVotes = votesByProposal.get(signal.proposalId) ?? [];
      let newStrength = signal.strength;

      for (const vote of proposalVotes) {
        if (vote.amplify) {
          newStrength = Math.min(1.0, newStrength + vote.delta);
        } else {
          newStrength = Math.max(0.0, newStrength - vote.delta);
        }
      }

      return { ...signal, strength: newStrength };
    });
  }

  private decayAndPrune(signals: Signal[]): Signal[] {
    return signals
      .map(s => ({ ...s, strength: s.strength * this.decay }))
      .filter(s => s.strength >= MIN_SIGNAL);
  }

  private checkConvergence(signals: Signal[]): Signal | null {
    // Check if any signal exceeds the convergence threshold
    // AND has enough support (quorum)
    for (const signal of signals) {
      if (signal.strength >= this.spec.convergenceThreshold) {
        // Check quorum: signal strength relative to total must dominate
        const totalStrength = signals.reduce((s, sig) => s + sig.strength, 0);
        const share = totalStrength > 0 ? signal.strength / totalStrength : 0;
        if (share >= this.spec.quorum) {
          return signal;
        }
      }
    }
    return null;
  }
}
