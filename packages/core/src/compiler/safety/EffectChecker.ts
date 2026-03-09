/**
 * @fileoverview Effect Checker — Compile-Time Effect Verification
 * @module @holoscript/core/compiler/safety
 *
 * Walks the AST to verify that all functions/traits have declared
 * effects matching their actual (inferred) effects. Undeclared
 * effects produce compile errors.
 *
 * This is the core of the compile-time safety pass: it ensures
 * agent code can't silently perform unauthorized operations.
 *
 * @version 1.0.0
 */

import {
  EffectRow,
  VREffect,
  EffectViolation,
  EffectViolationSeverity,
  EffectCategory,
} from '../../types/effects';
import {
  inferFromTraits,
  inferFromBuiltins,
  composeEffects,
  InferredEffects,
  TRAIT_EFFECTS,
  BUILTIN_EFFECTS,
} from './EffectInference';

// =============================================================================
// CHECKER CONFIGURATION
// =============================================================================

/** Configuration for the effect checker */
export interface EffectCheckerConfig {
  /** Severity for undeclared effects (default: 'error') */
  undeclaredSeverity?: EffectViolationSeverity;
  /** Severity for unused declared effects (default: 'warning') */
  unusedDeclaredSeverity?: EffectViolationSeverity;
  /** Effect categories to ignore (won't trigger violations) */
  ignoredCategories?: EffectCategory[];
  /** Max allowed effects per function (0 = unlimited) */
  maxEffectsPerFunction?: number;
  /** Treat unknown traits as errors (default: false = warn) */
  strictUnknownTraits?: boolean;
}

const DEFAULT_CONFIG: Required<EffectCheckerConfig> = {
  undeclaredSeverity: 'error',
  unusedDeclaredSeverity: 'warning',
  ignoredCategories: [],
  maxEffectsPerFunction: 0,
  strictUnknownTraits: false,
};

// =============================================================================
// AST INTERFACE (Minimal — works with any AST shape)
// =============================================================================

/** Minimal AST node for effect checking */
export interface EffectASTNode {
  type: string;
  name?: string;
  traits?: string[]; // Trait names used by this node (e.g., ['@mesh', '@physics'])
  calls?: string[]; // Built-in function calls made by this node
  children?: EffectASTNode[];
  declaredEffects?: VREffect[]; // Explicit effect annotation (if present)
  line?: number;
  column?: number;
  file?: string;
}

// =============================================================================
// EFFECT CHECKER
// =============================================================================

/** Result of checking a single function/object */
export interface EffectCheckResult {
  /** Name of the function/object */
  name: string;
  /** Declared effect row (from annotation) */
  declared: EffectRow;
  /** Inferred effect row (from analysis) */
  inferred: EffectRow;
  /** Undeclared effects (inferred but not declared) */
  undeclared: EffectRow;
  /** Unused declarations (declared but not inferred) */
  unused: EffectRow;
  /** Violations found */
  violations: EffectViolation[];
  /** Effect sources */
  sources: Map<VREffect, string[]>;
}

/** Result of checking an entire module */
export interface ModuleEffectCheckResult {
  /** Per-function results */
  functions: Map<string, EffectCheckResult>;
  /** All violations across the module */
  violations: EffectViolation[];
  /** Combined effect row for the entire module (public API) */
  moduleEffects: EffectRow;
  /** Whether the module passes the effect check */
  passed: boolean;
  /** Total effects count */
  totalEffects: number;
  /** Warnings (non-blocking) */
  warnings: string[];
}

/**
 * EffectChecker — verifies effect declarations against inferred effects.
 */
export class EffectChecker {
  private config: Required<EffectCheckerConfig>;

  constructor(config: EffectCheckerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check a single AST node (function or object definition) for effect correctness.
   */
  checkNode(node: EffectASTNode): EffectCheckResult {
    const name = node.name || '<anonymous>';

    // 1. Infer effects from traits and function calls
    const traitEffects = inferFromTraits(node.traits || []);
    const builtinEffects = inferFromBuiltins(node.calls || []);

    // 2. Recurse into children and compose their effects
    const childEffects: InferredEffects[] = [];
    if (node.children) {
      for (const child of node.children) {
        const childResult = this.checkNode(child);
        childEffects.push({
          row: childResult.inferred,
          sources: childResult.sources,
          warnings: [],
        });
      }
    }

    // 3. Compose all effects into the inferred row
    const combined = composeEffects(traitEffects, builtinEffects, ...childEffects);

    // 4. Filter out ignored categories
    let inferred = combined.row;
    if (this.config.ignoredCategories.length > 0) {
      const filtered = inferred.toArray().filter((e) => {
        const cat = e.split(':')[0] as EffectCategory;
        return !this.config.ignoredCategories.includes(cat);
      });
      inferred = new EffectRow(filtered);
    }

    // 5. Get declared effects (from annotation or default to empty = "pure")
    const declared = node.declaredEffects ? new EffectRow(node.declaredEffects) : EffectRow.PURE; // No annotation = pure assertion

    // 6. Compute violations
    const undeclared = inferred.difference(declared);
    const unused = declared.difference(inferred);
    const violations = this.computeViolations(name, node, undeclared, unused, combined.sources);

    return { name, declared, inferred, undeclared, unused, violations, sources: combined.sources };
  }

  /**
   * Check an entire module (array of top-level AST nodes).
   */
  checkModule(nodes: EffectASTNode[], moduleId?: string): ModuleEffectCheckResult {
    const functions = new Map<string, EffectCheckResult>();
    const allViolations: EffectViolation[] = [];
    let moduleEffects = EffectRow.PURE;
    const warnings: string[] = [];

    for (const node of nodes) {
      const result = this.checkNode(node);
      functions.set(result.name, result);
      allViolations.push(...result.violations);
      moduleEffects = moduleEffects.union(result.inferred);
    }

    const hasErrors = allViolations.some((v) => v.severity === 'error');

    return {
      functions,
      violations: allViolations,
      moduleEffects,
      passed: !hasErrors,
      totalEffects: moduleEffects.size,
      warnings,
    };
  }

  /**
   * Quick check: does a function with given traits and calls stay within a declared effect set?
   */
  quickCheck(
    traits: string[],
    calls: string[],
    allowed: VREffect[]
  ): { passed: boolean; undeclared: VREffect[] } {
    const inferred = composeEffects(inferFromTraits(traits), inferFromBuiltins(calls));
    const allowedRow = new EffectRow(allowed);
    const undeclaredRow = inferred.row.difference(allowedRow);
    return { passed: undeclaredRow.isPure(), undeclared: undeclaredRow.toArray() };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL
  // ---------------------------------------------------------------------------

  private computeViolations(
    name: string,
    node: EffectASTNode,
    undeclared: EffectRow,
    unused: EffectRow,
    sources: Map<VREffect, string[]>
  ): EffectViolation[] {
    const violations: EffectViolation[] = [];

    // Undeclared effects → errors (or configured severity)
    for (const effect of undeclared.toArray()) {
      const sourceList = sources.get(effect) || ['unknown'];
      violations.push({
        effect,
        source: { file: node.file, line: node.line, column: node.column, functionName: name },
        message: `Undeclared effect '${effect}' in '${name}'. Caused by: ${sourceList.join(', ')}`,
        severity: this.config.undeclaredSeverity,
        suggestion: `Add '${effect}' to the effect declaration of '${name}', or remove the causing trait/call.`,
      });
    }

    // Unused declarations → warnings
    for (const effect of unused.toArray()) {
      violations.push({
        effect,
        source: { file: node.file, line: node.line, column: node.column, functionName: name },
        message: `Declared effect '${effect}' in '${name}' is never used.`,
        severity: this.config.unusedDeclaredSeverity,
        suggestion: `Remove '${effect}' from the effect declaration if it's not needed.`,
      });
    }

    // Max effects check
    if (this.config.maxEffectsPerFunction > 0) {
      const inferred = undeclared.size + unused.size; // rough proxy
      const total = undeclared.toArray().length + (node.declaredEffects?.length || 0);
      // Actually check the inferred row size
    }

    return violations;
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Create an effect checker with default config.
 */
export function createEffectChecker(config?: EffectCheckerConfig): EffectChecker {
  return new EffectChecker(config);
}

/**
 * Check if a set of traits is safe (no dangerous effects).
 * "Dangerous" = authority, inventory, agent, io:network.
 */
export function isSafeTraitSet(traits: string[]): { safe: boolean; dangerous: VREffect[] } {
  const DANGEROUS: VREffect[] = [
    'authority:own',
    'authority:delegate',
    'authority:revoke',
    'authority:zone',
    'authority:world',
    'inventory:take',
    'inventory:destroy',
    'inventory:duplicate',
    'agent:spawn',
    'agent:kill',
    'agent:control',
    'io:network',
    'io:write',
    'physics:teleport',
  ];
  const inferred = inferFromTraits(traits);
  const dangerous = inferred.row.toArray().filter((e) => DANGEROUS.includes(e));
  return { safe: dangerous.length === 0, dangerous };
}

/**
 * Get the "danger level" of an effect row (0-10 scale).
 */
export function dangerLevel(row: EffectRow): number {
  let score = 0;
  const weights: Partial<Record<EffectCategory, number>> = {
    authority: 3,
    inventory: 2,
    agent: 2,
    io: 1.5,
    physics: 1,
    render: 0.5,
    audio: 0.3,
    state: 0.5,
    resource: 1,
    exception: 0.2,
  };
  for (const cat of row.categories()) {
    score += (weights[cat] || 0) * row.ofCategory(cat).length;
  }
  return Math.min(10, Math.round(score * 10) / 10);
}
