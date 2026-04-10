/**
 * Collective Intelligence Service
 *
 * Implements ICollectiveIntelligenceService for collaborative
 * problem-solving through hive sessions.
 */

import type {
  ICollectiveIntelligenceService,
  IHiveContribution,
  IHiveSession,
} from '@holoscript/core';
import { VotingRound, type VotingResult } from './VotingRound';
import { ContributionSynthesizer, type SynthesisResult } from './ContributionSynthesizer';

export interface CollectiveIntelligenceConfig {
  maxParticipants: number;
  votingThreshold: number;
  synthesisMinContributions: number;
  autoCloseOnResolution: boolean;
  contributionTimeoutMs: number;
}

const DEFAULT_CONFIG: CollectiveIntelligenceConfig = {
  maxParticipants: 100,
  votingThreshold: 0.5,
  synthesisMinContributions: 3,
  autoCloseOnResolution: true,
  contributionTimeoutMs: 300000, // 5 minutes
};

/**
 * Collective Intelligence Service
 *
 * Enables groups of agents to collaborate on complex problems through
 * structured sessions with contributions, voting, and synthesis.
 */
export class CollectiveIntelligence implements ICollectiveIntelligenceService {
  private config: CollectiveIntelligenceConfig;
  private sessions: Map<string, IHiveSession> = new Map();
  private votingRounds: Map<string, VotingRound> = new Map();
  private synthesizer: ContributionSynthesizer;
  private contributionIdCounter = 0;

  constructor(config: Partial<CollectiveIntelligenceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.synthesizer = new ContributionSynthesizer();
  }

  /**
   * Create a new hive session
   */
  createSession(topic: string, goal: string, initiator: string): IHiveSession {
    const id = this.generateSessionId();

    const session: IHiveSession = {
      id,
      topic,
      goal,
      initiator,
      status: 'active',
      participants: [initiator],
      contributions: [],
    };

    this.sessions.set(id, session);
    this.votingRounds.set(
      id,
      new VotingRound({
        superMajorityThreshold: this.config.votingThreshold,
      })
    );

    return session;
  }

  /**
   * Join an existing session
   */
  join(sessionId: string, agentId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is ${session.status}`);
    }

    if (session.participants.length >= this.config.maxParticipants) {
      throw new Error(`Session ${sessionId} is full`);
    }

    if (!session.participants.includes(agentId)) {
      session.participants.push(agentId);
    }
  }

  /**
   * Leave a session
   */
  leave(sessionId: string, agentId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const index = session.participants.indexOf(agentId);
    if (index !== -1) {
      session.participants.splice(index, 1);
    }
  }

  /**
   * Contribute to a session
   */
  contribute(
    sessionId: string,
    contribution: Omit<IHiveContribution, 'id' | 'timestamp'>
  ): IHiveContribution {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is ${session.status}`);
    }

    // Verify contributor is a participant
    if (!session.participants.includes(contribution.agentId)) {
      throw new Error(`Agent ${contribution.agentId} is not a participant`);
    }

    // Create full contribution
    const fullContribution: IHiveContribution = {
      ...contribution,
      id: this.generateContributionId(),
      timestamp: Date.now(),
    };

    session.contributions.push(fullContribution);

    // Register for voting
    const votingRound = this.votingRounds.get(sessionId);
    votingRound?.registerContribution(fullContribution);

    return fullContribution;
  }

  /**
   * Vote on a contribution
   */
  vote(
    sessionId: string,
    contributionId: string,
    voterId: string,
    vote: 'support' | 'oppose'
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error(`Session ${sessionId} is ${session.status}`);
    }

    if (!session.participants.includes(voterId)) {
      throw new Error(`Agent ${voterId} is not a participant`);
    }

    const votingRound = this.votingRounds.get(sessionId);
    if (!votingRound) {
      throw new Error(`No voting round for session ${sessionId}`);
    }

    // Get voter's contribution confidence for weighting
    const voterContribution = session.contributions.find((c: any) => c.agentId === voterId);
    const voterConfidence = voterContribution?.confidence ?? 0.5;

    votingRound.castVote(contributionId, voterId, vote, voterConfidence);
  }

  /**
   * Synthesize all contributions
   */
  synthesize(sessionId: string): SynthesisResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.contributions.length < this.config.synthesisMinContributions) {
      return {
        synthesizedContent: '',
        sourceContributions: [],
        synthesisMethod: 'merge',
        confidence: 0,
        metadata: {
          totalContributions: session.contributions.length,
          ideaCount: 0,
          critiqueCount: 0,
          consensusCount: 0,
          solutionCount: 0,
          averageConfidence: 0,
          keyThemes: [],
        },
      };
    }

    return this.synthesizer.synthesize(session);
  }

  /**
   * Resolve a session with a final decision
   */
  resolve(sessionId: string, resolution: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.resolution = resolution;
    session.status = 'resolved';

    const votingRound = this.votingRounds.get(sessionId);
    votingRound?.close();
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): IHiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): IHiveSession[] {
    return [...this.sessions.values()].filter((s) => s.status === 'active');
  }

  /**
   * Close a session without resolution
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = 'closed';

    const votingRound = this.votingRounds.get(sessionId);
    votingRound?.close();
  }

  /**
   * Get voting results for a session
   */
  getVotingResults(sessionId: string): VotingResult[] {
    const votingRound = this.votingRounds.get(sessionId);
    if (!votingRound) {
      return [];
    }
    return votingRound.getAllResults();
  }

  /**
   * Get the top-voted contribution
   */
  getTopContribution(sessionId: string): IHiveContribution | undefined {
    const votingRound = this.votingRounds.get(sessionId);
    return votingRound?.getWinner();
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string):
    | {
        participantCount: number;
        contributionCount: number;
        votingStats: ReturnType<VotingRound['getStatistics']>;
        contributionsByType: Record<IHiveContribution['type'], number>;
        averageConfidence: number;
      }
    | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const votingRound = this.votingRounds.get(sessionId);

    const byType: Record<IHiveContribution['type'], number> = {
      idea: 0,
      critique: 0,
      consensus: 0,
      solution: 0,
    };

    let totalConfidence = 0;
    for (const c of session.contributions) {
      byType[c.type]++;
      totalConfidence += c.confidence;
    }

    return {
      participantCount: session.participants.length,
      contributionCount: session.contributions.length,
      votingStats: votingRound?.getStatistics() ?? {
        totalContributions: 0,
        totalVotes: 0,
        participationRate: 0,
        hasConsensus: false,
      },
      contributionsByType: byType,
      averageConfidence:
        session.contributions.length > 0 ? totalConfidence / session.contributions.length : 0,
    };
  }

  /**
   * Auto-resolve if consensus reached
   */
  checkForConsensus(sessionId: string): boolean {
    const votingRound = this.votingRounds.get(sessionId);
    if (!votingRound) {
      return false;
    }

    const stats = votingRound.getStatistics();
    if (stats.hasConsensus && this.config.autoCloseOnResolution) {
      const winner = votingRound.getWinner();
      if (winner) {
        this.resolve(sessionId, `Consensus reached: ${winner.content}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get contributions by a specific agent
   */
  getAgentContributions(sessionId: string, agentId: string): IHiveContribution[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }
    return session.contributions.filter((c: any) => c.agentId === agentId);
  }

  /**
   * Find similar contributions in a session
   */
  findSimilarContributions(sessionId: string, contributionId: string): IHiveContribution[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    const target = session.contributions.find((c: any) => c.id === contributionId);
    if (!target) {
      return [];
    }

    return this.synthesizer.findSimilar(target, session.contributions);
  }

  private generateSessionId(): string {
    return `hive-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateContributionId(): string {
    this.contributionIdCounter++;
    return `contrib-${this.contributionIdCounter}-${Date.now()}`;
  }
}
