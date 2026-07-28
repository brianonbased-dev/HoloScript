/**
 * VM Bridge - Bridges HoloVM with uAAL cognitive agent VM
 *
 * Merged from @holoscript/vm-bridge into @holoscript/engine (A.011.01k).
 *
 * @packageDocumentation
 */

export {
  captureSceneSnapshot,
  applyActions,
  SpatialCognitiveAgent,
  executeN4TypedMoveRoundTrip,
} from './bridge';
export type {
  EntitySnapshot,
  SceneSnapshot,
  AgentAction,
  BridgeConfig,
  CognitiveTickResult,
  N4RoundTripCustody,
  N4OwnedRuntimeRoundTrip,
} from './bridge';

// Agent lifecycle/registry layer (G5 join) — service over the bridge primitives.
export { InMemoryAgentRegistry } from './agent-registry';
export type { IAgentRegistry, RegisteredAgent } from './agent-registry';

export { SpatialAgentService, spawnConfigFromMarketplaceInstall } from './spatial-agent-service';
export type {
  SpawnAgentConfig,
  SpatialAgentServiceConfig,
  MarketplaceInstallResult,
} from './spatial-agent-service';
