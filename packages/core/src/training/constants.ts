/**
 * Training Constants
 *
 * Canonical constants shared between @holoscript/core and TrainingMonkey.
 * This module has ZERO imports from other workspace packages (G.GAP.01 prevention).
 *
 * @version 1.0.0
 */

/**
 * 9 training categories covering all HoloScript domains
 */
export const TRAINING_CATEGORIES = [
  'vr-interaction',
  'multiplayer',
  'physics',
  'ui-spatial',
  'ai-agents',
  'procedural',
  'audio-spatial',
  'visual-effects',
  'game-mechanics',
] as const;

export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

/**
 * 4 difficulty levels for training data
 */
export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced', 'production'] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/**
 * Quality score thresholds for training data evaluation
 */
export const QUALITY_THRESHOLDS = {
  Excellent: { min: 90, max: 100 },
  VeryGood: { min: 80, max: 89 },
  Acceptable: { min: 70, max: 79 },
} as const;

export type QualityTier = keyof typeof QUALITY_THRESHOLDS;

/**
 * Default quality constraints for training data generators
 */
export const DEFAULT_GENERATOR_THRESHOLDS = {
  min_compression_ratio: 5,
  max_compression_ratio: 15,
  max_duplication_rate: 0.05,
  min_templates_per_difficulty: 10,
  min_quality_score: 0.7,
} as const;

/**
 * RuleForge domain categories used by the rule generator
 */
export const RULEFORGE_DOMAINS = [
  'ai_agents',
  'physics',
  'robotics',
  'audio',
  'rendering',
  'interaction',
  'multiplayer',
  'vr_ar',
] as const;

export type RuleForgeDomain = (typeof RULEFORGE_DOMAINS)[number];

/**
 * Get quality tier for a given score
 */
export function getQualityTier(score: number): QualityTier | 'BelowAcceptable' {
  if (score >= QUALITY_THRESHOLDS.Excellent.min) return 'Excellent';
  if (score >= QUALITY_THRESHOLDS.VeryGood.min) return 'VeryGood';
  if (score >= QUALITY_THRESHOLDS.Acceptable.min) return 'Acceptable';
  return 'BelowAcceptable';
}

/**
 * Validate that a category string is a valid TrainingCategory
 */
export function isValidCategory(category: string): category is TrainingCategory {
  return (TRAINING_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Validate that a difficulty string is a valid DifficultyLevel
 */
export function isValidDifficulty(difficulty: string): difficulty is DifficultyLevel {
  return (DIFFICULTY_LEVELS as readonly string[]).includes(difficulty);
}
