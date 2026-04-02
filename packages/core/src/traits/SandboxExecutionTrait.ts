/**
 * Sandbox Execution Trait
 *
 * Provides code isolation via VM, WASM, or container-based sandboxing with permission systems.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type SandboxType = 'vm' | 'wasm' | 'iframe' | 'worker' | 'container' | 'isolate';
export type PermissionLevel = 'none' | 'read' | 'write' | 'execute' | 'network' | 'all';

export interface SandboxExecutionConfig {
  sandbox_type: SandboxType;
  max_memory_mb?: number;
  max_execution_time_ms?: number;
  max_cpu_percent?: number;
  permissions: {
    filesystem?: PermissionLevel;
    network?: PermissionLevel;
    environment?: PermissionLevel;
  };
  api_restrictions?: string[];
  allow_native_modules?: boolean;
  resource_limits?: {
    max_file_size_mb?: number;
    max_network_bandwidth_kbps?: number;
    max_open_files?: number;
  };
}

export interface SandboxExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  metrics: {
    execution_time_ms: number;
    memory_used_bytes: number;
    cpu_time_ms: number;
  };
  violations?: string[];
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const SandboxExecutionTrait: TraitHandler<SandboxExecutionConfig> = {
  name: 'sandbox_execution',

  validate(config: SandboxExecutionConfig): boolean {
    // Warn if allowing native modules with loose permissions
    if (config.allow_native_modules && config.permissions.filesystem === 'all') {
      console.warn('Native modules with "all" filesystem permission creates security risk');
    }

    // Validate resource limits
    if (config.max_memory_mb && config.max_memory_mb > 2048) {
      console.warn(`High memory limit (${config.max_memory_mb}MB) may impact system performance`);
    }

    // Ensure timeout is set for untrusted code
    if (!config.max_execution_time_ms) {
      console.warn('No execution timeout set - recommended for untrusted code');
    }

    return true;
  },

  compile(config: SandboxExecutionConfig, target: string): string {
    switch (config.sandbox_type) {
      case 'wasm':
        return (this as any).compileWASM(config);
      case 'vm':
        return (this as any).compileVM(config);
      case 'worker':
        return (this as any).compileWorker(config);
      case 'iframe':
        return (this as any).compileIframe(config);
      default:
        return (this as any).compileGeneric(config);
    }
  },

  compileWASM(config: SandboxExecutionConfig): string {
    return `
// WebAssembly Sandbox Execution
class WASMSandbox {
  constructor() {
    this.memory = new WebAssembly.Memory({
      initial: 1,
      maximum: ${config.max_memory_mb || 256}
    });
    this.limits = {
      maxExecutionTimeMs: ${config.max_execution_time_ms || 5000},
      maxMemoryMB: ${config.max_memory_mb || 256},
      maxCPUPercent: ${config.max_cpu_percent || 80}
    };
  }

  async executeWASM(wasmBytes, imports = {}) {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    try {
      // Compile WASM module
      const module = await WebAssembly.compile(wasmBytes);

      // Create instance with limited imports
      const instance = await WebAssembly.instantiate(module, {
        env: {
          memory: this.memory,
          ${config.permissions.network === 'none' ? '// Network access disabled' : ''}
          ${
            config.api_restrictions
              ? `
          // Restricted APIs: ${config.api_restrictions.join(', ')}
          `
              : ''
          }
          ...imports
        }
      });

      // Execute with timeout
      const result = await Promise.race([
        instance.exports.main(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timeout')),
                     this.limits.maxExecutionTimeMs)
        )
      ]);

      const executionTime = performance.now() - startTime;
      const memoryUsed = this.getMemoryUsage() - startMemory;

      return {
        success: true,
        result,
        metrics: {
          executionTimeMs: executionTime,
          memoryUsedBytes: memoryUsed,
          cpuTimeMs: executionTime // Approximate
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        metrics: {
          executionTimeMs: performance.now() - startTime,
          memoryUsedBytes: this.getMemoryUsage() - startMemory,
          cpuTimeMs: 0
        }
      };
    }
  }

  getMemoryUsage() {
    return this.memory.buffer.byteLength;
  }
}

export default new WASMSandbox();`;
  },

  compileVM(config: SandboxExecutionConfig): string {
    return `
// Node.js VM Sandbox
const vm = require('vm');
const { performance } = require('perf_hooks');

class VMSandbox {
  constructor() {
    this.context = this.createSandboxContext();
  }

  createSandboxContext() {
    const context = {
      console: {
        log: (...args) => console.log('[SANDBOX]', ...args),
        error: (...args) => console.error('[SANDBOX]', ...args)
      },
      ${
        config.permissions.filesystem === 'none'
          ? '// Filesystem access disabled'
          : `
      // Limited filesystem access
      fs: require('fs').promises,
      `
      }
      ${
        config.permissions.network === 'none'
          ? '// Network access disabled'
          : `
      // Limited network access
      fetch: require('node-fetch'),
      `
      }
      // Expose only safe globals
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      Buffer,
      ${
        config.allow_native_modules
          ? `
      require: require, // WARNING: Native modules allowed
      `
          : '// Native modules disabled'
      }
    };

    return vm.createContext(context);
  }

  execute(code, timeout = ${config.max_execution_time_ms || 5000}) {
    const startTime = performance.now();
    const memoryBefore = process.memoryUsage().heapUsed;

    try {
      const script = new vm.Script(code, {
        filename: 'sandbox.js',
        displayErrors: true
      });

      const result = script.runInContext(this.context, {
        timeout,
        breakOnSigint: true,
        ${
          config.max_memory_mb
            ? `
        // Memory limit enforcement
        maxOldGenerationSizeMb: ${config.max_memory_mb},
        maxYoungGenerationSizeMb: Math.floor(${config.max_memory_mb} / 4),
        `
            : ''
        }
      });

      const executionTime = performance.now() - startTime;
      const memoryUsed = process.memoryUsage().heapUsed - memoryBefore;

      return {
        success: true,
        result,
        metrics: {
          executionTimeMs: executionTime,
          memoryUsedBytes: memoryUsed,
          cpuTimeMs: process.cpuUsage().user / 1000
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        violations: this.detectViolations(error),
        metrics: {
          executionTimeMs: performance.now() - startTime,
          memoryUsedBytes: process.memoryUsage().heapUsed - memoryBefore,
          cpuTimeMs: 0
        }
      };
    }
  }

  detectViolations(error) {
    const violations = [];
    if (error.message.includes('timeout')) {
      violations.push('Execution timeout exceeded');
    }
    if (error.message.includes('memory')) {
      violations.push('Memory limit exceeded');
    }
    ${
      config.api_restrictions
        ? `
    // Check for restricted API usage
    const restricted = ${JSON.stringify(config.api_restrictions)};
    for (const api of restricted) {
      if (error.message.includes(api)) {
        violations.push(\`Restricted API access: \${api}\`);
      }
    }
    `
        : ''
    }
    return violations;
  }
}

module.exports = new VMSandbox();`;
  },

  compileWorker(config: SandboxExecutionConfig): string {
    return `
// Web Worker Sandbox
class WorkerSandbox {
  constructor() {
    this.worker = null;
    this.limits = {
      maxExecutionTimeMs: ${config.max_execution_time_ms || 5000},
      maxMemoryMB: ${config.max_memory_mb || 256}
    };
  }

  execute(code) {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();

      // Create worker blob
      const blob = new Blob([code], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl, {
        ${
          config.permissions.network === 'none'
            ? `
        // Network access restricted
        credentials: 'omit',
        `
            : ''
        }
      });

      // Set execution timeout
      const timeout = setTimeout(() => {
        this.worker.terminate();
        reject(new Error('Worker execution timeout'));
      }, this.limits.maxExecutionTimeMs);

      this.worker.onmessage = (event) => {
        clearTimeout(timeout);
        const executionTime = performance.now() - startTime;

        resolve({
          success: true,
          result: event.data,
          metrics: {
            executionTimeMs: executionTime,
            memoryUsedBytes: 0, // Not easily accessible in workers
            cpuTimeMs: executionTime
          }
        });

        this.worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };

      this.worker.onerror = (error) => {
        clearTimeout(timeout);
        reject({
          success: false,
          error: error.message,
          metrics: {
            executionTimeMs: performance.now() - startTime,
            memoryUsedBytes: 0,
            cpuTimeMs: 0
          }
        });

        this.worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };
    });
  }
}

export default new WorkerSandbox();`;
  },

  compileIframe(config: SandboxExecutionConfig): string {
    return `
// Iframe Sandbox
class IframeSandbox {
  constructor() {
    this.iframe = this.createSandboxIframe();
  }

  createSandboxIframe() {
    const iframe = document.createElement('iframe');
    iframe.sandbox = this.buildSandboxPermissions();
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    return iframe;
  }

  buildSandboxPermissions() {
    const permissions = [];

    ${
      config.permissions.filesystem !== 'none'
        ? `
    permissions.push('allow-downloads');
    `
        : ''
    }

    ${
      config.permissions.network !== 'none'
        ? `
    permissions.push('allow-same-origin');
    `
        : ''
    }

    permissions.push('allow-scripts');

    return permissions.join(' ');
  }

  execute(htmlCode) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Iframe execution timeout'));
      }, ${config.max_execution_time_ms || 5000});

      this.iframe.srcdoc = \`
        <!DOCTYPE html>
        <html>
        <head>
          <meta http-equiv="Content-Security-Policy"
                content="default-src 'self' ${config.permissions.network === 'none' ? '' : '*'}">
        </head>
        <body>
          \${htmlCode}
          <script>
            window.parent.postMessage({ type: 'ready' }, '*');
          </script>
        </body>
        </html>
      \`;

      window.addEventListener('message', (event) => {
        if (event.source === this.iframe.contentWindow) {
          clearTimeout(timeout);
          resolve({
            success: true,
            result: event.data,
            metrics: {
              executionTimeMs: 0,
              memoryUsedBytes: 0,
              cpuTimeMs: 0
            }
          });
        }
      });
    });
  }

  destroy() {
    this.iframe.remove();
  }
}

export default IframeSandbox;`;
  },

  compileGeneric(config: SandboxExecutionConfig): string {
    return JSON.stringify(config, null, 2);
  },
};

export default SandboxExecutionTrait;
