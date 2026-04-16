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

documents.onDidOpen((event) => {
  const uri = event.document.uri;
  const content = event.document.getText();
  const version = event.document.version;

  server.upsertDocument(uri, content, version);
  connection.sendDiagnostics({
    uri,
    diagnostics: server.getDiagnostics(uri),
  });
});

// Document sync
documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  const content = change.document.getText();
  const version = change.document.version;

  // Update document in server
  server.upsertDocument(uri, content, version);

  // Get and send diagnostics
  const diagnostics = server.getDiagnostics(uri);
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
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  return server.getCompletions(params.textDocument.uri, params.position);
});

// Hover
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  return server.getHover(params.textDocument.uri, params.position);
});

// Go to definition
connection.onDefinition((params: TextDocumentPositionParams): Definition | null => {
  return server.getDefinition(params.textDocument.uri, params.position);
});

// Find references
connection.onReferences((params): Location[] => {
  return server.findReferences(params.textDocument.uri, params.position);
});

connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  return server.getCodeActions(params.textDocument.uri, params.range, params.context.diagnostics);
});

connection.onPrepareRename((params: PrepareRenameParams) => {
  return server.prepareRename(params.textDocument.uri, params.position);
});

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  return server.rename(params.textDocument.uri, params.position, params.newName);
});

// Make the text document manager listen on the connection
documents.listen(connection);

// Listen on the connection
connection.listen();
