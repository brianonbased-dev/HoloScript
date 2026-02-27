/**
 * @holoscript/core - Agents Module
 *
 * Multi-agent orchestration and choreography system.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

// Agent Types (uAA2++ Protocol)
export * from './AgentTypes';

// Agent Manifest (Registration declarations)
export {
  type AgentManifest,
  type AgentCapability,
  type AgentEndpoint,
  type SpatialScope,
  type BoundingBox,
  type Vector3,
  type TrustLevel,
  type VerificationStatus,
  type ResourceCost,
  type LatencyProfile,
  type CapabilityType,
  type CapabilityDomain,
  type EndpointProtocol,
  type ValidationResult as AgentValidationResult,
  LATENCY_THRESHOLDS,
  AgentManifestBuilder,
  createManifest as createAgentManifest,
  validateManifest,
} from './AgentManifest';

// Capability Matcher (Query & Discovery)
export {
  type CapabilityQuery,
  type SpatialQuery,
  type CapabilityMatch,
  type AgentMatch,
  CapabilityMatcher,
  defaultMatcher,
  findAgents,
  findBestAgent,
} from './CapabilityMatcher';

// Agent Registry (Central Registration)
export {
  type DiscoveryMode,
  type RegistryConfig as AgentRegistryConfig,
  type RegistryEvents,
  DEFAULT_REGISTRY_CONFIG,
  AgentRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
} from './AgentRegistry';

// AgentKit Integration (Transactions/Wallets)
export {
  AgentKitIntegration,
  type AgentKitOptions,
  type AgentWallet,
  type AgentTransaction,
} from './AgentKitIntegration';
