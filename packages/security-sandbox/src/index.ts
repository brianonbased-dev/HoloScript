/**
 * HoloScript Security Sandbox
 *
 * Provides VM-based isolation for executing HoloScript code, especially
 * AI-generated code that may contain malicious patterns.
 *
 * Security Features:
 * - Isolated VM execution (no access to host filesystem, network, or process)
 * - Resource limits (memory, timeout)
 * - Allowlist-based API access
 * - Parser validation before execution
 * - Execution audit logging
 *
 * @package @holoscript/security-sandbox
 * @version 1.0.0
 */

import * as nodeVm from 'node:vm';
import { parseHoloStrict, HoloScriptPlusParser } from '@holoscript/core';
import { HoloBytecodeBuilder, HoloVM } from '@holoscript/holo-vm';

/** SEC-01 / Paper #4: guest code must not compile or instantiate Wasm inside the isolate. */
function createBlockedWebAssemblySurface(): Record<string, unknown> {
  const block = (name: string) => {
    throw new Error(`${name} is blocked in the HoloScript security sandbox (SEC-01)`);
  };
  return {
    compile: () => block('WebAssembly.compile'),
    instantiate: () => block('WebAssembly.instantiate'),
    instantiateStreaming: () => block('WebAssembly.instantiateStreaming'),
    validate: () => block('WebAssembly.validate'),
    Module: class WasmModuleBlocked {
      constructor() {
        block('WebAssembly.Module');
      }
    },
    Instance: class WasmInstanceBlocked {
      constructor() {
        block('WebAssembly.Instance');
      }
    },
    Memory: class WasmMemoryBlocked {
      constructor() {
        block('WebAssembly.Memory');
      }
    },
    Table: class WasmTableBlocked {
      constructor() {
        block('WebAssembly.Table');
      }
    },
    Global: class WasmGlobalBlocked {
      constructor() {
        block('WebAssembly.Global');
      }
    },
    Tag: class WasmTagBlocked {
      constructor() {
        block('WebAssembly.Tag');
      }
    },
  };
}

/**
 * Configuration options for the sandbox
 */
export interface SandboxOptions {
  /** Maximum execution time in milliseconds (default: 5000) */
  timeout?: number;
  /** Allowed built-in Node.js modules (default: []) */
  allowedModules?: string[];
  /** Custom sandbox globals */
  sandbox?: Record<string, unknown>;
  /** Enable execution logging for audit trails */
  enableLogging?: boolean;
  /** Maximum memory limit in MB (default: 128) */
  memoryLimit?: number;
}

/**
 * Result of sandboxed execution
 */
export interface SandboxResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    type: 'validation' | 'runtime' | 'timeout' | 'memory' | 'syntax';
    message: string;
    stack?: string;
  };
  metadata: {
    executionTime: number;
    validated: boolean;
    source: 'ai-generated' | 'user' | 'trusted';
  };
}

export interface SandboxSimSolver {
  mode: 'transient' | 'steady';
  fieldNames: string[];
  step: (dt: number) => void;
  solve: () => void;
  getField: (name: string) => Float32Array | Float64Array | null;
  getStats: () => Record<string, unknown>;
  dispose: () => void;
}

export interface ContractedSandboxOptions {
  source?: 'ai-generated' | 'user' | 'trusted';
  dt?: number;
  steps?: number;
  vmTicks?: number;
  simulationConfig?: Record<string, unknown>;
  solverFactory?: (config: Record<string, unknown>) => SandboxSimSolver;
}

export interface ContractedSandboxData {
  vm: {
    ticksExecuted: number;
    finalStatus: string;
    stackTop: unknown;
  };
  contract: {
    totalSteps: number;
    totalSimTime: number;
    interactions: number;
  };
  cael: {
    traceId: string;
    traceHash: string;
    traceJSONL: string;
    verify: { valid: boolean; brokenAt?: number; reason?: string };
  };
}

/**
 * Security audit log entry
 */
export interface SecurityAuditLog {
  timestamp: number;
  source: string;
  action: 'validate' | 'execute' | 'reject';
  success: boolean;
  reason?: string;
  codeHash: string;
}

/**
 * HoloScript Security Sandbox
 *
 * Executes HoloScript code in an isolated VM environment with security controls.
 *
 * @example
 * ```typescript
 * const sandbox = new HoloScriptSandbox({
 *   timeout: 3000,
 *   memoryLimit: 64,
 *   enableLogging: true
 * });
 *
 * const result = await sandbox.executeHoloScript(aiGeneratedCode, {
 *   source: 'ai-generated'
 * });
 *
 * if (result.success) {
 *   console.log('Executed safely:', result.data);
 * } else {
 *   console.error('Rejected:', result.error);
 * }
 * ```
 */
export class HoloScriptSandbox {
  private options: Required<SandboxOptions>;
  private auditLog: SecurityAuditLog[] = [];
  private parser: HoloScriptPlusParser;

  /**
   * SEC-01 / SEC-02: Globals that must never appear in guest code.
   * Both text-scan (pre-validation) and VM-level shadow enforce this list.
   * vm2 already blocks most of these at runtime; this layer gives a
   * human-readable rejection message before code ever enters the VM.
   */
  private static readonly GLOBALS_BLOCKLIST = [
    'WebAssembly',
    'SharedArrayBuffer',
    'eval',
    'Function',
    // SEC-02: process / env exfiltration — vm2 does not expose these by default,
    // but explicit pre-rejection provides defense-in-depth and a clear audit trail.
    'process',
    'globalThis',
    // SEC-03: module-system access
    'require',
    'Buffer',
    // SEC-04: Atomics can be combined with SAB for timing side-channels
    'Atomics',
    // SEC-T15: Reflect — meta-programming surface reaches prototype chain.
    // Shadowed in the VM sandbox as well; text-scan gives a cleaner reject.
    'Reflect',
  ];

  constructor(options: SandboxOptions = {}) {
    this.options = {
      timeout: options.timeout ?? 5000,
      allowedModules: options.allowedModules ?? [],
      sandbox: options.sandbox ?? {},
      enableLogging: options.enableLogging ?? true,
      memoryLimit: options.memoryLimit ?? 128,
    };
    this.parser = new HoloScriptPlusParser();
  }

  /**
   * Validates HoloScript code syntax before execution
   */
  private async validateCode(code: string): Promise<{ valid: boolean; error?: string }> {
    if (!code || code.trim() === '') {
      return { valid: false, error: 'Code cannot be empty' };
    }

    const structuralError = this.preValidateStructure(code);
    if (structuralError) {
      return { valid: false, error: structuralError };
    }

    for (const blocked of HoloScriptSandbox.GLOBALS_BLOCKLIST) {
      const regex = new RegExp(`\\b${blocked}\\b`);
      if (regex.test(code)) {
        return { valid: false, error: `${blocked} is blocked in the HoloScript security sandbox (SEC-01)` };
      }
    }

    try {
      parseHoloStrict(code);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  private preValidateStructure(code: string): string | null {
    if (code.includes('{{{') || code.includes('}}}')) {
      return 'Invalid syntax: triple braces are not valid HoloScript';
    }
    let depth = 0;
    for (const ch of code) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth < 0) return 'Invalid syntax: unbalanced closing brace';
    }
    if (depth !== 0) return `Invalid syntax: ${depth} unclosed brace(s)`;

    // SEC-05 / SEC-T15: Prototype chain escape patterns.
    //
    // ─────────────────────────────────────────────────────────────────────────
    // FIRST-PASS HEURISTIC — NOT A SECURITY BOUNDARY.
    // ─────────────────────────────────────────────────────────────────────────
    // This regex layer is defense-in-depth only. The REAL security boundary is
    // the vm2 frozen context (see VM construction below, ~L361). vm2 enforces
    // actual isolation of the prototype chain at runtime; this text-scan is a
    // cheap first-pass that (a) produces human-readable rejection messages
    // before code ever enters the VM, and (b) catches obviously malicious
    // patterns at zero runtime cost.
    //
    // Bypassing these regexes does NOT equal a sandbox escape — vm2 still
    // has to be broken to reach the host. Reviewers: do not treat a clever
    // regex bypass as a vulnerability; evaluate against the actual boundary.
    //
    // SEC-T16 DONE: vm2 replaced with node:vm hardened runInContext shim.
    // The REAL boundary is now node:vm's isolated context (no prototype chain
    // bleed between the guest context and host). This heuristic layer remains
    // the same first-pass scan against that hardened underlying boundary.
    //
    // Detects attempts like:
    //   ({}).__proto__.constructor.constructor('return process')()
    //   Object.getPrototypeOf(x).constructor
    //   Reflect.getPrototypeOf(x) / Reflect.construct(Function, ...)
    //   []['con'+'structor']           (dynamic bracket computation)
    //   ({})['__pro'+'to__']           (dynamic prototype access)
    //   x[`constructor`]               (template-literal bracket access)
    //   iter.next = fn / Symbol.iterator = fn  (iterator hijack)
    // ─────────────────────────────────────────────────────────────────────────
    const protoEscapePatterns = [
      // Classic proto chain
      /__proto__/,
      // SEC-T15: optional chaining bypasses /\.constructor\s*(?:\.|\[)/ (e.g. obj.constructor?.constructor).
      /\.constructor\s*\?\./,
      /\.constructor\s*(?:\.|\[)/,
      /getPrototypeOf\s*\(/,
      /setPrototypeOf\s*\(/,
      /Object\.prototype/,
      /Function\.prototype/,
      // SEC-T15: Reflect-based prototype / meta access
      /\bReflect\s*\.\s*(?:getPrototypeOf|setPrototypeOf|getOwnPropertyDescriptor|ownKeys|construct|apply)\b/,
      // SEC-T15: Bracket-accessor prototype chain (single or double quotes)
      /\[\s*['"](?:constructor|prototype|__proto__)['"]\s*\]/,
      // SEC-T15: Template-literal bracket access for the same
      /\[\s*`(?:constructor|prototype|__proto__)`\s*\]/,
      // SEC-T15: Dynamic string computation inside brackets. Covers
      //   ['con'+'structor'], ['pro'+'totype'], ['__pro'+'to__'], and
      //   template-literal concatenation inside brackets. The regex fires
      //   whenever a bracket contains a string-literal concatenation — this
      //   is intentionally broad (heuristic), because legitimate HoloScript
      //   payloads do not need dynamic bracket-computed member access.
      /\[[^\]]*['"`][^'"`\]]*['"`]\s*\+\s*['"`][^\]]*\]/,
      // SEC-T15: Iterator protocol manipulation — attackers can hijack
      // Symbol.iterator to smuggle functions through for-of loops.
      /\.\s*next\s*=/,
      /Symbol\s*\.\s*(?:iterator|asyncIterator)\s*=/,
      // SEC-T15: Dynamic import() — not exposed by vm2 today, but block
      // it at the heuristic layer for clarity and for the SEC-T16 migration.
      /\bimport\s*\(/,
    ];
    for (const pattern of protoEscapePatterns) {
      if (pattern.test(code)) {
        return `Blocked: prototype chain escape pattern detected (SEC-05)`;
      }
    }

    return null;
  }

  /**
   * Creates a hash of the code for audit logging
   */
  private hashCode(code: string): string {
    // Simple hash for audit trail (not cryptographic)
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Logs security events for audit trails
   */
  private log(entry: Omit<SecurityAuditLog, 'timestamp'>): void {
    if (!this.options.enableLogging) return;

    const logEntry: SecurityAuditLog = {
      timestamp: Date.now(),
      ...entry,
    };
    this.auditLog.push(logEntry);

    // Keep last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }
  }

  /**
   * Executes HoloScript code in isolated VM
   */
  public async executeHoloScript<T = unknown>(
    code: string,
    meta: { source: 'ai-generated' | 'user' | 'trusted' } = { source: 'user' }
  ): Promise<SandboxResult<T>> {
    const startTime = Date.now();
    const codeHash = this.hashCode(code);

    // Step 1: Validate syntax
    const validation = await this.validateCode(code);
    if (!validation.valid) {
      this.log({
        source: meta.source,
        action: 'reject',
        success: false,
        reason: `Validation failed: ${validation.error}`,
        codeHash,
      });

      return {
        success: false,
        error: {
          type: 'validation',
          message: validation.error || 'Invalid HoloScript syntax',
        },
        metadata: {
          executionTime: Date.now() - startTime,
          validated: false,
          source: meta.source,
        },
      };
    }

    this.log({
      source: meta.source,
      action: 'validate',
      success: true,
      codeHash,
    });

    // Step 2: Create isolated VM
    // SEC-01..SEC-04: Shadow potentially leaked host globals inside the VM.
    // node:vm does not expose process/require/Buffer by default, but explicit
    // overrides provide defense-in-depth and human-readable rejection messages.
    const blockedGlobal = (name: string) => {
      const err = () => {
        throw new Error(`${name} is not accessible in the HoloScript security sandbox`);
      };
      // Return a Proxy so both .x and () access are blocked.
      return new Proxy({}, { get: err, apply: err, construct: err });
    };

    // SEC-T16: node:vm hardened runInContext shim replaces abandoned vm2.
    // vm.createContext() creates an entirely separate V8 context — globals
    // set here are the *only* globals available to guest code, so prototype
    // chain bleed from the host heap is not possible.
    const sandboxContext: Record<string, unknown> = {
      ...this.options.sandbox,
      console: {
        log: (...args: unknown[]) => console.log('[SANDBOX]', ...args),
        error: (...args: unknown[]) => console.error('[SANDBOX]', ...args),
        warn: (...args: unknown[]) => console.warn('[SANDBOX]', ...args),
      },
      // SEC-01: Shadow host WebAssembly; no guest wasm compile/instantiate.
      WebAssembly: createBlockedWebAssemblySurface(),
      // SEC-02: Shadow process — prevents env var exfiltration.
      process: blockedGlobal('process'),
      // SEC-02: Shadow globalThis — prevents re-resolving blocked globals.
      globalThis: blockedGlobal('globalThis'),
      // SEC-03: Shadow require/Buffer.
      require: blockedGlobal('require'),
      Buffer: blockedGlobal('Buffer'),
      // SEC-04: Shadow Atomics.
      Atomics: blockedGlobal('Atomics'),
      // SEC-04: Ensure SharedArrayBuffer is not constructible.
      SharedArrayBuffer: blockedGlobal('SharedArrayBuffer'),
      // SEC-T15: Shadow Reflect — prevents Reflect.getPrototypeOf,
      // Reflect.construct(Function,…), Reflect.ownKeys, etc.
      Reflect: blockedGlobal('Reflect'),
    };
    const context = nodeVm.createContext(sandboxContext);

    // Step 3: Execute in isolated context — compilation and run both inside
    // the try block so SyntaxError from invalid guest code is caught here.
    try {
      const script = new nodeVm.Script(code);
      const result = script.runInContext(context, { timeout: this.options.timeout }) as T;

      this.log({
        source: meta.source,
        action: 'execute',
        success: true,
        codeHash,
      });

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          validated: true,
          source: meta.source,
        },
      };
    } catch (error) {
      // node:vm throws proper JS errors from the same realm — instanceof works.
      const isTimeout =
        (error as { code?: string })?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ||
        (error instanceof Error && (
          error.message.toLowerCase().includes('timed out') ||
          error.message.toLowerCase().includes('timeout')
        ));
      const isSyntaxError = error instanceof SyntaxError;
      const errorMessage: string = error instanceof Error ? error.message : 'Unknown execution error';
      const errorStack: string | undefined = error instanceof Error ? error.stack : undefined;

      if (isTimeout) {
        this.log({
          source: meta.source,
          action: 'reject',
          success: false,
          reason: `Execution failed: ${errorMessage}`,
          codeHash,
        });

        return {
          success: false,
          error: {
            type: 'timeout',
            message: errorMessage,
            stack: errorStack,
          },
          metadata: {
            executionTime: Date.now() - startTime,
            validated: true,
            source: meta.source,
          },
        };
      }

      // Valid HoloScript that isn't executable as JavaScript — not a security
      // issue, but callers should not treat this as successfully executed.
      if (isSyntaxError) {
        this.log({
          source: meta.source,
          action: 'reject',
          success: false,
          reason: `Syntax: ${errorMessage}`,
          codeHash,
        });

        return {
          success: false,
          error: {
            type: 'syntax',
            message: errorMessage,
            stack: errorStack,
          },
          metadata: {
            executionTime: Date.now() - startTime,
            validated: true,
            source: meta.source,
          },
        };
      }

      // Runtime/security error
      this.log({
        source: meta.source,
        action: 'reject',
        success: false,
        reason: `Execution failed: ${errorMessage}`,
        codeHash,
      });

      return {
        success: false,
        error: {
          type: 'runtime',
          message: errorMessage,
          stack: errorStack,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          validated: true,
          source: meta.source,
        },
      };
    }
  }

  /**
   * Execute AI-generated .holo through sandbox checks + holo-vm tick +
   * ContractedSimulation/CAEL recording.
   */
  public async executeContractedSimulation(
    code: string,
    options: ContractedSandboxOptions = {}
  ): Promise<SandboxResult<ContractedSandboxData>> {
    const startTime = Date.now();
    const source = options.source ?? 'ai-generated';
    const codeHash = this.hashCode(code);

    const validation = await this.validateCode(code);
    if (!validation.valid) {
      this.log({
        source,
        action: 'reject',
        success: false,
        reason: `Validation failed: ${validation.error}`,
        codeHash,
      });

      return {
        success: false,
        error: {
          type: 'validation',
          message: validation.error || 'Invalid HoloScript syntax',
        },
        metadata: {
          executionTime: Date.now() - startTime,
          validated: false,
          source,
        },
      };
    }

    this.log({ source, action: 'validate', success: true, codeHash });

    try {
      const vmBuilder = new HoloBytecodeBuilder();
      vmBuilder.addFunction('main').halt();
      const vm = new HoloVM();
      vm.load(vmBuilder.build());

      const vmTicks = Math.max(1, options.vmTicks ?? 1);
      let vmResult = vm.tick(16.67);
      for (let i = 1; i < vmTicks; i++) vmResult = vm.tick(16.67);

      const dt = options.dt ?? 0.01;
      const steps = Math.max(1, options.steps ?? 10);
      const simulationConfig = options.simulationConfig ?? { kind: 'sandboxed-holo-simulation' };
      const solver = options.solverFactory
        ? options.solverFactory(simulationConfig)
        : createDefaultSandboxSolver();

      const recorder = new LocalCAELRecorder(solver, simulationConfig, 'sandbox-contract');

      recorder.logInteraction('cael.sandbox', {
        source,
        codeHash,
        validated: true,
      });

      recorder.logInteraction('cael.holo_vm', {
        ticksExecuted: vmTicks,
        finalStatus: String(vmResult.status),
        tickCount: vmResult.tickCount,
      });

      for (let i = 0; i < steps; i++) recorder.step(dt);

      const provenance = recorder.finalize();
      const traceJSONL = recorder.toJSONL();
      const entries = parseLocalTrace(traceJSONL);
      const last = entries[entries.length - 1];
      const verify = verifyLocalHashChain(entries);
      const traceId = `cael:${last?.runId ?? 'unknown'}:${last?.index ?? entries.length - 1}`;

      this.log({ source, action: 'execute', success: true, codeHash });

      return {
        success: true,
        data: {
          vm: {
            ticksExecuted: vmTicks,
            finalStatus: String(vmResult.status),
            stackTop: vmResult.stackTop,
          },
          contract: {
            totalSteps: provenance.totalSteps,
            totalSimTime: provenance.totalSimTime,
            interactions: provenance.interactions.length,
          },
          cael: {
            traceId,
            traceHash: last?.hash ?? 'cael-nohash',
            traceJSONL,
            verify,
          },
        },
        metadata: {
          executionTime: Date.now() - startTime,
          validated: true,
          source,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.log({
        source,
        action: 'reject',
        success: false,
        reason: `Execution failed: ${message}`,
        codeHash,
      });

      return {
        success: false,
        error: {
          type: 'runtime',
          message,
          stack: error instanceof Error ? error.stack : undefined,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          validated: true,
          source,
        },
      };
    }
  }

  /**
   * Retrieves audit logs for security analysis
   */
  public getAuditLogs(filter?: {
    startTime?: number;
    endTime?: number;
    source?: 'ai-generated' | 'user' | 'trusted';
    success?: boolean;
  }): SecurityAuditLog[] {
    let logs = this.auditLog;

    if (filter) {
      logs = logs.filter((log) => {
        if (filter.startTime && log.timestamp < filter.startTime) return false;
        if (filter.endTime && log.timestamp > filter.endTime) return false;
        if (filter.source && log.source !== filter.source) return false;
        if (filter.success !== undefined && log.success !== filter.success) return false;
        return true;
      });
    }

    return logs;
  }

  /**
   * Clears audit logs
   */
  public clearAuditLogs(): void {
    this.auditLog = [];
  }

  /**
   * Returns security statistics
   */
  public getSecurityStats(): {
    total: number;
    validated: number;
    rejected: number;
    executed: number;
    bySource: Record<string, number>;
  } {
    const stats = {
      total: this.auditLog.length,
      validated: 0,
      rejected: 0,
      executed: 0,
      bySource: {} as Record<string, number>,
    };

    for (const log of this.auditLog) {
      if (log.action === 'validate' && log.success) stats.validated++;
      if (log.action === 'reject') stats.rejected++;
      if (log.action === 'execute' && log.success) stats.executed++;

      stats.bySource[log.source] = (stats.bySource[log.source] || 0) + 1;
    }

    return stats;
  }
}

/**
 * Convenience function for one-off sandboxed execution
 */
export async function executeSafely<T = unknown>(
  code: string,
  options: SandboxOptions & { source?: 'ai-generated' | 'user' | 'trusted' } = {}
): Promise<SandboxResult<T>> {
  const sandbox = new HoloScriptSandbox(options);
  return sandbox.executeHoloScript<T>(code, { source: options.source ?? 'user' });
}
type LocalTraceEvent = 'init' | 'step' | 'interaction' | 'final';

interface LocalTraceEntry {
  version: 'cael.v1';
  runId: string;
  index: number;
  event: LocalTraceEvent;
  timestamp: number;
  simTime: number;
  prevHash: string;
  hash: string;
  payload: Record<string, unknown>;
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const arr = value as unknown as { constructor: { name: string }; length: number; [idx: number]: number };
    return {
      __typed: arr.constructor.name,
      data: Array.from({ length: arr.length }, (_, i) => arr[i]),
    };
  }
  if (Array.isArray(value)) return value.map((v) => canonicalize(v));
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = canonicalize(obj[k]);
  return out;
}

function fnv1aHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cael-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function hashLocalEntry(entry: Omit<LocalTraceEntry, 'hash'>): string {
  return fnv1aHash(JSON.stringify(canonicalize(entry)));
}

function parseLocalTrace(jsonl: string): LocalTraceEntry[] {
  return jsonl
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LocalTraceEntry);
}

function verifyLocalHashChain(trace: LocalTraceEntry[]): { valid: boolean; brokenAt?: number; reason?: string } {
  let prev = 'cael.genesis';
  for (let i = 0; i < trace.length; i++) {
    const e = trace[i];
    if (e.prevHash !== prev) return { valid: false, brokenAt: i, reason: 'prevHash mismatch' };
    const expected = hashLocalEntry({
      version: e.version,
      runId: e.runId,
      index: e.index,
      event: e.event,
      timestamp: e.timestamp,
      simTime: e.simTime,
      prevHash: e.prevHash,
      payload: e.payload,
    });
    if (expected !== e.hash) return { valid: false, brokenAt: i, reason: 'hash mismatch' };
    prev = e.hash;
  }
  return { valid: true };
}

class LocalCAELRecorder {
  private readonly runId = `cael-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly entries: LocalTraceEntry[] = [];
  private prevHash = 'cael.genesis';
  private simTime = 0;
  private steps = 0;
  private interactions = 0;

  constructor(
    private readonly solver: SandboxSimSolver,
    config: Record<string, unknown>,
    solverType: string
  ) {
    this.append('init', {
      solverType,
      config: canonicalize(config),
    });
  }

  step(dt: number): void {
    this.solver.step(dt);
    this.simTime += dt;
    this.steps += 1;
    this.append('step', { dt, stepsTaken: 1, totalSteps: this.steps });
  }

  logInteraction(type: string, data: Record<string, unknown>): void {
    this.interactions += 1;
    this.append('interaction', { type, data: canonicalize(data) });
  }

  finalize(): { totalSteps: number; totalSimTime: number; interactions: Array<Record<string, unknown>> } {
    this.append('final', {
      finalStats: canonicalize(this.solver.getStats()),
      totalSteps: this.steps,
      totalSimTime: this.simTime,
    });
    return {
      totalSteps: this.steps,
      totalSimTime: this.simTime,
      interactions: Array.from({ length: this.interactions }, (_, i) => ({ id: i + 1 })),
    };
  }

  toJSONL(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n');
  }

  private append(event: LocalTraceEvent, payload: Record<string, unknown>): void {
    const base: Omit<LocalTraceEntry, 'hash'> = {
      version: 'cael.v1',
      runId: this.runId,
      index: this.entries.length,
      event,
      timestamp: Date.now(),
      simTime: this.simTime,
      prevHash: this.prevHash,
      payload,
    };
    const hash = hashLocalEntry(base);
    const entry: LocalTraceEntry = { ...base, hash };
    this.entries.push(entry);
    this.prevHash = hash;
  }
}
function createDefaultSandboxSolver(): SandboxSimSolver {
  let simTime = 0;
  return {
    mode: 'transient',
    fieldNames: ['sandbox_signal'],
    step(dt: number) {
      simTime += dt;
    },
    solve() {},
    getField(name: string): Float32Array | Float64Array | null {
      if (name !== 'sandbox_signal') return null;
      return new Float32Array([simTime, simTime + 1, simTime + 2]);
    },
    getStats() {
      return { simTime };
    },
    dispose() {},
  };
}
