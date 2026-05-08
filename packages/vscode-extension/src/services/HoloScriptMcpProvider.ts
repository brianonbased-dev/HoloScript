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
export class HoloScriptMcpProvider implements vscode.McpServerDefinitionProvider {
  private readonly _onDidChangeMcpServerDefinitions = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this._onDidChangeMcpServerDefinitions.event;

  /**
   * Provides the MCP server configuration for the HoloScript production server
   */
  provideMcpServerDefinitions(
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.McpServerDefinition[]> {
    const config = vscode.workspace.getConfiguration('holoscript.mcp');
    const enabled = config.get<boolean>('holoscriptMcpEnabled', true);

    if (!enabled) {
      return [];
    }

    // Production HoloScript MCP server at mcp.holoscript.net
    const serverDefinition = new vscode.McpHttpServerDefinition(
      'HoloScript',
      vscode.Uri.parse('https://mcp.holoscript.net/mcp'),
      {
        'User-Agent': 'vscode-holoscript-extension/3.1.0',
        'Accept': 'application/json',
      },
      '3.6.1'
    );

    return [serverDefinition];
  }

  /**
   * Resolves the MCP server definition when VS Code needs to start the server.
   * Injects GitHub OAuth token if available so the MCP server knows the caller's identity.
   */
  async resolveMcpServerDefinition(
    server: vscode.McpServerDefinition,
    _token: vscode.CancellationToken
  ): Promise<vscode.McpServerDefinition> {
    // Only HTTP server definitions can have their headers modified
    if (!(server instanceof vscode.McpHttpServerDefinition)) {
      return server;
    }

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
    if (token) {
      server.headers = {
        ...server.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    return server;
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
