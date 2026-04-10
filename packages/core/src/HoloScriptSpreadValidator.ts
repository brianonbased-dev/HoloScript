/**
 * Spread Operator Type Checking & Validation
 *
 * Validates spread expressions during type checking phase:
 * - Ensures spread targets are arrays or objects
 * - Validates template references are valid
 * - Provides helpful error messages for invalid spreads
 */

import type { SpreadExpression, ASTNode } from './types';

// Internal types for validation
interface SymbolEntry {
  __type?: string;
  [key: string]: unknown;
}

interface RefArgument {
  __ref: string;
}

interface CallArgument {
  type: 'call';
  callee: string;
  args: unknown[];
}

export interface SpreadValidationContext {
  templateRefs: Map<string, unknown>;
  symbolTable: Map<string, SymbolEntry>;
  errors: Array<{ message: string; node: ASTNode; line: number; column: number }>;
}

export class SpreadOperatorValidator {
  private context: SpreadValidationContext;

  constructor(context: SpreadValidationContext) {
    this.context = context;
  }

  /**
   * Validate a spread expression in array context
   * Arrays can only be spread with array-like values
   */
  validateArraySpread(spread: SpreadExpression, arrayIndex: number): boolean {
    const targetType = this.resolveSpreadTarget(spread.argument);

    if (!targetType) {
      this.error(`Cannot resolve spread target in array context at position ${arrayIndex}`, spread);
      return false;
    }

    if (!['array', 'unknown'].includes(targetType)) {
      this.error(`Invalid array spread: expected array or collection, got ${targetType}`, spread);
      return false;
    }

    spread.targetType = targetType;
    spread.isValid = true;
    return true;
  }

  /**
   * Validate a spread expression in object context
   * Objects can only be spread with object-like values or templates
   */
  validateObjectSpread(spread: SpreadExpression, objectKey: string): boolean {
    const targetType = this.resolveSpreadTarget(spread.argument);

    if (!targetType) {
      this.error(`Cannot resolve spread target in object context at key "${objectKey}"`, spread);
      return false;
    }

    if (!['object', 'template', 'unknown'].includes(targetType)) {
      this.error(`Invalid object spread: expected object or template, got ${targetType}`, spread);
      return false;
    }

    spread.targetType = targetType;
    spread.isValid = true;
    return true;
  }

  /**
   * Validate spread in trait configuration
   * Trait configs are objects
   */
  validateTraitSpread(spread: SpreadExpression, traitName: string): boolean {
    const targetType = this.resolveSpreadTarget(spread.argument);

    if (!targetType) {
      this.error(`Cannot resolve spread target in @${traitName} config`, spread);
      return false;
    }

    if (!['object', 'unknown'].includes(targetType)) {
      this.error(
        `Invalid spread in @${traitName}: expected object or config, got ${targetType}`,
        spread
      );
      return false;
    }

    spread.targetType = targetType;
    spread.isValid = true;
    return true;
  }

  /**
   * Resolve the type of a spread target
   * Returns: 'array' | 'object' | 'template' | 'unknown' | null
   */
  private resolveSpreadTarget(
    argument: unknown
  ): 'object' | 'array' | 'template' | 'unknown' | null {
    if (!argument) return null;

    // String identifier reference (most common)
    if (typeof argument === 'string') {
      return this.resolveIdentifier(argument);
    }

    // Member reference { __ref: 'obj.prop' }
    if (typeof argument === 'object' && argument !== null && '__ref' in argument) {
      return this.resolveMemberExpression((argument as RefArgument).__ref);
    }

    // Function call { type: 'call', callee: 'getArray', args: [...] }
    if (
      typeof argument === 'object' &&
      argument !== null &&
      'type' in argument &&
      (argument as CallArgument).type === 'call'
    ) {
      // Conservative: assume function calls return objects
      return 'unknown';
    }

    // Direct array literal [ ... ]
    if (Array.isArray(argument)) {
      return 'array';
    }

    // Direct object literal { ... }
    if (typeof argument === 'object' && !('__ref' in argument) && !Array.isArray(argument)) {
      return 'object';
    }

    return 'unknown';
  }

  /**
   * Resolve identifier to a type (template, variable, etc)
   */
  private resolveIdentifier(identifier: string): 'object' | 'array' | 'template' | 'unknown' {
    // Check if it's a known template
    if (this.context.templateRefs.has(identifier)) {
      return 'template';
    }

    // Check if it's a known variable/symbol
    if (this.context.symbolTable.has(identifier)) {
      const symbol = this.context.symbolTable.get(identifier);
      return this.inferType(symbol);
    }

    // Unknown identifier - be permissive
    return 'unknown';
  }

  /**
   * Resolve member expressions like 'obj.prop.nested'
   */
  private resolveMemberExpression(memberPath: string): 'object' | 'array' | 'template' | 'unknown' {
    const parts = memberPath.split('.');

    if (parts.length === 0) return 'unknown';

    // Resolve the root identifier
    const root = parts[0];
    const currentType = this.resolveIdentifier(root);

    // For now, be permissive with nested access
    // Full flow analysis would track type through each member access
    if (currentType === 'unknown') {
      return 'unknown';
    }

    // If root is template, nested access still yields template-like
    if (currentType === 'template') {
      return 'template';
    }

    // Objects can contain objects or arrays
    return 'unknown';
  }

  /**
   * Infer type from a value
   */
  private inferType(value: unknown): 'object' | 'array' | 'template' | 'unknown' {
    if (Array.isArray(value)) {
      return 'array';
    }

    if (typeof value === 'object' && value !== null) {
      if ((value as SymbolEntry).__type === 'template') {
        return 'template';
      }
      return 'object';
    }

    return 'unknown';
  }

  /**
   * Record a validation error
   */
  private error(message: string, node: ASTNode): void {
    this.context.errors.push({
      message,
      node,
      line: node.line || 0,
      column: node.column || 0,
    });
  }
}

/**
 * Helper to check if a node contains spread operations
 */

export function hasSpreads(node: unknown): boolean {
  if (!node) return false;

  if (typeof node === 'object' && node !== null && 'type' in node && node.type === 'spread') {
    return true;
  }

  if (Array.isArray(node)) {
    return node.some(hasSpreads);
  }

  if (typeof node === 'object' && node !== null) {
    return Object.values(node as Record<string, unknown>).some(hasSpreads);
  }

  return false;
}

/**
 * Extract all spread expressions from an AST node
 */
export function extractSpreads(node: unknown): SpreadExpression[] {
  const spreads: SpreadExpression[] = [];

  function visit(n: unknown): void {
    if (!n) return;

    if (typeof n === 'object' && n !== null && 'type' in n && n.type === 'spread') {
      spreads.push(n as SpreadExpression);
    }

    if (Array.isArray(n)) {
      n.forEach(visit);
    } else if (typeof n === 'object' && n !== null) {
      Object.values(n as Record<string, unknown>).forEach(visit);
    }
  }

  visit(node);
  return spreads;
}

/**
 * Validate all spreads in an AST tree
 */
export function validateAllSpreads(ast: unknown, context: SpreadValidationContext): boolean {
  const validator = new SpreadOperatorValidator(context);
  const spreads = extractSpreads(ast);

  let allValid = true;

  for (const spread of spreads) {
    // Determine context from parent node
    // This is a simplified check - full implementation would track parent
    const parent = findParent(ast, spread) as unknown[] | Record<string, unknown> | null;

    if (parent && Array.isArray(parent)) {
      if (!validator.validateArraySpread(spread, parent.indexOf(spread))) {
        allValid = false;
      }
    } else if (parent && typeof parent === 'object') {
      if (!validator.validateObjectSpread(spread, 'unknown_key')) {
        allValid = false;
      }
    }
  }

  return allValid;
}

/**
 * Find parent node (simplified - real implementation would use visitor pattern)
 */
function findParent(root: unknown, target: unknown): unknown {
  function search(node: unknown): unknown {
    if (!node) return null;

    if (Array.isArray(node)) {
      if (node.includes(target)) return node;
      for (const item of node) {
        const result = search(item);
        if (result) return result;
      }
    } else if (typeof node === 'object' && node !== null) {
      for (const value of Object.values(node as Record<string, unknown>)) {
        if (value === target) return node;
        const result = search(value);
        if (result) return result;
      }
    }

    return null;
  }

  return search(root);
}

/**
 * Generate helpful error message for spread validation failure
 */
export function getSpreadErrorMessage(
  spread: SpreadExpression,
  targetType: string | null,
  context: 'array' | 'object' | 'trait'
): string {
  if (!targetType) {
    return `Cannot spread unknown value in ${context} context. Did you mean to reference a variable, template, or call a function?`;
  }

  const validTypes =
    context === 'array'
      ? 'arrays'
      : context === 'trait'
        ? 'configuration objects'
        : 'objects or templates';
  return `Cannot spread ${targetType} in ${context} context. Expected ${validTypes}.`;
}
