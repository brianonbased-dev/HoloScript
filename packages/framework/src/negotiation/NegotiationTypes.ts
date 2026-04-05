/**
 * @holoscript/core - Negotiation Type Definitions
 *
 * Types for agent negotiation, voting, and conflict resolution.
 * Part of HoloScript v3.1 Agentic Choreography.
 *
 * @version 3.1.0
 * @milestone v3.1 (March 2026)
 */

import type { AgentManifest } from '../agents/AgentManifest';

// =============================================================================
// NEGOTIATION STATUS
// =============================================================================

/**
 * Status of a negotiation session
 */
export type NegotiationStatus =
  | 'draft'
  | 'open'
  | 'proposing'
  | 'voting'
  | 'resolving'
  | 'resolved'
  | 'deadlock'
  | 'deadlocked'
  | 'timeout'
  | 'escalated'
  | 'failed'
  | 'cancelled';

/**
 * Voting mechanism type
 */
export type VotingMechanism =
  | 'majority' // Simple majority wins
  | 'supermajority' // 2/3 majority required
  | 'weighted' // Weight by trust level
  | 'consensus' // All must agree
  | 'ranked' // Ranked choice / instant runoff
  | 'approval' // Multiple approval voting
  | 'borda' // Borda count
  | 'custom'; // Custom mechanism

/**
 * Proposal status
 */
export type ProposalStatus =
  | 'pending'
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'withdrawn';

/**
 * Resolution outcome
 */
export type ResolutionOutcome =
  | 'winner_declared'
  | 'tie_broken'
  | 'consensus_reached'
  | 'deadlock'
  | 'timeout'
  | 'escalated'
  | 'quorum_not_met'
  | 'cancelled';

/**
 * Tie-breaker strategy
 */
export type TieBreaker = 'random' | 'seniority' | 'priority' | 'proposer' | 'escalate';

// =============================================================================
// PROPOSALS
// =============================================================================

/**
 * A proposal in a negotiation
 */
export interface Proposal {
  /** Unique proposal ID */
  id: string;
  /** Session this proposal belongs to */
  sessionId?: string;
  /** ID of the proposing agent */
  proposerId?: string;
  /** Proposal title */
  title?: string;
  /** Proposal description */
  description?: string;
  /** ID of the proposing agent (legacy) */
  agentId: string;
  /** Proposal content/value */
  content: unknown;
  /** Priority weight (higher = more important to proposer) */
  priority: number;
  /** Reasoning/justification */
  reasoning?: string;
  /** Resource requirements */
  resources?: ResourceRequest[];
  /** Time constraints */
  timeline?: {
    earliest?: number;
    latest?: number;
    duration?: number;
  };
  /** Proposal status */
  status: ProposalStatus;
  /** Submission timestamp */
  submittedAt: number;
  /** Last modified timestamp */
  modifiedAt?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input for creating a proposal
 */
export interface ProposalInput {
  /** ID of the proposing agent */
  proposerId: string;
  /** Proposal title */
  title: string;
  /** Proposal description */
  description?: string;
  /** Proposal content/value */
  content: unknown;
  /** Priority weight */
  priority?: number;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Resource request in a proposal
 */
export interface ResourceRequest {
  /** Resource type */
  type: string;
  /** Amount requested */
  amount: number;
  /** Unit of measurement */
  unit?: string;
  /** Whether exclusive access is needed */
  exclusive?: boolean;
}

// =============================================================================
// VOTES
// =============================================================================

/**
 * A vote cast by an agent
 */
export interface Vote {
  /** Unique vote ID */
  id?: string;
  /** Session ID */
  sessionId?: string;
  /** Voting agent ID */
  agentId: string;
  /** Ranked preferences (proposal IDs) */
  ranking: string[];
  /** Approval set (for approval voting) */
  approvals?: string[];
  /** Vote weight (determined by trust level) */
  weight: number;
  /** Optional vote reason/justification */
  reason?: string;
  /** Optional justification */
  justification?: string;
  /** Whether this is an abstention */
  abstain?: boolean;
  /** Vote timestamp */
  timestamp: number;
  /** If this vote was superseded by another */
  supersededBy?: string;
}

/**
 * Input for casting a vote
 */
export interface VoteInput {
  /** Voting agent ID */
  agentId: string;
  /** Ranked preferences */
  ranking?: string[];
  /** Approval set */
  approvals?: string[];
  /** Vote weight */
  weight?: number;
  /** Justification */
  justification?: string;
  /** Abstain from voting */
  abstain?: boolean;
}

/**
 * Vote tally result
 */
export interface VoteTally {
  /** Proposal ID */
  proposalId: string;
  /** Total votes received */
  voteCount: number;
  /** Weighted score */
  weightedScore: number;
  /** Approval count */
  approvalCount?: number;
  /** Borda points */
  bordaPoints?: number;
  /** Percentage of votes */
  percentage: number;
}

// =============================================================================
// NEGOTIATION SESSION
// =============================================================================

/**
 * Negotiation session configuration
 */
export interface NegotiationConfig {
  /** Voting mechanism */
  mechanism: VotingMechanism;
  /** Voting mechanism (alias) */
  votingMechanism?: VotingMechanism;
  /** Session timeout (ms) */
  timeout?: number;
  /** Proposal deadline (ms from start) */
  proposalDeadline?: number;
  /** Voting deadline (ms from start) */
  votingDeadline?: number;
  /** Maximum rounds before deadlock */
  maxRounds?: number;
  /** Tie-breaking strategy */
  tieBreaker?: TieBreaker;
  /** Minimum participation ratio */
  quorum?: number;
  /** Allow proposal amendments */
  allowAmendments?: boolean;
  /** Anonymous voting */
  anonymousVoting?: boolean;
  /** Allow delegation */
  allowDelegation?: boolean;
  /** Allow agents to abstain */
  allowAbstain?: boolean;
  /** Require justification for votes */
  requireJustification?: boolean;
  /** Auto-escalate on deadlock */
  escalateOnDeadlock?: boolean;
  /** Escalation target */
  escalationTarget?: string;
  /** Escalation path */
  escalationPath?: string;
}

/**
 * Default negotiation configuration
 */
export const DEFAULT_NEGOTIATION_CONFIG: NegotiationConfig = {
  mechanism: 'majority',
  proposalDeadline: 30000, // 30s
  votingDeadline: 30000, // 30s
  maxRounds: 3,
  tieBreaker: 'priority',
  quorum: 0.5,
  allowAmendments: true,
  anonymousVoting: false,
  allowDelegation: false,
  escalateOnDeadlock: true,
};

/**
 * Negotiation session
 */
export interface NegotiationSession {
  /** Unique session ID */
  id: string;
  /** Negotiation topic */
  topic: string;
  /** Description */
  description?: string;
  /** Participating agent IDs (can be strings or full manifests) */
  participants: (string | AgentManifest)[];
  /** Session configuration */
  config: NegotiationConfig;
  /** Submitted proposals */
  proposals: Proposal[];
  /** Cast votes */
  votes: Vote[];
  /** Current status */
  status: NegotiationStatus;
  /** Current round number */
  round: number;
  /** Current round (alias) */
  currentRound?: number;
  /** Session creation time */
  createdAt?: number;
  /** Session start time */
  startedAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Deadline timestamp */
  deadline?: number;
  /** Resolution result */
  resolution?: Resolution;
  /** Session resolution timestamp */
  resolvedAt?: number;
  /** Session history/log */
  history: NegotiationEvent[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Negotiation event for history
 */
export interface NegotiationEvent {
  /** Event type */
  type:
    | 'session_created'
    | 'session_started'
    | 'proposal_submitted'
    | 'proposal_amended'
    | 'proposal_withdrawn'
    | 'voting_started'
    | 'vote_cast'
    | 'round_complete'
    | 'resolution_reached'
    | 'deadlock_detected'
    | 'escalation_triggered'
    | 'session_cancelled';
  /** Event timestamp */
  timestamp: number;
  /** Related agent ID */
  agentId?: string;
  /** Related proposal ID */
  proposalId?: string;
  /** Event details */
  details?: Record<string, unknown>;
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Resolution of a negotiation
 */
export interface Resolution {
  /** Session ID */
  sessionId?: string;
  /** Winning proposal ID */
  winnerId?: string;
  /** Winning proposal */
  winner?: Proposal;
  /** Winning proposal (alias) */
  winningProposal?: Proposal;
  /** Final tallies */
  tallies: VoteTally[];
  /** Final tallies (alias) */
  finalTallies?: VoteTally[];
  /** Resolution outcome */
  outcome: ResolutionOutcome;
  /** Resolution mechanism used */
  mechanism: VotingMechanism;
  /** Number of rounds taken */
  rounds: number;
  /** Round (alias) */
  round?: number;
  /** Resolution timestamp */
  resolvedAt: number;
  /** Timestamp (alias) */
  timestamp?: number;
  /** Tie-breaker used (if any) */
  tieBreakerUsed?: boolean;
  /** Consensus level (0-1) */
  consensusLevel?: number;
  /** Dissenting agents */
  dissenters?: string[];
  /** Participation rate (0-1) */
  participationRate?: number;
  /** Escalation target */
  escalatedTo?: string;
  /** Notes */
  notes?: string;
}

// =============================================================================
// DELEGATION
// =============================================================================

/**
 * Vote delegation
 */
export interface Delegation {
  /** Delegating agent ID */
  fromAgentId: string;
  /** Delegatee agent ID */
  toAgentId: string;
  /** Session ID */
  sessionId: string;
  /** Created timestamp */
  createdAt: number;
  /** Revoked timestamp */
  revokedAt?: number;
}

// =============================================================================
// NEGOTIATION EVENTS (for EventEmitter)
// =============================================================================

/**
 * Events emitted by NegotiationProtocol
 */
export interface NegotiationEvents {
  'session:created': (session: NegotiationSession) => void;
  'session:started': (session: NegotiationSession) => void;
  'session:cancelled': (sessionId: string, reason: string) => void;
  'proposal:submitted': (proposal: Proposal, session: NegotiationSession) => void;
  'proposal:amended': (proposal: Proposal, session: NegotiationSession) => void;
  'proposal:withdrawn': (proposalId: string, session: NegotiationSession) => void;
  'voting:started': (session: NegotiationSession) => void;
  'vote:cast': (vote: Vote, session: NegotiationSession) => void;
  'round:complete': (round: number, session: NegotiationSession) => void;
  'resolution:reached': (resolution: Resolution, session: NegotiationSession) => void;
  'deadlock:detected': (session: NegotiationSession) => void;
  'escalation:triggered': (session: NegotiationSession, target: string) => void;
  // Simple event names for protocol
  sessionStarted: { session: NegotiationSession };
  proposalSubmitted: { session: NegotiationSession; proposal: Proposal };
  voteReceived: { session: NegotiationSession; vote: Vote };
  sessionResolved: { session: NegotiationSession; resolution: Resolution };
}

// =============================================================================
// INITIATE OPTIONS
// =============================================================================

/**
 * Options for initiating a negotiation session
 */
export interface InitiateOptions {
  /** Negotiation topic */
  topic: string;
  /** Description */
  description?: string;
  /** Participating agent IDs */
  participants: string[];
  /** Voting mechanism */
  votingMechanism?: VotingMechanism;
  /** Session timeout (ms) */
  timeout?: number;
  /** Quorum requirement (0-1) */
  quorum?: number;
  /** Maximum rounds */
  maxRounds?: number;
  /** Allow abstention */
  allowAbstain?: boolean;
  /** Require vote justification */
  requireJustification?: boolean;
  /** Tie-breaker strategy */
  tieBreaker?: TieBreaker;
  /** Escalation path */
  escalationPath?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}
