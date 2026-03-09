/**
 * HoloScript Debug Adapter Factory & Configuration Provider
 *
 * Wires the HoloScriptDebugSession (DAP implementation from @holoscript/lsp)
 * into VS Code via an inline debug adapter factory. This runs the debug adapter
 * in-process (same Node.js process as the extension host), providing:
 *
 * - Zero-latency communication between VS Code and the debug adapter
 * - Shared memory for variable inspection and evaluation
 * - Proper lifecycle management tied to the extension
 *
 * Also provides a DebugConfigurationProvider that:
 * - Resolves incomplete launch configs (fills in defaults)
 * - Validates the program path exists before launch
 * - Supports both launch and attach request types
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// ── Debug Adapter Descriptor Factory ─────────────────────────────────────────

/**
 * Creates an inline debug adapter that runs the HoloScriptDebugSession
 * directly inside the extension host process.
 *
 * VS Code calls createDebugAdapterDescriptor() each time a debug session starts.
 * We return a DebugAdapterInlineImplementation that wraps the session class.
 */
export class HoloScriptInlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    // Dynamically require the debug session from the LSP package.
    // This avoids a hard compile-time dependency on vscode-debugadapter
    // (which is a Node.js-only package not bundled with the extension).
    try {
      const { HoloScriptDebugSession } = require('@holoscript/lsp/dist/HoloScriptDebugSession');
      return new vscode.DebugAdapterInlineImplementation(new HoloScriptDebugSession());
    } catch (err) {
      // Fallback: launch the debugServer.js as a separate process.
      // This handles the case where @holoscript/lsp is not installed as a
      // dependency of the extension but is available via the monorepo.
      const serverModule = findDebugServerModule();
      if (serverModule) {
        return new vscode.DebugAdapterExecutable('node', [serverModule]);
      }

      // If neither approach works, show a helpful error
      vscode.window.showErrorMessage(
        'HoloScript Debug: Could not start debug adapter. ' +
          'Ensure @holoscript/lsp is built (pnpm build in packages/lsp).'
      );
      throw new Error(
        `Failed to create HoloScript debug adapter: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

/**
 * Search for the debugServer.js module in known locations.
 */
function findDebugServerModule(): string | undefined {
  const candidates = [
    // Installed as dependency
    path.join(__dirname, '..', 'node_modules', '@holoscript', 'lsp', 'dist', 'debugServer.js'),
    // Monorepo sibling
    path.join(__dirname, '..', '..', 'lsp', 'dist', 'debugServer.js'),
    // CLI bundled path
    path.join(__dirname, '..', 'server', 'lsp', 'debugServer.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

// ── Debug Configuration Provider ─────────────────────────────────────────────

/**
 * Provides intelligent resolution of HoloScript debug configurations.
 *
 * When a user presses F5 (or clicks "Run and Debug"), VS Code calls:
 *   1. provideDebugConfigurations() - if no launch.json exists, generates one
 *   2. resolveDebugConfiguration()  - fills in defaults for incomplete configs
 *   3. resolveDebugConfigurationWithSubstitutedVariables() - final validation
 */
export class HoloScriptDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  /**
   * Generate initial debug configurations for a workspace that has no launch.json.
   * Called when the user clicks "create a launch.json file" in the Run view.
   */
  provideDebugConfigurations(
    folder: vscode.WorkspaceFolder | undefined,
    _token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration[]> {
    return [
      {
        type: 'holoscript-debug',
        request: 'launch',
        name: 'Debug HoloScript File',
        program: '${file}',
        stopOnEntry: true,
      },
      {
        type: 'holoscript-debug',
        request: 'launch',
        name: 'Debug HoloScript Composition',
        program: '${workspaceFolder}/main.holo',
        stopOnEntry: false,
        cwd: '${workspaceFolder}',
      },
    ];
  }

  /**
   * Resolve a debug configuration before variable substitution.
   * This is called even when launching with an existing launch.json entry.
   *
   * If no configuration is provided at all (e.g., user presses F5 with no
   * launch.json), we create a sensible default that debugs the current file.
   */
  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    // If launch.json is missing or empty, fill in defaults
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (editor && isHoloScriptDocument(editor.document)) {
        config.type = 'holoscript-debug';
        config.name = 'Debug Current HoloScript File';
        config.request = 'launch';
        config.program = '${file}';
        config.stopOnEntry = true;
      } else {
        // No HoloScript file open - show a helpful message
        vscode.window.showInformationMessage(
          'Open a HoloScript file (.holo, .hsplus, .hs) to start debugging.'
        );
        return undefined; // Abort launch
      }
    }

    // Ensure required fields have defaults
    if (!config.program) {
      config.program = '${file}';
    }

    if (config.stopOnEntry === undefined) {
      config.stopOnEntry = true;
    }

    return config;
  }

  /**
   * Final validation after VS Code has substituted variables like ${file}.
   * At this point, config.program contains an actual file path.
   */
  resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
    _token?: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    // Validate the program path exists
    if (config.program) {
      const programPath = config.program;
      if (!fs.existsSync(programPath)) {
        vscode.window.showErrorMessage(`HoloScript Debug: File not found: ${programPath}`);
        return undefined; // Abort launch
      }

      // Validate it's a HoloScript file
      const ext = path.extname(programPath).toLowerCase();
      if (!['.holo', '.hsplus', '.hs'].includes(ext)) {
        vscode.window.showWarningMessage(
          `HoloScript Debug: "${path.basename(programPath)}" is not a HoloScript file. ` +
            'Expected .holo, .hsplus, or .hs extension.'
        );
        // Don't abort -- the user might know what they're doing
      }
    }

    return config;
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

function isHoloScriptDocument(document: vscode.TextDocument): boolean {
  const fileName = document.fileName.toLowerCase();
  return fileName.endsWith('.holo') || fileName.endsWith('.hsplus') || fileName.endsWith('.hs');
}
