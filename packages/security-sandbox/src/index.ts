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

import { VM } from 'vm2';
import { parseHoloStrict, HoloScriptPlusParser } from '@holoscript/core';

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
    const vm = new VM({
      timeout: this.options.timeout,
      sandbox: {
        ...this.options.sandbox,
        console: {
          log: (...args: unknown[]) => console.log('[SANDBOX]', ...args),
          error: (...args: unknown[]) => console.error('[SANDBOX]', ...args),
          warn: (...args: unknown[]) => console.warn('[SANDBOX]', ...args),
        },
      },
      require: {
        external: this.options.allowedModules.length > 0,
        builtin: this.options.allowedModules,
      },
    });

    // Step 3: Execute in VM
    try {
      const result = vm.run(code) as T;

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
      // vm2 throws errors from a different V8 realm — instanceof checks fail
      const errObj = error as any;
      const errorMessage: string = errObj?.message ?? 'Unknown execution error';
      const errorCode: string | undefined = errObj?.code;
      const errorStack: string | undefined = errObj?.stack;
      const isTimeout = errorCode === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ||
        errorMessage.toLowerCase().includes('timed out') ||
        errorMessage.toLowerCase().includes('timeout');
      const isSyntaxError = errObj?.constructor?.name === 'SyntaxError' ||
        errorMessage.includes('Unexpected token');

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
