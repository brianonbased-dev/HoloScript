#!/usr/bin/env node
/**
 * HoloScript Language Server
 *
 * Provides IDE features for .holo and .hsplus files:
 * - Real-time diagnostics (errors/warnings)
 * - Auto-completion
 * - Hover information
 * - Go to definition
 * - Find references
 * - Document symbols
 * - Semantic tokens
 */

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  Hover,
  MarkupKind,
  Location,
  SymbolKind,
  DocumentSymbol,
  TextDocumentPositionParams,
  DefinitionParams,
  ReferenceParams,
  DocumentSymbolParams,
  SemanticTokensParams,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensLegend,
  RenameParams,
  WorkspaceEdit,
  CodeActionParams,
  CodeAction,
  CodeActionKind,
  TextEdit,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';

import {
  HoloScriptPlusParser,
  HoloScriptValidator,
  createTypeChecker,
  HoloScriptTypeChecker,
  getDefaultAIAdapter,
  useGemini,
  useOllama,
  type ASTProgram,
  type HSPlusASTNode as HSPlusNode,
  type HSPlusCompileResult,
} from '@holoscript/core';

import { getTraitDoc, formatTraitDocCompact, getAllTraitNames } from './traitDocs';
import {
  HoloScriptLinter,
  type LintDiagnostic,
  type Severity as LintSeverity,
} from '@holoscript/linter';
import { SemanticCompletionProvider } from './SemanticCompletionProvider';
import { AICompletionProvider } from './ai/AICompletionProvider';
import { TreeSitterManager, type ContentChange } from './TreeSitterManager';
import { runSafetyDiagnostics } from './SafetyDiagnostics';
import { TraitRecommendationProvider } from './providers/TraitRecommendationProvider';

// Create connection and document manager
const connection = createConnection(ProposedFeatures.all);

/**
 * Custom TextDocuments configuration that intercepts content changes.
 * On every didChange notification the `update` method receives the raw
 * TextDocumentContentChangeEvent array.  We stash a copy so that
 * validateDocument can forward them to tree-sitter for incremental parsing.
 */
const pendingContentChanges = new Map<string, ContentChange[]>();

const documents: TextDocuments<TextDocument> = new TextDocuments({
  create(uri, languageId, version, content) {
    return TextDocument.create(uri, languageId, version, content);
  },
  update(document, changes, version) {
    // Stash the raw content changes for tree-sitter before applying
    const tsChanges: ContentChange[] = changes.map((c) => {
      if ('range' in c && c.range) {
        return {
          range: c.range,
          rangeLength: (c as any).rangeLength as number | undefined,
          text: c.text,
        };
      }
      return { text: c.text };
    });
    pendingContentChanges.set(document.uri, tsChanges);

    // Apply changes via the standard TextDocument update
    return TextDocument.update(document, changes, version);
  },
});

// Parser and validator instances
const parser = new HoloScriptPlusParser();
const _validator = new HoloScriptValidator();
const linter = new HoloScriptLinter();

// Tree-sitter incremental parsing
const treeSitter = new TreeSitterManager();

// Semantic intelligence
let semanticCompletion: SemanticCompletionProvider | null = null;
let aiCompletion: AICompletionProvider | null = null;

// Trait recommendation engine (vertical-aware, no external dependencies)
const traitRecommendation = new TraitRecommendationProvider();

// LRU Cache configuration
const MAX_CACHED_DOCUMENTS = 50;
const documentAccessOrder: string[] = []; // Track access order for LRU eviction

// Cache for parsed documents
const documentCache = new Map<
  string,
  {
    ast: ASTProgram;
    version: number;
    symbols: Map<string, { node: HSPlusNode; line: number; column: number }>;
    typeChecker: HoloScriptTypeChecker;
    /** tree-sitter concrete syntax tree (null when tree-sitter is unavailable) */
    tsTree: import('tree-sitter').Tree | null;
  }
>();

/**
 * LRU cache eviction - removes least recently used documents when cache is full
 */
function evictLRUDocuments(): void {
  while (documentCache.size >= MAX_CACHED_DOCUMENTS && documentAccessOrder.length > 0) {
    const lruUri = documentAccessOrder.shift();
    if (lruUri) {
      documentCache.delete(lruUri);
      console.error(`[LSP] Evicted LRU document from cache: ${lruUri}`);
    }
  }
}

/**
 * Update access order for LRU tracking
 */
function touchDocument(uri: string): void {
  const index = documentAccessOrder.indexOf(uri);
  if (index > -1) {
    documentAccessOrder.splice(index, 1);
  }
  documentAccessOrder.push(uri);
}

// Semantic token types and modifiers - Enhanced for HoloScript
const tokenTypes = [
  'class', // 0: object declarations (orb, world, composition, template)
  'property', // 1: properties (key:)
  'function', // 2: functions and event handlers
  'variable', // 3: variables
  'number', // 4: numeric literals
  'string', // 5: string literals
  'keyword', // 6: language keywords
  'operator', // 7: operators
  'comment', // 8: comments
  'decorator', // 9: traits (@grabbable, @networked, etc.)
  'type', // 10: geometry types (cube, sphere, cylinder, etc.)
  'event', // 11: event handlers (onGrab, onPoint, etc.)
  'namespace', // 12: namespaces and imports
  'enum', // 13: enum values
  'parameter', // 14: function parameters
];
const tokenModifiers = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'modification',
  'defaultLibrary',
];

// HoloScript-specific syntax patterns
const HOLOSCRIPT_KEYWORDS = [
  // Object declarations
  'orb',
  'world',
  'composition',
  'template',
  'object',
  'system',
  'environment',
  // Control flow
  'if',
  'else',
  'while',
  'for',
  'return',
  'break',
  'continue',
  // Modules
  'import',
  'from',
  'export',
  'as',
  // Values
  'true',
  'false',
  'null',
  'undefined',
  // Blocks
  'state',
  'logic',
  'animation',
  'physics',
  'spatial_group',
  'networked_object',
  // Modifiers
  'using',
  'extends',
  'connect',
  'execute',
];

const HOLOSCRIPT_TRAITS = [
  // Interaction traits
  'grabbable',
  'throwable',
  'holdable',
  'clickable',
  'hoverable',
  'draggable',
  'pointable',
  'scalable',
  // Physics traits
  'collidable',
  'physics',
  'rigid',
  'kinematic',
  'trigger',
  'gravity',
  // Visual traits
  'glowing',
  'emissive',
  'transparent',
  'reflective',
  'animated',
  'billboard',
  // Networking traits
  'networked',
  'synced',
  'persistent',
  'owned',
  'host_only',
  // Behavior traits
  'stackable',
  'attachable',
  'equippable',
  'consumable',
  'destructible',
  // Spatial traits
  'anchor',
  'tracked',
  'world_locked',
  'hand_tracked',
  'eye_tracked',
  // Audio traits
  'spatial_audio',
  'ambient',
  'voice_activated',
  // State traits
  'state',
  'reactive',
  'observable',
  'computed',
];

const GEOMETRY_TYPES = [
  'cube',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'capsule',
  'plane',
  'box',
  'model',
  'mesh',
  'primitive',
  'custom',
];

const EVENT_HANDLERS = [
  'onPoint',
  'onGrab',
  'onRelease',
  'onHoverEnter',
  'onHoverExit',
  'onTriggerEnter',
  'onTriggerExit',
  'onSwing',
  'onGesture',
  'onClick',
  'onDrag',
  'onDrop',
  'onCollision',
  'onMount',
  'onUpdate',
  'onUnmount',
  'on_mount',
  'on_update',
  'on_unmount',
  'on_player_attack',
];

const legend: SemanticTokensLegend = {
  tokenTypes,
  tokenModifiers,
};

connection.onInitialize(async (_params: InitializeParams): Promise<InitializeResult> => {
  // Initialize AI: try Ollama first (free, local, HoloScript-optimized), fall back to Gemini
  let aiInitialized = false;

  // Try Ollama with brittney-qwen-v23
  try {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const ollamaModel = process.env.OLLAMA_MODEL || 'brittney-qwen-v23:latest';
    const ollamaAdapter = useOllama({ baseUrl: ollamaUrl, model: ollamaModel });
    if (await ollamaAdapter.isReady()) {
      const adapter = getDefaultAIAdapter();
      if (adapter) {
        semanticCompletion = new SemanticCompletionProvider(adapter);
        await semanticCompletion.initialize();
        aiCompletion = new AICompletionProvider(adapter);
        console.log(`[LSP] AI initialized with Ollama (${ollamaModel})`);
        aiInitialized = true;
      }
    }
  } catch {
    // Ollama not available, try Gemini
  }

  // Fall back to Gemini if Ollama unavailable
  if (!aiInitialized) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      useGemini({ apiKey });
      const adapter = getDefaultAIAdapter();
      if (adapter) {
        semanticCompletion = new SemanticCompletionProvider(adapter);
        await semanticCompletion.initialize();
        aiCompletion = new AICompletionProvider(adapter);
        console.log('[LSP] AI initialized with Gemini (Ollama not available)');
      }
    }
  }

  // Initialize tree-sitter incremental parsing (non-blocking, graceful degradation)
  const tsReady = await treeSitter.initialize();
  console.error(
    `[LSP] Tree-sitter incremental parsing: ${tsReady ? 'enabled' : 'disabled (native binding unavailable)'}`
  );

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ['.', ':', '{', '[', '"', "'", ' ', '@'],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      semanticTokensProvider: {
        legend,
        full: true,
      },
      renameProvider: true,
      codeActionProvider: true,
    },
  };
});

// Validate document on open/change
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

/**
 * Parse and validate a document, sending diagnostics.
 *
 * Uses a dual-parser strategy:
 *   1. **tree-sitter** (incremental) -- fast concrete syntax tree with accurate
 *      error-node ranges.  On each keystroke only the changed region is
 *      re-parsed, making it O(edit-size) rather than O(file-size).
 *   2. **HoloScriptPlusParser** (full) -- produces the typed AST used by the
 *      type checker, symbol table, linter, and all other IDE features.
 *
 * tree-sitter diagnostics are tagged with source 'holoscript-ts' so they
 * can be distinguished from the existing 'holoscript' parser diagnostics.
 */
async function validateDocument(document: TextDocument): Promise<void> {
  const text = document.getText();
  const uri = document.uri;
  const diagnostics: Diagnostic[] = [];
  const symbols = new Map<string, { node: HSPlusNode; line: number; column: number }>();

  // ── Tree-sitter incremental parse ─────────────────────────────────────────
  let tsTree: import('tree-sitter').Tree | null = null;

  if (treeSitter.isReady()) {
    try {
      // Consume the stashed content changes (set by our custom TextDocuments
      // configuration's `update` method).  If there are none this is either
      // the first open or a full-document replacement, so we do a full parse.
      const changes = pendingContentChanges.get(uri);
      pendingContentChanges.delete(uri);

      if (changes && changes.length > 0 && treeSitter.getTree(uri)) {
        // Incremental re-parse: apply edits to old tree, then re-parse
        tsTree = treeSitter.updateDocument(uri, text, document.version, changes);
      } else {
        // First open or no incremental changes available -- full parse
        tsTree = treeSitter.openDocument(uri, text, document.version);
      }

      // Extract syntax error diagnostics from the tree-sitter CST
      const tsDiags = treeSitter.extractDiagnostics(uri);
      for (const d of tsDiags) {
        diagnostics.push({
          severity: d.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          range: {
            start: { line: d.startLine, character: d.startCharacter },
            end: { line: d.endLine, character: d.endCharacter },
          },
          message: d.message,
          source: 'holoscript-ts',
        });
      }
    } catch (tsErr) {
      console.error(
        `[TreeSitter] Parse failed for ${uri}: ${tsErr instanceof Error ? tsErr.message : tsErr}`
      );
      // Non-fatal: fall through to HSPlus parser
    }
  }

  // ── HSPlus parser (full re-parse for AST / type checking / symbols) ───────
  try {
    const parseResult: HSPlusCompileResult = parser.parse(text);

    // 1. Handle Parse Errors (Integrated Multi-Error Reporting)
    if (parseResult.errors && parseResult.errors.length > 0) {
      for (const error of parseResult.errors) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: (error.line || 1) - 1, character: (error.column || 1) - 1 },
            end: { line: (error.line || 1) - 1, character: (error.column || 1) + 20 },
          },
          message: error.message,
          source: 'holoscript',
        });
      }
    }

    // 2. Handle Warnings
    if (parseResult.warnings && parseResult.warnings.length > 0) {
      for (const warning of parseResult.warnings) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: {
            start: { line: (warning.line || 1) - 1, character: (warning.column || 1) - 1 },
            end: { line: (warning.line || 1) - 1, character: (warning.column || 1) + 20 },
          },
          message: warning.message,
          source: 'holoscript',
        });
      }
    }

    if (parseResult.ast) {
      const ast = parseResult.ast;
      const typeChecker = createTypeChecker();

      // Run type checker on the AST body
      const typeCheckResult = typeChecker.check(ast.children || []);

      // Merge type diagnostics
      for (const diag of typeCheckResult.diagnostics) {
        diagnostics.push({
          severity:
            diag.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          range: {
            start: { line: (diag.line || 1) - 1, character: diag.column || 0 },
            end: { line: (diag.line || 1) - 1, character: (diag.column || 0) + 20 },
          },
          message: diag.message,
          source: 'holoscript-type',
          code: diag.code,
        });
      }

      // Build symbol table from all nodes in the program
      const findSymbols = (nodes: HSPlusNode[]) => {
        for (const node of nodes) {
          if (node.id) {
            symbols.set(node.id, {
              node,
              line: node.loc?.start.line || 1,
              column: node.loc?.start.column || 1,
            });
          }
          if (node.children) findSymbols(node.children);
        }
      };

      findSymbols(ast.children || []);

      // 2.5 Compile-time safety pass — effects, budgets, capabilities
      try {
        const safetyDiags = runSafetyDiagnostics(ast, uri);
        diagnostics.push(...safetyDiags);
      } catch (safetyErr) {
        console.error(
          `[Safety] Pass failed: ${safetyErr instanceof Error ? safetyErr.message : safetyErr}`
        );
      }

      // LRU eviction before adding new entry
      evictLRUDocuments();
      touchDocument(uri);

      // Cache the parsed result including the type checker and tree-sitter tree
      documentCache.set(uri, {
        ast: parseResult.ast,
        version: document.version,
        symbols,
        typeChecker,
        tsTree,
      });
    }

    // 3. Linter Logic
    const lintResult = linter.lint(text, uri);
    for (const diag of lintResult.diagnostics) {
      diagnostics.push({
        severity: mapLintSeverity(diag.severity),
        range: {
          start: { line: diag.line - 1, character: diag.column - 1 },
          end: {
            line: (diag.endLine || diag.line) - 1,
            character: (diag.endColumn || diag.column + 20) - 1,
          },
        },
        message: diag.message,
        source: 'holoscript-linter',
        data: diag, // Store for code actions
      });
    }
  } catch (error) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      message: `Parser error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      source: 'holoscript',
    });
  }

  // Send diagnostics to client
  connection.sendDiagnostics({ uri, diagnostics });
}

/**
 * Provide auto-completion items
 */
connection.onCompletion(async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const linePrefix = text.substring(text.lastIndexOf('\n', offset - 1) + 1, offset);

  const items: CompletionItem[] = [];

  // Context-aware completions
  if (linePrefix.match(/^\s*$/)) {
    // Start of line - suggest top-level keywords
    items.push(
      {
        label: 'orb',
        kind: CompletionItemKind.Class,
        insertText: 'orb ${1:name} {\n  $0\n}',
        insertTextFormat: 2,
      },
      {
        label: 'world',
        kind: CompletionItemKind.Module,
        insertText: 'world ${1:name} {\n  $0\n}',
        insertTextFormat: 2,
      },
      {
        label: 'import',
        kind: CompletionItemKind.Keyword,
        insertText: 'import { $1 } from "$2"',
        insertTextFormat: 2,
      },
      {
        label: 'system',
        kind: CompletionItemKind.Keyword,
        insertText: 'system ${1:name} {\n  $0\n}',
        insertTextFormat: 2,
      }
    );
  } else if (linePrefix.match(/^\s+\w*$/)) {
    // Inside a block - suggest properties
    items.push(
      {
        label: 'position',
        kind: CompletionItemKind.Property,
        insertText: 'position: [${1:0}, ${2:0}, ${3:0}]',
        insertTextFormat: 2,
      },
      {
        label: 'rotation',
        kind: CompletionItemKind.Property,
        insertText: 'rotation: [${1:0}, ${2:0}, ${3:0}]',
        insertTextFormat: 2,
      },
      {
        label: 'scale',
        kind: CompletionItemKind.Property,
        insertText: 'scale: [${1:1}, ${2:1}, ${3:1}]',
        insertTextFormat: 2,
      },
      {
        label: 'color',
        kind: CompletionItemKind.Property,
        insertText: 'color: "${1:#ffffff}"',
        insertTextFormat: 2,
      },
      {
        label: 'opacity',
        kind: CompletionItemKind.Property,
        insertText: 'opacity: ${1:1.0}',
        insertTextFormat: 2,
      },
      {
        label: 'visible',
        kind: CompletionItemKind.Property,
        insertText: 'visible: ${1:true}',
        insertTextFormat: 2,
      },
      {
        label: 'interactive',
        kind: CompletionItemKind.Property,
        insertText: 'interactive: ${1:true}',
        insertTextFormat: 2,
      },
      {
        label: 'model',
        kind: CompletionItemKind.Property,
        insertText: 'model: "${1:path/to/model.glb}"',
        insertTextFormat: 2,
      },
      {
        label: 'material',
        kind: CompletionItemKind.Property,
        insertText: 'material: {\n  type: "${1:standard}"\n  $0\n}',
        insertTextFormat: 2,
      }
    );

    // Event handlers
    items.push(
      {
        label: 'on_click',
        kind: CompletionItemKind.Event,
        insertText: 'on_click: {\n  $0\n}',
        insertTextFormat: 2,
      },
      {
        label: 'on_hover',
        kind: CompletionItemKind.Event,
        insertText: 'on_hover: {\n  $0\n}',
        insertTextFormat: 2,
      },
      {
        label: 'on_enter',
        kind: CompletionItemKind.Event,
        insertText: 'on_enter: {\n  $0\n}',
        insertTextFormat: 2,
      },
      {
        label: 'on_exit',
        kind: CompletionItemKind.Event,
        insertText: 'on_exit: {\n  $0\n}',
        insertTextFormat: 2,
      },
      {
        label: 'on_collision',
        kind: CompletionItemKind.Event,
        insertText: 'on_collision: {\n  $0\n}',
        insertTextFormat: 2,
      }
    );

    // HSPlus-specific
    items.push(
      {
        label: 'networked',
        kind: CompletionItemKind.Property,
        insertText: 'networked: ${1:true}',
        insertTextFormat: 2,
      },
      {
        label: 'physics',
        kind: CompletionItemKind.Property,
        insertText: 'physics: {\n  type: "${1:dynamic}"\n  mass: ${2:1.0}\n}',
        insertTextFormat: 2,
      },
      {
        label: 'audio',
        kind: CompletionItemKind.Property,
        insertText: 'audio: {\n  src: "${1:sound.mp3}"\n  spatial: ${2:true}\n}',
        insertTextFormat: 2,
      },
      {
        label: 'animation',
        kind: CompletionItemKind.Property,
        insertText: 'animation: {\n  name: "${1:idle}"\n  loop: ${2:true}\n}',
        insertTextFormat: 2,
      }
    );
  }

  // Trait completions after @ symbol
  if (linePrefix.endsWith('@') || linePrefix.match(/@\w*$/)) {
    const traitNames = getAllTraitNames();
    for (const traitName of traitNames) {
      const doc = getTraitDoc(traitName.replace('@', ''));
      items.push({
        label: traitName,
        kind: CompletionItemKind.Interface,
        detail: doc?.name || 'Trait',
        documentation: doc?.description,
        insertText: traitName.substring(1),
        sortText: `0_${traitName}`,
      });
    }

    // AI Semantic Suggestions
    if (semanticCompletion) {
      const query = linePrefix.substring(linePrefix.lastIndexOf('@') + 1);
      const aiItems = await semanticCompletion.getCompletions(query);
      items.push(...aiItems);
    }

    // Vertical-aware trait recommendations based on metadata.category / metadata.tags
    const recommendations = traitRecommendation.getRecommendations(document, linePrefix);
    items.push(...recommendations);
  }

  // AI-powered completions (code gen, properties, events)
  if (aiCompletion) {
    try {
      const result = await aiCompletion.getCompletions(document, params.position);
      items.push(...result.completions);
    } catch {
      // AI completions are best-effort, don't block static completions
    }
  }

  // Add symbols from current document
  const cached = documentCache.get(params.textDocument.uri);
  if (cached) {
    for (const [name] of cached.symbols) {
      items.push({
        label: name,
        kind: CompletionItemKind.Reference,
        detail: 'orb',
      });
    }
  }

  return items;
});

/**
 * Provide hover information
 */
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);

  // Find word at position
  const wordRange = getWordRangeAtPosition(text, offset);
  if (!wordRange) return null;

  const word = text.substring(wordRange.start, wordRange.end);

  // Check if it's a trait annotation (starts with @)
  const lineStart = text.lastIndexOf('\n', offset) + 1;
  const lineText = text.substring(lineStart, text.indexOf('\n', offset) || text.length);
  const atMatch = lineText.match(/@(\w+)/);

  if (atMatch) {
    const traitName = atMatch[1];
    const traitDoc = getTraitDoc(traitName);
    if (traitDoc) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: formatTraitDocCompact(traitDoc),
        },
      };
    }
  }

  // Check if word is a trait name (without @)
  const traitDoc = getTraitDoc(word);
  if (traitDoc) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: formatTraitDocCompact(traitDoc),
      },
    };
  }

  // Check if it's a keyword
  const keywordDocs: Record<string, string> = {
    orb: '**orb** - A 3D object in the scene.\n\n```holoscript\norb my_cube {\n  position: [0, 1, 0]\n  scale: [1, 1, 1]\n}\n```',
    world:
      '**world** - A container for orbs and scene configuration.\n\n```holoscript\nworld my_world {\n  sky: "sunset"\n  ground: true\n}\n```',
    position: '**position** - 3D coordinates [x, y, z]\n\nDefault: `[0, 0, 0]`',
    rotation: '**rotation** - Euler angles in degrees [x, y, z]\n\nDefault: `[0, 0, 0]`',
    scale: '**scale** - Size multiplier [x, y, z]\n\nDefault: `[1, 1, 1]`',
    on_click:
      '**on_click** - Handler for click/tap events\n\n```holoscript\non_click: {\n  play_sound: "click.mp3"\n  animate: { scale: [1.2, 1.2, 1.2] }\n}\n```',
    networked:
      "**networked** *(HSPlus)* - Enable multiplayer sync\n\nWhen `true`, this orb's state is synchronized across all connected clients.\n\nSee also: `@networked` trait for advanced options.",
    physics:
      '**physics** *(HSPlus)* - Enable physics simulation\n\n```holoscript\nphysics: {\n  type: "dynamic"  // or "static", "kinematic"\n  mass: 1.0\n  friction: 0.5\n}\n```\n\nSee also: `@rigidbody` trait for advanced options.',
    traits:
      '**traits** - List of trait annotations applied to this object.\n\nAvailable traits: `@rigidbody`, `@trigger`, `@ik`, `@skeleton`, `@networked`, `@material`, `@lighting`, etc.',
    template:
      '**template** - Define a reusable object template.\n\n```holoscript\ntemplate "Enemy" {\n  state { health: 100 }\n  action attack(target) { }\n}\n```',
    composition:
      '**composition** - A scene composition containing objects and logic.\n\n```holoscript\ncomposition "BattleScene" {\n  // objects, templates, and logic here\n}\n```',
    spatial_group:
      '**spatial_group** - A group of spatially-related objects.\n\n```holoscript\nspatial_group "Arena" {\n  object "Platform" { position: [0, 0, 0] }\n}\n```',
  };

  if (keywordDocs[word]) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: keywordDocs[word],
      },
    };
  }

  // Check if it's a symbol or variable with type information
  const cached = documentCache.get(params.textDocument.uri);
  if (cached) {
    if (cached.symbols.has(word)) {
      const symbol = cached.symbols.get(word)!;
      const orbNode = symbol.node;
      const props = orbNode.properties ? Object.keys(orbNode.properties).join(', ') : 'none';

      const typeInfo = cached.typeChecker.getType(word);
      const typeDisplay = typeInfo ? ` : \`${typeInfo.type}\`` : '';

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${word}** (${orbNode.type})${typeDisplay}\n\nProperties: ${props}\n\nDefined at line ${symbol.line}`,
        },
      };
    }

    // Check for inferred variable type
    const typeInfo = cached.typeChecker.getType(word);
    if (typeInfo) {
      let typeDisplay = `\`${typeInfo.type}\``;
      if (typeInfo.elementType) {
        typeDisplay += `<${typeInfo.elementType}>`;
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${word}** (inferred)${typeDisplay ? ` : ${typeDisplay}` : ''}`,
        },
      };
    }
  }

  return null;
});

/**
 * Go to definition
 */
connection.onDefinition((params: DefinitionParams): Location | null => {
  const cached = documentCache.get(params.textDocument.uri);
  if (!cached) return null;

  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const wordRange = getWordRangeAtPosition(text, offset);
  if (!wordRange) return null;

  const word = text.substring(wordRange.start, wordRange.end);

  if (cached.symbols.has(word)) {
    const symbol = cached.symbols.get(word)!;
    return {
      uri: params.textDocument.uri,
      range: {
        start: { line: symbol.line - 1, character: symbol.column - 1 },
        end: { line: symbol.line - 1, character: symbol.column - 1 + word.length },
      },
    };
  }

  return null;
});

/**
 * Find references
 */
connection.onReferences((params: ReferenceParams): Location[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const wordRange = getWordRangeAtPosition(text, offset);
  if (!wordRange) return [];

  const word = text.substring(wordRange.start, wordRange.end);
  const locations: Location[] = [];

  // Find all occurrences of the word
  const regex = new RegExp(`\\b${word}\\b`, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + word.length);

    locations.push({
      uri: params.textDocument.uri,
      range: { start: startPos, end: endPos },
    });
  }

  return locations;
});

/**
 * Handle rename request
 */
connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  const cached = documentCache.get(params.textDocument.uri);
  if (!cached) return null;

  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const wordRange = getWordRangeAtPosition(text, offset);
  if (!wordRange) return null;

  const oldName = text.substring(wordRange.start, wordRange.end);
  const newName = params.newName;

  // Verify it's a renameable symbol (must exist in our symbol table)
  if (!cached.symbols.has(oldName)) return null;

  const edits: TextEdit[] = [];
  const regex = new RegExp(`\\b${oldName}\\b`, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + oldName.length);
    edits.push({
      range: { start: startPos, end: endPos },
      newText: newName,
    });
  }

  return {
    changes: {
      [params.textDocument.uri]: edits,
    },
  };
});

/**
 * Provide code actions (quick fixes)
 */
connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
  const actions: CodeAction[] = [];

  for (const diagnostic of params.context.diagnostics) {
    if (diagnostic.source === 'holoscript-linter' && diagnostic.data) {
      const lintDiag = diagnostic.data as LintDiagnostic;

      if (lintDiag.fix) {
        actions.push({
          title: `Fix ${lintDiag.ruleId}: ${lintDiag.message}`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [params.textDocument.uri]: [
                {
                  range: diagnostic.range,
                  newText: lintDiag.fix.replacement,
                },
              ],
            },
          },
        });
      }
    }
  }

  return actions;
});

/**
 * Document symbols (outline)
 */
connection.onDocumentSymbol((params: DocumentSymbolParams): DocumentSymbol[] => {
  const cached = documentCache.get(params.textDocument.uri);
  if (!cached) return [];

  const symbols: DocumentSymbol[] = [];

  for (const node of cached.ast.children) {
    if (node.type === 'orb') {
      const line = (node.loc?.start.line || 1) - 1;
      const name = node.id || 'orb';

      const symbol: DocumentSymbol = {
        name: name,
        kind: SymbolKind.Class,
        range: {
          start: { line, character: 0 },
          end: { line: (node.loc?.end.line || line + 1) - 1, character: 0 },
        },
        selectionRange: {
          start: { line, character: 0 },
          end: { line, character: name.length + 4 },
        },
        children: [],
      };

      // Add properties as children
      if (node.properties) {
        for (const [key] of Object.entries(node.properties)) {
          symbol.children!.push({
            name: key,
            kind: SymbolKind.Property,
            range: {
              start: { line: line + 1, character: 2 },
              end: { line: line + 1, character: 20 },
            },
            selectionRange: {
              start: { line: line + 1, character: 2 },
              end: { line: line + 1, character: 2 + key.length },
            },
          });
        }
      }

      symbols.push(symbol);
    } else if (node.type === 'world') {
      const line = (node.loc?.start.line || 1) - 1;
      const name = node.id || 'world';

      symbols.push({
        name: name,
        kind: SymbolKind.Module,
        range: {
          start: { line, character: 0 },
          end: { line: (node.loc?.end.line || line + 5) - 1, character: 0 },
        },
        selectionRange: { start: { line, character: 0 }, end: { line, character: 10 } },
      });
    }
  }

  return symbols;
});

/**
 * Semantic tokens for syntax highlighting - Enhanced for HoloScript
 */
connection.onRequest(
  'textDocument/semanticTokens/full',
  (params: SemanticTokensParams): SemanticTokens => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { data: [] };

    const builder = new SemanticTokensBuilder();
    const text = document.getText();
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      // Skip if line is empty
      if (!line.trim()) continue;

      // Comments (check first to skip highlighting inside comments)
      const commentIndex = line.indexOf('//');
      const effectiveLine = commentIndex !== -1 ? line.substring(0, commentIndex) : line;
      if (commentIndex !== -1) {
        builder.push(
          lineNum,
          commentIndex,
          line.length - commentIndex,
          tokenTypes.indexOf('comment'),
          0
        );
      }

      // Traits (@grabbable, @networked, etc.)
      const traitRegex = /@(\w+)/g;
      let traitMatch;
      while ((traitMatch = traitRegex.exec(effectiveLine)) !== null) {
        const traitName = traitMatch[1];
        if (HOLOSCRIPT_TRAITS.includes(traitName)) {
          builder.push(
            lineNum,
            traitMatch.index,
            traitMatch[0].length,
            tokenTypes.indexOf('decorator'),
            0
          );
        }
      }

      // Object declarations (orb, world, composition, template followed by name)
      const objectDeclRegex =
        /\b(orb|world|composition|template|object|system|environment|spatial_group|networked_object)\s+["']?(\w+)/g;
      let objectDeclMatch;
      while ((objectDeclMatch = objectDeclRegex.exec(effectiveLine)) !== null) {
        // Highlight the keyword
        builder.push(
          lineNum,
          objectDeclMatch.index,
          objectDeclMatch[1].length,
          tokenTypes.indexOf('keyword'),
          1
        ); // declaration modifier
        // Highlight the object name as class
        const nameStart = objectDeclMatch.index + objectDeclMatch[0].indexOf(objectDeclMatch[2]);
        builder.push(lineNum, nameStart, objectDeclMatch[2].length, tokenTypes.indexOf('class'), 1); // declaration modifier
      }

      // Event handlers (onGrab, onPoint, etc.)
      for (const handler of EVENT_HANDLERS) {
        const handlerRegex = new RegExp(`\\b${handler}\\b`, 'g');
        let handlerMatch;
        while ((handlerMatch = handlerRegex.exec(effectiveLine)) !== null) {
          builder.push(lineNum, handlerMatch.index, handler.length, tokenTypes.indexOf('event'), 0);
        }
      }

      // Geometry types
      const geometryRegex = new RegExp(
        `\\b(geometry|type)\\s*:\\s*['"]?(${GEOMETRY_TYPES.join('|')})`,
        'g'
      );
      let geometryMatch;
      while ((geometryMatch = geometryRegex.exec(effectiveLine)) !== null) {
        const typeStart = geometryMatch.index + geometryMatch[0].lastIndexOf(geometryMatch[2]);
        builder.push(lineNum, typeStart, geometryMatch[2].length, tokenTypes.indexOf('type'), 0);
      }

      // Keywords (that weren't already handled as object declarations)
      for (const keyword of HOLOSCRIPT_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        let match;
        while ((match = regex.exec(effectiveLine)) !== null) {
          // Skip if this position is already part of an object declaration
          if (
            ![
              'orb',
              'world',
              'composition',
              'template',
              'object',
              'system',
              'environment',
              'spatial_group',
              'networked_object',
            ].includes(keyword)
          ) {
            builder.push(lineNum, match.index, keyword.length, tokenTypes.indexOf('keyword'), 0);
          }
        }
      }

      // Function declarations (function name() or action name())
      const funcDeclRegex = /\b(function|action|behavior)\s+(\w+)/g;
      let funcMatch;
      while ((funcMatch = funcDeclRegex.exec(effectiveLine)) !== null) {
        builder.push(
          lineNum,
          funcMatch.index,
          funcMatch[1].length,
          tokenTypes.indexOf('keyword'),
          0
        );
        const nameStart = funcMatch.index + funcMatch[0].indexOf(funcMatch[2]);
        builder.push(lineNum, nameStart, funcMatch[2].length, tokenTypes.indexOf('function'), 1); // declaration modifier
      }

      // Properties (word followed by colon, but not URLs)
      const propRegex = /(\w+)\s*:/g;
      let propMatch;
      while ((propMatch = propRegex.exec(effectiveLine)) !== null) {
        // Skip if it looks like a URL scheme (http:, https:, file:)
        if (!['http', 'https', 'file', 'ws', 'wss', 'ftp'].includes(propMatch[1])) {
          builder.push(
            lineNum,
            propMatch.index,
            propMatch[1].length,
            tokenTypes.indexOf('property'),
            0
          );
        }
      }

      // Strings
      const stringRegex = /"[^"]*"|'[^']*'/g;
      let stringMatch;
      while ((stringMatch = stringRegex.exec(effectiveLine)) !== null) {
        builder.push(
          lineNum,
          stringMatch.index,
          stringMatch[0].length,
          tokenTypes.indexOf('string'),
          0
        );
      }

      // Numbers (including decimals and negative)
      const numRegex = /-?\b\d+(\.\d+)?\b/g;
      let numMatch;
      while ((numMatch = numRegex.exec(effectiveLine)) !== null) {
        builder.push(lineNum, numMatch.index, numMatch[0].length, tokenTypes.indexOf('number'), 0);
      }
    }

    return builder.build();
  }
);

/**
 * Helper: Get word range at position
 */
function getWordRangeAtPosition(
  text: string,
  offset: number
): { start: number; end: number } | null {
  const wordPattern = /[a-zA-Z_][a-zA-Z0-9_]*/g;
  let match;

  while ((match = wordPattern.exec(text)) !== null) {
    if (match.index <= offset && offset <= match.index + match[0].length) {
      return { start: match.index, end: match.index + match[0].length };
    }
  }

  return null;
}

/**
 * Helper: Map linter severity to LSP diagnostic severity
 */
function mapLintSeverity(severity: LintSeverity): DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return DiagnosticSeverity.Error;
    case 'warning':
      return DiagnosticSeverity.Warning;
    case 'info':
      return DiagnosticSeverity.Information;
    case 'hint':
      return DiagnosticSeverity.Hint;
    default:
      return DiagnosticSeverity.Warning;
  }
}

// Clean up cache when documents are closed
documents.onDidClose((event) => {
  const uri = event.document.uri;
  documentCache.delete(uri);
  pendingContentChanges.delete(uri);
  treeSitter.closeDocument(uri);
  const index = documentAccessOrder.indexOf(uri);
  if (index > -1) {
    documentAccessOrder.splice(index, 1);
  }
  console.error(`[LSP] Removed closed document from cache: ${uri}`);
});

// Start listening
documents.listen(connection);
connection.listen();

console.error('HoloScript Language Server started');
