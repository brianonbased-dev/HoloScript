// =============================================================================
// Trait Runtime Integration (migrated from Hololand platform-core)
// =============================================================================

export type {
  PhysicsProvider,
  AudioProvider,
  HapticsProvider,
  AccessibilityProvider,
  VRProvider,
  NetworkProvider,
  RendererProvider,
  TraitContextFactoryConfig,
} from '@holoscript/engine/runtime/TraitContextFactory';

// Mathematical utilities
export {
  calculateAverage,
  calculateSuccessRate,
  calculateStandardDeviation,
  calculateMedian,
} from '../utils/math';

// ── Error Recovery (Parser Error-Handling & Suggestions) ────────────────────
export {
  ErrorRecovery,
  HOLOSCHEMA_KEYWORDS,
  HOLOSCHEMA_GEOMETRIES,
  HOLOSCHEMA_PROPERTIES,
} from '../parser/ErrorRecovery';

// ── Stdlib (General-Purpose I/O Action Handlers for BehaviorTree) ───────────
export {
  createStdlibActions,
  registerStdlib,
  DEFAULT_STDLIB_POLICY,
  resolveRepoRelativePath,
  isPathAllowed,
  parseHostFromUrl,
  truncateText,
  toStringArray,
} from '../stdlib';
export type { StdlibPolicy, StdlibOptions } from '../stdlib';

export type {
  DepthBackend,
  DepthEstimationConfig,
  DepthResult,
  DepthSequenceConfig,
  GIFFrame,
  GIFDecomposerConfig,
  QuiltConfig,
  QuiltTile,
  QuiltCompilationResult,
  MVHEVCConfig,
  MVHEVCStereoView,
  MVHEVCCompilationResult,
  WebCodecsDepthConfig,
  WebCodecsDepthStats,
} from '@holoscript/engine/hologram';

// ── @script_test Trait (Headless Unit Testing for .hs Logic) ────────────────
export {
  ScriptTestRunner,
  SCRIPT_TEST_TRAIT,
  type ScriptTestResult,
  type ScriptTestBlock,
  type ScriptTestRunnerOptions,
} from '../traits/ScriptTestTrait';

export {
  CompositionTestRunner,
  testHandler,
  TEST_TRAIT,
  type CompositionTestConfig,
} from '../traits/TestTrait';

// ── Python/JS Interop Binding Generator ─────────────────────────────────────
export {
  InteropBindingGenerator,
  type BindingExport,
  type BindingParameter,
  type GeneratedBinding,
} from '../interop/InteropBindingGenerator';

// ── Interoperability (Module Resolution, Async, Error Boundaries) ───────────
export {
  ModuleResolver,
  ExportImportHandler,
  AsyncFunctionHandler,
  ErrorBoundary,
  TypeScriptTypeLoader,
  InteropContext,
} from '../interop/Interoperability';

// ── MCP Circuit Breaker (Resilient MCP Tool Calls) ──────────────────────────
export {
  MCPCircuitBreaker,
  getMCPCircuitBreaker,
  type MCPToolCallOptions,
  type MCPToolResult,
} from '../mcp/MCPCircuitBreaker';

// ── Resilience Patterns (Circuit Breaker, Retry, Timeout) ───────────────────
export {
  CircuitBreaker as ResilienceCircuitBreaker,
  CircuitBreakerState,
  retryWithBackoff,
  withTimeout,
} from '../resilience/ResiliencePatterns';

// ── @absorb Trait (Reverse-Mode: Legacy → .hsplus) ──────────────────────────
export {
  AbsorbProcessor,
  ABSORB_TRAIT,
  type AbsorbSource,
  type AbsorbResult,
  type AbsorbedFunction,
  type AbsorbedClass,
  type AbsorbedImport,
} from '../traits/AbsorbTrait';

// ── @hot_reload Trait (Live-Reload .hs Files on Disk Change) ────────────────
export {
  HotReloadWatcher,
  HOT_RELOAD_TRAIT,
  type HotReloadConfig,
  type HotReloadEvent,
  type HotReloadCallback,
} from '../traits/HotReloadTrait';
