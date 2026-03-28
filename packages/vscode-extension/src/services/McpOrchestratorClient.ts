import * as vscode from 'vscode';
import { CircuitBreakerFetch } from './CircuitBreaker.js';

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

export interface McpServerInfo {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  tools: string[];
  workspace?: string;
  visibility?: 'public' | 'private';
  lastHeartbeat?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpHealthInfo {
  status: 'ok' | 'degraded' | 'down';
  uptime?: number;
  serverCount?: number;
  version?: string;
}

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
  private circuitBreaker: CircuitBreakerFetch | null = null;

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

    this.initCircuitBreaker(config);

    this.register(config).catch((err) => this.log(`Register failed: ${err}`));

    this.startHeartbeat(config);

    context.subscriptions.push({ dispose: () => this.stopHeartbeat() });

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('holoscript.mcp')) {
        this.stopHeartbeat();
        const next = this.getConfig();
        if (next.enabled && next.apiKey && next.url) {
          this.initCircuitBreaker(next);
          this.register(next).catch((err) => this.log(`Register failed: ${err}`));
          this.startHeartbeat(next);
        }
      }
    });
  }

  private initCircuitBreaker(config: ReturnType<McpOrchestratorClient['getConfig']>) {
    const urls = [
      config.url,
      'http://mcp-orchestrator.railway.internal',
      'https://mcp-orchestrator-production-45f9.up.railway.app',
      'http://localhost:3001'
    ].filter(Boolean) as string[];

    this.circuitBreaker = new CircuitBreakerFetch({
      urls,
      logger: (msg) => this.log(msg),
      failureThreshold: 3,
      resetTimeoutMs: 30000
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

    if (!apiKey || apiKey.includes('${env:')) {
      apiKey = process.env.MCP_API_KEY || '';
    }

    return { url, apiKey, enabled, heartbeatSeconds, visibility, workspace };
  }

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

  private async buildHeaders(): Promise<Record<string, string>> {
    const config = this.getConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-mcp-api-key': config.apiKey,
    };
    const ghToken = await this.getGitHubToken();
    if (ghToken) {
      headers['Authorization'] = `Bearer ${ghToken}`;
    }
    return headers;
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

  async connectToService(serverId: string): Promise<boolean> {
    if (!this.circuitBreaker) return false;
    this.log(`Attempting to bind link to service: ${serverId}`);
    try {
      const headers = await this.buildHeaders();
      const { response } = await this.circuitBreaker.fetchWithFailover(`/servers/${encodeURIComponent(serverId)}/enable`, {
        method: 'POST',
        headers,
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
    if (!this.circuitBreaker) return;
    const payload = this.buildRegistrationPayload(config);
    const headers = await this.buildHeaders();

    await this.circuitBreaker.fetchWithFailover(`/servers/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    this.log('Registered with MCP orchestrator.');
  }

  private startHeartbeat(config: ReturnType<McpOrchestratorClient['getConfig']>): void {
    const payload = this.buildRegistrationPayload(config);
    const intervalMs = Math.max(10, config.heartbeatSeconds) * 1000;

    this.heartbeatTimer = setInterval(async () => {
      if (!this.circuitBreaker) return;
      try {
        const headers = await this.buildHeaders();
        await this.circuitBreaker.fetchWithFailover(`/servers/${payload.id}/heartbeat`, {
          method: 'POST',
          headers,
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

  async getServers(): Promise<McpServerInfo[]> {
    if (!this.circuitBreaker) return [];
    const config = this.getConfig();
    if (!config.apiKey) return [];

    const headers = await this.buildHeaders();
    const { response } = await this.circuitBreaker.fetchWithFailover(`/servers`, { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch servers (${response.status})`);
    }

    const data: any = await response.json();
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

  async getServerTools(serverId: string): Promise<McpToolInfo[]> {
    if (!this.circuitBreaker) return [];
    const config = this.getConfig();
    if (!config.apiKey) return [];

    const headers = await this.buildHeaders();
    const { response } = await this.circuitBreaker.fetchWithFailover(
      `/servers/${encodeURIComponent(serverId)}/tools`,
      { headers }
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

  async getHealth(): Promise<McpHealthInfo> {
    if (!this.circuitBreaker) return { status: 'down' };

    try {
      const { response } = await this.circuitBreaker.fetchWithFailover(`/health`);
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
    } catch {
      return { status: 'down' };
    }
  }

  async enableServer(serverId: string): Promise<boolean> {
    if (!this.circuitBreaker) return false;
    const config = this.getConfig();
    if (!config.apiKey) return false;

    const headers = await this.buildHeaders();
    const { response } = await this.circuitBreaker.fetchWithFailover(
      `/servers/${encodeURIComponent(serverId)}/enable`,
      { method: 'POST', headers }
    );

    return response.ok;
  }

  async disableServer(serverId: string): Promise<boolean> {
    if (!this.circuitBreaker) return false;
    const config = this.getConfig();
    if (!config.apiKey) return false;

    const headers = await this.buildHeaders();
    const { response } = await this.circuitBreaker.fetchWithFailover(
      `/servers/${encodeURIComponent(serverId)}/disable`,
      { method: 'POST', headers }
    );

    return response.ok;
  }

  async getAgents(): Promise<McpAgentInfo[]> {
    if (!this.circuitBreaker) return [];
    const config = this.getConfig();
    if (!config.apiKey) return [];

    const headers = await this.buildHeaders();
    const { response } = await this.circuitBreaker.fetchWithFailover(`/agents`, { headers });

    if (!response.ok) {
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

    if (!config.apiKey) {
      return { ok: false, message: 'Missing MCP API key (holoscript.mcp.apiKey)' };
    }

    if (!this.circuitBreaker) {
      this.initCircuitBreaker(config);
    }

    try {
      const { response: health } = await this.circuitBreaker!.fetchWithFailover(`/health`);
      if (!health.ok) {
        return { ok: false, message: `Health check failed (${health.status})` };
      }

      const headers = await this.buildHeaders();
      const { response: servers, url } = await this.circuitBreaker!.fetchWithFailover(`/servers`, { headers });

      if (!servers.ok) {
        return { ok: false, message: `Auth failed (${servers.status})` };
      }

      const isFallback = url !== config.url && !url.includes(config.url);
      const connectivityMsg = isFallback ? `Connected to fallback (${url})` : `Connected to primary (${config.url})`;

      return { ok: true, message: connectivityMsg };
    } catch (error: any) {
      return { ok: false, message: `Connection failed: ${error?.message || error}` };
    }
  }
}
