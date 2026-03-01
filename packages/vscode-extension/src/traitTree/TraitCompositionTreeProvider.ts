/**
 * TraitCompositionTreeProvider - VS Code TreeDataProvider for the Trait Composition sidebar.
 *
 * Displays trait inheritance hierarchy as an interactive tree view in the VS Code
 * Explorer sidebar. Shows:
 * - Trait definitions with extends relationships
 * - Property overrides (visually distinguished)
 * - Composition expressions (@name = @a + @b)
 * - Diamond inheritance warnings
 * - Click-to-navigate to trait/property definitions in the editor
 *
 * Listens for document changes and refreshes automatically.
 *
 * @module TraitCompositionTreeProvider
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import { TraitCompositionAnalyzer } from './TraitCompositionAnalyzer';
import type { TraitTreeNode, TraitCompositionAnalysis } from './TraitTreeTypes';

// =============================================================================
// TREE ITEM
// =============================================================================

/**
 * VS Code TreeItem wrapper around our TraitTreeNode data model.
 */
export class TraitTreeItem extends vscode.TreeItem {
  constructor(public readonly node: TraitTreeNode) {
    super(
      node.label,
      node.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );

    this.id = node.id;
    this.description = node.description;
    this.tooltip = node.tooltip ? new vscode.MarkdownString(node.tooltip) : undefined;
    this.contextValue = node.contextValue;

    // Icon
    this.iconPath = this.resolveIcon(node);

    // Click-to-navigate command
    if (node.location) {
      this.command = {
        command: 'holoscript.traitTree.navigateToDefinition',
        title: 'Go to Definition',
        arguments: [node.location],
      };
    }

    // Visual indicators for property overrides
    if (node.kind === 'property' && node.contextValue === 'traitProperty.override') {
      this.description = `${node.description || ''} (override)`;
    }

    // Warning icon for diamond inheritance
    if (node.kind === 'warning') {
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    }
  }

  /**
   * Resolve the ThemeIcon for a node based on its kind and context.
   */
  private resolveIcon(node: TraitTreeNode): vscode.ThemeIcon {
    if (node.iconId) {
      // Apply color tints for specific contexts
      switch (node.contextValue) {
        case 'traitCategory.overrides':
          return new vscode.ThemeIcon(node.iconId, new vscode.ThemeColor('editorWarning.foreground'));
        case 'traitCategory.warnings':
          return new vscode.ThemeIcon(node.iconId, new vscode.ThemeColor('list.warningForeground'));
        case 'traitDefinition.unresolved':
          return new vscode.ThemeIcon(node.iconId, new vscode.ThemeColor('list.errorForeground'));
        case 'traitWarning.diamond':
          return new vscode.ThemeIcon(node.iconId, new vscode.ThemeColor('list.warningForeground'));
        case 'traitProperty.override':
          return new vscode.ThemeIcon(node.iconId, new vscode.ThemeColor('editorWarning.foreground'));
        default:
          return new vscode.ThemeIcon(node.iconId);
      }
    }

    // Default icons by kind
    switch (node.kind) {
      case 'root':
        return new vscode.ThemeIcon('list-tree');
      case 'trait':
        return new vscode.ThemeIcon('symbol-interface');
      case 'property':
        return new vscode.ThemeIcon('symbol-field');
      case 'category':
        return new vscode.ThemeIcon('folder');
      case 'warning':
        return new vscode.ThemeIcon('warning');
      case 'composition':
        return new vscode.ThemeIcon('extensions');
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }
}

// =============================================================================
// TREE DATA PROVIDER
// =============================================================================

export class TraitCompositionTreeProvider implements vscode.TreeDataProvider<TraitTreeNode> {
  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  private _onDidChangeTreeData = new vscode.EventEmitter<TraitTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  private analyzer = new TraitCompositionAnalyzer();
  private currentAnalysis: TraitCompositionAnalysis | null = null;
  private disposables: vscode.Disposable[] = [];

  // ---------------------------------------------------------------------------
  // Constructor / Dispose
  // ---------------------------------------------------------------------------

  constructor() {
    // Listen for active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.isHoloScriptFile(editor.document)) {
          this.refresh();
        }
      }),
    );

    // Listen for document saves
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.isHoloScriptFile(doc)) {
          this.refresh();
        }
      }),
    );

    // Listen for document content changes (debounced via save)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.isHoloScriptFile(event.document)) {
          // Debounce: only refresh if the tree is visible
          this.scheduleRefresh();
        }
      }),
    );

    // Initial analysis
    this.refresh();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this._onDidChangeTreeData.dispose();
  }

  // ---------------------------------------------------------------------------
  // TreeDataProvider Interface
  // ---------------------------------------------------------------------------

  getTreeItem(element: TraitTreeNode): vscode.TreeItem {
    return new TraitTreeItem(element);
  }

  getChildren(element?: TraitTreeNode): TraitTreeNode[] {
    if (!this.currentAnalysis) {
      return [];
    }

    if (!element) {
      // Root level: return top-level nodes
      return this.currentAnalysis.roots;
    }

    // Return children of this element
    return element.children;
  }

  getParent(element: TraitTreeNode): TraitTreeNode | undefined {
    if (!this.currentAnalysis) return undefined;

    // Search through all nodes to find the parent
    for (const root of this.currentAnalysis.roots) {
      const parent = this.findParent(root, element.id);
      if (parent) return parent;
    }

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Refresh / Analysis
  // ---------------------------------------------------------------------------

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Schedule a debounced refresh (300ms delay).
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refresh();
      this.refreshTimer = null;
    }, 300);
  }

  /**
   * Refresh the tree by re-analyzing the active document.
   */
  refresh(): void {
    const editor = vscode.window.activeTextEditor;

    if (!editor || !this.isHoloScriptFile(editor.document)) {
      this.currentAnalysis = null;
      this._onDidChangeTreeData.fire();
      return;
    }

    const source = editor.document.getText();
    const filePath = editor.document.uri.fsPath;

    try {
      this.currentAnalysis = this.analyzer.analyze(source, filePath);

      // Show diamond warnings in Problems panel
      this.reportDiagnostics(editor.document);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.currentAnalysis = {
        traits: new Map(),
        compositions: [],
        roots: [
          {
            id: 'error:parse',
            label: 'Parse Error',
            description: message,
            kind: 'warning',
            children: [],
            iconId: 'error',
          },
        ],
        diamondWarnings: [],
        errors: [message],
      };
    }

    this._onDidChangeTreeData.fire();
  }

  // ---------------------------------------------------------------------------
  // Diagnostics (Problems panel integration)
  // ---------------------------------------------------------------------------

  private diagnosticCollection = vscode.languages.createDiagnosticCollection('holoscript-traits');

  private reportDiagnostics(document: vscode.TextDocument): void {
    if (!this.currentAnalysis) {
      this.diagnosticCollection.clear();
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];

    for (const warning of this.currentAnalysis.diamondWarnings) {
      // Find the composition node that triggered this warning
      for (const comp of this.currentAnalysis.compositions) {
        if (comp.location) {
          const range = new vscode.Range(
            new vscode.Position(comp.location.line - 1, comp.location.column),
            new vscode.Position(comp.location.line - 1, comp.location.column + 50),
          );
          diagnostics.push(
            new vscode.Diagnostic(
              range,
              warning.message,
              vscode.DiagnosticSeverity.Warning,
            ),
          );
        }
      }
    }

    // Report parse errors
    for (const error of this.currentAnalysis.errors) {
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          error,
          vscode.DiagnosticSeverity.Error,
        ),
      );
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Check if a document is a HoloScript file.
   */
  private isHoloScriptFile(document: vscode.TextDocument): boolean {
    const ext = document.fileName.toLowerCase();
    return (
      ext.endsWith('.holo') ||
      ext.endsWith('.hsplus') ||
      ext.endsWith('.hs') ||
      document.languageId === 'holoscript' ||
      document.languageId === 'holoscriptplus'
    );
  }

  /**
   * Find the parent of a node by ID (recursive search).
   */
  private findParent(
    current: TraitTreeNode,
    targetId: string,
  ): TraitTreeNode | undefined {
    for (const child of current.children) {
      if (child.id === targetId) return current;
      const found = this.findParent(child, targetId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Get the current analysis result (for testing/external access).
   */
  getAnalysis(): TraitCompositionAnalysis | null {
    return this.currentAnalysis;
  }
}

// =============================================================================
// COMMAND: Navigate to Definition
// =============================================================================

/**
 * Register the click-to-navigate command for trait tree items.
 */
export function registerTraitTreeCommands(
  context: vscode.ExtensionContext,
  provider: TraitCompositionTreeProvider,
): void {
  // Navigate to trait/property definition
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'holoscript.traitTree.navigateToDefinition',
      (location: { filePath: string; line: number; column: number }) => {
        if (!location) return;

        const uri = vscode.Uri.file(location.filePath);
        const position = new vscode.Position(location.line - 1, location.column);
        const range = new vscode.Range(position, position);

        vscode.window.showTextDocument(uri, {
          selection: range,
          preview: true,
        });
      },
    ),
  );

  // Manual refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.traitTree.refresh', () => {
      provider.refresh();
    }),
  );

  // Reveal in editor command (from tree context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'holoscript.traitTree.revealInEditor',
      (node: TraitTreeNode) => {
        if (!node?.location) return;

        const uri = vscode.Uri.file(node.location.filePath);
        const position = new vscode.Position(node.location.line - 1, node.location.column);

        vscode.window.showTextDocument(uri, {
          selection: new vscode.Range(position, position),
          preview: false,
        });
      },
    ),
  );

  // Copy trait name command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'holoscript.traitTree.copyTraitName',
      (node: TraitTreeNode) => {
        if (!node) return;
        const name = node.kind === 'trait' ? `@${node.label}` : node.label;
        vscode.env.clipboard.writeText(name);
        vscode.window.showInformationMessage(`Copied "${name}" to clipboard.`);
      },
    ),
  );
}
