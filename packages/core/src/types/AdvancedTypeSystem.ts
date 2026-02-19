/**
 * @holoscript/core Advanced Type System
 *
 * Union types, generics, type inference, exhaustiveness checking
 */
import { HSPlusNode } from './HoloScriptPlus';
import { VRTraitName } from '../types';
export type { HSPlusNode, VRTraitName };

export type HoloScriptType =
  | PrimitiveType
  | ArrayType
  | UnionType
  | IntersectionType
  | GenericType
  | LiteralType
  | CustomType;

/**
 * Primitive types
 */
export type PrimitiveTypeName = 'number' | 'string' | 'boolean' | 'void';

export interface PrimitiveType {
  kind: 'primitive';
  name: PrimitiveTypeName;
}

/**
 * Array type: T[]
 */
export interface ArrayType {
  kind: 'array';
  elementType: HoloScriptType;
}

/**
 * Union type: A | B | C
 */
export interface UnionType {
  kind: 'union';
  members: HoloScriptType[];
}

/**
 * Intersection type: A & B
 */
export interface IntersectionType {
  kind: 'intersection';
  members: HoloScriptType[];
}

/**
 * Generic type: Container<T>
 */
export interface GenericType {
  kind: 'generic';
  name: string;
  typeArgs: HoloScriptType[];
}

/**
 * Literal type: "idle" | "moving"
 */
export interface LiteralType {
  kind: 'literal';
  value: string | number | boolean;
}

/**
 * Custom type: User-defined types
 */
export interface CustomType {
  kind: 'custom';
  name: string;
  properties: Map<string, HoloScriptType>;
  methods: Map<string, FunctionType>;
}

/**
 * Function type
 */
export interface FunctionType {
  kind: 'function';
  parameters: { name: string; type: HoloScriptType }[];
  returnType: HoloScriptType;
}

/**
 * Type inference engine
 */
export class TypeInferenceEngine {
  // Reserved for future type environment tracking
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // private typeEnvironment: Map<string, HoloScriptType> = new Map();
  // private genericTypeVars: Map<string, HoloScriptType> = new Map();

  /**
   * Infer type from value
   */
  inferType(value: any): HoloScriptType {
    if (typeof value === 'number') {
      return { kind: 'primitive', name: 'number' };
    }
    if (typeof value === 'string') {
      return { kind: 'primitive', name: 'string' };
    }
    if (typeof value === 'boolean') {
      return { kind: 'primitive', name: 'boolean' };
    }
    if (Array.isArray(value)) {
      const elementType: HoloScriptType =
        value.length > 0 ? this.inferType(value[0]) : { kind: 'primitive', name: 'void' };
      return { kind: 'array', elementType } as ArrayType;
    }
    return { kind: 'primitive', name: 'void' };
  }

  /**
   * Check type compatibility
   */
  isAssignableTo(from: HoloScriptType, to: HoloScriptType): boolean {
    // Same type
    if (JSON.stringify(from) === JSON.stringify(to)) return true;

    // Union type includes from
    if (to.kind === 'union') {
      return to.members.some((m) => this.isAssignableTo(from, m));
    }

    // Intersection type all match
    if (from.kind === 'intersection') {
      return from.members.every((m) => this.isAssignableTo(m, to));
    }

    // Array covariance
    if (from.kind === 'array' && to.kind === 'array') {
      return this.isAssignableTo(from.elementType, to.elementType);
    }

    return false;
  }

  /**
   * Unify types (for generics)
   */
  unify(t1: HoloScriptType, t2: HoloScriptType): Map<string, HoloScriptType> {
    const substitutions = new Map<string, HoloScriptType>();

    // If t1 is a type variable
    if (t1.kind === 'custom' && this.isTypeVariable(t1.name)) {
      substitutions.set(t1.name, t2);
      return substitutions;
    }

    // Structural unification
    if (t1.kind === 'array' && t2.kind === 'array') {
      return this.unify(t1.elementType, t2.elementType);
    }

    if (t1.kind === 'generic' && t2.kind === 'generic') {
      if (t1.name === t2.name && t1.typeArgs.length === t2.typeArgs.length) {
        for (let i = 0; i < t1.typeArgs.length; i++) {
          const unified = this.unify(t1.typeArgs[i], t2.typeArgs[i]);
          for (const [k, v] of unified) {
            substitutions.set(k, v);
          }
        }
      }
    }

    return substitutions;
  }

  private isTypeVariable(name: string): boolean {
    return /^[A-Z]$/.test(name); // Single uppercase letter is type var
  }

  /**
   * Resolve generic type with type arguments
   */
  resolveGeneric(generic: GenericType, concreteTypes: HoloScriptType[]): HoloScriptType {
    const substitutions = new Map<string, HoloScriptType>();

    for (let i = 0; i < generic.typeArgs.length; i++) {
      if (generic.typeArgs[i].kind === 'custom') {
        substitutions.set((generic.typeArgs[i] as CustomType).name, concreteTypes[i]);
      }
    }

    return this.substitute(generic, substitutions);
  }

  private substitute(type: HoloScriptType, subs: Map<string, HoloScriptType>): HoloScriptType {
    if (type.kind === 'generic' && subs.has(type.name)) {
      return subs.get(type.name)!;
    }

    if (type.kind === 'custom' && subs.has(type.name)) {
      return subs.get(type.name)!;
    }

    if (type.kind === 'array') {
      return {
        kind: 'array',
        elementType: this.substitute(type.elementType, subs),
      };
    }

    if (type.kind === 'union') {
      return {
        kind: 'union',
        members: type.members.map((m) => this.substitute(m, subs)),
      };
    }

    return type;
  }
}

/**
 * Exhaustiveness checker for match statements
 */
export class ExhaustivenessChecker {
  /**
   * Check if all union members are covered in match statement
   */
  checkMatch(
    unionType: UnionType,
    casePatterns: string[]
  ): {
    isExhaustive: boolean;
    uncoveredCases: string[];
  } {
    const patterns = new Set(casePatterns.map((p) => p.toLowerCase()));

    const uncovered: string[] = [];
    for (const member of unionType.members) {
      const caseName = this.getCaseName(member);
      if (!patterns.has(caseName.toLowerCase()) && caseName !== '_') {
        uncovered.push(caseName);
      }
    }

    return {
      isExhaustive: uncovered.length === 0 || patterns.has('_'),
      uncoveredCases: uncovered,
    };
  }

  private getCaseName(type: HoloScriptType): string {
    if (type.kind === 'literal') {
      return String(type.value);
    }
    if (type.kind === 'custom') {
      return type.name;
    }
    return type.kind;
  }
}

/**
 * Type checker for HoloScript+
 */
export class AdvancedTypeChecker {
  private inference: TypeInferenceEngine;
  private exhaustiveness: ExhaustivenessChecker;
  private types: Map<string, HoloScriptType> = new Map();

  constructor() {
    this.inference = new TypeInferenceEngine();
    this.exhaustiveness = new ExhaustivenessChecker();

    // Register built-in types
    this.registerBuiltins();
  }

  /**
   * Infer type from value
   */
  public inferType(value: any): HoloScriptType {
    return this.inference.inferType(value);
  }

  /**
   * Check if from is assignable to to
   */
  public isAssignableTo(from: HoloScriptType, to: HoloScriptType): boolean {
    return this.inference.isAssignableTo(from, to);
  }

  private registerBuiltins(): void {
    this.types.set('Vector3', {
      kind: 'custom',
      name: 'ASTVector3',
      properties: new Map([
        ['x', { kind: 'primitive', name: 'number' }],
        ['y', { kind: 'primitive', name: 'number' }],
        ['z', { kind: 'primitive', name: 'number' }],
      ]),
      methods: new Map(),
    });

    this.types.set('Transform', {
      kind: 'custom',
      name: 'Transform',
      properties: new Map([
        ['position', this.types.get('Vector3')!],
        ['rotation', this.types.get('Vector3')!],
        ['scale', this.types.get('Vector3')!],
      ]),
      methods: new Map(),
    });
  }

  /**
   * Register a new type
   */
  registerType(name: string, type: HoloScriptType): void {
    this.types.set(name, type);
  }

  /**
   * Get registered type
   */
  getType(name: string): HoloScriptType | undefined {
    return this.types.get(name);
  }

  /**
   * Check union exhaustiveness
   */
  checkUnionExhaustiveness(
    unionType: UnionType,
    cases: string[]
  ): { isExhaustive: boolean; uncoveredCases: string[] } {
    return this.exhaustiveness.checkMatch(unionType, cases);
  }

  /**
   * Check type assignment
   */
  checkAssignment(from: HoloScriptType, to: HoloScriptType): { valid: boolean; error?: string } {
    if (this.inference.isAssignableTo(from, to)) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `Type '${this.formatType(from)}' is not assignable to '${this.formatType(to)}'`,
    };
  }

  /**
   * Format type for display
   */
  public formatType(type: HoloScriptType): string {
    switch (type.kind) {
      case 'primitive':
        return type.name;
      case 'array':
        return `${this.formatType(type.elementType)}[]`;
      case 'union':
        return type.members.map((m) => this.formatType(m)).join(' | ');
      case 'intersection':
        return type.members.map((m) => this.formatType(m)).join(' & ');
      case 'custom':
        return type.name;
      case 'literal':
        return JSON.stringify(type.value);
      default:
        return 'unknown';
    }
  }
}

/**
 * HoloScript+ AST Types
 */
// HSPlusNode is imported from HoloScriptPlus.js

export interface ASTProgram extends HSPlusNode {
  type: 'Program';
  body: HSPlusNode[];
  version: string | number;
  root: HSPlusNode;
  imports: Array<{ path: string; alias: string }>;
  hasState: boolean;
  hasVRTraits: boolean;
  hasControlFlow: boolean;
  migrations?: any[];
}

export type HSPlusAST = ASTProgram;

export type HSPlusDirective =
  | HSPlusBaseDirective
  | HSPlusTraitDirective
  | HSPlusLifecycleDirective
  | HSPlusStateDirective
  | HSPlusForDirective
  | HSPlusForEachDirective
  | HSPlusWhileDirective
  | HSPlusIfDirective
  | HSPlusImportDirective
  | HSPlusVersionDirective
  | HSPlusMigrateDirective;

export interface HSPlusBaseDirective extends HSPlusNode {
  type: 'directive' | 'fragment' | 'external_api' | 'generate';
  name: string;
  args: string[];
}

export interface HSPlusTraitDirective extends HSPlusNode {
  type: 'trait';
  name: string;
  args?: any[];
  config?: any;
}

export interface HSPlusLifecycleDirective extends HSPlusNode {
  type: 'lifecycle';
  name?: string;
  hook: string;
  params?: string[];
  body: string;
}

export interface HSPlusStateDirective extends HSPlusNode {
  type: 'state';
  name: string;
  body?: Record<string, any>;
  initial?: any;
}

export interface HSPlusForDirective extends HSPlusNode {
  type: 'for';
  variable: string;
  range?: [number, number];
  iterable?: any;
  body: HSPlusNode[];
}

export interface HSPlusForEachDirective extends HSPlusNode {
  type: 'forEach';
  variable: string;
  collection: string;
  body: HSPlusNode[];
}

export interface HSPlusWhileDirective extends HSPlusNode {
  type: 'while';
  condition: string;
  body: HSPlusNode[];
}

export interface HSPlusIfDirective extends HSPlusNode {
  type: 'if';
  condition: string;
  body: HSPlusNode[];
}

export interface HSPlusImportDirective extends HSPlusNode {
  type: 'import';
  source: string;
  specifiers: string[];
}

export interface HSPlusVersionDirective extends HSPlusNode {
  type: 'version';
  version: number;
}

export interface HSPlusMigrateDirective extends HSPlusNode {
  type: 'migrate';
  fromVersion: number;
  body: string;
}

export interface HSPlusCompileResult {
  success: boolean;
  code?: string;
  sourceMap?: any;
  errors: Array<{ message: string; line: number; column: number }>;
  ast?: any;
  compiledExpressions?: any;
  requiredCompanions?: string[];
  features?: any;
  warnings?: any[];
  [key: string]: any;
}

export interface HSPlusParserOptions {
  sourceMap?: boolean;
  strict?: boolean;
  enableTypeScriptImports?: boolean;
  enableVRTraits?: boolean;
}

// VRTraitName is imported from ../types.ts

export interface StateDeclaration {
  name: string;
  type: HoloScriptType;
  initialValue?: any;
  [key: string]: any;
}

export interface LifecycleHook {
  name: 'mounted' | 'updated' | 'destroyed';
  handler: string;
}

export interface VRLifecycleHook {
  name: 'grabbed' | 'released' | 'pointed' | 'unpointed' | 'thrown';
  handler: string;
}

export interface ControllerHook {
  name: 'trigger' | 'grip' | 'thumbstick' | 'button_a' | 'button_b';
  handler: string;
}

// Redundant interfaces removed, using definitions from HoloScriptPlus.ts

// ============================================================================
// Optional Chaining Support
// ============================================================================

/**
 * Optional chaining expression: obj?.prop, arr?.[0], fn?.()
 */
export interface OptionalChainExpression {
  kind: 'optional-chain';
  base: Expression;
  chain: OptionalChainSegment[];
}

export type OptionalChainSegment =
  | { type: 'property'; name: string; optional: boolean }
  | { type: 'index'; index: Expression; optional: boolean }
  | { type: 'call'; args: Expression[]; optional: boolean };

export type Expression =
  | { kind: 'identifier'; name: string }
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'member'; object: Expression; property: string }
  | { kind: 'index'; object: Expression; index: Expression }
  | { kind: 'call'; callee: Expression; arguments: Expression[] }
  | { kind: 'binary'; operator: string; left: Expression; right: Expression }
  | { kind: 'unary'; operator: string; operand: Expression }
  | OptionalChainExpression
  | NullCoalescingExpression;

/**
 * Null coalescing expression: a ?? b
 */
export interface NullCoalescingExpression {
  kind: 'null-coalescing';
  left: Expression;
  right: Expression;
}

/**
 * Parse and evaluate optional chaining expressions
 */
export class OptionalChainingEvaluator {
  /**
   * Evaluate optional chain expression
   */
  evaluate(expr: OptionalChainExpression, context: Record<string, unknown>): unknown {
    let value: unknown = this.evaluateExpression(expr.base, context);

    for (const segment of expr.chain) {
      // If value is null/undefined and this is optional, short-circuit
      if (value == null) {
        if (segment.optional) {
          return undefined;
        }
        throw new Error(`Cannot access property of ${value}`);
      }

      switch (segment.type) {
        case 'property':
          value = (value as Record<string, unknown>)[segment.name];
          break;
        case 'index':
          const index = this.evaluateExpression(segment.index, context);
          value = (value as unknown[])[index as number];
          break;
        case 'call':
          const args = segment.args.map((arg) => this.evaluateExpression(arg, context));
          value = (value as Function)(...args);
          break;
      }
    }

    return value;
  }

  /**
   * Evaluate null coalescing expression
   */
  evaluateNullCoalescing(
    expr: NullCoalescingExpression,
    context: Record<string, unknown>
  ): unknown {
    const left = this.evaluateExpression(expr.left, context);
    if (left != null) {
      return left;
    }
    return this.evaluateExpression(expr.right, context);
  }

  /**
   * Evaluate any expression
   */
  evaluateExpression(expr: Expression, context: Record<string, unknown>): unknown {
    switch (expr.kind) {
      case 'identifier':
        return context[expr.name];
      case 'literal':
        return expr.value;
      case 'member':
        const obj = this.evaluateExpression(expr.object, context);
        return (obj as Record<string, unknown>)?.[expr.property];
      case 'index':
        const arr = this.evaluateExpression(expr.object, context);
        const idx = this.evaluateExpression(expr.index, context);
        return (arr as unknown[])?.[idx as number];
      case 'call':
        const fn = this.evaluateExpression(expr.callee, context);
        const args = expr.arguments.map((arg) => this.evaluateExpression(arg, context));
        return (fn as Function)?.(...args);
      case 'optional-chain':
        return this.evaluate(expr, context);
      case 'null-coalescing':
        return this.evaluateNullCoalescing(expr, context);
      case 'binary':
        return this.evaluateBinary(expr, context);
      case 'unary':
        return this.evaluateUnary(expr, context);
      default:
        return undefined;
    }
  }

  private evaluateBinary(
    expr: { kind: 'binary'; operator: string; left: Expression; right: Expression },
    context: Record<string, unknown>
  ): unknown {
    const left = this.evaluateExpression(expr.left, context);
    const right = this.evaluateExpression(expr.right, context);

    switch (expr.operator) {
      case '+':
        return (left as number) + (right as number);
      case '-':
        return (left as number) - (right as number);
      case '*':
        return (left as number) * (right as number);
      case '/':
        return (left as number) / (right as number);
      case '%':
        return (left as number) % (right as number);
      case '==':
        return left == right;
      case '===':
        return left === right;
      case '!=':
        return left != right;
      case '!==':
        return left !== right;
      case '<':
        return (left as number) < (right as number);
      case '>':
        return (left as number) > (right as number);
      case '<=':
        return (left as number) <= (right as number);
      case '>=':
        return (left as number) >= (right as number);
      case '&&':
        return left && right;
      case '||':
        return left || right;
      default:
        return undefined;
    }
  }

  private evaluateUnary(
    expr: { kind: 'unary'; operator: string; operand: Expression },
    context: Record<string, unknown>
  ): unknown {
    const operand = this.evaluateExpression(expr.operand, context);

    switch (expr.operator) {
      case '!':
        return !operand;
      case '-':
        return -(operand as number);
      case '+':
        return +(operand as number);
      case 'typeof':
        return typeof operand;
      default:
        return undefined;
    }
  }
}

/**
 * Parse optional chaining syntax from string
 */
export class OptionalChainingParser {
  private input: string = '';
  private pos: number = 0;

  /**
   * Parse expression string with optional chaining
   */
  parse(input: string): Expression {
    this.input = input.trim();
    this.pos = 0;
    return this.parseExpression();
  }

  private parseExpression(): Expression {
    return this.parseNullCoalescing();
  }

  private parseNullCoalescing(): Expression {
    let left = this.parseOr();

    while (this.match('??')) {
      const right = this.parseOr();
      left = {
        kind: 'null-coalescing',
        left,
        right,
      };
    }

    return left;
  }

  private parseOr(): Expression {
    let left = this.parseAnd();

    while (this.match('||')) {
      const right = this.parseAnd();
      left = { kind: 'binary', operator: '||', left, right };
    }

    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseEquality();

    while (this.match('&&')) {
      const right = this.parseEquality();
      left = { kind: 'binary', operator: '&&', left, right };
    }

    return left;
  }

  private parseEquality(): Expression {
    let left = this.parseComparison();

    while (true) {
      if (this.match('===')) {
        left = { kind: 'binary', operator: '===', left, right: this.parseComparison() };
      } else if (this.match('!==')) {
        left = { kind: 'binary', operator: '!==', left, right: this.parseComparison() };
      } else if (this.match('==')) {
        left = { kind: 'binary', operator: '==', left, right: this.parseComparison() };
      } else if (this.match('!=')) {
        left = { kind: 'binary', operator: '!=', left, right: this.parseComparison() };
      } else {
        break;
      }
    }

    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseTerm();

    while (true) {
      if (this.match('<=')) {
        left = { kind: 'binary', operator: '<=', left, right: this.parseTerm() };
      } else if (this.match('>=')) {
        left = { kind: 'binary', operator: '>=', left, right: this.parseTerm() };
      } else if (this.match('<')) {
        left = { kind: 'binary', operator: '<', left, right: this.parseTerm() };
      } else if (this.match('>')) {
        left = { kind: 'binary', operator: '>', left, right: this.parseTerm() };
      } else {
        break;
      }
    }

    return left;
  }

  private parseTerm(): Expression {
    let left = this.parseFactor();

    while (true) {
      if (this.match('+')) {
        left = { kind: 'binary', operator: '+', left, right: this.parseFactor() };
      } else if (this.match('-')) {
        left = { kind: 'binary', operator: '-', left, right: this.parseFactor() };
      } else {
        break;
      }
    }

    return left;
  }

  private parseFactor(): Expression {
    let left = this.parseUnary();

    while (true) {
      if (this.match('*')) {
        left = { kind: 'binary', operator: '*', left, right: this.parseUnary() };
      } else if (this.match('/')) {
        left = { kind: 'binary', operator: '/', left, right: this.parseUnary() };
      } else if (this.match('%')) {
        left = { kind: 'binary', operator: '%', left, right: this.parseUnary() };
      } else {
        break;
      }
    }

    return left;
  }

  private parseUnary(): Expression {
    if (this.match('!')) {
      return { kind: 'unary', operator: '!', operand: this.parseUnary() };
    }
    if (this.match('-')) {
      return { kind: 'unary', operator: '-', operand: this.parseUnary() };
    }
    if (this.match('+')) {
      return { kind: 'unary', operator: '+', operand: this.parseUnary() };
    }

    return this.parsePostfix();
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match('?.')) {
        // Optional property access
        const name = this.parseIdentifier();
        expr = {
          kind: 'optional-chain',
          base: expr,
          chain: [{ type: 'property', name, optional: true }],
        };
      } else if (this.match('?.[')) {
        // Optional index access
        const index = this.parseExpression();
        this.expect(']');
        expr = {
          kind: 'optional-chain',
          base: expr,
          chain: [{ type: 'index', index, optional: true }],
        };
      } else if (this.match('?.(')) {
        // Optional function call
        const args = this.parseArguments();
        this.expect(')');
        expr = {
          kind: 'optional-chain',
          base: expr,
          chain: [{ type: 'call', args, optional: true }],
        };
      } else if (this.match('.')) {
        // Regular property access
        const name = this.parseIdentifier();
        expr = { kind: 'member', object: expr, property: name };
      } else if (this.match('[')) {
        // Regular index access
        const index = this.parseExpression();
        this.expect(']');
        expr = { kind: 'index', object: expr, index };
      } else if (this.match('(')) {
        // Regular function call
        const args = this.parseArguments();
        this.expect(')');
        expr = { kind: 'call', callee: expr, arguments: args };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): Expression {
    this.skipWhitespace();

    // Number
    if (/[0-9]/.test(this.peek())) {
      return { kind: 'literal', value: this.parseNumber() };
    }

    // String
    if (this.peek() === '"' || this.peek() === "'") {
      return { kind: 'literal', value: this.parseString() };
    }

    // Boolean / null
    if (this.matchWord('true')) return { kind: 'literal', value: true };
    if (this.matchWord('false')) return { kind: 'literal', value: false };
    if (this.matchWord('null')) return { kind: 'literal', value: null };

    // Parenthesized expression
    if (this.match('(')) {
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }

    // Identifier
    return { kind: 'identifier', name: this.parseIdentifier() };
  }

  private parseArguments(): Expression[] {
    const args: Expression[] = [];
    this.skipWhitespace();

    if (this.peek() === ')') return args;

    args.push(this.parseExpression());
    while (this.match(',')) {
      args.push(this.parseExpression());
    }

    return args;
  }

  private parseIdentifier(): string {
    this.skipWhitespace();
    let name = '';
    while (this.pos < this.input.length && /[a-zA-Z0-9_$]/.test(this.input[this.pos])) {
      name += this.input[this.pos++];
    }
    return name;
  }

  private parseNumber(): number {
    let numStr = '';
    while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) {
      numStr += this.input[this.pos++];
    }
    return parseFloat(numStr);
  }

  private parseString(): string {
    const quote = this.input[this.pos++];
    let str = '';
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\') {
        this.pos++;
        str += this.input[this.pos++];
      } else {
        str += this.input[this.pos++];
      }
    }
    this.pos++; // consume closing quote
    return str;
  }

  private peek(): string {
    this.skipWhitespace();
    return this.input[this.pos] || '';
  }

  private match(str: string): boolean {
    this.skipWhitespace();
    if (this.input.slice(this.pos, this.pos + str.length) === str) {
      this.pos += str.length;
      return true;
    }
    return false;
  }

  private matchWord(word: string): boolean {
    this.skipWhitespace();
    if (this.input.slice(this.pos, this.pos + word.length) === word) {
      const nextChar = this.input[this.pos + word.length];
      if (!nextChar || !/[a-zA-Z0-9_]/.test(nextChar)) {
        this.pos += word.length;
        return true;
      }
    }
    return false;
  }

  private expect(str: string): void {
    this.skipWhitespace();
    if (!this.match(str)) {
      throw new Error(`Expected '${str}' at position ${this.pos}`);
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }
}

// ============================================================================
// Type Parser for Generic and Union Types
// ============================================================================

/**
 * Parse type annotations from strings
 * Supports: string, number, Array<T>, Map<K, V>, T | U, T & U
 */
export class TypeAnnotationParser {
  private input: string = '';
  private pos: number = 0;

  /**
   * Parse type annotation string
   */
  parse(input: string): HoloScriptType {
    this.input = input.trim();
    this.pos = 0;
    return this.parseType();
  }

  private parseType(): HoloScriptType {
    return this.parseUnionType();
  }

  private parseUnionType(): HoloScriptType {
    const types: HoloScriptType[] = [this.parseIntersectionType()];

    while (this.match('|')) {
      types.push(this.parseIntersectionType());
    }

    if (types.length === 1) return types[0];
    return { kind: 'union', members: types };
  }

  private parseIntersectionType(): HoloScriptType {
    const types: HoloScriptType[] = [this.parseArrayType()];

    while (this.match('&')) {
      types.push(this.parseArrayType());
    }

    if (types.length === 1) return types[0];
    return { kind: 'intersection', members: types };
  }

  private parseArrayType(): HoloScriptType {
    let type = this.parsePrimaryType();

    while (this.match('[]')) {
      type = { kind: 'array', elementType: type };
    }

    return type;
  }

  private parsePrimaryType(): HoloScriptType {
    this.skipWhitespace();

    // Literal type
    if (this.peek() === '"' || this.peek() === "'") {
      const value = this.parseString();
      return { kind: 'literal', value };
    }

    // Number literal type
    if (/[0-9]/.test(this.peek())) {
      const value = this.parseNumber();
      return { kind: 'literal', value };
    }

    // Boolean literal
    if (this.matchWord('true')) return { kind: 'literal', value: true };
    if (this.matchWord('false')) return { kind: 'literal', value: false };

    // Primitive types
    if (this.matchWord('string')) return { kind: 'primitive', name: 'string' };
    if (this.matchWord('number')) return { kind: 'primitive', name: 'number' };
    if (this.matchWord('boolean')) return { kind: 'primitive', name: 'boolean' };
    if (this.matchWord('void')) return { kind: 'primitive', name: 'void' };

    // Parenthesized type
    if (this.match('(')) {
      const type = this.parseType();
      this.expect(')');
      return type;
    }

    // Generic or named type
    const name = this.parseIdentifier();

    if (this.match('<')) {
      // Generic type
      const typeArgs = this.parseTypeArguments();
      this.expect('>');
      return { kind: 'generic', name, typeArgs };
    }

    // Custom/named type
    return {
      kind: 'custom',
      name,
      properties: new Map(),
      methods: new Map(),
    };
  }

  private parseTypeArguments(): HoloScriptType[] {
    const args: HoloScriptType[] = [this.parseType()];

    while (this.match(',')) {
      args.push(this.parseType());
    }

    return args;
  }

  private parseIdentifier(): string {
    this.skipWhitespace();
    let name = '';
    while (this.pos < this.input.length && /[a-zA-Z0-9_$]/.test(this.input[this.pos])) {
      name += this.input[this.pos++];
    }
    return name;
  }

  private parseString(): string {
    const quote = this.input[this.pos++];
    let str = '';
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      str += this.input[this.pos++];
    }
    this.pos++;
    return str;
  }

  private parseNumber(): number {
    let numStr = '';
    while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) {
      numStr += this.input[this.pos++];
    }
    return parseFloat(numStr);
  }

  private peek(): string {
    this.skipWhitespace();
    return this.input[this.pos] || '';
  }

  private match(str: string): boolean {
    this.skipWhitespace();
    if (this.input.slice(this.pos, this.pos + str.length) === str) {
      this.pos += str.length;
      return true;
    }
    return false;
  }

  private matchWord(word: string): boolean {
    this.skipWhitespace();
    if (this.input.slice(this.pos, this.pos + word.length) === word) {
      const nextChar = this.input[this.pos + word.length];
      if (!nextChar || !/[a-zA-Z0-9_]/.test(nextChar)) {
        this.pos += word.length;
        return true;
      }
    }
    return false;
  }

  private expect(str: string): void {
    if (!this.match(str)) {
      throw new Error(`Expected '${str}' at position ${this.pos}`);
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }
}
