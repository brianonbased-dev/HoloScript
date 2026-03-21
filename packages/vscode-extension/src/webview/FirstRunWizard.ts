import * as vscode from 'vscode';
import { McpOrchestratorClient } from '../services/McpOrchestratorClient';

export class FirstRunWizard {
    public static currentPanel: FirstRunWizard | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, private mcpClient: McpOrchestratorClient) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'complete':
                    await vscode.commands.executeCommand('holoscript.completeSetup');
                    this.dispose();
                    break;
            }
        }, null, this._disposables);
    }

    public static createOrShow(extensionUri: vscode.Uri, mcpClient: McpOrchestratorClient) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (FirstRunWizard.currentPanel) {
            FirstRunWizard.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'holoscriptWizard',
            'HoloScript Setup Wizard',
            column || vscode.ViewColumn.One,
            { enableScripts: true }
        );

        FirstRunWizard.currentPanel = new FirstRunWizard(panel, extensionUri, mcpClient);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <style>
                    body { font-family: sans-serif; padding: 20px; line-height: 1.6; }
                    .step { display: none; }
                    .step.active { display: block; }
                    button { background: #007acc; color: white; border: none; padding: 10px 20px; cursor: pointer; border-radius: 4px; }
                    h1 { color: #007acc; }
                    .nav { margin-top: 20px; }
                </style>
            </head>
            <body>
                <div id="step1" class="step active">
                    <h1>Welcome to HoloScript Studio!</h1>
                    <p>Experience the future of spatial computing. This wizard will help you set up your integrated service connectors.</p>
                    <div class="nav"><button onclick="next(2)">Get Started</button></div>
                </div>
                <div id="step2" class="step">
                    <h1>Universal Integration Hub</h1>
                    <p>Connect to GitHub, Railway, and the App Store automatically using the Model Context Protocol (MCP).</p>
                    <div class="nav"><button onclick="next(3)">Next</button></div>
                </div>
                <div id="step3" class="step">
                    <h1>All Set!</h1>
                    <p>You can now use the Service Connector hub to dogfood your Railway deployments.</p>
                    <div class="nav"><button onclick="finish()">Finish Setup</button></div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    function next(step) {
                        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
                        document.getElementById('step' + step).classList.add('active');
                    }
                    function finish() {
                        vscode.postMessage({ command: 'complete' });
                    }
                </script>
            </body>
            </html>`;
    }

    public dispose() {
        FirstRunWizard.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
