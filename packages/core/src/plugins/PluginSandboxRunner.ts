/**
 * PluginSandboxRunner — Server-side sandboxed plugin execution
 *
 * Uses Node.js vm.createContext() for true VM-level isolation,
 * unlike the Function-constructor approach in SandboxExecutor.
 *
 * Features:
 * - vm.createContext() isolation with configurable global whitelist
 * - PermissionSet for fine-grained capability control
 * - CapabilityBudget (CPU ms, memory estimation)
 * - Plugin API registration (registerTool, registerHandler, emitEvent)
 * - Telemetry integration via TelemetryCollector
 *
 * Part of HoloScript v5.7 "Open Ecosystem".
 *
 * @version 1.0.0
 */

import type { TelemetryCollector } from '../debug/TelemetryCollector';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Permission categories that a sandboxed plugin can request.
 */
export type SandboxPermission =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'network:fetch'
  | 'network:listen'
  | 'tool:register'
  | 'tool:call'
  | 'handler:register'
  | 'event:emit'
  | 'scene:read'
  | 'scene:write'
  | 'storage:local';

/**
 * Resource budget for a sandboxed plugin.
 */
export interface CapabilityBudget {
  /** Max CPU time per execution in milliseconds */
  maxCpuTimeMs: number;
  /** Max estimated memory in MB */
  maxMemoryMB: number;
  /** Max number of API calls per minute */
  maxApiCallsPerMinute: number;
  /** Max number of registered tools */
  maxTools: number;
  /** Max number of registered handlers */
  maxHandlers: number;
}

/**
 * Configuration for a plugin sandbox runner instance.
 */
export interface PluginSandboxRunnerConfig {
  /** Unique plugin ID */
  pluginId: string;
  /** Permissions granted to this plugin */
  permissions: Set<SandboxPermission>;
  /** Resource budget */
  budget: CapabilityBudget;
  /** Optional telemetry collector for event emission */
  telemetry?: TelemetryCollector;
}

/**
 * A tool registered by a sandboxed plugin.
 */
export interface SandboxTool {
  name: string;
  description: string;
  handler: (...args: unknown[]) => unknown;
  pluginId: string;
}

/**
 * A handler registered by a sandboxed plugin.
 */
export interface SandboxHandler {
  event: string;
  handler: (...args: unknown[]) => void;
  pluginId: string;
}

/**
 * Result of executing code in a sandbox.
 */
export interface SandboxRunResult {
  success: boolean;
  result?: unknown;
  error?: string;
  cpuTimeMs: number;
  apiCalls: number;
}

export type SandboxRunnerState = 'idle' | 'running' | 'destroyed';

// =============================================================================
// DEFAULT BUDGET
// =============================================================================

export const DEFAULT_CAPABILITY_BUDGET: CapabilityBudget = {
  maxCpuTimeMs: 5000,
  maxMemoryMB: 64,
  maxApiCallsPerMinute: 100,
  maxTools: 20,
  maxHandlers: 50,
};

// =============================================================================
// SAFE GLOBALS WHITELIST
// =============================================================================

const SAFE_GLOBALS: Record<string, unknown> = {
  Math,
  JSON,
  String,
  Number,
  Boolean,
  Array,
  Object,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Date,
  RegExp,
  Error,
  TypeError,
  RangeError,
  SyntaxError,
  ReferenceError,
  URIError,
  Promise,
  Symbol,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  undefined,
  NaN,
  Infinity,
  ArrayBuffer,
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  DataView,
  TextEncoder,
  TextDecoder,
};

// =============================================================================
// PLUGIN SANDBOX RUNNER
// =============================================================================

export class PluginSandboxRunner {
  readonly pluginId: string;
  private permissions: Set<SandboxPermission>;
  private budget: CapabilityBudget;
  private telemetry?: TelemetryCollector;
  private state: SandboxRunnerState = 'idle';

  // Registered plugin APIs
  private tools: Map<string, SandboxTool> = new Map();
  private handlers: Map<string, SandboxHandler[]> = new Map();

  // Rate limiting
  private apiCallCount = 0;
  private apiCallWindowStart = Date.now();

  // Console capture
  private consoleLogs: string[] = [];

  constructor(config: PluginSandboxRunnerConfig) {
    this.pluginId = config.pluginId;
    this.permissions = new Set(config.permissions);
    this.budget = { ...config.budget };
    this.telemetry = config.telemetry;
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  getState(): SandboxRunnerState {
    return this.state;
  }

  destroy(): void {
    this.tools.clear();
    this.handlers.clear();
    this.consoleLogs = [];
    this.state = 'destroyed';

    this.telemetry?.record({
      type: 'plugin_destroyed',
      severity: 'info',
      agentId: this.pluginId,
      data: { pluginId: this.pluginId },
    });
  }

  // ===========================================================================
  // PERMISSION CHECKING
  // ===========================================================================

  hasPermission(permission: SandboxPermission): boolean {
    return this.permissions.has(permission);
  }

  getPermissions(): SandboxPermission[] {
    return [...this.permissions];
  }

  private requirePermission(permission: SandboxPermission): void {
    if (!this.permissions.has(permission)) {
      throw new Error(`Plugin "${this.pluginId}" lacks permission: ${permission}`);
    }
  }

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  private checkRateLimit(): void {
    const now = Date.now();
    if (now - this.apiCallWindowStart > 60_000) {
      this.apiCallCount = 0;
      this.apiCallWindowStart = now;
    }
    this.apiCallCount++;
    if (this.apiCallCount > this.budget.maxApiCallsPerMinute) {
      throw new Error(
        `Plugin "${this.pluginId}" exceeded API rate limit (${this.budget.maxApiCallsPerMinute}/min)`
      );
    }
  }

  // ===========================================================================
  // PLUGIN API — TOOL REGISTRATION
  // ===========================================================================

  registerTool(name: string, description: string, handler: (...args: unknown[]) => unknown): void {
    this.requirePermission('tool:register');
    this.checkRateLimit();

    if (this.tools.size >= this.budget.maxTools) {
      throw new Error(`Plugin "${this.pluginId}" exceeded max tools (${this.budget.maxTools})`);
    }

    const qualifiedName = `plugin:${this.pluginId}:${name}`;
    this.tools.set(qualifiedName, {
      name: qualifiedName,
      description,
      handler,
      pluginId: this.pluginId,
    });

    this.telemetry?.record({
      type: 'plugin_tool_registered',
      severity: 'info',
      agentId: this.pluginId,
      data: { toolName: qualifiedName },
    });
  }

  getTool(name: string): SandboxTool | undefined {
    return this.tools.get(name);
  }

  getTools(): SandboxTool[] {
    return [...this.tools.values()];
  }

  // ===========================================================================
  // PLUGIN API — HANDLER REGISTRATION
  // ===========================================================================

  registerHandler(event: string, handler: (...args: unknown[]) => void): void {
    this.requirePermission('handler:register');
    this.checkRateLimit();

    const totalHandlers = Array.from(this.handlers.values()).reduce((s, arr) => s + arr.length, 0);
    if (totalHandlers >= this.budget.maxHandlers) {
      throw new Error(
        `Plugin "${this.pluginId}" exceeded max handlers (${this.budget.maxHandlers})`
      );
    }

    const list = this.handlers.get(event) || [];
    list.push({ event, handler, pluginId: this.pluginId });
    this.handlers.set(event, list);
  }

  getHandlers(event: string): SandboxHandler[] {
    return this.handlers.get(event) || [];
  }

  // ===========================================================================
  // PLUGIN API — EVENT EMISSION
  // ===========================================================================

  emitEvent(event: string, payload?: unknown): void {
    this.requirePermission('event:emit');
    this.checkRateLimit();

    this.telemetry?.record({
      type: 'plugin_event',
      severity: 'info',
      agentId: this.pluginId,
      data: { event, payload },
    });

    const handlers = this.handlers.get(event) || [];
    for (const h of handlers) {
      try {
        h.handler(payload);
      } catch {
        // non-fatal handler errors
      }
    }
  }

  // ===========================================================================
  // CODE EXECUTION
  // ===========================================================================

  /**
   * Execute code in a sandboxed VM context.
   *
   * Uses vm.createContext() for isolation. The sandbox provides:
   * - Safe global builtins (Math, JSON, String, etc.)
   * - Plugin API: registerTool(), registerHandler(), emitEvent()
   * - Captured console output
   * - CPU time enforcement via timeout
   */
  async execute(code: string): Promise<SandboxRunResult> {
    if (this.state === 'destroyed') {
      return { success: false, error: 'Sandbox has been destroyed', cpuTimeMs: 0, apiCalls: 0 };
    }
    if (this.state === 'running') {
      return { success: false, error: 'Sandbox is already running', cpuTimeMs: 0, apiCalls: 0 };
    }

    // Estimate memory
    const estimatedMB = (code.length * 8) / (1024 * 1024);
    if (estimatedMB > this.budget.maxMemoryMB) {
      return {
        success: false,
        error: `Estimated memory (${estimatedMB.toFixed(1)}MB) exceeds budget (${this.budget.maxMemoryMB}MB)`,
        cpuTimeMs: 0,
        apiCalls: 0,
      };
    }

    this.state = 'running';
    const startApiCalls = this.apiCallCount;
    const startTime = Date.now();
    this.consoleLogs = [];

    const span = this.telemetry?.startSpan('plugin_execute', {
      agentId: this.pluginId,
      kind: 'internal',
    });

    try {
      // Build sandbox context
      const vm = require('vm') as typeof import('vm');
      const context = vm.createContext({
        ...SAFE_GLOBALS,
        console: this.createSafeConsole(),
        // Plugin API surface
        registerTool: this.hasPermission('tool:register')
          ? (name: string, desc: string, handler: (...args: unknown[]) => unknown) =>
              this.registerTool(name, desc, handler)
          : undefined,
        registerHandler: this.hasPermission('handler:register')
          ? (event: string, handler: (...args: unknown[]) => void) =>
              this.registerHandler(event, handler)
          : undefined,
        emitEvent: this.hasPermission('event:emit')
          ? (event: string, payload?: unknown) => this.emitEvent(event, payload)
          : undefined,
        setTimeout: undefined,
        setInterval: undefined,
        setImmediate: undefined,
        clearTimeout: undefined,
        clearInterval: undefined,
        clearImmediate: undefined,
        process: undefined,
        require: undefined,
        module: undefined,
        exports: undefined,
        __dirname: undefined,
        __filename: undefined,
        globalThis: undefined,
        global: undefined,
      });

      const script = new vm.Script(code, {
        filename: `plugin:${this.pluginId}`,
      });

      const result = script.runInContext(context, {
        timeout: this.budget.maxCpuTimeMs,
      });

      const cpuTimeMs = Date.now() - startTime;
      this.state = 'idle';

      if (span) {
        this.telemetry?.endSpan(span.id, 'ok');
      }

      return {
        success: true,
        result,
        cpuTimeMs,
        apiCalls: this.apiCallCount - startApiCalls,
      };
    } catch (err) {
      const cpuTimeMs = Date.now() - startTime;
      this.state = 'idle';

      if (span) {
        this.telemetry?.addSpanEvent(span.id, 'error', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.telemetry?.endSpan(span.id, 'error');
      }

      const errorMessage = err instanceof Error ? err.message : String(err);
      const isTimeout = errorMessage.includes('Script execution timed out');

      return {
        success: false,
        error: isTimeout
          ? `CPU time limit exceeded (${this.budget.maxCpuTimeMs}ms)`
          : `Sandbox error: ${errorMessage}`,
        cpuTimeMs,
        apiCalls: this.apiCallCount - startApiCalls,
      };
    }
  }

  // ===========================================================================
  // CONSOLE CAPTURE
  // ===========================================================================

  private createSafeConsole(): Record<string, (...args: unknown[]) => void> {
    const capture = (...args: unknown[]) => {
      const msg = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');
      this.consoleLogs.push(msg);
    };
    return { log: capture, info: capture, warn: capture, error: capture, debug: capture };
  }

  getConsoleLogs(): string[] {
    return [...this.consoleLogs];
  }

  // ===========================================================================
  // INTROSPECTION
  // ===========================================================================

  getStats(): {
    pluginId: string;
    state: SandboxRunnerState;
    toolCount: number;
    handlerCount: number;
    apiCallCount: number;
    permissions: SandboxPermission[];
  } {
    return {
      pluginId: this.pluginId,
      state: this.state,
      toolCount: this.tools.size,
      handlerCount: Array.from(this.handlers.values()).reduce((s, arr) => s + arr.length, 0),
      apiCallCount: this.apiCallCount,
      permissions: [...this.permissions],
    };
  }
}
