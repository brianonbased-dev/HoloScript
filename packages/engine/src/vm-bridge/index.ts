/**
 * VM Bridge - Bridges HoloVM with uAAL cognitive agent VM
 *
 * Merged from @holoscript/vm-bridge into @holoscript/engine (A.011.01k).
 *
 * @packageDocumentation
 */

export { captureSceneSnapshot, applyActions, SpatialCognitiveAgent } from './bridge';
export type {
  EntitySnapshot,
  SceneSnapshot,
  AgentAction,
  BridgeConfig,
  CognitiveTickResult,
} from './bridge';
