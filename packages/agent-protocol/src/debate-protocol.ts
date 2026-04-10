/**
 * Multi-Agent Debate Protocol: Propose -> Challenge -> Defend -> Resolve
 *
 * Multiple agents argue positions on a topic through structured rounds:
 * 1. Each agent proposes their position
 * 2. Agents challenge each other's positions
 * 3. Agents defend or revise their positions
 * 4. Resolution via majority vote, judge ruling, or consensus
 */

import type { DebateProtocolSpec, AgentIdentity } from './index';

// =============================================================================
// TYPES
// =============================================================================

export interface Position {
  agentId: string;
  claim: string;
  reasoning: string;
  confidence: number;
  evidence: string[];
}

export interface Challenge {
  challengerId: string;
  targetAgentId: string;
  objection: string;
  counterEvidence: string[];
}

export interface Defense {
  defenderId: string;
  response: string;
  revisedConfidence: number;
  concessions: string[];
}

export interface DebateRound {
  round: number;
  positions: Position[];
  challenges: Challenge[];
  defenses: Defense[];
}

export interface Resolution {
  strategy: 'majority' | 'judge' | 'consensus';
  winner: string | null;
  winningPosition: Position | null;
  votes?: Record<string, string>; // agentId -> voted-for agentId
  judgeReasoning?: string;
  consensusReached: boolean;
}

export interface DebateResult {
  topic: string;
  rounds: DebateRound[];
  resolution: Resolution;
  status: 'resolved' | 'deadlocked' | 'error';
  totalDurationMs: number;
}

/** Adapter for a single debate participant (LLM-backed) */
export interface DebateParticipant {
  readonly agentId: string;
  /** Generate initial position on the topic */
  propose(topic: string): Promise<Position>;
  /** Challenge another agent's position */
  challenge(topic: string, position: Position): Promise<Challenge>;
  /** Defend against a challenge */
  defend(topic: string, ownPosition: Position, challenge: Challenge): Promise<Defense>;
  /** Vote for which position is strongest (returns agentId) */
  vote(topic: string, allPositions: Position[]): Promise<string>;
}

/** Optional judge adapter for judge-based resolution */
export interface DebateJudge {
  /** Evaluate all rounds and pick a winner */
  judge(topic: string, rounds: DebateRound[]): Promise<{ winnerId: string; reasoning: string }>;
}

// =============================================================================
// DEBATE ORCHESTRATOR
// =============================================================================

export class DebateOrchestrator {
  readonly identity: AgentIdentity;
  private readonly spec: DebateProtocolSpec;
  private readonly participants: DebateParticipant[];
  private readonly judge?: DebateJudge;

  constructor(
    identity: AgentIdentity,
    spec: DebateProtocolSpec,
    participants: DebateParticipant[],
    judge?: DebateJudge
  ) {
    if (participants.length < 2) {
      throw new Error('Debate requires at least 2 participants');
    }
    this.identity = identity;
    this.spec = spec;
    this.participants = participants;
    this.judge = judge;
  }

  async run(topic: string): Promise<DebateResult> {
    const startedAt = Date.now();
    const rounds: DebateRound[] = [];

    for (let r = 0; r < this.spec.rounds; r++) {
      const round = await this.executeRound(topic, r, rounds);
      rounds.push(round);
    }

    // Resolve
    const resolution = await this.resolve(topic, rounds);

    return {
      topic,
      rounds,
      resolution,
      status: resolution.consensusReached || resolution.winner ? 'resolved' : 'deadlocked',
      totalDurationMs: Date.now() - startedAt,
    };
  }

  private async executeRound(
    topic: string,
    roundNum: number,
    previousRounds: DebateRound[]
  ): Promise<DebateRound> {
    // 1. Propose (or re-propose with updated confidence)
    const positions = await Promise.all(this.participants.map((p) => p.propose(topic)));

    // 2. Challenge — each agent challenges the next agent's position (round-robin)
    const challenges: Challenge[] = [];
    for (let i = 0; i < this.participants.length; i++) {
      const targetIdx = (i + 1) % this.participants.length;
      const challenge = await this.participants[i].challenge(topic, positions[targetIdx]);
      challenges.push(challenge);
    }

    // 3. Defend — each challenged agent responds
    const defenses: Defense[] = [];
    for (let i = 0; i < this.participants.length; i++) {
      // Find challenges targeting this agent
      const incomingChallenges = challenges.filter(
        (c) => c.targetAgentId === this.participants[i].agentId
      );
      for (const ch of incomingChallenges) {
        const defense = await this.participants[i].defend(topic, positions[i], ch);
        defenses.push(defense);
      }
    }

    return { round: roundNum, positions, challenges, defenses };
  }

  private async resolve(topic: string, rounds: DebateRound[]): Promise<Resolution> {
    const lastRound = rounds[rounds.length - 1];
    const finalPositions = lastRound.positions;

    switch (this.spec.resolutionStrategy) {
      case 'judge': {
        if (!this.judge) {
          throw new Error('Judge resolution strategy requires a DebateJudge');
        }
        const judgment = await this.judge.judge(topic, rounds);
        const winnerPos = finalPositions.find((p) => p.agentId === judgment.winnerId) ?? null;
        return {
          strategy: 'judge',
          winner: judgment.winnerId,
          winningPosition: winnerPos,
          judgeReasoning: judgment.reasoning,
          consensusReached: false,
        };
      }

      case 'consensus': {
        // Check if all agents' confidence converged on similar positions
        const avgConfidence =
          finalPositions.reduce((s, p) => s + p.confidence, 0) / finalPositions.length;
        const highConfidence = finalPositions.filter((p) => p.confidence >= avgConfidence);
        if (highConfidence.length === finalPositions.length) {
          // Everyone is confident — pick the highest
          const best = finalPositions.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
          return {
            strategy: 'consensus',
            winner: best.agentId,
            winningPosition: best,
            consensusReached: true,
          };
        }
        return {
          strategy: 'consensus',
          winner: null,
          winningPosition: null,
          consensusReached: false,
        };
      }

      case 'majority':
      default: {
        // Each agent votes for a position (not their own ideally, but the protocol allows it)
        const votes: Record<string, string> = {};
        for (const participant of this.participants) {
          const otherPositions = finalPositions.filter((p) => p.agentId !== participant.agentId);
          const votedFor = await participant.vote(
            topic,
            otherPositions.length > 0 ? otherPositions : finalPositions
          );
          votes[participant.agentId] = votedFor;
        }

        // Tally
        const tally: Record<string, number> = {};
        for (const votedFor of Object.values(votes)) {
          tally[votedFor] = (tally[votedFor] ?? 0) + 1;
        }

        const maxVotes = Math.max(...Object.values(tally));
        const winners = Object.entries(tally).filter(([, v]) => v === maxVotes);

        if (winners.length === 1) {
          const winnerId = winners[0][0];
          const winnerPos = finalPositions.find((p) => p.agentId === winnerId) ?? null;
          return {
            strategy: 'majority',
            winner: winnerId,
            winningPosition: winnerPos,
            votes,
            consensusReached: false,
          };
        }

        // Tie — no clear winner
        return {
          strategy: 'majority',
          winner: null,
          winningPosition: null,
          votes,
          consensusReached: false,
        };
      }
    }
  }
}
