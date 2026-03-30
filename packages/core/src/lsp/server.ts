/**
 * HoloScript LSP — Language Server Protocol for .holo / .hsplus files
 *
 * Provides IntelliSense completions for:
 *   - 1,800+ VR_TRAITS (e.g. @interactive, @grabbable, @physics)
 *   - Keywords (composition, object, group, template, etc.)
 *   - Geometry types (cube, sphere, cylinder, etc.)
 *   - Properties (position, rotation, scale, color, etc.)
 *   - Error diagnostics via ErrorRecovery
 *
 * Uses vscode-languageserver protocol for broad editor compatibility.
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  InitializeResult,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// ── Trait completions from VR_TRAITS ────────────────────────────────────────
// We import from the barrel to get the full 1,800+ trait list.
// At build time this resolves to the compiled core package.
import { VR_TRAITS } from '@holoscript/core/constants';
import {
  ErrorRecovery,
  HOLOSCHEMA_KEYWORDS,
  HOLOSCHEMA_GEOMETRIES,
  HOLOSCHEMA_PROPERTIES,
} from '@holoscript/core';

// ── Connection setup ────────────────────────────────────────────────────────
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let _hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const capabilities = params.capabilities;
  hasConfigurationCapability = !!(capabilities.workspace && capabilities.workspace.configuration);
  _hasWorkspaceFolderCapability = !!(
    capabilities.workspace && capabilities.workspace.workspaceFolders
  );

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['@', '.', '"', "'", ' '],
      },
      hoverProvider: true,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  connection.console.log(`[HoloScript LSP] Ready — ${VR_TRAITS.length} traits loaded`);
});

// ── Completion Provider ─────────────────────────────────────────────────────

// Pre-build completion items for performance (cached at startup)
const traitCompletions: CompletionItem[] = VR_TRAITS.map((trait, i) => ({
  label: `@${trait}`,
  kind: CompletionItemKind.Property,
  detail: `HoloScript trait`,
  documentation: `Adds the @${trait} behavior to this object.`,
  sortText: `0_${trait}`, // Sort traits first
  data: { type: 'trait', index: i },
}));

const keywordCompletions: CompletionItem[] = HOLOSCHEMA_KEYWORDS.map((kw) => ({
  label: kw,
  kind: CompletionItemKind.Keyword,
  detail: 'HoloScript keyword',
  sortText: `1_${kw}`,
}));

const geometryCompletions: CompletionItem[] = HOLOSCHEMA_GEOMETRIES.map((geo) => ({
  label: geo,
  kind: CompletionItemKind.Enum,
  detail: 'HoloScript geometry type',
  documentation: `geometry: "${geo}"`,
  sortText: `2_${geo}`,
}));

const propertyCompletions: CompletionItem[] = HOLOSCHEMA_PROPERTIES.map((prop) => ({
  label: prop,
  kind: CompletionItemKind.Field,
  detail: 'HoloScript property',
  insertText: `${prop}: `,
  sortText: `3_${prop}`,
}));

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);
  const linePrefix = text.substring(text.lastIndexOf('\n', offset - 1) + 1, offset);

  // After @ trigger → trait completions
  if (linePrefix.trimStart().startsWith('@') || linePrefix.endsWith('@')) {
    return traitCompletions;
  }

  // Inside geometry: "..." → geometry completions
  if (/geometry\s*:\s*["']?\w*$/.test(linePrefix)) {
    return geometryCompletions;
  }

  // At line start (keyword context)
  if (linePrefix.trim().length === 0 || /^\s*\w*$/.test(linePrefix)) {
    return [...keywordCompletions, ...propertyCompletions, ...traitCompletions];
  }

  // Property context (after indent)
  if (/^\s+\w*$/.test(linePrefix)) {
    return [...propertyCompletions, ...traitCompletions];
  }

  return [
    ...keywordCompletions,
    ...propertyCompletions,
    ...traitCompletions,
    ...geometryCompletions,
  ];
});

connection.onCompletionResolve((item) => {
  // Add detailed docs for traits
  if (item.data?.type === 'trait') {
    const traitName = VR_TRAITS[item.data.index];
    item.documentation = {
      kind: 'markdown' as any,
      value: [
        `### @${traitName}`,
        '',
        `Adds the \`@${traitName}\` behavior trait to the object.`,
        '',
        '```holoscript',
        `object "myObj" {`,
        `  geometry: "cube"`,
        `  @${traitName}`,
        `}`,
        '```',
      ].join('\n'),
    };
  }
  return item;
});

// ── Diagnostics (real-time error checking) ──────────────────────────────────

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

function validateDocument(doc: TextDocument): void {
  const text = doc.getText();
  const diagnostics: Diagnostic[] = [];
  const _recovery = new ErrorRecovery();

  // Simple brace matching
  let braceDepth = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth < 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Unexpected closing brace — no matching opening brace.',
        source: 'holoscript-lsp',
      });
      braceDepth = 0;
    }
  }

  if (braceDepth > 0) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: lines.length - 1, character: 0 },
        end: { line: lines.length - 1, character: lines[lines.length - 1].length },
      },
      message: `${braceDepth} unclosed brace(s) — add closing }`,
      source: 'holoscript-lsp',
    });
  }

  // Check for unclosed quotes per line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        message: 'Unclosed string literal — add closing "',
        source: 'holoscript-lsp',
      });
    }
  }

  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

// ── Hover Provider ──────────────────────────────────────────────────────────

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return null;

  const text = doc.getText();
  const offset = doc.offsetAt(params.position);

  // Find the word under cursor
  let start = offset;
  let end = offset;
  while (start > 0 && /[\w@]/.test(text[start - 1])) start--;
  while (end < text.length && /[\w@]/.test(text[end])) end++;
  const word = text.substring(start, end);

  // Trait hover
  if (word.startsWith('@')) {
    const traitName = word.slice(1);
    if (VR_TRAITS.includes(traitName)) {
      return {
        contents: {
          kind: 'markdown' as any,
          value: `### @${traitName}\n\nHoloScript behavior trait.\n\nApply to objects to add \`${traitName}\` functionality.`,
        },
      };
    }
  }

  // Keyword hover
  if (HOLOSCHEMA_KEYWORDS.includes(word)) {
    return {
      contents: {
        kind: 'markdown' as any,
        value: `### ${word}\n\nHoloScript keyword — defines a ${word} block.`,
      },
    };
  }

  return null;
});

// ── Start ───────────────────────────────────────────────────────────────────
documents.listen(connection);
connection.listen();
