/**
 * Swarm Module
 *
 * Autonomous agent swarm coordination, optimization, and leader election.
 */

// Core coordinator
export { SwarmCoordinator } from './SwarmCoordinator';
export type { AgentInfo, TaskInfo } from './SwarmCoordinator';

// Optimization engines
export { PSOEngine } from './PSOEngine';
export type { PSOConfig, PSOResult, Particle } from './PSOEngine';

export { ACOEngine } from './ACOEngine';
export type { ACOConfig, ACOResult } from './ACOEngine';

// Leader election
export { LeaderElection } from './LeaderElection';
export type {
  LeaderElectionConfig,
  ElectionRole,
  ElectionState,
  ElectionMessage,
  VoteRequestMessage,
  VoteResponseMessage,
  HeartbeatMessage,
} from './LeaderElection';

// Collective intelligence
export { CollectiveIntelligence } from './CollectiveIntelligence';
export type { CollectiveIntelligenceConfig } from './CollectiveIntelligence';

export { VotingRound } from './VotingRound';
export type { Vote, VotingResult, VotingRoundConfig } from './VotingRound';

export { ContributionSynthesizer } from './ContributionSynthesizer';
export type { SynthesisResult, SynthesizerConfig } from './ContributionSynthesizer';

// Swarm lifecycle
export { SwarmManager } from './SwarmManager';
export type {
  SwarmInfo,
  CreateSwarmRequest,
  DisbandOptions,
  SwarmManagerConfig,
  SwarmEvent,
} from './SwarmManager';

export { SwarmMembership } from './SwarmMembership';
export type {
  MemberInfo,
  JoinRequest,
  LeaveRequest,
  MembershipEvent,
  SwarmMembershipConfig,
} from './SwarmMembership';

export { QuorumPolicy } from './QuorumPolicy';
export type { QuorumConfig, QuorumStatus, QuorumState } from './QuorumPolicy';

// Spatial behaviors
export * from './spatial';

// Messaging
export * from './messaging';

// Analytics
export * from './analytics';
