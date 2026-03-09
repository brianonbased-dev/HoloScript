/**
 * VRRTwinPreviewPanel — 3D VRR Digital Twin Preview Webview
 *
 * Provides a visual interface for previewing VRR digital twins with:
 * - Real-time weather sync visualization
 * - Event markers and overlays
 * - Inventory status indicators
 * - 3D scene representation
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type { HololandServices } from '../services/HololandServices';

export class VRRTwinPreviewPanel {
  public static currentPanel: VRRTwinPreviewPanel | undefined;
  public static readonly viewType = 'holoscript.vrrTwinPreview';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _services: HololandServices;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    services: HololandServices,
    twinId?: string
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (VRRTwinPreviewPanel.currentPanel) {
      VRRTwinPreviewPanel.currentPanel._panel.reveal(column);
      if (twinId) {
        VRRTwinPreviewPanel.currentPanel.loadTwin(twinId);
      }
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      VRRTwinPreviewPanel.viewType,
      'VRR Twin Preview',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    VRRTwinPreviewPanel.currentPanel = new VRRTwinPreviewPanel(
      panel,
      extensionUri,
      services,
      twinId
    );
  }

  public static revive(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    services: HololandServices
  ) {
    VRRTwinPreviewPanel.currentPanel = new VRRTwinPreviewPanel(panel, extensionUri, services);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    services: HololandServices,
    twinId?: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._services = services;

    // Set the webview's initial html content
    this._update(twinId);

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'loadTwin':
            this.loadTwin(message.twinId);
            break;
          case 'startSync':
            this._services.vrrSync.start();
            vscode.window.showInformationMessage('VRR sync started');
            break;
          case 'stopSync':
            this._services.vrrSync.stop();
            vscode.window.showInformationMessage('VRR sync stopped');
            break;
          case 'refreshWeather':
            this.refreshWeather();
            break;
        }
      },
      null,
      this._disposables
    );

    // Listen for VRR sync events
    this._services.vrrSync.on('weather', (data) => {
      this._panel.webview.postMessage({
        type: 'weatherUpdate',
        data,
      });
    });

    this._services.vrrSync.on('events', (data) => {
      this._panel.webview.postMessage({
        type: 'eventsUpdate',
        data,
      });
    });

    this._services.vrrSync.on('inventory', (data) => {
      this._panel.webview.postMessage({
        type: 'inventoryUpdate',
        data,
      });
    });
  }

  public loadTwin(twinId: string) {
    this._panel.webview.postMessage({
      type: 'loadTwin',
      twinId,
    });
  }

  private refreshWeather() {
    // Trigger a manual weather sync
    const config = this._services.vrrSync.getConfig();
    if (config.enabled) {
      this._services.vrrSync.stop();
      this._services.vrrSync.start();
      vscode.window.showInformationMessage('Weather data refreshed');
    } else {
      vscode.window.showWarningMessage('VRR sync is disabled');
    }
  }

  public dispose() {
    VRRTwinPreviewPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update(twinId?: string) {
    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview, twinId);
  }

  private _getHtmlForWebview(webview: vscode.Webview, twinId?: string) {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>VRR Twin Preview</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
    }

    .controls {
      display: flex;
      gap: 10px;
    }

    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .preview-container {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 20px;
      margin-top: 20px;
    }

    .scene-view {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 20px;
      min-height: 500px;
      position: relative;
    }

    .scene-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .info-card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      padding: 15px;
    }

    .info-card h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--vscode-foreground);
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-label {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .info-value {
      color: var(--vscode-foreground);
      font-size: 13px;
      font-weight: 500;
    }

    .status-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }

    .status-active {
      background: #4caf50;
    }

    .status-inactive {
      background: #f44336;
    }

    .weather-icon {
      font-size: 32px;
      margin-bottom: 10px;
    }

    .event-list {
      list-style: none;
    }

    .event-item {
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 12px;
    }

    .event-item:last-child {
      border-bottom: none;
    }

    .inventory-bar {
      background: var(--vscode-progressBar-background);
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 5px;
    }

    .inventory-fill {
      background: var(--vscode-button-background);
      height: 100%;
      transition: width 0.3s ease;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌐 VRR Twin Preview</h1>
      <div class="controls">
        <button id="refreshBtn">🔄 Refresh</button>
        <button id="syncBtn">▶️ Start Sync</button>
      </div>
    </div>

    <div class="preview-container">
      <div class="scene-view">
        <div class="scene-placeholder" id="sceneView">
          <div style="text-align: center;">
            <div style="font-size: 48px; margin-bottom: 10px;">🏢</div>
            <div>VRR Digital Twin Scene</div>
            <div style="font-size: 12px; margin-top: 10px;">3D visualization coming soon</div>
          </div>
        </div>
      </div>

      <div class="sidebar">
        <!-- Weather Card -->
        <div class="info-card">
          <h3>🌤️ Weather Sync</h3>
          <div id="weatherData">
            <div style="text-align: center; padding: 20px;">
              <div class="weather-icon">⛅</div>
              <div style="font-size: 24px; margin-bottom: 5px;">--°C</div>
              <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">Loading...</div>
            </div>
          </div>
        </div>

        <!-- Events Card -->
        <div class="info-card">
          <h3>📅 Upcoming Events</h3>
          <ul class="event-list" id="eventsList">
            <li style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">Loading events...</li>
          </ul>
        </div>

        <!-- Inventory Card -->
        <div class="info-card">
          <h3>📦 Inventory Status</h3>
          <div id="inventoryData">
            <div class="info-row">
              <span class="info-label">Total Items</span>
              <span class="info-value">--</span>
            </div>
            <div class="info-row">
              <span class="info-label">Stock Level</span>
              <div style="flex: 1; margin-left: 10px;">
                <div class="inventory-bar">
                  <div class="inventory-fill" style="width: 0%"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sync Status Card -->
        <div class="info-card">
          <h3>⚙️ Sync Status</h3>
          <div class="info-row">
            <span class="info-label">VRR Sync</span>
            <span class="info-value">
              <span class="status-indicator status-inactive" id="syncStatus"></span>
              <span id="syncStatusText">Stopped</span>
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">Last Updated</span>
            <span class="info-value" id="lastUpdated">--</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let syncRunning = false;

    // Button handlers
    document.getElementById('refreshBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'refreshWeather' });
    });

    document.getElementById('syncBtn').addEventListener('click', () => {
      if (syncRunning) {
        vscode.postMessage({ command: 'stopSync' });
      } else {
        vscode.postMessage({ command: 'startSync' });
      }
    });

    // Message handler
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'weatherUpdate':
          updateWeatherDisplay(message.data);
          updateSyncStatus(true);
          break;
        case 'eventsUpdate':
          updateEventsDisplay(message.data);
          break;
        case 'inventoryUpdate':
          updateInventoryDisplay(message.data);
          break;
      }
    });

    function updateWeatherDisplay(weather) {
      const weatherData = document.getElementById('weatherData');
      const icon = getWeatherIcon(weather.condition);

      weatherData.innerHTML = \`
        <div style="text-align: center; padding: 20px;">
          <div class="weather-icon">\${icon}</div>
          <div style="font-size: 24px; margin-bottom: 5px;">\${weather.temperature.toFixed(1)}°C</div>
          <div style="font-size: 12px; color: var(--vscode-descriptionForeground);">\${weather.condition}</div>
          <div style="font-size: 11px; margin-top: 5px;">💨 \${weather.windSpeed} km/h | 💧 \${weather.humidity}%</div>
        </div>
      \`;

      document.getElementById('lastUpdated').textContent = new Date(weather.timestamp).toLocaleTimeString();
    }

    function updateEventsDisplay(data) {
      const eventsList = document.getElementById('eventsList');
      if (data.events.length === 0) {
        eventsList.innerHTML = '<li style="text-align: center; padding: 20px; color: var(--vscode-descriptionForeground);">No upcoming events</li>';
        return;
      }

      eventsList.innerHTML = data.events.slice(0, 5).map(event => \`
        <li class="event-item">
          <div style="font-weight: 500;">\${event.name}</div>
          <div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 3px;">
            \${new Date(event.startTime).toLocaleDateString()}
          </div>
        </li>
      \`).join('');
    }

    function updateInventoryDisplay(inventory) {
      const stockLevel = (inventory.totalInStock / inventory.totalCapacity) * 100;

      document.getElementById('inventoryData').innerHTML = \`
        <div class="info-row">
          <span class="info-label">Total Items</span>
          <span class="info-value">\${inventory.totalInStock}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Stock Level</span>
          <div style="flex: 1; margin-left: 10px;">
            <div class="inventory-bar">
              <div class="inventory-fill" style="width: \${stockLevel}%"></div>
            </div>
          </div>
        </div>
      \`;
    }

    function updateSyncStatus(running) {
      syncRunning = running;
      const statusIndicator = document.getElementById('syncStatus');
      const statusText = document.getElementById('syncStatusText');
      const syncBtn = document.getElementById('syncBtn');

      if (running) {
        statusIndicator.className = 'status-indicator status-active';
        statusText.textContent = 'Active';
        syncBtn.textContent = '⏸️ Stop Sync';
      } else {
        statusIndicator.className = 'status-indicator status-inactive';
        statusText.textContent = 'Stopped';
        syncBtn.textContent = '▶️ Start Sync';
      }
    }

    function getWeatherIcon(condition) {
      const icons = {
        sunny: '☀️',
        cloudy: '☁️',
        rainy: '🌧️',
        snowy: '❄️',
        foggy: '🌫️',
        stormy: '⛈️'
      };
      return icons[condition] || '🌤️';
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
