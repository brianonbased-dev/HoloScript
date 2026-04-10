/**
 * Tests for MCP Server PluginManager
 *
 * Covers:
 * - Plugin registration
 * - Tool retrieval
 * - Tool handling dispatch
 * - Unknown tool handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginManager } from './PluginManager.js';

describe('PluginManager', () => {
  // Note: PluginManager uses static state — tests may interact.
  // We test behavior rather than exact counts.

  describe('registerPlugin', () => {
    it('registers tools', () => {
      const initialCount = PluginManager.getTools().length;
      PluginManager.registerPlugin(
        [
          {
            name: 'test_tool_1',
            description: 'A test tool',
            inputSchema: { type: 'object' as const },
          },
        ],
        async (name, args) => ({ result: 'ok' })
      );
      expect(PluginManager.getTools().length).toBe(initialCount + 1);
    });

    it('registers multiple tools at once', () => {
      const initialCount = PluginManager.getTools().length;
      PluginManager.registerPlugin(
        [
          { name: 'multi_1', description: 'Multi 1', inputSchema: { type: 'object' as const } },
          { name: 'multi_2', description: 'Multi 2', inputSchema: { type: 'object' as const } },
        ],
        async () => ({ result: 'multi' })
      );
      expect(PluginManager.getTools().length).toBe(initialCount + 2);
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
      PluginManager.registerPlugin(
        [{ name: 'dispatch_test', description: 'Test', inputSchema: { type: 'object' as const } }],
        async (name, args) => ({ handled: true, name, args })
      );
      const result = await PluginManager.handleTool('dispatch_test', { x: 1 });
      expect(result).toEqual({ handled: true, name: 'dispatch_test', args: { x: 1 } });
    });

    it('returns null for unregistered tools', async () => {
      const result = await PluginManager.handleTool('nonexistent_tool', {});
      expect(result).toBeNull();
    });
  });
});
