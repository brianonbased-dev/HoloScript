/**
 * @holoscript/core - Negotiation Protocol
 *
 * Core protocol for multi-agent negotiation and consensus building.
 * Manages negotiation sessions, proposals, voting, and resolution.
 *
 * Part of HoloScript v3.1 Agentic Choreography.
 *
 * @example
 * ```typescript
 * const protocol = new NegotiationProtocol();
 *
 * // Start a negotiation
 * const session = await protocol.initiate({
 *   topic: 'task-assignment',
 *   participants: ['agent-1', 'agent-2', 'agent-3'],
 *   votingMechanism: 'majority',
 *   timeout: 60000,
 * });
 *
 * // Submit proposals
 * await protocol.propose(session.id, {
 *   proposerId: 'agent-1',
 *   title: 'Process sequentially',
 *   description: 'Handle tasks one at a time',
 *   content: { strategy: 'sequential' },
 * });
 *
 * // Vote on proposals
 * await protocol.vote(session.id, {
 *   agentId: 'agent-2',
 *   ranking: ['proposal-1'],
 * });
 *
 * // Resolve when ready
 * const resolution = await protocol.resolve(session.id);
 * ```
 *
 * @version 3.1.0
 * @milestone v3.1 (March 2026)
 */

import type {
  NegotiationSession,
  NegotiationConfig,
  Proposal,
  Vote,
  Resolution,
  ResolutionOutcome,
  NegotiationEvents,
  ProposalInput,
  VoteInput,
  InitiateOptions,
} from './NegotiationTypes';

import {
  getVotingHandler,
  checkQuorum,
  getTrustWeight,
  type VotingResult,
} from './VotingMechanisms';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Audit log entry
 */
export interface AuditEntry {
  timestamp: number;
  sessionId: string;
  action: 'initiated' | 'proposal_submitted' | 'vote_cast' | 'resolved' | 'timeout' | 'escalated';
  agentId?: string;
  details: Record<string, unknown>;
}

/**
 * Session deadline info
 */
interface DeadlineInfo {
  sessionId: string;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Event handler type
 */
type EventHandler<T> = (data: T) => void | Promise<void>;

// =============================================================================
// NEGOTIATION PROTOCOL
// =============================================================================

/**
 * NegotiationProtocol manages multi-agent negotiation sessions.
 *
 * Features:
 * - Multiple voting mechanisms (majority, consensus, ranked, etc.)
 * - Proposal lifecycle management
 * - Quorum and deadline enforcement
 * - Deadlock detection and escalation
 * - Full audit logging
 */
export class NegotiationProtocol {
  private sessions: Map<string, NegotiationSession> = new Map();
  private auditLog: AuditEntry[] = [];
  private deadlines: Map<string, DeadlineInfo> = new Map();
  private eventHandlers: Map<keyof NegotiationEvents, Set<EventHandler<any>>> = new Map();
  private sessionCounter = 0;
  private proposalCounter = 0;
  private voteCounter = 0;

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Initiate a new negotiation session
   */
  async initiate(options: InitiateOptions): Promise<NegotiationSession> {
    const sessionId = this.generateSessionId();
    const timeout = options.timeout ?? 60000;

    const config: NegotiationConfig = {
      mechanism: options.votingMechanism || 'majority',
      votingMechanism: options.votingMechanism || 'majority',
      quorum: options.quorum ?? 0.5,
      timeout: timeout,
      votingDeadline: timeout,
      proposalDeadline: timeout,
      maxRounds: options.maxRounds ?? 3,
      allowAbstain: options.allowAbstain ?? true,
      requireJustification: options.requireJustification ?? false,
      tieBreaker: options.tieBreaker ?? 'random',
      escalationPath: options.escalationPath,
    };

    const now = Date.now();
    const session: NegotiationSession = {
      id: sessionId,
      topic: options.topic,
      description: options.description,
      participants: [...options.participants],
      status: 'open',
      proposals: [],
      votes: [],
      config,
      round: 1,
      currentRound: 1,
      createdAt: now,
      startedAt: now,
      lastActivityAt: now,
      deadline: now + timeout,
      history: [],
      metadata: options.metadata || {},
    };

    this.sessions.set(sessionId, session);
    this.startDeadlineTimer(session);
    this.audit('initiated', sessionId, undefined, {
      topic: options.topic,
      participants: options.participants,
      config,
    });

    await this.emit('sessionStarted', { session });

    return session;
  }

  /**
   * Submit a proposal to a session
   */
  async propose(sessionId: string, input: ProposalInput): Promise<Proposal> {
    const session = this.getSession(sessionId);
    this.validateSessionOpen(session);
    this.validateParticipant(session, input.proposerId);

    const proposalId = this.generateProposalId();

    const proposal: Proposal = {
      id: proposalId,
      sessionId,
      proposerId: input.proposerId,
      agentId: input.proposerId,
      title: input.title,
      description: input.description,
      content: input.content,
      priority: input.priority ?? 0,
      status: 'submitted',
      submittedAt: Date.now(),
      metadata: input.metadata || {},
    };

    session.proposals.push(proposal);
    session.lastActivityAt = Date.now();
    this.audit('proposal_submitted', sessionId, input.proposerId, {
      proposalId,
      title: input.title,
    });

    await this.emit('proposalSubmitted', { session, proposal });

    return proposal;
  }

  /**
   * Cast a vote in a session
   */
  async vote(sessionId: string, input: VoteInput): Promise<Vote> {
    const session = this.getSession(sessionId);
    this.validateSessionOpen(session);
    this.validateParticipant(session, input.agentId);
    this.validateNotDuplicate(session, input.agentId);

    const mechanism = session.config.mechanism || session.config.votingMechanism || 'majority';
    const handler = getVotingHandler(mechanism);

    // Create vote structure
    const vote: Vote = {
      id: this.generateVoteId(),
      sessionId,
      agentId: input.agentId,
      ranking: input.ranking || [],
      approvals: input.approvals,
      weight: input.weight ?? getTrustWeight('local'),
      justification: input.justification,
      abstain: input.abstain ?? false,
      timestamp: Date.now(),
    };

    // Validate vote if not abstaining
    if (!vote.abstain && !handler.validateVote(vote, session.proposals)) {
      throw new Error(
        `Invalid vote: ranking must reference valid proposal IDs for mechanism '${mechanism}'`
      );
    }

    session.votes.push(vote);
    this.audit('vote_cast', sessionId, input.agentId, {
      voteId: vote.id,
      abstain: vote.abstain,
    });

    await this.emit('voteReceived', { session, vote });

    // Check if all participants have voted
    if (this.allVotesCast(session)) {
      await this.tryAutoResolve(session);
    }

    return vote;
  }

  /**
   * Resolve a negotiation session
   */
  async resolve(sessionId: string, force = false): Promise<Resolution> {
    const session = this.getSession(sessionId);

    if (session.status !== 'open' && session.status !== 'voting') {
      if (session.resolution) {
        return session.resolution;
      }
      throw new Error(`Session ${sessionId} is ${session.status}, cannot resolve`);
    }

    // Check quorum unless forced
    const mechanism = session.config.mechanism || session.config.votingMechanism || 'majority';
    if (!force) {
      const quorumMet = checkQuorum(
        session.votes,
        session.participants.length,
        session.config,
        mechanism
      );

      if (!quorumMet) {
        return this.createFailedResolution(session, 'quorum_not_met');
      }
    }

    // Count votes
    const handler = getVotingHandler(mechanism);
    const result = handler.count(
      session.votes.filter((v) => !v.abstain),
      session.proposals,
      session.config,
      session.round || session.currentRound || 1
    );

    const resolution = this.buildResolution(session, result);

    // Update session
    session.status = resolution.outcome === 'deadlock' ? 'deadlock' : 'resolved';
    session.resolution = resolution;
    session.resolvedAt = Date.now();

    this.clearDeadline(sessionId);
    this.audit('resolved', sessionId, undefined, {
      outcome: resolution.outcome,
      winnerId: resolution.winnerId,
    });

    await this.emit('sessionResolved', { session, resolution });

    return resolution;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): NegotiationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Negotiation session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): NegotiationSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'open' || s.status === 'voting'
    );
  }

  /**
   * Get sessions for a specific agent
   */
  getAgentSessions(agentId: string): NegotiationSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.participants.includes(agentId));
  }

  /**
   * Cancel a session
   */
  async cancel(sessionId: string, _reason?: string): Promise<void> {
    const session = this.getSession(sessionId);

    if (session.status === 'resolved' || session.status === 'cancelled') {
      return;
    }

    session.status = 'cancelled';
    const mechanism = session.config.mechanism || session.config.votingMechanism || 'majority';
    session.resolution = {
      sessionId,
      outcome: 'cancelled',
      tallies: [],
      finalTallies: [],
      mechanism,
      rounds: session.round || 1,
      resolvedAt: Date.now(),
      participationRate: session.votes.length / session.participants.length,
      timestamp: Date.now(),
    };

    this.clearDeadline(sessionId);
    await this.emit('sessionResolved', {
      session,
      resolution: session.resolution,
    });
  }

  /**
   * Escalate a deadlocked session
   */
  async escalate(sessionId: string): Promise<Resolution> {
    const session = this.getSession(sessionId);

    if (!session.config.escalationPath) {
      throw new Error(`No escalation path configured for session ${sessionId}`);
    }

    session.status = 'escalated';
    this.audit('escalated', sessionId, undefined, {
      escalationPath: session.config.escalationPath,
    });

    const mechanism = session.config.mechanism || session.config.votingMechanism || 'majority';
    const resolution: Resolution = {
      sessionId,
      outcome: 'escalated',
      tallies: session.resolution?.tallies || [],
      finalTallies: session.resolution?.finalTallies || [],
      mechanism,
      rounds: session.round || 1,
      resolvedAt: Date.now(),
      participationRate: session.votes.length / session.participants.length,
      timestamp: Date.now(),
      escalatedTo: session.config.escalationPath,
    };

    session.resolution = resolution;
    await this.emit('sessionResolved', { session, resolution });

    return resolution;
  }

  /**
   * Add a participant to an open session
   */
  addParticipant(sessionId: string, agentId: string): void {
    const session = this.getSession(sessionId);
    if (session.status !== 'open') {
      throw new Error('Cannot add participant to non-open session');
    }
    if (!session.participants.includes(agentId)) {
      session.participants.push(agentId);
    }
  }

  /**
   * Remove a participant from a session
   */
  removeParticipant(sessionId: string, agentId: string): void {
    const session = this.getSession(sessionId);
    if (session.status !== 'open') {
      throw new Error('Cannot remove participant from non-open session');
    }
    session.participants = session.participants.filter((p) => p !== agentId);
  }

  /**
   * Subscribe to negotiation events
   */
  on<K extends keyof NegotiationEvents>(
    event: K,
    handler: EventHandler<NegotiationEvents[K]>
  ): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Get audit log
   */
  getAuditLog(sessionId?: string): AuditEntry[] {
    if (sessionId) {
      return this.auditLog.filter((e) => e.sessionId === sessionId);
    }
    return [...this.auditLog];
  }

  /**
   * Clear completed sessions older than maxAge
   */
  pruneOldSessions(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;

    for (const [id, session] of this.sessions) {
      const sessionTime = session.resolvedAt || session.createdAt || session.startedAt || 0;
      if (
        (session.status === 'resolved' || session.status === 'cancelled') &&
        sessionTime < cutoff
      ) {
        this.sessions.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Reset protocol state (for testing)
   */
  reset(): void {
    for (const deadline of this.deadlines.values()) {
      clearTimeout(deadline.timer);
    }
    this.sessions.clear();
    this.auditLog = [];
    this.deadlines.clear();
    this.eventHandlers.clear();
    this.sessionCounter = 0;
    this.proposalCounter = 0;
    this.voteCounter = 0;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private generateSessionId(): string {
    return `neg-${Date.now()}-${++this.sessionCounter}`;
  }

  private generateProposalId(): string {
    return `prop-${Date.now()}-${++this.proposalCounter}`;
  }

  private generateVoteId(): string {
    return `vote-${Date.now()}-${++this.voteCounter}`;
  }

  private validateSessionOpen(session: NegotiationSession): void {
    if (session.status !== 'open' && session.status !== 'voting') {
      throw new Error(`Session ${session.id} is ${session.status}, not accepting input`);
    }
  }

  private validateParticipant(session: NegotiationSession, agentId: string): void {
    if (!session.participants.includes(agentId)) {
      throw new Error(`Agent ${agentId} is not a participant in session ${session.id}`);
    }
  }

  private validateNotDuplicate(session: NegotiationSession, agentId: string): void {
    const roundVotes = session.votes.filter((v) => v.agentId === agentId && !v.supersededBy);
    if (roundVotes.length > 0) {
      throw new Error(`Agent ${agentId} has already voted in this round of session ${session.id}`);
    }
  }

  private allVotesCast(session: NegotiationSession): boolean {
    const voted = new Set(session.votes.map((v) => v.agentId));
    return session.participants.every((p) => {
      const participantId = typeof p === 'string' ? p : p.id;
      return voted.has(participantId);
    });
  }

  private async tryAutoResolve(session: NegotiationSession): Promise<void> {
    // Transition to voting if proposals exist
    if (session.status === 'open' && session.proposals.length > 0) {
      session.status = 'voting';
    }

    // Auto-resolve if all have voted
    if (this.allVotesCast(session)) {
      await this.resolve(session.id);
    }
  }

  private buildResolution(session: NegotiationSession, result: VotingResult): Resolution {
    const winningProposal = result.winnerId
      ? session.proposals.find((p) => p.id === result.winnerId)
      : undefined;

    const mechanism = session.config.mechanism || session.config.votingMechanism || 'majority';
    const resolvedAt = Date.now();

    return {
      sessionId: session.id,
      outcome: result.outcome,
      winnerId: result.winnerId,
      winner: winningProposal,
      winningProposal,
      tallies: result.tallies,
      finalTallies: result.tallies,
      mechanism,
      rounds: session.round || 1,
      round: session.round || session.currentRound,
      resolvedAt,
      consensusLevel: result.consensusLevel,
      dissenters: result.dissenters,
      participationRate: session.votes.length / session.participants.length,
      timestamp: resolvedAt,
    };
  }

  private createFailedResolution(
    session: NegotiationSession,
    outcome: ResolutionOutcome
  ): Resolution {
    session.status = outcome === 'timeout' ? 'timeout' : 'deadlock';

    const mechanism = session.config.mechanism || session.config.votingMechanism || 'majority';
    const resolvedAt = Date.now();

    const resolution: Resolution = {
      sessionId: session.id,
      outcome,
      tallies: [],
      finalTallies: [],
      mechanism,
      rounds: session.round || 1,
      resolvedAt,
      participationRate: session.votes.length / session.participants.length,
      timestamp: resolvedAt,
    };

    session.resolution = resolution;
    this.clearDeadline(session.id);

    return resolution;
  }

  private startDeadlineTimer(session: NegotiationSession): void {
    const timeout = session.config.timeout || session.config.votingDeadline || 60000;
    const timer = setTimeout(async () => {
      if (session.status === 'open' || session.status === 'voting') {
        this.audit('timeout', session.id, undefined, {
          deadline: session.deadline,
        });
        await this.handleTimeout(session);
      }
    }, timeout);

    this.deadlines.set(session.id, { sessionId: session.id, timer });
  }

  private async handleTimeout(session: NegotiationSession): Promise<void> {
    // Try to resolve with current votes
    if (session.votes.length > 0) {
      try {
        await this.resolve(session.id, true);
        return;
      } catch {
        // Fall through to timeout
      }
    }

    const resolution = this.createFailedResolution(session, 'timeout');
    await this.emit('sessionResolved', { session, resolution });
  }

  private clearDeadline(sessionId: string): void {
    const deadline = this.deadlines.get(sessionId);
    if (deadline) {
      clearTimeout(deadline.timer);
      this.deadlines.delete(sessionId);
    }
  }

  private audit(
    action: AuditEntry['action'],
    sessionId: string,
    agentId: string | undefined,
    details: Record<string, unknown>
  ): void {
    this.auditLog.push({
      timestamp: Date.now(),
      sessionId,
      action,
      agentId,
      details,
    });
  }

  private async emit<K extends keyof NegotiationEvents>(
    event: K,
    data: NegotiationEvents[K]
  ): Promise<void> {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(data);
        } catch (err) {
          console.error(`Error in negotiation event handler for ${event}:`, err);
        }
      }
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let defaultProtocol: NegotiationProtocol | null = null;

/**
 * Get the default NegotiationProtocol instance
 */
export function getNegotiationProtocol(): NegotiationProtocol {
  if (!defaultProtocol) {
    defaultProtocol = new NegotiationProtocol();
  }
  return defaultProtocol;
}

/**
 * Reset the default protocol instance (for testing)
 */
export function resetNegotiationProtocol(): void {
  if (defaultProtocol) {
    defaultProtocol.reset();
    defaultProtocol = null;
  }
}
