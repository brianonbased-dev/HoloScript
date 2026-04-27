/**
 * HoloScript Parser
 *
 * Converts token stream into Abstract Syntax Tree (AST).
 * Uses recursive descent parsing.
 */

import { Token, TokenType } from './lexer';
import { CompositionNode, ObjectNode, PropertyValue } from './ast';

export class Parser {
  private tokens: Token[];
  private position: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): CompositionNode {
    return this.parseComposition();
  }

  private currentToken(): Token {
    const token = this.tokens[this.position];
    if (!token) {
      throw new Error('Unexpected end of input');
    }
    return token;
  }

  private peek(offset: number = 1): Token {
    const pos = this.position + offset;
    const token = pos < this.tokens.length ? this.tokens[pos] : this.tokens[this.tokens.length - 1];
    if (!token) {
      throw new Error('Unexpected end of input');
    }
    return token;
  }

  private advance(): Token {
    const token = this.currentToken();
    this.position++;
    return token;
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.currentToken();

    if (token.type !== type) {
      throw new Error(
        `Expected ${type}${value ? ` "${value}"` : ''} but got ${token.type} "${token.value}" at line ${token.line}, column ${token.column}`
      );
    }

    if (value !== undefined && token.value !== value) {
      throw new Error(
        `Expected "${value}" but got "${token.value}" at line ${token.line}, column ${token.column}`
      );
    }

    return this.advance();
  }

  private parseComposition(): CompositionNode {
    const startToken = this.expect(TokenType.KEYWORD, 'composition');
    const name = this.expect(TokenType.STRING).value;
    this.expect(TokenType.LBRACE);

    const objects: ObjectNode[] = [];

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      objects.push(this.parseObject());
    }

    this.expect(TokenType.RBRACE);

    return {
      type: 'composition',
      name,
      objects,
      line: startToken.line,
      column: startToken.column,
    };
  }

  private parseObject(): ObjectNode {
    const startToken = this.expect(TokenType.KEYWORD, 'object');
    const name = this.expect(TokenType.STRING).value;

    // Parse traits (@trait1 @trait2 ...)
    const traits: string[] = [];
    while (this.currentToken().type === TokenType.TRAIT) {
      traits.push(this.advance().value);
    }

    this.expect(TokenType.LBRACE);

    // Parse properties (key: value)
    const properties: Record<string, PropertyValue> = {};

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);
      const value = this.parseValue();
      properties[key] = value;
    }

    this.expect(TokenType.RBRACE);

    return {
      type: 'object',
      name,
      traits,
      properties,
      line: startToken.line,
      column: startToken.column,
    };
  }

  private parseValue(): PropertyValue {
    const token = this.currentToken();

    // String value
    if (token.type === TokenType.STRING) {
      return this.advance().value;
    }

    // Number value
    if (token.type === TokenType.NUMBER) {
      return parseFloat(this.advance().value);
    }

    // Array value [1, 2, 3]
    if (token.type === TokenType.LBRACKET) {
      return this.parseArray();
    }

    // Function call (for future: diagonal([1, 2, 3]))
    if (token.type === TokenType.IDENTIFIER && this.peek().type === TokenType.LBRACKET) {
      this.advance(); // Skip function name for now
      const args = this.parseArray();

      // For now, treat function calls as arrays (e.g., diagonal([1,2,3]) -> [1,2,3])
      // In future, could preserve function name metadata
      return args;
    }

    throw new Error(
      `Unexpected value type ${token.type} "${token.value}" at line ${token.line}, column ${token.column}`
    );
  }

  private parseArray(): PropertyValue[] {
    this.expect(TokenType.LBRACKET);

    const values: PropertyValue[] = [];

    while (
      this.currentToken().type !== TokenType.RBRACKET &&
      this.currentToken().type !== TokenType.EOF
    ) {
      if (this.currentToken().type === TokenType.NUMBER) {
        values.push(parseFloat(this.advance().value));
      } else if (this.currentToken().type === TokenType.STRING) {
        values.push(this.advance().value);
      } else if (this.currentToken().type === TokenType.LBRACKET) {
        // Nested array
        values.push(this.parseArray());
      } else {
        throw new Error(
          `Unexpected token in array: ${this.currentToken().type} at line ${this.currentToken().line}`
        );
      }

      // Optional comma
      if (this.currentToken().type === TokenType.COMMA) {
        this.advance();
      }
    }

    this.expect(TokenType.RBRACKET);
    return values;
  }
}
