/// <reference path="../types/vscode-mcp.d.ts" />

import * as vscode from 'vscode';

/**
 * HoloScript MCP Server Definition Provider
 *
 * Registers the production HoloScript MCP server (https://mcp.holoscript.net/mcp)
 * with VS Code's MCP infrastructure for GitHub Copilot and other AI agents.
 *
 * The MCP server provides 65+ tools for HoloScript language operations including:
 * - Parsing, validation, and code generation
 * - Codebase intelligence and semantic search
 * - Compiler target operations (28+ export targets)
 * - AI-powered code assistance via Brittney-Lite
 * - Graph understanding and visualization
 * - IDE integration (diagnostics, autocomplete, refactoring)
 */
export class HoloScriptMcpProvider implements vscode.lm.McpServerDefinitionProvider {
  private readonly _onDidChangeMcpServerDefinitions = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this._onDidChangeMcpServerDefinitions.event;

  /**
   * Provides the MCP server configuration for the HoloScript production server
   */
  async provideMcpServerDefinitions(): Promise<vscode.lm.McpServerDefinition[]> {
    const config = vscode.workspace.getConfiguration('holoscript.mcp');
    const enabled = config.get<boolean>('holoscriptMcpEnabled', true);

    if (!enabled) {
      return [];
    }

    // Production HoloScript MCP server at mcp.holoscript.net
    const serverDefinition: vscode.lm.McpServerDefinition = {
      name: 'HoloScript',
      transport: {
        type: 'streamableHttp',
        url: 'https://mcp.holoscript.net/mcp',
        requestHeaders: {
          'User-Agent': 'vscode-holoscript-extension/3.1.0',
          'Accept': 'application/json',
        },
      },
      metadata: {
        description: 'HoloScript language server with 65+ tools for VR/AR development',
        version: '3.6.1',
        capabilities: [
          'code_parsing',
          'code_generation',
          'semantic_search',
          'graph_analysis',
          'multi_target_compilation',
          'ai_assistance',
        ],
        documentationUrl: 'https://holoscript.net/guides/',
        endpoints: {
          health: 'https://mcp.holoscript.net/health',
          render: 'https://mcp.holoscript.net/api/render',
          share: 'https://mcp.holoscript.net/api/share',
          discovery: 'https://mcp.holoscript.net/.well-known/mcp',
        },
      },
    };

    return [serverDefinition];
  }

  /**
   * Resolves the MCP server definition when VS Code needs to start the server.
   * Injects GitHub OAuth token if available so the MCP server knows the caller's identity.
   */
  async resolveMcpServerDefinition(
    definition: vscode.lm.McpServerDefinition
  ): Promise<vscode.lm.McpServerDefinition> {
    // Verify server health before resolving
    try {
      const response = await fetch('https://mcp.holoscript.net/health');
      if (!response.ok) {
        console.warn('HoloScript MCP server health check failed:', response.status);
      }
    } catch (error) {
      console.warn('HoloScript MCP server health check error:', error);
    }

    // Inject GitHub token into request headers for identity-aware MCP calls
    const token = await this.getGitHubToken();
    if (token && definition.transport && 'requestHeaders' in definition.transport) {
      definition = {
        ...definition,
        transport: {
          ...definition.transport,
          requestHeaders: {
            ...(definition.transport as Record<string, unknown>).requestHeaders as Record<string, string>,
            'Authorization': `Bearer ${token}`,
          },
        },
      };
    }

    return definition;
  }

  /**
   * Attempts to retrieve the GitHub OAuth token from VS Code's authentication API.
   * Returns null if not authenticated or the user declines.
   */
  private async getGitHubToken(): Promise<string | null> {
    try {
      const session = await vscode.authentication.getSession('github', ['read:user'], {
        createIfNone: false,
      });
      return session?.accessToken ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Triggers a refresh of the MCP server definitions
   */
  refresh(): void {
    this._onDidChangeMcpServerDefinitions.fire();
  }

  dispose(): void {
    this._onDidChangeMcpServerDefinitions.dispose();
  }
}
