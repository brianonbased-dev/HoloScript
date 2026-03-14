/**
 * @holoscript/core/interop
 *
 * Sub-barrel for interop and resilience modules:
 * - Python/JS interop bindings
 * - MCP circuit breaker
 * - Resilience patterns
 */

// ── Interop Binding Generator ───────────────────────────────────────────────
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

// ── MCP Circuit Breaker ─────────────────────────────────────────────────────
export {
  MCPCircuitBreaker,
  getMCPCircuitBreaker,
  type MCPToolCallOptions,
  type MCPToolResult,
} from '../mcp/MCPCircuitBreaker';

// ── Resilience Patterns ─────────────────────────────────────────────────────
export {
  CircuitBreaker as ResilienceCircuitBreaker,
  CircuitBreakerState,
  retryWithBackoff,
  withTimeout,
} from '../resilience/ResiliencePatterns';
