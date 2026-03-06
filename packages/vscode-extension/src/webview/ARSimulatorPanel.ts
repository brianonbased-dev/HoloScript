/**
 * ARSimulatorPanel — AR Entry Point Simulator Webview
 *
 * Simulates AR portal scanning and layer transitions with:
 * - QR code preview
 * - Camera simulation
 * - Layer transition preview (AR → VRR → VR)
 * - Payment flow simulation
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type { HololandServices } from '../services/HololandServices';

export class ARSimulatorPanel {
  public static currentPanel: ARSimulatorPanel | undefined;
  public static readonly viewType = 'holoscript.arSimulator';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _services: HololandServices;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, services: HololandServices) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (ARSimulatorPanel.currentPanel) {
      ARSimulatorPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ARSimulatorPanel.viewType,
      'AR Simulator',
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    ARSimulatorPanel.currentPanel = new ARSimulatorPanel(panel, extensionUri, services);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    services: HololandServices
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._services = services;

    this._panel.webview.html = this._getHtmlForWebview();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'scanQR':
            await this.simulateQRScan(message.portalId);
            break;
          case 'processPayment':
            await this.processPayment(message.amount);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async simulateQRScan(portalId: string) {
    const portals = this._services.arPreview.getAllPortals();
    const portal = portals.find((p) => p.id === portalId) || portals[0];

    if (portal) {
      await this._services.arPreview.simulateScan(portal);
      this._panel.webview.postMessage({
        type: 'scanComplete',
        portal,
      });
    }
  }

  private async processPayment(amount: number) {
    try {
      const receipt = await this._services.x402Payment.pay({
        endpoint: 'ar-layer-transition',
        price: amount,
        currency: 'ETH',
      });

      this._panel.webview.postMessage({
        type: 'paymentComplete',
        receipt,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Payment failed: ${error}`);
    }
  }

  public dispose() {
    ARSimulatorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  private _getHtmlForWebview() {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>AR Simulator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 20px; }
    .simulator-view {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      margin-bottom: 20px;
    }
    .qr-code {
      width: 200px;
      height: 200px;
      background: white;
      margin: 20px auto;
      border: 8px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: #000;
    }
    .controls {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 20px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .layer-transition {
      display: flex;
      justify-content: space-around;
      margin: 30px 0;
    }
    .layer {
      padding: 20px;
      border: 2px solid var(--vscode-panel-border);
      border-radius: 8px;
      text-align: center;
      flex: 1;
      margin: 0 10px;
    }
    .layer.active { border-color: var(--vscode-button-background); }
    .status {
      margin-top: 20px;
      padding: 15px;
      background: var(--vscode-editor-background);
      border-radius: 4px;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📱 AR Entry Point Simulator</h1>

    <div class="simulator-view">
      <h2 style="margin-bottom: 20px;">QR Code Scanner</h2>
      <div class="qr-code" id="qrCode">
        <div>QR CODE<br/>PORTAL</div>
      </div>
      <div class="controls">
        <button id="scanBtn">📷 Scan QR Code</button>
        <button id="resetBtn">🔄 Reset</button>
      </div>
    </div>

    <div class="layer-transition">
      <div class="layer active" id="layerAR">
        <div style="font-size: 32px;">🎯</div>
        <h3>AR Layer</h3>
        <p style="font-size: 12px; margin-top: 5px;">Free Entry</p>
      </div>
      <div class="layer" id="layerVRR">
        <div style="font-size: 32px;">🌐</div>
        <h3>VRR Layer</h3>
        <p style="font-size: 12px; margin-top: 5px;">Digital Twin</p>
      </div>
      <div class="layer" id="layerVR">
        <div style="font-size: 32px;">🥽</div>
        <h3>VR Layer</h3>
        <p style="font-size: 12px; margin-top: 5px;">Premium</p>
      </div>
    </div>

    <div class="status" id="status">
      <strong>Status:</strong> Ready to scan
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('scanBtn').addEventListener('click', () => {
      simulateScan();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
      resetSimulation();
    });

    function simulateScan() {
      updateStatus('Scanning QR code...');
      document.getElementById('qrCode').style.background = '#4caf50';

      setTimeout(() => {
        vscode.postMessage({ command: 'scanQR', portalId: 'default' });
        activateLayer('VRR');
        updateStatus('✅ Scan complete! Entering VRR layer...');

        setTimeout(() => {
          updateStatus('🎉 Now in VRR Digital Twin environment');
        }, 1500);
      }, 1000);
    }

    function activateLayer(layer) {
      document.querySelectorAll('.layer').forEach(l => l.classList.remove('active'));
      document.getElementById('layer' + layer).classList.add('active');
    }

    function resetSimulation() {
      document.getElementById('qrCode').style.background = 'white';
      activateLayer('AR');
      updateStatus('Status: Ready to scan');
    }

    function updateStatus(message) {
      document.getElementById('status').innerHTML = '<strong>Status:</strong> ' + message;
    }

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'scanComplete') {
        updateStatus('✅ Portal accessed: ' + message.portal.destination);
      }
    });
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
