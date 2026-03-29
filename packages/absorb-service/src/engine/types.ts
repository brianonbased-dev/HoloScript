/**
 * Codebase Absorption Engine - Core Types
 *
 * Defines the language-agnostic symbol extraction interface used by
 * tree-sitter adapters to normalize symbols from any supported language
 * into HoloScript's ReferenceGraph.
 *
 * @version 1.0.0
 */

import type {
  SymbolType,
  SymbolDefinition,
  SymbolReference,
  ReferenceContext,
} from '../analysis/ReferenceGraph';

// =============================================================================
// SUPPORTED LANGUAGES
// =============================================================================

export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'cpp'
  | 'csharp'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'holoscript'
  | 'plaintext';

// =============================================================================
// EXTENDED SYMBOL TYPES (adds to ReferenceGraph.SymbolType)
// =============================================================================

/** Symbol types for external language constructs beyond .holo */
export type ExternalSymbolType =
  | 'class'
  | 'interface'
  | 'enum'
  | 'struct'
  | 'trait'
  | 'method'
  | 'field'
  | 'constant'
  | 'type_alias'
  | 'module'
  | 'namespace'
  | 'package';

/** Union of HoloScript-native and external symbol types */
export type ExtendedSymbolType = SymbolType | ExternalSymbolType;

// =============================================================================
// SYMBOL DEFINITIONS
// =============================================================================

/** Extended symbol definition for multi-language codebase analysis */
export interface ExternalSymbolDefinition extends Omit<SymbolDefinition, 'type'> {
  type: ExtendedSymbolType;
  /** Source language */
  language: SupportedLanguage;
  /** Visibility modifier */
  visibility: 'public' | 'private' | 'protected' | 'internal';
  /** Function/method signature for display */
  signature?: string;
  /** Doc comment content */
  docComment?: string;
  /** For methods: the owning class/struct name */
  owner?: string;
  /** Number of lines of code */
  loc?: number;
}

// =============================================================================
// IMPORT EDGES
// =============================================================================

/** Represents an import/use/require relationship between files */
export interface ImportEdge {
  /** Absolute path of the importing file */
  fromFile: string;
  /** Raw import path as written in source */
  toModule: string;
  /** Resolved absolute path (filled by scanner) */
  resolvedPath?: string;
  /** Specific named imports (e.g., { Foo, Bar }) */
  namedImports?: string[];
  /** Wildcard / star import */
  isWildcard?: boolean;
  /** Default import */
  isDefault?: boolean;
  /** Line number of the import statement */
  line: number;
}

// =============================================================================
// CALL EDGES
// =============================================================================

/** Represents a function/method call relationship */
export interface CallEdge {
  /** Caller symbol ID */
  callerId: string;
  /** Callee symbol name (may not be resolved to ID yet) */
  calleeName: string;
  /** Callee owner (for method calls: ClassName.methodName) */
  calleeOwner?: string;
  /** File containing the call */
  filePath: string;
  /** Line of the call site */
  line: number;
  /** Column of the call site */
  column: number;
}

// =============================================================================
// LANGUAGE ADAPTER INTERFACE
// =============================================================================

/** Tree-sitter syntax node (minimal interface) */
export interface SyntaxNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  children: SyntaxNode[];
  namedChildren: SyntaxNode[];
  parent: SyntaxNode | null;
  childForFieldName(name: string): SyntaxNode | null;
  descendantsOfType(type: string): SyntaxNode[];
}

/** Tree-sitter parse tree (minimal interface) */
export interface ParseTree {
  rootNode: SyntaxNode;
}

/**
 * Language adapter interface.
 *
 * Each supported language implements this to normalize its tree-sitter AST
 * into the common ExternalSymbolDefinition / ImportEdge / CallEdge types.
 */
export interface LanguageAdapter {
  /** Language identifier */
  readonly language: SupportedLanguage;

  /** File extensions handled (e.g., ['.ts', '.tsx']) */
  readonly extensions: string[];

  /** npm package name for tree-sitter grammar */
  readonly grammarPackage: string;

  /** Extract symbol definitions from a parsed tree */
  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[];

  /** Extract import edges from a parsed tree */
  extractImports(tree: ParseTree, filePath: string): ImportEdge[];

  /** Extract call edges from a parsed tree */
  extractCalls(tree: ParseTree, filePath: string): CallEdge[];
}

// =============================================================================
// SCAN CONFIGURATION
// =============================================================================

export interface ScanOptions {
  /** Root directory to scan */
  rootDir: string;
  /** Include glob patterns (default: all supported extensions) */
  include?: string[];
  /** Exclude glob patterns (default: node_modules, .git, dist, build, etc.) */
  exclude?: string[];
  /** Maximum number of files to process */
  maxFiles?: number;
  /** Maximum file size in bytes (default: 1MB) */
  maxFileSize?: number;
  /** Enable parallel parsing via workers */
  parallel?: boolean;
  /** Filter to specific languages */
  languages?: SupportedLanguage[];
  /** Include build output directories like dist/build/out (default: false) */
  includeBuildArtifacts?: boolean;
  /** Injectable file reader (for testing / browser) */
  readFile?: (path: string) => Promise<string>;
  /** Progress callback, called after each file is parsed */
  onProgress?: (parsed: number, total: number, file: string) => void;
}

// =============================================================================
// SCAN RESULTS
// =============================================================================

export interface ScannedFile {
  path: string;
  language: SupportedLanguage;
  symbols: ExternalSymbolDefinition[];
  imports: ImportEdge[];
  calls: CallEdge[];
  loc: number;
  sizeBytes: number;
  /** File-level module doc comment (e.g. the top-of-file /** ... *\/ block) */
  docComment?: string;
}

export interface ScanStats {
  totalFiles: number;
  filesByLanguage: Record<string, number>;
  totalSymbols: number;
  symbolsByType: Record<string, number>;
  totalImports: number;
  totalCalls: number;
  totalLoc: number;
  durationMs: number;
  errors: ScanError[];
}

export interface ScanError {
  file: string;
  error: string;
  phase: 'read' | 'parse' | 'extract';
}

export interface ScanResult {
  rootDir: string;
  files: ScannedFile[];
  stats: ScanStats;
}
