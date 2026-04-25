/**
 * HoloScript Language Server Protocol Runner
 *
 * Wires the HoloScriptLanguageServer to the LSP protocol
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  TextDocumentPositionParams,
  Hover,
  Definition,
  Location,
  CodeAction,
  CodeActionParams,
  WorkspaceEdit,
  PrepareRenameParams,
  RenameParams,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { HoloScriptLanguageServer } from './server';

// Create a connection for the server using Node's IPC
const connection = createConnection(ProposedFeatures.all);

// Create the language server instance
const server = new HoloScriptLanguageServer();

// Create a text document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '@', '#'],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      codeActionProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
    },
  };
});

// Server methods returning Promises now — handlers must be async + await.
// (Peer migration drift fix 2026-04-25 to unblock deploy build.)
documents.onDidOpen(async (event) => {
  const uri = event.document.uri;
  const content = event.document.getText();
  const version = event.document.version;

  server.upsertDocument(uri, content, version);
  connection.sendDiagnostics({
    uri,
    diagnostics: await server.getDiagnostics(uri),
  });
});

// Document sync
documents.onDidChangeContent(async (change) => {
  const uri = change.document.uri;
  const content = change.document.getText();
  const version = change.document.version;

  // Update document in server
  server.upsertDocument(uri, content, version);

  // Get and send diagnostics
  const diagnostics = await server.getDiagnostics(uri);
  connection.sendDiagnostics({
    uri,
    diagnostics: diagnostics,
  });
});

documents.onDidClose((event) => {
  const uri = event.document.uri;
  server.removeDocument(uri);
  connection.sendDiagnostics({ uri, diagnostics: [] });
});

// Completions
connection.onCompletion(async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
  return await server.getCompletions(params.textDocument.uri, params.position);
});

// Hover
connection.onHover(async (params: TextDocumentPositionParams): Promise<Hover | null> => {
  return await server.getHover(params.textDocument.uri, params.position);
});

// Go to definition
connection.onDefinition(async (params: TextDocumentPositionParams): Promise<Definition | null> => {
  return await server.getDefinition(params.textDocument.uri, params.position);
});

// Find references
connection.onReferences(async (params): Promise<Location[]> => {
  return await server.findReferences(params.textDocument.uri, params.position);
});

connection.onCodeAction(async (params: CodeActionParams): Promise<CodeAction[]> => {
  return await server.getCodeActions(params.textDocument.uri, params.range, params.context.diagnostics);
});

connection.onPrepareRename(async (params: PrepareRenameParams) => {
  return await server.prepareRename(params.textDocument.uri, params.position);
});

connection.onRenameRequest(async (params: RenameParams): Promise<WorkspaceEdit | null> => {
  return await server.rename(params.textDocument.uri, params.position, params.newName);
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
