import { ServiceConnector, McpRegistrar } from '@holoscript/connector-core';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { vscodeTools } from './tools.js';

/**
 * VSCodeConnector — Bidirectional bridge between Studio and the HoloScript VSCode extension
 *
 * Connection model:
 * 1. The VSCode extension runs a local HTTP bridge on a configurable port (default: 17420)
 * 2. This connector discovers and communicates with the extension via that bridge
 * 3. Studio can send commands (open file, push content, run terminal, etc.)
 * 4. Extension can push events to Studio via SSE activity stream
 *
 * The extension bridge endpoint is set via VSCODE_BRIDGE_URL environment variable
 * or defaults to http://localhost:17420
 */
export class VSCodeConnector extends ServiceConnector {
  private bridgeUrl: string = 'http://localhost:17420';
  private registrar = new McpRegistrar();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private workspaceInfo: WorkspaceInfo | null = null;

  constructor() {
    super();
  }

  async connect(): Promise<void> {
    // Configure bridge URL from environment
    this.bridgeUrl = process.env.VSCODE_BRIDGE_URL || 'http://localhost:17420';

    // Discover the running extension via bridge health check
    const reachable = await this.ping();
    if (!reachable) {
      throw new Error(
        `VSCode extension not reachable at ${this.bridgeUrl}. ` +
          'Ensure the HoloScript VSCode extension is running with the bridge enabled.'
      );
    }

    this.isConnected = true;

    // Fetch workspace info on connect
    this.workspaceInfo = await this.fetchWorkspaceInfo();

    // Register with MCP orchestrator
    await this.registrar.register({
      name: 'holoscript-vscode',
      url: this.bridgeUrl,
      tools: vscodeTools.map((t) => t.name),
    });

    // Start heartbeat to detect disconnection
    this.heartbeatInterval = setInterval(async () => {
      const alive = await this.ping();
      if (!alive && this.isConnected) {
        console.warn('[VSCodeConnector] Extension heartbeat lost');
        this.isConnected = false;
      } else if (alive && !this.isConnected) {
        console.log('[VSCodeConnector] Extension reconnected');
        this.isConnected = true;
      }
    }, 15_000); // 15-second heartbeat
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.isConnected = false;
    this.workspaceInfo = null;
  }

  async health(): Promise<boolean> {
    if (!this.isConnected) return false;
    return this.ping();
  }

  async listTools(): Promise<Tool[]> {
    return vscodeTools;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('VSCodeConnector is not connected.');
    }

    switch (name) {
      case 'vscode_extension_status':
        return this.getExtensionStatus();

      case 'vscode_file_open':
        return this.bridgeCommand('file/open', {
          path: args.path as string,
          line: args.line as number | undefined,
        });

      case 'vscode_preview_open':
        return this.bridgeCommand('preview/open', {
          path: args.path as string,
        });

      case 'vscode_sync_push':
        return this.bridgeCommand('sync/push', {
          path: args.path as string,
          content: args.content as string,
        });

      case 'vscode_sync_pull':
        return this.bridgeCommand('sync/pull', {
          path: args.path as string,
        });

      case 'vscode_terminal_run':
        return this.bridgeCommand('terminal/run', {
          command: args.command as string,
          cwd: args.cwd as string | undefined,
        });

      case 'vscode_mcp_status':
        return this.bridgeCommand('mcp/status', {});

      case 'vscode_workspace_info':
        return this.fetchWorkspaceInfo();

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ── Private Methods ──────────────────────────────────────────────────────────

  /**
   * Ping the extension bridge to check if it's reachable
   */
  private async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${this.bridgeUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Send a command to the extension bridge
   */
  private async bridgeCommand(
    endpoint: string,
    payload: Record<string, unknown>
  ): Promise<unknown> {
    const response = await fetch(`${this.bridgeUrl}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(
        `VSCode bridge error (${endpoint}): ${(errorData as any).error || response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Get extension status including version, workspace, and feature availability
   */
  private async getExtensionStatus(): Promise<ExtensionStatus> {
    try {
      const response = await fetch(`${this.bridgeUrl}/status`, {
        method: 'GET',
      });

      if (!response.ok) {
        return {
          connected: this.isConnected,
          version: 'unknown',
          workspace: this.workspaceInfo,
          features: [],
        };
      }

      const data = (await response.json()) as ExtensionStatus;
      return { ...data, connected: this.isConnected };
    } catch {
      return {
        connected: false,
        version: 'unknown',
        workspace: null,
        features: [],
      };
    }
  }

  /**
   * Fetch workspace information from the extension
   */
  private async fetchWorkspaceInfo(): Promise<WorkspaceInfo | null> {
    try {
      const response = await fetch(`${this.bridgeUrl}/api/workspace/info`, {
        method: 'GET',
      });

      if (!response.ok) return null;

      const data = (await response.json()) as WorkspaceInfo;
      this.workspaceInfo = data;
      return data;
    } catch {
      return null;
    }
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ExtensionStatus {
  connected: boolean;
  version: string;
  workspace: WorkspaceInfo | null;
  features: string[];
}

interface WorkspaceInfo {
  name: string;
  rootPath: string;
  folders: string[];
  openFiles: string[];
}
