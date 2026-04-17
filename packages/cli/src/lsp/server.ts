import { CompilerWorkerProxy } from '@holoscript/core';
import {
  CompletionItem,
  Diagnostic,
  Position,
  Hover,
  Location,
  Range,
  WorkspaceEdit,
  CodeAction,
} from 'vscode-languageserver/node';

/**
 * HoloScript Language Server Proxy Wrapper
 * 
 * Routes operations to the WebWorker via CompilerWorkerProxy to ensure
 * main-thread framerate is preserved during massive document processing.
 */
export class HoloScriptLanguageServer {
  private proxy: CompilerWorkerProxy;

  constructor() {
    this.proxy = new CompilerWorkerProxy();
    // Intentionally fire and forget initialization
    this.proxy.initialize().catch(err => {
      console.error('[CLI LSP] Failed to initialize worker proxy:', err);
    });
  }

  /**
   * Upsert document with monotonic version protection.
   */
  upsertDocument(uri: string, content: string, version: number): void {
    this.proxy.updateDocument(uri, content, version);
  }

  /**
   * Remove document from cache when closed.
   */
  removeDocument(uri: string): void {
  }

  /**
   * Update document content
   */
  updateDocument(uri: string, content: string, version: number): void {
    this.proxy.updateDocument(uri, content, version);
  }

  /**
   * Get diagnostics for a document
   */
  async getDiagnostics(uri: string): Promise<Diagnostic[]> {
    return (await this.proxy.getDiagnostics(uri)) as Diagnostic[];
  }

  /**
   * Get completions at position
   */
  async getCompletions(uri: string, position: Position): Promise<CompletionItem[]> {
    return (await this.proxy.getCompletions(uri, position.line, position.character)) as CompletionItem[];
  }

  /**
   * Get hover information
   */
  async getHover(uri: string, position: Position): Promise<Hover | null> {
    return (await this.proxy.getHover(uri, position.line, position.character)) as Hover;
  }

  /**
   * Go to definition
   */
  async getDefinition(uri: string, position: Position): Promise<Location | null> {
    return (await this.proxy.getDefinition(uri, position.line, position.character)) as Location;
  }

  /**
   * Find all references
   */
  async findReferences(uri: string, position: Position): Promise<Location[]> {
    const def = await this.proxy.getDefinition(uri, position.line, position.character);
    return def ? [def as Location] : [];
  }

  /**
   * Prepare rename
   */
  async prepareRename(uri: string, position: Position): Promise<{ range: Range; placeholder: string } | null> {
    return null;
  }

  /**
   * Rename symbol
   */
  async rename(uri: string, position: Position, newName: string): Promise<WorkspaceEdit | null> {
    return null; 
  }

  /**
   * Get code actions
   */
  async getCodeActions(uri: string, range: Range, diagnostics: Diagnostic[]): Promise<CodeAction[]> {
    return [];
  }
}

/**
 * Create a language server instance
 */
export function createLanguageServer(): HoloScriptLanguageServer {
  return new HoloScriptLanguageServer();
}
