import * as vscode from 'vscode';
import type { TraitPackage, TraitSummary, SearchResult } from '@holoscript/marketplace-api';
import {
  McpOrchestratorClient,
  McpServerInfo,
  McpToolInfo,
  McpHealthInfo,
  McpAgentInfo,
} from '../services/McpOrchestratorClient';

export interface MarketplaceMessage {
  command: string;
  [key: string]: unknown;
}

export type MarketplaceTab = 'traits' | 'mcpServers' | 'agentMarketplace' | 'agents';

export class MarketplaceWebview {
  public static currentPanel: MarketplaceWebview | undefined;
  public static readonly viewType = 'holoscriptMarketplace';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  // State
  private _searchQuery: string = '';
  private _traits: TraitSummary[] = [];
  private _selectedTrait: TraitPackage | null = null;
  private _loading: boolean = false;
  private _apiBaseUrl: string;
  private _mcpmeUrl: string;
  private _activeTab: MarketplaceTab = 'traits';

  // MCP orchestrator state
  private _mcpClient: McpOrchestratorClient;
  private _mcpServers: McpServerInfo[] = [];
  private _mcpHealth: McpHealthInfo = { status: 'down' };
  private _mcpAgents: McpAgentInfo[] = [];
  private _healthPollTimer: NodeJS.Timeout | null = null;
  private _healthPollIntervalMs: number = 30_000;

  /**
   * Creates or shows the Marketplace webview panel
   */
  public static createOrShow(extensionUri: vscode.Uri, mcpClient?: McpOrchestratorClient) {
    const column = vscode.ViewColumn.One;

    if (MarketplaceWebview.currentPanel) {
      MarketplaceWebview.currentPanel._panel.reveal(column);
      return MarketplaceWebview.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      MarketplaceWebview.viewType,
      'HoloScript Marketplace',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'webview', 'marketplace'),
        ],
      }
    );

    MarketplaceWebview.currentPanel = new MarketplaceWebview(
      panel,
      extensionUri,
      mcpClient ?? new McpOrchestratorClient()
    );
    return MarketplaceWebview.currentPanel;
  }

  /**
   * Revives the panel from a persisted state
   */
  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    MarketplaceWebview.currentPanel = new MarketplaceWebview(
      panel,
      extensionUri,
      new McpOrchestratorClient()
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    mcpClient: McpOrchestratorClient
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._mcpClient = mcpClient;
    this._apiBaseUrl = vscode.workspace
      .getConfiguration('holoscript')
      .get('marketplaceApiUrl', 'http://localhost:3001');
    this._mcpmeUrl = vscode.workspace
      .getConfiguration('holoscript')
      .get('mcpmeUrl', 'https://mcp-orchestrator-production-45f9.up.railway.app');

    // Set initial HTML
    this._update();

    // Listen for panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Listen for webview messages
    this._panel.webview.onDidReceiveMessage(
      this._handleMessage.bind(this),
      null,
      this._disposables
    );

    // Initial search
    this._performSearch('');

    // Start health polling
    this._startHealthPolling();
  }

  // ── Health polling ─────────────────────────────────────────────────────

  /**
   * Starts periodic health polling from the MCP orchestrator.
   * Pushes health + server updates to the webview on each cycle.
   */
  private _startHealthPolling(): void {
    this._pollHealth(); // immediate first poll

    this._healthPollTimer = setInterval(() => {
      this._pollHealth();
    }, this._healthPollIntervalMs);
  }

  /** Stops the health polling timer. */
  private _stopHealthPolling(): void {
    if (this._healthPollTimer) {
      clearInterval(this._healthPollTimer);
      this._healthPollTimer = null;
    }
  }

  /** Executes a single health poll cycle. */
  private async _pollHealth(): Promise<void> {
    try {
      this._mcpHealth = await this._mcpClient.getHealth();
    } catch {
      this._mcpHealth = { status: 'down' };
    }

    this._postMessage({
      command: 'mcpHealthUpdate',
      health: this._mcpHealth,
    });
  }

  // ── Message handler ────────────────────────────────────────────────────

  /**
   * Handles messages from the webview
   */
  private async _handleMessage(message: MarketplaceMessage) {
    switch (message.command) {
      case 'search':
        await this._performSearch(message.query as string);
        break;

      case 'selectTrait':
        await this._selectTrait(message.traitId as string);
        break;

      case 'installTrait':
        await this._installTrait(message.traitId as string, message.version as string);
        break;

      case 'openExternal': {
        const url = message.url as string;
        if (url) {
          vscode.env.openExternal(vscode.Uri.parse(url));
        }
        break;
      }

      case 'copyToClipboard': {
        const text = message.text as string;
        if (text) {
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage('Copied to clipboard!');
        }
        break;
      }

      case 'refresh':
        await this._refreshActiveTab();
        break;

      case 'filterByCategory':
        await this._performSearch(this._searchQuery, {
          category: message.category as string,
        });
        break;

      case 'switchTab':
        this._activeTab = message.tab as MarketplaceTab;
        await this._refreshActiveTab();
        break;

      case 'searchAgents':
        await this._searchAgents(message.query as string);
        break;

      case 'installAgent':
        await this._installAgent(message.agentId as string);
        break;

      // ── MCP Servers tab messages ───────────────────────────────────
      case 'refreshMcpServers':
        await this._fetchMcpServers();
        break;

      case 'fetchServerTools':
        await this._fetchServerTools(message.serverId as string);
        break;

      case 'enableServer':
        await this._enableMcpServer(message.serverId as string);
        break;

      case 'disableServer':
        await this._disableMcpServer(message.serverId as string);
        break;

      // ── Agent Marketplace tab messages ─────────────────────────────
      case 'refreshAgentMarketplace':
        await this._fetchMcpAgents();
        break;
    }
  }

  /** Refreshes content based on the currently active tab. */
  private async _refreshActiveTab(): Promise<void> {
    switch (this._activeTab) {
      case 'traits':
        await this._performSearch(this._searchQuery);
        break;
      case 'agents':
        await this._searchAgents(this._searchQuery);
        break;
      case 'mcpServers':
        await this._fetchMcpServers();
        break;
      case 'agentMarketplace':
        await this._fetchMcpAgents();
        break;
    }
  }

  // ── MCP Servers methods ────────────────────────────────────────────────

  /**
   * Fetches all registered MCP servers and pushes them to the webview.
   */
  private async _fetchMcpServers(): Promise<void> {
    this._loading = true;
    this._postMessage({ command: 'loading', loading: true });

    try {
      this._mcpServers = await this._mcpClient.getServers();

      this._postMessage({
        command: 'mcpServersResult',
        servers: this._mcpServers,
        total: this._mcpServers.length,
      });
    } catch (error) {
      this._postMessage({
        command: 'error',
        message: `Failed to fetch MCP servers: ${error}`,
      });
    } finally {
      this._loading = false;
      this._postMessage({ command: 'loading', loading: false });
    }
  }

  /**
   * Fetches detailed tools for a single MCP server.
   */
  private async _fetchServerTools(serverId: string): Promise<void> {
    this._postMessage({ command: 'loading', loading: true });

    try {
      const tools: McpToolInfo[] = await this._mcpClient.getServerTools(serverId);

      this._postMessage({
        command: 'mcpServerToolsResult',
        serverId,
        tools,
      });
    } catch (error) {
      this._postMessage({
        command: 'error',
        message: `Failed to fetch tools for "${serverId}": ${error}`,
      });
    } finally {
      this._postMessage({ command: 'loading', loading: false });
    }
  }

  /**
   * Enables (installs) a server via the orchestrator.
   */
  private async _enableMcpServer(serverId: string): Promise<void> {
    this._postMessage({ command: 'installing', serverId, installing: true });

    try {
      const ok = await this._mcpClient.enableServer(serverId);

      if (ok) {
        vscode.window.showInformationMessage(`MCP server "${serverId}" enabled.`);
        // Refresh server list to show updated status
        await this._fetchMcpServers();
      } else {
        vscode.window.showWarningMessage(`Failed to enable MCP server "${serverId}".`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Enable server failed: ${error}`);
    } finally {
      this._postMessage({ command: 'installing', serverId, installing: false });
    }
  }

  /**
   * Disables a server via the orchestrator.
   */
  private async _disableMcpServer(serverId: string): Promise<void> {
    this._postMessage({ command: 'installing', serverId, installing: true });

    try {
      const ok = await this._mcpClient.disableServer(serverId);

      if (ok) {
        vscode.window.showInformationMessage(`MCP server "${serverId}" disabled.`);
        await this._fetchMcpServers();
      } else {
        vscode.window.showWarningMessage(`Failed to disable MCP server "${serverId}".`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Disable server failed: ${error}`);
    } finally {
      this._postMessage({ command: 'installing', serverId, installing: false });
    }
  }

  // ── MCP Agent Marketplace methods ──────────────────────────────────────

  /**
   * Fetches agent-protocol compatible agents from the orchestrator.
   */
  private async _fetchMcpAgents(): Promise<void> {
    this._loading = true;
    this._postMessage({ command: 'loading', loading: true });

    try {
      this._mcpAgents = await this._mcpClient.getAgents();

      this._postMessage({
        command: 'mcpAgentsResult',
        agents: this._mcpAgents,
        total: this._mcpAgents.length,
      });
    } catch (error) {
      this._postMessage({
        command: 'error',
        message: `Failed to fetch MCP agents: ${error}`,
      });
    } finally {
      this._loading = false;
      this._postMessage({ command: 'loading', loading: false });
    }
  }

  // ── Existing trait/agent methods ───────────────────────────────────────

  /**
   * Performs a search against the marketplace API
   */
  private async _performSearch(query: string, filters?: Record<string, unknown>) {
    this._loading = true;
    this._searchQuery = query;
    this._postMessage({ command: 'loading', loading: true });

    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (filters?.category) params.set('category', filters.category as string);
      params.set('limit', '50');

      const response = await fetch(`${this._apiBaseUrl}/api/v1/traits/search?${params}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const result: SearchResult = await response.json();
      this._traits = result.items;

      this._postMessage({
        command: 'searchResults',
        traits: this._traits,
        total: result.total,
        query,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Marketplace search failed: ${error}`);
      this._postMessage({
        command: 'error',
        message: `Failed to search marketplace: ${error}`,
      });
    } finally {
      this._loading = false;
      this._postMessage({ command: 'loading', loading: false });
    }
  }

  /**
   * Fetches and displays trait details
   */
  private async _selectTrait(traitId: string) {
    this._loading = true;
    this._postMessage({ command: 'loading', loading: true });

    try {
      const response = await fetch(
        `${this._apiBaseUrl}/api/v1/traits/${encodeURIComponent(traitId)}`
      );
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      this._selectedTrait = await response.json();

      this._postMessage({
        command: 'traitDetails',
        trait: this._selectedTrait,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load trait details: ${error}`);
      this._postMessage({
        command: 'error',
        message: `Failed to load trait: ${error}`,
      });
    } finally {
      this._loading = false;
      this._postMessage({ command: 'loading', loading: false });
    }
  }

  /**
   * Installs a trait to the current workspace
   */
  private async _installTrait(traitId: string, version?: string) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        'No workspace folder open. Please open a HoloScript project first.'
      );
      return;
    }

    this._postMessage({ command: 'installing', traitId, installing: true });

    try {
      // Run the holo CLI command to install the trait
      const terminal = vscode.window.createTerminal('HoloScript Install');
      const versionArg = version ? `@${version}` : '';
      terminal.sendText(`holo trait add ${traitId}${versionArg}`);
      terminal.show();

      vscode.window.showInformationMessage(`Installing ${traitId}...`);
    } catch (error) {
      vscode.window.showErrorMessage(`Installation failed: ${error}`);
    } finally {
      this._postMessage({ command: 'installing', traitId, installing: false });
    }
  }

  /**
   * Searches agent templates on the MCPMe orchestrator
   */
  private async _searchAgents(query: string) {
    this._loading = true;
    this._postMessage({ command: 'loading', loading: true });

    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('limit', '50');
      params.set('sort', 'popular');

      const response = await fetch(`${this._mcpmeUrl}/marketplace/search?${params}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const result = await response.json();

      this._postMessage({
        command: 'agentResults',
        agents: result.templates || [],
        total: result.total || 0,
        query,
      });
    } catch (error) {
      this._postMessage({
        command: 'error',
        message: `Failed to search agents: ${error}`,
      });
    } finally {
      this._loading = false;
      this._postMessage({ command: 'loading', loading: false });
    }
  }

  /**
   * Installs an agent template from the MCPMe orchestrator
   */
  private async _installAgent(agentId: string) {
    this._postMessage({ command: 'installing', agentId, installing: true });

    try {
      const response = await fetch(`${this._mcpmeUrl}/marketplace/${agentId}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`Install failed: ${response.status}`);
      const result = await response.json();

      if (result.success) {
        vscode.window.showInformationMessage(
          `Installed agent "${result.templateName}". Program type: ${result.programType}`
        );
        this._postMessage({ command: 'agentInstalled', agentId });
      } else {
        vscode.window.showWarningMessage(result.error || 'Install failed');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Agent install failed: ${error}`);
    } finally {
      this._postMessage({ command: 'installing', agentId, installing: false });
    }
  }

  // ── Webview plumbing ───────────────────────────────────────────────────

  /**
   * Posts a message to the webview
   */
  private _postMessage(message: object) {
    this._panel.webview.postMessage(message);
  }

  /**
   * Updates the webview HTML
   */
  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  /**
   * Disposes the webview panel and cleans up resources
   */
  public dispose() {
    MarketplaceWebview.currentPanel = undefined;
    this._stopHealthPolling();
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  /**
   * Generates the HTML for the webview
   */
  private _getHtmlForWebview(): string {
    const webview = this._panel.webview;
    const nonce = this._getNonce();

    // Get resource URIs
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'marketplace', 'marketplace.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'marketplace', 'marketplace.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; font-src ${webview.cspSource};">
  <title>HoloScript Marketplace</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="app">
    <!-- Header -->
    <header class="marketplace-header">
      <div class="header-left">
        <h1>
          <span class="logo">&#x1F300;</span>
          HoloScript Marketplace
        </h1>
      </div>
      <div class="header-right">
        <span id="mcp-health-indicator" class="health-indicator health-down" title="MCP Orchestrator: checking...">&#x25CF;</span>
        <button id="refresh-btn" class="icon-btn" title="Refresh">
          <span class="codicon codicon-refresh"></span>
        </button>
        <button id="open-web-btn" class="icon-btn" title="Open in Browser">
          <span class="codicon codicon-link-external"></span>
        </button>
      </div>
    </header>

    <!-- Search -->
    <div class="search-container">
      <div class="search-input-wrapper">
        <span class="codicon codicon-search search-icon"></span>
        <input
          type="text"
          id="search-input"
          placeholder="Search traits..."
          autocomplete="off"
        >
        <button id="clear-search" class="clear-btn" style="display: none;">
          <span class="codicon codicon-close"></span>
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="categories-bar">
      <button class="tab-btn active" data-tab="traits">&#x1F9E9; Traits</button>
      <button class="tab-btn" data-tab="mcpServers">&#x1F5A5; MCP Servers</button>
      <button class="tab-btn" data-tab="agentMarketplace">&#x1F916; Agent Marketplace</button>
      <button class="tab-btn" data-tab="agents">&#x1F4E6; Agent Templates</button>
      <span class="tab-separator">|</span>
      <button class="category-btn active" data-category="">All</button>
      <button class="category-btn" data-category="core">Core</button>
      <button class="category-btn" data-category="physics">Physics</button>
      <button class="category-btn" data-category="rendering">Rendering</button>
      <button class="category-btn" data-category="audio">Audio</button>
      <button class="category-btn" data-category="networking">Network</button>
      <button class="category-btn" data-category="ai">AI</button>
      <button class="category-btn" data-category="utility">Utility</button>
    </div>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Trait List -->
      <div id="trait-list" class="trait-list">
        <div class="loading-indicator" style="display: none;">
          <span class="codicon codicon-loading codicon-modifier-spin"></span>
          Loading...
        </div>
        <div class="empty-state" style="display: none;">
          <span class="codicon codicon-package"></span>
          <p>No traits found</p>
        </div>
      </div>

      <!-- MCP Servers List -->
      <div id="mcp-servers-list" class="trait-list" style="display: none;">
        <div class="loading-indicator" style="display: none;">
          <span class="codicon codicon-loading codicon-modifier-spin"></span>
          Loading MCP servers...
        </div>
        <div class="empty-state" style="display: none;">
          <span class="codicon codicon-server"></span>
          <p>No MCP servers registered</p>
        </div>
      </div>

      <!-- Agent Marketplace List -->
      <div id="agent-marketplace-list" class="trait-list" style="display: none;">
        <div class="loading-indicator" style="display: none;">
          <span class="codicon codicon-loading codicon-modifier-spin"></span>
          Loading agents...
        </div>
        <div class="empty-state" style="display: none;">
          <span class="codicon codicon-robot"></span>
          <p>No agent-protocol agents found</p>
        </div>
      </div>

      <!-- Agent Templates List (legacy) -->
      <div id="agent-list" class="trait-list" style="display: none;">
        <div class="loading-indicator" style="display: none;">
          <span class="codicon codicon-loading codicon-modifier-spin"></span>
          Loading agents...
        </div>
        <div class="empty-state" style="display: none;">
          <span class="codicon codicon-robot"></span>
          <p>No agents found</p>
        </div>
      </div>

      <!-- Trait Details Panel -->
      <div id="trait-details" class="trait-details" style="display: none;">
        <button id="close-details" class="close-btn">
          <span class="codicon codicon-close"></span>
        </button>
        <div class="details-content">
        </div>
      </div>
    </main>

    <!-- Status Bar -->
    <footer class="status-bar">
      <span id="result-count">0 traits</span>
      <span class="status-separator">|</span>
      <span id="api-status">Connected</span>
      <span class="status-separator">|</span>
      <span id="mcp-status">MCP: checking...</span>
    </footer>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generates a nonce for CSP
   */
  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
