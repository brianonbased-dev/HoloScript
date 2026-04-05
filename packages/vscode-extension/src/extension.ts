import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { workspace, ExtensionContext, commands, window, TextDocument } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { HoloHubTreeDataProvider } from './holohubView';
import { HoloScriptPreviewPanel } from './previewPanel';
import { SmartAssetEditorProvider } from './smartAssetEditor';
import { agentAPI } from './agentApi';
import { HoloScriptCompletionItemProvider } from './completionProvider';
import { HoloScriptHoverProvider } from './hoverProvider';
import {
  HoloScriptSemanticTokensProvider,
  HoloScriptSemanticTokensRangeProvider,
  SEMANTIC_TOKENS_LEGEND,
} from './semanticTokensProvider';
import { TraitCompositionTreeProvider, registerTraitTreeCommands } from './traitTree';
import { HoloScriptInlineDebugAdapterFactory, HoloScriptDebugConfigurationProvider } from './debug';
import { HoloScriptMcpProvider } from './services/HoloScriptMcpProvider';
import { TeamBridge } from './services/TeamBridge';

let client: LanguageClient | undefined;
let traitTreeProvider: TraitCompositionTreeProvider | undefined;
let teamBridge: TeamBridge | undefined;

export function activate(context: ExtensionContext) {
  // ── Preview Commands ──────────────────────────────────────────────────────

  context.subscriptions.push(
    commands.registerCommand('holoscript.openPreview', () => {
      const editor = window.activeTextEditor;
      if (editor && isHoloScriptFile(editor.document)) {
        HoloScriptPreviewPanel.createOrShow(context.extensionUri, editor.document);
      } else {
        window.showWarningMessage('Open a HoloScript file (.holo or .hsplus) to preview.');
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('holoscript.openPreviewToSide', () => {
      const editor = window.activeTextEditor;
      if (editor && isHoloScriptFile(editor.document)) {
        HoloScriptPreviewPanel.createOrShow(context.extensionUri, editor.document);
      } else {
        window.showWarningMessage('Open a HoloScript file (.holo or .hsplus) to preview.');
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand('holoscript.openStudioPreview', async () => {
      const editor = window.activeTextEditor;
      if (!editor || !isHoloScriptFile(editor.document)) {
        window.showWarningMessage('Open a HoloScript file (.holo or .hsplus) to preview.');
        return;
      }

      const code = editor.document.getText();
      const fileName = path.basename(editor.document.fileName);
      const studioUrl = 'https://holoscript.net/studio';
      const encodedCode = encodeURIComponent(code);
      const previewUrl = `${studioUrl}?preview=true&file=${encodeURIComponent(fileName)}&code=${encodedCode}`;

      await vscode.env.openExternal(vscode.Uri.parse(previewUrl));
      window.showInformationMessage(`Opened ${fileName} in HoloScript Studio live preview`);
    })
  );

  // Auto-update preview when switching documents
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isHoloScriptFile(editor.document) && HoloScriptPreviewPanel.currentPanel) {
        HoloScriptPreviewPanel.currentPanel.updateContent(editor.document);
      }
    })
  );

  // Preview panel serializer for restore on restart
  if (window.registerWebviewPanelSerializer) {
    context.subscriptions.push(
      window.registerWebviewPanelSerializer(HoloScriptPreviewPanel.viewType, {
        async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: unknown) {
          HoloScriptPreviewPanel.revive(webviewPanel, context.extensionUri);
        },
      })
    );
  }

  // ── AI Agent API ──────────────────────────────────────────────────────────

  agentAPI.initialize(context);

  // ── Validate Command ──────────────────────────────────────────────────────

  context.subscriptions.push(
    commands.registerCommand('holoscript.validate', async () => {
      const editor = window.activeTextEditor;
      if (!editor || !isHoloScriptFile(editor.document)) {
        window.showWarningMessage('Open a HoloScript file (.holo or .hsplus) to validate.');
        return;
      }

      const text = editor.document.getText();
      const lines = text.split('\n');
      let braceCount = 0;
      let inString = false;

      for (const line of lines) {
        for (const char of line) {
          if (char === '"' || char === "'") inString = !inString;
          else if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
          }
        }
      }

      if (braceCount !== 0) {
        window.showErrorMessage('❌ Found error: Unbalanced braces');
      } else {
        window.showInformationMessage('✅ HoloScript syntax is valid!');
      }
    })
  );

  // ── Create First Scene ────────────────────────────────────────────────────

  context.subscriptions.push(
    commands.registerCommand('holoscript.createFirstScene', async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        window.showWarningMessage('Open a folder first to create HoloScript files.');
        return;
      }

      const filename = await window.showInputBox({
        prompt: 'Enter a name for your first scene',
        value: 'hello-world',
        placeHolder: 'hello-world',
      });

      if (!filename) return;

      const filePath = path.join(workspaceFolder.uri.fsPath, `${filename}.holo`);
      const defaultContent = `composition "My First Scene" {
  environment {
    skybox: "default"
    ambient_light: 0.5
  }

  object "MyFirstCube" {
    @grabbable
    @collidable

    geometry: "cube"
    position: [0, 1, 0]
    scale: [0.5, 0.5, 0.5]
    color: "#00ffff"
  }
}
`;

      try {
        fs.writeFileSync(filePath, defaultContent, 'utf8');
        const doc = await vscode.workspace.openTextDocument(filePath);
        await window.showTextDocument(doc);
        window.showInformationMessage(`Created ${filename}.holo!`);
      } catch (err) {
        window.showErrorMessage(`Failed to create file: ${err}`);
      }
    })
  );

  // ── Walkthrough & Docs ────────────────────────────────────────────────────

  context.subscriptions.push(
    commands.registerCommand('holoscript.showWalkthrough', () => {
      commands.executeCommand(
        'workbench.action.openWalkthrough',
        'holoscript.holoscript-vscode#holoscript-getting-started'
      );
    })
  );

  context.subscriptions.push(
    commands.registerCommand('holoscript.openDocumentation', () => {
      vscode.env.openExternal(vscode.Uri.parse('https://holoscript.net/guides/'));
    })
  );

  context.subscriptions.push(
    commands.registerCommand('holoscript.openExamples', async () => {
      const examplesPath = path.join(context.extensionPath, '..', '..', 'examples', 'quickstart');
      try {
        if (fs.existsSync(examplesPath)) {
          await commands.executeCommand('vscode.openFolder', vscode.Uri.file(examplesPath), {
            forceNewWindow: false,
          });
        } else {
          vscode.env.openExternal(
            vscode.Uri.parse(
              'https://github.com/brianonbased-dev/holoscript/tree/main/examples/quickstart'
            )
          );
        }
      } catch {
        vscode.env.openExternal(
          vscode.Uri.parse(
            'https://github.com/brianonbased-dev/holoscript/tree/main/examples/quickstart'
          )
        );
      }
    })
  );

  // Welcome message on first activation
  const hasShownWelcome = context.globalState.get('holoscript.hasShownWelcome');
  if (!hasShownWelcome) {
    context.globalState.update('holoscript.hasShownWelcome', true);
    window
      .showInformationMessage(
        'Welcome to HoloScript! Ready to build VR/AR experiences?',
        'Get Started',
        'Open Examples'
      )
      .then((selection) => {
        if (selection === 'Get Started') {
          commands.executeCommand('holoscript.showWalkthrough');
        } else if (selection === 'Open Examples') {
          commands.executeCommand('holoscript.openExamples');
        }
      });
  }

  // ── Language Server ───────────────────────────────────────────────────────

  const possiblePaths = [
    path.join(context.extensionPath, 'server', 'lsp', 'server.js'),
    path.join(context.extensionPath, '..', 'cli', 'dist', 'lsp', 'server.js'),
    path.join(context.extensionPath, 'node_modules', '@holoscript', 'cli', 'dist', 'lsp', 'server.js'),
    path.join(context.extensionPath, '..', 'lsp', 'dist', 'server.js'),
  ];

  let serverModule: string | undefined;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      serverModule = p;
      break;
    }
  }

  if (!serverModule) {
    return;
  }

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'holoscript' },
      { scheme: 'file', language: 'holoscriptplus' },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/.holoscriptrc'),
    },
  };

  client = new LanguageClient('holoscriptLSP', 'HoloScript Language Server', serverOptions, clientOptions);
  client.start().catch((err) => {
    console.error('HoloScript: Failed to start language server:', err);
  });

  // ── Smart Asset Editor ────────────────────────────────────────────────────

  context.subscriptions.push(SmartAssetEditorProvider.register(context));

  // ── HoloHub Asset Tree ────────────────────────────────────────────────────

  const holohubProvider = new HoloHubTreeDataProvider();
  vscode.window.registerTreeDataProvider('holohub.assets', holohubProvider);

  // ── Trait Composition Tree ────────────────────────────────────────────────

  traitTreeProvider = new TraitCompositionTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('holoscript.traitCompositionTree', traitTreeProvider)
  );
  registerTraitTreeCommands(context, traitTreeProvider);

  // ── Completion & Hover ────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      ['holoscript', 'holoscriptplus'],
      new HoloScriptCompletionItemProvider(),
      '@'
    )
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['holoscript', 'holoscriptplus'],
      new HoloScriptHoverProvider()
    )
  );

  // ── Semantic Tokens ───────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      ['holoscript', 'holoscriptplus'],
      new HoloScriptSemanticTokensProvider(),
      SEMANTIC_TOKENS_LEGEND
    )
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentRangeSemanticTokensProvider(
      ['holoscript', 'holoscriptplus'],
      new HoloScriptSemanticTokensRangeProvider(),
      SEMANTIC_TOKENS_LEGEND
    )
  );

  // ── Formatter ─────────────────────────────────────────────────────────────

  try {
    const formatter = require('@holoscript/formatter');
    const { loadConfig } = formatter;

    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(['holoscript', 'holoscriptplus'], {
        provideDocumentFormattingEdits(
          document: vscode.TextDocument
        ): vscode.ProviderResult<vscode.TextEdit[]> {
          const config = vscode.workspace.getConfiguration('holoscript');
          const timeout = config.get<number>('formatOnSaveTimeout', 1000);

          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              resolve([]);
            }, timeout);

            try {
              const options = loadConfig(document.fileName);
              const fmtr = formatter.createFormatter(options);
              const text = document.getText();
              const result = fmtr.format(text, document.languageId === 'holoscriptplus' ? 'hsplus' : 'holo');
              clearTimeout(timer);

              if (!result.changed) {
                resolve([]);
                return;
              }

              const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
              resolve([vscode.TextEdit.replace(fullRange, result.formatted)]);
            } catch (err) {
              clearTimeout(timer);
              resolve([]);
            }
          });
        },
      }),
      vscode.languages.registerDocumentRangeFormattingEditProvider(['holoscript', 'holoscriptplus'], {
        provideDocumentRangeFormattingEdits(
          document: vscode.TextDocument,
          range: vscode.Range
        ): vscode.TextEdit[] {
          try {
            const options = loadConfig(document.fileName);
            const fmtr = formatter.createFormatter(options);
            const text = document.getText();
            const fileType = document.languageId === 'holoscriptplus' ? 'hsplus' : 'holo';
            const result = fmtr.formatRange(text, { startLine: range.start.line, endLine: range.end.line }, fileType);
            if (!result.changed) return [];
            return [vscode.TextEdit.replace(range, result.formatted)];
          } catch {
            return [];
          }
        },
      })
    );
  } catch {
    // Formatter package not available — skip
  }

  // ── Debug Adapter ─────────────────────────────────────────────────────────

  const debugType = 'holoscript-debug';

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(debugType, new HoloScriptInlineDebugAdapterFactory())
  );

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(debugType, new HoloScriptDebugConfigurationProvider())
  );

  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      debugType,
      {
        provideDebugConfigurations(): vscode.ProviderResult<vscode.DebugConfiguration[]> {
          return [
            {
              type: debugType,
              request: 'launch',
              name: 'Debug Current HoloScript File',
              program: '${file}',
              stopOnEntry: true,
            },
          ];
        },
      },
      vscode.DebugConfigurationProviderTriggerKind.Dynamic
    )
  );

  // ── MCP Server Definition Provider ────────────────────────────────────────

  if (vscode.lm && vscode.lm.registerMcpServerDefinitionProvider) {
    try {
      const mcpProvider = new HoloScriptMcpProvider();
      context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider('holoscriptMcp', mcpProvider)
      );
    } catch {
      // MCP API not available in this VS Code version
    }
  }

  // ── HoloMesh Team Bridge ──────────────────────────────────────────────────

  teamBridge = TeamBridge.getInstance();
  teamBridge.activate(context);

}

function isHoloScriptFile(document: TextDocument): boolean {
  const fileName = document.fileName.toLowerCase();
  return fileName.endsWith('.holo') || fileName.endsWith('.hsplus') || fileName.endsWith('.hs');
}

export function deactivate(): Thenable<void> | undefined {
  if (teamBridge) {
    teamBridge.deactivate();
    teamBridge = undefined;
  }

  if (traitTreeProvider) {
    traitTreeProvider.dispose();
    traitTreeProvider = undefined;
  }

  if (!client) {
    return undefined;
  }
  return client.stop();
}
