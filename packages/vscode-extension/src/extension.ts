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
import { McpOrchestratorClient } from './services/McpOrchestratorClient';
import {
  HoloScriptSemanticTokensProvider,
  HoloScriptSemanticTokensRangeProvider,
  SEMANTIC_TOKENS_LEGEND,
} from './semanticTokensProvider';
import { registerCollaborationCommands, disposeCollaborationCommands } from './collaboration';
import {
  SemanticGit,
  DiffVisualizationProvider,
  DiffDecorationProvider,
  MergeDriver,
  HoloScriptGitHooks,
  registerGitCommands,
  createGitStatusBarItem,
  updateGitStatusBar,
} from './git';
import { MarketplaceWebview } from './webview/MarketplaceWebview';
import { TraitCompositionTreeProvider, registerTraitTreeCommands } from './traitTree';
import { HoloScriptInlineDebugAdapterFactory, HoloScriptDebugConfigurationProvider } from './debug';
import { HololandServices } from './services/HololandServices';
import { registerHololandCommands } from './services/HololandCommands';
import { registerHololandWebviews } from './webview/HololandWebviews';

let client: LanguageClient | undefined;
let traitTreeProvider: TraitCompositionTreeProvider | undefined;
let semanticGit: SemanticGit | undefined;
let gitStatusBarItem: vscode.StatusBarItem | undefined;
let diffDecorationProvider: DiffDecorationProvider | undefined;
let hololandServices: HololandServices | undefined;

export function activate(context: ExtensionContext) {
  // Register the preview command
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

  // Register command to open preview to the side
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

  // Auto-update preview when switching documents
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isHoloScriptFile(editor.document) && HoloScriptPreviewPanel.currentPanel) {
        HoloScriptPreviewPanel.currentPanel.updateContent(editor.document);
      }
    })
  );

  // Register webview panel serializer for restore on restart
  if (window.registerWebviewPanelSerializer) {
    context.subscriptions.push(
      window.registerWebviewPanelSerializer(HoloScriptPreviewPanel.viewType, {
        async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: unknown) {
          HoloScriptPreviewPanel.revive(webviewPanel, context.extensionUri);
        },
      })
    );
  }

  // Initialize AI Agent API - enables Brittney, Claude, Copilot to control extension
  agentAPI.initialize(context);
  console.log('HoloScript: AI Agent API initialized. Agents can use holoscript.agent.* commands.');

  // Register with MCP Orchestrator for IDE agent integration
  const mcpClient = new McpOrchestratorClient();
  mcpClient.start(context);

  // MCP status command
  context.subscriptions.push(
    commands.registerCommand('holoscript.mcp.status', async () => {
      const status = await mcpClient.getStatus();
      if (status.ok) {
        window.showInformationMessage(`MCP: ${status.message}`);
      } else {
        window.showWarningMessage(`MCP: ${status.message}`);
      }
    })
  );

  // Register Open Examples command
  context.subscriptions.push(
    commands.registerCommand('holoscript.openExamples', async () => {
      const examplesPath = path.join(context.extensionPath, '..', '..', 'examples', 'quickstart');
      const uri = vscode.Uri.file(examplesPath);

      // Try to open the quickstart folder
      try {
        if (fs.existsSync(examplesPath)) {
          await commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
        } else {
          // Fallback: open examples on GitHub
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

  // Register Show Walkthrough command
  context.subscriptions.push(
    commands.registerCommand('holoscript.showWalkthrough', () => {
      commands.executeCommand(
        'workbench.action.openWalkthrough',
        'holoscript.holoscript-vscode#holoscript-getting-started'
      );
    })
  );

  // Register Open Documentation command
  context.subscriptions.push(
    commands.registerCommand('holoscript.openDocumentation', () => {
      vscode.env.openExternal(vscode.Uri.parse('https://holoscript.net/guides/'));
    })
  );

  // Register Open Marketplace command (pass mcpClient for orchestrator integration)
  context.subscriptions.push(
    commands.registerCommand('holoscript.openMarketplace', () => {
      MarketplaceWebview.createOrShow(context.extensionUri, mcpClient);
    })
  );

  // Register webview panel serializer for marketplace
  if (window.registerWebviewPanelSerializer) {
    context.subscriptions.push(
      window.registerWebviewPanelSerializer(MarketplaceWebview.viewType, {
        async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: unknown) {
          MarketplaceWebview.revive(webviewPanel, context.extensionUri);
        },
      })
    );
  }

  // Register Validate command for users
  context.subscriptions.push(
    commands.registerCommand('holoscript.validate', async () => {
      const editor = window.activeTextEditor;
      if (!editor || !isHoloScriptFile(editor.document)) {
        window.showWarningMessage('Open a HoloScript file (.holo or .hsplus) to validate.');
        return;
      }

      const text = editor.document.getText();
      const lines = text.split('\n');
      const errors: { line: number; message: string }[] = [];

      // Basic syntax validation
      let braceCount = 0;
      let inString = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const char of line) {
          if (char === '"' || char === "'") inString = !inString;
          else if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
          }
        }
      }

      if (braceCount !== 0) {
        errors.push({ line: lines.length, message: 'Unbalanced braces' });
      }

      if (errors.length === 0) {
        window.showInformationMessage('✅ HoloScript syntax is valid!');
      } else {
        window.showErrorMessage(
          `❌ Found ${errors.length} error(s): ${errors.map((e) => e.message).join(', ')}`
        );
      }
    })
  );

  // Register interactive Create First Scene command (for walkthrough)
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
        window.showInformationMessage(`Created ${filename}.holo! 🎉 Try adding more objects.`);
      } catch (err) {
        window.showErrorMessage(`Failed to create file: ${err}`);
      }
    })
  );

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get('holoscript.hasShownWelcome');
  if (!hasShownWelcome) {
    context.globalState.update('holoscript.hasShownWelcome', true);
    window
      .showInformationMessage(
        'Welcome to HoloScript! 🎉 Ready to build VR/AR experiences?',
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

  // Try multiple possible server locations
  const possiblePaths = [
    // Bundled with extension
    path.join(context.extensionPath, 'server', 'lsp', 'server.js'),
    // In workspace (monorepo development)
    path.join(context.extensionPath, '..', 'cli', 'dist', 'lsp', 'server.js'),
    // Installed globally via npm
    path.join(
      context.extensionPath,
      'node_modules',
      '@holoscript',
      'cli',
      'dist',
      'lsp',
      'server.js'
    ),
    // From lsp package directly
    path.join(context.extensionPath, '..', 'lsp', 'dist', 'server.js'),
  ];

  let serverModule: string | undefined;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      serverModule = p;
      break;
    }
  }

  // If no server found, just provide syntax highlighting (no LSP features)
  if (!serverModule) {
    console.log('HoloScript: Language server not found. Running in syntax-only mode.');
    return;
  }

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
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

  client = new LanguageClient(
    'holoscriptLSP',
    'HoloScript Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client
  client.start().catch((err) => {
    console.error('HoloScript: Failed to start language server:', err);
  });

  // Register Custom Editor for Smart Assets (.hsa)
  context.subscriptions.push(SmartAssetEditorProvider.register(context));

  // Register HoloHub Tree View
  const holohubProvider = new HoloHubTreeDataProvider();
  vscode.window.registerTreeDataProvider('holohub.assets', holohubProvider);

  // Register Trait Composition Tree View (sidebar)
  traitTreeProvider = new TraitCompositionTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('holoscript.traitCompositionTree', traitTreeProvider)
  );
  registerTraitTreeCommands(context, traitTreeProvider);
  console.log('HoloScript: Trait Composition Tree view registered.');

  // Register Import Asset Command
  context.subscriptions.push(
    commands.registerCommand('holoscript.holohub.importAsset', async (item) => {
      // item type is HoloSmartAssetItem (inferred or any)
      const assetName = item?.label || 'Asset';
      window.showInformationMessage(`Downloading ${assetName} from HoloHub...`);

      // Mock download delay
      await new Promise((resolve) => setTimeout(resolve, 1500));

      window.showInformationMessage(`Successfully imported ${assetName} to project!`);
    })
  );

  // Register Formatter
  try {
    const formatter = require('@holoscript/formatter');
    const { loadConfig } = formatter; // Dynamic import to avoid build issues if dep missing during dev

    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(['holoscript', 'holoscriptplus'], {
        provideDocumentFormattingEdits(
          document: vscode.TextDocument
        ): vscode.ProviderResult<vscode.TextEdit[]> {
          const config = vscode.workspace.getConfiguration('holoscript');
          // Note: VS Code handles formatOnSave via editor.formatOnSave.
          // We can check our setting here but manual format should always work.
          const timeout = config.get<number>('formatOnSaveTimeout', 1000);

          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              console.warn('HoloScript: Formatting timed out');
              resolve([]);
            }, timeout);

            const runFormat = () => {
              try {
                const options = loadConfig(document.fileName);
                const fmtr = formatter.createFormatter(options);

                const text = document.getText();
                const result = fmtr.format(
                  text,
                  document.languageId === 'holoscriptplus' ? 'hsplus' : 'holo'
                );
                clearTimeout(timer);

                if (result.errors.length > 0) {
                  console.warn('HoloScript: Formatter errors:', result.errors);
                }

                if (!result.changed) {
                  resolve([]);
                  return;
                }

                const fullRange = new vscode.Range(
                  document.positionAt(0),
                  document.positionAt(text.length)
                );

                resolve([vscode.TextEdit.replace(fullRange, result.formatted)]);
              } catch (err) {
                console.error('HoloScript: Formatting failed:', err);
                clearTimeout(timer);
                resolve([]);
              }
            };

            if (document.lineCount > 1000) {
              vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: 'Formatting HoloScript...',
                  cancellable: false,
                },
                async () => {
                  runFormat();
                }
              );
            } else {
              runFormat();
            }
          });
        },
      }),
      vscode.languages.registerDocumentRangeFormattingEditProvider(
        ['holoscript', 'holoscriptplus'],
        {
          provideDocumentRangeFormattingEdits(
            document: vscode.TextDocument,
            range: vscode.Range
          ): vscode.TextEdit[] {
            try {
              const options = loadConfig(document.fileName);
              const fmtr = formatter.createFormatter(options);

              const text = document.getText();
              const fileType = document.languageId === 'holoscriptplus' ? 'hsplus' : 'holo';

              const rangeParams = {
                startLine: range.start.line,
                endLine: range.end.line,
              };

              const result = fmtr.formatRange(text, rangeParams, fileType);

              if (!result.changed) return [];

              return [vscode.TextEdit.replace(range, result.formatted)];
            } catch (err) {
              console.error('HoloScript: Range formatting failed:', err);
              return [];
            }
          },
        }
      )
    );
    console.log('HoloScript: Formatter registered.');
  } catch (err) {
    console.warn('HoloScript: Formatter package not found or failed to load:', err);
  }

  // Register Completion Provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      ['holoscript', 'holoscriptplus'],
      new HoloScriptCompletionItemProvider(),
      '@' // Trigger character
    )
  );

  // Register Hover Provider for trait documentation
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ['holoscript', 'holoscriptplus'],
      new HoloScriptHoverProvider()
    )
  );
  console.log('HoloScript: Hover provider registered for trait documentation.');

  // Register Semantic Tokens Provider for trait-aware highlighting
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      ['holoscript', 'holoscriptplus'],
      new HoloScriptSemanticTokensProvider(),
      SEMANTIC_TOKENS_LEGEND
    )
  );

  // Register Range Semantic Tokens Provider for large files
  context.subscriptions.push(
    vscode.languages.registerDocumentRangeSemanticTokensProvider(
      ['holoscript', 'holoscriptplus'],
      new HoloScriptSemanticTokensRangeProvider(),
      SEMANTIC_TOKENS_LEGEND
    )
  );

  console.log('HoloScript: Semantic tokens provider registered.');

  // Register collaboration features
  registerCollaborationCommands(context);
  console.log('HoloScript: Collaboration features registered.');

  // Register git integration features
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    semanticGit = new SemanticGit(workspaceRoot);
    const diffProvider = new DiffVisualizationProvider(context.extensionUri);
    diffDecorationProvider = new DiffDecorationProvider();
    const mergeDriver = new MergeDriver();
    const hooks = new HoloScriptGitHooks();

    // Register webview provider for diff visualization
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(DiffVisualizationProvider.viewType, diffProvider)
    );

    // Register git commands
    const gitDisposables = registerGitCommands(
      context,
      semanticGit,
      diffProvider,
      diffDecorationProvider,
      mergeDriver,
      hooks
    );
    context.subscriptions.push(...gitDisposables);

    // Create status bar item
    gitStatusBarItem = createGitStatusBarItem();
    context.subscriptions.push(gitStatusBarItem);

    // Update status bar on editor change
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(async () => {
        if (semanticGit && gitStatusBarItem) {
          await updateGitStatusBar(gitStatusBarItem, semanticGit);
        }
      })
    );

    // Initialize git (async, non-blocking)
    semanticGit.initialize().catch((err) => {
      console.log('HoloScript: Git not available:', err.message);
    });

    console.log('HoloScript: Git integration features registered.');
  }

  // ── Debug Adapter Registration ───────────────────────────────────────────
  // Register the inline debug adapter factory -- this runs HoloScriptDebugSession
  // in-process for zero-latency DAP communication with VS Code.
  const debugType = 'holoscript-debug';

  const debugAdapterFactory = new HoloScriptInlineDebugAdapterFactory();
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(debugType, debugAdapterFactory)
  );

  // Register the debug configuration provider -- resolves incomplete launch configs,
  // validates program paths, and generates initial configurations for new launch.json files.
  const debugConfigProvider = new HoloScriptDebugConfigurationProvider();
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(debugType, debugConfigProvider)
  );

  // Register a dynamic debug configuration provider -- appears in the
  // "Run and Debug" dropdown even without a launch.json file.
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider(
      debugType,
      {
        provideDebugConfigurations(
          _folder: vscode.WorkspaceFolder | undefined
        ): vscode.ProviderResult<vscode.DebugConfiguration[]> {
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

  console.log('HoloScript: Debug adapter registered (inline DAP with configuration provider).');

  // Initialize Hololand Platform services
  try {
    hololandServices = HololandServices.getInstance(context);
    registerHololandCommands(context, hololandServices);
    registerHololandWebviews(context, hololandServices);
    console.log('HoloScript: Hololand Platform services initialized.');
  } catch (err) {
    console.warn('HoloScript: Hololand services initialization failed:', err);
  }
}

function isHoloScriptFile(document: TextDocument): boolean {
  const fileName = document.fileName.toLowerCase();
  return fileName.endsWith('.holo') || fileName.endsWith('.hsplus') || fileName.endsWith('.hs');
}

export function deactivate(): Thenable<void> | undefined {
  // Dispose collaboration resources
  disposeCollaborationCommands();

  // Dispose trait tree provider
  if (traitTreeProvider) {
    traitTreeProvider.dispose();
    traitTreeProvider = undefined;
  }

  // Dispose git resources
  if (semanticGit) {
    semanticGit.dispose();
    semanticGit = undefined;
  }
  if (gitStatusBarItem) {
    gitStatusBarItem.dispose();
    gitStatusBarItem = undefined;
  }
  if (diffDecorationProvider) {
    diffDecorationProvider.dispose();
    diffDecorationProvider = undefined;
  }

  // Dispose Hololand services
  if (hololandServices) {
    hololandServices.dispose();
    hololandServices = undefined;
  }

  if (!client) {
    return undefined;
  }
  return client.stop();
}
