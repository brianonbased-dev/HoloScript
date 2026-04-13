/**
 * Consensus Module
 * Sprint 4 Priority 5 - Consensus Mechanisms
 *
 * Exports for multi-agent consensus protocols.
 */

// Types
export {
  // Configuration
  ConsensusMechanism,
  ConsensusConfig,
  DEFAULT_CONSENSUS_CONFIG,

  // Node types
  RaftNodeState,
  ConsensusNode,

  // Proposal types
  ProposalStatus,
  Proposal,
  Vote,
  ProposalResult,

  // Raft types
  RaftLogEntry,
  AppendEntriesRequest,
  AppendEntriesResponse,
  RequestVoteRequest,
  RequestVoteResponse,

  // Simple majority types
  Ballot,

  // Events
  ConsensusEventType,
  ConsensusEvent,
  ProposalEvent,
  VoteEvent,
  LeaderEvent,
  StateChangeEvent,
  NodeEvent,
  PartitionEvent,

  // Protocol interface
  ConsensusProtocol,

  // Utility functions
  calculateQuorum,
  hasQuorum,
  generateProposalId,
  isProposalExpired,
} from './ConsensusTypes';

// Simple Majority Consensus
export { ConsensusManager, ConsensusManagerEvents } from './ConsensusManager';

// Raft Consensus
export {
  RaftConsensus,
  RaftMessage,
  RaftMessageUnion,
  AppendEntriesMessage,
  AppendEntriesResponseMessage,
  RequestVoteMessage,
  RequestVoteResponseMessage,
} from './RaftConsensus';
