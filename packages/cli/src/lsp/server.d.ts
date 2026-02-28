/**
 * HoloScript Language Server Protocol (LSP) Implementation
 *
 * Provides IDE features:
 * - Autocompletion
 * - Hover information
 * - Diagnostics (errors/warnings)
 * - Go to definition
 * - Find references
 */
import { CompletionItem, Diagnostic, Position, Hover, Location, Range, WorkspaceEdit, CodeAction } from 'vscode-languageserver/node';
/**
 * HoloScript Language Server
 */
export declare class HoloScriptLanguageServer {
    private parser;
    private holoParser;
    private typeChecker;
    private documentCache;
    constructor();
    /**
     * Update document content
     */
    updateDocument(uri: string, content: string, version: number): void;
    /**
     * Get diagnostics for a document
     */
    getDiagnostics(uri: string): Diagnostic[];
    private runCustomValidations;
    /**
     * Get completions at position
     */
    getCompletions(uri: string, position: Position): CompletionItem[];
    /**
     * Get hover information
     */
    getHover(uri: string, position: Position): Hover | null;
    /**
     * Go to definition
     */
    getDefinition(uri: string, position: Position): Location | null;
    /**
     * Find all references
     */
    findReferences(uri: string, position: Position): Location[];
    /**
     * Prepare rename - check if symbol at position can be renamed
     */
    prepareRename(uri: string, position: Position): {
        range: Range;
        placeholder: string;
    } | null;
    /**
     * Rename symbol - return workspace edit with all occurrences
     */
    rename(uri: string, position: Position, newName: string): WorkspaceEdit | null;
    /**
     * Get code actions for diagnostics at range
     */
    getCodeActions(uri: string, range: Range, diagnostics: Diagnostic[]): CodeAction[];
    private convertTypeDiagnostic;
    private isInsideOrbBlock;
    private getVariableBeforeDot;
    private getDeclaredVariables;
    private getNodeName;
    private getCompletionKind;
    private getWordAtPosition;
    private isDefinitionLine;
    private formatTypeInfo;
    private getWordFromMessage;
    private toCamelCase;
    private hasSelectedCode;
}
/**
 * Create a language server instance
 */
export declare function createLanguageServer(): HoloScriptLanguageServer;
