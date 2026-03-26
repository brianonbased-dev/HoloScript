/**
 * Training Data Schema
 *
 * Canonical schema for training examples used across TM and HS.
 * Imports only from local constants.ts (G.GAP.01 prevention).
 *
 * @version 1.0.0
 */

import type { TrainingCategory, DifficultyLevel } from './constants';

/**
 * A single training example in instruction/input/output format (JSONL-compatible)
 */
export interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
  metadata: TrainingExampleMetadata;
}

/**
 * Metadata for a training example
 */
export interface TrainingExampleMetadata {
  category: TrainingCategory;
  difficulty: DifficultyLevel;
  traits: string[];
  keywords: string[];
  version: string;
  behavior_template?: string;
  quality_score?: number;
}

/**
 * Quality scoring rubric for training examples (TM-compatible format)
 */
export interface TrainingQualityScore {
  helpfulness: number;
  correctness: number;
  coherence: number;
  complexity: number;
  verbosity: number;
  overall: number;
}

/**
 * Validation result for a training example
 */
export interface TrainingValidationResult {
  valid: boolean;
  errors: TrainingValidationError[];
  warnings: string[];
}

export interface TrainingValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Compression metrics for a training dataset
 */
export interface CompressionResult {
  passed: boolean;
  ratio: number;
  total_examples: number;
  unique_patterns: number;
  quality_score?: number;
  issue?: string;
  recommendation?: string;
}

/**
 * Generator metrics for auditing training data quality
 */
export interface GeneratorMetrics {
  file_size_bytes: number;
  total_examples: number;
  unique_patterns: number;
  compression_ratio: number;
  duplication_rate: number;
  avg_quality_score: number;
  generation_time_ms: number;
}

/**
 * Validate a training example against the schema
 */
export function validateTrainingExample(example: unknown): TrainingValidationResult {
  const errors: TrainingValidationError[] = [];
  const warnings: string[] = [];

  if (!example || typeof example !== 'object') {
    return { valid: false, errors: [{ field: 'root', message: 'Example must be an object', severity: 'error' }], warnings };
  }

  const ex = example as Record<string, unknown>;

  if (typeof ex.instruction !== 'string' || ex.instruction.length === 0) {
    errors.push({ field: 'instruction', message: 'instruction must be a non-empty string', severity: 'error' });
  }
  if (typeof ex.input !== 'string') {
    errors.push({ field: 'input', message: 'input must be a string', severity: 'error' });
  }
  if (typeof ex.output !== 'string' || ex.output.length === 0) {
    errors.push({ field: 'output', message: 'output must be a non-empty string', severity: 'error' });
  }

  if (ex.metadata && typeof ex.metadata === 'object') {
    const meta = ex.metadata as Record<string, unknown>;
    if (typeof meta.category !== 'string') {
      errors.push({ field: 'metadata.category', message: 'category must be a string', severity: 'error' });
    }
    if (typeof meta.difficulty !== 'string') {
      errors.push({ field: 'metadata.difficulty', message: 'difficulty must be a string', severity: 'error' });
    }
    if (!Array.isArray(meta.traits)) {
      warnings.push('metadata.traits should be an array');
    }
  } else {
    errors.push({ field: 'metadata', message: 'metadata must be an object', severity: 'error' });
  }

  return { valid: errors.length === 0, errors, warnings };
}
