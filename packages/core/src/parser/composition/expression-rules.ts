/**
 * HoloScript Composition Parser — Expression Rule Functions
 *
 * Extracted from HoloCompositionParser.ts (W1-T2: split by rule-family).
 * Pure expression-parsing functions that operate on a narrow structural
 * interface (ExpressionParserApi), avoiding circular imports on the parser
 * class itself.
 *
 * Design follows W1-T4's handler-registry pattern:
 *   - ExpressionParserApi is a STRUCTURAL interface — no import of
 *     HoloCompositionParser, so this module is free of circular deps.
 *   - The parser implements the shape via duck typing (its existing private
 *     methods already satisfy the interface).
 *   - Thin delegate methods in the parser class call through to these
 *     functions, maintaining the original public API.
 *
 * Behavior LOCKED by existing characterization tests + unit suite.
 *
 * @version 1.0.0
 */

import type {
  HoloExpression,
  SourceLocation,
} from '../HoloCompositionTypes';
import type { Token, TokenType } from './tokens';

// =============================================================================
// STRUCTURAL INTERFACE — no circular dep on HoloCompositionParser
// =============================================================================

/**
 * Narrow API surface that expression rules need from the parser.
 * HoloCompositionParser satisfies this via duck typing — its existing
 * private methods (current, peek, advance, expect, etc.) match this shape.
 */
export interface ExpressionParserApi {
  current(): Token;
  peek(offset: number): Token;
  previous(): Token;
  advance(): Token;
  expect(type: TokenType): Token;
  expectIdentifier(): string;
  check(type: TokenType | TokenType[]): boolean;
  match(type: TokenType | TokenType[]): boolean;
  isAtEnd(): boolean;
  skipNewlines(): void;
  currentLocation(): SourceLocation;
  error(message: string, suggestion?: string): void;
  expressionToString(expr: HoloExpression): string;
  /** Static-domain token set — accessed via the parser's static property */
  DOMAIN_TOKENS: Set<TokenType>;
}

// =============================================================================
// KEYWORD-AS-IDENTIFIER CHECKS
// =============================================================================

/** All domain/simulation keywords that can be used as identifiers (property names) */
const KEYWORDS_AS_IDENTIFIERS: TokenType[] = [
  'STATE',
  'OBJECT',
  'TEMPLATE',
  'ENVIRONMENT',
  'LOGIC',
  'ACTION',
  'EMIT',
  'ANIMATE',
  'RETURN',
  'LIGHT',
  'EFFECTS',
  'CAMERA',
  'BIND',
  'TIMELINE',
  'AUDIO',
  'ZONE',
  'UI',
  'TRANSITION',
  'ELEMENT',
  'ON_ERROR',
  'THEME',
  'DIALOGUE_TREE',
  // Spatial primitives
  'SPAWN_GROUP',
  'WAYPOINTS',
  'CONSTRAINT',
  'TERRAIN',
  'PARTICLES',
  // Game/AI keywords that can appear as property names
  'SHAPE',
  'NPC',
  'QUEST',
  'ABILITY',
  'DIALOGUE',
  'STATE_MACHINE',
  'ACHIEVEMENT',
  'TALENT_TREE',
  'IMPORT',
  'USING',
  'FROM',
  'COMPOSITION',
  'SPATIAL_GROUP',
  'SPATIAL_AGENT',
  'SPATIAL_CONTAINER',
];

/**
 * Check if a token type is a keyword that can be used as an identifier.
 * Domain tokens (IOT_SENSOR, ROBOT_JOINT, etc.) are always valid identifiers.
 */
export function isKeywordAsIdentifierType(api: ExpressionParserApi, type: TokenType): boolean {
  if (api.DOMAIN_TOKENS.has(type)) return true;
  return KEYWORDS_AS_IDENTIFIERS.includes(type);
}

/**
 * Try to consume a keyword-as-identifier token.
 * Returns true and advances if current token is a keyword usable as an identifier.
 */
export function isKeywordAsIdentifier(api: ExpressionParserApi): boolean {
  if (isKeywordAsIdentifierType(api, api.current().type)) {
    api.advance();
    return true;
  }
  return false;
}

// =============================================================================
// EXPRESSION PARSING
// =============================================================================

export function parseExpression(api: ExpressionParserApi): HoloExpression {
  return parseConditionalExpr(api);
}

function parseConditionalExpr(api: ExpressionParserApi): HoloExpression {
  const startLoc = api.currentLocation();
  const expr = parseOrExpr(api);

  if (api.match('QUESTION')) {
    const consequent = parseExpression(api);
    api.expect('COLON');
    const alternate = parseConditionalExpr(api);
    return {
      loc: { start: startLoc, end: api.currentLocation() },
      type: 'ConditionalExpression', test: expr, consequent, alternate,
    };
  }

  return expr;
}

function parseOrExpr(api: ExpressionParserApi): HoloExpression {
  let left = parseAndExpr(api);
  while (api.match('OR')) {
    const right = parseAndExpr(api);
    left = { type: 'BinaryExpression', operator: '||', left, right };
  }
  return left;
}

function parseAndExpr(api: ExpressionParserApi): HoloExpression {
  let left = parseEqualityExpr(api);
  while (api.match('AND')) {
    const right = parseEqualityExpr(api);
    left = { type: 'BinaryExpression', operator: '&&', left, right };
  }
  return left;
}

function parseEqualityExpr(api: ExpressionParserApi): HoloExpression {
  let left = parseComparisonExpr(api);
  while (api.check('EQUALS_EQUALS') || api.check('BANG_EQUALS')) {
    const op = api.advance().value;
    const right = parseComparisonExpr(api);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseComparisonExpr(api: ExpressionParserApi): HoloExpression {
  let left = parseAdditiveExpr(api);
  while (
    api.check('LESS') ||
    api.check('GREATER') ||
    api.check('LESS_EQUALS') ||
    api.check('GREATER_EQUALS')
  ) {
    const op = api.advance().value;
    const right = parseAdditiveExpr(api);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseAdditiveExpr(api: ExpressionParserApi): HoloExpression {
  let left = parseMultiplicativeExpr(api);
  while (api.check('PLUS') || api.check('MINUS')) {
    const op = api.advance().value;
    const right = parseMultiplicativeExpr(api);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseMultiplicativeExpr(api: ExpressionParserApi): HoloExpression {
  let left = parseUnaryExpr(api);
  while (api.check('STAR') || api.check('SLASH')) {
    const op = api.advance().value;
    const right = parseUnaryExpr(api);
    left = { type: 'BinaryExpression', operator: op, left, right };
  }
  return left;
}

function parseUnaryExpr(api: ExpressionParserApi): HoloExpression {
  const startLoc = api.currentLocation();
  if (api.check('BANG') || api.check('MINUS')) {
    const op = api.advance().value as '!' | '-';
    const argument = parseUnaryExpr(api);
    return {
      loc: { start: startLoc, end: api.currentLocation() },
      type: 'UnaryExpression', operator: op, argument,
    };
  }
  return parsePostfixExpr(api);
}

function parsePostfixExpr(api: ExpressionParserApi): HoloExpression {
  let expr = parsePrimaryExpr(api);

  while (true) {
    if (api.match('DOT')) {
      const property = api.expectIdentifier();
      expr = { type: 'MemberExpression', object: expr, property, computed: false };
    } else if (api.match('LBRACKET')) {
      const index = parseExpression(api);
      api.expect('RBRACKET');
      const property = api.expressionToString(index);
      expr = { type: 'MemberExpression', object: expr, property, computed: true };
    } else if (api.match('LPAREN')) {
      const args = parseArgumentList(api);
      expr = { type: 'CallExpression', callee: expr, arguments: args };
    } else if (api.match('INC')) {
      expr = {
        type: 'UpdateExpression' as const,
        operator: '++' as const,
        argument: expr,
        prefix: false,
      };
    } else if (api.match('DEC')) {
      expr = {
        type: 'UpdateExpression' as const,
        operator: '--' as const,
        argument: expr,
        prefix: false,
      };
    } else {
      break;
    }
  }

  return expr;
}

function parseArgumentList(api: ExpressionParserApi): HoloExpression[] {
  api.skipNewlines();
  const args: HoloExpression[] = [];
  if (api.check('RPAREN')) {
    api.expect('RPAREN');
    return args;
  }

  args.push(parseExpression(api));
  while (api.match('COMMA')) {
    api.skipNewlines();
    args.push(parseExpression(api));
  }
  api.skipNewlines();
  api.expect('RPAREN');
  return args;
}

function parsePrimaryExpr(api: ExpressionParserApi): HoloExpression {
  const startLoc = api.currentLocation();
  if (api.match('NUMBER')) {
    return {
      loc: { start: startLoc, end: api.currentLocation() },
      type: 'Literal', value: parseFloat(api.previous().value),
    };
  }
  if (api.match('STRING')) {
    return {
      loc: { start: startLoc, end: api.currentLocation() },
      type: 'Literal', value: api.previous().value,
    };
  }
  if (api.match('BOOLEAN')) {
    return {
      loc: { start: startLoc, end: api.currentLocation() },
      type: 'Literal', value: api.previous().value === 'true',
    };
  }
  if (api.match('NULL')) {
    return {
      loc: { start: startLoc, end: api.currentLocation() },
      type: 'Literal', value: null,
    };
  }

  // Explicitly handle Identifier
  if (api.match('IDENTIFIER')) {
    return {
      loc: { start: startLoc, end: api.currentLocation() },
      type: 'Identifier', name: api.previous().value,
    };
  }

  // Handle Keywords as Identifiers
  if (isKeywordAsIdentifier(api)) {
    return {
      loc: { start: startLoc, end: api.currentLocation() },
      type: 'Identifier', name: api.previous().value,
    };
  }

  if (api.match('LBRACKET')) {
    return parseArrayExpression(api);
  }
  if (api.match('LBRACE')) {
    return parseObjectExpression(api);
  }
  if (api.match('LPAREN')) {
    const expr = parseExpression(api);
    api.expect('RPAREN');
    return expr;
  }

  api.error(`Unexpected token: ${api.current().type}`);
  api.advance();
  return {
    loc: { start: startLoc, end: api.currentLocation() },
    type: 'Literal', value: null,
  };
}

function parseArrayExpression(api: ExpressionParserApi): HoloExpression {
  const startLoc = api.currentLocation();
  api.skipNewlines();
  const elements: HoloExpression[] = [];
  while (!api.check('RBRACKET') && !api.isAtEnd()) {
    api.skipNewlines();
    elements.push(parseExpression(api));
    api.skipNewlines();
    if (!api.match('COMMA')) break;
    api.skipNewlines();
  }
  api.skipNewlines();
  api.expect('RBRACKET');
  return {
    loc: { start: startLoc, end: api.currentLocation() },
    type: 'ArrayExpression', elements,
  };
}

function parseObjectExpression(api: ExpressionParserApi): HoloExpression {
  const startLoc = api.currentLocation();
  api.skipNewlines();
  const properties: { key: string; value: HoloExpression }[] = [];
  while (!api.check('RBRACE') && !api.isAtEnd()) {
    api.skipNewlines();
    const key = api.expectIdentifier();
    api.expect('COLON');
    const value = parseExpression(api);
    properties.push({ key, value });
    api.skipNewlines();
    if (!api.match('COMMA')) break;
    api.skipNewlines();
  }
  api.skipNewlines();
  api.expect('RBRACE');
  return {
    loc: { start: startLoc, end: api.currentLocation() },
    type: 'ObjectExpression', properties,
  };
}