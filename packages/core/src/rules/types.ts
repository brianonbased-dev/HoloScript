/**
 * RuleForge Types
 *
 * Type definitions for the trait composition rule engine.
 * Gap 3: RuleForge creation.
 *
 * @version 1.0.0
 */

/**
 * Rule types that govern trait composition behavior
 */
export type RuleType = 'composition' | 'conflict' | 'expansion' | 'deprecation';

/**
 * A single rule definition
 */
export interface Rule {
  /** Unique rule identifier */
  id: string;
  /** Rule type */
  type: RuleType;
  /** Traits involved in this rule */
  traits: string[];
  /** Human-readable description */
  description: string;
  /** Whether the rule is commutative (A+B = B+A) -- G.GAP.02 prevention */
  commutative: boolean;
  /** Rule version for grandfathering (G.GAP.06 prevention) */
  ruleVersion: string;
  /** Severity of violation */
  severity: 'error' | 'warning' | 'info';
  /** Suggested replacement (for deprecation rules) */
  replacement?: string;
  /** Additional traits implied (for expansion rules) */
  implies?: string[];
}

/**
 * Violation produced when a rule is broken
 */
export interface RuleViolation {
  ruleId: string;
  type: RuleType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  traits: string[];
  suggestion?: string;
}

/**
 * Trait suggestion from the rule engine
 */
export interface TraitSuggestion {
  trait: string;
  reason: string;
  confidence: number;
  source: 'expansion' | 'composition' | 'deprecation';
}

/**
 * Result of validating a trait composition
 */
export interface ValidationResult {
  valid: boolean;
  errors: RuleViolation[];
  warnings: RuleViolation[];
  suggestions: TraitSuggestion[];
}

/**
 * Rule set loaded from a JSON file
 */
export interface RuleSet {
  version: string;
  description: string;
  rules: Rule[];
}
