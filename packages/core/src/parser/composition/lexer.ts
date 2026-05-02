/**
 * HoloScript Composition Parser — Lexer
 *
 * Extracted from HoloCompositionParser.ts (W1-T2: split by rule-family).
 * Self-contained lexer that tokenizes .holo source into Token[].
 *
 * @version 1.0.0
 */

import { type Token, type TokenType, KEYWORDS } from './tokens';

export { HoloLexer };

/**
 * Lexer for .holo composition syntax.
 * Converts source text into a flat Token[] stream consumed by HoloCompositionParser.
 */
class HoloLexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      const char = this.current();

      // Skip whitespace (except newlines)
      if (char === ' ' || char === '\t') {
        this.advance();
        continue;
      }

      // Comments
      if (char === '/' && this.peek(1) === '/') {
        this.skipLineComment();
        continue;
      }
      if (char === '/' && this.peek(1) === '*') {
        this.skipBlockComment();
        continue;
      }

      // Newlines
      if (char === '\n') {
        this.addToken('NEWLINE', '\n');
        this.advance();
        this.line++;
        this.column = 1;
        continue;
      }
      if (char === '\r') {
        this.advance();
        if (this.current() === '\n') {
          this.advance();
        }
        this.addToken('NEWLINE', '\n');
        this.line++;
        this.column = 1;
        continue;
      }

      // Symbols
      if (this.trySymbol()) continue;

      // Strings
      if (char === '"' || char === "'") {
        this.readString(char);
        continue;
      }

      // Numbers
      if (this.isDigit(char) || (char === '-' && this.isDigit(this.peek(1)))) {
        this.readNumber();
        continue;
      }

      // Identifiers and keywords
      if (this.isIdentifierStart(char)) {
        this.readIdentifier();
        continue;
      }

      // Unknown character - skip
      this.advance();
    }

    this.addToken('EOF', '');
    return this.tokens;
  }

  private trySymbol(): boolean {
    const char = this.current();
    const next = this.peek(1);

    // Triple-character operators
    if (char === '=' && next === '=' && this.peek(2) === '=') {
      this.tokens.push({
        type: 'EQUALS_EQUALS',
        value: '===',
        line: this.line,
        column: this.column,
      });
      this.advance();
      this.advance();
      this.advance();
      return true;
    }
    if (char === '!' && next === '=' && this.peek(2) === '=') {
      this.tokens.push({
        type: 'BANG_EQUALS',
        value: '!==',
        line: this.line,
        column: this.column,
      });
      this.advance();
      this.advance();
      this.advance();
      return true;
    }

    // Two-character operators
    if (char === '=' && next === '=') {
      this.addToken('EQUALS_EQUALS', '==');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '!' && next === '=') {
      this.addToken('BANG_EQUALS', '!=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '<' && next === '=') {
      this.addToken('LESS_EQUALS', '<=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '>' && next === '=') {
      this.addToken('GREATER_EQUALS', '>=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '+' && next === '=') {
      this.addToken('PLUS_EQUALS', '+=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '-' && next === '=') {
      this.addToken('MINUS_EQUALS', '-=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '*' && next === '=') {
      this.addToken('STAR_EQUALS', '*=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '/' && next === '=') {
      this.addToken('SLASH_EQUALS', '/=');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '=' && next === '>') {
      this.addToken('ARROW', '=>');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '+' && next === '+') {
      this.addToken('INC', '++');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '-' && next === '-') {
      this.addToken('DEC', '--');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '&' && next === '&') {
      this.addToken('AND', '&&');
      this.advance();
      this.advance();
      return true;
    }
    if (char === '|' && next === '|') {
      this.addToken('OR', '||');
      this.advance();
      this.advance();
      return true;
    }

    // Single-character operators
    const singleChar: Record<string, TokenType> = {
      '{': 'LBRACE',
      '}': 'RBRACE',
      '[': 'LBRACKET',
      ']': 'RBRACKET',
      '(': 'LPAREN',
      ')': 'RPAREN',
      ':': 'COLON',
      ',': 'COMMA',
      '.': 'DOT',
      '=': 'EQUALS',
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'STAR',
      '/': 'SLASH',
      '<': 'LESS',
      '>': 'GREATER',
      '!': 'BANG',
      '@': 'AT',
      '#': 'HASH',
      ';': 'SEMICOLON',
      '?': 'QUESTION',
    };

    if (singleChar[char]) {
      this.addToken(singleChar[char], char);
      this.advance();
      return true;
    }

    return false;
  }

  private current(): string {
    return this.pos < this.source.length ? this.source[this.pos] : '';
  }

  private peek(offset: number): string {
    const pos = this.pos + offset;
    return pos < this.source.length ? this.source[pos] : '';
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    this.column++;
    return char;
  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column - value.length,
    });
  }

  private skipLineComment(): void {
    while (this.current() !== '\n' && this.pos < this.source.length) {
      this.advance();
    }
  }

  private skipBlockComment(): void {
    this.advance(); // /
    this.advance(); // *
    while (this.pos < this.source.length) {
      if (this.current() === '*' && this.peek(1) === '/') {
        this.advance();
        this.advance();
        return;
      }
      if (this.current() === '\n') {
        this.line++;
        this.column = 0;
      }
      this.advance();
    }
  }

  private readString(quote: string): void {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // opening quote
    let value = '';
    while (this.current() !== quote && this.pos < this.source.length) {
      if (this.current() === '\\') {
        this.advance();
        const escaped = this.current();
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
        this.advance();
      } else {
        value += this.advance();
      }
    }
    this.advance(); // closing quote
    this.tokens.push({
      type: 'STRING',
      value,
      line: startLine,
      column: startCol,
    });
  }

  private readNumber(): void {
    const startCol = this.column;
    let value = '';
    if (this.current() === '-') {
      value += this.advance();
    }
    while (this.isDigit(this.current())) {
      value += this.advance();
    }
    if (this.current() === '.' && this.isDigit(this.peek(1))) {
      value += this.advance(); // .
      while (this.isDigit(this.current())) {
        value += this.advance();
      }
    }
    this.tokens.push({
      type: 'NUMBER',
      value,
      line: this.line,
      column: startCol,
    });
  }

  private readIdentifier(): void {
    const startCol = this.column;
    let value = '';
    while (this.isIdentifierPart(this.current())) {
      value += this.advance();
    }
    const type = KEYWORDS[value.toLowerCase()] || 'IDENTIFIER';
    this.tokens.push({
      type,
      value: type === 'BOOLEAN' ? value.toLowerCase() : value,
      line: this.line,
      column: startCol,
    });
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isIdentifierStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }

  private isIdentifierPart(char: string): boolean {
    return this.isIdentifierStart(char) || this.isDigit(char);
  }
}