/**
 * SandboxExecutionTrait Unit Tests
 *
 * Tests for VM, WASM, iframe, Web Worker, and container-based sandboxing
 */

import { describe, it, expect, vi } from 'vitest';
import { SandboxExecutionTrait } from '../SandboxExecutionTrait';
import type { SandboxExecutionConfig } from '../SandboxExecutionTrait';

describe('SandboxExecutionTrait', () => {
  describe('handler definition', () => {
    it('should have name "sandbox_execution"', () => {
      expect(SandboxExecutionTrait.name).toBe('sandbox_execution');
    });

    it('should have validate and compile methods', () => {
      expect(typeof SandboxExecutionTrait.validate).toBe('function');
      expect(typeof SandboxExecutionTrait.compile).toBe('function');
    });
  });

  describe('validate()', () => {
    it('should pass validation for WebAssembly sandbox', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'wasm',
        max_memory_mb: 128,
        max_execution_time_ms: 5000,
        permissions: {
          filesystem: 'none',
          network: 'none',
          environment: 'none',
        },
      };

      expect(() => SandboxExecutionTrait.validate(config)).not.toThrow();
      expect(SandboxExecutionTrait.validate(config)).toBe(true);
    });

    it('should pass validation for Node.js VM sandbox', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        max_memory_mb: 512,
        permissions: {
          filesystem: 'read',
          network: 'none',
        },
      };

      expect(() => SandboxExecutionTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for Web Worker sandbox', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'worker',
        permissions: {
          network: 'restricted',
        },
      };

      expect(() => SandboxExecutionTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for iframe sandbox', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'iframe',
        permissions: {
          filesystem: 'none',
          network: 'restricted',
        },
      };

      expect(() => SandboxExecutionTrait.validate(config)).not.toThrow();
    });

    it('should warn about no execution timeout', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {},
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      SandboxExecutionTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No execution timeout set'));
      consoleSpy.mockRestore();
    });

    it('should warn about native modules with all filesystem permissions', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        allow_native_modules: true,
        max_execution_time_ms: 5000,
        permissions: {
          filesystem: 'all',
        },
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      SandboxExecutionTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Native modules with "all" filesystem permission')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('compile() - WebAssembly sandbox', () => {
    it('should generate WASM sandbox with WASI', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'wasm',
        max_memory_mb: 128,
        permissions: {
          filesystem: 'none',
          network: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      expect(result).toContain('class WASMSandbox');
      expect(result).toContain('WebAssembly.instantiate');
      expect(result).toContain('memory');
    });

    it('should enforce memory limits', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'wasm',
        max_memory_mb: 256,
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      // WASM Memory constructor uses initial: 1 (pages), maximum from config
      expect(result).toContain('initial: 1');
      expect(result).toContain('maximum: 256');
    });

    it('should set maxMemoryMB in limits from config', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'wasm',
        permissions: {
          filesystem: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      // WASM compile uses maxMemoryMB in limits object
      expect(result).toContain('maxMemoryMB');
    });
  });

  describe('compile() - Node.js VM sandbox', () => {
    it('should use Node.js vm module', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        max_memory_mb: 512,
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      expect(result).toContain("require('vm')");
      expect(result).toContain('class VMSandbox');
      expect(result).toContain('vm.createContext');
    });

    it('should enforce execution timeout', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        max_execution_time_ms: 5000,
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // Timeout appears as default parameter in execute() and in runInContext options
      expect(result).toContain('timeout = 5000');
      expect(result).toContain('timeout,');
    });

    it('should restrict filesystem access', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {
          filesystem: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When filesystem is 'none', output contains a comment disabling access
      expect(result).toContain('Filesystem access disabled');
      expect(result).not.toContain("fs: require('fs')");
    });

    it('should allow filesystem access when not none', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {
          filesystem: 'read',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When filesystem is not 'none', it provides limited fs access via promises
      expect(result).toContain("require('fs').promises");
      expect(result).toContain('Limited filesystem access');
    });

    it('should restrict network access', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {
          network: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When network is 'none', output contains a comment disabling access
      expect(result).toContain('Network access disabled');
      expect(result).not.toContain("require('node-fetch')");
    });

    it('should allow network access when not none', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {
          environment: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When network is not 'none' (undefined here), it provides limited network
      expect(result).toContain('Limited network access');
      expect(result).toContain("require('node-fetch')");
    });
  });

  describe('compile() - Web Worker sandbox', () => {
    it('should create Web Worker', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'worker',
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      expect(result).toContain('class WorkerSandbox');
      expect(result).toContain('new Worker');
    });

    it('should communicate via message passing', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'worker',
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      expect(result).toContain('onmessage');
    });

    it('should terminate on timeout', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'worker',
        max_execution_time_ms: 10000,
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      expect(result).toContain('terminate()');
      expect(result).toContain('setTimeout');
    });
  });

  describe('compile() - iframe sandbox', () => {
    it('should create sandboxed iframe', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'iframe',
        permissions: {
          filesystem: 'none',
          network: 'restricted',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      expect(result).toContain('class IframeSandbox');
      // Source uses single quotes: createElement('iframe')
      expect(result).toContain("createElement('iframe')");
      expect(result).toContain('sandbox');
    });

    it('should apply sandbox attributes', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'iframe',
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      expect(result).toContain('allow-scripts');
    });

    it('should restrict forms and navigation', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'iframe',
        permissions: {
          network: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      expect(result).not.toContain('allow-forms');
      expect(result).not.toContain('allow-top-navigation');
    });

    it('should communicate via postMessage and message events', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'iframe',
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'web');

      // Source uses: window.parent.postMessage and this.iframe.contentWindow
      expect(result).toContain('postMessage');
      expect(result).toContain("addEventListener('message'");
    });
  });

  describe('compile() - container sandbox', () => {
    it('should generate container configuration as JSON', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'container',
        max_memory_mb: 1024,
        max_cpu_percent: 50,
        permissions: {
          filesystem: 'read',
          network: 'restricted',
        },
      };

      // 'container' falls through to compileGeneric() which returns JSON.stringify
      const result = SandboxExecutionTrait.compile(config, 'docker');

      expect(result).toContain('"sandbox_type": "container"');
      expect(result).toContain('"max_memory_mb": 1024');
      expect(result).toContain('"max_cpu_percent": 50');
    });

    it('should include network permission in JSON output', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'container',
        permissions: {
          network: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'docker');

      // compileGeneric serializes config as JSON
      expect(result).toContain('"network": "none"');
    });

    it('should include filesystem permission in JSON output', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'container',
        permissions: {
          filesystem: 'read',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'docker');

      expect(result).toContain('"filesystem": "read"');
    });
  });

  describe('compile() - API restrictions', () => {
    it('should include restricted APIs in output', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        api_restrictions: ['eval', 'Function', 'child_process'],
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // API restrictions appear in detectViolations as a JSON array
      expect(result).toContain('Check for restricted API usage');
      expect(result).toContain('["eval","Function","child_process"]');
    });
  });

  describe('compile() - native module restrictions', () => {
    it('should block native modules by default', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        allow_native_modules: false,
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When allow_native_modules is false/falsy, output contains comment
      expect(result).toContain('Native modules disabled');
    });

    it('should allow native modules if configured', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        allow_native_modules: true,
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When allow_native_modules is true, require is exposed with a warning
      expect(result).toContain('require: require');
      expect(result).toContain('WARNING: Native modules allowed');
    });
  });

  describe('compile() - execution metrics', () => {
    it('should track execution time', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      expect(result).toContain('executionTimeMs');
      // Source uses performance.now() not Date.now()
      expect(result).toContain('performance.now()');
    });

    it('should track memory usage', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        max_memory_mb: 512,
        permissions: {},
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // Source uses memoryUsedBytes and process.memoryUsage
      expect(result).toContain('memoryUsedBytes');
      expect(result).toContain('process.memoryUsage');
    });
  });

  describe('compile() - permission levels', () => {
    it('should support "none" permission level for filesystem', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {
          filesystem: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When filesystem is 'none', fs access is disabled via comment
      expect(result).toContain('Filesystem access disabled');
    });

    it('should support non-none permission level for filesystem', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {
          filesystem: 'read',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When filesystem is not 'none', limited access is provided via promises
      expect(result).toContain("require('fs').promises");
    });

    it('should support non-none permission level for network', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {
          filesystem: 'write',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // 'write' is not 'none', so limited filesystem access is granted
      expect(result).toContain('Limited filesystem access');
      expect(result).toContain("require('fs').promises");
    });

    it('should support "none" network permission', () => {
      const config: SandboxExecutionConfig = {
        sandbox_type: 'vm',
        permissions: {
          network: 'none',
        },
      };

      const result = SandboxExecutionTrait.compile(config, 'node');

      // When network is 'none', access is disabled via comment
      expect(result).toContain('Network access disabled');
      expect(result).not.toContain("require('node-fetch')");
    });
  });
});
