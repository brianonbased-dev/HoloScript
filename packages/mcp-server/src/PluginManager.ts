/**
 * MCP Plugin Manager
 *
 * Enables dynamic registration of tools and handlers for the HoloScript MCP server.
 * This allows proprietary protocols like UAA2 to plug in without being part of
 * the open-source codebase.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { gatePluginRegistration } from './security/fork-sandbox-gate';

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export interface PluginManifest {
  name: string;
  scopeName?: string;
  version?: string;
  trustTier?: string;
  manifest?: Record<string, unknown>;
  [key: string]: unknown;
}

export class PluginManager {
  private static tools: Tool[] = [];
  private static handlers: Map<string, ToolHandler> = new Map();

  /**
   * Register a plugin with one or more tools and a handler.
   * Enforces the fork sandbox gate before admitting any plugin.
   *
   * @param pluginTools - MCP tools exposed by this plugin
   * @param handler - Handler function for tool calls
   * @param manifest - Optional plugin manifest for fork-sandbox gating
   */
  static async registerPlugin(
    pluginTools: Tool[],
    handler: ToolHandler,
    manifest?: PluginManifest
  ) {
    const gateManifest: Record<string, unknown> = {
      name: manifest?.name ?? pluginTools[0]?.name ?? 'unnamed',
      toolCount: pluginTools.length,
      tools: pluginTools.map((t) => t.name),
      ...manifest,
    };
    const gate = await gatePluginRegistration(gateManifest);
    if (!gate.allowed) {
      throw new Error(
        `Plugin registration denied by ForkSandboxGate: ${gate.receipt?.reason ?? 'policy violation'} (receiptId=${gate.receipt?.receiptId})`
      );
    }
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
