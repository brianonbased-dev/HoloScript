/**
 * RuleForge Module
 *
 * Trait composition rule engine for validation, expansion, and deprecation.
 * Multi-consumer: compiler, Brittney, absorb, SEAL, A2A.
 *
 * @version 1.0.0
 */

export { RuleForge, defaultRuleForge, createRuleForge } from './RuleForge';

export type {
  Rule,
  RuleType,
  RuleViolation,
  TraitSuggestion,
  ValidationResult,
  RuleSet,
} from './types';

// Load default rules into the default instance
import { defaultRuleForge } from './RuleForge';
import defaultRulesData from './default-rules.json';

defaultRuleForge.loadRuleSet(defaultRulesData as any);
