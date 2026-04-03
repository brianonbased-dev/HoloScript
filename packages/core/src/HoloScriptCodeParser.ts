/**
 * HoloScript Code Parser
 *
 * Parses HoloScript code strings into AST nodes that can be executed
 * by the HoloScriptRuntime.
 *
 * Syntax Reference:
 * - orb <name> { properties }
 * - function <name>(<params>): <return> { body }
 * - connect <from> to <to> [as <type>]
 * - gate <name> { condition, true_path, false_path }
 * - stream <name> from <source> { transformations }
 */

import { logger } from './logger';
import type {
  ASTNode,
  OrbNode,
  MethodNode,
  ParameterNode,
  ConnectionNode,
  GateNode,
  StreamNode,
  SpatialPosition,
  HologramProperties,
  ForLoopNode,
  WhileLoopNode,
  ForEachLoopNode,
  ImportNode,
  ExportNode,
  VariableDeclarationNode,
  ScaleNode,
  FocusNode,
  EnvironmentNode,
  TemplateNode,
  MigrationNode,
  HoloScriptValue,
  HSPlusDirective,
  TypeGuardExpression,
  ZoneNode,
  HologramShape,
  CompositionNode,
  SystemNode,
  ComponentNode,
  MemoryNode,
  SemanticMemoryNode,
  EpisodicMemoryNode,
  ProceduralMemoryNode,
} from './types';
import type {
  HSPlusStateDirective,
  HSPlusBindingsDirective,
  HSPlusLifecycleDirective,
  HSPlusTraitDirective,
  HSPlusVersionDirective,
} from './types/AdvancedTypeSystem';
import { HoloScriptPersistenceParser } from './HoloScriptPersistenceParser';

// =============================================================================
// OBJECT POOL - Reduces GC pressure by reusing objects
// =============================================================================

/**
 * Simple object pool for reducing garbage collection pressure
 * on frequently created/destroyed objects during parsing.
 */
class ObjectPool<T extends object> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;

  constructor(createFn: () => T, resetFn: (obj: T) => void, maxSize = 100) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  /** Get an object from pool or create new one */
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  /** Return object to pool for reuse */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }

  /** Clear the pool */
  clear(): void {
    this.pool.length = 0;
  }

  /** Get pool statistics */
  get stats(): { pooled: number; maxSize: number } {
    return { pooled: this.pool.length, maxSize: this.maxSize };
  }
}

// Token pool for reusing token objects
const tokenPool = new ObjectPool<{ type: string; value: string; line: number; column: number }>(
  () => ({ type: '', value: '', line: 0, column: 0 }),
  (t) => {
    t.type = '';
    t.value = '';
    t.line = 0;
    t.column = 0;
  }
);

// Array pool for reusing arrays
const arrayPool = new ObjectPool<unknown[]>(
  () => [],
  (arr) => {
    arr.length = 0;
  },
  50
);

/** Export pool utilities for advanced usage */
export const ParserPools = {
  token: tokenPool,
  array: arrayPool,
  clearAll: () => {
    tokenPool.clear();
    arrayPool.clear();
  },
  getStats: () => ({
    token: tokenPool.stats,
    array: arrayPool.stats,
  }),
};

// Security configuration
const CODE_SECURITY_CONFIG = {
  maxCodeLength: 50000,
  maxBlocks: 100,
  maxNestingDepth: 10,
  suspiciousKeywords: [
    'process',
    'require',
    'eval',
    'constructor',
    'prototype',
    '__proto__',
    'fs',
    'child_process',
    'exec',
    'spawn',
  ],
};

/**
 * Strip comments and strings from code before security checks.
 * This prevents false positives when keywords appear in documentation or string literals.
 */
function stripCommentsAndStrings(code: string): string {
  let result = '';
  let i = 0;

  while (i < code.length) {
    // Single-line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    // Multi-line comment
    if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // Double-quoted string
    if (code[i] === '"') {
      i++;
      while (i < code.length && code[i] !== '"') {
        if (code[i] === '\\' && i + 1 < code.length) i++; // Skip escaped char
        i++;
      }
      i++; // Skip closing quote
      continue;
    }

    // Single-quoted string
    if (code[i] === "'") {
      i++;
      while (i < code.length && code[i] !== "'") {
        if (code[i] === '\\' && i + 1 < code.length) i++; // Skip escaped char
        i++;
      }
      i++; // Skip closing quote
      continue;
    }

    result += code[i];
    i++;
  }

  return result;
}

export interface ParseResult {
  success: boolean;
  ast: ASTNode[];
  errors: ParseError[];
  warnings: string[];
}

export interface ParseError {
  line: number;
  column: number;
  message: string;
  /** Error code for documentation reference (e.g., HS001) */
  code?: string;
  /** The source snippet around the error */
  context?: string;
  /** Suggested fix (e.g., "Did you mean 'object'?") */
  suggestion?: string;
  /** Severity of the error */
  severity?: 'error' | 'warning' | 'info';
  /** End position for range highlighting */
  endLine?: number;
  endColumn?: number;
}

/** Error codes with descriptions */
export const ERROR_CODES = {
  HS001: 'Expected keyword - a required keyword is missing',
  HS002: 'Expected identifier - a name is required here',
  HS003: 'Expected operator - an operator like = or : is required',
  HS004: 'Unexpected token - this token is not valid in this context',
  HS005: 'Unclosed block - missing closing brace }',
  HS006: 'Unclosed string - missing closing quote',
  HS007: 'Invalid number - numeric literal is malformed',
  HS008: 'Unknown keyword - this keyword is not recognized',
  HS009: 'Too many items - limit exceeded for performance',
  HS010: 'Security violation - blocked for security reasons',
} as const;

interface Token {
  type: 'keyword' | 'identifier' | 'number' | 'string' | 'operator' | 'punctuation' | 'newline';
  value: string;
  line: number;
  column: number;
}

export class HoloScriptCodeParser {
  private errors: ParseError[] = [];
  private warnings: string[] = [];
  public tokens: Token[] = [];
  public position: number = 0;
  private keywordSet: Set<string>;
  private persistenceParser: HoloScriptPersistenceParser;

  constructor() {
    this.persistenceParser = new HoloScriptPersistenceParser(this);
    // Pre-compute keyword set for O(1) lookup instead of O(n) array search
    this.keywordSet = new Set([
      'orb',
      'function',
      'connect',
      'to',
      'as',
      'gate',
      'stream',
      'from',
      'through',
      'return',
      'if',
      'else',
      'nexus',
      'building',
      'pillar',
      'foundation',
      'for',
      'while',
      'forEach',
      'in',
      'of',
      'break',
      'continue',
      'import',
      'export',
      'module',
      'use',
      'type',
      'interface',
      'extends',
      'implements',
      'is',
      'async',
      'await',
      'spawn',
      'parallel',
      'class',
      'new',
      'this',
      'super',
      'static',
      'private',
      'public',
      'try',
      'catch',
      'finally',
      'throw',
      'const',
      'let',
      'var',
      'animate',
      'modify',
      'pulse',
      'move',
      'show',
      'hide',
      'scale',
      'focus',
      'environment',
      'composition',
      'template',
      'settings',
      'chat',
      'migrate',
      // Shape keywords for 3D objects
      'cube',
      'sphere',
      'plane',
      'cylinder',
      'cone',
      'torus',
      'pyramid',
      'box',
      'mesh',
      'model',
      'object',
      'light',
      'camera',
      // System and component keywords (Phase 0: Hololand Bootstrap)
      'system',
      'component',
      'action',
      'props',
      // Additional scene keywords
      'npc',
      'player',
      'entity',
      'trigger',
      'zone',
      'portal',
      'spatial_group',
      'interactive',
      'traits',
      'on_interact',
      'on_collision',
      'on_enter',
      'on_exit',
      'using',
      'memory',
      'semantic',
      'episodic',
      'procedural',
    ]);
  }

  /** Source code lines for error context */
  private sourceLines: string[] = [];

  /**
   * Create a rich error with context and suggestions
   */
  public createError(
    code: keyof typeof ERROR_CODES,
    message: string,
    token?: Token | null,
    suggestion?: string
  ): ParseError {
    const line = token?.line || 0;
    const column = token?.column || 0;

    // Get source context (line before, current, line after)
    let context = '';
    if (this.sourceLines.length > 0 && line > 0) {
      const lines = [];
      if (line > 1) lines.push(`${line - 1} | ${this.sourceLines[line - 2] || ''}`);
      lines.push(`${line} | ${this.sourceLines[line - 1] || ''}`);
      lines.push(`    ${' '.repeat(column)}^`);
      if (line < this.sourceLines.length)
        lines.push(`${line + 1} | ${this.sourceLines[line] || ''}`);
      context = lines.join('\n');
    }

    return {
      line,
      column,
      message,
      code,
      context,
      suggestion,
      severity: 'error',
    };
  }

  /**
   * Find similar keywords for "did you mean" suggestions
   */
  private findSimilarKeyword(word: string): string | undefined {
    if (!word) return undefined;
    const lower = word.toLowerCase();
    let bestMatch: string | undefined;
    let bestScore = 0;

    for (const keyword of this.keywordSet) {
      const score = this.similarity(lower, keyword);
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = keyword;
      }
    }
    return bestMatch;
  }

  /**
   * Simple Levenshtein-based similarity (0-1)
   */
  private similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const len = Math.max(a.length, b.length);
    let matches = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) matches++;
    }
    // Also check if one starts with the other
    if (a.startsWith(b) || b.startsWith(a)) {
      matches = Math.max(matches, Math.min(a.length, b.length));
    }
    return matches / len;
  }

  /**
   * Add error and continue parsing (error recovery)
   */
  public addError(error: ParseError): void {
    // Avoid duplicate errors on same line
    if (!this.errors.some((e) => e.line === error.line && e.message === error.message)) {
      this.errors.push(error);
    }
  }

  /**
   * Recover from error by skipping to next statement boundary
   */
  private synchronize(): void {
    while (this.position < this.tokens.length) {
      const token = this.currentToken();
      if (!token) break;

      // Stop at statement boundaries
      if (token.type === 'newline') {
        this.advance();
        break;
      }
      if (
        token.type === 'keyword' &&
        [
          'orb',
          'function',
          'gate',
          'for',
          'while',
          'if',
          'return',
          'object',
          'template',
          'composition',
          'spatial_group',
          'logic',
        ].includes(token.value)
      ) {
        break;
      }
      if (token.type === 'punctuation' && ['}', ';'].includes(token.value)) {
        this.advance();
        break;
      }
      this.advance();
    }
  }

  /**
   * Parse HoloScript code string into AST
   */
  parse(code: string): ParseResult {
    this.errors = [];
    this.warnings = [];
    this.tokens = [];
    this.position = 0;
    this.sourceLines = code.split('\n'); // Store for error context

    // Security: Check code length
    if (code.length > CODE_SECURITY_CONFIG.maxCodeLength) {
      return {
        success: false,
        ast: [],
        errors: [
          {
            line: 0,
            column: 0,
            message: `Code exceeds max length (${CODE_SECURITY_CONFIG.maxCodeLength})`,
            code: 'HS009',
            severity: 'error',
          },
        ],
        warnings: [],
      };
    }

    // Security: Check for suspicious keywords (only in actual code, not comments/strings)
    const strippedCode = stripCommentsAndStrings(code).toLowerCase();
    for (const keyword of CODE_SECURITY_CONFIG.suspiciousKeywords) {
      // Use word boundary check to avoid false positives like "spawn" in "respawn"
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(strippedCode)) {
        logger.warn('Suspicious keyword detected', { keyword });
        return {
          success: false,
          ast: [],
          errors: [
            {
              line: 0,
              column: 0,
              message: `Suspicious keyword detected: ${keyword}`,
              code: 'HS010',
              severity: 'error',
            },
          ],
          warnings: [],
        };
      }
    }

    try {
      // Tokenize
      this.tokens = this.tokenize(code);

      // Parse tokens into AST with error recovery
      const ast = this.parseProgram();

      return {
        success: this.errors.length === 0,
        ast,
        errors: this.errors,
        warnings: this.warnings,
      };
    } catch (error) {
      // Don't lose previous errors on exception
      this.addError({
        line: 0,
        column: 0,
        message: String(error),
        code: 'HS004',
        severity: 'error',
      });
      return {
        success: false,
        ast: [],
        errors: this.errors,
        warnings: this.warnings,
      };
    }
  }

  /**
   * Tokenize code into tokens
   */
  private tokenize(code: string): Token[] {
    const tokens: Token[] = [];
    let line = 1;
    let column = 1;
    let i = 0;

    while (i < code.length) {
      const char = code[i];

      // Skip whitespace (except newlines)
      if (char === ' ' || char === '\t' || char === '\r') {
        i++;
        column++;
        continue;
      }

      // Newline
      if (char === '\n') {
        tokens.push({ type: 'newline', value: '\n', line, column });
        line++;
        column = 1;
        i++;
        continue;
      }

      // Comments (skip)
      if (char === '/' && code[i + 1] === '/') {
        while (i < code.length && code[i] !== '\n') {
          i++;
        }
        continue;
      }

      // String
      if (char === '"' || char === "'") {
        const quote = char;
        let str = '';
        const startCol = column;
        i++;
        column++;

        while (i < code.length && code[i] !== quote) {
          if (code[i] === '\\' && i + 1 < code.length) {
            str += code[i + 1];
            i += 2;
            column += 2;
          } else {
            str += code[i];
            i++;
            column++;
          }
        }

        i++; // Skip closing quote
        column++;

        tokens.push({ type: 'string', value: str, line, column: startCol });
        continue;
      }

      // Number
      if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(code[i + 1]))) {
        let num = '';
        const startCol = column;

        while (i < code.length && /[0-9.\-]/.test(code[i])) {
          num += code[i];
          i++;
          column++;
        }

        tokens.push({ type: 'number', value: num, line, column: startCol });
        continue;
      }

      // Identifier or keyword
      if (/[a-zA-Z_]/.test(char)) {
        let ident = '';
        const startCol = column;

        while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
          ident += code[i];
          i++;
          column++;
        }

        const isKeyword = this.keywordSet.has(ident.toLowerCase());
        tokens.push({
          type: isKeyword ? 'keyword' : 'identifier',
          value: ident,
          line,
          column: startCol,
        });
        continue;
      }

      // Multi-character operators (must check before single-char)
      const multiCharOps = [
        '===',
        '!==',
        '==',
        '!=',
        '>=',
        '<=',
        '&&',
        '||',
        '??',
        '?.',
        '++',
        '--',
        '+=',
        '-=',
        '*=',
        '/=',
        '%=',
        '=>',
        '->',
      ];
      let foundMultiOp = false;
      for (const op of multiCharOps) {
        if (code.substring(i, i + op.length) === op) {
          tokens.push({ type: 'operator', value: op, line, column });
          i += op.length;
          column += op.length;
          foundMultiOp = true;
          break;
        }
      }
      if (foundMultiOp) continue;

      // Operators and punctuation
      const punctuation = [
        '{',
        '}',
        '(',
        ')',
        '[',
        ']',
        ':',
        ',',
        '.',
        ';',
        '=',
        '<',
        '>',
        '+',
        '-',
        '*',
        '/',
        '%',
        '!',
        '&',
        '|',
        '?',
        '#',
        '@',
      ];
      if (punctuation.includes(char)) {
        tokens.push({ type: 'punctuation', value: char, line, column });
        i++;
        column++;
        continue;
      }

      // Unknown character - skip
      i++;
      column++;
    }

    return tokens;
  }

  /**
   * Parse program (list of declarations)
   */
  private parseProgram(): ASTNode[] {
    const nodes: ASTNode[] = [];
    let blockCount = 0;
    const maxErrors = 50; // Stop after too many errors

    while (this.position < this.tokens.length) {
      // Stop if too many errors
      if (this.errors.length >= maxErrors) {
        this.addError({
          line: 0,
          column: 0,
          message: `Too many errors (${maxErrors}+), stopping parse`,
          code: 'HS009',
          severity: 'error',
        });
        break;
      }

      // Skip newlines
      while (this.currentToken()?.type === 'newline') {
        this.advance();
      }

      if (this.position >= this.tokens.length) break;

      // Security: limit blocks
      blockCount++;
      if (blockCount > CODE_SECURITY_CONFIG.maxBlocks) {
        this.addError({
          line: 0,
          column: 0,
          message: 'Too many blocks in program',
          code: 'HS009',
          severity: 'error',
        });
        break;
      }

      const errorCountBefore = this.errors.length;
      const node = this.parseDeclaration();

      if (node) {
        nodes.push(node);
      } else if (this.errors.length > errorCountBefore) {
        // Error occurred - try to recover
        this.synchronize();
      }
    }

    return nodes;
  }

  /**
   * Parse a single declaration
   */
  private parseDeclaration(): ASTNode | null {
    const token = this.currentToken();
    if (!token) return null;

    if (token.type === 'keyword') {
      switch (token.value.toLowerCase()) {
        case 'orb':
        case 'object':
          return this.parseOrb();
        case 'function':
          return this.parseFunction();
        case 'connect':
          return this.parseConnection();
        case 'gate':
        case 'if':
          return this.parseGate();
        case 'return':
          return this.parseReturn();
        case 'stream':
          return this.parseStream();
        case 'nexus':
          return this.parseNexus();
        case 'building':
        case 'class':
          return this.parseBuilding();
        // Phase 2: Loop constructs
        case 'for':
          return this.parseForLoop();
        case 'while':
          return this.parseWhileLoop();
        case 'foreach':
          return this.parseForEachLoop();
        // Phase 2: Module system
        case 'import':
          return this.parseImport();
        case 'export':
          return this.parseExport();
        // Phase 2: Variable declarations
        // UI Extensions
        case 'ui2d':
        case 'card':
        case 'metric':
        case 'button':
        case 'row':
        case 'col':
        case 'text':
          return this.parseUIElement();
        case 'const':
        case 'let':
        case 'var':
          return this.parseVariableDeclaration();
        // DSL-first commands (Phase 54)
        case 'animate':
          return this.parseAnimate();
        case 'modify':
          return this.parseModify();
        case 'scale':
          return this.parseScale();
        case 'focus':
          return this.parseFocus();
        case 'environment':
          return this.parseEnvironment();
        case 'composition':
          return this.parseComposition();
        case 'template':
          return this.parseTemplate();
        case 'system':
          return this.parseSystem();
        case 'component':
          return this.parseComponent();
        case 'migrate':
          return this.parseMigration();
        case 'settings':
          return this.parseSettings();
        case 'chat':
          return this.parseChat();
        // Primitive 3D shapes (Phase 55)
        case 'cube':
        case 'sphere':
        case 'plane':
        case 'cylinder':
        case 'cone':
        case 'torus':
        case 'pyramid':
        case 'box':
        case 'mesh':
        case 'model':
        case 'light':
        case 'camera':
          return this.parsePrimitive();
        case 'zone':
          return this.parseZone();
        case 'memory':
          return this.parseMemory();
        default:
          return this.parseExpressionStatement();
      }
    }

    // Skip unrecognized tokens
    this.advance();
    return null;
  }

  /**
   * Parse for loop: for (init; condition; update) { body }
   */
  private parseForLoop(): ForLoopNode | null {
    this.expect('keyword', 'for');

    if (!this.check('punctuation', '(')) {
      this.errors.push({ line: 0, column: 0, message: 'Expected ( after for' });
      return null;
    }
    this.advance();

    // Parse init, condition, update (simplified - collect as strings)
    let init = '',
      condition = '',
      update = '';
    let depth = 0;

    // Parse init (until first ;)
    while (this.position < this.tokens.length) {
      const t = this.currentToken();
      if (!t) break;
      if (t.value === ';' && depth === 0) {
        this.advance();
        break;
      }
      if (t.value === '(') depth++;
      if (t.value === ')') depth--;
      init += t.value + ' ';
      this.advance();
    }

    // Parse condition (until second ;)
    depth = 0;
    while (this.position < this.tokens.length) {
      const t = this.currentToken();
      if (!t) break;
      if (t.value === ';' && depth === 0) {
        this.advance();
        break;
      }
      if (t.value === '(') depth++;
      if (t.value === ')') depth--;
      condition += t.value + ' ';
      this.advance();
    }

    // Parse update (until ))
    depth = 0;
    while (this.position < this.tokens.length) {
      const t = this.currentToken();
      if (!t) break;
      if (t.value === ')' && depth === 0) {
        this.advance();
        break;
      }
      if (t.value === '(') depth++;
      if (t.value === ')') depth--;
      update += t.value + ' ';
      this.advance();
    }

    // Parse body
    const body: ASTNode[] = [];
    if (this.check('punctuation', '{')) {
      this.advance();
      let braceDepth = 1;
      while (braceDepth > 0 && this.position < this.tokens.length) {
        if (this.check('punctuation', '{')) braceDepth++;
        if (this.check('punctuation', '}')) braceDepth--;
        this.advance();
      }
    }

    return {
      type: 'for-loop',
      init: init.trim(),
      condition: this.parseConditionExpression(condition.trim()),
      update: update.trim(),
      body,
      position: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Parse while loop: while (condition) { body }
   */
  private parseWhileLoop(): WhileLoopNode | null {
    this.expect('keyword', 'while');

    let condition = '';
    if (this.check('punctuation', '(')) {
      this.advance();
      let depth = 1;
      while (depth > 0 && this.position < this.tokens.length) {
        const t = this.currentToken();
        if (!t) break;
        if (t.value === '(') depth++;
        if (t.value === ')') {
          depth--;
          if (depth === 0) {
            this.advance();
            break;
          }
        }
        condition += t.value + ' ';
        this.advance();
      }
    }

    // Parse body
    if (this.check('punctuation', '{')) {
      this.advance();
      let braceDepth = 1;
      while (braceDepth > 0 && this.position < this.tokens.length) {
        if (this.check('punctuation', '{')) braceDepth++;
        if (this.check('punctuation', '}')) braceDepth--;
        this.advance();
      }
    }

    return {
      type: 'while-loop',
      condition: this.parseConditionExpression(condition.trim()),
      body: [],
      position: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Parse forEach loop: forEach item in collection { body }
   */
  private parseForEachLoop(): ForEachLoopNode | null {
    this.expect('keyword', 'forEach');

    const variable = this.expectIdentifier();
    this.expect('keyword', 'in');
    const collection = this.expectIdentifier();

    // Parse body
    if (this.check('punctuation', '{')) {
      this.advance();
      let braceDepth = 1;
      while (braceDepth > 0 && this.position < this.tokens.length) {
        if (this.check('punctuation', '{')) braceDepth++;
        if (this.check('punctuation', '}')) braceDepth--;
        this.advance();
      }
    }

    return {
      type: 'foreach-loop',
      variable: variable || 'item',
      collection: collection || 'items',
      body: [],
      position: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Parse import: import { x, y } from "module"
   */
  private parseImport(): ImportNode | null {
    this.expect('keyword', 'import');

    const imports: string[] = [];
    let modulePath = '';
    let defaultImport: string | undefined;

    // Check for bare import (string) or default/named imports
    const current = this.currentToken();
    if (current?.type === 'string') {
      modulePath = current.value;
      this.advance();
      return {
        type: 'import',
        imports: [],
        modulePath,
        position: { x: 0, y: 0, z: 0 },
      };
    }

    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        const name = this.expectIdentifier();
        if (name) imports.push(name);
        if (this.check('punctuation', ',')) this.advance();
      }
      this.expect('punctuation', '}');
    } else {
      // Default import
      defaultImport = this.expectIdentifier() || undefined;
    }

    // from "module"
    if (this.check('keyword', 'from')) {
      this.advance();
      const pathToken = this.currentToken();
      if (pathToken?.type === 'string') {
        modulePath = pathToken.value;
        this.advance();
      }
    }

    return {
      type: 'import',
      imports,
      defaultImport,
      modulePath,
      position: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Parse export: export { x, y } or export function/orb
   */
  private parseExport(): ExportNode | null {
    this.expect('keyword', 'export');

    // Check if exporting a declaration
    const next = this.currentToken();
    if (next?.type === 'keyword') {
      const declaration = this.parseDeclaration();
      return {
        type: 'export',
        declaration: declaration || undefined,
        position: { x: 0, y: 0, z: 0 },
      };
    }

    // Named exports
    const exports: string[] = [];
    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        const name = this.expectIdentifier();
        if (name) exports.push(name);
        if (this.check('punctuation', ',')) this.advance();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'export',
      exports,
      position: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Parse variable declaration: const/let/var name = value
   */
  private parseVariableDeclaration(): VariableDeclarationNode | null {
    const kindToken = this.currentToken()?.value.toLowerCase();
    const kind: 'const' | 'let' | 'var' =
      kindToken === 'let' ? 'let' : kindToken === 'var' ? 'var' : 'const';
    this.advance();

    const name = this.expectIdentifier();
    if (!name) return null;

    let dataType: string | undefined;
    if (this.check('punctuation', ':')) {
      this.advance();
      dataType = this.expectIdentifier() || undefined;
    }

    const result: VariableDeclarationNode = {
      type: 'variable-declaration',
      kind,
      name,
      dataType,
      value: undefined,
      position: { x: 0, y: 0, z: 0 },
    };

    if (this.check('punctuation', '=')) {
      this.advance();

      const valueToken = this.currentToken();
      if (valueToken?.type === 'string') {
        result.value = valueToken.value;
        this.advance();
      } else if (valueToken?.type === 'number') {
        result.value = parseFloat(valueToken.value);
        this.advance();
      } else if (this.check('punctuation', '[')) {
        result.value = this.parseArray() as HoloScriptValue;
      } else if (this.check('punctuation', '{')) {
        result.value = this.parseObject() as HoloScriptValue;
      } else if (valueToken?.type === 'identifier') {
        if (valueToken.value === 'true') {
          result.value = true;
          this.advance();
        } else if (valueToken.value === 'false') {
          result.value = false;
          this.advance();
        } else {
          // It's an expression (assignment from variable or call)
          let expression = '';
          while (this.position < this.tokens.length) {
            const t = this.currentToken();
            if (!t || t.type === 'newline' || (t.type === 'punctuation' && t.value === ';')) break;
            expression += t.value + ' ';
            this.advance();
          }
          result.value = expression.trim();
          result.isExpression = true;
        }
      }
    }

    return result;
  }

  /**
   * Parse orb declaration
   */
  private parseOrb(): OrbNode | null {
    const startToken = this.currentToken(); // Capture start token for line info

    // Support both 'orb' and 'object' keywords
    if (this.check('keyword', 'orb') || this.check('keyword', 'object')) {
      this.advance();
    } else {
      this.expect('keyword', 'orb'); // Fallback to standard error
    }

    let name = '';
    // Check for ID syntax: orb#id
    if (this.check('punctuation', '#')) {
      this.advance(); // #
      name = this.expectName() || `orb_${Date.now()}`;
    } else {
      name = this.expectName() || `orb_${Date.now()}`;
    }

    let template: string | undefined;
    if (this.check('keyword', 'using')) {
      this.advance();
      template = this.expectName() || undefined;
    }

    const properties: Record<string, HoloScriptValue> = {};
    const directives: HSPlusDirective[] = [];
    let position: SpatialPosition | undefined;
    let hologram: HologramProperties | undefined;

    if (this.check('punctuation', '{')) {
      this.advance(); // {

      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        if (this.check('punctuation', '}')) break;

        if (this.check('punctuation', ',') || this.check('punctuation', ';')) {
          this.advance();
          continue;
        }

        const token = this.currentToken();
        if (token?.type === 'punctuation' && token.value === '@') {
          const directive = this.parseDirective();
          if (directive) directives.push(directive);
        } else {
          const prop = this.parseProperty();
          if (prop) {
            // Handle special properties
            if (prop.key === 'position' || prop.key === 'at') {
              position = this.parsePosition(prop.value);
            } else if (prop.key === 'color' || prop.key === 'glow' || prop.key === 'size') {
              hologram = hologram || {
                shape: 'orb',
                color: '#00ffff',
                size: 0.5,
                glow: true,
                interactive: true,
              };
              if (prop.key === 'color') hologram.color = String(prop.value);
              if (prop.key === 'glow') hologram.glow = Boolean(prop.value);
              if (prop.key === 'size') hologram.size = Number(prop.value);
            } else {
              properties[prop.key] = prop.value;
            }
          } else {
            // Fix: Advance if parseProperty failed to consume anything
            this.advance();
          }
        }

        this.skipNewlines();
      }

      this.expect('punctuation', '}');
    }

    return {
      type: 'orb',
      name,
      position: position || { x: 0, y: 0, z: 0 },
      hologram: hologram || {
        shape: 'orb',
        color: '#00ffff',
        size: 0.5,
        glow: true,
        interactive: true,
      },
      properties,
      directives: directives as unknown as HSPlusDirective[],
      template,
      methods: [],
      children: [],
      line: startToken?.line || 0,
    };
  }

  /**
   * Parse HoloScript+ directive: @name(...) or @name { ... }
   */
  private parseDirective(): HSPlusDirective | null {
    this.expect('punctuation', '@');
    const name = this.expectIdentifier();
    if (!name) return null;

    // Handle @state { ... }
    if (name === 'state') {
      const body = this.parseObject() as Record<string, HoloScriptValue>;
      return { type: 'state' as const, body } as HSPlusStateDirective;
    }

    // Handle @bindings { ... }
    if (name === 'bindings') {
      const bindings = this.parseBindingsBlock();
      return { type: 'bindings' as const, bindings } as HSPlusBindingsDirective;
    }

    // Handle @on_... hooks
    if (name.startsWith('on_')) {
      let body = '';
      if (this.check('punctuation', '{')) {
        this.advance(); // {
        let braceDepth = 1;
        while (braceDepth > 0 && this.position < this.tokens.length) {
          const t = this.advance()!;
          if (t.value === '{') braceDepth++;
          if (t.value === '}') braceDepth--;
          if (braceDepth > 0) {
            const val = t.type === 'string' ? JSON.stringify(t.value) : t.value;
            body += val + ' ';
          } else if (braceDepth < 0) break; // Should not happen with valid syntax
        }
      } else {
        const t = this.advance();
        if (t) body = t.value;
      }
      return { type: 'lifecycle' as const, hook: name, body } as HSPlusLifecycleDirective;
    }

    // Default: handle as trait
    let config: Record<string, HoloScriptValue> = {};
    if (this.check('punctuation', '(')) {
      this.advance(); // (
      while (!this.check('punctuation', ')') && this.position < this.tokens.length) {
        const prop = this.parseProperty();
        if (prop) {
          config[prop.key] = prop.value;
        }
        if (this.check('punctuation', ',')) {
          this.advance();
        }
      }
      this.expect('punctuation', ')');
    } else if (this.check('punctuation', '{')) {
      config = this.parseObject() as Record<string, HoloScriptValue>;
    }

    return { type: 'trait' as const, name, config } as HSPlusTraitDirective;
  }

  /**
   * Parse @bindings { bind(expr) -> target.prop, ... }
   */
  private parseBindingsBlock(): Array<{ expression: string; target: string; property: string }> {
    const bindings: Array<{ expression: string; target: string; property: string }> = [];

    if (!this.check('punctuation', '{')) {
      return bindings;
    }
    this.advance(); // {

    while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
      this.skipNewlines();

      // Expect 'bind' keyword
      if (this.check('identifier') && this.currentToken()?.value === 'bind') {
        this.advance(); // bind

        // Parse expression in parentheses
        let expression = '';
        if (this.check('punctuation', '(')) {
          this.advance(); // (
          let parenDepth = 1;
          while (parenDepth > 0 && this.position < this.tokens.length) {
            const t = this.advance()!;
            if (t.value === '(') parenDepth++;
            if (t.value === ')') parenDepth--;
            if (parenDepth > 0) {
              expression += t.value + ' ';
            }
          }
          expression = expression.trim();
        }

        // Expect '->' arrow
        if (this.check('punctuation', '-')) {
          this.advance(); // -
          if (this.check('punctuation', '>')) {
            this.advance(); // >
          }
        }

        // Parse target.property
        const target = this.expectIdentifier() || '';
        let property = '';
        if (this.check('punctuation', '.')) {
          this.advance(); // .
          property = this.expectIdentifier() || '';
        }

        if (expression && target && property) {
          bindings.push({ expression, target, property });
        }
      } else {
        // Skip unknown token
        this.advance();
      }

      this.skipNewlines();
    }

    this.expect('punctuation', '}');
    return bindings;
  }

  // ============================================================================
  // Phase 7: AI Persistence Memory Syntax
  // ============================================================================

  /**
   * Parse memory primitive block
   * memory <Name> { semantic: SemanticMemory { ... }, episodic: EpisodicMemory { ... }, procedural: ProceduralMemory { ... } }
   *
   * Defers to the modular HoloScriptPersistenceParser
   */
  private parseMemory(): MemoryNode | null {
    return this.persistenceParser.parseMemory();
  }

  /**
   * Parse function declaration
   */
  private parseFunction(): MethodNode | null {
    this.expect('keyword', 'function');
    const name = this.expectIdentifier();
    if (!name) return null;

    const parameters: ParameterNode[] = [];
    let returnType: string | undefined;

    // Parse parameters
    if (this.check('punctuation', '(')) {
      this.advance(); // (

      while (!this.check('punctuation', ')') && this.position < this.tokens.length) {
        const paramName = this.expectIdentifier();
        if (!paramName) break;

        let paramType = 'any';
        if (this.check('punctuation', ':')) {
          this.advance(); // :
          paramType = this.expectIdentifier() || 'any';
        }

        parameters.push({
          type: 'parameter',
          name: paramName,
          dataType: paramType,
        });

        if (this.check('punctuation', ',')) {
          this.advance();
        }
      }

      this.expect('punctuation', ')');
    }

    // Parse return type
    if (this.check('punctuation', ':')) {
      this.advance();
      returnType = this.expectIdentifier() || undefined;
    }

    // Parse body
    const body: ASTNode[] = [];
    if (this.check('punctuation', '{')) {
      this.advance(); // {
      // Skip body parsing for now - just find closing brace
      let depth = 1;
      while (depth > 0 && this.position < this.tokens.length) {
        if (this.check('punctuation', '{')) depth++;
        if (this.check('punctuation', '}')) depth--;
        this.advance();
      }
    }

    return {
      type: 'method',
      name,
      parameters,
      body,
      returnType,
      position: { x: 0, y: 0, z: 0 },
      hologram: { shape: 'cube', color: '#ff6b35', size: 1.5, glow: true, interactive: true },
    };
  }

  /**
   * Parse connection
   */
  private parseConnection(): ConnectionNode | null {
    this.expect('keyword', 'connect');
    const from = this.expectIdentifier();
    if (!from) return null;

    this.expect('keyword', 'to');
    const to = this.expectIdentifier();
    if (!to) return null;

    let dataType = 'any';
    if (this.check('keyword', 'as')) {
      this.advance();
      const typeStr = this.currentToken();
      if (typeStr?.type === 'string' || typeStr?.type === 'identifier') {
        dataType = typeStr.value;
        this.advance();
      }
    }

    return {
      type: 'connection',
      from,
      to,
      dataType,
      bidirectional: false,
    };
  }

  /**
   * Parse scale block: scale <magnitude> { body }
   */
  private parseScale(): ScaleNode | null {
    this.expect('keyword', 'scale');
    const magnitude = this.expectIdentifier() || 'standard';

    const multipliers: Record<string, number> = {
      galactic: 1000000,
      macro: 1000,
      standard: 1,
      micro: 0.001,
      atomic: 0.000001,
    };

    const body: ASTNode[] = [];
    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        const node = this.parseDeclaration();
        if (node) body.push(node);
        this.skipNewlines();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'scale',
      magnitude,
      multiplier: multipliers[magnitude] || 1,
      body,
      position: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Parse focus block: focus <target> { body }
   */
  private parseFocus(): FocusNode | null {
    this.expect('keyword', 'focus');
    const target = this.expectIdentifier() || 'origin';

    const body: ASTNode[] = [];
    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        const node = this.parseDeclaration();
        if (node) body.push(node);
        this.skipNewlines();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'focus',
      target,
      body,
      position: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Parse environment declaration
   * Supports: environment { ... } or environment #id { ... }
   */
  private parseEnvironment(): EnvironmentNode | null {
    this.expect('keyword', 'environment');
    const settings: Record<string, HoloScriptValue> = {};
    let envId: string | undefined;

    // Check for #id syntax: environment #mainEnv { ... }
    if (this.check('punctuation', '#')) {
      this.advance(); // consume #
      envId = this.expectIdentifier() || undefined;
    }

    // Parse settings block { ... }
    if (this.check('punctuation', '{')) {
      this.advance(); // consume {

      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        if (this.check('punctuation', '}')) break;

        // Handle @directive syntax
        if (this.check('punctuation', '@')) {
          const directive = this.parseDirective();
          if (directive) {
            settings[`@${directive.type}`] = ((directive as any).args || (directive as any).config || []) as HoloScriptValue;
          }
          continue;
        }

        const prop = this.parseProperty();
        if (prop) {
          settings[prop.key] = prop.value;
        }
        this.skipNewlines();
      }

      this.expect('punctuation', '}');
    } else {
      // Legacy inline syntax: environment key value
      while (
        this.position < this.tokens.length &&
        this.currentToken()?.type !== 'newline' &&
        !this.check('punctuation', '}')
      ) {
        const key = this.expectIdentifier();
        if (!key) break;
        settings[key] = this.parseLiteral() as HoloScriptValue;
      }
    }

    if (envId) {
      settings['id'] = envId;
    }

    return {
      type: 'environment',
      settings,
    };
  }

  /**
   * Parse primitive 3D shape declaration
   * Supports: cylinder #id { ... }, sphere "name" { ... }, etc.
   */
  private parsePrimitive(): OrbNode | null {
    const startToken = this.currentToken();
    const primitiveType = startToken?.value || 'object';
    this.advance(); // consume the primitive keyword

    let name = '';
    let elementId: string | undefined;

    // Check for #id syntax: cylinder #platform { ... }
    if (this.check('punctuation', '#')) {
      this.advance(); // consume #
      elementId = this.expectIdentifier() || undefined;
      name = elementId || `${primitiveType}_${Date.now()}`;
    } else {
      // Check for string name: sphere "Ball" { ... }
      name = this.expectName() || `${primitiveType}_${Date.now()}`;
    }

    let template: string | undefined;
    if (this.check('keyword', 'using')) {
      this.advance();
      template = this.expectName() || undefined;
    }

    const properties: Record<string, HoloScriptValue> = {};
    const directives: HSPlusDirective[] = [];
    let position: SpatialPosition | undefined;

    // Parse properties block { ... }
    if (this.check('punctuation', '{')) {
      this.advance(); // consume {

      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        if (this.check('punctuation', '}')) break;

        if (this.check('punctuation', ',') || this.check('punctuation', ';')) {
          this.advance();
          continue;
        }

        const token = this.currentToken();
        if (token?.type === 'punctuation' && token.value === '@') {
          const directive = this.parseDirective();
          if (directive) directives.push(directive);
        } else {
          const prop = this.parseProperty();
          if (prop) {
            if (prop.key === 'position' || prop.key === 'at') {
              position = this.parsePosition(prop.value);
            } else {
              properties[prop.key] = prop.value;
            }
          } else {
            this.advance(); // skip unrecognized token
          }
        }

        this.skipNewlines();
      }

      this.expect('punctuation', '}');
    }

    // Store primitive type in properties
    properties['_primitiveType'] = primitiveType;
    if (elementId) {
      properties['id'] = elementId;
    }

    return {
      type: 'orb',
      name,
      position: position || { x: 0, y: 0, z: 0 },
      hologram: {
        shape: primitiveType as HologramShape,
        color: '#00d4ff',
        size: 1,
        glow: false,
        interactive: true,
      },
      properties,
      directives: directives as unknown as HSPlusDirective[],
      template,
      methods: [],
      children: [],
      line: startToken?.line || 0,
    };
  }

  /**
   * Parse zone declaration: zone "Name" { ... } or zone #id { ... }
   */
  private parseZone(): ZoneNode | null {
    this.expect('keyword', 'zone');

    let name = '';
    let zoneId: string | undefined;

    if (this.check('punctuation', '#')) {
      this.advance();
      zoneId = this.expectIdentifier() || undefined;
      name = zoneId || `zone_${Date.now()}`;
    } else {
      name = this.expectName() || `zone_${Date.now()}`;
    }

    const properties: Record<string, HoloScriptValue> = {};
    let position: SpatialPosition | undefined;

    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        if (this.check('punctuation', '}')) break;

        const prop = this.parseProperty();
        if (prop) {
          if (prop.key === 'position') {
            position = this.parsePosition(prop.value);
            // Also store in properties
            properties['position'] = prop.value;
          } else {
            properties[prop.key] = prop.value;
          }
        } else {
          // Fix: Advance if parseProperty failed to consume anything
          const token = this.currentToken();
          this.addError(
            this.createError(
              'HS004',
              `Unexpected token in zone: ${token?.type || 'unknown'}`,
              token
            )
          );
          this.advance();
        }

        this.skipNewlines();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'zone',
      name,
      id: zoneId,
      position,
      events: {}, // Events are stored in properties for now
      properties,
    };
  }

  /**
   * Parse composition block
   */
  private parseComposition(): CompositionNode | null {
    this.expect('keyword', 'composition');
    const name = this.expectName() || 'unnamed';

    const children: ASTNode[] = [];
    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        const node = this.parseDeclaration();
        if (node) children.push(node);
        this.skipNewlines();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'composition',
      name,
      children,
    };
  }

  /**
   * Parse template declaration
   */
  private parseTemplate(): TemplateNode | null {
    this.expect('keyword', 'template');
    const name = this.expectName() || 'template';

    let version: number | undefined;
    const params: string[] = [];
    if (this.check('punctuation', '(')) {
      this.advance();
      while (!this.check('punctuation', ')') && this.position < this.tokens.length) {
        const p = this.expectIdentifier();
        if (p) params.push(p);
        if (this.check('punctuation', ',')) this.advance();
      }
      this.expect('punctuation', ')');
    }

    const children: ASTNode[] = [];
    const migrations: MigrationNode[] = [];
    const directives: HSPlusDirective[] = [];
    const properties: Record<string, HoloScriptValue> = {};

    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();

        // Check for directives
        const token = this.currentToken();
        if (token?.type === 'punctuation' && token.value === '@') {
          // Special handling for @version to assign it to the node
          // But also keep it as a directive if needed
          const startPos = this.position;
          this.advance(); // @
          const dirName = this.expectIdentifier();

          if (dirName === 'version') {
            this.expect('punctuation', '(');
            const vStr = this.currentToken();
            if (vStr?.type === 'number') {
              version = parseInt(vStr.value, 10);
              this.advance();
            }
            this.expect('punctuation', ')');
            // Also add as a directive for completeness
            directives.push({ type: 'version' as const, version } as HSPlusVersionDirective);
            this.skipNewlines();
            continue;
          } else {
            // Backtrack and parse as standard directive
            this.position = startPos;
            const dir = this.parseDirective();
            if (dir) directives.push(dir);
            this.skipNewlines();
            continue;
          }
        }

        // Try parsing as a declaration (nested nodes)
        // Save position and error count so we can backtrack if parseDeclaration
        // consumes tokens without producing a useful node
        const startPos = this.position;
        const errorCount = this.errors.length;
        const node = this.parseDeclaration();
        if (node && node.type !== 'expression') {
          if (node.type === 'migration') {
            migrations.push(node as MigrationNode);
          } else {
            children.push(node);
          }
          this.skipNewlines();
          continue;
        }
        // Reset position and errors if parseDeclaration didn't produce a useful node
        this.position = startPos;
        this.errors.length = errorCount;

        // Try parsing as a property
        const prop = this.parseProperty();
        if (prop) {
          properties[prop.key] = prop.value;
          this.skipNewlines();
          continue;
        }

        // If we get here, valid token but unknown structure
        this.advance();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'template',
      name,
      parameters: params,
      children,
      properties,
      directives: directives as unknown as HSPlusDirective[],
      version,
      migrations,
    };
  }

  /**
   * Parse system declaration: system Name { state {}, on_start {}, action name() {}, ui {} }
   *
   * Systems are named trait+logic containers that auto-initialize within a composition.
   * They encapsulate state, lifecycle hooks, actions, and optional UI.
   *
   * Syntax:
   *   system TutorialSystem {
   *     state { currentStep: 0, completed: false }
   *     on_start { ... }
   *     on_update { ... }
   *     action next() { ... }
   *     action skip() { ... }
   *     ui { ... }
   *   }
   */
  private parseSystem(): SystemNode | null {
    this.expect('keyword', 'system');
    const name = this.expectName() || 'unnamed_system';

    const state: Record<string, HoloScriptValue> = {};
    const actions: Array<{ name: string; params: string[]; body: string }> = [];
    const hooks: Array<{ name: string; body: string }> = [];
    const directives: HSPlusDirective[] = [];
    const properties: Record<string, HoloScriptValue> = {};
    const children: ASTNode[] = [];
    const uiNodes: ASTNode[] = [];

    if (this.check('punctuation', '{')) {
      this.advance(); // {
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        if (this.check('punctuation', '}')) break;

        const token = this.currentToken();

        // Handle directives (@grabbable, @networked, etc.)
        if (token?.type === 'punctuation' && token.value === '@') {
          const directive = this.parseDirective();
          if (directive) directives.push(directive);
          this.skipNewlines();
          continue;
        }

        if (token?.type === 'keyword' || token?.type === 'identifier') {
          const val = token.value.toLowerCase();

          // state { ... }
          if (val === 'state') {
            this.advance();
            if (this.check('punctuation', '{')) {
              const stateObj = this.parseObject() as Record<string, HoloScriptValue>;
              Object.assign(state, stateObj);
            }
            this.skipNewlines();
            continue;
          }

          // action name(params) { body }
          if (val === 'action') {
            this.advance();
            const actionName = this.expectIdentifier();
            if (actionName) {
              const params: string[] = [];
              if (this.check('punctuation', '(')) {
                this.advance();
                while (!this.check('punctuation', ')') && this.position < this.tokens.length) {
                  const p = this.expectIdentifier();
                  if (p) params.push(p);
                  if (this.check('punctuation', ',')) this.advance();
                }
                this.expect('punctuation', ')');
              }
              const body = this.parseBlockBody();
              actions.push({ name: actionName, params, body });
            }
            this.skipNewlines();
            continue;
          }

          // on_start, on_update, on_destroy, on_event(...) — lifecycle hooks
          if (val.startsWith('on_')) {
            this.advance();
            const body = this.parseBlockBody();
            hooks.push({ name: val, body });
            this.skipNewlines();
            continue;
          }

          // ui { ... } — embedded UI block
          if (val === 'ui') {
            this.advance();
            if (this.check('punctuation', '{')) {
              this.advance();
              while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
                this.skipNewlines();
                const node = this.parseDeclaration();
                if (node) uiNodes.push(node);
                this.skipNewlines();
              }
              this.expect('punctuation', '}');
            }
            this.skipNewlines();
            continue;
          }

          // steps: [...], or other array/object properties
          // Try nested declaration first
          const startPos = this.position;
          const errorCount = this.errors.length;
          const node = this.parseDeclaration();
          if (node && node.type !== 'expression') {
            children.push(node);
            this.skipNewlines();
            continue;
          }
          // Reset position and errors if parseDeclaration didn't produce a useful node
          this.position = startPos;
          this.errors.length = errorCount;

          // Try as property
          const prop = this.parseProperty();
          if (prop) {
            properties[prop.key] = prop.value;
            this.skipNewlines();
            continue;
          }
        }

        // Skip unknown tokens to avoid infinite loop
        this.advance();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'system',
      id: name,
      properties,
      state: Object.keys(state).length > 0 ? state : undefined,
      actions: actions.length > 0 ? actions : undefined,
      hooks: hooks.length > 0 ? hooks : undefined,
      ui: uiNodes.length > 0 ? uiNodes : undefined,
      children: children.length > 0 ? children : undefined,
      directives: directives.length > 0 ? (directives as unknown as HSPlusDirective[]) : undefined,
    };
  }

  /**
   * Parse component declaration: component Name { props {}, state {}, ui {}, action name() {} }
   *
   * Components are UI-focused declarations with props, state, and render/ui blocks.
   *
   * Syntax:
   *   component MobileControls {
   *     props { visible: true, joystickSize: 120 }
   *     state { isMoving: false }
   *     ui { ... }
   *   }
   */
  private parseComponent(): ComponentNode | null {
    this.expect('keyword', 'component');
    const name = this.expectName() || 'unnamed_component';

    const props: Record<string, HoloScriptValue> = {};
    const state: Record<string, HoloScriptValue> = {};
    const actions: Array<{ name: string; params: string[]; body: string }> = [];
    const hooks: Array<{ name: string; body: string }> = [];
    const directives: HSPlusDirective[] = [];
    const properties: Record<string, HoloScriptValue> = {};
    const children: ASTNode[] = [];
    const uiNodes: ASTNode[] = [];

    if (this.check('punctuation', '{')) {
      this.advance(); // {
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        if (this.check('punctuation', '}')) break;

        const token = this.currentToken();

        // Handle directives
        if (token?.type === 'punctuation' && token.value === '@') {
          const directive = this.parseDirective();
          if (directive) directives.push(directive);
          this.skipNewlines();
          continue;
        }

        if (token?.type === 'keyword' || token?.type === 'identifier') {
          const val = token.value.toLowerCase();

          // props { ... }
          if (val === 'props') {
            this.advance();
            if (this.check('punctuation', '{')) {
              const propsObj = this.parseObject() as Record<string, HoloScriptValue>;
              Object.assign(props, propsObj);
            }
            this.skipNewlines();
            continue;
          }

          // state { ... }
          if (val === 'state') {
            this.advance();
            if (this.check('punctuation', '{')) {
              const stateObj = this.parseObject() as Record<string, HoloScriptValue>;
              Object.assign(state, stateObj);
            }
            this.skipNewlines();
            continue;
          }

          // action name(params) { body }
          if (val === 'action') {
            this.advance();
            const actionName = this.expectIdentifier();
            if (actionName) {
              const params: string[] = [];
              if (this.check('punctuation', '(')) {
                this.advance();
                while (!this.check('punctuation', ')') && this.position < this.tokens.length) {
                  const p = this.expectIdentifier();
                  if (p) params.push(p);
                  if (this.check('punctuation', ',')) this.advance();
                }
                this.expect('punctuation', ')');
              }
              const body = this.parseBlockBody();
              actions.push({ name: actionName, params, body });
            }
            this.skipNewlines();
            continue;
          }

          // on_* lifecycle hooks
          if (val.startsWith('on_')) {
            this.advance();
            const body = this.parseBlockBody();
            hooks.push({ name: val, body });
            this.skipNewlines();
            continue;
          }

          // ui { ... }
          if (val === 'ui') {
            this.advance();
            if (this.check('punctuation', '{')) {
              this.advance();
              while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
                this.skipNewlines();
                const node = this.parseDeclaration();
                if (node) uiNodes.push(node);
                this.skipNewlines();
              }
              this.expect('punctuation', '}');
            }
            this.skipNewlines();
            continue;
          }

          // Try nested declarations
          const startPos = this.position;
          const errorCount = this.errors.length;
          const node = this.parseDeclaration();
          if (node && node.type !== 'expression') {
            children.push(node);
            this.skipNewlines();
            continue;
          }
          // Reset position and errors if parseDeclaration didn't produce a useful node
          this.position = startPos;
          this.errors.length = errorCount;

          // Try as property
          const prop = this.parseProperty();
          if (prop) {
            properties[prop.key] = prop.value;
            this.skipNewlines();
            continue;
          }
        }

        this.advance();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'component',
      name,
      props: Object.keys(props).length > 0 ? props : undefined,
      state: Object.keys(state).length > 0 ? state : undefined,
      actions: actions.length > 0 ? actions : undefined,
      hooks: hooks.length > 0 ? hooks : undefined,
      ui: uiNodes.length > 0 ? uiNodes : undefined,
      children: children.length > 0 ? children : undefined,
      directives: directives.length > 0 ? (directives as unknown as HSPlusDirective[]) : undefined,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
    };
  }

  /**
   * Parse a block body { ... } — captures everything between braces as a string.
   * Used for action bodies and lifecycle hooks where we capture the raw body.
   */
  private parseBlockBody(): string {
    let body = '';
    if (this.check('punctuation', '{')) {
      this.advance(); // {
      let braceDepth = 1;
      while (braceDepth > 0 && this.position < this.tokens.length) {
        const t = this.advance()!;
        if (t.value === '{') braceDepth++;
        if (t.value === '}') braceDepth--;
        if (braceDepth > 0) {
          const val = t.type === 'string' ? JSON.stringify(t.value) : t.value;
          body += val + ' ';
        }
      }
    }
    return body.trim();
  }

  /**
   * Parse migration block: migrate from(n) { body }
   */
  private parseMigration(): MigrationNode | null {
    this.expect('keyword', 'migrate');
    this.expect('keyword', 'from');
    this.expect('punctuation', '(');

    let fromVersion = 0;
    const vStr = this.currentToken();
    if (vStr?.type === 'number') {
      fromVersion = parseInt(vStr.value, 10);
      this.advance();
    }
    this.expect('punctuation', ')');

    let body = '';
    if (this.check('punctuation', '{')) {
      this.advance(); // {
      let braceDepth = 1;
      const _startPos = this.position;

      while (braceDepth > 0 && this.position < this.tokens.length) {
        const t = this.advance()!;
        if (t.value === '{') braceDepth++;
        if (t.value === '}') braceDepth--;
        if (braceDepth > 0) {
          const val = t.type === 'string' ? JSON.stringify(t.value) : t.value;
          body += val + ' ';
        }
      }
      // Note: closing } is consumed
    }

    return {
      type: 'migration',
      fromVersion,
      body: body.trim(),
      position: { x: 0, y: 0, z: 0 },
    };
  }

  /**
   * Parse gate (conditional)
   */
  private parseGate(): GateNode | null {
    const isIf = this.check('keyword', 'if');
    if (isIf) {
      this.advance();
    } else {
      this.expect('keyword', 'gate');
      this.expectIdentifier(); // Gate name (consumed but not currently stored)
    }

    let condition = '';
    if (this.check('punctuation', '(')) {
      this.advance();
      // Parse condition expression
      while (!this.check('punctuation', ')') && this.position < this.tokens.length) {
        const token = this.currentToken();
        if (token) condition += token.value + ' ';
        this.advance();
      }
      this.expect('punctuation', ')');
    }

    // Parse body if present
    const truePath: ASTNode[] = [];
    if (this.check('punctuation', '{')) {
      this.advance(); // {

      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        const node = this.parseDeclaration();
        if (node) truePath.push(node);
        else this.advance();
      }

      this.expect('punctuation', '}');
    }

    // Parse else body if present
    const falsePath: ASTNode[] = [];
    if (this.check('keyword', 'else')) {
      this.advance();
      if (this.check('punctuation', '{')) {
        this.advance();
        while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
          const node = this.parseDeclaration();
          if (node) falsePath.push(node);
          else this.advance();
        }
        this.expect('punctuation', '}');
      } else {
        // Single statement else
        const node = this.parseDeclaration();
        if (node) falsePath.push(node);
      }
    }

    return {
      type: 'gate',
      condition: this.parseConditionExpression(condition.trim()),
      truePath: truePath,
      falsePath: falsePath,
      position: { x: 0, y: 0, z: 0 },
      hologram: { shape: 'pyramid', color: '#4ecdc4', size: 1, glow: true, interactive: true },
    };
  }

  /**
   * Parse return statement
   */
  private parseReturn(): ASTNode | null {
    this.expect('keyword', 'return');

    let expression = '';
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;

    // Collect until end of statement, respecting nesting
    while (this.position < this.tokens.length) {
      const t = this.currentToken();
      if (!t) break;

      if (t.type === 'newline' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) break;
      if (
        t.type === 'punctuation' &&
        t.value === ';' &&
        parenDepth === 0 &&
        braceDepth === 0 &&
        bracketDepth === 0
      )
        break;

      if (t.type === 'punctuation') {
        if (t.value === '(') parenDepth++;
        else if (t.value === ')') parenDepth--;
        else if (t.value === '{') braceDepth++;
        else if (t.value === '}') braceDepth--;
        else if (t.value === '[') bracketDepth++;
        else if (t.value === ']') bracketDepth--;
      }

      expression += t.value + ' ';
      this.advance();
    }

    return {
      type: 'return',
      value: expression.trim(), // Use 'value' to match runtime's executeReturn
      position: { x: 0, y: 0, z: 0 },
    } as unknown as ASTNode;
  }

  /**
   * Parse generic expression statement (e.g. function call or assignment)
   */
  private parseExpressionStatement(): ASTNode | null {
    let expression = '';
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;

    while (this.position < this.tokens.length) {
      const t = this.currentToken();
      if (!t) break;

      if (t.type === 'newline' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) break;
      if (
        t.type === 'punctuation' &&
        t.value === ';' &&
        parenDepth === 0 &&
        braceDepth === 0 &&
        bracketDepth === 0
      )
        break;

      if (t.type === 'punctuation') {
        if (t.value === '(') parenDepth++;
        else if (t.value === ')') parenDepth--;
        else if (t.value === '{') braceDepth++;
        else if (t.value === '}') braceDepth--;
        else if (t.value === '[') bracketDepth++;
        else if (t.value === ']') bracketDepth--;
      }

      expression += t.value + ' ';
      this.advance();
    }

    if (expression.trim().length === 0) {
      this.advance(); // Skip empty line/unknown
      return null;
    }

    return {
      type: 'expression-statement',
      expression: expression.trim(),
      position: { x: 0, y: 0, z: 0 },
    } as unknown as ASTNode;
  }

  /**
   * Parse stream
   */
  private parseStream(): StreamNode | null {
    this.expect('keyword', 'stream');
    const name = this.expectIdentifier();
    if (!name) return null;

    let source = 'unknown';
    if (this.check('keyword', 'from')) {
      this.advance();
      source = this.expectIdentifier() || 'unknown';
    }

    // Parse body if present
    if (this.check('punctuation', '{')) {
      this.advance();
      let depth = 1;
      while (depth > 0 && this.position < this.tokens.length) {
        if (this.check('punctuation', '{')) depth++;
        if (this.check('punctuation', '}')) depth--;
        this.advance();
      }
    }

    return {
      type: 'stream',
      name,
      source,
      transformations: [],
      position: { x: 0, y: 0, z: 0 },
      hologram: { shape: 'cylinder', color: '#45b7d1', size: 2, glow: true, interactive: true },
    };
  }

  /**
   * Parse nexus (multi-agent hub)
   */
  private parseNexus(): ASTNode | null {
    this.expect('keyword', 'nexus');
    const name = this.expectIdentifier();
    if (!name) return null;

    if (this.check('punctuation', '{')) {
      this.advance();
      let depth = 1;
      while (depth > 0 && this.position < this.tokens.length) {
        if (this.check('punctuation', '{')) depth++;
        if (this.check('punctuation', '}')) depth--;
        this.advance();
      }
    }

    return {
      type: 'nexus',
      position: { x: 0, y: 0, z: 0 },
      hologram: { shape: 'sphere', color: '#9b59b6', size: 3, glow: true, interactive: true },
    };
  }

  /**
   * Parse building (class-like)
   */
  private parseBuilding(): ASTNode | null {
    this.expect('keyword', 'building');
    const name = this.expectName();
    if (!name) return null;

    if (this.check('punctuation', '{')) {
      this.advance();
      let depth = 1;
      while (depth > 0 && this.position < this.tokens.length) {
        if (this.check('punctuation', '{')) depth++;
        if (this.check('punctuation', '}')) depth--;
        this.advance();
      }
    }

    return {
      type: 'building',
      position: { x: 0, y: 0, z: 0 },
      hologram: { shape: 'cube', color: '#e74c3c', size: 4, glow: true, interactive: true },
    };
  }

  /**
   * Parse a literal value (string, number, boolean, array, or object)
   */
  private parseLiteral(): unknown {
    const token = this.currentToken();
    if (!token) return null;

    if (token.type === 'string') {
      this.advance();
      return token.value;
    }

    if (token.type === 'number') {
      this.advance();
      return parseFloat(token.value);
    }

    if (token.type === 'identifier') {
      const val = token.value.toLowerCase();
      this.advance();
      if (val === 'true') return true;
      if (val === 'false') return false;
      if (val === 'null') return null;
      return token.value;
    }

    if (this.check('punctuation', '[')) {
      return this.parseArray();
    }

    if (this.check('punctuation', '{')) {
      return this.parseObject();
    }

    this.advance();
    return token.value;
  }

  /**
   * Parse a property (key: value)
   */
  private parseProperty(): { key: string; value: HoloScriptValue } | null {
    const key = this.expectIdentifier();
    if (!key) return null;

    if (!this.check('punctuation', ':')) {
      return { key, value: true }; // Flag-style property
    }

    this.advance(); // :

    const value = this.parseLiteral() as HoloScriptValue;

    return { key, value };
  }

  /**
   * Parse array [...]
   */
  private parseArray(): HoloScriptValue[] {
    const arr: HoloScriptValue[] = [];
    this.expect('punctuation', '[');

    while (!this.check('punctuation', ']') && this.position < this.tokens.length) {
      const token = this.currentToken();
      if (token?.type === 'string' || token?.type === 'number' || token?.type === 'identifier') {
        if (token.type === 'number') {
          arr.push(parseFloat(token.value));
        } else {
          arr.push(token.value);
        }
        this.advance();
      } else if (this.check('punctuation', ',')) {
        this.advance();
      } else {
        // Fix: Advance and report error to prevent infinite loop
        this.addError(
          this.createError('HS004', `Unexpected token in array: ${token?.type || 'unknown'}`, token)
        );
        this.advance();
      }
    }

    this.expect('punctuation', ']');
    return arr;
  }

  /**
   * Parse object {...}
   */
  public parseObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    this.expect('punctuation', '{');

    while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
      this.skipNewlines();
      if (this.check('punctuation', '}')) break;

      const prop = this.parseProperty();
      if (prop) {
        obj[prop.key] = prop.value;
      } else {
        // Fix: Advance if parseProperty failed to consume anything
        const token = this.currentToken();
        this.addError(
          this.createError(
            'HS004',
            `Unexpected token in object: ${token?.type || 'unknown'}`,
            token
          )
        );
        this.advance();
      }

      this.skipNewlines();
      if (this.check('punctuation', ',')) {
        this.advance();
      }
    }

    this.expect('punctuation', '}');
    return obj;
  }

  /**
   * Parse position from value
   */
  private parsePosition(value: unknown): SpatialPosition {
    if (Array.isArray(value)) {
      return {
        x: Number(value[0]) || 0,
        y: Number(value[1]) || 0,
        z: Number(value[2]) || 0,
      };
    }
    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;
      return {
        x: Number(v.x) || 0,
        y: Number(v.y) || 0,
        z: Number(v.z) || 0,
      };
    }
    return { x: 0, y: 0, z: 0 };
  }

  // Helper methods

  public currentToken(): Token | undefined {
    return this.tokens[this.position];
  }

  public advance(): Token | undefined {
    return this.tokens[this.position++];
  }

  public check(type: string, value?: string): boolean {
    const token = this.currentToken();
    if (!token) return false;
    if (token.type !== type) return false;
    if (value !== undefined && token.value.toLowerCase() !== value.toLowerCase()) return false;
    return true;
  }

  public expect(type: string, value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    const token = this.currentToken();

    // Build suggestion for keywords
    let suggestion: string | undefined;
    if (type === 'keyword' && value && token?.type === 'identifier') {
      const similar = this.findSimilarKeyword(token.value);
      if (similar) {
        suggestion = `Did you mean '${similar}'?`;
      }
    }

    this.addError(
      this.createError(
        type === 'keyword' ? 'HS001' : type === 'identifier' ? 'HS002' : 'HS003',
        `Expected ${type}${value ? ` '${value}'` : ''}, got ${token?.type || 'EOF'} '${token?.value || ''}'`,
        token,
        suggestion
      )
    );
    return false;
  }

  public expectIdentifier(): string | null {
    const token = this.currentToken();
    if (token && (token.type === 'identifier' || token.type === 'keyword')) {
      this.advance();
      return token.value;
    }
    this.addError(
      this.createError(
        'HS002',
        `Expected identifier, got ${token?.type || 'EOF'}`,
        token,
        token?.type === 'number' ? 'Identifiers cannot start with a number' : undefined
      )
    );
    return null;
  }

  /**
   * Expect an identifier OR a string literal for named declarations
   * Allows both: composition MyScene { } and composition "MyScene" { }
   */
  private expectName(): string | null {
    const token = this.currentToken();
    if (token?.type === 'identifier' || token?.type === 'keyword') {
      this.advance();
      return token.value;
    }
    if (token?.type === 'string') {
      this.advance();
      // Strip quotes from string value
      const val = token.value;
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        return val.slice(1, -1);
      }
      return val;
    }

    this.addError(
      this.createError(
        'HS002',
        `Expected name (identifier or string), got ${token?.type || 'EOF'}`,
        token
      )
    );
    return null;
  }

  /**
   * Parse animate command: animate target property: "..." from: 0 to: 1 duration: 1000
   */
  private parseAnimate(): ASTNode | null {
    this.expect('keyword', 'animate');
    const target = this.expectIdentifier();
    if (!target) return null;

    const properties: Record<string, HoloScriptValue> = {};

    // Parse inline properties
    while (this.position < this.tokens.length) {
      this.skipNewlines();
      const t = this.currentToken();
      if (
        !t ||
        t.type === 'newline' ||
        (t.type === 'keyword' && this.keywordSet.has(t.value.toLowerCase()))
      )
        break;

      const prop = this.parseProperty();
      if (prop) {
        properties[prop.key] = prop.value;
      } else {
        break;
      }
    }

    return {
      type: 'expression-statement',
      expression: `animate("${target}", ${JSON.stringify(properties)})`,
      position: { x: 0, y: 0, z: 0 },
    } as ASTNode;
  }

  /**
   * Parse modify command: modify target { prop: value }
   */
  private parseModify(): ASTNode | null {
    this.expect('keyword', 'modify');
    const target = this.expectIdentifier();
    if (!target) return null;

    const properties: Record<string, HoloScriptValue> = {};

    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        if (this.check('punctuation', '}')) break;

        const prop = this.parseProperty();
        if (prop) {
          properties[prop.key] = prop.value;
        }
        this.skipNewlines();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'expression-statement',
      expression: `modify("${target}", ${JSON.stringify(properties)})`,
      position: { x: 0, y: 0, z: 0 },
    } as ASTNode;
  }

  /**
   * Parse UI Element: ui2d dashboard#id { ... }
   */
  private parseUIElement(): ASTNode | null {
    const typeToken = this.currentToken();
    if (!typeToken) return null;

    const elementType = typeToken.value;
    this.advance();

    let elementId = `${elementType}_${Date.now()}`;

    // Check for ID syntax
    const token = this.currentToken();
    if (token?.type === 'punctuation' && token.value === '#') {
      this.advance();
      const idToken = this.currentToken();
      if (idToken) {
        elementId = idToken.value;
        this.advance();
      }
    } else if (token?.type === 'identifier' && token.value.startsWith('#')) {
      elementId = token.value.slice(1) || elementId;
      this.advance();
    }

    const properties: Record<string, HoloScriptValue> = {};

    if (this.check('punctuation', '{')) {
      this.advance();
      while (!this.check('punctuation', '}') && this.position < this.tokens.length) {
        this.skipNewlines();
        if (this.check('punctuation', '}')) break;

        const prop = this.parseProperty();
        if (prop) {
          properties[prop.key] = prop.value;
        }
        this.skipNewlines();
      }
      this.expect('punctuation', '}');
    }

    return {
      type: 'ui2d',
      name: elementType,
      properties: { id: elementId, ...properties },
      position: { x: 0, y: 0, z: 0 },
    } as ASTNode;
  }

  /**
   * Parse settings command: settings
   */
  private parseSettings(): ASTNode | null {
    this.expect('keyword', 'settings');
    return {
      type: 'expression-statement',
      expression: 'showSettings()',
      position: { x: 0, y: 0, z: 0 },
    } as ASTNode;
  }

  private parseChat(): ASTNode | null {
    this.expect('keyword', 'chat');
    return {
      type: 'expression-statement',
      expression: 'openChat()',
      position: { x: 0, y: 0, z: 0 },
    } as ASTNode;
  }

  /**
   * Parse a condition string into a structured TypeGuardExpression if applicable,
   * otherwise returns the string as-is.
   */
  private parseConditionExpression(condition: string): string | TypeGuardExpression {
    // Check for 'subject is "Type"' pattern
    const isPattern = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+is\s+["']([^"']+)["']$/;
    const match = condition.match(isPattern);

    if (match) {
      return {
        type: 'type-guard',
        subject: match[1],
        guardType: match[2],
        line: 0, // Simplified for now
        column: 0,
      } as TypeGuardExpression;
    }

    return condition;
  }

  public skipNewlines(): void {
    while (this.currentToken()?.type === 'newline') {
      this.advance();
    }
  }
}
