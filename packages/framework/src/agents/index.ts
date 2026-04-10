/**
 * @holoscript/framework - Agents Module
 *
 * Multi-agent orchestration and choreography system.
 * Migrated from @holoscript/core as part of A.011.02a.
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

// Federated Registry Adapter (v5.5 Cross-Composition Discovery)
export {
  FederatedRegistryAdapter,
  type FederatedRegistryConfig,
  type A2AAgentCard,
  type A2ASkill,
} from './FederatedRegistryAdapter';

// Task Delegation Service (v5.5 Cross-Agent Task Forwarding)
export {
  TaskDelegationService,
  type TaskDelegationConfig,
  type A2ATransportAdapter,
  type DelegationRequest,
  type DelegationResult,
  type DelegationTraceEvent,
  type DelegationTracePhase,
} from './TaskDelegationService';

// Skill Workflow Engine (v5.5 Skill Composition/Chaining)
export {
  SkillWorkflowEngine,
  type WorkflowDefinition,
  type WorkflowStep,
  type WorkflowInput,
  type WorkflowValidation,
  type WorkflowResult,
  type WorkflowStepResult,
  type SkillExecutor,
  type ProgressCallback,
} from './SkillWorkflowEngine';

// Orchestrator Agent (v5.5 First Concrete BaseAgent)
export { OrchestratorAgent, type OrchestratorConfig } from './OrchestratorAgent';

// Agent Wallet Registry (Autonomous wallet management)
export { AgentWalletRegistry, type AgentWallet } from './AgentWalletRegistry';

// Authenticated CRDT (DID-signed conflict-free state sync)
export * from './AuthenticatedCRDT';

// Cross-Reality Handoff Protocol
export * from './CrossRealityHandoff';

// Cultural Memory (Dual memory architecture)
export * from './CulturalMemory';

// Norm Engine (CRSEC norm lifecycle)
export * from './NormEngine';

// Spatial Communication Stack
export * from './spatial-comms';
