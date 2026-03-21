import * as vscode from 'vscode';

interface McpRegistrationPayload {
  id: string;
  name: string;
  command: string;
  args: string[];
  workspace: string;
  status: 'active' | 'inactive' | 'error';
  visibility?: 'public' | 'private';
  tools?: string[];
}

/** Represents a registered MCP server from the orchestrator registry. */
export interface McpServerInfo {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  tools: string[];
  workspace?: string;
  visibility?: 'public' | 'private';
  lastHeartbeat?: string;
}

/** A single tool exposed by an MCP server. */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Health response from the orchestrator. */
export interface McpHealthInfo {
  status: 'ok' | 'degraded' | 'down';
  uptime?: number;
  serverCount?: number;
  version?: string;
}

/** An agent-protocol compatible agent entry. */
export interface McpAgentInfo {
  id: string;
  name: string;
  description?: string;
  protocol: string;
  endpoint?: string;
  capabilities?: string[];
  status: 'online' | 'offline' | 'unknown';
}

export class McpOrchestratorClient {
  private readonly output = vscode.window.createOutputChannel('HoloScript MCP');
  private heartbeatTimer: NodeJS.Timeout | null = null;

  start(context: vscode.ExtensionContext): void {
    const config = this.getConfig();

    if (!config.enabled) {
      this.log('MCP integration disabled by settings.');
      return;
    }

    if (!config.apiKey || !config.url) {
      this.log(
        'Missing MCP API configuration. Set holoscript.mcpOrchestratorUrl and holoscript.mcpApiKey.'
      );
      return;
    }

    this.register(config).catch((err) => this.log(`Register failed: ${err}`));

    this.startHeartbeat(config);

    context.subscriptions.push({ dispose: () => this.stopHeartbeat() });

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('holoscript.mcp')) {
        this.stopHeartbeat();
        const next = this.getConfig();
        if (next.enabled && next.apiKey && next.url) {
          this.register(next).catch((err) => this.log(`Register failed: ${err}`));
          this.startHeartbeat(next);
        }
      }
    });
  }

  private getConfig() {
    const cfg = vscode.workspace.getConfiguration('holoscript.mcp');
    const url = cfg.get<string>('orchestratorUrl') || '';
    let apiKey = cfg.get<string>('apiKey') || '';
    const enabled = cfg.get<boolean>('enabled', true);
    const heartbeatSeconds = cfg.get<number>('heartbeatSeconds', 20);
    const visibility = cfg.get<'public' | 'private'>('visibility', 'public');
    const workspace = cfg.get<string>('workspaceId', 'holoscript');

    // Resolve environment variable reference or fallback to process.env
    if (!apiKey || apiKey.includes('${env:')) {
      apiKey = process.env.MCP_API_KEY || '';
    }

    return { url, apiKey, enabled, heartbeatSeconds, visibility, workspace };
  }

  private buildRegistrationPayload(
    config: ReturnType<McpOrchestratorClient['getConfig']>
  ): McpRegistrationPayload {
    const machineId = vscode.env.machineId?.slice(0, 8) || 'local';
    const id = `holoscript-vscode-${machineId}`;

    return {
      id,
      name: 'HoloScript VS Code Extension',
      command: 'vscode',
      args: [],
      workspace: config.workspace,
      status: 'active',
      visibility: config.visibility,
      tools: [
        'holoscript.agent.createFile',
        'holoscript.agent.generateObject',
        'holoscript.agent.analyzeScene',
        'holoscript.agent.insertCode',
        'holoscript.agent.openPreview',
        'holoscript.agent.addTrait',
        'holoscript.agent.listTraits',
        'holoscript.agent.validate',
        'holoscript.agent.status',
        'holoscript.openPreview',
        'holoscript.openPreviewToSide',
        'holoscript.validate',
        'holoscript.openServiceHub',
        'holoscript.runSetupWizard',
      ],
      metadata: {
        type: 'ide-hub',
        capabilities: ['service-discovery', 'deployment-control']
      }
    } as any;
  }

  /**
   * Facilitates connecting to a specific service connector discovered via the mesh.
   */
  async connectToService(serverId: string): Promise<boolean> {
    this.log(`Attempting to bind link to service: ${serverId}`);
    try {
      const config = this.getConfig();
      const response = await fetch(`${config.url}/servers/${encodeURIComponent(serverId)}/enable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': config.apiKey,
        },
      });
      
      if (response.ok) {
        this.log(`Successfully connected/enabled service: ${serverId}`);
        return true;
      }
      return false;
    } catch (error) {
      this.log(`Failed to connect to service ${serverId}: ${error}`);
      return false;
    }
  }

  private async register(config: ReturnType<McpOrchestratorClient['getConfig']>): Promise<void> {
    const payload = this.buildRegistrationPayload(config);

    await fetch(`${config.url}/servers/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    this.log('Registered with MCP orchestrator.');
  }

  private startHeartbeat(config: ReturnType<McpOrchestratorClient['getConfig']>): void {
    const payload = this.buildRegistrationPayload(config);
    const intervalMs = Math.max(10, config.heartbeatSeconds) * 1000;

    this.heartbeatTimer = setInterval(async () => {
      try {
        await fetch(`${config.url}/servers/${payload.id}/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mcp-api-key': config.apiKey,
          },
          body: JSON.stringify({ status: 'active', tools: payload.tools }),
        });
      } catch (err) {
        this.log(`Heartbeat failed: ${err}`);
      }
    }, intervalMs);

    this.log(`Heartbeat started (${config.heartbeatSeconds}s).`);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.log('Heartbeat stopped.');
    }
  }

  private log(message: string): void {
    this.output.appendLine(`[MCP] ${message}`);
  }

  // ── Public query methods ─────────────────────────────────────────────

  /**
   * Fetches all registered MCP servers from the orchestrator.
   */
  async getServers(): Promise<McpServerInfo[]> {
    const config = this.getConfig();
    if (!config.url || !config.apiKey) {
      return [];
    }

    const response = await fetch(`${config.url}/servers`, {
      headers: { 'x-mcp-api-key': config.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch servers (${response.status})`);
    }

    const data: any = await response.json();
    // Orchestrator may return { servers: [...] } or a plain array
    const raw: any[] = Array.isArray(data) ? data : data.servers ?? [];
    return raw.map((s: any) => ({
      id: s.id ?? '',
      name: s.name ?? s.id ?? 'Unknown',
      status: s.status ?? 'inactive',
      tools: Array.isArray(s.tools) ? s.tools : [],
      workspace: s.workspace,
      visibility: s.visibility,
      lastHeartbeat: s.lastHeartbeat ?? s.last_heartbeat,
    }));
  }

  /**
   * Fetches the tools exposed by a specific server.
   */
  async getServerTools(serverId: string): Promise<McpToolInfo[]> {
    const config = this.getConfig();
    if (!config.url || !config.apiKey) {
      return [];
    }

    const response = await fetch(
      `${config.url}/servers/${encodeURIComponent(serverId)}/tools`,
      { headers: { 'x-mcp-api-key': config.apiKey } }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch tools for ${serverId} (${response.status})`);
    }

    const data: any = await response.json();
    const raw: any[] = Array.isArray(data) ? data : data.tools ?? [];
    return raw.map((t: any) => ({
      name: t.name ?? '',
      description: t.description,
      inputSchema: t.inputSchema ?? t.input_schema,
    }));
  }

  /**
   * Fetches health information from the orchestrator.
   */
  async getHealth(): Promise<McpHealthInfo> {
    const config = this.getConfig();
    if (!config.url) {
      return { status: 'down' };
    }

    const response = await fetch(`${config.url}/health`);
    if (!response.ok) {
      return { status: 'down' };
    }

    const data: any = await response.json();
    return {
      status: data.status === 'ok' || data.status === 'healthy' ? 'ok'
        : data.status === 'degraded' ? 'degraded' : 'down',
      uptime: data.uptime,
      serverCount: data.serverCount ?? data.server_count,
      version: data.version,
    };
  }

  /**
   * Enables (installs) a server on the orchestrator.
   */
  async enableServer(serverId: string): Promise<boolean> {
    const config = this.getConfig();
    if (!config.url || !config.apiKey) {
      return false;
    }

    const response = await fetch(
      `${config.url}/servers/${encodeURIComponent(serverId)}/enable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': config.apiKey,
        },
      }
    );

    return response.ok;
  }

  /**
   * Disables a server on the orchestrator.
   */
  async disableServer(serverId: string): Promise<boolean> {
    const config = this.getConfig();
    if (!config.url || !config.apiKey) {
      return false;
    }

    const response = await fetch(
      `${config.url}/servers/${encodeURIComponent(serverId)}/disable`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': config.apiKey,
        },
      }
    );

    return response.ok;
  }

  /**
   * Fetches agent-protocol compatible agents from the orchestrator.
   */
  async getAgents(): Promise<McpAgentInfo[]> {
    const config = this.getConfig();
    if (!config.url || !config.apiKey) {
      return [];
    }

    const response = await fetch(`${config.url}/agents`, {
      headers: { 'x-mcp-api-key': config.apiKey },
    });

    if (!response.ok) {
      // Agents endpoint may not exist on older orchestrators
      return [];
    }

    const data: any = await response.json();
    const raw: any[] = Array.isArray(data) ? data : data.agents ?? [];
    return raw.map((a: any) => ({
      id: a.id ?? '',
      name: a.name ?? a.id ?? 'Unknown',
      description: a.description,
      protocol: a.protocol ?? 'agent-protocol',
      endpoint: a.endpoint,
      capabilities: Array.isArray(a.capabilities) ? a.capabilities : [],
      status: a.status ?? 'unknown',
    }));
  }

  async getStatus(): Promise<{ ok: boolean; message: string }> {
    const config = this.getConfig();

    if (!config.enabled) {
      return { ok: false, message: 'Integration disabled (holoscript.mcp.enabled=false)' };
    }

    if (!config.url) {
      return { ok: false, message: 'Missing orchestrator URL (holoscript.mcp.orchestratorUrl)' };
    }

    if (!config.apiKey) {
      return { ok: false, message: 'Missing MCP API key (holoscript.mcp.apiKey)' };
    }

    try {
      const health = await fetch(`${config.url}/health`);
      if (!health.ok) {
        return { ok: false, message: `Health check failed (${health.status})` };
      }

      const servers = await fetch(`${config.url}/servers`, {
        headers: { 'x-mcp-api-key': config.apiKey },
      });

      if (!servers.ok) {
        return { ok: false, message: `Auth failed (${servers.status})` };
      }

      return { ok: true, message: `Connected to ${config.url}` };
    } catch (error: any) {
      return { ok: false, message: `Connection failed: ${error?.message || error}` };
    }
  }
}
