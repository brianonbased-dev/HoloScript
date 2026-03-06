import * as vscode from 'vscode';
import type { TraitPackage, TraitSummary, SearchResult } from '@holoscript/marketplace-api';

export interface MarketplaceMessage {
  command: string;
  [key: string]: unknown;
}

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
  private _activeTab: 'traits' | 'agents' = 'traits';

  /**
   * Creates or shows the Marketplace webview panel
   */
  public static createOrShow(extensionUri: vscode.Uri) {
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

    MarketplaceWebview.currentPanel = new MarketplaceWebview(panel, extensionUri);
    return MarketplaceWebview.currentPanel;
  }

  /**
   * Revives the panel from a persisted state
   */
  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    MarketplaceWebview.currentPanel = new MarketplaceWebview(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;
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
  }

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

      case 'openExternal':
        const url = message.url as string;
        if (url) {
          vscode.env.openExternal(vscode.Uri.parse(url));
        }
        break;

      case 'copyToClipboard':
        const text = message.text as string;
        if (text) {
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage('Copied to clipboard!');
        }
        break;

      case 'refresh':
        if (this._activeTab === 'agents') {
          await this._searchAgents(this._searchQuery);
        } else {
          await this._performSearch(this._searchQuery);
        }
        break;

      case 'filterByCategory':
        await this._performSearch(this._searchQuery, {
          category: message.category as string,
        });
        break;

      case 'switchTab':
        this._activeTab = message.tab as 'traits' | 'agents';
        if (this._activeTab === 'agents') {
          await this._searchAgents('');
        } else {
          await this._performSearch('');
        }
        break;

      case 'searchAgents':
        await this._searchAgents(message.query as string);
        break;

      case 'installAgent':
        await this._installAgent(message.agentId as string);
        break;
    }
  }

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
          `✅ Installed agent "${result.templateName}". Program type: ${result.programType}`
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
   * Disposes the webview panel
   */
  public dispose() {
    MarketplaceWebview.currentPanel = undefined;
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
          <span class="logo">🌀</span>
          HoloScript Marketplace
        </h1>
      </div>
      <div class="header-right">
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
      <button class="tab-btn active" data-tab="traits">🧩 Traits</button>
      <button class="tab-btn" data-tab="agents">🤖 Agents</button>
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
        <!-- Traits will be inserted here -->
      </div>

      <!-- Agent List (hidden by default) -->
      <div id="agent-list" class="trait-list" style="display: none;">
        <div class="loading-indicator" style="display: none;">
          <span class="codicon codicon-loading codicon-modifier-spin"></span>
          Loading agents...
        </div>
        <div class="empty-state" style="display: none;">
          <span class="codicon codicon-robot"></span>
          <p>No agents found</p>
        </div>
        <!-- Agent cards will be inserted here -->
      </div>

      <!-- Trait Details Panel -->
      <div id="trait-details" class="trait-details" style="display: none;">
        <button id="close-details" class="close-btn">
          <span class="codicon codicon-close"></span>
        </button>
        <div class="details-content">
          <!-- Details will be inserted here -->
        </div>
      </div>
    </main>

    <!-- Status Bar -->
    <footer class="status-bar">
      <span id="result-count">0 traits</span>
      <span class="status-separator">|</span>
      <span id="api-status">Connected</span>
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
