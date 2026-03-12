/**
 * Sandbox Executor
 *
 * Provides a sandboxed execution environment for HoloScript code.
 * Enforces memory limits, CPU time limits, and file system restrictions
 * as defined by a SecurityPolicy.
 *
 * @version 9.0.0
 * @sprint Sprint 9: Security Hardening
 */

import type { SecurityPolicy } from './SecurityPolicy';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Current state of a sandbox.
 */
export type SandboxState = 'idle' | 'running' | 'timeout' | 'error' | 'destroyed';

/**
 * Sandbox execution environment with resource tracking.
 */
export interface Sandbox {
  /** Unique identifier for this sandbox instance */
  id: string;
  /** Current state of the sandbox */
  state: SandboxState;
  /** The security policy governing this sandbox */
  policy: SecurityPolicy;
  /** Memory usage tracking in bytes */
  memoryUsed: number;
  /** CPU time consumed in milliseconds */
  cpuTimeUsed: number;
  /** When the sandbox was created */
  createdAt: number;
  /** Internal timeout handle (for cleanup) */
  _timeoutHandle?: ReturnType<typeof setTimeout>;
  /** Internal execution context */
  _context: Map<string, unknown>;
}

/**
 * Result of sandbox code execution.
 */
export interface SandboxExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Return value from execution (if any) */
  result?: unknown;
  /** Error message if execution failed */
  error?: string;
  /** Memory used during execution in bytes */
  memoryUsed: number;
  /** CPU time consumed in milliseconds */
  cpuTimeUsed: number;
}

// =============================================================================
// SANDBOX LIFECYCLE
// =============================================================================

/** Counter for generating unique sandbox IDs */
let sandboxCounter = 0;

/**
 * Create a new sandbox execution environment governed by the given policy.
 *
 * The sandbox enforces:
 * - Memory limits (tracked via estimation)
 * - CPU time limits (enforced via setTimeout)
 * - File system access restrictions
 *
 * @param policy - Security policy to enforce
 * @returns A new Sandbox instance in 'idle' state
 */
export function createSandbox(policy: SecurityPolicy): Sandbox {
  sandboxCounter++;
  return {
    id: `sandbox-${sandboxCounter}-${Date.now()}`,
    state: 'idle',
    policy,
    memoryUsed: 0,
    cpuTimeUsed: 0,
    createdAt: Date.now(),
    _context: new Map(),
  };
}

/**
 * Execute code within a sandbox, enforcing time and memory limits.
 *
 * The executor:
 * 1. Validates the sandbox is in a valid state
 * 2. Sets a CPU time limit via setTimeout
 * 3. Runs the code in a restricted scope
 * 4. Tracks memory usage (estimated from code size)
 * 5. Returns execution results
 *
 * @param code - The code string to execute
 * @param sandbox - The sandbox environment to use
 * @returns Execution result with timing and memory data
 */
export async function execute(code: string, sandbox: Sandbox): Promise<SandboxExecutionResult> {
  if (sandbox.state === 'destroyed') {
    return {
      success: false,
      error: 'Sandbox has been destroyed',
      memoryUsed: 0,
      cpuTimeUsed: 0,
    };
  }

  if (sandbox.state === 'running') {
    return {
      success: false,
      error: 'Sandbox is already executing code',
      memoryUsed: sandbox.memoryUsed,
      cpuTimeUsed: sandbox.cpuTimeUsed,
    };
  }

  sandbox.state = 'running';
  const startTime = Date.now();

  // Estimate memory usage from code size (rough heuristic)
  const estimatedMemory = estimateMemoryUsage(code);
  const memoryLimitBytes = sandbox.policy.sandbox.memoryLimit * 1024 * 1024;

  if (estimatedMemory > memoryLimitBytes) {
    sandbox.state = 'error';
    return {
      success: false,
      error: `Memory limit exceeded: estimated ${formatBytes(estimatedMemory)} exceeds limit of ${sandbox.policy.sandbox.memoryLimit}MB`,
      memoryUsed: estimatedMemory,
      cpuTimeUsed: 0,
    };
  }

  // Set up CPU time limit
  const cpuTimeLimitMs = sandbox.policy.sandbox.cpuTimeLimit * 1000;
  let timedOut = false;

  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    sandbox._timeoutHandle = setTimeout(() => {
      timedOut = true;
      resolve('timeout');
    }, cpuTimeLimitMs);
  });

  // Execute code in restricted scope
  const executionPromise = executeRestricted(code, sandbox);

  try {
    const raceResult = await Promise.race([executionPromise, timeoutPromise]);

    const elapsed = Date.now() - startTime;
    sandbox.cpuTimeUsed += elapsed;
    sandbox.memoryUsed += estimatedMemory;

    if (raceResult === 'timeout' || timedOut) {
      sandbox.state = 'timeout';
      clearTimeoutHandle(sandbox);
      return {
        success: false,
        error: `CPU time limit exceeded: ${sandbox.policy.sandbox.cpuTimeLimit}s`,
        memoryUsed: sandbox.memoryUsed,
        cpuTimeUsed: elapsed,
      };
    }

    sandbox.state = 'idle';
    clearTimeoutHandle(sandbox);

    return {
      success: true,
      result: raceResult,
      memoryUsed: sandbox.memoryUsed,
      cpuTimeUsed: elapsed,
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    sandbox.cpuTimeUsed += elapsed;
    sandbox.state = 'error';
    clearTimeoutHandle(sandbox);

    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      memoryUsed: sandbox.memoryUsed,
      cpuTimeUsed: elapsed,
    };
  }
}

/**
 * Destroy a sandbox, releasing all resources.
 *
 * After destruction, the sandbox cannot be reused.
 */
export function destroy(sandbox: Sandbox): void {
  clearTimeoutHandle(sandbox);
  sandbox._context.clear();
  sandbox.state = 'destroyed';
  sandbox.memoryUsed = 0;
  sandbox.cpuTimeUsed = 0;
}

// =============================================================================
// INTERNAL EXECUTION
// =============================================================================

/**
 * Execute code in a restricted scope.
 *
 * Creates a minimal execution environment that:
 * - Blocks access to dangerous globals (process, require, __dirname, etc.)
 * - Provides only safe built-in functions (Math, JSON, String, etc.)
 * - Catches and wraps errors
 */
async function executeRestricted(code: string, sandbox: Sandbox): Promise<unknown> {
  // Build a safe scope with allowed globals only
  const safeGlobals: Record<string, unknown> = {
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    Date,
    RegExp,
    Error,
    TypeError,
    RangeError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
    NaN,
    Infinity,
    console: createSafeConsole(sandbox),
  };

  // Store execution context
  sandbox._context.set('globals', safeGlobals);
  sandbox._context.set('code', code);

  try {
    // Use Function constructor with blocked dangerous globals
    // This is intentional - we are creating a sandboxed Function, not arbitrary eval
    const blockedGlobals = [
      'process',
      'require',
      'module',
      'exports',
      '__dirname',
      '__filename',
      'globalThis',
      'global',
      'window',
      'document',
      'XMLHttpRequest',
      'fetch',
      'WebSocket',
      'Worker',
      'SharedWorker',
      'importScripts',
    ];

    const argNames = [...Object.keys(safeGlobals), ...blockedGlobals];
    const argValues: unknown[] = [
      ...Object.values(safeGlobals),
      ...blockedGlobals.map(() => undefined),
    ];

    // Create sandboxed function
     
    const sandboxedFn = new Function(...argNames, `"use strict";\n${code}`);
    const result = sandboxedFn(...argValues);

    // Handle async results
    if (result instanceof Promise) {
      return await result;
    }
    return result;
  } catch (err) {
    throw new Error(`Sandbox execution error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Create a safe console object that captures output without side effects.
 */
function createSafeConsole(sandbox: Sandbox): Record<string, (...args: unknown[]) => void> {
  const logs: string[] = [];
  const captureLog = (...args: unknown[]) => {
    const message = args.map((a) => String(a)).join(' ');
    logs.push(message);
    // Track memory from console output
    sandbox.memoryUsed += message.length * 2; // Rough UTF-16 estimate
  };

  sandbox._context.set('logs', logs);

  return {
    log: captureLog,
    info: captureLog,
    warn: captureLog,
    error: captureLog,
    debug: captureLog,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Estimate memory usage of code string in bytes.
 * Uses a heuristic based on string length and estimated runtime overhead.
 */
function estimateMemoryUsage(code: string): number {
  // Base: UTF-16 string size + parsing overhead (~3x for AST)
  const stringBytes = code.length * 2;
  const overhead = stringBytes * 3;
  return stringBytes + overhead;
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Safely clear a sandbox timeout handle.
 */
function clearTimeoutHandle(sandbox: Sandbox): void {
  if (sandbox._timeoutHandle) {
    clearTimeout(sandbox._timeoutHandle);
    sandbox._timeoutHandle = undefined;
  }
}
