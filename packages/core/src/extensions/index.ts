/**
 * Agent Extensions Module
 *
 * Extensibility interfaces for building advanced agent systems.
 * Consumers can implement these interfaces to add:
 * - Actor model (tell/ask, mailboxes, wake-on-demand)
 * - Self-healing (failure recovery, pattern learning)
 * - Marketplace (task auctions, bid selection)
 * - Collective intelligence (hive mind sessions)
 * - Swarm coordination (PSO/ACO optimization)
 */

// Actor Model
export type {
  IAgentRef,
  IAgentRefFactory,
  IAgentMailbox,
  IWakeOnDemandController,
} from './AgentExtensionTypes';

// Self-Healing
export type {
  FailureType,
  IAgentFailure,
  IRecoveryResult,
  IRecoveryStrategy,
  ISelfHealingService,
  FailurePattern,
} from './AgentExtensionTypes';

// Marketplace
export type {
  IHandoffRequest,
  IHandoffBid,
  IHandoffContract,
  IMarketplaceService,
  BidSelectionCriteria,
} from './AgentExtensionTypes';

// Collective Intelligence
export type {
  IHiveContribution,
  IHiveSession,
  ICollectiveIntelligenceService,
} from './AgentExtensionTypes';

// Swarm
export type {
  ISwarmConfig,
  ISwarmResult,
  ISwarmCoordinator,
  ILeaderElection,
} from './AgentExtensionTypes';

// Base implementations
export { BaseAgentRef } from './BaseAgentRef';
export { BaseMailbox } from './BaseMailbox';
export { BaseRecoveryStrategy } from './BaseRecoveryStrategy';
