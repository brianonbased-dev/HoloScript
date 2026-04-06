/**
 * @holoscript/core - Agents Module
 *
 * @deprecated The canonical agents module has moved to `@holoscript/framework`.
 * These re-exports exist to avoid breaking existing consumers.
 * Migrate your imports to `@holoscript/framework`:
 *
 * ```ts
 * // Before
 * import { AgentRegistry } from '@holoscript/core';
 *
 * // After
 * import { AgentRegistry } from '@holoscript/framework';
 * ```
 *
 * This shim will be removed in a future major version.
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
  type DelegationRequest,
  type DelegationResult,
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
// Canonical source: @holoscript/framework — re-exported here for backward compat
export { OrchestratorAgent, type OrchestratorConfig } from '@holoscript/framework';

// AgentKit Integration moved to @holoscript/marketplace-api/agents
// Import from '@holoscript/marketplace-api' instead.
