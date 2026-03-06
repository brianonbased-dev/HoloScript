/**
 * AgentWalletDashboard — AI Agent Wallet Dashboard Webview
 *
 * Shows wallet info with balance, transactions, NFT gallery, and royalty tracking.
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type { HololandServices } from '../services/HololandServices';

export class AgentWalletDashboard {
  public static currentPanel: AgentWalletDashboard | undefined;
  public static readonly viewType = 'holoscript.agentWalletDashboard';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _services: HololandServices;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, services: HololandServices) {
    if (AgentWalletDashboard.currentPanel) {
      AgentWalletDashboard.currentPanel._panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      AgentWalletDashboard.viewType,
      'Agent Wallet',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    AgentWalletDashboard.currentPanel = new AgentWalletDashboard(panel, services);
  }

  private constructor(panel: vscode.WebviewPanel, services: HololandServices) {
    this._panel = panel;
    this._services = services;
    this._panel.webview.html = this._getHtmlForWebview();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'createWallet') {
          await this.createWallet(message.agentId);
        } else if (message.command === 'refresh') {
          this.loadWallets();
        }
      },
      null,
      this._disposables
    );

    this.loadWallets();
  }

  private async createWallet(agentId: string) {
    try {
      const wallet = await this._services.agentKit.createWallet(agentId);
      this.loadWallets();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create wallet: ${error}`);
    }
  }

  private loadWallets() {
    const wallets = this._services.agentKit.getAllWallets();
    const royalties = this._services.agentKit.getTotalRoyalties();

    this._panel.webview.postMessage({
      type: 'walletsLoaded',
      wallets,
      totalRoyalties: royalties,
    });
  }

  public dispose() {
    AgentWalletDashboard.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  private _getHtmlForWebview() {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Agent Wallet Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
    .stat-card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 20px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 600; margin-bottom: 5px; }
    .stat-label { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .wallet-list { margin-top: 30px; }
    .wallet-item { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 15px; margin-bottom: 10px; }
    .wallet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .wallet-address { font-family: monospace; font-size: 11px; color: var(--vscode-descriptionForeground); }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <div class="container">
    <h1>💼 Agent Wallet Dashboard</h1>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-value" id="walletCount">0</div>
        <div class="stat-label">Active Wallets</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="totalBalance">0 ETH</div>
        <div class="stat-label">Total Balance</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="totalRoyalties">0 wei</div>
        <div class="stat-label">Total Royalties</div>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <button id="createBtn">+ Create New Wallet</button>
      <button id="refreshBtn" style="margin-left: 10px;">🔄 Refresh</button>
    </div>

    <div class="wallet-list" id="walletList">
      <p style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">No wallets yet. Create one to get started!</p>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('createBtn').addEventListener('click', () => {
      const agentId = prompt('Enter agent ID:');
      if (agentId) {
        vscode.postMessage({ command: 'createWallet', agentId });
      }
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'walletsLoaded') {
        renderWallets(message.wallets, message.totalRoyalties);
      }
    });

    function renderWallets(wallets, totalRoyalties) {
      document.getElementById('walletCount').textContent = wallets.length;
      document.getElementById('totalRoyalties').textContent = totalRoyalties + ' wei';

      const list = document.getElementById('walletList');
      if (wallets.length === 0) {
        list.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--vscode-descriptionForeground);">No wallets yet. Create one to get started!</p>';
        return;
      }

      list.innerHTML = wallets.map(wallet => \`
        <div class="wallet-item">
          <div class="wallet-header">
            <strong>\${wallet.id}</strong>
            <span>\${wallet.network}</span>
          </div>
          <div class="wallet-address">\${wallet.address}</div>
          <div style="margin-top: 10px; font-size: 12px;">
            Balance: <strong>\${wallet.balance} wei</strong>
          </div>
        </div>
      \`).join('');
    }
  </script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
