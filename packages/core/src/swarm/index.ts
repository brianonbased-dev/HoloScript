/**
 * @holoscript/core - Swarm Module
 *
 * Autonomous agent swarm coordination: ACO, leader election, swarm management.
 *
 * NOTE: Higher-level swarm primitives (SwarmCoordinator, PSOEngine,
 * CollectiveIntelligence, VotingRound, ContributionSynthesizer,
 * SwarmMembership, QuorumPolicy) have moved to `@holoscript/framework`.
 */
export * from './ACOEngine';
export * from './LeaderElection';
export * from './SwarmManager';
