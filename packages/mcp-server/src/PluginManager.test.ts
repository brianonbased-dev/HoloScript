/**
 * Tests for MCP Server PluginManager
 *
 * Covers:
 * - Plugin registration
 * - Tool retrieval
 * - Tool handling dispatch
 * - Unknown tool handling
 * - reset() clears all state
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginManager } from './PluginManager.js';

describe('PluginManager', () => {
  // Reset static state between tests to prevent test tool names
  // from leaking into the production tool list.
  beforeEach(() => {
    PluginManager.reset();
  });

  afterEach(() => {
    PluginManager.reset();
  });

  describe('registerPlugin', () => {
    it('registers tools', async () => {
      await PluginManager.registerPlugin(
        [
          {
            name: '_unit_test_tool_1',
            description: 'A test tool',
            inputSchema: { type: 'object' as const },
          },
        ],
        async (name, args) => ({ result: 'ok' })
      );
      expect(PluginManager.getTools().length).toBe(1);
    });

    it('registers multiple tools at once', async () => {
      await PluginManager.registerPlugin(
        [
          { name: '_unit_multi_1', description: 'Multi 1', inputSchema: { type: 'object' as const } },
          { name: '_unit_multi_2', description: 'Multi 2', inputSchema: { type: 'object' as const } },
        ],
        async () => ({ result: 'multi' })
      );
      expect(PluginManager.getTools().length).toBe(2);
    });

    it('blocks hostile plugin manifest', async () => {
      await expect(
        PluginManager.registerPlugin(
          [{ name: '_unit_bad_tool', description: 'bad', inputSchema: { type: 'object' as const } }],
          async () => 'bad',
          { name: 'bad', scopeName: '@evil', version: '1.0.0', trustTier: 'unverified' }
        )
      ).rejects.toThrow('Plugin registration denied by ForkSandboxGate');
    });

    it('allows benign plugin manifest', async () => {
      await PluginManager.registerPlugin(
        [{ name: '_unit_good_tool', description: 'good', inputSchema: { type: 'object' as const } }],
        async () => 'good',
        { name: 'good', scopeName: '@holoscript', version: '1.0.0', trustTier: 'verified' }
      );
      expect(PluginManager.getTools().length).toBe(1);
    });
  });

  describe('getTools', () => {
    it('returns an array of tools', () => {
      const tools = PluginManager.getTools();
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('handleTool', () => {
    it('dispatches to registered handler', async () => {
      await PluginManager.registerPlugin(
        [{ name: '_unit_dispatch_test', description: 'Test', inputSchema: { type: 'object' as const } }],
        async (name, args) => ({ handled: true, name, args })
      );
      const result = await PluginManager.handleTool('_unit_dispatch_test', { x: 1 });
      expect(result).toEqual({ handled: true, name: '_unit_dispatch_test', args: { x: 1 } });
    });

    it('returns null for unregistered tools', async () => {
      const result = await PluginManager.handleTool('nonexistent_tool_xyz', {});
      expect(result).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears all registered tools and handlers', async () => {
      await PluginManager.registerPlugin(
        [{ name: '_unit_reset_tool', description: 'Reset test', inputSchema: { type: 'object' as const } }],
        async () => 'ok'
      );
      expect(PluginManager.getTools().length).toBe(1);
      expect(await PluginManager.handleTool('_unit_reset_tool', {})).toEqual('ok');

      PluginManager.reset();

      expect(PluginManager.getTools().length).toBe(0);
      expect(await PluginManager.handleTool('_unit_reset_tool', {})).toBeNull();
    });
  });
});