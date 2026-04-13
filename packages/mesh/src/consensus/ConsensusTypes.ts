/**
 * Consensus Types
 * Sprint 4 Priority 5 - Consensus Mechanisms
 *
 * Type definitions for multi-agent consensus protocols.
 */

// =============================================================================
// CONSENSUS CONFIGURATION
// =============================================================================

/**
 * Supported consensus mechanisms
 */
export type ConsensusMechanism = 'simple_majority' | 'raft' | 'pbft';

/**
 * Consensus configuration
 */
export interface ConsensusConfig {
  /** Consensus mechanism to use */
  mechanism: ConsensusMechanism;

  /** Number of votes needed for consensus (default: majority) */
  quorum?: number;

  /** Timeout for proposals in ms */
  timeout: number;

  /** Heartbeat interval for leader (Raft only) */
  heartbeatInterval?: number;

  /** Election timeout range [min, max] in ms (Raft only) */
  electionTimeout?: [number, number];

  /** Maximum retries for proposals */
  maxRetries?: number;
}

/**
 * Default consensus configuration
 */
export const DEFAULT_CONSENSUS_CONFIG: Required<ConsensusConfig> = {
  mechanism: 'simple_majority',
  quorum: 0, // 0 = automatic majority calculation
  timeout: 5000,
  heartbeatInterval: 150,
  electionTimeout: [150, 300],
  maxRetries: 3,
};

// =============================================================================
// NODE / AGENT STATE
// =============================================================================

/**
 * Node state in Raft protocol
 */
export type RaftNodeState = 'follower' | 'candidate' | 'leader';

/**
 * Node info for consensus participant
 */
export interface ConsensusNode {
  id: string;
  address?: string;
  state?: RaftNodeState;
  lastHeartbeat?: number;
  votedFor?: string;
  term?: number;
}

// =============================================================================
// PROPOSALS
// =============================================================================

/**
 * Proposal status
 */
export type ProposalStatus =
  | 'pending'
  | 'voting'
  | 'accepted'
  | 'rejected'
  | 'timeout'
  | 'cancelled';

/**
 * A proposal for state change
 */
export interface Proposal<T = unknown> {
  id: string;
  key: string;
  value: T;
  proposerId: string;
  timestamp: number;
  status: ProposalStatus;
  votes: Map<string, boolean>;
  term?: number; // Raft term
}

/**
 * Vote on a proposal
 */
export interface Vote {
  proposalId: string;
  voterId: string;
  approve: boolean;
  term?: number;
  timestamp: number;
}

/**
 * Proposal result
 */
export interface ProposalResult<T = unknown> {
  proposalId: string;
  accepted: boolean;
  key: string;
  value?: T;
  votes: { for: number; against: number; total: number };
  error?: string;
}

// =============================================================================
// RAFT-SPECIFIC TYPES
// =============================================================================

/**
 * Raft log entry
 */
export interface RaftLogEntry<T = unknown> {
  term: number;
  index: number;
  command: 'set' | 'delete';
  key: string;
  value?: T;
  timestamp: number;
}

/**
 * Raft append entries RPC
 */
export interface AppendEntriesRequest {
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: RaftLogEntry[];
  leaderCommit: number;
}

/**
 * Raft append entries response
 */
export interface AppendEntriesResponse {
  term: number;
  success: boolean;
  matchIndex?: number;
}

/**
 * Raft request vote RPC
 */
export interface RequestVoteRequest {
  term: number;
  candidateId: string;
  lastLogIndex: number;
  lastLogTerm: number;
}

/**
 * Raft request vote response
 */
export interface RequestVoteResponse {
  term: number;
  voteGranted: boolean;
}

// =============================================================================
// SIMPLE MAJORITY TYPES
// =============================================================================

/**
 * Ballot for simple majority voting
 */
export interface Ballot<T = unknown> {
  proposalId: string;
  key: string;
  value: T;
  proposerId: string;
  deadline: number;
  votes: Map<string, boolean>;
  result?: ProposalResult<T>;
}

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Consensus event types
 */
export type ConsensusEventType =
  | 'proposal:created'
  | 'proposal:accepted'
  | 'proposal:rejected'
  | 'proposal:timeout'
  | 'vote:received'
  | 'leader:elected'
  | 'leader:lost'
  | 'state:changed'
  | 'node:joined'
  | 'node:left'
  | 'partition:detected'
  | 'partition:healed';

/**
 * Base consensus event
 */
export interface ConsensusEventBase {
  type: ConsensusEventType;
  timestamp: number;
}

/**
 * Proposal event
 */
export interface ProposalEvent extends ConsensusEventBase {
  type: 'proposal:created' | 'proposal:accepted' | 'proposal:rejected' | 'proposal:timeout';
  proposal: Proposal;
}

/**
 * Vote event
 */
export interface VoteEvent extends ConsensusEventBase {
  type: 'vote:received';
  vote: Vote;
}

/**
 * Leader event
 */
export interface LeaderEvent extends ConsensusEventBase {
  type: 'leader:elected' | 'leader:lost';
  leaderId: string;
  term?: number;
}

/**
 * State change event
 */
export interface StateChangeEvent extends ConsensusEventBase {
  type: 'state:changed';
  key: string;
  value: unknown;
  previousValue?: unknown;
}

/**
 * Node membership event
 */
export interface NodeEvent extends ConsensusEventBase {
  type: 'node:joined' | 'node:left';
  node: ConsensusNode;
}

/**
 * Partition event
 */
export interface PartitionEvent extends ConsensusEventBase {
  type: 'partition:detected' | 'partition:healed';
  affectedNodes: string[];
}

/**
 * Union of all consensus events
 */
export type ConsensusEvent =
  | ProposalEvent
  | VoteEvent
  | LeaderEvent
  | StateChangeEvent
  | NodeEvent
  | PartitionEvent;

// =============================================================================
// CONSENSUS PROTOCOL INTERFACE
// =============================================================================

/**
 * Interface for consensus protocol implementations
 */
export interface ConsensusProtocol {
  /** Protocol name */
  readonly name: ConsensusMechanism;

  /** Current node ID */
  readonly nodeId: string;

  /** Is this node the leader? */
  isLeader(): boolean;

  /** Get current leader ID */
  getLeaderId(): string | null;

  /** Propose a state change */
  propose<T>(key: string, value: T): Promise<ProposalResult<T>>;

  /** Get current value for key */
  get<T>(key: string): T | undefined;

  /** Get all state as a map */
  getState(): Map<string, unknown>;

  /** Add a node to the cluster */
  addNode(node: ConsensusNode): void;

  /** Remove a node from the cluster */
  removeNode(nodeId: string): void;

  /** Get all nodes */
  getNodes(): ConsensusNode[];

  /** Handle incoming message */
  handleMessage(fromNodeId: string, message: unknown): void;

  /** Start the protocol */
  start(): void;

  /** Stop the protocol */
  stop(): void;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate quorum size for a given cluster size
 */
export function calculateQuorum(clusterSize: number): number {
  return Math.floor(clusterSize / 2) + 1;
}

/**
 * Check if quorum is reached
 */
export function hasQuorum(votes: number, clusterSize: number, customQuorum?: number): boolean {
  const required = customQuorum || calculateQuorum(clusterSize);
  return votes >= required;
}

/**
 * Generate a unique proposal ID
 */
export function generateProposalId(nodeId: string): string {
  return `proposal-${nodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Check if proposal has expired
 */
export function isProposalExpired(proposal: Proposal, timeout: number): boolean {
  return Date.now() - proposal.timestamp > timeout;
}
