import * as vscode from 'vscode';
import { McpOrchestratorClient } from '../services/McpOrchestratorClient';

export class ServiceConnectorPanel {
  public static currentPanel: ServiceConnectorPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private mcpClient: McpOrchestratorClient
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._update();
  }

  public static createOrShow(extensionUri: vscode.Uri, mcpClient: McpOrchestratorClient) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ServiceConnectorPanel.currentPanel) {
      ServiceConnectorPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'serviceHub',
      'Service Connector Hub',
      column || vscode.ViewColumn.One,
      { enableScripts: true }
    );

    ServiceConnectorPanel.currentPanel = new ServiceConnectorPanel(panel, extensionUri, mcpClient);
  }

  private async _update() {
    const webview = this._panel.webview;
    this._panel.webview.html = await this._getHtmlForWebview(webview);

    webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'connect':
          await this.mcpClient.connectToService(message.serverId);
          this._update();
          break;
        case 'refresh':
          this._update();
          break;
      }
    });
  }

  private async _getHtmlForWebview(webview: vscode.Webview) {
    const servers = await this.mcpClient.getServers();

    const serverList = servers
      .map((s) => {
        const isActive = s.status === 'active';
        const toolsHtml = isActive
          ? `
                <div class="tool-list">
                    <h4>Available Tools</h4>
                    <ul>
                        ${(s as any).tools?.map((t: any) => `<li><code>${t.name}</code></li>`).join('') || '<li>No tools exposed</li>'}
                    </ul>
                </div>
            `
          : '';

        return `
            <div class="server-card ${isActive ? 'active' : ''}">
                <div class="card-header">
                    <div class="status-indicator ${s.status}"></div>
                    <h3>${s.name}</h3>
                </div>
                <p class="description">${(s as any).description || 'Spatial infrastructure service'}</p>
                ${toolsHtml}
                <div class="actions">
                    <button class="btn-primary" onclick="connect('${s.id}')" ${isActive ? 'disabled' : ''}>
                        ${isActive ? 'Connected' : 'Connect Service'}
                    </button>
                    ${isActive ? '<button class="btn-secondary" onclick="deploy()">Run Pipeline</button>' : ''}
                </div>
            </div>
        `;
      })
      .join('');

    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    :root {
                        --glass-bg: rgba(25, 25, 25, 0.6);
                        --glass-border: rgba(255, 255, 255, 0.1);
                        --primary: #00a8ff;
                        --accent: #9c88ff;
                        --text: #f5f6fa;
                        --success: #4cd137;
                        --error: #e84118;
                    }
                    body {
                        background: #0a0a0a;
                        color: var(--text);
                        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                        padding: 30px;
                        margin: 0;
                        overflow-x: hidden;
                    }
                    .container {
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    h1 {
                        font-weight: 200;
                        font-size: 2.5em;
                        margin-bottom: 0.5em;
                        background: linear-gradient(135deg, #fff 0%, #888 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                    }
                    .subtitle {
                        opacity: 0.6;
                        margin-bottom: 40px;
                        font-weight: 300;
                    }
                    .server-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                        gap: 20px;
                    }
                    .server-card {
                        background: var(--glass-bg);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        border: 1px solid var(--glass-border);
                        border-radius: 16px;
                        padding: 24px;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        position: relative;
                        overflow: hidden;
                    }
                    .server-card:hover {
                        transform: translateY(-5px);
                        border-color: rgba(255, 255, 255, 0.2);
                        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    }
                    .server-card.active {
                        border-color: var(--primary);
                        box-shadow: 0 0 20px rgba(0, 168, 255, 0.2);
                    }
                    .card-header {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin-bottom: 16px;
                    }
                    .status-indicator {
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        background: #666;
                    }
                    .status-indicator.active {
                        background: var(--success);
                        box-shadow: 0 0 10px var(--success);
                        animation: pulse 2s infinite;
                    }
                    .status-indicator.inactive { background: var(--error); }
                    @keyframes pulse {
                        0% { transform: scale(0.95); opacity: 0.5; }
                        50% { transform: scale(1.05); opacity: 1; }
                        100% { transform: scale(0.95); opacity: 0.5; }
                    }
                    h3 { margin: 0; font-weight: 400; letter-spacing: 1px; }
                    .description { font-size: 0.9em; opacity: 0.7; margin-bottom: 20px; line-height: 1.5; }
                    .tool-list {
                        margin-bottom: 20px;
                        background: rgba(0,0,0,0.3);
                        padding: 12px;
                        border-radius: 8px;
                        font-size: 0.85em;
                    }
                    .tool-list h4 { margin-top: 0; opacity: 0.5; font-size: 0.8em; text-transform: uppercase; }
                    .tool-list ul { padding-left: 18px; margin: 0; list-style-type: square; color: var(--primary); }
                    .actions { display: flex; gap: 10px; }
                    button {
                        padding: 10px 20px;
                        border-radius: 8px;
                        border: none;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-primary { background: var(--primary); color: white; }
                    .btn-primary:hover:not(:disabled) { filter: brightness(1.2); }
                    .btn-primary:disabled { background: #333; color: #777; cursor: not-allowed; }
                    .btn-secondary { background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.1); }
                    .btn-secondary:hover { background: rgba(255,255,255,0.2); }
                    .refresh-btn { margin-top: 40px; background: transparent; border: 1px solid var(--glass-border); color: #888; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Service Hub</h1>
                    <p class="subtitle">Orchestrating spatial intelligence across the Infinitus Ecosystem.</p>
                    
                    <div class="server-grid">
                        ${serverList || '<div class="server-card"><p>No services discovered. Is the Mesh Orchestrator online?</p></div>'}
                    </div>

                    <button class="refresh-btn" onclick="refresh()">↺ Refresh Registry</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    function connect(serverId) {
                        vscode.postMessage({ command: 'connect', serverId });
                    }
                    function refresh() {
                        vscode.postMessage({ command: 'refresh' });
                    }
                    function deploy() {
                        vscode.postMessage({ command: 'deploy' });
                    }
                </script>
            </body>
            </html>`;
  }

  public dispose() {
    ServiceConnectorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}
