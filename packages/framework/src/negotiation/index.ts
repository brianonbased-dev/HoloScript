/**
 * @holoscript/core - Negotiation Module
 *
 * Multi-agent negotiation and consensus building system.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

// Negotiation Types
export {
  type NegotiationStatus,
  type VotingMechanism,
  type TieBreaker,
  type ResolutionOutcome,
  type ProposalStatus,
  type NegotiationConfig,
  type Proposal,
  type ProposalInput,
  type Vote,
  type VoteInput,
  type VoteTally,
  type Resolution,
  type NegotiationSession,
  type InitiateOptions,
  type NegotiationEvents,
} from './NegotiationTypes';

// Voting Mechanisms
export {
  type VotingResult,
  type VotingHandler,
  majorityHandler,
  supermajorityHandler,
  weightedHandler,
  consensusHandler,
  rankedHandler,
  approvalHandler,
  bordaHandler,
  getVotingHandler,
  checkQuorum,
  getTrustWeight,
} from './VotingMechanisms';

// Negotiation Protocol
export {
  type AuditEntry,
  NegotiationProtocol,
  getNegotiationProtocol,
  resetNegotiationProtocol,
} from './NegotiationProtocol';
