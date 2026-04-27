/**
 * HoloScript Lexer (Tokenizer)
 *
 * Converts HoloScript source code into a stream of tokens for parsing.
 * Supports: keywords, identifiers, traits (@trait), strings, numbers, symbols
 */

export enum TokenType {
  // Keywords
  KEYWORD = 'KEYWORD', // composition, object, using, template, group

  // Identifiers & Traits
  IDENTIFIER = 'IDENTIFIER', // variable_name, link1, base
  TRAIT = 'TRAIT', // @joint_revolute, @force_sensor
  STRING = 'STRING', // "Base", "metal", "cylinder"
  NUMBER = 'NUMBER', // 0.1, 3.14, 100, -2.0

  // Symbols
  LBRACE = 'LBRACE', // {
  RBRACE = 'RBRACE', // }
  LBRACKET = 'LBRACKET', // [
  RBRACKET = 'RBRACKET', // ]
  COLON = 'COLON', // :
  COMMA = 'COMMA', // ,

  // Special
  COMMENT = 'COMMENT', // // comment
  EOF = 'EOF', // end of file
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class Lexer {
  private source: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  private readonly keywords = new Set([
    'composition',
    'object',
    'using',
    'template',
    'group',
    'scene',
  ]);

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.position < this.source.length) {
      this.scanToken();
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      line: this.line,
      column: this.column,
    });

    return this.tokens;
  }

  private scanToken(): void {
    const char = this.currentChar();

    // Skip whitespace
    if (this.isWhitespace(char)) {
      this.skipWhitespace();
      return;
    }

    // Comments
    if (char === '/' && this.peek() === '/') {
      this.skipComment();
      return;
    }

    // Traits (@identifier)
    if (char === '@') {
      this.scanTrait();
      return;
    }

    // String literals ("...")
    if (char === '"') {
      this.scanString();
      return;
    }

    // Numbers (0.1, 3.14, -2.0)
    if (this.isDigit(char) || (char === '-' && this.isDigit(this.peek()))) {
      this.scanNumber();
      return;
    }

    // Keywords & Identifiers
    if (this.isAlpha(char)) {
      this.scanIdentifierOrKeyword();
      return;
    }

    // Single-character tokens
    this.scanSymbol(char);
  }

  private scanTrait(): void {
    const startLine = this.line;
    const startColumn = this.column;

    this.advance(); // Skip '@'

    let trait = '';
    while (
      this.position < this.source.length &&
      this.isAlphaNumericOrUnderscore(this.currentChar())
    ) {
      trait += this.currentChar();
      this.advance();
    }

    this.tokens.push({
      type: TokenType.TRAIT,
      value: trait,
      line: startLine,
      column: startColumn,
    });
  }

  private scanString(): void {
    const startLine = this.line;
    const startColumn = this.column;

    this.advance(); // Skip opening "

    let str = '';
    while (this.position < this.source.length && this.currentChar() !== '"') {
      if (this.currentChar() === '\\') {
        // Handle escape sequences
        this.advance();
        if (this.position < this.source.length) {
          str += this.currentChar();
          this.advance();
        }
      } else {
        str += this.currentChar();
        this.advance();
      }
    }

    if (this.currentChar() === '"') {
      this.advance(); // Skip closing "
    } else {
      throw new Error(`Unterminated string at line ${startLine}, column ${startColumn}`);
    }

    this.tokens.push({
      type: TokenType.STRING,
      value: str,
      line: startLine,
      column: startColumn,
    });
  }

  private scanNumber(): void {
    const startLine = this.line;
    const startColumn = this.column;

    let num = '';

    // Handle negative sign
    if (this.currentChar() === '-') {
      num += this.currentChar();
      this.advance();
    }

    // Integer part
    while (this.position < this.source.length && this.isDigit(this.currentChar())) {
      num += this.currentChar();
      this.advance();
    }

    // Decimal part
    if (this.currentChar() === '.' && this.isDigit(this.peek())) {
      num += this.currentChar();
      this.advance();

      while (this.position < this.source.length && this.isDigit(this.currentChar())) {
        num += this.currentChar();
        this.advance();
      }
    }

    this.tokens.push({
      type: TokenType.NUMBER,
      value: num,
      line: startLine,
      column: startColumn,
    });
  }

  private scanIdentifierOrKeyword(): void {
    const startLine = this.line;
    const startColumn = this.column;

    let ident = '';
    while (
      this.position < this.source.length &&
      this.isAlphaNumericOrUnderscore(this.currentChar())
    ) {
      ident += this.currentChar();
      this.advance();
    }

    const type = this.keywords.has(ident) ? TokenType.KEYWORD : TokenType.IDENTIFIER;

    this.tokens.push({
      type,
      value: ident,
      line: startLine,
      column: startColumn,
    });
  }

  private scanSymbol(char: string): void {
    const symbolMap: Record<string, TokenType> = {
      '{': TokenType.LBRACE,
      '}': TokenType.RBRACE,
      '[': TokenType.LBRACKET,
      ']': TokenType.RBRACKET,
      ':': TokenType.COLON,
      ',': TokenType.COMMA,
    };

    const tokenType = symbolMap[char];
    if (tokenType) {
      this.tokens.push({
        type: tokenType,
        value: char,
        line: this.line,
        column: this.column,
      });
      this.advance();
    } else {
      throw new Error(`Unexpected character '${char}' at line ${this.line}, column ${this.column}`);
    }
  }

  private skipWhitespace(): void {
    while (this.position < this.source.length && this.isWhitespace(this.currentChar())) {
      if (this.currentChar() === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }
  }

  private skipComment(): void {
    // Skip until end of line
    while (this.position < this.source.length && this.currentChar() !== '\n') {
      this.position++;
      this.column++;
    }
  }

  private currentChar(): string {
    return this.source[this.position] || '';
  }

  private peek(offset: number = 1): string {
    const peekPos = this.position + offset;
    return this.source[peekPos] || '';
  }

  private advance(): void {
    this.position++;
    this.column++;
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlpha(char: string): boolean {
    return /[a-z_]/i.test(char);
  }

  private isAlphaNumericOrUnderscore(char: string): boolean {
    return /[a-z0-9_]/i.test(char);
  }
}
