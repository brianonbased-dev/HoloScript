/**
 * TypeInferencePass — HoloScript+ Compiler
 *
 * Infers primitive types for HS+ AST nodes without explicit type annotations.
 *
 * Rules:
 *  number literals:
 *    - integer (no '.') → 'int'
 *    - float (has '.' or 'e/E') → 'float'
 *  array literals:
 *    - length 2 homogeneous numbers → 'vec2'
 *    - length 3 homogeneous numbers → 'vec3'
 *    - length 4 homogeneous numbers with values 0-1 → 'color', else → 'vec4'
 *  string literals → 'string'
 *  boolean literals → 'bool'
 *  unknown / complex → 'unknown' (never throws)
 *
 * Trait property narrowing:
 *  If a node name matches a registered trait name and the property key
 *  exists in that trait's defaultConfig, the type is inferred from the
 *  defaultConfig value.
 *
 * @module TypeInferencePass
 * @version 1.0.0
 */

import type { HSPlusNode, HSPlusAST, HSPlusType } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A snapshot of all inferred types for a compilation unit.
 * Key: node id (name or generated id); value: inferred type.
 */
export type TypeMap = Map<string, HSPlusType>;

/**
 * Optional registry of trait name → defaultConfig shape.
 * When provided, trait property types are inferred from the config values.
 */
export type TraitConfigRegistry = Map<string, Record<string, unknown>>;

export interface InferenceContext {
  /** Optional trait config registry for property narrowing */
  traitConfigs?: TraitConfigRegistry;
  /**
   * Binding map accumulated during inference.
   * Key: variable name; value: inferred type.
   * Used to propagate `let` bindings across a scope.
   */
  bindings?: Map<string, HSPlusType>;
}

// =============================================================================
// PASS
// =============================================================================

export class TypeInferencePass {
  private traitConfigs: TraitConfigRegistry;

  constructor(options: { traitConfigs?: TraitConfigRegistry } = {}) {
    this.traitConfigs = options.traitConfigs ?? new Map();
  }

  /**
   * Run inference across an entire AST.
   * Returns a TypeMap with inferred types for all named nodes.
   * The AST is annotated in-place (node.inferredType).
   */
  run(ast: HSPlusAST): TypeMap {
    const typeMap: TypeMap = new Map();
    const ctx: InferenceContext = {
      traitConfigs: this.traitConfigs,
      bindings: new Map(),
    };
    this.walkNode(ast.root, typeMap, ctx);
    return typeMap;
  }

  /**
   * Infer the type of a single literal/expression value.
   * Pure utility — useful in tests and the REPL.
   */
  inferValue(value: unknown): HSPlusType {
    return inferLiteralType(value);
  }

  /**
   * Infer the type of a trait property against a registered defaultConfig.
   * Returns 'unknown' if the trait or property is not registered.
   */
  inferTraitProperty(traitName: string, propertyKey: string): HSPlusType {
    const config = this.traitConfigs.get(traitName);
    if (!config || !(propertyKey in config)) return 'unknown';
    return inferLiteralType(config[propertyKey]);
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private walkNode(node: HSPlusNode, out: TypeMap, ctx: InferenceContext): void {
    if (!node) return;

    // Annotate the node itself
    const t = this.inferNode(node, ctx);
    if (t !== 'unknown') {
      node.inferredType = t;
      const id = node.name ?? node.type;
      if (id) out.set(id, t);
    }

    // Recurse into children
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.walkNode(child, out, ctx);
      }
    }
  }

  private inferNode(node: HSPlusNode, ctx: InferenceContext): HSPlusType {
    // Explicit value on node (literal nodes)
    if (node.value !== undefined) {
      return inferLiteralType(node.value);
    }

    // Properties-based node — check trait config registry
    if (node.type === 'Property' && node.name && node.data !== undefined) {
      return inferLiteralType(node.data);
    }

    // Trait node: infer from registered defaultConfig
    if (node.type === 'Trait' && node.name) {
      const config = ctx.traitConfigs?.get(node.name);
      if (config && node.properties) {
        // Type = the most specific type across all defined properties
        return this.typeFromConfig(node.properties as Record<string, unknown>, config);
      }
    }

    // `let` binding propagation
    if (node.type === 'Let' && node.name && node.value !== undefined) {
      const t = inferLiteralType(node.value);
      ctx.bindings?.set(node.name, t);
      return t;
    }
    if (node.type === 'Identifier' && node.name) {
      return ctx.bindings?.get(node.name) ?? 'unknown';
    }

    return 'unknown';
  }

  private typeFromConfig(
    props: Record<string, unknown>,
    config: Record<string, unknown>
  ): HSPlusType {
    for (const [key, value] of Object.entries(props)) {
      if (key in config) {
        const t = inferLiteralType(value);
        if (t !== 'unknown') return t;
      }
    }
    return 'unknown';
  }
}

// =============================================================================
// PURE LITERAL INFERENCE
// =============================================================================

/**
 * Infer the HSPlusType of a JavaScript value.
 * Never throws — returns 'unknown' for anything it can't classify.
 */
export function inferLiteralType(value: unknown): HSPlusType {
  if (value === null || value === undefined) return 'unknown';

  switch (typeof value) {
    case 'boolean':
      return 'bool';

    case 'string':
      return 'string';

    case 'number': {
      // int vs float
      return Number.isInteger(value) ? 'int' : 'float';
    }

    case 'object': {
      if (!Array.isArray(value)) return 'unknown';

      const arr = value as unknown[];
      if (arr.length === 0) return 'unknown';

      // All elements must be numbers
      if (!arr.every((v) => typeof v === 'number')) return 'unknown';

      const nums = arr as number[];

      if (nums.length === 2) return 'vec2';
      if (nums.length === 3) return 'vec3';
      if (nums.length === 4) {
        // If all values in [0, 1] → treat as color
        if (nums.every((n) => n >= 0 && n <= 1)) return 'color';
        return 'vec4';
      }

      return 'unknown';
    }

    default:
      return 'unknown';
  }
}
