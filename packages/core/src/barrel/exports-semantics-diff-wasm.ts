// =============================================================================
// Semantic Annotation System (Hololand Integration)
// =============================================================================

export * from '../semantics';

// =============================================================================
// Hololand Consumer Integration (Legacy Namespace)
// =============================================================================

export * as hololand from '../hololand';

// =============================================================================
// Semantic Diff Engine (Sprint 2 - Visual Diff Tools)
// =============================================================================

export {
  SemanticDiffEngine,
  semanticDiff,
  formatDiffResult,
  diffToJSON,
  type ChangeType as DiffChangeType,
  type DiffChange,
  type SemanticDiffResult,
  type DiffOptions,
} from '../diff';

// WoT Thing Trait Handler
export {
  wotThingHandler,
  hasWoTThingTrait,
  getWoTThingState,
  getCachedThingDescription,
  invalidateThingDescription,
  type WoTThingConfig as WoTThingTraitConfig,
  type WoTThingState,
} from '../traits/WoTThingTrait';

// MQTT Source Trait Handler
export {
  mqttSourceHandler,
  hasMQTTSourceTrait,
  getMQTTSourceState,
  getMQTTSourceClient,
  isMQTTSourceConnected,
  type MQTTSourceConfig,
  type MQTTSourceState,
} from '../traits/MQTTSourceTrait';

// MQTT Sink Trait Handler
export {
  mqttSinkHandler,
  hasMQTTSinkTrait,
  getMQTTSinkState,
  getMQTTSinkClient,
  isMQTTSinkConnected,
  publishToMQTTSink,
  type MQTTSinkConfig,
  type MQTTSinkState,
} from '../traits/MQTTSinkTrait';

// =============================================================================
// WASM Parser Bridge (v3.3 Performance Optimization)
// =============================================================================

export * as wasm from '../wasm';
export { WasmModuleCache, type CachedModule, type WasmModuleCacheConfig } from '../wasm';
// ParseResult also exists on HoloScriptCodeParser (legacy barrel) — distinct alias for WASM bridge
export {
  WasmParserBridge,
  type ParseResult as WasmParserParseResult,
  type WasmParserConfig,
} from '../wasm';
