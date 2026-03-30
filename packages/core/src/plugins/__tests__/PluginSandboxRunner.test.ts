/**
 * PluginSandboxRunner tests — v5.7 "Open Ecosystem"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginSandboxRunner,
  DEFAULT_CAPABILITY_BUDGET,
  type PluginSandboxRunnerConfig,
  type SandboxPermission,
} from '../PluginSandboxRunner';

function createRunner(
  permissions: SandboxPermission[] = ['tool:register', 'handler:register', 'event:emit'],
  budget = DEFAULT_CAPABILITY_BUDGET
): PluginSandboxRunner {
  const config: PluginSandboxRunnerConfig = {
    pluginId: 'test-plugin',
    permissions: new Set(permissions),
    budget,
  };
  return new PluginSandboxRunner(config);
}

describe('PluginSandboxRunner', () => {
  let runner: PluginSandboxRunner;

  beforeEach(() => {
    runner = createRunner();
  });

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  describe('lifecycle', () => {
    it('starts in idle state', () => {
      expect(runner.getState()).toBe('idle');
    });

    it('transitions to destroyed', () => {
      runner.destroy();
      expect(runner.getState()).toBe('destroyed');
    });

    it('rejects execution after destruction', async () => {
      runner.destroy();
      const result = await runner.execute('1 + 1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('destroyed');
    });
  });

  // ===========================================================================
  // PERMISSIONS
  // ===========================================================================

  describe('permissions', () => {
    it('reports granted permissions', () => {
      expect(runner.hasPermission('tool:register')).toBe(true);
      expect(runner.hasPermission('filesystem:read')).toBe(false);
    });

    it('lists all permissions', () => {
      const perms = runner.getPermissions();
      expect(perms).toContain('tool:register');
      expect(perms).toContain('handler:register');
      expect(perms).toContain('event:emit');
    });

    it('rejects registerTool without permission', () => {
      const restricted = createRunner([]);
      expect(() => restricted.registerTool('foo', 'desc', () => 42)).toThrow('lacks permission');
    });
  });

  // ===========================================================================
  // TOOL REGISTRATION
  // ===========================================================================

  describe('tool registration', () => {
    it('registers a tool with qualified name', () => {
      runner.registerTool('hello', 'Say hello', () => 'hi');
      const tool = runner.getTool('plugin:test-plugin:hello');
      expect(tool).toBeDefined();
      expect(tool!.description).toBe('Say hello');
    });

    it('enforces max tools budget', () => {
      const small = createRunner(['tool:register'], { ...DEFAULT_CAPABILITY_BUDGET, maxTools: 2 });
      small.registerTool('a', 'A', () => 1);
      small.registerTool('b', 'B', () => 2);
      expect(() => small.registerTool('c', 'C', () => 3)).toThrow('exceeded max tools');
    });

    it('lists all registered tools', () => {
      runner.registerTool('x', 'X', () => 1);
      runner.registerTool('y', 'Y', () => 2);
      expect(runner.getTools()).toHaveLength(2);
    });
  });

  // ===========================================================================
  // HANDLER REGISTRATION
  // ===========================================================================

  describe('handler registration', () => {
    it('registers and retrieves handlers', () => {
      const fn = () => {};
      runner.registerHandler('update', fn);
      const handlers = runner.getHandlers('update');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].event).toBe('update');
    });

    it('returns empty array for unknown events', () => {
      expect(runner.getHandlers('nonexistent')).toHaveLength(0);
    });

    it('enforces max handlers budget', () => {
      const small = createRunner(['handler:register'], {
        ...DEFAULT_CAPABILITY_BUDGET,
        maxHandlers: 1,
      });
      small.registerHandler('a', () => {});
      expect(() => small.registerHandler('b', () => {})).toThrow('exceeded max handlers');
    });
  });

  // ===========================================================================
  // EVENT EMISSION
  // ===========================================================================

  describe('event emission', () => {
    it('calls registered handlers on emit', () => {
      let received: unknown = null;
      runner.registerHandler('test-event', (payload) => {
        received = payload;
      });
      runner.emitEvent('test-event', { value: 42 });
      expect(received).toEqual({ value: 42 });
    });

    it('rejects emitEvent without permission', () => {
      const restricted = createRunner(['tool:register']);
      expect(() => restricted.emitEvent('foo')).toThrow('lacks permission');
    });
  });

  // ===========================================================================
  // CODE EXECUTION
  // ===========================================================================

  describe('execute', () => {
    it('executes simple expressions', async () => {
      const result = await runner.execute('2 + 3');
      expect(result.success).toBe(true);
      expect(result.result).toBe(5);
      expect(result.cpuTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('blocks dangerous globals', async () => {
      const result = await runner.execute('typeof process');
      expect(result.success).toBe(true);
      expect(result.result).toBe('undefined');
    });

    it('blocks require', async () => {
      const result = await runner.execute('typeof require');
      expect(result.success).toBe(true);
      expect(result.result).toBe('undefined');
    });

    it('provides safe builtins', async () => {
      const result = await runner.execute('JSON.stringify({ a: 1 })');
      expect(result.success).toBe(true);
      expect(result.result).toBe('{"a":1}');
    });

    it('captures console output', async () => {
      await runner.execute('console.log("hello from plugin")');
      const logs = runner.getConsoleLogs();
      expect(logs).toContain('hello from plugin');
    });

    it('handles execution errors gracefully', async () => {
      const result = await runner.execute('throw new Error("boom")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('boom');
    });

    it('enforces CPU time limit', async () => {
      const fast = createRunner(['tool:register'], {
        ...DEFAULT_CAPABILITY_BUDGET,
        maxCpuTimeMs: 50,
      });
      const result = await fast.execute('while(true) {}');
      expect(result.success).toBe(false);
      expect(result.error).toContain('time limit');
    });

    it('provides registerTool in sandbox when permitted', async () => {
      const result = await runner.execute(`
        registerTool('greet', 'Greet someone', function(name) { return 'Hello ' + name; });
        'registered';
      `);
      expect(result.success).toBe(true);
      expect(result.result).toBe('registered');
      expect(runner.getTools()).toHaveLength(1);
    });
  });

  // ===========================================================================
  // RATE LIMITING
  // ===========================================================================

  describe('rate limiting', () => {
    it('enforces API call rate limit', () => {
      const limited = createRunner(['tool:register'], {
        ...DEFAULT_CAPABILITY_BUDGET,
        maxApiCallsPerMinute: 3,
      });
      limited.registerTool('a', 'A', () => 1);
      limited.registerTool('b', 'B', () => 2);
      limited.registerTool('c', 'C', () => 3);
      expect(() => limited.registerTool('d', 'D', () => 4)).toThrow('rate limit');
    });
  });

  // ===========================================================================
  // INTROSPECTION
  // ===========================================================================

  describe('getStats', () => {
    it('returns comprehensive stats', () => {
      runner.registerTool('t1', 'T1', () => 1);
      runner.registerHandler('e1', () => {});

      const stats = runner.getStats();
      expect(stats.pluginId).toBe('test-plugin');
      expect(stats.state).toBe('idle');
      expect(stats.toolCount).toBe(1);
      expect(stats.handlerCount).toBe(1);
      expect(stats.permissions).toContain('tool:register');
    });
  });
});
