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
  HSPlusTraitAtom,
  HSPlusTraitDirective,
  HSPlusTraitSumDirective,
} from '../types/AdvancedTypeSystem';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { VRTraitName } from '../types';
import {
  isCognitiveVerb,
  isBrainKeyword,
  nearestCognitiveVerb,
  type CognitiveVerb,
  type HoloCognitiveAction,
} from '../traits/cognitive/CognitiveActions';
import {
  coerceFrameDeclarationConfig,
  type FrameDeclaration,
} from '../traits/FrameDeclarationTrait';
import { isLocomotionReactionTrigger } from '../traits/locomotion/LocomotionActions';
import type { ReactionCategory } from '../types/base';

export type {
  ASTProgram,
  HSPlusNode,
  HSPlusDirective,
  HSPlusCompileResult,
  HSPlusParserOptions,
  HSPlusTraitAtom,
  HSPlusTraitDirective,
  HSPlusTraitSumDirective,
  VRTraitName,
  HoloCognitiveAction,
  CognitiveVerb,
};

// =============================================================================
// MMO BRAIN / TRAIT AST TYPES
// =============================================================================

/** A named brain state block inside a `brain` declaration. */
export interface HoloBrainState {
  name: string;
  /** Transitions authored as `transition to <target> @when { ... }` */
  transitions: Array<{ to: string; when?: string }>;
  /** Free-form action strings collected from the state body */
  actions: string[];
  /**
   * Typed cognitive operations authored inline in this state, e.g.
   * `llm_call { prompt: "..." }`, `recall { query: "..." }`, `plan { ... }`.
   * These dispatch to the real cognitive traits instead of an opaque string.
   */
  cognitiveActions?: HoloCognitiveAction[];
  /** Trait annotations found inside this state */
  traits: Record<string, unknown>;
}

/**
 * Top-level `brain` declaration node.
 *
 * Syntax:
 *   brain DragonAI : @behavior_tree {
 *     @personality aggressive
 *     @memory_persistence true
 *     state idle { transition to patrol @when { hp > 0.5 } }
 *     state combat { ... }
 *   }
 */
export interface HoloBrainDecl {
  type: 'brain';
  name: string;
  brainType: 'behavior_tree' | 'decision_tree' | 'neural' | 'scripted';
  personality?: string;
  factionAlignment?: string;
  memoryPersistence?: boolean;
  /** @preferred_ability "AbilityName" @when { ... } */
  preferredAbility?: { name: string; when?: string };
  /** @flee_threshold 0.15 — flee when HP fraction drops below this value */
  fleeThreshold?: number;
  /** @patrol_speed value */
  patrolSpeed?: number | string;
  /** @waypoints [...] */
  waypoints?: unknown[];
  /**
   * Declarative GOAP goals — `@goal { name, desiredState, priority }`. Feed the
   * (already-built, A*-planning) GoalOrientedTrait, which prior brains never used.
   */
  goals?: Array<{ name: string; desiredState?: Record<string, unknown>; priority?: number }>;
  /**
   * Declarative escalation conditions — `@escalation { on, action }`. Compile to
   * LLMAgentTrait's EscalationCondition[] (auditable for regulated domains).
   */
  escalations?: Array<{ on: string; action: string }>;
  /**
   * Declarative provider preference — `@provider_policy { prefer, fallback, requires }`.
   * A load-time hint the sovereign-first resolver reads (it does NOT duplicate the resolver).
   */
  providerPolicy?: { prefer?: string; fallback?: string; requires?: string };
  /**
   * Explicit frame of reference — `@frame_declaration { domain, horizon, capability_tier,
   * trust_tier, allowed_tools, denied_domains }`. Declares the agent's epistemic scope at
   * construction time. The runtime uses this to detect boundary violations: a tool call
   * outside the declared frame emits `frame_violation` instead of hallucinating through
   * the frame edge. Absent = unrestricted frame (no boundary enforcement).
   */
  frameDeclaration?: FrameDeclaration;
  states: HoloBrainState[];
  traits: Record<string, unknown>;
}

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
import { ChunkBasedIncrementalParser, type IncrementalParseResult } from './IncrementalParser';
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

      if (this.column === 1) {
        const beforePos = this.pos;
        const beforeTokenCount = this.tokens.length;
        const beforePendingDedents = this.pendingDedents;
        this.handleIndentation();
        if (
          this.pos !== beforePos ||
          this.tokens.length !== beforeTokenCount ||
          this.pendingDedents !== beforePendingDedents
        ) {
          continue;
        }
      }

      const char = this.source[this.pos];

      // Skip whitespace (but track indentation at line start)
      if (char === ' ' || char === '\t') {
        this.advance();
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
  private blockConfigDirectives: WeakSet<object> = new WeakSet();
  private blockConfigDirectiveLocations: WeakMap<object, Token> = new WeakMap();
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

  /**
   * Internal incremental parser for parseIncremental.
   * Uses ChunkBasedIncrementalParser with AST-aware chunking and
   * dependency tracking — no fallback to full re-parse for unchanged chunks.
   */
  private _incrementalParser: ChunkBasedIncrementalParser | null = null;

  /**
   * Per-cache incremental parser map so callers can supply their own cache
   * and still get a dedicated ChunkBasedIncrementalParser instance.
   */
  private _incrementalParserCache: Map<ParseCache, ChunkBasedIncrementalParser> = new Map();

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
    this.blockConfigDirectives = new WeakSet();
    this.blockConfigDirectiveLocations = new WeakMap();
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

    // Desugar composite primitives (e.g. @safe_daemon → the 5 safety traits)
    this.desugarSafeDaemon(root);

    // Build AST
    return this.buildResult(root);
  }

  /** Canonical safety-trait configs that `@safe_daemon` expands into. */
  private static safeDaemonDefaults(): Record<string, Record<string, unknown>> {
    return {
      rate_limiter: { strategy: 'token_bucket', max_tokens: 20, refill_rate: 4, window_ms: 60000 },
      circuit_breaker: {
        failure_threshold: 5,
        window_ms: 300000,
        reset_timeout_ms: 600000,
        success_threshold: 2,
        failure_rate_threshold: 0,
        min_requests: 5,
      },
      timeout_guard: { default_timeout_ms: 30000, fallback_action: 'abort' },
      economy: {
        initial_balance: 5,
        default_spend_limit: 1,
        spend_limit_period: 3600000,
        max_transaction_history: 200,
        escrow_enabled: false,
      },
      structured_logger: {
        min_level: 'info',
        max_entries: 500,
        rotation_count: 100,
        emit_events: true,
        console_output: true,
      },
    };
  }

  /**
   * Expand a `@safe_daemon { ... }` config into the five safety traits it
   * stands for (@rate_limiter + @circuit_breaker + @timeout_guard + @economy +
   * @structured_logger). Supports flat convenience overrides (budget / rate /
   * timeout_ms / …) and nested per-trait overrides (economy: { ... }).
   */
  private expandSafeDaemon(config: unknown): Array<[string, Record<string, unknown>]> {
    const c = config && typeof config === 'object' ? (config as Record<string, unknown>) : {};
    const out = HoloScriptPlusParser.safeDaemonDefaults();

    const num = (v: unknown): v is number => typeof v === 'number';
    if (num(c.budget)) out.economy.initial_balance = c.budget;
    if (num(c.spend_limit)) out.economy.default_spend_limit = c.spend_limit;
    if (num(c.rate)) out.rate_limiter.refill_rate = c.rate;
    if (num(c.max_tokens)) out.rate_limiter.max_tokens = c.max_tokens;
    if (num(c.window_ms)) out.rate_limiter.window_ms = c.window_ms;
    if (num(c.failure_threshold)) out.circuit_breaker.failure_threshold = c.failure_threshold;
    if (num(c.reset_timeout_ms)) out.circuit_breaker.reset_timeout_ms = c.reset_timeout_ms;
    if (num(c.timeout_ms)) out.timeout_guard.default_timeout_ms = c.timeout_ms;
    if (typeof c.log_level === 'string') out.structured_logger.min_level = c.log_level;

    // Nested per-trait deep overrides
    for (const t of ['rate_limiter', 'circuit_breaker', 'timeout_guard', 'economy', 'structured_logger']) {
      const override = c[t];
      if (override && typeof override === 'object') Object.assign(out[t], override as Record<string, unknown>);
    }
    return Object.entries(out);
  }

  /**
   * Walk the parsed AST and expand every `@safe_daemon` into its five safety
   * traits, wherever traits are stored: a node's `traits` Map (composition /
   * world / object), a brain's `traits` Record, and any `directives` array.
   * Existing per-trait declarations are not overwritten.
   */
  private desugarSafeDaemon(root: HSPlusNode | null): void {
    const seen = new Set<unknown>();
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      const n = node as Record<string, unknown>;

      // traits Map (composition / world / object nodes)
      if (n.traits instanceof Map && n.traits.has('safe_daemon')) {
        const cfg = n.traits.get('safe_daemon');
        n.traits.delete('safe_daemon');
        for (const [name, c] of this.expandSafeDaemon(cfg)) {
          if (!n.traits.has(name)) n.traits.set(name, c);
        }
        this.hasVRTraits = true;
      }

      // traits Record (brain declarations + brain states)
      if (n.traits && !(n.traits instanceof Map) && typeof n.traits === 'object') {
        const rec = n.traits as Record<string, unknown>;
        if ('safe_daemon' in rec) {
          const cfg = rec['safe_daemon'];
          delete rec['safe_daemon'];
          for (const [name, c] of this.expandSafeDaemon(cfg)) {
            if (!(name in rec)) rec[name] = c;
          }
        }
      }

      // directives arrays (standard nodes carry trait directives here too)
      if (Array.isArray(n.directives)) {
        const dirs = n.directives as Array<Record<string, unknown>>;
        const idx = dirs.findIndex((d) => d && d.type === 'trait' && d.name === 'safe_daemon');
        if (idx >= 0) {
          const cfg = dirs[idx].config;
          const expanded = this.expandSafeDaemon(cfg).map(([name, c]) => ({ type: 'trait', name, config: c }));
          const existing = new Set(dirs.map((d) => d.name));
          dirs.splice(idx, 1, ...expanded.filter((e) => !existing.has(e.name)));
        }
      }

      // Recurse into structural children
      for (const key of ['children', 'body', 'states']) {
        const child = n[key];
        if (Array.isArray(child)) child.forEach(visit);
      }
    };
    visit(root);
  }

  /**
   * Performs an incremental parse using ChunkBasedIncrementalParser with
   * AST-aware chunking, hash-based caching, and dependency tracking.
   *
   * Unchanged chunks are served from cache (zero re-parse cost). Only chunks
   * whose content hash changed — plus chunks that reference changed ones via
   * `using`, spread, or `@composition` — are re-parsed.
   *
   * Previous implementation fell back to a full re-parse per chunk because it
   * used `ChunkDetector.detect()` inline without the stateful comparison that
   * `ChunkBasedIncrementalParser` provides. This is now wired through the
   * superior engine (APL WIT audit gap #3, 2026-05-21).
   */
  parseIncremental(source: string, cache: ParseCache = globalParseCache): HSPlusCompileResult {
    // Get or create a ChunkBasedIncrementalParser bound to this cache.
    // Using a per-cache map ensures that callers who supply their own cache
    // get a dedicated incremental parser instance that tracks chunk state
    // correctly, rather than sharing one parser across different caches.
    let incrementalParser = this._incrementalParserCache.get(cache);
    if (!incrementalParser) {
      incrementalParser = new ChunkBasedIncrementalParser(cache);
      this._incrementalParserCache.set(cache, incrementalParser);
    }

    // Run the chunk-based incremental parser — it handles chunk detection,
    // hash comparison, dependency tracking, and cache reuse internally.
    const incrementalResult: IncrementalParseResult = incrementalParser.parse(source);

    // ChunkBasedIncrementalParser parses each chunk starting at line 1.
    // We need to offset line numbers in the AST to match the document position.
    // Detect chunks to get startLine offsets for each top-level block.
    const chunks = ChunkDetector.detect(source);
    const children: HSPlusNode[] =
      incrementalResult.ast.type === 'fragment'
        ? (incrementalResult.ast as any).children || []
        : [incrementalResult.ast as HSPlusNode];

    // Apply line offsets so AST node positions match their document location.
    // Each chunk's AST has line numbers starting from 1 relative to the chunk;
    // we need to shift them by (chunk.startLine - 1) to get absolute positions.
    for (let i = 0; i < children.length; i++) {
      const chunk = chunks[i];
      if (chunk && chunk.startLine > 1) {
        this.offsetNodeLoc(children[i], chunk.startLine - 1);
      }
    }

    // Reset parser state for metadata collection
    this.source = source;
    this.errors = [];
    this.warnings = [];
    this.imports = [];
    this.hasState = false;
    this.hasVRTraits = false;
    this.hasControlFlow = false;
    this.compiledExpressions = new Map();

    // Walk the AST to collect metadata from all nodes (cached + fresh)
    for (const node of children) {
      if (node && typeof node === 'object') {
        const nodeAny = node as any;
        if (nodeAny.traits instanceof Map) {
          for (const [traitName] of nodeAny.traits) {
            const name = String(traitName);
            if (name === 'state') this.hasState = true;
            if (
              name === 'grabbable' ||
              name === 'throwable' ||
              name === 'hoverable' ||
              name === 'clickable' ||
              name === 'collidable'
            ) {
              this.hasVRTraits = true;
            }
          }
        }
      }
    }

    // Build the result using the incremental parser's AST directly.
    // This preserves the full AST structure from ChunkBasedIncrementalParser
    // including proper fragment assembly and dependency tracking.
    const root: HSPlusNode =
      incrementalResult.ast.type === 'fragment'
        ? (incrementalResult.ast as HSPlusNode)
        : ({
            type: 'fragment',
            id: 'root',
            properties: {},
            directives: [],
            children: [incrementalResult.ast as HSPlusNode],
            traits: new Map(),
            loc: incrementalResult.ast.loc || {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
            body: [incrementalResult.ast as HSPlusNode],
          } as unknown as HSPlusNode);

    // Fix fragment loc to span the full document
    if (root.type === 'fragment' && root.loc) {
      root.loc.start = { line: 1, column: 1 };
      if (chunks.length > 0) {
        root.loc.end = { line: chunks[chunks.length - 1].endLine, column: 1 };
      }
    }

    const result = this.buildResult(root);

    // Attach incremental parse metrics to the result for observability.
    // Consumers (LSP, Studio hot-reload, WASM bridge) can use these to
    // decide whether to skip downstream work.
    (result as any).incrementalMetrics = {
      cached: incrementalResult.cached,
      parsed: incrementalResult.parsed,
      duration: incrementalResult.duration,
      changedChunks: incrementalResult.changedChunks,
    };

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

    const children = isFragment ? root.children || [] : [root];
    const worlds = children.filter((c) => c.type === 'world');
    const compositions = children.filter((c) => c.type === 'composition');
    const templates = children.filter((c) => c.type === 'template');
    const npcs = children.filter((c) => c.type === 'npc');

    const ast: ASTProgram = {
      type: 'Program',
      id: 'root',
      properties: isFragment ? root.properties || {} : {},
      directives: directives,
      children: children,
      worlds,
      compositions,
      templates,
      npcs,
      traits: isFragment ? root.traits || new Map() : new Map(),
      loc: root.loc,
      body: children as unknown as HSPlusNode[],
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
          // 3. Intercept top-level .hs process statements: connect / execute.
          // These are IDENTIFIER tokens whose .value matches the keyword.  They
          // are NOT regular nodes (they have no { } body) so they must be parsed
          // before the generic parseNode() path which would try — and fail — to
          // treat the DOT-separated method chains and ARROW tokens as property
          // block content (the HSP101 / HSP-DOT-ARROW bug).
          if (this.check('IDENTIFIER') && this.current().value === 'connect') {
            const connectNode = this.parseHsConnectStatement();
            topLevelNodes.push(connectNode);
          } else if (this.check('IDENTIFIER') && this.current().value === 'execute') {
            const executeNode = this.parseHsExecuteStatement();
            topLevelNodes.push(executeNode);
          } else if (this.check('IDENTIFIER') && isBrainKeyword(this.current().value)) {
            const brainNode = this.parseBrainDeclaration();
            // Attach preceding directives
            (brainNode as unknown as { directives: HSPlusDirective[] }).directives = [
              ...currentDirectives,
              ...((brainNode as unknown as { directives?: HSPlusDirective[] }).directives || []),
            ];
            topLevelNodes.push(brainNode as unknown as HSPlusNode);
          } else {
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
          }
        } else {
          // If directives with no node, handle as global or fragment
          if (currentDirectives.length > 0) {
            if (this.check('EOF')) {
              globalDirectives.push(...currentDirectives);
            } else if (this.check('LBRACE')) {
              // Top-level directive with paren args followed by a config block:
              //   @agent_behavior("dashboard-orchestrator") { on: ..., trigger: ... }
              // Merge the block into the last directive's config. Previously
              // errored (HSP003), so this is strictly more permissive.
              const block = this.parseBlockContent();
              const last = currentDirectives[currentDirectives.length - 1] as unknown as {
                config?: Record<string, unknown>;
              };
              last.config = { ...(last.config || {}), ...block };
              globalDirectives.push(...currentDirectives);
            } else {
              // Unexpected token after directives, report and sync
              this.error(
                `Expected node after directives, got ${this.current().type}. Valid nodes: orb, template, logic, object, world, composition, scene, group`,
                'HSP003'
              );
              globalDirectives.push(...currentDirectives);
              // Not strictly needing full sync here as we handle it, but good practice if error throws
            }
          } else if (!this.check('EOF')) {
            // No directives, no node, but not EOF
            this.error(
              `Unexpected token ${this.current().type} "${this.current().value}" at top level. Expected: composition, object, world, template, logic, or @directive`,
              'HSP001'
            );
            // error() pushes to array, but does NOT throw by default yet.
            // We need to throw to trigger recovery.
            throw new Error('ParseError');
          }
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
      // Accept both quoted and bare template names:
      //   template "InteractiveButton" { ... }
      //   template InteractiveButton { ... }
      // The bare-identifier form previously errored (HSP001), so accepting it
      // is strictly more permissive.
      let templateName: string;
      if (this.check('IDENTIFIER')) {
        templateName = this.advance().value;
      } else {
        templateName = this.expect('STRING', 'Expected template name').value;
      }
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
    // Special handling for reaction blocks: react { on <trigger>(args) => body }
    // Declarative reactions attached to an entity — the .hsplus mirror of the
    // .hs on_* event blocks. Each entry becomes a 'reaction' child node carrying
    // its routing category (see ReactionCategory).
    // =========================================================================
    if (type === 'react') {
      return this.parseHsPlusReactBlock(startToken);
    }

    // =========================================================================
    // Special handling for pipeline DSL blocks (transform, filter, branch, validate)
    // Their bodies contain statement forms the generic property parser rejects:
    // mapping arrows (sku -> productId : multiply(100)), when-guards
    // (when x == y -> sink Z), validate constraints (path.field : required, ...),
    // and YAML-style block scalars (prompt: |). Routed to a dedicated body
    // parser; falls through to the generic node path when no { body } follows.
    // =========================================================================
    if (['transform', 'filter', 'branch', 'validate'].includes(type)) {
      const savedPos = this.pos;
      let blockName = 'anonymous';
      if (this.check('IDENTIFIER') || this.check('STRING')) {
        blockName = this.advance().value;
      }
      if (this.check('LBRACE')) {
        return this.parsePipelineBlock(type, blockName, startToken);
      }
      this.pos = savedPos; // not a DSL block — use the generic node path
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
    // Special handling for timeline blocks (Theatre.js harvest S1)
    // A timeline may contain `track "<target>" { key … }` keyframe channels.
    // The generic node-body parser collapses `track "x" { … }` into two bare
    // boolean properties and silently drops the keyframe block, breaking parity
    // with the canonical Rust grammar (TimelineNode → Track → keyframes). Route
    // to a dedicated parser that produces the same shape.
    // =========================================================================
    if (type === 'timeline') {
      return this.parseTimelineNode(startToken);
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

    if (type === 'composition' || type === 'world') {
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
      // Block-level @traits inside `{ }` are parsed as fragment children; hoist them
      // onto this composition/world node so `traits.has('world_generator')` etc. work.
      const traits = new Map<VRTraitName, unknown>();
      for (const child of compBody.children) {
        if (child.type === 'fragment' && Array.isArray(child.directives)) {
          for (const d of child.directives) {
            if (d.type === 'trait') {
              traits.set(d.name as VRTraitName, d.config);
              this.hasVRTraits = true;
            }
          }
        }
      }
      return {
        type: type === 'composition' ? 'composition' : 'world',
        name: id,
        id,
        properties: compBody.properties || {},
        directives: [],
        children: compBody.children,
        traits,
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
    let ambiguousPreBodyTrait: HSPlusTraitDirective | null = null;

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
              if (
                this.blockConfigDirectives.has(directive as object) &&
                this.traitConfigLooksLikeNodeBody(directive.config)
              ) {
                ambiguousPreBodyTrait = directive;
              }
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

    if (!this.check('LBRACE') && ambiguousPreBodyTrait) {
      this.errorAt(
        this.blockConfigDirectiveLocations.get(ambiguousPreBodyTrait as object) || startToken,
        `Trait @${ambiguousPreBodyTrait.name} used a block that looks like an object body, but no object body follows. Use @${ambiguousPreBodyTrait.name}(...) for trait config, or add a separate { ... } object body.`,
        'HSP101'
      );
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
              token.type === 'HASH' ||
              token.type === 'STATE' ||
              token.type === 'STATE_MACHINE' ||
              token.type === 'INITIAL' ||
              token.type === 'ON_ENTRY' ||
              token.type === 'ON_EXIT' ||
              token.type === 'ON_ERROR' ||
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
                'world',
                'module',
                'struct',
                'orb',
                'on_error',
                'assert',
                'transition',
                'on_entry',
                'on_exit',
                'page',
                'include',
                'brain',
                'react',
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
                    block,
                  } as unknown as HSPlusNode);
                  continue;
                } else {
                  // backtrack
                  this.pos = saved;
                }
              }

              if (name === 'on_entry' || name === 'on_exit') {
                let block = '';
                if (this.check('LBRACE')) {
                  block = this.parseCodeBlock();
                } else {
                  // skip over malformed
                  while (!this.check('RBRACE') && !this.check('EOF')) this.advance();
                }
                children.push({
                  type: 'method',
                  name: name,
                  params: [],
                  returnType: 'unknown',
                  body: block,
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
                    body,
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
                const pipeNext = this.peek(1);
                if (
                  this.check('PIPE') &&
                  (!pipeNext || pipeNext.type === 'NEWLINE' || pipeNext.type === 'EOF')
                ) {
                  // YAML-style block scalar: template: | ... (indented lines)
                  properties[name] = this.parseBlockScalar(this.tokens[saved]);
                } else {
                  properties[name] = this.parseValue();
                }
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
    const isKeyword = ['STATE_MACHINE', 'STATE', 'ON_ENTRY', 'ON_EXIT', 'TRANSITION'].includes(
      nameToken.type
    );
    let name: string;
    if (nameToken.type === 'IDENTIFIER' || isKeyword) {
      this.advance();
      name = nameToken.value;
    } else if (nameToken.type === 'NUMBER' && /^\d+[a-zA-Z]\w*$/.test(nameToken.value)) {
      // Digit-leading directive names (@2d_canvas, @3d_grid): the lexer emits
      // NUMBER("2d") followed by an adjacent IDENTIFIER("_canvas") — stitch them
      // back together. Only fires where the parser previously errored (HSP201),
      // so it cannot regress a passing parse.
      this.advance();
      name = nameToken.value;
      const next = this.current();
      if (
        next.type === 'IDENTIFIER' &&
        next.line === nameToken.line &&
        next.column === nameToken.column + nameToken.value.length
      ) {
        name += this.advance().value;
      }
    } else {
      this.error(
        `Expected directive name, got ${nameToken.type}. Directives start with @ followed by name (e.g., @grabbable)`,
        'HSP201'
      );
      return null;
    }

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
    // MMO Game Brain / Trait Directives
    // These are explicitly handled BEFORE the VR_TRAITS check so they receive
    // proper config block parsing and their specific `type` values. Several of
    // these names (e.g. 'faction', 'behavior_tree') also appear in VR_TRAITS;
    // the explicit handler here wins, which is intentional.
    // =========================================================================

    // @quest { gives: [...], advances: [...], completes: [...], ... }
    if (name === 'quest') {
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.check('LPAREN') ? this.parseTraitConfig() : {};
      return { type: 'quest', ...config } as unknown as HSPlusDirective;
    }

    // @faction { faction_id: ..., reputation: {...}, hostile_factions: [...], ... }
    if (name === 'faction') {
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.check('LPAREN') ? this.parseTraitConfig() : {};
      return { type: 'faction', ...config } as unknown as HSPlusDirective;
    }

    // @loot { table: ..., luck_modifier: ..., instanced: true, drop_on: ... }
    if (name === 'loot') {
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.check('LPAREN') ? this.parseTraitConfig() : {};
      return { type: 'loot', ...config } as unknown as HSPlusDirective;
    }

    // @ability { abilities: [...], damage_multiplier: ..., ... }
    if (name === 'ability') {
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.check('LPAREN') ? this.parseTraitConfig() : {};
      return { type: 'ability', ...config } as unknown as HSPlusDirective;
    }

    // @authority { model: server_authoritative | client_predictive | owner_controlled, ... }
    if (name === 'authority') {
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.check('LPAREN') ? this.parseTraitConfig() : {};
      return { type: 'authority', ...config } as unknown as HSPlusDirective;
    }

    // @wallet_gated { action: ..., currency: ..., amount: ..., ... }
    if (name === 'wallet_gated') {
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.check('LPAREN') ? this.parseTraitConfig() : {};
      return { type: 'wallet_gated', ...config } as unknown as HSPlusDirective;
    }

    // @world_chunk { chunk_id: ..., lod_distances: [...], streaming_priority: ..., ... }
    if (name === 'world_chunk') {
      const config = this.check('LBRACE') ? this.parseBlockContent() : this.check('LPAREN') ? this.parseTraitConfig() : {};
      return { type: 'world_chunk', ...config } as unknown as HSPlusDirective;
    }

    // @personality aggressive | passive | neutral | cunning
    // Accepts bare identifier OR string literal
    if (name === 'personality') {
      let value: string;
      if (this.check('IDENTIFIER')) {
        value = this.advance().value;
      } else if (this.check('STRING')) {
        value = this.advance().value;
      } else {
        value = 'neutral';
      }
      return { type: 'personality', value } as unknown as HSPlusDirective;
    }

    // @faction_alignment neutral_evil | lawful_good | chaotic_neutral | ...
    if (name === 'faction_alignment') {
      let value: string;
      if (this.check('IDENTIFIER')) {
        // May be compound: "neutral_evil" is a single identifier; "lawful good" could be two.
        value = this.advance().value;
        // Consume optional second word (e.g. "lawful good")
        if (this.check('IDENTIFIER')) {
          value += '_' + this.advance().value;
        }
      } else if (this.check('STRING')) {
        value = this.advance().value;
      } else {
        value = 'true_neutral';
      }
      return { type: 'faction_alignment', value } as unknown as HSPlusDirective;
    }

    // @memory_persistence true | false
    if (name === 'memory_persistence') {
      let value = true;
      if (this.check('BOOLEAN')) {
        value = this.advance().value === 'true';
      } else if (this.check('IDENTIFIER')) {
        const raw = this.advance().value;
        value = raw !== 'false';
      }
      return { type: 'memory_persistence', value } as unknown as HSPlusDirective;
    }

    // @preferred_ability "FireBlast" @when { mana > 30 }
    // The optional @when block is consumed here as a raw guard string.
    if (name === 'preferred_ability') {
      let abilityName: string;
      if (this.check('STRING')) {
        abilityName = this.advance().value;
      } else if (this.check('IDENTIFIER')) {
        abilityName = this.advance().value;
      } else {
        abilityName = '';
      }
      let when: string | undefined;
      // Peek for optional @when — peek ahead for AT + "when"
      if (this.check('AT')) {
        const saved = this.pos;
        this.advance(); // consume @
        if (this.check('IDENTIFIER') && this.current().value === 'when') {
          this.advance(); // consume 'when'
          if (this.check('LBRACE')) {
            when = this.parseCodeBlock();
          }
        } else {
          this.pos = saved; // not @when — restore
        }
      }
      return { type: 'preferred_ability', ability: abilityName, when } as unknown as HSPlusDirective;
    }

    // @flee_threshold 0.15
    if (name === 'flee_threshold') {
      let value = 0.25;
      if (this.check('NUMBER')) {
        value = parseFloat(this.advance().value);
      }
      return { type: 'flee_threshold', value } as unknown as HSPlusDirective;
    }

    // @patrol_speed <number|identifier>
    if (name === 'patrol_speed') {
      let value: number | string = 1.0;
      if (this.check('NUMBER')) {
        value = parseFloat(this.advance().value);
      } else if (this.check('IDENTIFIER')) {
        value = this.advance().value;
      }
      return { type: 'patrol_speed', value } as unknown as HSPlusDirective;
    }

    // @waypoints [wp_a, wp_b, ...] or { ... }
    if (name === 'waypoints') {
      let points: unknown = [];
      if (this.check('LBRACKET')) {
        points = this.parseValue();
      } else if (this.check('LBRACE')) {
        points = this.parseBlockContent();
      }
      return { type: 'waypoints', points } as unknown as HSPlusDirective;
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
      let configStyle: 'none' | 'paren' | 'block' | 'colon' = 'none';
      if (this.check('LPAREN')) {
        configStyle = 'paren';
        config = this.parseTraitConfig();
      } else if (this.check('LBRACE')) {
        configStyle = 'block';
        config = this.parseBlockContent();
      } else if (this.check('COLON')) {
        // Colon-form trait config: @waypoint: { id: "wp_a" } / @emissive: { color: "#fff" }
        // Previously errored (HSP001 "Unexpected token COLON in node body"), so
        // accepting it here is strictly more permissive.
        configStyle = 'colon';
        this.advance();
        if (this.check('LPAREN')) {
          config = this.parseTraitConfig();
        } else if (this.check('LBRACE')) {
          config = this.parseBlockContent();
        } else {
          config = { value: this.parseValue() };
        }
      }
      const directive = { type: 'trait' as const, name: name as VRTraitName, config };
      if (configStyle === 'block') {
        this.markBlockConfigDirective(directive, nameToken);
      }
      return this.parseTraitSumTail(directive);
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
        body = this.check('LBRACE') ? this.parseCodeBlock() : this.parseInlineExpression();
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
      let wildcardAlias: string | undefined;
      if (this.check('ASTERISK') || (this.check('IDENTIFIER') && this.current().value === '*')) {
        this.advance(); // *
        isWildcard = true;
        if (this.check('IDENTIFIER') && this.current().value === 'as') {
          this.advance(); // as
          // Grab the namespace alias BEFORE 'from' — previously the parser
          // skipped straight to expecting the path string here, which broke
          // the documented `* as Namespace from "./path"` form (HSP001).
          if (this.check('IDENTIFIER') && this.current().value !== 'from') {
            wildcardAlias = this.advance().value;
          }
        }
        if (this.check('IDENTIFIER') && this.current().value === 'from') {
          this.advance(); // from
        }
      }

      const path = this.expect('STRING', 'Expected import path string').value;

      // Derive default alias from filename (wildcard alias wins when present)
      let alias =
        wildcardAlias ||
        path
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '') ||
        'import';

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

      return {
        type: 'external_api' as const,
        name: externalApiName,
        ...config,
      } as unknown as HSPlusDirective;
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
    // Legacy HoloLand (v1) runtime events — @hololand.* directives.
    // HoloLand is in sunset; new work should target current spatial stacks / traits.
    // Parser retains this branch so existing .hsplus assets keep compiling.
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
    let configStyle: 'none' | 'paren' | 'block' = 'none';
    if (this.check('LPAREN')) {
      configStyle = 'paren';
      config = this.parseTraitConfig();
    } else if (this.check('LBRACE')) {
      configStyle = 'block';
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

    // Handle generic handler directives such as @on_call => { ... }.
    // They may not be in LIFECYCLE_HOOKS, but they still must consume the body.
    if (this.check('ARROW')) {
      this.advance();
      config.body = this.check('LBRACE') ? this.parseCodeBlock() : this.parseInlineExpression();
    }

    // Return as a generic trait so it appears in AST
    const directive = { type: 'trait' as const, name, config };
    if (configStyle === 'block') {
      this.markBlockConfigDirective(directive, nameToken);
    }
    return this.parseTraitSumTail(directive);
  }

  private markBlockConfigDirective(directive: HSPlusDirective, token: Token): void {
    this.blockConfigDirectives.add(directive as object);
    this.blockConfigDirectiveLocations.set(directive as object, token);
  }

  private traitConfigLooksLikeNodeBody(config: Record<string, unknown> | undefined): boolean {
    if (!config || typeof config !== 'object') return false;
    const nodeBodyKeys = new Set([
      'geometry',
      'position',
      'rotation',
      'scale',
      'size',
      'color',
      'material',
      'model',
      'mesh',
      'src',
      'url',
    ]);
    return Object.keys(config).some((key) => nodeBodyKeys.has(key));
  }

  private parseTraitSumTail(first: HSPlusTraitDirective): HSPlusDirective {
    if (!this.check('PLUS')) {
      return first;
    }

    const alternatives: HSPlusTraitAtom[] = [
      { type: 'trait_atom', name: first.name, config: first.config ?? {} },
    ];

    while (this.check('PLUS')) {
      this.advance();
      alternatives.push(this.parseTraitAtom());
    }

    return {
      type: 'trait_sum',
      operation: 'additive',
      alternatives,
    } satisfies HSPlusTraitSumDirective;
  }

  private parseTraitAtom(): HSPlusTraitAtom {
    this.expect('AT', 'Expected @ in trait sum alternative');
    const name = this.expect('IDENTIFIER', 'Expected trait name in trait sum alternative').value;
    let config: Record<string, unknown> = {};
    if (this.check('LPAREN')) {
      config = this.parseTraitConfig();
    } else if (this.check('LBRACE')) {
      config = this.parseBlockContent();
    }
    return { type: 'trait_atom', name, config };
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

  // ===========================================================================
  // Brain Declaration Parsing
  // ===========================================================================

  /**
   * Parse a top-level `brain` declaration.
   *
   * Grammar:
   *   brain <Name> [ : @<brainType> ] {
   *     @personality <value>
   *     @faction_alignment <value>
   *     @memory_persistence true|false
   *     @preferred_ability "<Name>" [ @when { <expr> } ]
   *     @flee_threshold <number>
   *     @patrol_speed <number|identifier>
   *     @waypoints [...]
   *     state <stateName> {
   *       transition to <target> [ @when { <expr> } ]
   *       <action statements ...>
   *     }
   *   }
   */
  private parseBrainDeclaration(): HoloBrainDecl {
    this.advance(); // consume 'brain'

    const name = this.check('IDENTIFIER') ? this.advance().value : 'unnamed_brain';

    // Optional : @brainType  — e.g. `brain DragonAI : @behavior_tree`
    let brainType: HoloBrainDecl['brainType'] = 'behavior_tree';
    if (this.check('COLON')) {
      this.advance(); // consume ':'
      if (this.check('AT')) {
        this.advance(); // consume '@'
        if (this.check('IDENTIFIER')) {
          const raw = this.advance().value;
          if (
            raw === 'behavior_tree' ||
            raw === 'decision_tree' ||
            raw === 'neural' ||
            raw === 'scripted'
          ) {
            brainType = raw as HoloBrainDecl['brainType'];
          }
        }
      }
    }

    const brain: HoloBrainDecl = {
      type: 'brain',
      name,
      brainType,
      states: [],
      traits: {},
    };

    // Require opening brace
    if (!this.check('LBRACE')) {
      this.warn(`brain "${name}" missing body block { }`);
      return brain;
    }
    this.advance(); // consume '{'
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      // Trait annotations
      if (this.check('AT')) {
        this.advance(); // consume '@'
        if (!this.check('IDENTIFIER')) {
          this.warn('Expected directive name after @');
          continue;
        }
        const dirName = this.advance().value;

        if (dirName === 'personality') {
          const val = this.check('IDENTIFIER') ? this.advance().value
                    : this.check('STRING')     ? this.advance().value
                    : 'neutral';
          brain.personality = val;

        } else if (dirName === 'faction_alignment') {
          let val = this.check('IDENTIFIER') ? this.advance().value
                  : this.check('STRING')     ? this.advance().value
                  : 'true_neutral';
          if (this.check('IDENTIFIER')) val += '_' + this.advance().value;
          brain.factionAlignment = val;

        } else if (dirName === 'memory_persistence') {
          const raw = this.check('BOOLEAN')    ? this.advance().value
                    : this.check('IDENTIFIER') ? this.advance().value
                    : 'true';
          brain.memoryPersistence = raw !== 'false';

        } else if (dirName === 'preferred_ability') {
          const abilityName = this.check('STRING')     ? this.advance().value
                            : this.check('IDENTIFIER') ? this.advance().value
                            : '';
          let when: string | undefined;
          if (this.check('AT')) {
            const saved = this.pos;
            this.advance();
            if (this.check('IDENTIFIER') && this.current().value === 'when') {
              this.advance();
              if (this.check('LBRACE')) when = this.parseCodeBlock();
            } else {
              this.pos = saved;
            }
          }
          brain.preferredAbility = { name: abilityName, when };

        } else if (dirName === 'flee_threshold') {
          brain.fleeThreshold = this.check('NUMBER') ? parseFloat(this.advance().value) : 0.25;

        } else if (dirName === 'patrol_speed') {
          brain.patrolSpeed = this.check('NUMBER')     ? parseFloat(this.advance().value)
                            : this.check('IDENTIFIER') ? this.advance().value
                            : 1.0;

        } else if (dirName === 'waypoints') {
          brain.waypoints = this.check('LBRACKET') ? (this.parseValue() as unknown[]) : [];

        } else if (dirName === 'goal') {
          // @goal { name, desiredState, priority } — declarative GOAP goal that
          // feeds the (already-built, A*-planning) GoalOrientedTrait.
          const cfg = this.check('LBRACE') ? (this.parseBlockContent() as Record<string, unknown>) : {};
          if (!brain.goals) brain.goals = [];
          brain.goals.push({
            name: typeof cfg.name === 'string' ? cfg.name : String(cfg.name ?? `goal_${brain.goals.length}`),
            desiredState:
              cfg.desiredState && typeof cfg.desiredState === 'object'
                ? (cfg.desiredState as Record<string, unknown>)
                : undefined,
            priority: typeof cfg.priority === 'number' ? cfg.priority : undefined,
          });

        } else if (dirName === 'escalation') {
          // @escalation { on, action } — compiles to LLMAgentTrait EscalationCondition[].
          const cfg = this.check('LBRACE') ? (this.parseBlockContent() as Record<string, unknown>) : {};
          if (!brain.escalations) brain.escalations = [];
          brain.escalations.push({
            on: typeof cfg.on === 'string' ? cfg.on : String(cfg.on ?? ''),
            action: typeof cfg.action === 'string' ? cfg.action : 'notify',
          });

        } else if (dirName === 'provider_policy') {
          // @provider_policy { prefer, fallback, requires } — a load-time hint the
          // sovereign-first resolver reads (it does NOT duplicate the resolver).
          const cfg = this.check('LBRACE') ? (this.parseBlockContent() as Record<string, unknown>) : {};
          brain.providerPolicy = {
            prefer: typeof cfg.prefer === 'string' ? cfg.prefer : undefined,
            fallback: typeof cfg.fallback === 'string' ? cfg.fallback : undefined,
            requires: typeof cfg.requires === 'string' ? cfg.requires : undefined,
          };

        } else if (dirName === 'frame_declaration') {
          // @frame_declaration { domain, horizon, capability_tier, trust_tier,
          //                      allowed_tools, denied_domains }
          //
          // Declares the agent's epistemic scope. The runtime reads this field to
          // enforce boundary violations: a tool call outside the declared frame
          // emits 'frame_violation' instead of hallucinating through the edge.
          // All fields are optional; coerceFrameDeclarationConfig applies defaults.
          const cfg = this.check('LBRACE') ? (this.parseBlockContent() as Record<string, unknown>) : {};
          brain.frameDeclaration = coerceFrameDeclarationConfig(cfg);

        } else if (dirName === 'behavior_tree') {
          // @behavior_tree { ... } block inside the brain body
          const config = this.check('LBRACE') ? this.parseBlockContent() : {};
          brain.traits['behavior_tree'] = config;

        } else {
          // Generic trait — parse optional block/parens config
          const config: Record<string, unknown> =
            this.check('LBRACE')  ? this.parseBlockContent()
          : this.check('LPAREN') ? this.parseTraitConfig()
          : {};
          brain.traits[dirName] = config;
        }
        this.skipNewlines();
        continue;
      }

      // state <name> { ... }
      if (this.check('STATE') || (this.check('IDENTIFIER') && this.current().value === 'state')) {
        this.advance(); // consume 'state'
        const stateName = this.check('IDENTIFIER') ? this.advance().value : 'unnamed';
        const brainState: HoloBrainState = {
          name: stateName,
          transitions: [],
          actions: [],
          traits: {},
        };

        if (this.check('LBRACE')) {
          this.advance(); // consume '{'
          this.skipNewlines();
          while (!this.check('RBRACE') && !this.check('EOF')) {
            this.skipNewlines();
            if (this.check('RBRACE') || this.check('EOF')) break;

            // transition to <target> [ @when { <expr> } ]
            // Note: 'transition' is lexed as a TRANSITION keyword token, not IDENTIFIER.
            if (this.check('TRANSITION') || (this.check('IDENTIFIER') && this.current().value === 'transition')) {
              this.advance(); // consume 'transition'
              let to = '';
              // accept: "to <target>" or just "<target>"
              if (this.check('IDENTIFIER') && this.current().value === 'to') {
                this.advance(); // consume 'to'
              }
              if (this.check('IDENTIFIER')) to = this.advance().value;
              else if (this.check('STRING')) to = this.advance().value;
              let when: string | undefined;
              if (this.check('AT')) {
                const saved = this.pos;
                this.advance();
                if (this.check('IDENTIFIER') && this.current().value === 'when') {
                  this.advance();
                  if (this.check('LBRACE')) when = this.parseCodeBlock();
                } else {
                  this.pos = saved;
                }
              }
              brainState.transitions.push({ to, when });

            } else if (this.check('AT')) {
              // Trait annotation inside a state
              this.advance();
              const innerDir = this.check('IDENTIFIER') ? this.advance().value : '';
              const config: Record<string, unknown> =
                this.check('LBRACE')  ? this.parseBlockContent()
              : this.check('LPAREN') ? this.parseTraitConfig()
              : {};
              brainState.traits[innerDir] = config;

            } else if (this.check('IDENTIFIER') && isCognitiveVerb(this.current().value)) {
              // Typed cognitive action — `llm_call { ... }`, `recall { ... }`,
              // `rag_query { ... }`, `plan { ... }`, `reflect { ... }`. Dispatches
              // to the real cognitive trait instead of an opaque action string.
              const saved = this.pos;
              const verb = this.advance().value as CognitiveVerb;
              if (this.check('LBRACE')) {
                const config = this.parseBlockContent() as Record<string, unknown>;
                if (!brainState.cognitiveActions) brainState.cognitiveActions = [];
                brainState.cognitiveActions.push({ kind: 'cognitive', verb, config });
              } else {
                // Bare verb with no config block — treat as a free-form action.
                this.pos = saved;
                const parts: string[] = [this.advance().value];
                while (!this.check('NEWLINE') && !this.check('EOF') && !this.check('RBRACE')) {
                  parts.push(this.advance().value);
                }
                brainState.actions.push(parts.join(' '));
              }

            } else if (
              this.check('IDENTIFIER') &&
              this.tokens[this.pos + 1]?.type === 'LBRACE' &&
              nearestCognitiveVerb(this.current().value)
            ) {
              // Near-miss of a cognitive verb followed by a config block (e.g.
              // `recal { ... }`)? Surface it as a parse-time signal, then consume
              // the block so braces stay balanced and parsing continues.
              const typo = this.current().value;
              const suggestion = nearestCognitiveVerb(typo);
              this.warn(`Unknown cognitive verb '${typo}' — did you mean '${suggestion}'?`);
              this.advance(); // consume the misspelled verb
              this.parseBlockContent(); // consume + discard its config block (balanced)
              brainState.actions.push(typo);

            } else if (this.check('IDENTIFIER')) {
              // Treat as free-form action string — collect to end of line
              const parts: string[] = [this.advance().value];
              while (!this.check('NEWLINE') && !this.check('EOF') && !this.check('RBRACE')) {
                parts.push(this.advance().value);
              }
              brainState.actions.push(parts.join(' '));

            } else {
              this.advance(); // skip unknown
            }

            this.skipNewlines();
          }
          this.expect('RBRACE', 'Expected } to close state block');
        }
        brain.states.push(brainState);
        this.skipNewlines();
        continue;
      }

      // Any other token at brain body level — collect as action / skip
      if (this.check('IDENTIFIER')) {
        const parts: string[] = [this.advance().value];
        while (!this.check('NEWLINE') && !this.check('EOF') && !this.check('RBRACE')) {
          parts.push(this.advance().value);
        }
        // Store as a loose property on traits
        brain.traits['_actions'] = [
          ...((brain.traits['_actions'] as string[]) || []),
          parts.join(' '),
        ];
      } else {
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected } to close brain declaration');
    return brain;
  }

  /**
   * Parse a .hs `connect` statement.
   * Syntax (full .hs format):
   *   connect <source> -> <target>
   * where <source> and <target> are dotted member chains, optionally followed
   * by assignment for state connections:
   *   connect alarm_bell.alarm_triggered -> guard_captain.state.alert_level = 3
   *
   * Strategy: consume the `connect` keyword, then collect all tokens up to
   * (but not including) the next NEWLINE / EOF as a raw string.  This is
   * intentionally permissive — the connect statement has a rich surface syntax
   * (dotted paths, ARROW, assignments) that the generic property parser cannot
   * handle.  Semantic validation of the wiring is a separate compilation phase.
   */
  private parseHsConnectStatement(): HSPlusNode {
    const startToken = this.current();
    this.advance(); // consume 'connect'

    // Collect the rest of the line as tokens
    const toks: Token[] = [];
    while (!this.check('NEWLINE') && !this.check('EOF')) {
      toks.push(this.advance());
    }

    // Split from / to around the ARROW ('->') separator at token level so
    // member chains reconstruct without spurious spaces ("a.b", not "a . b")
    const arrowIdx = toks.findIndex((t) => t.type === 'ARROW');
    const fromToks = arrowIdx >= 0 ? toks.slice(0, arrowIdx) : toks;
    const toToks = arrowIdx >= 0 ? toks.slice(arrowIdx + 1) : [];

    return {
      type: 'connection',
      properties: {
        from: this.joinTokensSmart(fromToks),
        to: this.joinTokensSmart(toToks),
        raw: this.joinTokensSmart(toks),
      },
      directives: [],
      children: [],
      traits: new Map(),
      loc: {
        start: { line: startToken.line, column: startToken.column },
        end: { line: this.current().line, column: this.current().column },
      },
    } as unknown as HSPlusNode;
  }

  /**
   * Parse a .hs `execute` statement.
   * Syntax:
   *   execute <target>(<args>) [repeat forever | every <interval>]
   * Examples:
   *   execute guard_captain.patrol() repeat forever
   *   execute temp_sensor_A.read() every 1000ms
   *
   * Strategy: consume `execute` then collect all tokens to end of line.
   * The target is the leading member chain plus one balanced call-paren
   * group; everything after it is the schedule clause.
   */
  private parseHsExecuteStatement(): HSPlusNode {
    const startToken = this.current();
    this.advance(); // consume 'execute'

    const toks: Token[] = [];
    while (!this.check('NEWLINE') && !this.check('EOF')) {
      toks.push(this.advance());
    }

    let end = toks.length;
    let depth = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === 'LPAREN') {
        depth++;
      } else if (t.type === 'RPAREN') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      } else if (
        depth === 0 &&
        t.type !== 'IDENTIFIER' &&
        t.type !== 'DOT' &&
        t.type !== 'NUMBER'
      ) {
        end = i;
        break;
      }
    }
    const target = this.joinTokensSmart(toks.slice(0, end));
    const schedule = this.joinTokensSmart(toks.slice(end));

    return {
      type: 'execute',
      properties: { target, schedule, raw: this.joinTokensSmart(toks) },
      directives: [],
      children: [],
      traits: new Map(),
      loc: {
        start: { line: startToken.line, column: startToken.column },
        end: { line: this.current().line, column: this.current().column },
      },
    } as unknown as HSPlusNode;
  }

  // ===========================================================================
  // Pipeline DSL block parsing (transform / filter / branch / validate)
  // ===========================================================================

  /**
   * Reassemble token values into readable source text: no spaces around
   * member/call/index punctuation, string literals re-quoted.
   */
  private joinTokensSmart(tokens: Token[]): string {
    const NO_SPACE_BEFORE = new Set([
      'DOT',
      'COMMA',
      'LPAREN',
      'RPAREN',
      'LBRACKET',
      'RBRACKET',
      'OPTIONAL_DOT',
    ]);
    const NO_SPACE_AFTER = new Set(['DOT', 'LPAREN', 'LBRACKET', 'OPTIONAL_DOT', 'EXCLAMATION']);
    let out = '';
    let prev: Token | null = null;
    for (const t of tokens) {
      const text = t.type === 'STRING' ? JSON.stringify(t.value) : t.value;
      if (prev && !NO_SPACE_BEFORE.has(t.type) && !NO_SPACE_AFTER.has(prev.type)) {
        out += ' ';
      }
      out += text;
      prev = t;
    }
    return out;
  }

  /** Capture a dotted/indexed path: sku, a.b.c, results[0].id, entries[] */
  private capturePipelinePath(): { raw: string; tokens: Token[] } {
    const toks: Token[] = [];
    if (this.check('IDENTIFIER') || this.check('STRING') || this.check('UNDERSCORE')) {
      toks.push(this.advance());
    }
    for (;;) {
      if (this.check('DOT')) {
        toks.push(this.advance());
        if (this.check('IDENTIFIER') || this.check('NUMBER') || this.check('UNDERSCORE')) {
          toks.push(this.advance());
        }
        continue;
      }
      if (this.check('LBRACKET')) {
        let depth = 0;
        do {
          const t = this.advance();
          toks.push(t);
          if (t.type === 'LBRACKET') depth++;
          else if (t.type === 'RBRACKET') depth--;
        } while (depth > 0 && !this.check('EOF'));
        continue;
      }
      break;
    }
    return { raw: this.joinTokensSmart(toks), tokens: toks };
  }

  /** Capture a transform op call: trim() / multiply(100) / increment_if(a == b.c) */
  private capturePipelineOp(): string {
    const toks: Token[] = [];
    if (this.check('IDENTIFIER')) {
      toks.push(this.advance());
    }
    if (this.check('LPAREN')) {
      let depth = 0;
      do {
        const t = this.advance();
        toks.push(t);
        if (t.type === 'LPAREN') depth++;
        else if (t.type === 'RPAREN') depth--;
      } while (depth > 0 && !this.check('EOF'));
    }
    return this.joinTokensSmart(toks);
  }

  /** True when an ARROW appears before the end of the current statement line. */
  private hasArrowBeforeEOL(): boolean {
    for (let look = this.pos; look < this.tokens.length; look++) {
      const t = this.tokens[look].type;
      if (t === 'ARROW') return true;
      if (t === 'NEWLINE' || t === 'EOF' || t === 'RBRACE' || t === 'LBRACE') return false;
    }
    return false;
  }

  /**
   * Capture expression tokens to end of line, honoring `||` / `&&`
   * line continuations:
   *   where: stock != previous.stock
   *       || costCents != previous.costCents
   */
  private captureExpressionToEOL(): Token[] {
    const toks: Token[] = [];
    for (;;) {
      while (!this.check('NEWLINE') && !this.check('EOF') && !this.check('RBRACE')) {
        toks.push(this.advance());
      }
      if (this.check('NEWLINE')) {
        let look = this.pos;
        while (
          look < this.tokens.length &&
          ['NEWLINE', 'INDENT', 'DEDENT'].includes(this.tokens[look].type)
        ) {
          look++;
        }
        const next = this.tokens[look];
        if (next && (next.type === 'OR' || next.type === 'AND')) {
          this.pos = look; // continuation — skip newlines/indents and keep capturing
          continue;
        }
      }
      break;
    }
    return toks;
  }

  /**
   * YAML-style block scalar property value:
   *   prompt: |
   *     Extract wisdom from this content.
   *     Return JSON.
   * Captures the following lines from raw source while they are blank or
   * indented deeper than the key line, dedents, and skips their tokens.
   */
  private parseBlockScalar(keyToken: Token): string {
    this.advance(); // consume PIPE
    const keyIndent = keyToken.column - 1; // columns are 1-based
    const lines = this.source.split('\n');
    const collected: string[] = [];
    let lastLine = keyToken.line; // lines are 1-based
    for (let ln = keyToken.line + 1; ln <= lines.length; ln++) {
      const text = lines[ln - 1];
      if (text.trim() === '') {
        collected.push('');
        lastLine = ln;
        continue;
      }
      const indent = text.length - text.trimStart().length;
      if (indent <= keyIndent) break;
      collected.push(text);
      lastLine = ln;
    }
    // Skip all tokens the scalar block produced
    while (!this.check('EOF') && this.current().line <= lastLine) {
      this.advance();
    }
    const nonBlank = collected.filter((l) => l.trim() !== '');
    const minIndent = nonBlank.length
      ? Math.min(...nonBlank.map((l) => l.length - l.trimStart().length))
      : 0;
    return collected
      .map((l) => l.slice(minIndent))
      .join('\n')
      .replace(/\s+$/, '');
  }

  /** Property value inside a pipeline DSL block. */
  private parsePipelinePropertyValue(keyToken: Token): unknown {
    if (this.check('PIPE')) {
      const next = this.peek(1);
      if (!next || next.type === 'NEWLINE' || next.type === 'EOF') {
        return this.parseBlockScalar(keyToken);
      }
    }
    if (this.check('LBRACE') || this.check('LBRACKET')) {
      return this.parseValue();
    }
    const toks = this.captureExpressionToEOL();
    if (toks.length === 1) {
      const t = toks[0];
      if (t.type === 'STRING') return t.value;
      if (t.type === 'NUMBER') {
        const n = Number(t.value);
        return Number.isNaN(n) ? t.value : n;
      }
      if (t.value === 'true') return true;
      if (t.value === 'false') return false;
      return t.value;
    }
    return this.joinTokensSmart(toks);
  }

  /**
   * Body parser for pipeline DSL blocks. Handles, per statement:
   *   key: value                                  → property (incl. block scalars)
   *   src.path[0] -> dst.path : op() : op2(...)   → mapping child
   *   when <cond> -> <target>                     → when child (branch)
   *   default -> <target>                         → default child (branch)
   *   field.path : rule, rule(...)                → constraint child (validate /
   *                                                 dotted fields anywhere)
   * Statements are captured structurally with their raw text preserved;
   * semantic validation of the wiring is a separate compilation phase.
   */
  private parsePipelineBlock(kind: string, name: string, startToken: Token): HSPlusNode {
    this.expect('LBRACE', `Expected { after ${kind} ${name}`);
    const properties: Record<string, unknown> = {};
    const children: HSPlusNode[] = [];
    const directives: HSPlusDirective[] = [];
    const traits = new Map<VRTraitName, unknown>();

    const childLoc = (tok: Token) => ({
      start: { line: tok.line, column: tok.column },
      end: { line: this.current().line, column: this.current().column },
    });

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
        } else if (
          kind === 'branch' &&
          this.check('IDENTIFIER') &&
          this.current().value === 'when'
        ) {
          // when <condition> -> <target>
          const stmtStart = this.advance();
          const condToks: Token[] = [];
          while (!this.check('ARROW') && !this.check('NEWLINE') && !this.check('EOF')) {
            condToks.push(this.advance());
          }
          let target = '';
          if (this.check('ARROW')) {
            this.advance();
            const targetToks: Token[] = [];
            while (!this.check('NEWLINE') && !this.check('EOF') && !this.check('RBRACE')) {
              targetToks.push(this.advance());
            }
            target = this.joinTokensSmart(targetToks);
          }
          children.push({
            type: 'when',
            condition: this.joinTokensSmart(condToks),
            target,
            loc: childLoc(stmtStart),
          } as unknown as HSPlusNode);
        } else if (this.hasArrowBeforeEOL()) {
          // mapping / route with arbitrary LHS expression:
          //   sku -> productId : multiply(100)
          //   target.chembl_id + "-" + drug.chembl_id -> binding.id
          //   [790, 797, 858] -> binding.residues
          //   default -> sink Dashboard          (branch)
          const stmtStart = this.current();
          const lhsToks: Token[] = [];
          while (!this.check('ARROW') && !this.check('NEWLINE') && !this.check('EOF')) {
            lhsToks.push(this.advance());
          }
          if (this.check('ARROW')) this.advance();
          const from = this.joinTokensSmart(lhsToks);
          if (kind === 'branch') {
            const targetToks: Token[] = [];
            while (!this.check('NEWLINE') && !this.check('EOF') && !this.check('RBRACE')) {
              targetToks.push(this.advance());
            }
            children.push({
              type: from === 'default' ? 'default' : 'route',
              from,
              target: this.joinTokensSmart(targetToks),
              loc: childLoc(stmtStart),
            } as unknown as HSPlusNode);
          } else {
            const to = this.capturePipelinePath();
            const ops: string[] = [];
            while (this.check('COLON')) {
              this.advance();
              ops.push(this.capturePipelineOp());
            }
            children.push({
              type: 'mapping',
              from,
              to: to.raw,
              ops,
              loc: childLoc(stmtStart),
            } as unknown as HSPlusNode);
          }
        } else if (this.check('IDENTIFIER') || this.check('STRING')) {
          const keyToken = this.current();
          const path = this.capturePipelinePath();

          if (this.check('COLON')) {
            this.advance();
            const pathIsDotted = path.tokens.some((t) => t.type === 'DOT' || t.type === 'LBRACKET');
            if (kind === 'validate' || pathIsDotted) {
              // constraint: field.path : required, string, startsWith("EFO_")
              const ruleToks = this.captureExpressionToEOL();
              children.push({
                type: 'constraint',
                field: path.raw,
                rules: this.joinTokensSmart(ruleToks),
                loc: childLoc(keyToken),
              } as unknown as HSPlusNode);
            } else {
              properties[path.raw] = this.parsePipelinePropertyValue(keyToken);
            }
          } else {
            properties[path.raw] = true;
          }
        } else if (this.check('COMMA')) {
          this.advance();
        } else {
          this.error(
            `Unexpected token ${this.current().type} "${this.current().value}" in ${kind} block`,
            'HSP001'
          );
          this.synchronizeProperty();
        }
        this.skipNewlines();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage !== 'ParseError') console.error(e);
        this.synchronizeProperty();
      }
    }

    this.expect('RBRACE', 'Expected }');

    return {
      type: kind,
      name,
      id: name,
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

  /** @deprecated Use parseHsConnectStatement for .hs connect syntax */
  private parseConnectionStatement(): Record<string, string> {
    this.expect('IDENTIFIER', 'Expected connect'); // connect
    const from = this.expect('IDENTIFIER', 'Expected from name').value;
    this.expect('IDENTIFIER', 'Expected to'); // to
    const to = this.expect('IDENTIFIER', 'Expected to name').value;
    return { from, to };
  }

  /**
   * Map a reaction trigger to its routing bucket (mirrors the .hs parser's
   * reactionCategory; the movement-trigger list comes from the locomotion SSOT).
   */
  private hsplusReactionCategory(trigger: string): ReactionCategory {
    if (isLocomotionReactionTrigger(trigger)) return 'movement';
    switch (trigger) {
      case 'on_interact':
      case 'on_grab':
      case 'on_release':
      case 'on_use':
      case 'on_hover':
        return 'interaction';
      case 'on_collision':
      case 'on_collide':
      case 'on_proximity':
        return 'collision';
      case 'on_spawn':
      case 'on_death':
      case 'on_enter':
      case 'on_exit':
      case 'on_tick':
        return 'lifecycle';
      case 'on_combat':
      case 'on_cast':
        return 'combat';
      case 'on_signal':
      case 'on_input':
        return 'signal';
      default:
        return 'custom';
    }
  }

  /**
   * Parse a declarative reaction block attached to an entity:
   *   react {
   *     on_grab(hand) => highlight()
   *     on_proximity(player) => alert(player)
   *     on_use => { open(); play_sound("creak") }
   *   }
   * A leading `on` word is optional (`on collide(...)` == `on_collide(...)`).
   * Each entry becomes a `reaction` child node carrying trigger/params/body and
   * an inferred ReactionCategory. Body is captured raw (an expression or block).
   */
  private parseHsPlusReactBlock(startToken: Token): HSPlusNode {
    const startLoc = { line: startToken.line, column: startToken.column };
    const reactions: HSPlusNode[] = [];

    this.skipNewlines();
    if (this.check('LBRACE')) {
      this.advance(); // consume {
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.check('EOF')) {
        this.skipNewlines();
        if (this.check('RBRACE') || this.check('EOF')) break;

        // Optional leading `on` word: `on collide(...)` -> trigger 'on_collide'.
        let triggerPrefix = '';
        if (
          this.check('IDENTIFIER') &&
          this.current().value === 'on' &&
          this.tokens[this.pos + 1]?.type === 'IDENTIFIER'
        ) {
          this.advance(); // consume 'on'
          triggerPrefix = 'on_';
        }

        if (!this.check('IDENTIFIER')) {
          this.advance(); // skip stray token, stay in sync
          continue;
        }
        const trigger = triggerPrefix + this.advance().value;

        // Optional parameter list
        const params: string[] = [];
        if (this.check('LPAREN')) {
          this.advance();
          while (!this.check('RPAREN') && !this.check('EOF')) {
            if (this.check('IDENTIFIER')) params.push(this.advance().value);
            else this.advance();
            if (this.check('COMMA')) this.advance();
          }
          if (this.check('RPAREN')) this.advance();
        }

        // Optional `=>` arrow
        if (this.check('ARROW')) this.advance();

        // Body: a raw `{ block }` or an expression collected to end of line
        let body = '';
        if (this.check('LBRACE')) {
          body = this.parseRawBlock();
        } else {
          const parts: string[] = [];
          while (!this.check('NEWLINE') && !this.check('EOF') && !this.check('RBRACE')) {
            parts.push(this.advance().value);
          }
          body = parts.join(' ').trim();
        }

        reactions.push({
          type: 'reaction',
          name: trigger,
          event: trigger,
          body,
          properties: {
            trigger,
            params,
            category: this.hsplusReactionCategory(trigger),
          },
        } as unknown as HSPlusNode);

        this.skipNewlines();
      }

      if (this.check('RBRACE')) this.advance();
    }

    return {
      type: 'react-block',
      name: 'react',
      children: reactions,
      properties: { count: reactions.length },
      directives: [],
      traits: new Map(),
      loc: {
        start: startLoc,
        end: { line: this.current().line, column: this.current().column },
      },
    } as unknown as HSPlusNode;
  }

  /**
   * Parse a `timeline <name> { …properties, track-blocks, children }` node.
   * (Theatre.js harvest S1.) Produces the same shape as the canonical Rust
   * grammar: a `timeline` node whose `children` include structured `track`
   * nodes (`{ type: 'track', target, keyframes: [...] }`). Non-track lines are
   * handled the generic way: `key: value` → property, nested block keyword →
   * child node. The `timeline` keyword has already been consumed by the caller.
   */
  private parseTimelineNode(startToken: Token): HSPlusNode {
    let name: string | undefined;
    if (this.check('STRING') || this.check('IDENTIFIER')) {
      name = this.advance().value;
    }

    const properties: Record<string, unknown> = {};
    const children: HSPlusNode[] = [];
    const directives: HSPlusDirective[] = [];
    const traits = new Map<VRTraitName, unknown>();

    if (this.check('LBRACE')) {
      this.advance(); // {
      this.skipNewlines();

      while (!this.check('RBRACE') && !this.check('EOF')) {
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
          this.skipNewlines();
          continue;
        }

        const token = this.current();
        const next = this.peek(1);

        // `track "<target>" { key … }` — a keyframe channel. Disambiguated from
        // a property literally named `track` (which has a COLON/EQUALS next) by
        // the look-ahead: target token followed by an opening brace.
        if (
          token.type === 'IDENTIFIER' &&
          token.value === 'track' &&
          (next.type === 'STRING' || next.type === 'IDENTIFIER') &&
          this.peek(2).type === 'LBRACE'
        ) {
          this.advance(); // consume 'track'
          children.push(this.parseTrackNode(token));
          if (this.check('COMMA')) this.advance();
          this.skipNewlines();
          continue;
        }

        // `key: value` / `key = value` property.
        if (
          (token.type === 'IDENTIFIER' || token.type === 'STRING') &&
          (next.type === 'COLON' || next.type === 'EQUALS')
        ) {
          const key = this.advance().value;
          this.advance(); // : or =
          properties[key] = this.parseValue();
          if (this.check('COMMA')) this.advance();
          this.skipNewlines();
          continue;
        }

        // Anything else (nested node keyword, statement) → generic node parse.
        if (token.type === 'IDENTIFIER' || token.type === 'STRING') {
          children.push(this.parseNode());
          if (this.check('COMMA')) this.advance();
          this.skipNewlines();
          continue;
        }

        // Unrecognized token — skip to avoid an infinite loop.
        this.advance();
        this.skipNewlines();
      }

      this.expect('RBRACE', 'Expected } to close timeline block');
    }

    return {
      type: 'timeline',
      name,
      id: name,
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

  /**
   * Parse a keyframe-track inside a timeline:
   *   track "<target>" { key <time> { <value> } [easing <ease>] ; … }
   * Mirrors the Rust `TrackNode`/`KeyframeNode`. `;` is skipped by the lexer,
   * so keyframe separators are implicit. The `track` keyword has already been
   * consumed by the caller. Returns `{ type: 'track', target, keyframes }`.
   */
  private parseTrackNode(startToken: Token): HSPlusNode {
    const target = this.check('STRING')
      ? this.advance().value
      : this.expect('IDENTIFIER', 'Expected track target name').value;

    const keyframes: Array<{ time: number; value: unknown; easing?: string }> = [];

    this.expect('LBRACE', 'Expected { to open track block');
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      if (this.check('COMMA')) {
        this.advance();
        continue;
      }

      if (this.check('IDENTIFIER') && this.current().value === 'key') {
        this.advance(); // consume 'key'

        // Keyframe time: a numeric literal (allow a leading minus).
        let timeSign = 1;
        if (this.check('MINUS')) {
          this.advance();
          timeSign = -1;
        }
        const timeTok = this.expect('NUMBER', 'Expected numeric time after key');
        const time = timeSign * Number(timeTok.value);

        // `{ <value> }` value block.
        this.expect('LBRACE', 'Expected { value block after key time');
        const value = this.parseValue();
        this.expect('RBRACE', 'Expected } to close key value block');

        // Optional `easing <ease>` clause (reuses the shipped easing names).
        let easing: string | undefined;
        if (this.check('IDENTIFIER') && this.current().value === 'easing') {
          this.advance();
          if (this.check('IDENTIFIER') || this.check('STRING')) {
            easing = this.advance().value;
          }
        }

        keyframes.push(easing === undefined ? { time, value } : { time, value, easing });
        this.skipNewlines();
        continue;
      }

      // Unexpected token inside a track — skip to stay resilient.
      this.advance();
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected } to close track block');

    return {
      type: 'track',
      target,
      keyframes,
      loc: {
        start: { line: startToken.line, column: startToken.column },
        end: { line: this.current().line, column: this.current().column },
      },
    } as unknown as HSPlusNode;
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
      'world',
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
      'page',
      'include',
      'react',
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

        if (
          token.type === 'IDENTIFIER' &&
          token.value === 'system' &&
          (next.type === 'IDENTIFIER' || next.type === 'STRING') &&
          this.peek(2).type !== 'LBRACE'
        ) {
          const startToken = this.advance();
          const name = this.advance().value;

          result.systems.push({
            type: 'system',
            name,
            id: name,
            properties: {},
            directives: currentDirectives,
            children: [],
            traits: new Map(),
            loc: {
              start: { line: startToken.line, column: startToken.column },
              end: { line: this.current().line, column: this.current().column },
            },
          } as unknown as HSPlusNode);
        } else if (
          token.type === 'IDENTIFIER' &&
          token.value === 'page' &&
          next.type === 'STRING'
        ) {
          const startToken = this.advance();
          const name = this.advance().value;
          const properties: Record<string, unknown> = {};

          if (this.check('LBRACE')) {
            this.advance();
            this.skipNewlines();

            while (!this.check('RBRACE') && !this.check('EOF')) {
              this.skipNewlines();
              if (this.check('RBRACE') || this.check('EOF')) break;

              if (this.check('IDENTIFIER')) {
                const key = this.advance().value;
                if (this.check('COLON') || this.check('EQUALS')) {
                  this.advance();
                  properties[key] = this.parseValue();
                } else if (this.check('STRING')) {
                  properties[key] = this.advance().value;
                } else {
                  properties[key] = true;
                }
              } else if (this.check('COMMA')) {
                this.advance();
              } else {
                this.advance();
              }
              this.skipNewlines();
            }

            this.expect('RBRACE', 'Expected }');
          }

          result.children.push({
            type: 'page',
            name,
            id: name,
            properties,
            directives: currentDirectives,
            children: [],
            traits: new Map(),
            loc: {
              start: { line: startToken.line, column: startToken.column },
              end: { line: this.current().line, column: this.current().column },
            },
          } as unknown as HSPlusNode);
        }
        // Property assignment: key: value or key = value
        else if (next.type === 'COLON' || next.type === 'EQUALS') {
          const key = this.advance().value;
          this.advance(); // consume : or =
          result.properties[key] = this.parseValue();
        }
        // Child node keyword followed by { or "name"
        else if (
          childNodeKeywords.includes(token.value) &&
          (next.type === 'LBRACE' ||
            next.type === 'STRING' ||
            next.type === 'IDENTIFIER' ||
            next.type === 'HASH')
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
        else if (
          next.type === 'LBRACE' ||
          next.type === 'IDENTIFIER' ||
          next.type === 'STRING' ||
          next.type === 'HASH'
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
              body,
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
    actions: Array<{ name: string; params: string[]; body: string }>;
    eventHandlers: Array<{ event: string; params: string[]; body: string }>;
    tickHandlers: Array<{ interval: number; body: string }>;
  } {
    const result = {
      functions: [] as Array<{ name: string; params: string[]; body: string }>,
      actions: [] as Array<{ name: string; params: string[]; body: string }>,
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
        // Parse HoloScript action block: action name(args) { ... }
        else if (keyword === 'action') {
          this.advance(); // action
          const actionName =
            this.check('IDENTIFIER') || this.check('STRING') ? this.advance().value : 'anonymous';
          const params: string[] = [];

          if (this.check('LPAREN')) {
            this.advance();
            while (!this.check('RPAREN') && !this.check('EOF')) {
              if (this.check('IDENTIFIER')) {
                params.push(this.advance().value);
                if (this.check('COLON')) {
                  this.advance();
                  while (!this.check('COMMA') && !this.check('RPAREN') && !this.check('EOF')) {
                    this.advance();
                  }
                }
                if (this.check('COMMA')) {
                  this.advance();
                }
              } else {
                this.advance();
              }
            }
            this.expect('RPAREN', 'Expected )');
          }

          const body = this.check('LBRACE') ? this.parseCodeBlock() : '';
          result.actions.push({ name: actionName, params, body });
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

    const name = this.parseStateMachineIdentifier('Expected state machine name');
    const inputs: Array<Record<string, unknown>> = [];
    const listeners: Array<Record<string, unknown>> = [];
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
        initialState = this.parseStateMachineIdentifier('Expected initial state name');
      } else if (current.value === 'input') {
        inputs.push(this.parseStateMachineInputDeclaration());
      } else if (current.value === 'listen') {
        listeners.push(this.parseStateMachineListenerDeclaration());
      } else if (this.isStateMachineTransitionShorthandStart()) {
        transitions.push(this.parseStateMachineTransitionShorthand());
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
      inputs,
      listeners,
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
    const name = this.parseStateMachineIdentifier('Expected state name');
    let onEntry: string | undefined;
    let onExit: string | undefined;
    const metadata: Record<string, unknown> = {};

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
      } else if (this.isStateMachineStateMetadataKey(current.value) && this.peek(1).type === 'COLON') {
        const key = this.advance().value;
        this.expect('COLON', `Expected : after ${key}`);
        metadata[key] = this.parseValue();
      } else {
        this.advance();
      }
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return { name, onEntry, onExit, ...metadata };
  }

  private isStateMachineStateMetadataKey(key: string): boolean {
    return (
      key === 'clip' ||
      key === 'clips' ||
      key === 'parameter' ||
      key === 'parameters' ||
      key === 'thresholds' ||
      key === 'blendType' ||
      key === 'blend_type' ||
      key === 'blend' ||
      key === 'blendMode' ||
      key === 'blend_mode' ||
      key === 'mask' ||
      key === 'baseline'
    );
  }

  private parseOnErrorNode(): HSPlusNode {
    const startToken = this.previous();
    // Consume optional parameter list: on_error(err) { ... }
    // The parenthesised params are ignored at parse time; they are
    // captured only for AST completeness.
    const params: string[] = [];
    if (this.check('LPAREN')) {
      this.advance(); // (
      while (!this.check('RPAREN') && !this.check('EOF') && !this.check('LBRACE')) {
        if (this.check('IDENTIFIER')) {
          params.push(this.advance().value);
        } else {
          this.advance(); // skip commas, type annotations, etc.
        }
      }
      if (this.check('RPAREN')) this.advance(); // )
    }
    const body = this.parseControlFlowBody();
    return {
      type: 'on_error',
      params,
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

  private parseTransitionsBlock(): Array<Record<string, unknown>> {
    const transitions: Array<Record<string, unknown>> = [];
    this.advance(); // transitions
    this.expect('LBRACE', 'Expected {');
    this.skipNewlines();

    while (!this.check('RBRACE') && !this.check('EOF')) {
      this.skipNewlines();
      if (this.check('RBRACE') || this.check('EOF')) break;

      if (this.isStateMachineTransitionShorthandStart()) {
        transitions.push(this.parseStateMachineTransitionShorthand());
      } else {
        // from_state -> to_state: event
        const from = this.parseStateMachineIdentifier('Expected source state');
        this.expect('ARROW', 'Expected ->');
        const to = this.parseStateMachineIdentifier('Expected target state');
        this.expect('COLON', 'Expected :');
        const event = this.parseStateMachineIdentifier('Expected event name');
        transitions.push({ from, to, event });
      }
      this.skipNewlines();
    }

    this.expect('RBRACE', 'Expected }');
    return transitions;
  }

  private parseStateMachineInputDeclaration(): Record<string, unknown> {
    this.advance(); // input
    const name = this.parseStateMachineIdentifier('Expected input name');
    this.expect('COLON', 'Expected : after input name');
    const rawType = this.parseStateMachineIdentifier('Expected input type');
    const inputType = rawType === 'number' ? 'float' : rawType === 'boolean' ? 'bool' : rawType;
    let defaultValue: unknown;

    if (this.check('EQUALS')) {
      this.advance();
      defaultValue = this.parseValue();
    }

    return {
      type: 'animation-input',
      name,
      inputType,
      rawType,
      default: defaultValue,
    };
  }

  private parseStateMachineListenerDeclaration(): Record<string, unknown> {
    this.advance(); // listen
    const event = this.parseStateMachineDottedIdentifier('Expected listener event');
    this.expect('ARROW', 'Expected -> after listener event');

    if (this.current().value === 'fire') {
      this.advance();
      return {
        type: 'animation-listener',
        event,
        action: 'fire',
        parameter: this.parseStateMachineDottedIdentifier('Expected trigger input'),
      };
    }

    if (this.current().value === 'reset') {
      this.advance();
      return {
        type: 'animation-listener',
        event,
        action: 'reset',
        parameter: this.parseStateMachineDottedIdentifier('Expected trigger input'),
      };
    }

    const parameter = this.parseStateMachineDottedIdentifier('Expected animation input');
    this.expect('EQUALS', 'Expected = in listener binding');
    const parsedValue = this.parseValue();
    const listener: Record<string, unknown> = {
      type: 'animation-listener',
      event,
      action: 'set',
      parameter,
    };

    if (parsedValue && typeof parsedValue === 'object' && '__ref' in parsedValue) {
      const ref = (parsedValue as { __ref?: unknown }).__ref;
      if (typeof ref === 'string' && (ref === 'event' || ref.startsWith('event.'))) {
        listener.source = ref;
      } else if (typeof ref === 'string') {
        listener.value = ref;
      } else {
        listener.value = String(ref ?? '');
      }
    } else if (
      typeof parsedValue === 'number' ||
      typeof parsedValue === 'boolean' ||
      typeof parsedValue === 'string'
    ) {
      listener.value = parsedValue;
    } else {
      listener.value = String(parsedValue ?? '');
    }

    return listener;
  }

  private isStateMachineTransitionShorthandStart(): boolean {
    return this.isStateMachineIdentifierToken(0) && this.peek(1).type === 'ARROW';
  }

  private parseStateMachineTransitionShorthand(): Record<string, unknown> {
    const fromRaw = this.parseStateMachineIdentifier('Expected source state');
    const from = fromRaw.toLowerCase() === 'any' ? 'any' : fromRaw;
    this.expect('ARROW', 'Expected ->');
    const to = this.parseStateMachineIdentifier('Expected target state');
    const transition: Record<string, unknown> = { from, to };

    while (
      !this.check('NEWLINE') &&
      !this.check('RBRACE') &&
      !this.check('COMMA') &&
      !this.check('EOF')
    ) {
      if (!this.isStateMachineIdentifierToken(0)) break;
      const clause = this.current().value.toLowerCase();
      this.advance();

      if (clause === 'when') {
        transition.when = this.parseExpression();
      } else if (clause === 'on') {
        transition.event = this.parseStateMachineIdentifier('Expected trigger input');
      } else if (clause === 'over' || clause === 'duration') {
        transition.duration = this.parseValue();
      } else if (clause === 'easing') {
        transition.easing = this.parseStateMachineIdentifier('Expected easing name');
      } else if (clause === 'exittime' || clause === 'exit_time') {
        transition.exitTime = this.parseValue();
        transition.hasExitTime = true;
      } else if (clause === 'pausewhenexiting' || clause === 'pause_when_exiting') {
        transition.pauseWhenExiting = this.parseOptionalStateMachineBoolean();
      } else if (clause === 'priority') {
        transition.priority = this.parseValue();
      } else if (clause === 'cantransitiontoself' || clause === 'can_transition_to_self') {
        transition.canTransitionToSelf = this.parseOptionalStateMachineBoolean();
      } else {
        break;
      }
    }

    return transition;
  }

  private parseOptionalStateMachineBoolean(): boolean {
    if (this.check('COLON')) this.advance();
    if (this.check('BOOLEAN')) return this.advance().value === 'true';
    if (this.check('IDENTIFIER')) {
      const value = this.current().value.toLowerCase();
      if (value === 'true' || value === 'false') {
        this.advance();
        return value === 'true';
      }
    }
    return true;
  }

  private parseStateMachineIdentifier(message: string): string {
    if (this.check('IDENTIFIER') || this.check('STRING')) {
      return this.advance().value;
    }
    return this.expect('IDENTIFIER', message).value;
  }

  private parseStateMachineDottedIdentifier(message: string): string {
    let value = this.parseStateMachineIdentifier(message);
    while (this.check('DOT')) {
      this.advance();
      value += `.${this.parseStateMachineIdentifier('Expected property name after dot')}`;
    }
    return value;
  }

  private isStateMachineIdentifierToken(offset: number): boolean {
    const token = this.peek(offset);
    return token.type === 'IDENTIFIER' || token.type === 'STRING';
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
    if (!this.check('LBRACE')) {
      return '';
    }

    return this.parseRawBlock();
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

    // State-machine transition shorthand in config objects (A-009 .hsplus gap):
    //   on_event: -> "target" [guard(expr)] [action(name)]
    // Both '->' and '=>' lex to ARROW; only the thin arrow starts a transition.
    // ARROW at expression-primary position previously always errored (HSP300),
    // so accepting it here is strictly more permissive.
    if (token.type === 'ARROW' && token.value === '->') {
      return this.parseTransitionShorthand();
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

  /**
   * Parse a state-machine transition shorthand value:
   *   -> "target"
   *   -> "target" action(callback_name)
   *   -> "target" guard(state.credits >= 10) action(begin)
   * Used as the value of on_<event> keys inside @state_machine states config.
   * Modifiers (action / guard) may appear in any order, each at most once
   * meaningfully (last one wins, matching general object semantics).
   */
  private parseTransitionShorthand(): Record<string, unknown> {
    this.advance(); // ->

    let target = '';
    if (this.check('STRING') || this.check('IDENTIFIER')) {
      target = this.advance().value;
    } else {
      this.error(
        `Expected target state after -> in transition. Got ${this.current().type} "${this.current().value}"`,
        'HSP300'
      );
    }

    const transition: Record<string, unknown> = { type: 'transition', target };

    // Trailing modifiers: action(name) / guard(expression)
    while (
      this.check('IDENTIFIER') &&
      (this.current().value === 'action' || this.current().value === 'guard') &&
      this.peek(1).type === 'LPAREN'
    ) {
      const kind = this.advance().value; // action | guard
      this.advance(); // (
      const arg = this.parseExpression();
      this.expect('RPAREN', `Expected ) after ${kind} argument in transition`);
      transition[kind] = arg;
    }

    return transition;
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

  private errorAt(token: Token, message: string, code: RichErrorCode = 'HSP001'): void {
    this.errors.push(
      createRichError(code, message, token.line, token.column, {
        source: this.source,
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
