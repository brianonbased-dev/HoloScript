/**
 * HoloScript+ Parser
 *
 * Parses HoloScript+ source code into an AST with support for:
 * - Standard HoloScript syntax (backward compatible)
 * - @ directive parsing for VR traits, state, control flow
 * - Expression interpolation with ${...}
 * - TypeScript companion imports
 *
 * @version 1.0.0
 */

import type {
  ASTProgram,
  HSPlusDirective,
  HSPlusCompileResult,
  HSPlusParserOptions,
} from '../types/AdvancedTypeSystem';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { VRTraitName } from '../types';

export type {
  ASTProgram,
  HSPlusNode,
  HSPlusDirective,
  HSPlusCompileResult,
  HSPlusParserOptions,
  VRTraitName,
};

// =============================================================================
// TOKEN TYPES
// =============================================================================

type TokenType =
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'
  | 'LBRACE'
  | 'RBRACE'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LPAREN'
  | 'RPAREN'
  | 'COLON'
  | 'COMMA'
  | 'AT'
  | 'HASH'
  | 'DOT'
  | 'EQUALS'
  | 'ARROW'
  | 'PIPE'
  | 'EXPRESSION'
  | 'TEMPLATE_STRING'
  | 'COMMENT'
  | 'NEWLINE'
  | 'INDENT'
  | 'DEDENT'
  | 'STATE_MACHINE'
  | 'INITIAL'
  | 'STATE'
  | 'ON_ENTRY'
  | 'ON_EXIT'
  | 'TRANSITION'
  | 'SPREAD'
  | 'NULL_COALESCE'
  | 'NULL_COALESCE_ASSIGN'
  | 'QUESTION'
  | 'MATCH'
  | 'UNDERSCORE'
  | 'ON_ERROR'
  | 'ASSERT'
  | 'PLUS'
  | 'MINUS'
  | 'ASTERISK'
  | 'SLASH'
  | 'PERCENT'
  | 'EXCLAMATION'
  | 'AND'
  | 'OR'
  | 'DOUBLE_EQUALS'
  | 'NOT_EQUALS'
  | 'LESS_THAN'
  | 'GREATER_THAN'
  | 'LESS_EQUAL'
  | 'GREATER_EQUAL'
  | 'OPTIONAL_DOT'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  offset: number;
}

// =============================================================================
// SHARED CONSTANTS
// =============================================================================

import { VR_TRAITS, LIFECYCLE_HOOKS, STRUCTURAL_DIRECTIVES } from '../constants';
import { ChunkDetector } from './ChunkDetector';
import { ParseCache, globalParseCache } from './ParseCache';
import {
  RichParseError,
  createRichError,
  createTraitError,
  findSimilarKeyword,
  type ErrorCode as RichErrorCode,
} from './RichErrors';
import {
  ErrorRecovery,
  enrichErrorWithSuggestions,
  generateQuickFixes,
  type ParseError,
  type QuickFix,
  type ErrorCode as ErrorRecoveryErrorCode,
} from './ErrorRecovery';

// =============================================================================
// LEXER
// =============================================================================

class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private indentStack: number[] = [0];
  private tokens: Token[] = [];
  private pendingDedents: number = 0;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      // Handle pending dedents
      while (this.pendingDedents > 0) {
        this.tokens.push(this.createToken('DEDENT', ''));
        this.pendingDedents--;
      }

      const char = this.source[this.pos];

      // Skip whitespace (but track indentation at line start)
      if (char === ' ' || char === '\t') {
        if (this.column === 1) {
          this.handleIndentation();
        } else {
          this.advance();
        }
        continue;
      }

      // Comments
      if (char === '/' && this.peek(1) === '/') {
        this.skipLineComment();
        continue;
      }

      // Newlines
      if (char === '\n') {
        this.advance();
        this.tokens.push(this.createToken('NEWLINE', '\n'));
        this.line++;
        this.column = 1;
        continue;
      }
      if (char === '\r') {
        const startOff = this.pos;
        this.advance();
        if (this.peek() === '\n') {
          this.advance();
        }
        const token = this.createToken('NEWLINE', '\n');
        token.offset = startOff;
        this.tokens.push(token);
        this.line++;
        this.column = 1;
        continue;
      }

      // Symbols
      if (char === '{') {
        this.advance();
        this.tokens.push(this.createToken('LBRACE', '{'));
        continue;
      }
      if (char === '}') {
        this.advance();
        this.tokens.push(this.createToken('RBRACE', '}'));
        continue;
      }
      if (char === '[') {
        this.advance();
        this.tokens.push(this.createToken('LBRACKET', '['));
        continue;
      }
      if (char === ']') {
        this.advance();
        this.tokens.push(this.createToken('RBRACKET', ']'));
        continue;
      }
      if (char === '(') {
        this.advance();
        this.tokens.push(this.createToken('LPAREN', '('));
        continue;
      }
      if (char === ')') {
        this.advance();
        this.tokens.push(this.createToken('RPAREN', ')'));
        continue;
      }
      if (char === ':') {
        this.advance();
        this.tokens.push(this.createToken('COLON', ':'));
        continue;
      }
      if (char === ',') {
        this.advance();
        this.tokens.push(this.createToken('COMMA', ','));
        continue;
      }
      if (char === '@') {
        this.advance();
        this.tokens.push(this.createToken('AT', '@'));
        continue;
      }
      if (char === '#') {
        this.advance();
        this.tokens.push(this.createToken('HASH', '#'));
        continue;
      }
      if (char === '.') {
        if (this.peek(1) === '.' && this.peek(2) === '.') {
          const startCol = this.column;
          this.advance(); // .
          this.advance(); // .
          this.advance(); // .
          this.tokens.push(this.createToken('SPREAD', '...'));
          this.tokens[this.tokens.length - 1].column = startCol;
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('DOT', '.'));
        continue;
      }
      if (char === '+') {
        this.advance();
        this.tokens.push(this.createToken('PLUS', '+'));
        continue;
      }
      if (char === '-') {
        if (this.peek(1) === '>') {
          const startCol = this.column;
          this.advance(); // -
          this.advance(); // >
          this.tokens.push(this.createToken('ARROW', '->'));
          this.tokens[this.tokens.length - 1].column = startCol;
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('MINUS', '-'));
        continue;
      }
      if (char === '*') {
        this.advance();
        this.tokens.push(this.createToken('ASTERISK', '*'));
        continue;
      }
      if (char === '/') {
        if (this.peek(1) === '*') {
          this.skipBlockComment();
          continue;
        }
        if (this.peek(1) === '/') {
          this.skipLineComment();
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('SLASH', '/'));
        continue;
      }
      if (char === '%') {
        this.advance();
        this.tokens.push(this.createToken('PERCENT', '%'));
        continue;
      }
      if (char === '!') {
        if (this.peek(1) === '=') {
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // !
          this.advance(); // =
          this.tokens.push(this.createToken('NOT_EQUALS', '!='));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('EXCLAMATION', '!'));
        continue;
      }
      if (char === '=') {
        if (this.peek(1) === '>') {
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // =
          this.advance(); // >
          this.tokens.push(this.createToken('ARROW', '=>'));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        if (this.peek(1) === '=') {
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // =
          this.advance(); // =
          this.tokens.push(this.createToken('DOUBLE_EQUALS', '=='));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('EQUALS', '='));
        continue;
      }
      if (char === '<') {
        if (this.peek(1) === '=') {
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // <
          this.advance(); // =
          this.tokens.push(this.createToken('LESS_EQUAL', '<='));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('LESS_THAN', '<'));
        continue;
      }
      if (char === '>') {
        if (this.peek(1) === '=') {
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // >
          this.advance(); // =
          this.tokens.push(this.createToken('GREATER_EQUAL', '>='));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('GREATER_THAN', '>'));
        continue;
      }
      if (char === '-') {
        if (this.peek(1) === '>') {
          const startCol = this.column;
          this.advance(); // -
          this.advance(); // >
          this.tokens.push(this.createToken('ARROW', '->'));
          this.tokens[this.tokens.length - 1].column = startCol;
          continue;
        }
      }
      if (char === '&') {
        if (this.peek(1) === '&') {
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // &
          this.advance(); // &
          this.tokens.push(this.createToken('AND', '&&'));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        this.advance(); // unknown single & — skip
        continue;
      }
      if (char === '|') {
        if (this.peek(1) === '|') {
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // |
          this.advance(); // |
          this.tokens.push(this.createToken('OR', '||'));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('PIPE', '|'));
        continue;
      }

      // Strings
      if (char === '"' || char === "'") {
        this.tokens.push(this.readString(char));
        continue;
      }

      // Numbers
      if (this.isDigit(char) || (char === '-' && this.isDigit(this.peek(1)))) {
        this.tokens.push(this.readNumber());
        continue;
      }

      // Question marks (??, ??=, ?., ?)
      if (char === '?') {
        if (this.peek(1) === '?') {
          if (this.peek(2) === '=') {
            const startCol = this.column;
            const startOff = this.pos;
            this.advance(); // ?
            this.advance(); // ?
            this.advance(); // =
            this.tokens.push(this.createToken('NULL_COALESCE_ASSIGN', '??='));
            this.tokens[this.tokens.length - 1].column = startCol;
            this.tokens[this.tokens.length - 1].offset = startOff;
            continue;
          }
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // ?
          this.advance(); // ?
          this.tokens.push(this.createToken('NULL_COALESCE', '??'));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        // Optional chaining ?.
        if (this.peek(1) === '.') {
          const startCol = this.column;
          const startOff = this.pos;
          this.advance(); // ?
          this.advance(); // .
          this.tokens.push(this.createToken('OPTIONAL_DOT', '?.'));
          this.tokens[this.tokens.length - 1].column = startCol;
          this.tokens[this.tokens.length - 1].offset = startOff;
          continue;
        }
        this.advance();
        this.tokens.push(this.createToken('QUESTION', '?'));
        continue;
      }

      // Template strings (backtick)
      if (char === '`') {
        this.tokens.push(this.readTemplateString());
        continue;
      }

      // Identifiers and keywords
      if (this.isIdentifierStart(char)) {
        this.tokens.push(this.readIdentifier());
        continue;
      }

      // Unknown character - skip
      this.advance();
    }

    // Handle remaining dedents
    while (this.indentStack.length > 1) {
      this.tokens.push(this.createToken('DEDENT', ''));
      this.indentStack.pop();
    }

    this.tokens.push(this.createToken('EOF', ''));
    return this.tokens;
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    this.column++;
    return char;
  }

  private peek(offset: number = 0): string {
    const pos = this.pos + offset;
    return pos < this.source.length ? this.source[pos] : '';
  }

  private createToken(type: TokenType, value: string): Token {
    const token = {
      type,
      value,
      line: this.line,
      column: this.column - (value.length || 0),
      offset: this.pos - (value.length || 0),
    };
    // console.log(`[DEBUG_LEX] Token: ${type} "${value}" at ${token.line}:${token.column}`);
    return token;
  }

  private handleIndentation(): void {
    let indent = 0;
    while (this.peek() === ' ' || this.peek() === '\t') {
      indent += this.peek() === '\t' ? 4 : 1;
      this.advance();
    }

    if (this.peek() === '\n' || this.peek() === '\r') {
      return;
    }

    const currentIndent = this.indentStack[this.indentStack.length - 1];

    if (indent > currentIndent) {
      this.indentStack.push(indent);
      this.tokens.push(this.createToken('INDENT', ''));
    } else if (indent < currentIndent) {
      while (
        this.indentStack.length > 1 &&
        indent < this.indentStack[this.indentStack.length - 1]
      ) {
        this.indentStack.pop();
        this.pendingDedents++;
      }
    }
  }

  private skipLineComment(): void {
    while (this.peek() !== '\n' && this.pos < this.source.length) {
      this.advance();
    }
  }

  private skipBlockComment(): void {
    this.advance(); // /
    this.advance(); // *
    while (this.pos < this.source.length) {
      if (this.peek() === '*' && this.peek(1) === '/') {
        this.advance();
        this.advance();
        break;
      }
      if (this.peek() === '\n') {
        this.line++;
        this.column = 0;
      }
      this.advance();
    }
  }

  private readString(quote: string): Token {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // Opening quote
    let value = '';

    while (this.peek() !== quote && this.pos < this.source.length) {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case 'n':
            value += '\n';
            break;
          case 't':
            value += '\t';
            break;
          case 'r':
            value += '\r';
            break;
          case '\\':
            value += '\\';
            break;
          case '"':
            value += '"';
            break;
          case "'":
            value += "'";
            break;
          default:
            value += escaped;
        }
      } else if (this.peek() === '\n') {
        this.line++;
        this.column = 0;
        value += this.advance();
      } else {
        value += this.advance();
      }
    }

    this.advance(); // Closing quote
    const token = {
      type: 'STRING' as TokenType,
      value,
      line: startLine,
      column: startColumn,
      offset: this.pos - (value.length + 2), // approximation for start of string
    };
    return token;
  }

  private readTemplateString(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    const startOff = this.pos;
    this.advance(); // consume opening backtick

    let value = '';
    let braceDepth = 0;

    while (this.pos < this.source.length) {
      const c = this.source[this.pos];

      if (c === '`' && braceDepth === 0) {
        this.advance(); // consume closing backtick
        break;
      }
      if (c === '$' && this.peek(1) === '{') {
        braceDepth++;
        value += '${';
        this.advance(); // $
        this.advance(); // {
        continue;
      }
      if (c === '{' && braceDepth > 0) {
        braceDepth++;
        value += c;
        this.advance();
        continue;
      }
      if (c === '}' && braceDepth > 0) {
        braceDepth--;
        value += c;
        this.advance();
        continue;
      }
      if (c === '\n') {
        this.line++;
        this.column = 0;
      }
      value += c;
      this.advance();
    }

    return {
      type: 'TEMPLATE_STRING' as TokenType,
      value,
      line: startLine,
      column: startColumn,
      offset: startOff,
    };
  }

  private readNumber(): Token {
    const startColumn = this.column;
    let value = '';

    if (this.peek() === '-') {
      value += this.advance();
    }

    while (this.isDigit(this.peek())) {
      value += this.advance();
    }

    if (this.peek() === '.' && this.isDigit(this.peek(1))) {
      value += this.advance(); // .
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // Scientific notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }
      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // Unit suffix
    while (this.isAlpha(this.peek()) || this.peek() === '%') {
      value += this.advance();
    }

    const token = {
      type: 'NUMBER' as TokenType,
      value,
      line: this.line,
      column: startColumn,
      offset: this.pos - value.length,
    };
    return token;
  }

  private readExpression(): Token {
    const startLine = this.line;
    const startColumn = this.column;
    this.advance(); // $
    this.advance(); // {

    let value = '';
    let braceDepth = 1;

    while (braceDepth > 0 && this.pos < this.source.length) {
      if (this.peek() === '{') {
        braceDepth++;
      } else if (this.peek() === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          break;
        }
      }
      if (this.peek() === '\n') {
        this.line++;
        this.column = 0;
      }
      value += this.advance();
    }

    this.advance(); // Closing }

    return {
      type: 'EXPRESSION' as TokenType,
      value: value.trim(),
      line: startLine,
      column: startColumn,
      offset: this.pos - (value.length + 3), // ${...}
    };
  }

  private readIdentifier(): Token {
    const startColumn = this.column;
    let value = '';

    while (this.isIdentifierPart(this.peek())) {
      value += this.advance();
    }

    if (value === 'true' || value === 'false') {
      return {
        type: 'BOOLEAN',
        value,
        line: this.line,
        column: startColumn,
        offset: this.pos - value.length,
      };
    }
    if (value === 'null' || value === 'none') {
      return {
        type: 'NULL',
        value,
        line: this.line,
        column: startColumn,
        offset: this.pos - value.length,
      };
    }

    const token = {
      type: 'IDENTIFIER' as TokenType,
      value,
      line: this.line,
      column: startColumn,
      offset: this.pos - value.length,
    };

    // Check for keywords
    switch (value) {
      case 'state_machine':
        token.type = 'STATE_MACHINE';
        break;
      case 'initial':
        token.type = 'INITIAL';
        break;
      case 'state':
        token.type = 'STATE';
        break;
      case 'on_entry':
        token.type = 'ON_ENTRY';
        break;
      case 'on_exit':
        token.type = 'ON_EXIT';
        break;
      case 'transition':
        token.type = 'TRANSITION';
        break;
      case 'match':
        token.type = 'MATCH';
        break;
      case 'on_error':
        token.type = 'ON_ERROR';
        break;
      case 'assert':
        token.type = 'ASSERT';
        break;
      case '_':
        token.type = 'UNDERSCORE';
        break;
    }

    return token;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }

  private isIdentifierStart(char: string): boolean {
    return this.isAlpha(char) || char === '_' || char === '$';
  }

  private isIdentifierPart(char: string): boolean {
    return this.isIdentifierStart(char) || this.isDigit(char) || char === '-';
  }
}

// =============================================================================
// PARSER
// =============================================================================

export class HoloScriptPlusParser {
  private tokens: Token[] = [];
  private pos: number = 0;
  private options: HSPlusParserOptions;
  private source: string = '';
  private errors: RichParseError[] = [];
  private warnings: RichParseError[] = [];
  private imports: Array<{
    path: string;
    alias: string;
    namedImports?: string[];
    isWildcard?: boolean;
  }> = [];
  private hasState: boolean = false;
  private hasVRTraits: boolean = false;
  private hasControlFlow: boolean = false;
  private compiledExpressions: Map<string, string> = new Map();
  private errorRecovery: ErrorRecovery = new ErrorRecovery();

  constructor(options: HSPlusParserOptions = {}) {
    this.options = {
      enableVRTraits: true,
      enableTypeScriptImports: true,
      strict: false,
      ...options,
    };
  }

  /**
   * Get quick fixes for all errors in the last parse
   * Useful for IDE integrations and LSP
   */
  getQuickFixes(): Map<number, QuickFix[]> {
    const fixes = new Map<number, QuickFix[]>();
    for (const error of this.errors) {
      const errorFixes = generateQuickFixes(
        {
          code: error.code as unknown as ErrorRecoveryErrorCode,
          message: error.message,
          line: error.line,
          column: error.column,
          source: this.source,
        },
        this.source
      );
      if (errorFixes.length > 0) {
        fixes.set(error.line, errorFixes);
      }
    }
    return fixes;
  }

  /**
   * Get enriched errors with additional suggestions from ErrorRecovery
   */
  getEnrichedErrors(): ParseError[] {
    return this.errors.map((error) =>
      enrichErrorWithSuggestions(
        {
          code: error.code as unknown as ErrorRecoveryErrorCode,
          message: error.message,
          line: error.line,
          column: error.column,
          source: this.source,
        },
        this.source
      )
    );
  }

  parse(source: string): HSPlusCompileResult {
    // Reset state
    this.source = source;
    this.errors = [];
    this.warnings = [];
    this.imports = [];
    this.hasState = false;
    this.hasVRTraits = false;
    this.hasControlFlow = false;
    this.compiledExpressions = new Map();
    this.pos = 0;
    this.errorRecovery.clear();

    // Tokenize
    const lexer = new Lexer(source);
    this.tokens = lexer.tokenize();

    // Parse root node
    const root = this.parseDocument();

    // Build AST
    return this.buildResult(root);
  }

  /**
   * Performs an incremental parse using cached nodes for unchanged chunks
   */
  parseIncremental(source: string, cache: ParseCache = globalParseCache): HSPlusCompileResult {
    const _startTime = Date.now();
    this.source = source;
    this.errors = [];
    this.warnings = [];
    this.imports = [];
    this.hasState = false;
    this.hasVRTraits = false;
    this.hasControlFlow = false;
    this.compiledExpressions = new Map();

    // 1. Detect chunks
    const chunks = ChunkDetector.detect(source);
    const topLevelNodes: HSPlusNode[] = [];
    const globalDirectives: HSPlusDirective[] = [];

    for (const chunk of chunks) {
      const hash = ParseCache.hash(chunk.content);
      const cachedNode = cache.get(chunk.id, hash);

      if (cachedNode) {
        // Reuse cached node
        topLevelNodes.push(cachedNode);
        // Directives are already attached to the node
      } else {
        // Must re-parse this chunk
        const chunkResult = this.parse(chunk.content);
        const chunkAst = chunkResult.ast as ASTProgram | undefined;
        const chunkFeatures = chunkResult.features as
          | { state: boolean; vrTraits: boolean; loops: boolean; conditionals: boolean }
          | undefined;
        if (chunkAst?.root) {
          const node = chunkAst.root as HSPlusNode;
          // Sync line numbers for the chunk node (naive)
          this.offsetNodeLoc(node, chunk.startLine - 1);

          topLevelNodes.push(node);
          // @ts-expect-error
          cache.set(chunk.id, hash, node);

          // Merge metadata
          this.hasState = this.hasState || !!chunkFeatures?.state;
          this.hasVRTraits = this.hasVRTraits || !!chunkFeatures?.vrTraits;
          this.hasControlFlow =
            this.hasControlFlow || !!chunkFeatures?.loops || !!chunkFeatures?.conditionals;
          this.imports.push(...chunkAst.imports);
        }
        this.errors.push(...(chunkResult.errors as RichParseError[]));
        this.warnings.push(...((chunkResult.warnings || []) as RichParseError[]));
      }
    }

    // 2. Build result from top-level nodes
    const root: HSPlusNode = {
      type: 'fragment',
      id: 'root',
      properties: {},
      directives: globalDirectives,
      children: topLevelNodes,
      traits: new Map(),
      loc: {
        start: { line: 1, column: 1 },
        end: { line: chunks.length > 0 ? chunks[chunks.length - 1].endLine : 1, column: 1 },
      },
      body: topLevelNodes,
    } as unknown as HSPlusNode;

    const result = this.buildResult(root);
    // console.log(`[DEBUG_PERF] Incremental parse took ${Date.now() - startTime}ms`);
    return result;
  }

  private buildResult(root: HSPlusNode): HSPlusCompileResult {
    const isFragment = root.type === 'fragment';
    const directives = root.directives || [];

    // Extract version and migrations from directives
    let version: string | number | undefined;
    const migrations: Array<{ type: string; fromVersion: number; body: string }> = [];

    for (const d of directives) {
      if (d.type === 'version') {
        version = d.version;
      } else if (d.type === 'migrate') {
        migrations.push({
          type: 'Migration',
          fromVersion: d.fromVersion,
          body: d.body,
        });
      }
    }

    // Default to '1.0' if not specified
    if (version === undefined) version = '1.0';

    const ast: ASTProgram = {
      type: 'Program',
      id: 'root',
      properties: isFragment ? root.properties || {} : {},
      directives: directives,
      children: isFragment ? root.children || [] : [root],
      traits: isFragment ? root.traits || new Map() : new Map(),
      loc: root.loc,
      body: (isFragment ? root.children || [] : [root]) as unknown as HSPlusNode[],
      version: version,
      migrations: migrations.length > 0 ? migrations : undefined,
      root,
      imports: this.imports,
      hasState: this.hasState,
      hasVRTraits: this.hasVRTraits,
      hasControlFlow: this.hasControlFlow,
    } as unknown as ASTProgram;

    return {
      success: this.errors.length === 0,
      ast,
      compiledExpressions: this.compiledExpressions,
      requiredCompanions: this.imports.map((i) => i.path),
      features: {
        state: this.hasState,
        vrTraits: this.hasVRTraits,
        loops: this.hasControlFlow,
        conditionals: this.hasControlFlow,
        lifecycleHooks: (root.directives || []).some((d) => d.type === 'lifecycle'),
      },
      warnings: this.warnings,
      errors: this.errors,
    };
  }

  private offsetNodeLoc(node: HSPlusNode, lineOffset: number) {
    if (node.loc) {
      if (node.loc.start) node.loc.start.line += lineOffset;
      if (node.loc.end) node.loc.end.line += lineOffset;
    }
    if (node.children) {
      node.children.forEach((child) => this.offsetNodeLoc(child, lineOffset));
    }
    if (node.body && Array.isArray(node.body)) {
      node.body.forEach((child) => this.offsetNodeLoc(child, lineOffset));
    }
  }

  private parseDocument(): HSPlusNode {
    this.skipNewlines();

    const topLevelNodes: HSPlusNode[] = [];
    const globalDirectives: HSPlusDirective[] = [];

    while (!this.check('EOF')) {
      const currentDirectives: HSPlusDirective[] = [];

      // 1. Collect directives
      try {
        while (this.check('AT')) {
          const directive = this.parseDirective();
          if (directive) {
            const { type } = directive;
            if (
              type === 'version' ||
              type === 'migrate' ||
              type === 'import' ||
              type === 'export'
            ) {
              globalDirectives.push(directive);
              // @export also goes to currentDirectives so it's attached to the following node
              if (type === 'export') {
                currentDirectives.push(directive);
              }
            } else {
              currentDirectives.push(directive);
            }
          }
          this.skipNewlines();
        }

        // 2. Parse node if present
        const isNodeStart =
          this.check('IDENTIFIER') ||
          this.check('STATE_MACHINE') ||
          this.check('STATE') ||
          this.check('TRANSITION') ||
          this.check('INITIAL');

        if (isNodeStart) {
          const node = this.parseNode();
          // Attach preceding directives to this node
          const existingDirectives = node.directives || [];
          node.directives = [...currentDirectives, ...existingDirectives];

          // Extract @version and @migrate directives into template properties
          if (node.type === 'template') {
            for (const d of currentDirectives) {
              if (d.type === 'version') {
                node.version = d.version;
              } else if (d.type === 'migrate') {
                if (!node.migrations) node.migrations = [];
                node.migrations.push({
                  type: 'Migration',
                  fromVersion: d.fromVersion,
                  body: d.body,
                });
              }
            }
          }

          topLevelNodes.push(node);
        } else {
          // If directives with no node, handle as global or fragment
          if (currentDirectives.length > 0) {
            if (this.check('EOF')) {
              globalDirectives.push(...currentDirectives);
            } else {
              // Unexpected token after directives, report and sync
              this.error(
                `Expected node after directives, got ${this.current().type}. Valid nodes: orb, template, logic, object, composition, scene, group`,
                'HSP003'
              );
              globalDirectives.push(...currentDirectives);
              // Not strictly needing full sync here as we handle it, but good practice if error throws
            }
          } else if (!this.check('EOF')) {
            // No directives, no node, but not EOF
            this.error(
              `Unexpected token ${this.current().type} "${this.current().value}" at top level. Expected: composition, object, template, logic, or @directive`,
              'HSP001'
            );
            // error() pushes to array, but does NOT throw by default yet.
            // We need to throw to trigger recovery.
            throw new Error('ParseError');
          }
        }

        // 3. Special Handling for Natural Language "connect" statement
        // connect A to B
        if (this.check('IDENTIFIER') && this.current().value === 'connect') {
          const connection = this.parseConnectionStatement();
          // connections aren't nodes, but we can treat them as a data node
          const node: HSPlusNode = {
            type: 'connection',
            properties: connection,
            directives: [],
            children: [],
            traits: new Map(),
            loc: {
              start: { line: this.current().line, column: 0 },
              end: { line: this.current().line, column: 0 },
            },
          } as unknown as HSPlusNode;
          topLevelNodes.push(node);
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage !== 'ParseError' && errorMessage !== 'Unexpected token') {
          console.error(e); // Log unexpected runtime errors
        }
        this.synchronize();
      }
      this.skipNewlines();
    }

    // If we have multiple nodes or global directives, return a fragment
    if (topLevelNodes.length === 1 && globalDirectives.length === 0) {
      return topLevelNodes[0];
    }

    return {
      type: 'fragment',
      id: 'root',
      properties: {},
      directives: globalDirectives,
      children: topLevelNodes,
      traits: new Map(),
      loc: {
        start: { line: 1, column: 1 },
        end: { line: this.current().line, column: this.current().column },
      },
      body: topLevelNodes,
    } as unknown as HSPlusNode;
  }

  private parseNode(): HSPlusNode {
    const startToken = this.current();

    const typeToken =
      this.match([
        'IDENTIFIER',
        'STATE_MACHINE',
        'STATE',
        'TRANSITION',
        'INITIAL',
        'ON_ENTRY',
        'ON_EXIT',
      ]) || this.expect('IDENTIFIER', 'Expected element type');
    const type = typeToken.value;

    // =========================================================================
    // Special handling for logic blocks
    // =========================================================================

    // =========================================================================
    // Special handling for template definitions
    // =========================================================================
    if (type === 'template') {
      const templateName = this.expect('STRING', 'Expected template name').value;
      const templateBody = this.parseBlockContent();

      let version: number | undefined;
      const migrations: Array<{ type: string; fromVersion: number; body: string }> = [];
      const directives: HSPlusDirective[] = [];
      const children: unknown[] = [];

      // Extract from directives and children inside the template block
      for (const [key, value] of Object.entries(templateBody)) {
        if (key === '@version') {
          const v = value as HSPlusDirective;
          if (v.type === 'version') version = v.version;
          delete templateBody[key];
        } else if (key === '@migrate') {
          const m = value as HSPlusDirective;
          if (m.type === 'migrate') {
            migrations.push({
              type: 'Migration',
              fromVersion: m.fromVersion,
              body: m.body,
            });
          }
          delete templateBody[key];
        } else if (key.startsWith('@')) {
          directives.push(value as HSPlusDirective);
          delete templateBody[key];
        } else if (typeof value === 'object' && value && 'type' in value) {
          children.push(value);
          delete templateBody[key];
        }
      }

      return {
        type: 'template',
        name: templateName,
        properties: templateBody, // Now contains only true properties
        version,
        migrations,
        directives,
        children,
        traits: new Map(),
        loc: {
          start: { line: startToken.line, column: startToken.column },
          end: { line: this.current().line, column: this.current().column },
        },
      } as unknown as HSPlusNode;
    }

    // =========================================================================
    // Special handling for Logic blocks
    // =========================================================================
    if (type === 'logic') {
      const logicBody = this.parseLogicBlock();
      return {
        type: 'logic',
        name: 'logic',
        id: 'logic',
        properties: {},
        directives: [],
        children: [],
        traits: new Map(),
        body: logicBody,
        loc: {
          start: { line: startToken.line, column: startToken.column },
          end: { line: this.current().line, column: this.current().column },
        },
      } as unknown as HSPlusNode;
    }

    // =========================================================================
    // Special handling for code blocks (module, script, struct, enum, action, function, on)
    // =========================================================================
    if (
      [
        'module',
        'script',
        'struct',
        'enum',
        'class',
        'interface',
        'action',
        'function',
        'async',
        'on',
      ].includes(type)
    ) {
      let name = 'anonymous';
      // Parse name locally since 'id' variable is not yet initialized/parsed
      if (this.check('IDENTIFIER')) {
        name = this.advance().value;
      } else if (this.check('STRING')) {
        name = this.advance().value;
      }

      // Handle dotted event names: on topic.message, on message.request_vote
      while (this.check('DOT')) {
        this.advance(); // consume .
        if (this.check('IDENTIFIER')) this.advance(); // consume member name
      }

      // Skip parameter list for function-like types: action name(params) { }
      if (this.check('LPAREN')) {
        this.skipParens();
      }

      // Use Raw Block parsing
      let bodyContent = '';
      if (this.check('LBRACE')) {
        bodyContent = this.parseRawBlock();
      }

      return {
        type: type,
        name: name,
        id: name,
        properties: {},
        directives: [],
        children: [],
        traits: new Map(),
        body: bodyContent,
        loc: {
          start: { line: startToken.line, column: startToken.column },
          end: { line: this.current().line, column: this.current().column },
        },
      } as unknown as HSPlusNode;
    }

    // =========================================================================
    // Special handling for state machine definitions (Phase 13)
    // =========================================================================
    if (startToken.type === 'STATE_MACHINE' || type === 'state_machine') {
      return this.parseStateMachine();
    }

    // =========================================================================
    // Special handling for on_error blocks (Epoch 11 Self-Healing)
    // =========================================================================
    if (type === 'on_error' || startToken.type === 'ON_ERROR') {
      return this.parseOnErrorNode();
    }

    // =========================================================================
    // Special handling for assert statements (Epoch 11 Self-Healing)
    // =========================================================================
    if (type === 'assert' || startToken.type === 'ASSERT') {
      return this.parseAssertNode();
    }

    // =========================================================================
    // Special handling for environment blocks
    // =========================================================================
    if (type === 'environment') {
      const envBody = this.parseEnvironmentBlock();
      return {
        type: 'environment',
        properties: envBody.properties,
        directives: envBody.directives,
        children: [],
        traits: new Map(),
        loc: {
          start: { line: startToken.line, column: startToken.column },
          end: { line: this.current().line, column: this.current().column },
        },
      } as unknown as HSPlusNode;
    }

    if (type === 'composition') {
      let id: string | undefined;
      if (this.check('HASH')) {
        this.advance();
        id = this.expect('IDENTIFIER', 'Expected ID after #').value;
      }
      if (this.check('STRING')) {
        id = this.advance().value;
      }
      if (this.check('IDENTIFIER')) {
        id = this.advance().value;
      }

      const compBody = this.parseCompositionBlock();
      return {
        type: 'composition',
        name: id,
        id,
        properties: compBody.properties || {},
        directives: [],
        children: compBody.children,
        traits: new Map(),
        body: compBody,
        loc: {
          start: { line: startToken.line, column: startToken.column },
          end: { line: this.current().line, column: this.current().column },
        },
      } as unknown as HSPlusNode;
    }

    // =========================================================================
    // Standard node parsing
    // =========================================================================
    let id: string | undefined;
    let templateRef: string | undefined;

    // Parse #id
    if (this.check('HASH')) {
      this.advance();
      id = this.expect('IDENTIFIER', 'Expected ID after #').value;
    }

    // Parse "name" (quoted name for node)
    if (this.check('STRING')) {
      id = this.advance().value;
    }

    // Parse unquoted identifier as name/id (if not using)
    if (this.check('IDENTIFIER') && this.current().value !== 'using') {
      id = this.advance().value;
    }

    // Skip parameter list for function-like nodes: action name(params) { }
    if (this.check('LPAREN')) {
      this.skipParens();
    }

    // Parse `using "TemplateName"`
    if (this.check('IDENTIFIER') && this.current().value === 'using') {
      this.advance();
      templateRef = this.expect('STRING', 'Expected template name after using').value;
    }

    // Parse Optional Return Type syntax: function "name" : returnType {
    if (this.check('COLON')) {
      this.advance(); // :
      // Skip type definition (single identifier or array)
      if (this.check('IDENTIFIER')) this.advance();
      if (this.check('LBRACKET')) {
        this.advance();
        if (this.check('RBRACKET')) this.advance();
      }
    }

    const properties: Record<string, unknown> = {};
    const children: HSPlusNode[] = [];
    const directives: HSPlusDirective[] = [];
    const traits = new Map<VRTraitName, unknown>();

    // Store template reference
    if (templateRef) {
      properties.__templateRef = templateRef;
    }

    while (!this.check('LBRACE') && !this.check('EOF')) {
      try {
        if (this.check('NEWLINE')) {
          this.skipNewlines();
          if (this.check('LBRACE')) break;
          if (!this.check('AT')) {
            // Determine if we should exit looking for props
            if (this.check('EOF')) break;
            // If it looks like a property or child, continue.
            // But check indentation? (Not enforced here yet)
          }
        }

        if (this.check('AT')) {
          const directive = this.parseDirective();
          if (directive) {
            if (directive.type === 'trait') {
              traits.set(directive.name as VRTraitName, directive.config);
              this.hasVRTraits = true;
              directives.push(directive);
            } else {
              directives.push(directive);
            }
          }
        } else if (this.check('SPREAD')) {
          const startToken = this.advance();
          // Parse target as expression to support dotted references (Templates.Button, config.defaults.orb)
          const targetExpr = this.parseUnary(); // parseUnary handles identifiers and member access
          let target: string;
          if (typeof targetExpr === 'object' && targetExpr && '__ref' in targetExpr) {
            target = (targetExpr as { __ref: string }).__ref;
          } else if (typeof targetExpr === 'string') {
            target = targetExpr;
          } else {
            this.error(
              'Expected identifier or member expression after spread operator (...)',
              'HSP002'
            );
            target = 'unknown';
          }
          children.push({
            type: 'spread',
            target,
            loc: {
              start: { line: startToken.line, column: startToken.column },
              end: { line: this.current().line, column: this.current().column },
            },
          } as unknown as HSPlusNode);
        } else if (this.check('IDENTIFIER')) {
          const key = this.advance().value;
          let value: unknown = true;

          if (this.check('COLON')) {
            this.advance();
            value = this.parseValue();
          }

          properties[key] = value;
        } else {
          // If we are here, we saw something not a newline, not AT, not SPREAD, not IDENTIFIER
          // But checking 'LBRACE' loop condition might have missed if we consumed newlines?
          // If it is LBRACE, loop condition handles it.
          // If unexpected token:
          if (!this.check('LBRACE')) {
            // Error and recover
            this.error(
              `Unexpected token in properties: ${this.current().type}. Expected property name, @directive, or spread (...)`,
              'HSP101'
            );
            this.synchronizeProperty();
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage !== 'ParseError') console.error(e);
        this.synchronizeProperty();
      }
    }

    // Node Body
    if (this.check('LBRACE')) {
      this.advance();
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.check('EOF')) {
        try {
          this.skipNewlines();
          if (this.check('RBRACE') || this.check('EOF')) break;

          if (this.check('AT')) {
            const directive = this.parseDirective();
            if (directive) {
              if (directive.type === 'trait') {
                traits.set(directive.name as VRTraitName, directive.config);
                this.hasVRTraits = true;
              }
              directives.push(directive);
            }
          } else if (this.check('SPREAD')) {
            const startToken = this.advance();
            // Parse target as expression to support dotted references (Templates.Button, config.defaults.orb)
            const targetExpr = this.parseUnary(); // parseUnary handles identifiers and member access
            let target: string;
            if (typeof targetExpr === 'object' && targetExpr && '__ref' in targetExpr) {
              target = (targetExpr as { __ref: string }).__ref;
            } else if (typeof targetExpr === 'string') {
              target = targetExpr;
            } else {
              this.error(
                'Expected identifier or member expression after spread operator (...)',
                'HSP002'
              );
              target = 'unknown';
            }
            const spreadNode = {
              type: 'spread',
              target,
              loc: {
                start: { line: startToken.line, column: startToken.column },
                end: { line: this.current().line, column: this.current().column },
              },
            };
            // Store in both places: in children (for traditional spread handling) and in properties (for modern detection)
            children.push(spreadNode);
            const key = '__spread_' + target;
            properties[key] = spreadNode;
          } else {
            const token = this.current();
            const isKeyToken =
              token.type === 'IDENTIFIER' ||
              token.type === 'STRING' ||
              token.type === 'STATE' ||
              token.type === 'STATE_MACHINE' ||
              token.type === 'INITIAL' ||
              token.type === 'ON_ENTRY' ||
              token.type === 'ON_EXIT' ||
              token.type === 'TRANSITION';

            if (isKeyToken) {
              const saved = this.pos;
              const name = this.advance().value;

              const childNodeKeywords = [
                'logic',
                'template',
                'environment',
                'state',
                'object',
                'composition',
                'system',
                'core_config',
                'narrative',
                'quest',
                'objective',
                'dialogue',
                'choice',
                'visual_metadata',
                'spatial_group',
                'scene',
                'group',
                'module',
                'struct',
                'orb',
                'on_error',
                'assert',
                'transition',
                'on_entry',
                'on_exit',
              ];

              if (name === 'transition' && this.check('STRING')) {
                 const event = this.advance().value;
                 if (this.check('ARROW')) {
                   this.advance(); // consume ->
                   const targetState = this.expect('STRING', 'Expected target state string').value;
                   let block: Record<string, unknown> = {};
                   if (this.check('LBRACE')) {
                     block = this.parseBlockContent();
                   }
                   children.push({
                     type: 'transition',
                     name: `${event}_to_${targetState}`,
                     event,
                     target: targetState,
                     guard: block.guard || '',
                     action: block.action || '',
                     block
                   } as unknown as HSPlusNode);
                   continue;
                 } else { // backtrack
                   this.pos = saved;
                 }
              }

              if (name === 'on_entry' || name === 'on_exit') {
                 let block = '';
                 if (this.check('LBRACE')) {
                   block = this.parseCodeBlock();
                 } else { // skip over malformed
                   while (!this.check('RBRACE') && !this.check('EOF')) this.advance();
                 }
                 children.push({
                   type: 'method',
                   name: name,
                   params: [],
                   returnType: 'unknown',
                   body: block
                 } as unknown as HSPlusNode);
                 continue;
              }

              // Inline method (but not just a property function call)
              // Only do this if it's a known identifier or we peek ahead and see {
              if (this.check('LPAREN')) {
                 const possibleMethod = saved;
                 this.pos = saved;
                 const methodName = this.advance().value;
                 const params: string[] = [];
                 this.advance(); // consume (
                 while (!this.check('RPAREN') && !this.check('EOF') && !this.check('LBRACE')) {
                    if (this.check('IDENTIFIER')) {
                       params.push(this.advance().value);
                    } else {
                       this.advance();
                    }
                 }
                 if (this.check('RPAREN')) this.advance(); // )
                 
                 let returnType = 'unknown';
                 if (this.check('COLON')) {
                    this.advance();
                    if (this.check('IDENTIFIER')) {
                       returnType = this.advance().value;
                    }
                 }

                 // It is a method if it has a block body!
                 if (this.check('LBRACE')) {
                   const body = this.parseCodeBlock();
                   children.push({
                     type: 'method',
                     name: methodName,
                     params,
                     returnType,
                     body
                   } as unknown as HSPlusNode);
                   continue;
                 } else {
                   // Backtrack! It was just a function call or expression
                   this.pos = possibleMethod;
                   this.advance(); // consume name
                 }
              }

              if (this.check('COLON') || this.check('EQUALS')) {
                this.advance();
                properties[name] = this.parseValue();
              } else if (
                childNodeKeywords.includes(name) &&
                (this.check('LBRACE') || this.check('STRING'))
              ) {
                this.pos = saved;
                children.push(this.parseNode());
              } else if (this.current().type === 'IDENTIFIER') {
                this.pos = saved;
                children.push(this.parseNode());
              } else {
                properties[name] = true;
                // Skip function call, member access chain, or block body following the name:
                // e.g., channel("dev-team").broadcast({...}), on_start() { ... }, on_event("...", e) { ... }
                while (this.check('LPAREN') || this.check('DOT') || this.check('LBRACE')) {
                  if (this.check('LPAREN')) this.skipParens();
                  else if (this.check('LBRACE')) this.skipBraces();
                  else {
                    this.advance(); // consume .
                    if (this.check('IDENTIFIER')) this.advance(); // consume property name
                  }
                }
              }
            } else if (this.check('COMMA')) {
              // OPTIONAL COMMA SUPPORT
              this.advance();
            } else {
              this.error(
                `Unexpected token ${this.current().type} "${this.current().value}" in node body`
              );
              this.synchronizeProperty();
            }
          }
          this.skipNewlines();
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          if (errorMessage !== 'ParseError') console.error(e);
          this.synchronizeProperty();
        }
      }

      this.expect('RBRACE', 'Expected }');
    }

    return {
      type: type,
      name: id, // Mapping id to name for runtime compatibility
      id,
      properties,
      directives,
      children,
      traits,
      loc: {
        start: { line: startToken.line, column: startToken.column },
        end: { line: this.current().line, column: this.current().column },
      },
    } as unknown as HSPlusNode;
  }

  private parseDirective(): HSPlusDirective | null {
    this.expect('AT', 'Expected @');
    // Accept both IDENTIFIER and keyword tokens (like STATE) as directive names
    const nameToken = this.current();
    const isKeyword = ['STATE_MACHINE', 'STATE', 'ON_ENTRY', 'ON_EXIT', 'TRANSITION'].includes(nameToken.type);
    if (nameToken.type !== 'IDENTIFIER' && !isKeyword) {
      this.error(
        `Expected directive name, got ${nameToken.type}. Directives start with @ followed by name (e.g., @grabbable)`,
        'HSP201'
      );
      return null;
    }
    this.advance();
    const name = nameToken.value;

    // =========================================================================
    // Hot-Reload: @version(N) and @migrate from(N) { ... }
    // Must run before generic trait handling because some trait catalogs also
    // contain these names, which would otherwise consume the tokens incorrectly.
    // =========================================================================
    if (name === 'version') {
      this.expect('LPAREN', 'Expected ( after @version');
      const versionToken = this.expect('NUMBER', 'Expected version number');
      const version = Number(versionToken.value);
      this.expect('RPAREN', 'Expected ) after version number');
      return { type: 'version' as const, version } as HSPlusDirective;
    }

    if (name === 'migrate') {
      // @migrate from(N) { ... }
      const fromToken = this.expect('IDENTIFIER', 'Expected "from" after @migrate');
      if (fromToken.value !== 'from') {
        this.error('Expected "from" after @migrate');
      }
      this.expect('LPAREN', 'Expected ( after from');
      const fromVersionToken = this.expect('NUMBER', 'Expected version number');
      const fromVersion = Number(fromVersionToken.value);
      this.expect('RPAREN', 'Expected ) after version number');
      const body = this.check('LBRACE') ? this.parseCodeBlock() : '';
      return { type: 'migrate' as const, fromVersion, body } as HSPlusDirective;
    }

    // =========================================================================
    // VR Traits (with optional config)
    // =========================================================================
    if ((VR_TRAITS as readonly string[]).includes(name)) {
      if (!this.options.enableVRTraits) {
        this.warn(`VR trait @${name} is disabled`);
        return null;
      }
      let config: Record<string, unknown> = {};
      if (this.check('LPAREN')) {
        config = this.parseTraitConfig();
      } else if (this.check('LBRACE')) {
        config = this.parseBlockContent();
      }
      return { type: 'trait' as const, name: name as VRTraitName, config } as HSPlusDirective;
    }

    // =========================================================================
    // Lifecycle Hooks
    // =========================================================================
    if ((LIFECYCLE_HOOKS as readonly string[]).includes(name)) {
      const params: string[] = [];
      if (this.check('LPAREN')) {
        this.advance();
        while (!this.check('RPAREN') && !this.check('EOF')) {
          params.push(this.expect('IDENTIFIER', 'Expected parameter name').value);
          if (this.check('COLON')) {
            this.advance();
            this.expect('IDENTIFIER', 'Expected type');
          }
          if (this.check('COMMA')) this.advance();
        }
        this.expect('RPAREN', 'Expected )');
      }

      // Handle @event: (params) => { body } form (colon-prefixed arrow function handler)
      if (this.check('COLON')) {
        this.advance(); // consume :
        if (this.check('LPAREN')) this.skipParens(); // skip (params)
        if (this.check('ARROW')) this.advance(); // skip =>
      }

      let body = '';
      if (this.check('ARROW')) {
        this.advance();
        body = this.parseInlineExpression();
      } else if (this.check('LBRACE')) {
        body = this.parseCodeBlock();
      }

      return {
        type: 'lifecycle' as const,
        hook: name,
        params,
        body,
      } as HSPlusDirective;
    }

    // =========================================================================
    // State Block
    // =========================================================================
    if (name === 'state') {
      this.hasState = true;
      const body = this.parseStateBlock();
      return { type: 'state' as const, body } as HSPlusDirective;
    }

    // =========================================================================
    // Bindings Block
    // =========================================================================
    if (name === 'bindings') {
      const bindings = this.parseBindingsBlock();
      return { type: 'bindings' as const, bindings } as HSPlusDirective;
    }

    // =========================================================================
    // Control Flow
    // =========================================================================
    if (name === 'for') {
      this.hasControlFlow = true;
      const variable = this.expect('IDENTIFIER', 'Expected variable name').value;
      this.expect('IDENTIFIER', 'Expected "in"');
      const iterable = this.parseInlineExpression();
      const body = this.parseControlFlowBody();
      return { type: 'for' as const, variable, iterable, body } as HSPlusDirective;
    }

    if (name === 'forEach') {
      this.hasControlFlow = true;
      const variable = this.expect('IDENTIFIER', 'Expected variable name').value;
      this.expect('IDENTIFIER', 'Expected "in"');
      const collection = this.parseInlineExpression();
      const body = this.parseControlFlowBody();
      return { type: 'forEach' as const, variable, collection, body } as HSPlusDirective;
    }

    if (name === 'while') {
      this.hasControlFlow = true;
      const condition = this.parseInlineExpression();
      const body = this.parseControlFlowBody();
      return { type: 'while' as const, condition, body } as HSPlusDirective;
    }

    if (name === 'if') {
      this.hasControlFlow = true;
      const condition = this.parseInlineExpression();
      const body = this.parseControlFlowBody();
      let elseBody: HSPlusNode[] | undefined;

      this.skipNewlines();
      if (this.check('AT')) {
        const saved = this.pos;
        this.advance();
        if (this.check('IDENTIFIER') && this.current().value === 'else') {
          this.advance();
          elseBody = this.parseControlFlowBody();
        } else {
          this.pos = saved;
        }
      }

      return { type: 'if' as const, condition, body, else: elseBody } as HSPlusDirective;
    }

    // =========================================================================
    // Import  (@import "./path.hs" | @import "./path.hs" as Alias |
    //          @import { A, B } from "./path.hs" | @import * as NS from "./path.hs")
    // =========================================================================
    if (name === 'import') {
      if (!this.options.enableTypeScriptImports) {
        this.warn('@import is disabled');
        return null;
      }

      let namedImports: string[] | undefined;
      let isWildcard = false;

      // Named-import form: @import { A, B } from "./path.hs"
      if (this.check('LBRACE')) {
        this.advance(); // {
        namedImports = [];
        while (!this.check('RBRACE') && !this.check('EOF')) {
          if (this.check('IDENTIFIER')) {
            namedImports.push(this.advance().value);
          }
          if (this.check('COMMA')) this.advance();
        }
        this.expect('RBRACE', 'Expected } in named import list');
        // consume 'from' keyword (appears as IDENTIFIER)
        if (this.check('IDENTIFIER') && this.current().value === 'from') {
          this.advance();
        } else {
          this.warn("Expected 'from' after named import specifiers");
        }
      }

      // Wildcard form: @import * as Namespace from "./path.hs"
      if (this.check('ASTERISK') || (this.check('IDENTIFIER') && this.current().value === '*')) {
        this.advance(); // *
        isWildcard = true;
        if (this.check('IDENTIFIER') && this.current().value === 'as') {
          this.advance(); // as
        }
      }

      const path = this.expect('STRING', 'Expected import path string').value;

      // Derive default alias from filename
      let alias =
        path
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '') || 'import';

      // Handle trailing 'as Alias' on non-named-import forms
      if (!namedImports && this.check('IDENTIFIER') && this.current().value === 'as') {
        this.advance();
        alias = this.expect('IDENTIFIER', 'Expected alias after as').value;
      }

      // For wildcard with 'as' already consumed above, grab the alias token
      if (isWildcard && this.check('IDENTIFIER') && this.current().value !== 'from') {
        alias = this.advance().value;
        if (this.check('IDENTIFIER') && this.current().value === 'from') {
          this.advance(); // consume trailing 'from'
        }
      }

      this.imports.push({ path, alias, namedImports, isWildcard });
      return {
        type: 'import' as const,
        path,
        alias,
        namedImports,
        isWildcard,
      } as HSPlusDirective;
    }

    // =========================================================================
    // Export  (@export template "Name" | @export object "Name" | @export "Name")
    // =========================================================================
    if (name === 'export') {
      // Optional kind specifier: template | object | composition | trait
      let exportKind = 'any';
      if (this.check('IDENTIFIER')) {
        const kindToken = this.current();
        const knownKinds = ['template', 'object', 'composition', 'trait', 'group', 'scene'];
        if (knownKinds.includes(kindToken.value)) {
          exportKind = this.advance().value;
        }
      }

      // Optional quoted name — the name of what is being exported
      let exportName: string | undefined;
      if (this.check('STRING')) {
        exportName = this.advance().value;
      } else if (this.check('IDENTIFIER')) {
        exportName = this.advance().value;
      }

      return {
        type: 'export' as const,
        exportKind,
        exportName,
      } as HSPlusDirective;
    }

    // =========================================================================
    // Asset Manifest & References
    // =========================================================================
    if (name === 'manifest') {
      let config: Record<string, unknown> = {};
      let manifestName = 'default';

      if (this.check('LPAREN')) {
        // @manifest("name") or @manifest(key: val)
        // parseTraitConfig expects (k:v).
        // But here we have ("string").
        this.advance(); // (
        if (this.check('STRING')) {
          manifestName = this.advance().value;
        } else {
          // Treat as config key-values?
          // Reset pos? No, simple heuristic:
          // If IDENTIFIER, parseTraitConfig logic.
          // But we are manually parsing here to support positional string.
          // Let's assume traits config is generally key:val, but manifest takes name.
        }
        // Consume until ) ?
        while (!this.check('RPAREN') && !this.check('EOF')) this.advance();
        this.expect('RPAREN', 'Expected )');
      } else if (this.check('STRING')) {
        manifestName = this.advance().value;
      }

      if (this.check('LBRACE')) {
        const block = this.parseBlockContent();
        config = { ...config, ...block };
      }

      return { type: 'manifest' as const, name: manifestName, ...config };
    }

    if (name === 'asset') {
      if (this.check('LPAREN')) {
        const config = this.parseTraitConfig();
        return { ...config, type: 'asset' as const } as HSPlusDirective;
      }
      const assetId = this.expect('STRING', 'Expected asset ID').value;
      return { type: 'asset' as const, id: assetId } as HSPlusDirective;
    }

    // =========================================================================
    // Semantic Annotations
    // =========================================================================
    if (name === 'semantic') {
      const semanticName = this.check('LPAREN')
        ? this.parseParenString()
        : this.expect('STRING', 'Expected semantic name').value;
      const config = this.parseBlockContent();
      return { ...config, type: 'semantic' as const, name: semanticName } as HSPlusDirective;
    }

    if (name === 'annotate') {
      const annotateName = this.check('LPAREN')
        ? this.parseParenString()
        : this.expect('STRING', 'Expected annotation type').value;
      let config = {};
      if (this.check('COMMA')) {
        this.advance();
        config = this.parseValue() as Record<string, unknown>;
        // Close the paren if we're mid-expression
        if (this.check('RPAREN')) this.advance();
      } else if (this.check('RPAREN')) {
        this.advance();
      }
      return { type: 'annotate' as const, annotationType: annotateName, config } as HSPlusDirective;
    }

    if (name === 'semantic_ref') {
      const refName = this.check('LPAREN')
        ? this.parseParenString()
        : this.expect('STRING', 'Expected semantic reference').value;
      return { type: 'semantic_ref' as const, ref: refName } as HSPlusDirective;
    }

    if (name === 'bindings') {
      const bindings = this.parseBindingsBlock();
      return { type: 'bindings' as const, bindings } as HSPlusDirective;
    }

    // =========================================================================
    // World Definition
    // =========================================================================
    if (name === 'world_metadata') {
      const config = this.parseBlockContent();
      return { ...config, type: 'world_metadata' as const } as HSPlusDirective;
    }

    if (name === 'world_config') {
      const config = this.parseBlockContent();
      return { ...config, type: 'world_config' as const } as HSPlusDirective;
    }

    if (name === 'zones') {
      const zones = this.parseNamedBlockList('zone');
      return { type: 'zones' as const, zones } as HSPlusDirective;
    }

    if (name === 'spawn_points') {
      const spawns = this.parseNamedBlockList('spawn');
      return { type: 'spawn_points' as const, spawns } as HSPlusDirective;
    }

    // =========================================================================
    // Environment Lighting
    // =========================================================================
    if (name === 'skybox') {
      const config = this.parseBlockContent();
      return { ...config, type: 'skybox' as const } as HSPlusDirective;
    }

    if (name === 'ambient_light') {
      const config = this.parseBlockContent();
      return { ...config, type: 'ambient_light' as const } as HSPlusDirective;
    }

    if (name === 'directional_light') {
      let lightName = 'default';
      if (this.check('LPAREN')) {
        lightName = this.parseParenString();
      }
      const config = this.parseBlockContent();
      return { ...config, type: 'directional_light' as const, name: lightName } as HSPlusDirective;
    }

    if (name === 'fog') {
      const config = this.parseBlockContent();
      return { ...config, type: 'fog' as const } as HSPlusDirective;
    }

    // =========================================================================
    // Custom Metadata Blocks
    // =========================================================================
    if (name === 'artwork_metadata') {
      const config = this.parseBlockContent();
      return { ...config, type: 'artwork_metadata' as const } as HSPlusDirective;
    }

    if (name === 'npc_behavior') {
      const config = this.parseBlockContent();
      return { ...config, type: 'npc_behavior' as const } as HSPlusDirective;
    }

    if (name === 'interactive') {
      const config = this.parseBlockContent();
      return { ...config, type: 'interactive' as const } as HSPlusDirective;
    }

    if (name === 'lod') {
      const config = this.parseBlockContent();
      return { ...config, type: 'lod' as const } as HSPlusDirective;
    }

    // =========================================================================
    // External API & AI
    // =========================================================================
    if (name === 'external_api') {
      let externalApiName = 'default';
      if (this.check('STRING')) {
        externalApiName = this.advance().value;
      } else if (this.check('IDENTIFIER')) {
        externalApiName = this.advance().value;
      }
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.parseTraitConfig();

      return { type: 'external_api' as const, name: externalApiName, ...config } as unknown as HSPlusDirective;
    }

    if (name === 'generate') {
      const config: Record<string, unknown> = this.parseTraitConfig();
      const prompt = (config.prompt as string) || '';
      const context = (config.context as string) || '';
      const target = (config.target as string) || 'children';

      return { type: 'generate' as const, prompt, context, target } as HSPlusDirective;
    }

    // =========================================================================
    // NPC & Dialog
    // =========================================================================
    if (name === 'npc') {
      const npcName = this.expect('STRING', 'Expected NPC name').value;
      const props = this.parsePropsBlock();
      return { type: 'npc' as const, name: npcName, props } as HSPlusDirective;
    }

    if (name === 'dialog') {
      const dialogName = this.expect('STRING', 'Expected dialog name').value;
      const { props, options } = this.parseDialogBlock();
      return { type: 'dialog' as const, name: dialogName, props, options } as HSPlusDirective;
    }

    // =========================================================================
    // Hololand Runtime Events (on @hololand.xxx)
    // =========================================================================
    if (name === 'hololand') {
      if (this.check('DOT')) {
        this.advance();
        const eventName = this.expect('IDENTIFIER', 'Expected event name').value;
        const params: string[] = [];
        if (this.check('LPAREN')) {
          this.advance();
          while (!this.check('RPAREN') && !this.check('EOF')) {
            params.push(this.expect('IDENTIFIER', 'Expected parameter').value);
            if (this.check('COLON')) {
              this.advance();
              this.expect('IDENTIFIER', 'Expected type');
            }
            if (this.check('COMMA')) this.advance();
          }
          this.expect('RPAREN', 'Expected )');
        }
        return { type: 'hololand_event' as const, event: eventName, params } as HSPlusDirective;
      }
    }

    // =========================================================================
    // Fallback: Unknown directive - treat as generic trait with config
    // =========================================================================
    // Check if it might be a structural directive we haven't explicitly handled
    if ((STRUCTURAL_DIRECTIVES as readonly string[]).includes(name)) {
      let nodeName: string | undefined;
      if (this.check('STRING')) {
        nodeName = this.advance().value;
      }
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.parseTraitConfig();
      return { ...config, type: name, name: nodeName } as HSPlusDirective;
    }

    // Unknown directive - emit warning and parse as generic trait
    if (this.options.strict) {
      this.traitError(name);
    } else {
      this.warn(`Unknown directive @${name}`);
    }

    // Parse config if present to avoid syntax errors
    let config: Record<string, unknown> = {};
    if (this.check('LPAREN')) {
      config = this.parseTraitConfig();
    } else if (this.check('LBRACE')) {
      config = this.parseBlockContent();
    }

    // Handle @event("args"): (params) => { body } — colon-prefixed arrow function handler
    if (this.check('COLON')) {
      this.advance(); // consume :
      if (this.check('LPAREN')) this.skipParens(); // skip (params)
      if (this.check('ARROW')) this.advance(); // skip =>
      if (this.check('LBRACE')) {
        config.body = this.parseCodeBlock();
      }
    }

    // Return as a generic trait so it appears in AST
    return { type: 'trait' as const, name, config } as HSPlusDirective;
  }

  /**
   * Parse a string inside parentheses: ("name")
   */
  private parseParenString(): string {
    this.expect('LPAREN', 'Expected (');
    const value = this.expect('STRING', 'Expected string').value;
    this.expect('RPAREN', 'Expected )');
    return value;
  }

  private parseConnectionStatement(): Record<string, string> {
    this.expect('IDENTIFIER', 'Expected connect'); // connect
    const from = this.expect('IDENTIFIER', 'Expected from name').value;
    this.expect('IDENTIFIER', 'Expected to'); // to
    const to = this.expect('IDENTIFIER', 'Expected to name').value;
    return { from, to };
  }

  /**
   * Parse block content: { key: value, ... }
   */
  private parseBlockContent(): Record<string, unknown> {
    const content: Record<string, unknown> = {};

    if (!this.check('LBRACE')) {
      return content;
    }

    this.advance(); // {
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      const token = this.current();
      const isKeyToken =
        token.type === 'IDENTIFIER' ||
        token.type === 'STRING' ||
        token.type === 'STATE' ||
        token.type === 'STATE_MACHINE' ||
        token.type === 'INITIAL' ||
        token.type === 'ON_ENTRY' ||
        token.type === 'ON_EXIT' ||
        token.type === 'TRANSITION';

      if (isKeyToken) {
        const next = this.peek(1);
        if (next.type === 'COLON' || next.type === 'EQUALS') {
          const key = this.advance().value;
          this.advance(); // consume : or =
          content[key] = this.parseValue();
        } else if (next.type === 'STRING' || next.type === 'LBRACE' || next.type === 'IDENTIFIER') {
          // Nested node (e.g. object "Name" { ... }, or action name(params) { ... })
          const node = this.parseNode();
          const type = node.type;
          const name = node.name || `unnamed_${type}_${Object.keys(content).length}`;
          content[name] = node;
        } else {
          // Bare key
          const key = this.advance().value;
          content[key] = true;
        }
      } else if (this.check('SPREAD')) {
        this.advance(); // ...
        const val = this.parseValue();
        const spreadKey = `__spread_${Object.keys(content).length}`;
        content[spreadKey] = { type: 'spread', argument: val };
      } else if (this.check('AT')) {
        // Nested directive
        const directive = this.parseDirective();
        if (directive) {
          const dirKey =
            ('name' in directive ? (directive as { name: string }).name : undefined) ||
            directive.type;
          content[`@${dirKey}`] = directive;
        }
      } else if (this.check('LBRACE')) {
        // Skip a balanced brace block (e.g., unexpected bare block)
        let depth = 1;
        this.advance(); // {
        while (depth > 0 && !this.check('EOF')) {
          if (this.check('LBRACE')) depth++;
          if (this.check('RBRACE')) depth--;
          this.advance();
        }
      } else if (this.check('LPAREN')) {
        this.skipParens();
      } else {
        this.advance(); // Skip unexpected token
      }

      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return content;
  }

  /**
   * Parse bindings block: { bind(expr) -> target, ... }
   */
  private parseBindingsBlock(): Array<{ source: string; target: string }> {
    const bindings: Array<{ source: string; target: string }> = [];

    if (!this.check('LBRACE')) {
      return bindings;
    }

    this.advance(); // {
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      // Expect: bind(expr) -> target
      if (this.check('IDENTIFIER') && this.current().value === 'bind') {
        this.advance(); // bind
        if (this.check('LPAREN')) {
          this.advance(); // (
          let source = '';
          let parenDepth = 1;
          while (parenDepth > 0 && !this.check('EOF')) {
            if (this.check('LPAREN')) parenDepth++;
            if (this.check('RPAREN')) {
              parenDepth--;
              if (parenDepth === 0) break;
            }
            source += this.advance().value + ' ';
          }
          this.expect('RPAREN', 'Expected )');
          source = source.trim();

          // Expect -> or =>
          if (this.check('ARROW')) {
            this.advance();
          }

          // Parse target
          let target = '';
          while (!this.check('NEWLINE') && !this.check('RBRACE') && !this.check('EOF')) {
            target += this.advance().value;
          }
          target = target.trim();

          bindings.push({ source, target });
        }
      } else {
        // Skip line comments or other content
        while (!this.check('NEWLINE') && !this.check('RBRACE') && !this.check('EOF')) {
          this.advance();
        }
      }

      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return bindings;
  }

  /**
   * Parse named block list: zone "name" { ... } or spawn "name" { ... }
   */
  private parseNamedBlockList(
    blockType: string
  ): Array<{ name: string; config: Record<string, unknown> }> {
    const blocks: Array<{ name: string; config: Record<string, unknown> }> = [];

    if (!this.check('LBRACE')) {
      return blocks;
    }

    this.advance(); // {
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      // Expect: zone "name" { ... } or spawn "name" { ... }
      if (this.check('IDENTIFIER') && this.current().value === blockType) {
        this.advance(); // zone/spawn
        const blockName = this.expect('STRING', `Expected ${blockType} name`).value;
        const config = this.parseBlockContent();
        blocks.push({ name: blockName, config });
      } else {
        // Skip unexpected content
        this.advance();
      }

      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return blocks;
  }

  /**
   * Parse composition block: composition "Name" { ... }
   */
  private parseCompositionBlock(): {
    systems: HSPlusNode[];
    configs: HSPlusNode[];
    children: HSPlusNode[];
    properties: Record<string, unknown>;
  } {
    const result = {
      systems: [] as HSPlusNode[],
      configs: [] as HSPlusNode[],
      children: [] as HSPlusNode[],
      properties: {} as Record<string, unknown>,
    };

    if (!this.check('LBRACE')) {
      return result;
    }

    this.advance(); // {
    this.skipNewlines();

    // List of keywords that start child node definitions
    const childNodeKeywords = [
      'logic',
      'template',
      'environment',
      'state',
      'object',
      'composition',
      'system',
      'core_config',
      'narrative',
      'quest',
      'objective',
      'dialogue',
      'choice',
      'visual_metadata',
      'spatial_group',
      'scene',
      'group',
      'module',
      'struct',
      'orb',
      'on_error',
      'assert',
      'topic',
      'channel',
      'config',
      'zone',
      'audio',
      'light',
      'npc',
      'camera',
      'timeline',
    ];

    while (!this.check('RBRACE') && !this.check('EOF')) {
      const currentDirectives: HSPlusDirective[] = [];
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      // 1. Collect directives
      while (this.check('AT')) {
        const directive = this.parseDirective();
        if (directive) {
          currentDirectives.push(directive);
        }
        this.skipNewlines();
      }

      // 2. Check if this is a property assignment (key: value or key = value)
      const isNodeStart =
        this.check('IDENTIFIER') ||
        this.check('STATE_MACHINE') ||
        this.check('STATE') ||
        this.check('TRANSITION') ||
        this.check('INITIAL');

      if (isNodeStart) {
        const token = this.current();
        const next = this.peek(1);

        // Property assignment: key: value or key = value
        if (next.type === 'COLON' || next.type === 'EQUALS') {
          const key = this.advance().value;
          this.advance(); // consume : or =
          result.properties[key] = this.parseValue();
        }
        // Child node keyword followed by { or "name"
        else if (
          childNodeKeywords.includes(token.value) &&
          (next.type === 'LBRACE' || next.type === 'STRING' || next.type === 'IDENTIFIER')
        ) {
          const keyword = this.current().value;
          const node = this.parseNode();
          node.directives = [...currentDirectives, ...(node.directives || [])];

          if (keyword === 'system' || node.type === 'system') {
            result.systems.push(node);
          } else if (keyword === 'core_config' || node.type === 'core_config') {
            result.configs.push(node);
          } else {
            result.children.push(node);
          }
        }
        // Property with value but no colon (e.g. prop1 "value1")
        // Only for non-child-node identifiers followed by a value token
        else if (
          !childNodeKeywords.includes(token.value) &&
          (next.type === 'STRING' ||
            next.type === 'NUMBER' ||
            next.type === 'BOOLEAN' ||
            next.type === 'NULL')
        ) {
          const key = this.advance().value;
          result.properties[key] = this.parseValue();
        }
        // Custom node type followed by name or body
        else if (next.type === 'LBRACE' || next.type === 'IDENTIFIER' || next.type === 'STRING') {
          const keyword = this.current().value;
          const node = this.parseNode();
          node.directives = [...currentDirectives, ...(node.directives || [])];

          if (keyword === 'system' || node.type === 'system') {
            result.systems.push(node);
          } else if (keyword === 'core_config' || node.type === 'core_config') {
            result.configs.push(node);
          } else {
            result.children.push(node);
          }
        }
        // Inline method parsing
        else if (next.type === 'LPAREN') {
          const possibleMethod = this.pos;
          const methodName = this.advance().value;
          const params: string[] = [];
          this.advance(); // consume (
          while (!this.check('RPAREN') && !this.check('EOF') && !this.check('LBRACE')) {
            if (this.check('IDENTIFIER')) {
              params.push(this.advance().value);
            } else {
              this.advance();
            }
          }
          if (this.check('RPAREN')) this.advance(); // )
          
          let returnType = 'unknown';
          if (this.check('COLON')) {
             this.advance();
             if (this.check('IDENTIFIER')) {
                returnType = this.advance().value;
             }
          }

          if (this.check('LBRACE')) {
            const body = this.parseCodeBlock();
            result.children.push({
              type: 'method',
              name: methodName,
              params,
              returnType,
              body
            } as unknown as HSPlusNode);
          } else {
            // Not a method block, fallback to bare identifier
            this.pos = possibleMethod;
            const key = this.advance().value;
            result.properties[key] = true;
          }
        }
        // Bare identifier (no value)
        else {
          const key = this.advance().value;
          result.properties[key] = true;
        }
      } else if (currentDirectives.length > 0) {
        // Standalone directives in composition body (like @manifest)
        const fragment: HSPlusNode = {
          type: 'fragment',
          directives: currentDirectives,
          children: [],
          traits: new Map(),
          properties: {},
        } as unknown as HSPlusNode;
        result.children.push(fragment);
      } else if (this.check('COMMA')) {
        this.advance();
      } else if (this.check('LBRACKET')) {
        // Skip balanced array literal at composition level (e.g., waypoints "name" [...])
        let depth = 1;
        this.advance(); // consume [
        while (depth > 0 && !this.check('EOF')) {
          if (this.check('LBRACKET')) depth++;
          else if (this.check('RBRACKET')) depth--;
          this.advance();
        }
      } else if (this.check('LBRACE')) {
        // Skip balanced block at composition level (e.g., spawn_group "name" { ... })
        let depth = 1;
        this.advance(); // consume {
        while (depth > 0 && !this.check('EOF')) {
          if (this.check('LBRACE')) depth++;
          else if (this.check('RBRACE')) depth--;
          this.advance();
        }
      } else {
        // Unexpected token in composition block - report error and skip
        if (!this.check('RBRACE') && !this.check('EOF')) {
          this.error(
            `Unexpected token ${this.current().type} "${this.current().value}" in composition body. Expected property name, @directive, or child node`,
            'HSP101'
          );
          this.advance();
        }
      }
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return result;
  }

  /**
   * Parse logic block: logic { function..., on_tick..., on_scene_load... }
   */
  private parseLogicBlock(): {
    functions: Array<{ name: string; params: string[]; body: string }>;
    eventHandlers: Array<{ event: string; params: string[]; body: string }>;
    tickHandlers: Array<{ interval: number; body: string }>;
  } {
    const result = {
      functions: [] as Array<{ name: string; params: string[]; body: string }>,
      eventHandlers: [] as Array<{ event: string; params: string[]; body: string }>,
      tickHandlers: [] as Array<{ interval: number; body: string }>,
    };

    if (!this.check('LBRACE')) {
      return result;
    }

    this.advance(); // {
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      if (this.check('IDENTIFIER')) {
        const keyword = this.current().value;

        // Parse function definition
        if (keyword === 'function') {
          this.advance(); // function
          const funcName = this.expect('IDENTIFIER', 'Expected function name').value;
          const params: string[] = [];

          if (this.check('LPAREN')) {
            this.advance();
            while (!this.check('RPAREN') && !this.check('EOF')) {
              params.push(this.expect('IDENTIFIER', 'Expected parameter').value);
              if (this.check('COLON')) {
                this.advance();
                this.expect('IDENTIFIER', 'Expected type');
              }
              if (this.check('COMMA')) this.advance();
            }
            this.expect('RPAREN', 'Expected )');
          }

          if (this.check('COLON')) {
            this.advance();
            this.expect('IDENTIFIER', 'Expected return type');
          }

          const body = this.parseCodeBlock();
          result.functions.push({ name: funcName, params, body });
        }
        // Parse on_tick handler
        else if (keyword === 'on_tick') {
          this.advance(); // on_tick
          let interval = 1.0;

          if (this.check('LPAREN')) {
            this.advance();
            const intervalToken = this.expect('NUMBER', 'Expected interval');
            interval = parseFloat(intervalToken.value);
            this.expect('RPAREN', 'Expected )');
          }

          const body = this.parseCodeBlock();
          result.tickHandlers.push({ interval, body });
        }
        // Parse on_scene_load handler
        else if (keyword === 'on_scene_load') {
          this.advance(); // on_scene_load
          const body = this.parseCodeBlock();
          result.eventHandlers.push({ event: 'scene_load', params: [], body });
        }
        // Parse on <event> handler
        else if (keyword === 'on') {
          this.advance(); // on
          let eventName = '';

          // Handle @hololand.event_name(params) or just event_name
          if (this.check('AT')) {
            this.advance(); // @
            eventName = this.expect('IDENTIFIER', 'Expected event namespace').value;
            if (this.check('DOT')) {
              this.advance();
              eventName += '.' + this.expect('IDENTIFIER', 'Expected event name').value;
            }
          } else {
            eventName = this.expect('IDENTIFIER', 'Expected event name').value;
          }

          const params: string[] = [];
          if (this.check('LPAREN')) {
            this.advance();
            while (!this.check('RPAREN') && !this.check('EOF')) {
              params.push(this.expect('IDENTIFIER', 'Expected parameter').value);
              if (this.check('COLON')) {
                this.advance();
                this.expect('IDENTIFIER', 'Expected type');
              }
              if (this.check('COMMA')) this.advance();
            }
            this.expect('RPAREN', 'Expected )');
          }

          const body = this.parseCodeBlock();
          result.eventHandlers.push({ event: eventName, params, body });
        }
        // Parse on_start handler: on_start() { ... }
        else if (keyword === 'on_start') {
          this.advance(); // on_start
          const params: string[] = [];
          if (this.check('LPAREN')) {
            this.advance();
            while (!this.check('RPAREN') && !this.check('EOF')) {
              params.push(this.expect('IDENTIFIER', 'Expected parameter').value);
              if (this.check('COMMA')) this.advance();
            }
            this.expect('RPAREN', 'Expected )');
          }
          const body = this.parseCodeBlock();
          result.eventHandlers.push({ event: 'start', params, body });
        }
        // Parse on_event handler: on_event("event_name", param) { ... }
        else if (keyword === 'on_event') {
          this.advance(); // on_event
          let eventName = '';
          const params: string[] = [];
          if (this.check('LPAREN')) {
            this.advance();
            // First arg is the event name (string)
            if (this.check('STRING')) {
              eventName = this.advance().value;
            } else {
              eventName = this.expect('IDENTIFIER', 'Expected event name').value;
            }
            if (this.check('COMMA')) {
              this.advance();
              // Remaining args are params
              while (!this.check('RPAREN') && !this.check('EOF')) {
                params.push(this.expect('IDENTIFIER', 'Expected parameter').value);
                if (this.check('COMMA')) this.advance();
              }
            }
            this.expect('RPAREN', 'Expected )');
          }
          const body = this.parseCodeBlock();
          result.eventHandlers.push({ event: eventName, params, body });
        }
        // Skip other identifiers (might be comments or unknown constructs)
        else {
          // Skip past parens and braces to handle unknown function-like constructs
          this.advance();
          if (this.check('LPAREN')) this.skipParens();
          if (this.check('LBRACE')) this.skipBraces();
          // Also skip to next newline for safety
          while (!this.check('RBRACE') && !this.check('EOF') && !this.check('NEWLINE')) {
            this.advance();
          }
        }
      } else {
        // Skip non-identifier tokens
        this.advance();
      }

      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return result;
  }

  /**
   * Parse environment block with lighting directives
   */
  private parseEnvironmentBlock(): {
    properties: Record<string, unknown>;
    directives: HSPlusDirective[];
  } {
    const properties: Record<string, unknown> = {};
    const directives: HSPlusDirective[] = [];

    if (!this.check('LBRACE')) {
      return { properties, directives };
    }

    this.advance(); // {
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      if (this.check('AT')) {
        // Environment directive like @skybox, @ambient_light, etc.
        const directive = this.parseDirective();
        if (directive) {
          directives.push(directive);
        }
      } else if (this.check('IDENTIFIER')) {
        // Simple property like skybox: "value"
        const key = this.advance().value;
        if (this.check('COLON') || this.check('EQUALS')) {
          this.advance();
          properties[key] = this.parseValue();
        } else {
          properties[key] = true;
        }
      } else {
        this.advance();
      }

      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return { properties, directives };
  }

  private parsePropsBlock(): Record<string, unknown> {
    this.skipNewlines();
    const props: Record<string, unknown> = {};
    if (this.check('LBRACE')) {
      this.advance();
      this.skipNewlines();
      while (!this.check('RBRACE') && !this.check('EOF')) {
        // Sprint 1: Support Spread Properties
        if (this.check('SPREAD')) {
          this.advance(); // Consume ...
          const val = this.parseValue();
          // Use a unique key for spread to preserve it in AST/Object
          const spreadKey = `__spread_${Object.keys(props).length}`;
          props[spreadKey] = { type: 'spread', argument: val };
          this.skipNewlines();
          // Allow comma after spread
          if (this.check('COMMA')) this.advance();
          this.skipNewlines();
          continue;
        }

        const key = this.expect('IDENTIFIER', 'Expected property name').value;
        if (this.check('COLON') || this.check('EQUALS')) {
          this.advance();
          props[key] = this.parseValue();
        } else {
          props[key] = true;
        }
        this.skipNewlines();

        // Allow commas between properties
        if (this.check('COMMA')) this.advance();
        this.skipNewlines();
      }
      this.expect('RBRACE', 'Expected }');
    }
    return props;
  }

  private parseDialogBlock(): { props: Record<string, unknown>; options: unknown[] } {
    this.skipNewlines();
    const props: Record<string, unknown> = {};
    const options: unknown[] = [];

    if (this.check('LBRACE')) {
      this.advance();
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.check('EOF')) {
        if (this.check('IDENTIFIER') && this.current().value === 'option') {
          this.advance(); // consume 'option'
          const text = this.expect('STRING', 'Expected option text').value;
          this.expect('ARROW', 'Expected ->');
          let target: unknown;
          if (this.check('AT')) {
            // @close or @trigger
            const d = this.parseDirective();
            target = { type: 'directive', value: d };
          } else {
            target = this.expect('STRING', 'Expected target ID').value;
          }
          options.push({ text, target });
        } else {
          // Normal property
          const key = this.expect('IDENTIFIER', 'Expected property name').value;
          if (this.check('COLON') || this.check('EQUALS')) {
            this.advance();
            props[key] = this.parseValue();
          } else {
            props[key] = true;
          }
        }
        this.skipNewlines();
      }
      this.expect('RBRACE', 'Expected }');
    }
    return { props, options };
  }

  private parseTraitConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {};

    if (this.check('LPAREN')) {
      this.advance();
      this.skipNewlines();

      // Check for positional string argument ("string")
      if (
        this.check('STRING') &&
        (this.peek(1).type === 'RPAREN' || this.peek(1).type === 'COMMA')
      ) {
        config['default'] = this.advance().value;
        if (this.check('COMMA')) this.advance();
        this.skipNewlines();
      }

      while (!this.check('RPAREN') && !this.check('EOF')) {
        this.skipNewlines();
        if (this.check('RPAREN') || this.check('EOF')) break;
        if (!this.check('IDENTIFIER')) {
          this.advance();
          continue;
        }

        const key = this.expect('IDENTIFIER', 'Expected property name').value;
        if (this.check('COLON') || this.check('EQUALS')) {
          this.advance();
          config[key] = this.parseValue();
        } else {
          config[key] = true;
        }
        if (this.check('COMMA')) this.advance();
        this.skipNewlines();
      }
      this.expect('RPAREN', 'Expected )');
    }

    return config;
  }

  private parseStateBlock(): Record<string, unknown> {
    const state: Record<string, unknown> = {};

    if (this.check('LBRACE')) {
      this.advance();
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.check('EOF')) {
        this.skipNewlines();
        if (this.check('RBRACE') || this.check('EOF')) break;

        // Support spread operator in @state blocks
        if (this.check('SPREAD')) {
          this.advance(); // consume ...
          const spreadArg = this.parseValue();
          if (spreadArg === null) {
            this.error('Expected expression after spread operator (...) in state block', 'HSP300');
          } else {
            const spreadKey = `__spread_${Object.keys(state).length}`;
            state[spreadKey] = { type: 'spread', argument: spreadArg };
          }
          this.skipNewlines();
          continue;
        }

        const key = this.expect('IDENTIFIER', 'Expected state variable name').value;
        if (this.check('COLON') || this.check('EQUALS')) {
          this.advance();
          state[key] = this.parseValue();
        } else {
          state[key] = true;
        }
        this.skipNewlines();
      }
      this.expect('RBRACE', 'Expected }');
    }
    return state;
  }

  /**
   * Parse spatial state machine (Phase 13)
   */
  private parseStateMachine(): HSPlusNode {
    const startToken = this.current();
    if (startToken.type === 'STATE_MACHINE') {
      this.advance(); // state_machine
    }

    const name = this.expect('IDENTIFIER', 'Expected state machine name').value;
    const states: Array<Record<string, unknown>> = [];
    const transitions: Array<Record<string, unknown>> = [];
    let initialState = '';

    this.expect('LBRACE', 'Expected { after state machine name');
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      const current = this.current();
      if (current.type === 'INITIAL' || current.value === 'initial') {
        this.advance();
        this.expect('COLON', 'Expected : after initial');
        initialState = this.expect('STRING', 'Expected initial state name').value;
      } else if (current.type === 'STATE' || current.value === 'state') {
        states.push(this.parseStateNode());
      } else if (current.type === 'TRANSITION' || current.value === 'transitions') {
        transitions.push(...this.parseTransitionsBlock());
      } else {
        // Skip unknown
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected } at end of state machine');

    return {
      type: 'state-machine',
      name,
      initialState,
      states,
      transitions,
      loc: {
        start: { line: startToken.line, column: startToken.column },
        end: { line: this.current().line, column: this.current().column },
      },
    } as unknown as HSPlusNode;
  }

  private parseStateNode(): Record<string, unknown> {
    this.advance(); // state
    const name = this.expect('IDENTIFIER', 'Expected state name').value;
    let onEntry: string | undefined;
    let onExit: string | undefined;

    this.expect('LBRACE', 'Expected { after state name');
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      const current = this.current();
      if (current.type === 'ON_ENTRY' || current.value === 'on_entry') {
        this.advance();
        onEntry = this.parseCodeBlock();
      } else if (current.type === 'ON_EXIT' || current.value === 'on_exit') {
        this.advance();
        onExit = this.parseCodeBlock();
      } else {
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return { name, onEntry, onExit };
  }

  private parseOnErrorNode(): HSPlusNode {
    const startToken = this.previous();
    const body = this.parseControlFlowBody();
    return {
      type: 'on_error',
      body,
      loc: {
        start: { line: startToken.line, column: startToken.column },
        end: { line: this.current().line, column: this.current().column },
      },
    } as unknown as HSPlusNode;
  }

  private parseAssertNode(): HSPlusNode {
    const startToken = this.previous();
    this.expect('LPAREN', 'Expected (');
    const condition = this.parseExpression();
    let message = '';
    if (this.match(['COMMA'])) {
      message = String(this.parseValue());
    }
    this.expect('RPAREN', 'Expected )');
    return {
      type: 'assert',
      condition,
      message,
      loc: {
        start: { line: startToken.line, column: startToken.column },
        end: { line: this.current().line, column: this.current().column },
      },
    } as unknown as HSPlusNode;
  }

  private parseTransitionsBlock(): Array<Record<string, string>> {
    const transitions: Array<Record<string, string>> = [];
    this.advance(); // transitions
    this.expect('LBRACE', 'Expected {');
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      // from_state -> to_state: event
      const from = this.expect('IDENTIFIER', 'Expected source state').value;
      this.expect('ARROW', 'Expected ->');
      const to = this.expect('IDENTIFIER', 'Expected target state').value;
      this.expect('COLON', 'Expected :');
      const event = this.expect('IDENTIFIER', 'Expected event name').value;

      transitions.push({ from, to, event });
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return transitions;
  }

  private parseControlFlowBody(): HSPlusNode[] {
    const nodes: HSPlusNode[] = [];

    if (this.check('LBRACE')) {
      this.advance();
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.check('EOF')) {
        this.skipNewlines();
        if (this.check('RBRACE') || this.check('EOF')) break;

        if (this.check('AT')) {
          const directive = this.parseDirective();
          if (directive) {
            // Check if it's a structural directive (flow control) or an attached directive
            if (
              directive.type === 'for' ||
              directive.type === 'while' ||
              directive.type === 'if' ||
              directive.type === 'forEach'
            ) {
              // Structural directives can stand alone in a block
              // We wrap them in a fragment to satisfy the HSPlusNode requirements if needed,
              // but the parser should ideally handle them as first-class citizens.
              // For compatibility with return type HSPlusNode[], we wrap.
              nodes.push({
                type: 'fragment',
                directives: [directive],
                children: [],
                traits: new Map(),
                properties: {},
              } as unknown as HSPlusNode);
            } else if (directive.type === 'trait') {
              // A lone trait in a block - attach to next node if possible,
              // or handle as standalone. For now, we skip or wrap.
              this.warn(`Standalone trait @${directive.name} in block`);
            } else {
              // Other directives (npc, dialog, external_api)
              nodes.push({
                type: 'fragment',
                directives: [directive],
                children: [],
                traits: new Map(),
                properties: {},
              } as unknown as HSPlusNode);
            }
          }
        } else if (this.check('IDENTIFIER')) {
          nodes.push(this.parseNode());
        } else {
          // Skip unexpected tokens to prevent infinite loops
          this.advance();
        }
        this.skipNewlines();
      }

      this.expect('RBRACE', 'Expected }');
    }

    return nodes;
  }

  private parseCodeBlock(): string {
    let code = '';
    let braceDepth = 0;

    if (this.check('LBRACE')) {
      this.advance();
      braceDepth = 1;

      try {
        while (braceDepth > 0 && !this.check('EOF')) {
          const token = this.advance();
          if (token.type === 'LBRACE') {
            braceDepth++;
            code += '{';
          } else if (token.type === 'RBRACE') {
            braceDepth--;
            if (braceDepth > 0) {
              code += '}';
            }
          } else if (token.type === 'STRING') {
            code += `"${token.value}"`;
            code += ' ';
          } else {
            code += token.value;
            if (token.type === 'NEWLINE') {
              code += '\n';
            } else {
              code += ' ';
            }
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage !== 'ParseError') console.error(e);
        this.synchronize();
      }
    }
    return code.trim();
  }

  private parseInlineExpression(): string {
    let expr = '';

    while (!this.check('NEWLINE') && !this.check('LBRACE') && !this.check('EOF')) {
      const token = this.advance();
      expr += token.value + ' ';
    }

    return expr.trim();
  }
  /**
   * Parse any value or expression (Entry Point)
   * Handles operators like ?? and unary operators like ...
   */
  private parseValue(): unknown {
    return this.parseAssignment();
  }

  /**
   * Parse assignment expressions (??=)
   * Much lower precedence than ternary/null-coalesce
   * Example: x ??= value  →  x = x ?? value
   */
  private parseAssignment(): unknown {
    const expr = this.parseExpression();

    // Check for null coalescing assignment
    if (this.check('NULL_COALESCE_ASSIGN')) {
      // Validate that left side is assignable (identifier or member expression)
      const isAssignable =
        typeof expr === 'string' ||
        (typeof expr === 'object' && expr && '__ref' in expr) || // identifier or member expression
        (typeof expr === 'object' && expr && 'type' in expr && expr.type === 'member');

      if (isAssignable) {
        this.advance(); // consume ??=
        const value = this.parseExpression();

        return {
          type: 'nullCoalescingAssignment',
          target: expr,
          value,
        };
      } else {
        throw new Error(
          `Cannot use ??= on non-assignable expression at line ${this.current().line}`
        );
      }
    }

    return expr;
  }

  /**
   * Parse expression (Entry Point for operators)
   * Handles Ternary Operators: cond ? true : false
   */
  private parseExpression(): unknown {
    const condition = this.parseNullCoalesce();

    if (this.check('QUESTION')) {
      this.advance(); // ?
      const trueValue = this.parseExpression(); // Right-associative recursion
      this.expect('COLON', 'Expected : in ternary operator');
      const falseValue = this.parseExpression();

      return { type: 'ternary', condition, trueValue, falseValue };
    }

    return condition;
  }

  /**
   * Parse binary expressions: ?? (null coalesce) — lower precedence than logical OR
   */
  private parseNullCoalesce(): unknown {
    let left = this.parseLogicalOr();

    while (this.check('NULL_COALESCE')) {
      this.advance();
      const right = this.parseLogicalOr();
      left = { type: 'binary', operator: '??', left, right };
    }

    return left;
  }

  /** Parse logical OR: a || b */
  private parseLogicalOr(): unknown {
    let left = this.parseLogicalAnd();
    while (this.check('OR')) {
      this.advance();
      const right = this.parseLogicalAnd();
      left = { type: 'binary', operator: '||', left, right };
    }
    return left;
  }

  /** Parse logical AND: a && b */
  private parseLogicalAnd(): unknown {
    let left = this.parseEquality();
    while (this.check('AND')) {
      this.advance();
      const right = this.parseEquality();
      left = { type: 'binary', operator: '&&', left, right };
    }
    return left;
  }

  /** Parse equality: a == b, a != b */
  private parseEquality(): unknown {
    let left = this.parseComparison();
    while (this.check('DOUBLE_EQUALS') || this.check('NOT_EQUALS')) {
      const operator = this.current().value;
      this.advance();
      const right = this.parseComparison();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  /** Parse comparison: a < b, a > b, a <= b, a >= b */
  private parseComparison(): unknown {
    let left = this.parseAdditive();
    while (
      this.check('LESS_THAN') ||
      this.check('GREATER_THAN') ||
      this.check('LESS_EQUAL') ||
      this.check('GREATER_EQUAL')
    ) {
      const operator = this.current().value;
      this.advance();
      const right = this.parseAdditive();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  /** Parse additive: a + b, a - b */
  private parseAdditive(): unknown {
    let left = this.parseMultiplicative();
    while (this.check('PLUS') || this.check('MINUS')) {
      const operator = this.current().value;
      this.advance();
      const right = this.parseMultiplicative();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  /** Parse multiplicative: a * b, a / b, a % b */
  private parseMultiplicative(): unknown {
    let left = this.parseUnary();
    while (this.check('ASTERISK') || this.check('SLASH') || this.check('PERCENT')) {
      const operator = this.current().value;
      this.advance();
      const right = this.parseUnary();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  /**
   * Parse unary prefix expressions (!, spread, unary minus, unary plus)
   */
  private parseUnary(): unknown {
    if (this.check('SPREAD')) {
      this.advance();
      const arg = this.parseUnary();
      return { type: 'spread', argument: arg };
    }

    // Logical NOT
    if (this.check('EXCLAMATION')) {
      this.advance();
      const arg = this.parseUnary();
      return { type: 'unary', operator: '!', argument: arg };
    }

    // Handle unary minus and plus
    if (this.check('MINUS') || this.check('PLUS')) {
      const operator = this.current().type === 'MINUS' ? '-' : '+';
      this.advance();
      const arg = this.parseUnary();

      // If argument is a number literal, fold the operation
      if (typeof arg === 'number') {
        return operator === '-' ? -arg : arg;
      }

      return { type: 'unary', operator, argument: arg };
    }

    return this.parsePrimary();
  }

  /**
   * Parse a primary value (literal, identifier, parenthesis, etc.)
   */
  private parsePrimary(): unknown {
    const token = this.current();

    if (token.type === 'STRING') {
      this.advance();
      return token.value;
    }

    if (token.type === 'NUMBER') {
      this.advance();
      const match = token.value.match(/^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(.*)?$/i);
      if (match) {
        const num = parseFloat(match[1]);
        const unit = match[2];
        if (unit) {
          return `${num}${unit}`;
        }
        return num;
      }
      return parseFloat(token.value);
    }

    if (token.type === 'BOOLEAN') {
      this.advance();
      return token.value === 'true';
    }

    if (token.type === 'NULL') {
      this.advance();
      return null;
    }

    if (token.type === 'EXPRESSION') {
      this.advance();
      const exprId = `expr_${this.compiledExpressions.size}`;
      this.compiledExpressions.set(exprId, token.value);
      return { __expr: exprId, __raw: token.value };
    }

    if (token.type === 'TEMPLATE_STRING') {
      this.advance();
      return { type: 'templateLiteral', value: token.value };
    }

    if (token.type === 'LBRACKET') {
      return this.parseArray();
    }

    if (token.type === 'LBRACE') {
      return this.parseBlockContent();
    }

    // Handle hash color literals: #fff, #ff0000, #rgba, etc.
    if (token.type === 'HASH') {
      this.advance();
      // The next token should be an identifier or number containing the hex color
      const nextToken = this.current();
      if (nextToken.type === 'IDENTIFIER' || nextToken.type === 'NUMBER') {
        const hexValue = this.advance().value;
        return `#${hexValue}`;
      }
      // Handle cases where the hex digits were tokenized differently
      return `#`;
    }

    // @ts-expect-error - THIS token type may not be in the union
    if (token.type === 'THIS') {
      this.advance();
      let ref = 'this';
      // Support dotted access: this.prop.sub
      while (this.check('DOT')) {
        this.advance();
        const part = this.expect('IDENTIFIER', 'Expected property name').value;
        ref += '.' + part;
      }
      return { __ref: ref };
    }

    if (token.type === 'LPAREN') {
      // Check if this is an arrow function: (params) => ...
      // We need to look ahead.
      // Simple heuristic: if we find ) followed by => or : then =>, it's an arrow function.
      let isArrow = false;
      let i = 1;
      let parenDepth = 1;
      while (this.peek(i).type !== 'EOF') {
        const t = this.peek(i);
        if (t.type === 'LPAREN') parenDepth++;
        if (t.type === 'RPAREN') {
          parenDepth--;
          if (parenDepth === 0) {
            // Check next token
            const next = this.peek(i + 1);
            if (next.type === 'ARROW') isArrow = true;
            if (next.type === 'COLON') {
              // Check if return type follows (a): Type =>
              // Skip return type to find arrow
              let j = i + 2;
              while (
                this.peek(j).type === 'IDENTIFIER' ||
                this.peek(j).type === 'LBRACKET' ||
                this.peek(j).type === 'RBRACKET'
              )
                j++;
              if (this.peek(j).type === 'ARROW') isArrow = true;
            }
            break;
          }
        }
        i++;
      }

      if (isArrow) {
        return this.parseArrowFunction();
      }
      // Otherwise, assume it's a grouped expression or tuple?
      // HoloScript doesn't have tuples yet. But let's fallback to parseParenString if string, or error?
      // Recover:
      // this.advance(); return null;
      // Actually, might be `(expression)`.
      // Let's assume generic inline tuple
      return this.parseParenExpression();
    }

    // Handle match expression: match subject { pattern => body, ... }
    if (token.type === 'MATCH') {
      return this.parseMatchExpression();
    }

    // Handle IDENTIFIER and keyword tokens that can be used as identifiers in expressions
    // STATE, INITIAL, etc. are keywords but can also be valid identifiers in expressions
    // Note: MATCH is already handled above via parseMatchExpression()
    const isIdentifierLike =
      token.type === 'IDENTIFIER' ||
      token.type === 'STATE' ||
      token.type === 'INITIAL' ||
      token.type === 'STATE_MACHINE' ||
      token.type === 'TRANSITION' ||
      token.type === 'ON_ENTRY' ||
      token.type === 'ON_EXIT';

    if (isIdentifierLike) {
      if (this.peek(1).type === 'ARROW') {
        return this.parseArrowFunction();
      }

      this.advance();
      let ref = token.value;

      // Support dotted access: obj.prop.sub, optional chaining: obj?.prop, computed: obj[key]
      while (this.check('DOT') || this.check('OPTIONAL_DOT') || this.check('LBRACKET')) {
        if (this.check('OPTIONAL_DOT')) {
          this.advance(); // ?.
          // Allow keywords as property names after ?.
          const nextToken = this.current();
          const isPropertyName =
            nextToken.type === 'IDENTIFIER' ||
            nextToken.type === 'STATE' ||
            nextToken.type === 'INITIAL' ||
            nextToken.type === 'STATE_MACHINE' ||
            nextToken.type === 'TRANSITION' ||
            nextToken.type === 'ON_ENTRY' ||
            nextToken.type === 'ON_EXIT';
          if (isPropertyName) {
            ref += '?.' + this.advance().value;
          } else {
            this.error('Expected property name after optional chaining (?.)', 'HSP002');
          }
        } else if (this.check('LBRACKET')) {
          this.advance(); // [
          const indexExpr = this.parseValue();
          this.expect('RBRACKET', 'Expected ]');
          const base = ref;
          // Return computed member as a structured node; further chaining is not supported inline
          return { type: 'computedMember', object: { __ref: base }, property: indexExpr };
        } else {
          this.advance(); // .
          // Allow keywords as property names too
          const nextToken = this.current();
          const isPropertyName =
            nextToken.type === 'IDENTIFIER' ||
            nextToken.type === 'STATE' ||
            nextToken.type === 'INITIAL' ||
            nextToken.type === 'STATE_MACHINE' ||
            nextToken.type === 'TRANSITION' ||
            nextToken.type === 'ON_ENTRY' ||
            nextToken.type === 'ON_EXIT';
          if (isPropertyName) {
            ref += '.' + this.advance().value;
          } else {
            this.error('Expected property name after dot (.)', 'HSP002');
          }
        }
      }

      // Support call expression: ref(args)
      if (this.check('LPAREN')) {
        const args = this.parseParenExpression();
        return { type: 'call', callee: ref, args };
      }

      return { __ref: ref };
    }

    if (this.check('AT')) {
      const dir = this.parseDirective();
      return dir;
    }

    // CRITICAL: Advance to prevent infinite loop
    this.error(
      `Unexpected token in expression: ${token.type} "${token.value}". Expected value, identifier, or expression`,
      'HSP300'
    );
    const err = new Error('ParseError');
    err.message = 'ParseError';
    throw err;
  }

  private parseParenExpression(): unknown {
    // Basic support for (a, b) or (expr)
    this.expect('LPAREN', 'Expected (');
    const items: unknown[] = [];
    while (!this.check('RPAREN') && !this.check('EOF')) {
      items.push(this.parseValue());
      if (this.check('COMMA')) this.advance();
    }
    this.expect('RPAREN', 'Expected )');
    return items.length === 1 ? items[0] : items;
  }

  private parseArrowFunction(): Record<string, unknown> {
    const params: Array<{ name: string; type: string | null; rest?: boolean }> = [];

    // Parse params
    if (this.check('LPAREN')) {
      this.advance();
      while (!this.check('RPAREN') && !this.check('EOF')) {
        // Support rest parameters: (...args)
        if (this.check('SPREAD')) {
          this.advance(); // consume ...
          const name = this.expect('IDENTIFIER', 'Expected parameter name after ...').value;
          let type = null;
          if (this.check('COLON')) {
            this.advance();
            type = this.expect('IDENTIFIER', 'Expected type').value;
          }
          params.push({ name, type, rest: true });
          // Rest parameter must be last, skip to end
          if (this.check('COMMA')) this.advance();
          break;
        }

        const name = this.expect('IDENTIFIER', 'Expected parameter name').value;
        let type = null;
        if (this.check('COLON')) {
          this.advance();
          type = this.expect('IDENTIFIER', 'Expected type').value;
        }
        params.push({ name, type });
        if (this.check('COMMA')) this.advance();
      }
      this.expect('RPAREN', 'Expected )');
    } else {
      // Single arg (could also be rest: ...args => ...)
      if (this.check('SPREAD')) {
        this.advance();
        const name = this.expect('IDENTIFIER', 'Expected parameter name after ...').value;
        params.push({ name, type: null, rest: true });
      } else {
        const name = this.expect('IDENTIFIER', 'Expected parameter name').value;
        params.push({ name, type: null });
      }
    }

    // Parse Return Type (optional)
    let returnType = null;
    if (this.check('COLON')) {
      this.advance();
      returnType = this.expect('IDENTIFIER', 'Expected return type').value;
    }

    this.expect('ARROW', 'Expected =>');

    // Parse Body
    let body: unknown;
    if (this.check('LBRACE')) {
      body = this.parseCodeBlock(); // treat as string for now
    } else {
      body = this.parseInlineExpression();
    }

    return { type: 'arrow_function', params, returnType, body };
  }

  private parseArray(): unknown[] {
    const arr: unknown[] = [];
    this.expect('LBRACKET', 'Expected [');
    this.skipNewlines();

    while (!this.check('RBRACKET') && !this.check('EOF')) {
      const beforePos = this.pos;
      this.skipNewlines();

      // Prevent infinite loop - if we can't parse anything, skip the token
      if (this.check('RBRACKET') || this.check('EOF')) break;

      // Support array spread: [...array, ...otherArray, value]
      if (this.check('SPREAD')) {
        this.advance(); // consume ...
        const spreadArg = this.parseValue();
        if (spreadArg === null) {
          this.error(
            'Expected expression after spread operator (...) in array. Example: [...items]',
            'HSP300'
          );
        } else {
          arr.push({ type: 'spread', argument: spreadArg });
        }
      } else {
        const value = this.parseValue();
        if (value !== null) {
          arr.push(value);
        } else if (this.pos === beforePos) {
          // No progress made, skip this token to prevent infinite loop
          this.advance();
        }
      }

      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACKET', 'Expected ]');
    return arr;
  }

  private parseObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    this.expect('LBRACE', 'Expected {');
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();

      // Prevent infinite loop - exit if we hit unexpected token
      if (this.check('RBRACE') || this.check('EOF')) break;

      // Support object spread: {...template, ...other, key: value}
      if (this.check('SPREAD')) {
        this.advance(); // consume ...
        const spreadArg = this.parseValue();
        if (spreadArg === null) {
          this.error(
            'Expected expression after spread operator (...) in object. Example: {...template}',
            'HSP300'
          );
        } else {
          const spreadKey = `__spread_${Object.keys(obj).length}`;
          obj[spreadKey] = { type: 'spread', argument: spreadArg };
        }
      } else if (this.check('IDENTIFIER')) {
        const key = this.advance().value;
        if (this.check('COLON') || this.check('EQUALS')) {
          this.advance();
          obj[key] = this.parseValue();
        } else {
          obj[key] = true;
        }
      } else {
        // Skip unexpected token
        this.advance();
        continue;
      }
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return obj;
  }

  /**
   * Parse a match expression: match subject { pattern => body, ... }
   * Supports:
   * - Literal patterns: "idle", 42, true
   * - Wildcard pattern: _
   * - Binding patterns: x (captures value)
   * - Guard clauses: pattern if condition => body
   */
  private parseMatchExpression(): Record<string, unknown> | null {
    const startToken = this.current();
    this.expect('MATCH', 'Expected match keyword');

    // Parse the subject being matched
    const subject = this.parseValue();
    if (subject === null) {
      this.error('Expected expression after match keyword', 'HSP300');
      return null;
    }

    this.expect('LBRACE', 'Expected { after match subject');
    this.skipNewlines();

    const cases: Array<Record<string, unknown>> = [];
    let hasWildcard = false;

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE')) break;

      const caseNode = this.parseMatchCase();
      if (caseNode) {
        cases.push(caseNode);

        // Check if this case has a wildcard pattern
        if (
          caseNode.pattern &&
          (caseNode.pattern as Record<string, unknown>).type === 'wildcard-pattern'
        ) {
          hasWildcard = true;
        }
      }

      // Handle comma or newline separators
      if (this.check('COMMA')) this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected } to close match expression');

    return {
      type: 'match',
      subject,
      cases,
      hasWildcard,
      sourceLocation: {
        line: startToken.line,
        column: startToken.column,
      },
    };
  }

  /**
   * Parse a single match case: pattern [if guard] => body
   */
  private parseMatchCase(): Record<string, unknown> | null {
    const pattern = this.parseMatchPattern();
    if (!pattern) {
      return null;
    }

    // Optional guard clause: pattern if condition => body
    let guard: string | undefined;
    if (this.check('IDENTIFIER') && this.current().value === 'if') {
      this.advance(); // consume 'if'

      // Parse guard expression until we hit =>
      let guardExpr = '';
      while (!this.check('ARROW') && !this.check('EOF') && !this.check('RBRACE')) {
        guardExpr += this.current().value + ' ';
        this.advance();
      }
      guard = guardExpr.trim();
    }

    this.expect('ARROW', 'Expected => after match pattern');

    // Parse the body - can be a single expression or a block
    let body: unknown;
    if (this.check('LBRACE')) {
      body = this.parseBlockContent();
    } else {
      body = this.parseValue();
    }

    return {
      type: 'match-case',
      pattern,
      body,
      guard,
    };
  }

  /**
   * Parse a match pattern:
   * - Literal: "string", 42, true
   * - Wildcard: _
   * - Binding: identifier
   */
  private parseMatchPattern(): Record<string, unknown> | null {
    const token = this.current();

    // Wildcard pattern: _
    if (token.type === 'UNDERSCORE' || (token.type === 'IDENTIFIER' && token.value === '_')) {
      this.advance();
      return {
        type: 'wildcard-pattern',
        symbol: '_',
      };
    }

    // String literal pattern
    if (token.type === 'STRING') {
      this.advance();
      return {
        type: 'literal-pattern',
        value: token.value,
      };
    }

    // Number literal pattern
    if (token.type === 'NUMBER') {
      this.advance();
      return {
        type: 'literal-pattern',
        value: parseFloat(token.value),
      };
    }

    // Boolean literal pattern
    if (token.type === 'BOOLEAN') {
      this.advance();
      return {
        type: 'literal-pattern',
        value: token.value === 'true',
      };
    }

    // Binding pattern (identifier captures the value)
    if (token.type === 'IDENTIFIER') {
      this.advance();
      return {
        type: 'binding-pattern',
        name: token.value,
      };
    }

    // NULL pattern
    if (token.type === 'NULL') {
      this.advance();
      return {
        type: 'literal-pattern',
        value: null,
      };
    }

    this.error(`Expected match pattern (literal, identifier, or _), got ${token.type}`, 'HSP300');
    return null;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '', line: 0, column: 0 };
  }

  private peek(offset: number = 0): Token {
    return this.tokens[this.pos + offset] || { type: 'EOF', value: '', line: 0, column: 0 };
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private advance(): Token {
    const token = this.current();
    if (this.pos < this.tokens.length) {
      this.pos++;
    }
    return token;
  }

  private previous(): Token {
    return this.tokens[this.pos - 1] || this.current();
  }

  private match(types: TokenType[]): Token | null {
    for (const type of types) {
      if (this.check(type)) {
        return this.advance();
      }
    }
    return null;
  }

  private expect(type: TokenType, message: string): Token {
    if (!this.check(type)) {
      const current = this.current();
      const fullMessage = `${message}. Got ${current.type} "${current.value}"`;

      // Use specific error codes based on expected token type
      let errorCode: RichErrorCode = 'HSP001';
      let suggestion: string | undefined;

      switch (type) {
        case 'RBRACE':
          errorCode = 'HSP004'; // Unclosed brace
          suggestion =
            'Check for matching opening brace { and ensure all blocks are properly closed';
          break;
        case 'RBRACKET':
          errorCode = 'HSP005'; // Unclosed bracket
          suggestion =
            'Check for matching opening bracket [ and ensure all arrays are properly closed';
          break;
        case 'RPAREN':
          errorCode = 'HSP006'; // Unclosed parenthesis
          suggestion =
            'Check for matching opening parenthesis ( and ensure all expressions are properly closed';
          break;
        case 'COLON':
          errorCode = 'HSP009'; // Missing colon
          suggestion = 'Properties use colon syntax: propertyName: value';
          break;
        case 'IDENTIFIER':
          errorCode = 'HSP002';
          // Try to provide a suggestion if the token looks like a typo
          if (current.type === 'IDENTIFIER') {
            const similar = findSimilarKeyword(current.value);
            if (similar) {
              suggestion = `Did you mean '${similar}'?`;
            }
          }
          break;
        case 'LBRACE':
          errorCode = 'HSP100'; // Invalid structure
          suggestion = 'Expected opening brace { to start block';
          break;
        default:
          errorCode = 'HSP001';
      }

      if (suggestion) {
        this.errorWithSuggestion(fullMessage, suggestion, errorCode);
      } else {
        this.error(fullMessage, errorCode);
      }

      // If it's a major structure failure, synchronize
      if (type === 'RBRACE' || type === 'LBRACE' || type === 'IDENTIFIER') {
        this.synchronize();
      }

      return current;
    }
    return this.advance();
  }

  private skipNewlines(): void {
    while (this.check('NEWLINE') || this.check('INDENT') || this.check('DEDENT')) {
      this.advance();
    }
  }

  /** Skip a balanced parenthesised list ( ... ) including nested parens */
  private skipParens(): void {
    if (!this.check('LPAREN')) return;
    this.advance(); // (
    let depth = 1;
    while (depth > 0 && !this.check('EOF')) {
      if (this.check('LPAREN')) depth++;
      if (this.check('RPAREN')) depth--;
      this.advance();
    }
  }

  private skipBraces(): void {
    if (!this.check('LBRACE')) return;
    this.advance(); // {
    let depth = 1;
    while (depth > 0 && !this.check('EOF')) {
      if (this.check('LBRACE')) depth++;
      if (this.check('RBRACE')) depth--;
      this.advance();
    }
  }

  private error(message: string, code: RichErrorCode = 'HSP001'): void {
    const token = this.current();
    const line = token.line;
    const column = token.column;

    // Try to find a suggestion for common mistakes
    let suggestion: string | undefined;
    if (token.type === 'IDENTIFIER') {
      const similar = findSimilarKeyword(token.value);
      if (similar) {
        suggestion = `Did you mean '${similar}'?`;
      }
    }

    this.errors.push(
      createRichError(code, message, line, column, {
        source: this.source,
        suggestion,
        severity: 'error',
      })
    );
  }

  private errorWithSuggestion(
    message: string,
    suggestion: string,
    code: RichErrorCode = 'HSP001'
  ): void {
    const token = this.current();
    this.errors.push(
      createRichError(code, message, token.line, token.column, {
        source: this.source,
        suggestion,
        severity: 'error',
      })
    );
  }

  private traitError(traitName: string): void {
    const token = this.current();
    this.errors.push(createTraitError(traitName, token.line, token.column, this.source));
  }

  private warn(message: string, code: RichErrorCode = 'HSP001'): void {
    const token = this.current();
    this.warnings.push(
      createRichError(code, message, token.line, token.column, {
        source: this.source,
        severity: 'warning',
      })
    );
  }

  /**
   * Detect common mistakes and provide context-aware error messages
   */
  private detectCommonMistake(): {
    message: string;
    suggestion: string;
    code: RichErrorCode;
  } | null {
    const current = this.current();
    const prev = this.pos > 0 ? this.tokens[this.pos - 1] : null;
    const next = this.pos + 1 < this.tokens.length ? this.tokens[this.pos + 1] : null;

    // Common mistake: Using = instead of : for property assignment
    if (current.type === 'EQUALS' && prev?.type === 'IDENTIFIER') {
      return {
        message: `Unexpected '=' after property name '${prev.value}'`,
        suggestion: "Use ':' instead of '=' for property assignment. Example: propertyName: value",
        code: 'HSP009',
      };
    }

    // Common mistake: Using semicolon (JavaScript habit)
    if (current.value === ';') {
      return {
        message: 'Unexpected semicolon',
        suggestion: 'HoloScript does not require semicolons. Remove the semicolon to continue.',
        code: 'HSP001',
      };
    }

    // Common mistake: Missing @ before trait
    if (current.type === 'IDENTIFIER' && (VR_TRAITS as readonly string[]).includes(current.value)) {
      if (prev?.type !== 'AT') {
        return {
          message: `'${current.value}' is a trait and requires '@' prefix`,
          suggestion: `Use '@${current.value}' to apply this trait`,
          code: 'HSP200',
        };
      }
    }

    // Common mistake: Quoted property names (JSON habit)
    if (current.type === 'STRING' && next?.type === 'COLON') {
      return {
        message: 'Property names should not be quoted in HoloScript',
        suggestion: `Remove quotes: use ${current.value.replace(/['"]/g, '')}: instead of "${current.value}":`,
        code: 'HSP101',
      };
    }

    // Common mistake: Using 'function' keyword instead of arrow function
    if (current.value === 'function' && prev?.type === 'COLON') {
      return {
        message: "Unexpected 'function' keyword",
        suggestion: 'Use arrow function syntax: handler: (args) => { ... }',
        code: 'HSP300',
      };
    }

    // Common mistake: Triple dots without target
    if (
      current.type === 'SPREAD' &&
      next &&
      (next.type === 'RBRACE' ||
        next.type === 'RBRACKET' ||
        next.type === 'COMMA' ||
        next.type === 'NEWLINE')
    ) {
      return {
        message: 'Spread operator (...) requires a target expression',
        suggestion: 'Provide an expression to spread: ...targetObject or ...targetArray',
        code: 'HSP002',
      };
    }

    return null;
  }

  /**
   * Enhanced error reporting with common mistake detection
   */
  private errorWithContext(message: string, code: RichErrorCode = 'HSP001'): void {
    // First check for common mistakes
    const commonMistake = this.detectCommonMistake();
    if (commonMistake) {
      this.errorWithSuggestion(commonMistake.message, commonMistake.suggestion, commonMistake.code);
      return;
    }

    // Fall back to standard error
    this.error(message, code);
  }

  /**
   * Synchronize parser state after an error
   * Skips tokens until a potential recovery point (newline followed by keyword/directive)
   */
  private synchronize(): void {
    this.advance();

    while (!this.check('EOF')) {
      if (this.check('RBRACE')) {
        return;
      }

      // Stop at major keywords that indicate start of a new definition
      if (
        this.check('IDENTIFIER') &&
        ['orb', 'template', 'logic', 'object', 'composition', 'scene', 'group'].includes(
          this.current().value
        )
      ) {
        return;
      }

      // We can also stop at AT directives as they often preceded definitions
      if (this.check('AT')) {
        return;
      }

      this.advance();
    }
  }

  /**
   * Mini-sync for property lists: skips until next line or comma
   */
  private synchronizeProperty(): void {
    // Skip past the problematic token
    this.advance();

    // Look for the next property or block marker
    while (!this.check('EOF')) {
      // Stop at block boundaries
      if (this.check('RBRACE') || this.check('LBRACE')) {
        return;
      }

      // Check if current token looks like a property key (handles case where we advanced INTO the next property)
      if (
        this.check('IDENTIFIER') ||
        this.check('STRING') ||
        this.check('SPREAD') ||
        this.check('AT')
      ) {
        return;
      }

      // Stop at line endings (next property likely on next line)
      if (this.check('NEWLINE')) {
        this.advance();
        this.skipNewlines();
        // Check if next token looks like a property key
        if (
          this.check('IDENTIFIER') ||
          this.check('STRING') ||
          this.check('SPREAD') ||
          this.check('AT')
        ) {
          return;
        }
      }
      // Stop at commas (separator between properties/values)
      if (this.check('COMMA')) {
        this.advance();
        return;
      }
      this.advance();
    }
  }

  /**
   * Synchronize for array context: skip to next valid array element or closing bracket
   */
  private synchronizeArray(): void {
    while (!this.check('EOF')) {
      // Stop at array boundary
      if (this.check('RBRACKET')) {
        return;
      }

      // Stop at comma (next element)
      if (this.check('COMMA')) {
        this.advance();
        this.skipNewlines();
        return;
      }

      // Stop at newline followed by likely array element
      if (this.check('NEWLINE')) {
        this.advance();
        this.skipNewlines();
        if (this.check('RBRACKET') || this.isLikelyValue(this.current()) || this.check('SPREAD')) {
          return;
        }
      }

      this.advance();
    }
  }

  /**
   * Synchronize for expression context: skip to end of expression
   */
  private synchronizeExpression(): void {
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;

    while (!this.check('EOF')) {
      const token = this.current();

      // Track nesting
      if (token.type === 'LPAREN') parenDepth++;
      else if (token.type === 'RPAREN') {
        if (parenDepth === 0) return; // Expression boundary
        parenDepth--;
      } else if (token.type === 'LBRACE') braceDepth++;
      else if (token.type === 'RBRACE') {
        if (braceDepth === 0) return; // Expression boundary
        braceDepth--;
      } else if (token.type === 'LBRACKET') bracketDepth++;
      else if (token.type === 'RBRACKET') {
        if (bracketDepth === 0) return; // Expression boundary
        bracketDepth--;
      }

      // Stop at natural expression boundaries (when balanced)
      if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
        if (this.check('NEWLINE') || this.check('COMMA')) {
          return;
        }
      }

      this.advance();
    }
  }

  /**
   * Attempt to recover from missing colon by looking ahead
   * Returns true if recovery was successful
   */
  private tryRecoverMissingColon(): boolean {
    // If current is IDENTIFIER and next looks like a value, insert implicit colon
    if (this.check('IDENTIFIER')) {
      const nextPos = this.pos + 1;
      if (nextPos < this.tokens.length) {
        const nextToken = this.tokens[nextPos];
        if (this.isLikelyValue(nextToken) || nextToken.type === 'IDENTIFIER') {
          // Report warning about missing colon
          this.warn(
            `Missing colon after property "${this.current().value}". Consider adding ':' between property name and value`,
            'HSP009'
          );
          return true; // Continue parsing as if colon was there
        }
      }
    }
    return false;
  }

  /**
   * Helper to check if current token is a natural boundary after a value
   */
  private isValueBoundary(): boolean {
    return (
      this.check('NEWLINE') ||
      this.check('RBRACE') ||
      this.check('COMMA') ||
      this.check('IDENTIFIER') ||
      this.check('SPREAD') ||
      this.check('AT') ||
      this.check('EOF')
    );
  }

  /**
   * Helper to check if a token is likely the start of a value
   */
  private isLikelyValue(token: Token): boolean {
    return (
      token.type === 'STRING' ||
      token.type === 'NUMBER' ||
      token.type === 'LBRACKET' ||
      token.type === 'LBRACE' ||
      token.type === 'BOOLEAN' ||
      token.type === 'NULL' ||
      token.type === 'TEMPLATE_STRING'
    );
  }

  /**
   * Parse a block of raw code (balanced braces)
   */
  private parseRawBlock(): string {
    const startToken = this.expect('LBRACE', 'Expected {');
    const startOffset = startToken.offset + 1; // Just after the brace

    // We iterate tokens until we find the matching RBRACE
    let braceDepth = 1;
    let endOffset = startOffset;

    while (braceDepth > 0 && this.pos < this.tokens.length) {
      const token = this.current();

      if (token.type === 'EOF') break;

      if (token.type === 'LBRACE') {
        braceDepth++;
      } else if (token.type === 'RBRACE') {
        braceDepth--;
        if (braceDepth === 0) {
          endOffset = token.offset; // Just before the closing brace
          break;
        }
      }

      this.advance();
    }

    this.expect('RBRACE', 'Expected }');
    return this.source.substring(startOffset, endOffset).trim();
  }
}

export function createParser(options?: HSPlusParserOptions): HoloScriptPlusParser {
  return new HoloScriptPlusParser(options);
}

export function parse(source: string, options?: HSPlusParserOptions): HSPlusCompileResult {
  const parser = createParser(options);
  return parser.parse(source);
}
