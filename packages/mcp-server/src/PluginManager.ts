/**
 * MCP Plugin Manager
 *
 * Enables dynamic registration of tools and handlers for the HoloScript MCP server.
 * This allows proprietary protocols like UAA2 to plug in without being part of
 * the open-source codebase.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export class PluginManager {
  private static tools: Tool[] = [];
  private static handlers: Map<string, ToolHandler> = new Map();

  /**
   * Register a plugin with one or more tools and a handler
   */
  static registerPlugin(pluginTools: Tool[], handler: ToolHandler) {
    this.tools.push(...pluginTools);
    for (const tool of pluginTools) {
      this.handlers.set(tool.name, handler);
    }
  }

  /**
   * Get all registered plugin tools
   */
  static getTools(): Tool[] {
    return this.tools;
  }

  /**
   * Handle a tool call if it belongs to a registered plugin
   */
  static async handleTool(name: string, args: Record<string, unknown>): Promise<unknown | null> {
    const handler = this.handlers.get(name);
    if (handler) {
      return await handler(name, args);
    }
    return null;
  }
}
