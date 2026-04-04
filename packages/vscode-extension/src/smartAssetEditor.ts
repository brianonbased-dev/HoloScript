import * as vscode from 'vscode';
import AdmZip = require('adm-zip');

export class SmartAssetEditorProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'holoscript.smartAssetViewer';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new SmartAssetEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(SmartAssetEditorProvider.viewType, provider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    });
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CustomDocument> {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    try {
      const fileData = await vscode.workspace.fs.readFile(document.uri);
      const zip = new AdmZip(Buffer.from(fileData));

      const entry = zip.getEntry('smart-asset.json');
      if (!entry) {
        webviewPanel.webview.html = this.getErrorHtml(
          'Invalid Smart Asset: smart-asset.json not found.'
        );
        return;
      }

      const jsonContent = entry.getData().toString('utf8');
      let smartAsset: Record<string, unknown>;
      try {
        smartAsset = JSON.parse(jsonContent);
      } catch (e) {
        webviewPanel.webview.html = this.getErrorHtml(
          'Invalid Smart Asset: Malformed smart-asset.json.'
        );
        return;
      }

      webviewPanel.webview.html = this.getHtmlForWebview(smartAsset);
    } catch (error) {
      webviewPanel.webview.html = this.getErrorHtml(`Error opening asset: ${error}`);
    }
  }

  private getErrorHtml(error: string): string {
    return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: sans-serif; padding: 20px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
                    .error { color: var(--vscode-errorForeground); font-size: 1.2em; }
                </style>
            </head>
            <body>
                <div class="error">⚠️ ${error}</div>
            </body>
            </html>
        `;
  }

  private getHtmlForWebview(asset: Record<string, unknown>): string {
    const scriptPreview = asset.script || '// No script provided';
    const metadata = asset.metadata || {};
    const physics = asset.physics || {};
    const ai = asset.ai || {};

    return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                    }
                    h1 { 
                        font-weight: normal; 
                        margin-bottom: 20px; 
                        border-bottom: 1px solid var(--vscode-widget-border);
                        padding-bottom: 10px;
                    }
                    h2 { font-size: 1.1em; color: var(--vscode-textLink-foreground); margin-top: 30px; }
                    .card {
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        padding: 15px;
                        border-radius: 4px;
                        margin-bottom: 10px;
                    }
                    .property { margin-bottom: 8px; display: flex; }
                    .label { font-weight: bold; width: 120px; color: var(--vscode-descriptionForeground); }
                    .value { opacity: 0.9; }
                    pre {
                        background: var(--vscode-textCodeBlock-background);
                        padding: 15px;
                        border-radius: 4px;
                        overflow-x: auto;
                        font-family: 'Consolas', 'Courier New', monospace;
                        font-size: 0.9em;
                        border: 1px solid var(--vscode-widget-border);
                    }
                    .tag {
                        display: inline-block;
                        padding: 2px 8px;
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        border-radius: 10px;
                        font-size: 0.85em;
                        margin-right: 5px;
                    }
                </style>
            </head>
            <body>
                <h1>📦 ${metadata.name || 'Unnamed Asset'} <span style="font-size: 0.6em; opacity: 0.6">v${metadata.version || '0.0.0'}</span></h1>
                
                <div class="card">
                    <p>${metadata.description || 'No description provided.'}</p>
                    <div style="margin-top: 10px;">
                        ${(metadata.tags || []).map((t: string) => `<span class="tag">${t}</span>`).join('')}
                    </div>
                </div>

                <div style="display: flex; gap: 20px;">
                    <div style="flex: 1;">
                        <h2>Details</h2>
                        <div class="card">
                            <div class="property"><span class="label">Author:</span> <span class="value">${metadata.author || 'Unknown'}</span></div>
                            <div class="property"><span class="label">Mass:</span> <span class="value">${physics.mass || 0}kg</span></div>
                            <div class="property"><span class="label">Collider:</span> <span class="value">${physics.colliderType || 'None'}</span></div>
                            <div class="property"><span class="label">AI Personality:</span> <span class="value">${ai.personality || 'Neutral'}</span></div>
                        </div>
                    </div>
                </div>

                <h2>HoloScript Logic</h2>
                <pre><code>${this.escapeHtml(scriptPreview)}</code></pre>

                <script>
                    const vscode = acquireVsCodeApi();
                </script>
            </body>
            </html>
        `;
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
