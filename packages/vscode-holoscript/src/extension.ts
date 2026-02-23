import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  type InitializeResult,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('holoscript');

  // ─── Resolve LSP server path ──────────────────────────────────────────────
  const customPath = config.get<string>('server.path', '');
  const serverModule = customPath.trim()
    ? customPath.trim()
    : context.asAbsolutePath(path.join('dist', 'lsp-server.js'));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  // ─── Client options ───────────────────────────────────────────────────────
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'holoscript' },
      { scheme: 'untitled', language: 'holoscript' },
    ],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{holo,holoscript,hs+}'),
    },
    traceOutputChannel: vscode.window.createOutputChannel('HoloScript LSP Trace'),
    outputChannelName: 'HoloScript Language Server',
    markdown: { isTrusted: true },
    initializationOptions: {
      // Forward workspace config to LSP server for its own feature flags
      traitDocumentationEnabled: true,
      semanticCompletionEnabled: true,
    },
  };

  // ─── Start client ─────────────────────────────────────────────────────────
  client = new LanguageClient(
    'holoscriptLSP',
    'HoloScript Language Server',
    serverOptions,
    clientOptions
  );

  client.start();

  // Log server version after initialization
  client.onReady().then(() => {
    const info = (client as LanguageClient & { initializeResult?: InitializeResult })
      .initializeResult;
    const version = info?.serverInfo?.version ?? 'unknown';
    vscode.window.setStatusBarMessage(`HoloScript LSP v${version} ready`, 3000);
  });

  // ─── Commands ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.restartServer', async () => {
      await client?.stop();
      await client?.start();
      vscode.window.showInformationMessage('HoloScript Language Server restarted.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.openPlayground', () => {
      const url = config.get<string>('playground.url', 'http://localhost:3000/playground');
      vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  // ─── Status bar item ──────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = '$(symbol-misc) HoloScript';
  statusBar.tooltip = 'HoloScript Language Server';
  statusBar.command = 'holoscript.restartServer';
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Show/hide based on active editor language
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === 'holoscript') {
        statusBar.show();
      } else {
        statusBar.hide();
      }
    })
  );
}

export async function deactivate() {
  if (client) {
    await client.stop();
  }
}
