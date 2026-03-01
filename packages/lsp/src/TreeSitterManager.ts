/**
 * TreeSitterManager - Incremental parsing via tree-sitter for HoloScript LSP
 *
 * Manages tree-sitter Parser instances and cached Trees per document,
 * enabling incremental re-parsing on each textDocument/didChange notification.
 *
 * Key concepts:
 *   - On first open, a full parse produces a Tree.
 *   - On each edit, we call oldTree.edit(editDescriptor) then
 *     parser.parse(newText, editedOldTree) so tree-sitter can reuse
 *     unchanged subtrees (O(edit-size) instead of O(file-size)).
 *   - Error nodes (node.hasError / node.isError / node.isMissing) are
 *     extracted as LSP Diagnostics with accurate ranges.
 */

import type Parser from 'tree-sitter';

// ─── Public types ──────────────────────────────────────────────────────────────

/** Minimal representation of an LSP TextDocumentContentChangeEvent */
export interface ContentChange {
  /** The range that was replaced (undefined = full document replacement) */
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  /** Length of the range that was replaced (deprecated in LSP but still sent) */
  rangeLength?: number;
  /** The new text for the range (or the full document if range is undefined) */
  text: string;
}

/** A diagnostic produced by tree-sitter error-node extraction */
export interface TreeSitterDiagnostic {
  startLine: number; // 0-based
  startCharacter: number; // 0-based
  endLine: number; // 0-based
  endCharacter: number; // 0-based
  message: string;
  /** 'error' for ERROR/missing nodes, 'warning' for nodes inside an error recovery */
  severity: 'error' | 'warning';
}

// ─── Per-document state ────────────────────────────────────────────────────────

interface DocumentState {
  tree: Parser.Tree;
  /** Full source text corresponding to `tree` (needed for byte-offset calculations) */
  text: string;
  version: number;
}

// ─── Manager ───────────────────────────────────────────────────────────────────

export class TreeSitterManager {
  private parser: Parser | null = null;
  private language: unknown = null;
  private documents = new Map<string, DocumentState>();
  private _ready = false;

  /**
   * Initialize tree-sitter with the HoloScript grammar.
   * Call once during server startup. If the native binding is unavailable
   * (e.g. missing prebuild) the manager gracefully degrades -- all public
   * methods become no-ops and `isReady()` returns false.
   */
  async initialize(): Promise<boolean> {
    try {
      // Dynamic require so the server still starts when tree-sitter
      // native bindings are not compiled for this platform.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ParserModule = require('tree-sitter') as typeof Parser;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const HoloScriptModule = require('tree-sitter-holoscript');

      if (!HoloScriptModule) {
        console.error('[TreeSitter] tree-sitter-holoscript binding returned null');
        return false;
      }

      // tree-sitter's JS wrapper expects the module object (with a .language
      // property).  The native C++ layer extracts .language internally and
      // the JS layer uses the outer object for node-class initialization.
      const p = new (ParserModule as any)();
      p.setLanguage(HoloScriptModule);
      this.parser = p;
      this.language = HoloScriptModule;
      this._ready = true;
      console.error('[TreeSitter] Initialized successfully');
      return true;
    } catch (err) {
      console.error(
        `[TreeSitter] Initialization failed (non-fatal): ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /** Whether tree-sitter is available for use */
  isReady(): boolean {
    return this._ready && this.parser !== null;
  }

  // ─── Document lifecycle ────────────────────────────────────────────────────

  /**
   * Perform a full parse for a newly opened (or fully replaced) document.
   * Returns the tree-sitter Tree, or null if tree-sitter is unavailable.
   */
  openDocument(uri: string, text: string, version: number): Parser.Tree | null {
    if (!this.parser) return null;

    const tree = this.parser.parse(text);
    this.documents.set(uri, { tree, text, version });
    return tree;
  }

  /**
   * Apply incremental edits and re-parse.
   *
   * @param uri        Document URI
   * @param newText    Full document text *after* all changes are applied
   * @param version    Document version after the changes
   * @param changes    The array of TextDocumentContentChangeEvents from the
   *                   didChange notification (applied in order, each relative
   *                   to the state after the previous change).
   * @returns The new Tree, or null if tree-sitter is unavailable.
   */
  updateDocument(
    uri: string,
    newText: string,
    version: number,
    changes: ContentChange[],
  ): Parser.Tree | null {
    if (!this.parser) return null;

    const state = this.documents.get(uri);
    if (!state) {
      // No previous tree -- fall back to a full parse
      return this.openDocument(uri, newText, version);
    }

    let { tree, text: currentText } = state;

    // Apply each change sequentially.  Each change's range is relative to the
    // document state *after* the previous change, which matches how
    // vscode-languageserver-textdocument applies them.
    for (const change of changes) {
      if (!change.range) {
        // Full document replacement -- no incremental benefit
        tree = this.parser.parse(newText);
        currentText = newText;
        continue;
      }

      const edit = this.contentChangeToEdit(currentText, change);
      tree.edit(edit);

      // After editing the tree, apply the same text change to our tracked text
      // so byte offsets stay correct for subsequent changes in this batch.
      const startOffset = this.positionToByteOffset(currentText, change.range.start);
      const endOffset = change.rangeLength !== undefined
        ? startOffset + change.rangeLength
        : this.positionToByteOffset(currentText, change.range.end);
      currentText = currentText.slice(0, startOffset) + change.text + currentText.slice(endOffset);
    }

    // Incremental re-parse: tree-sitter reuses unchanged subtrees
    const newTree = this.parser.parse(newText, tree);
    this.documents.set(uri, { tree: newTree, text: newText, version });
    return newTree;
  }

  /**
   * Remove a document from the cache when it is closed.
   */
  closeDocument(uri: string): void {
    this.documents.delete(uri);
  }

  /**
   * Get the current tree for a document (e.g. for semantic-token queries).
   */
  getTree(uri: string): Parser.Tree | null {
    return this.documents.get(uri)?.tree ?? null;
  }

  /**
   * Get the tree-sitter Language object (useful for Query construction).
   */
  getLanguage(): unknown {
    return this.language;
  }

  // ─── Diagnostics extraction ────────────────────────────────────────────────

  /**
   * Walk the tree and collect diagnostics for every ERROR, MISSING, or
   * has-error node.  Returns an empty array if tree-sitter is unavailable.
   */
  extractDiagnostics(uri: string): TreeSitterDiagnostic[] {
    const state = this.documents.get(uri);
    if (!state) return [];

    const diagnostics: TreeSitterDiagnostic[] = [];
    const seen = new Set<number>(); // avoid duplicate diagnostics by node id

    this.walkErrors(state.tree.rootNode, diagnostics, seen);
    return diagnostics;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  /**
   * Convert an LSP ContentChange (with range) into a tree-sitter Edit descriptor.
   */
  private contentChangeToEdit(
    text: string,
    change: ContentChange,
  ): Parser.Edit {
    const range = change.range!;
    const startIndex = this.positionToByteOffset(text, range.start);
    const oldEndIndex = change.rangeLength !== undefined
      ? startIndex + change.rangeLength
      : this.positionToByteOffset(text, range.end);
    const newEndIndex = startIndex + change.text.length;

    const startPosition = { row: range.start.line, column: range.start.character };
    const oldEndPosition = { row: range.end.line, column: range.end.character };

    // Compute new end position from start + inserted text
    const newLines = change.text.split('\n');
    const newEndRow = range.start.line + newLines.length - 1;
    const newEndCol =
      newLines.length === 1
        ? range.start.character + change.text.length
        : newLines[newLines.length - 1].length;

    return {
      startIndex,
      oldEndIndex,
      newEndIndex,
      startPosition,
      oldEndPosition,
      newEndPosition: { row: newEndRow, column: newEndCol },
    };
  }

  /**
   * Convert a 0-based line/character position to a byte offset in the source.
   * Assumes UTF-8 / single-byte characters (sufficient for tree-sitter's
   * internal offset tracking via the node binding, which uses JS string indices).
   */
  private positionToByteOffset(
    text: string,
    position: { line: number; character: number },
  ): number {
    let offset = 0;
    let line = 0;
    for (let i = 0; i < text.length; i++) {
      if (line === position.line) {
        return offset + position.character;
      }
      if (text[i] === '\n') {
        line++;
      }
      offset++;
    }
    // Position is at or past end of file
    return offset + position.character;
  }

  /**
   * Recursively walk the syntax tree collecting error diagnostics.
   */
  private walkErrors(
    node: Parser.SyntaxNode,
    diagnostics: TreeSitterDiagnostic[],
    seen: Set<number>,
  ): void {
    if (seen.has(node.id)) return;

    if (node.isError || node.isMissing) {
      seen.add(node.id);
      const message = node.isMissing
        ? `Missing ${node.type !== 'ERROR' ? `'${node.type}'` : 'syntax element'}`
        : `Unexpected syntax: ${node.text.length > 40 ? node.text.slice(0, 40) + '...' : node.text || node.type}`;

      diagnostics.push({
        startLine: node.startPosition.row,
        startCharacter: node.startPosition.column,
        endLine: node.endPosition.row,
        endCharacter: node.endPosition.column,
        message,
        severity: 'error',
      });
      return; // Don't recurse into ERROR subtrees
    }

    if (node.hasError) {
      // This node contains an error somewhere in its subtree -- recurse to
      // find the actual ERROR/MISSING child.
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
          this.walkErrors(child, diagnostics, seen);
        }
      }
    }
    // If !node.hasError, no errors in this entire subtree -- skip
  }
}
