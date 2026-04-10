/**
 * RuleForge - Trait Composition Rule Engine
 *
 * Governs how traits compose, conflict, expand, and deprecate.
 * Multi-consumer design: compiler, Brittney AI, absorb pipeline, SEAL, A2A.
 *
 * Gap 3: RuleForge creation.
 *
 * @version 1.0.0
 */

import type {
  Rule,
  RuleType,
  RuleViolation,
  TraitSuggestion,
  ValidationResult,
  RuleSet,
} from './types';

/**
 * RuleForge - the universal trait composition correctness backbone.
 *
 * 5 consumers:
 * 1. Compiler: trait composition validation before lowering
 * 2. Brittney AI: suggestion validation (three-gate safety)
 * 3. Absorb pipeline: trait mapping validation
 * 4. SEAL: self-edit validation (training data quality)
 * 5. A2A: agent capability validation (Agent Card accuracy)
 */
export class RuleForge {
  private rules: Map<string, Rule> = new Map();
  private rulesByType: Map<RuleType, Rule[]> = new Map();
  private ruleVersion = '1.0.0';
  private warningOnlyMode = true;

  constructor() {
    this.rulesByType.set('composition', []);
    this.rulesByType.set('conflict', []);
    this.rulesByType.set('expansion', []);
    this.rulesByType.set('deprecation', []);
  }

  /**
   * Load rules from a RuleSet definition
   */
  loadRuleSet(ruleSet: RuleSet): void {
    this.ruleVersion = ruleSet.version;
    for (const rule of ruleSet.rules) {
      this.addRule(rule);
    }
  }

  /**
   * Add a single rule
   */
  addRule(rule: Rule): void {
    this.rules.set(rule.id, rule);
    const typeRules = this.rulesByType.get(rule.type) ?? [];
    typeRules.push(rule);
    this.rulesByType.set(rule.type, typeRules);
  }

  /**
   * Enable or disable warning-only mode.
   * In warning-only mode, errors are downgraded to warnings.
   */
  setWarningOnlyMode(enabled: boolean): void {
    this.warningOnlyMode = enabled;
  }

  /**
   * Get current rule version
   */
  getRuleVersion(): string {
    return this.ruleVersion;
  }

  /**
   * Get total number of loaded rules
   */
  getRuleCount(): number {
    return this.rules.size;
  }

  /**
   * Validate a trait composition.
   *
   * @param traitComposition - Array of trait names being composed
   * @param compositionRuleVersion - Optional rule version for grandfathering (G.GAP.06)
   * @returns ValidationResult with errors, warnings, and suggestions
   */
  validate(traitComposition: string[], compositionRuleVersion?: string): ValidationResult {
    const errors: RuleViolation[] = [];
    const warnings: RuleViolation[] = [];
    const suggestions: TraitSuggestion[] = [];

    const traitSet = new Set(traitComposition);

    // Check conflict rules
    this.checkConflicts(traitComposition, traitSet, errors, warnings, compositionRuleVersion);

    // Check expansion rules (implied traits)
    this.checkExpansions(traitComposition, traitSet, suggestions);

    // Check deprecation rules
    this.checkDeprecations(traitComposition, traitSet, errors, warnings, suggestions);

    // Check composition rules (valid combos)
    this.checkCompositions(traitComposition, traitSet, suggestions);

    // In warning-only mode, downgrade errors to warnings
    if (this.warningOnlyMode) {
      warnings.push(...errors.map((e) => ({ ...e, severity: 'warning' as const })));
      return {
        valid: true,
        errors: [],
        warnings,
        suggestions,
      };
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Suggest traits that compose well with the given partial composition
   */
  suggest(partialComposition: string[]): TraitSuggestion[] {
    const suggestions: TraitSuggestion[] = [];
    const traitSet = new Set(partialComposition);

    // Check expansion rules
    for (const rule of this.rulesByType.get('expansion') ?? []) {
      for (const trait of rule.traits) {
        if (traitSet.has(trait) && rule.implies) {
          for (const implied of rule.implies) {
            if (!traitSet.has(implied)) {
              suggestions.push({
                trait: implied,
                reason: `Implied by @${trait}: ${rule.description}`,
                confidence: 0.9,
                source: 'expansion',
              });
            }
          }
        }
      }
    }

    // Check composition rules for compatible traits
    for (const rule of this.rulesByType.get('composition') ?? []) {
      const matchedTraits = rule.traits.filter((t) => traitSet.has(t));
      if (matchedTraits.length > 0 && matchedTraits.length < rule.traits.length) {
        const missing = rule.traits.filter((t) => !traitSet.has(t));
        for (const m of missing) {
          suggestions.push({
            trait: m,
            reason: `Composes well with @${matchedTraits.join(', @')}: ${rule.description}`,
            confidence: 0.7,
            source: 'composition',
          });
        }
      }
    }

    return suggestions;
  }

  // ---- Private validation methods ----

  private checkConflicts(
    traits: string[],
    traitSet: Set<string>,
    errors: RuleViolation[],
    warnings: RuleViolation[],
    compositionRuleVersion?: string
  ): void {
    for (const rule of this.rulesByType.get('conflict') ?? []) {
      // Grandfathering: skip rules newer than composition version
      if (compositionRuleVersion && rule.ruleVersion > compositionRuleVersion) {
        continue;
      }

      const matchedTraits = rule.traits.filter((t) => traitSet.has(t));
      if (matchedTraits.length >= 2) {
        // If commutative, any 2+ matched = conflict
        // If not commutative, order matters (check sequential pairs)
        if (rule.commutative || this.hasConflictInOrder(traits, rule.traits)) {
          const violation: RuleViolation = {
            ruleId: rule.id,
            type: 'conflict',
            severity: rule.severity,
            message: `Trait conflict: @${matchedTraits.join(' + @')} -- ${rule.description}`,
            traits: matchedTraits,
            suggestion: rule.replacement,
          };

          if (rule.severity === 'error') {
            errors.push(violation);
          } else {
            warnings.push(violation);
          }
        }
      }
    }
  }

  private checkExpansions(
    _traits: string[],
    traitSet: Set<string>,
    suggestions: TraitSuggestion[]
  ): void {
    for (const rule of this.rulesByType.get('expansion') ?? []) {
      for (const trait of rule.traits) {
        if (traitSet.has(trait) && rule.implies) {
          for (const implied of rule.implies) {
            if (!traitSet.has(implied)) {
              suggestions.push({
                trait: implied,
                reason: `@${trait} implies @${implied}: ${rule.description}`,
                confidence: 0.95,
                source: 'expansion',
              });
            }
          }
        }
      }
    }
  }

  private checkDeprecations(
    _traits: string[],
    traitSet: Set<string>,
    errors: RuleViolation[],
    warnings: RuleViolation[],
    suggestions: TraitSuggestion[]
  ): void {
    for (const rule of this.rulesByType.get('deprecation') ?? []) {
      for (const trait of rule.traits) {
        if (traitSet.has(trait)) {
          const violation: RuleViolation = {
            ruleId: rule.id,
            type: 'deprecation',
            severity: rule.severity,
            message: `@${trait} is deprecated: ${rule.description}`,
            traits: [trait],
            suggestion: rule.replacement,
          };

          if (rule.severity === 'error') {
            errors.push(violation);
          } else {
            warnings.push(violation);
          }

          if (rule.replacement) {
            suggestions.push({
              trait: rule.replacement,
              reason: `Replacement for deprecated @${trait}`,
              confidence: 1.0,
              source: 'deprecation',
            });
          }
        }
      }
    }
  }

  private checkCompositions(
    _traits: string[],
    traitSet: Set<string>,
    suggestions: TraitSuggestion[]
  ): void {
    for (const rule of this.rulesByType.get('composition') ?? []) {
      const matched = rule.traits.filter((t) => traitSet.has(t));
      if (matched.length > 0 && matched.length < rule.traits.length) {
        const missing = rule.traits.filter((t) => !traitSet.has(t));
        for (const m of missing) {
          if (!suggestions.some((s) => s.trait === m)) {
            suggestions.push({
              trait: m,
              reason: `Pairs well with @${matched.join(', @')}: ${rule.description}`,
              confidence: 0.6,
              source: 'composition',
            });
          }
        }
      }
    }
  }

  private hasConflictInOrder(traitOrder: string[], conflictTraits: string[]): boolean {
    let firstIdx = -1;
    let secondIdx = -1;

    for (let i = 0; i < traitOrder.length; i++) {
      if (traitOrder[i] === conflictTraits[0] && firstIdx === -1) firstIdx = i;
      if (traitOrder[i] === conflictTraits[1] && secondIdx === -1) secondIdx = i;
    }

    return firstIdx >= 0 && secondIdx >= 0;
  }
}

/**
 * Default RuleForge instance
 */
export const defaultRuleForge = new RuleForge();

/**
 * Create a new RuleForge instance
 */
export function createRuleForge(): RuleForge {
  return new RuleForge();
}
