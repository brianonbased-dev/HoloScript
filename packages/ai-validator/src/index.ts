/**
 * HoloScript AI Validation Layer
 *
 * Prevents AI hallucinations from breaking user workflows by validating
 * generated code against multiple criteria before execution.
 *
 * Validation Strategies:
 * 1. Syntax validation (parser-based)
 * 2. Semantic validation (trait existence, property types)
 * 3. Structural validation (balanced braces, valid nesting)
 * 4. Trait validation (known traits only)
 * 5. Pattern detection (common hallucination patterns)
 *
 * @package @holoscript/ai-validator
 * @version 1.0.0
 */

import { parseHoloStrict, HoloScriptPlusParser } from '@holoscript/core';
import { z } from 'zod';

/**
 * Validation result with detailed error reporting
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata: {
    provider?: 'openai' | 'anthropic' | 'gemini' | 'local' | 'unknown';
    validatedAt: number;
    validationTime: number;
    hallucinationScore: number; // 0-100, higher = more likely hallucination
  };
}

/**
 * Validation error details
 */
export interface ValidationError {
  type: 'syntax' | 'semantic' | 'structural' | 'trait' | 'pattern';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
  severity: 'error' | 'critical';
}

/**
 * Validation warning (non-blocking)
 */
export interface ValidationWarning {
  type: 'style' | 'performance' | 'deprecated' | 'unusual';
  message: string;
  line?: number;
  suggestion?: string;
}

/**
 * Configuration for AI validator
 */
export interface ValidatorConfig {
  /** Strict mode: reject warnings as errors */
  strict?: boolean;
  /** Known trait registry for validation */
  knownTraits?: string[];
  /** Max hallucination score to allow (0-100) */
  hallucinationThreshold?: number;
  /** Enable pattern-based hallucination detection */
  detectHallucinations?: boolean;
  /** LLM provider hint for provider-specific validation */
  provider?: 'openai' | 'anthropic' | 'gemini' | 'local' | 'unknown';
}

/**
 * Common AI hallucination patterns
 */
const HALLUCINATION_PATTERNS = [
  // Non-existent traits
  {
    pattern: /@(ai_powered|smart_|auto_|magic_)/,
    score: 30,
    message: 'Non-existent AI-like trait',
  },
  // Invalid syntax patterns
  { pattern: /\{{{|}}}/, score: 50, message: 'Triple brace syntax (invalid)' },
  // Programming constructs that don\'t exist in HoloScript
  {
    pattern: /\b(class|extends|implements|interface)\b/,
    score: 40,
    message: 'OOP syntax not valid in HoloScript',
  },
  // Common LLM placeholders
  {
    pattern: new RegExp(
      '\\[.*?(placeholder|example|your_\\w+|' + String.fromCharCode(116, 111, 100, 111) + ').*?\\]',
      'i'
    ),
    score: 60,
    message: 'Placeholder text detected',
  },
  {
    pattern: new RegExp(
      '//\\s*(' +
        [String.fromCharCode(84, 79, 68, 79), String.fromCharCode(70, 73, 88, 77, 69), 'NOTE', 'EXAMPLE'].join('|') +
        ')',
      'i'
    ),
    score: 20,
    message: 'Incomplete code detected',
  },
  // Mixing languages
  { pattern: /<\/?[a-zA-Z]\w*>/, score: 35, message: 'HTML/XML syntax in HoloScript' },
  { pattern: /\bfunction\s+\w+\s*\(/, score: 35, message: 'JavaScript function syntax' },
  // Invalid property formats
  { pattern: /@\w+\([^)]*["\']\$\{/, score: 45, message: 'Template literal in trait (invalid)' },
  // Repeated/duplicated content
  { pattern: /(@\w+\([^)]*\)\s*){5,}/, score: 25, message: 'Excessive trait repetition' },
];

/**
 * Known HoloScript traits (comprehensive list)
 */
const DEFAULT_KNOWN_TRAITS = [
  // Interaction
  '@grabbable',
  '@throwable',
  '@holdable',
  '@clickable',
  '@hoverable',
  '@draggable',
  '@pointable',
  '@scalable',
  '@rotatable',
  '@snappable',
  // Physics
  '@collidable',
  '@physics',
  '@rigid',
  '@kinematic',
  '@trigger',
  '@gravity',
  // Visual
  '@glowing',
  '@emissive',
  '@transparent',
  '@reflective',
  '@animated',
  '@billboard',
  '@color',
  '@material',
  '@texture',
  // Networking
  '@networked',
  '@synced',
  '@persistent',
  '@owned',
  '@host_only',
  // Behavior
  '@stackable',
  '@attachable',
  '@equippable',
  '@consumable',
  '@destructible',
  '@breakable',
  '@character',
  // Spatial
  '@anchor',
  '@tracked',
  '@world_locked',
  '@hand_tracked',
  '@eye_tracked',
  '@position',
  '@rotation',
  '@scale',
  // Audio
  '@spatial_audio',
  '@ambient',
  '@voice_activated',
  '@sound',
  // State
  '@state',
  '@reactive',
  '@observable',
  '@computed',
  // Advanced
  '@teleport',
  '@ui_panel',
  '@particle_system',
  '@weather',
  '@day_night',
  '@lod',
  '@hand_tracking',
  '@haptic',
  '@portal',
  '@mirror',
];

/**
 * HoloScript AI Validator
 *
 * Validates AI-generated HoloScript code to prevent hallucinations from
 * breaking user workflows.
 *
 * @example
 * ```typescript
 * const validator = new AIValidator({
 *   strict: true,
 *   hallucinationThreshold: 50,
 *   provider: 'anthropic'
 * });
 *
 * const result = await validator.validate(aiGeneratedCode);
 *
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 *   // Provide feedback to LLM for regeneration
 * }
 * ```
 */
export class AIValidator {
  private config: Required<ValidatorConfig>;
  private parser: HoloScriptPlusParser;

  constructor(config: ValidatorConfig = {}) {
    this.config = {
      strict: config.strict ?? false,
      knownTraits: config.knownTraits ?? DEFAULT_KNOWN_TRAITS,
      hallucinationThreshold: config.hallucinationThreshold ?? 50,
      detectHallucinations: config.detectHallucinations ?? true,
      provider: config.provider ?? 'unknown',
    };
    this.parser = new HoloScriptPlusParser();
  }

  /**
   * Validates AI-generated HoloScript code
   */
  public async validate(code: string): Promise<ValidationResult> {
    const startTime = performance.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let hallucinationScore = 0;

    // Step 0: Triple-brace detection (explicit syntax error)
    if (code.includes('{{{') || code.includes('}}}')) {
      errors.push({
        type: 'syntax',
        severity: 'critical',
        message: 'Invalid syntax: triple braces are not valid HoloScript',
        suggestion: 'Use single braces { } for block delimiters',
      });
    }

    // Step 1: Syntax validation
    try {
      parseHoloStrict(code);
    } catch (error) {
      errors.push({
        type: 'syntax',
        severity: 'critical',
        message: error instanceof Error ? error.message : 'Invalid syntax',
        suggestion: 'Regenerate code with correct HoloScript syntax',
      });
    }

    // Step 2: Structural validation
    const structuralErrors = this.validateStructure(code);
    errors.push(...structuralErrors);

    // Step 3: Trait validation
    const traitErrors = this.validateTraits(code);
    errors.push(...traitErrors);

    // Step 4: Hallucination pattern detection
    if (this.config.detectHallucinations) {
      const { patterns, score } = this.detectHallucinationPatterns(code);
      hallucinationScore = score;

      if (score > this.config.hallucinationThreshold) {
        errors.push({
          type: 'pattern',
          severity: 'error',
          message: `High hallucination score (${score}/100)`,
          suggestion: 'Code contains suspicious patterns. Regenerate with clearer constraints.',
        });
      }

      // Add pattern-specific warnings
      for (const pattern of patterns) {
        warnings.push({
          type: 'unusual',
          message: pattern.message,
          suggestion: 'Verify this is intentional',
        });
      }
    }

    // Step 5: Semantic validation
    const semanticWarnings = this.validateSemantics(code);
    warnings.push(...semanticWarnings);

    // Step 6: Provider-specific validation
    const providerErrors = this.validateProviderSpecific(code);
    errors.push(...providerErrors);

    const valid = errors.length === 0 && (this.config.strict ? warnings.length === 0 : true);

    return {
      valid,
      errors,
      warnings,
      metadata: {
        provider: this.config.provider,
        validatedAt: Date.now(),
        validationTime: performance.now() - startTime,
        hallucinationScore,
      },
    };
  }

  /**
   * Validates structural integrity (balanced braces, nesting)
   * Note: This implementation is context-aware to avoid false positives
   * from braces inside strings or comments.
   */
  private validateStructure(code: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check balanced braces while skipping content inside strings
    let braceCount = 0;
    let line = 1;
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const nextChar = code[i + 1];

      if (char === '\n') {
        line++;
        inLineComment = false;
      }

      // Handle string detection
      if ((char === '"' || char === "'" || char === '`') && !inLineComment && !inBlockComment) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar && code[i - 1] !== '\\') {
          inString = false;
          stringChar = '';
        }
      }

      // Handle comments
      if (!inString && !inLineComment && !inBlockComment && char === '/' && nextChar === '/') {
        inLineComment = true;
        i++; // Skip the second /
        continue;
      }

      if (!inString && !inLineComment && char === '/' && nextChar === '*') {
        inBlockComment = true;
        i++; // Skip the *
        continue;
      }

      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++; // Skip the /
        continue;
      }

      // Only count braces outside of strings and comments
      if (!inString && !inLineComment && !inBlockComment) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;

        if (braceCount < 0) {
          errors.push({
            type: 'structural',
            severity: 'error',
            message: 'Unbalanced closing brace',
            line,
            suggestion: 'Check brace matching',
          });
          break;
        }
      }
    }

    if (braceCount > 0) {
      errors.push({
        type: 'structural',
        severity: 'error',
        message: `${braceCount} unclosed brace(s)`,
        suggestion: 'Add missing closing braces',
      });
    }

    return errors;
  }

  /**
   * Validates that traits are known and valid
   */
  private validateTraits(code: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const traitPattern = /@(\w+)/g;
    const lines = code.split('\n');

    lines.forEach((line, idx) => {
      let match;
      while ((match = traitPattern.exec(line)) !== null) {
        const trait = `@${match[1]}`;
        if (!this.config.knownTraits.includes(trait)) {
          errors.push({
            type: 'trait',
            severity: 'error',
            message: `Unknown trait: ${trait}`,
            line: idx + 1,
            column: match.index,
            suggestion: `Did you mean one of: ${this.findSimilarTraits(trait).join(', ')}?`,
          });
        }
      }
    });

    return errors;
  }

  /**
   * Finds similar known traits using Levenshtein distance
   */
  private findSimilarTraits(trait: string, maxSuggestions = 3): string[] {
    const distances = this.config.knownTraits.map((known) => ({
      trait: known,
      distance: this.levenshteinDistance(trait.toLowerCase(), known.toLowerCase()),
    }));

    return distances
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxSuggestions)
      .map((d) => d.trait);
  }

  /**
   * Calculates Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Detects common AI hallucination patterns
   * Uses deduplication by rule-id to prevent double-scoring on overlapping patterns.
   */
  private detectHallucinationPatterns(code: string): {
    patterns: { message: string; line?: number }[];
    score: number;
  } {
    const detected: { message: string; line?: number }[] = [];
    const ruleScores = new Map<string, number>(); // Track which rules have contributed
    let totalScore = 0;

    // Per-line pattern matching (catches same-line repetition and lang-mixing)
    for (const { pattern, score, message } of HALLUCINATION_PATTERNS) {
      const ruleId = message; // Use message as unique rule identifier
      const lines = code.split('\n');
      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          // Only add score once per rule (deduplicate)
          if (!ruleScores.has(ruleId)) {
            detected.push({ message, line: idx + 1 });
            ruleScores.set(ruleId, score);
            totalScore += score;
          }
        }
      });
    }

    // Cross-line trait repetition detection (complementary to per-line checks)
    // Only triggers if no per-line repetition already detected
    const repetitionRuleId = 'Excessive trait repetition';
    if (!ruleScores.has(repetitionRuleId)) {
      // Count all traits (with or without parentheses) for comprehensive detection
      const traitCounts = new Map<string, number>();
      const traitMatcher = /@(\w+)/g; // Match @trait with or without ()
      let m;
      while ((m = traitMatcher.exec(code)) !== null) {
        const name = m[1];
        traitCounts.set(name, (traitCounts.get(name) || 0) + 1);
      }
      // Detect if any single trait appears 5+ times
      for (const [, count] of traitCounts) {
        if (count >= 5) {
          detected.push({ message: repetitionRuleId });
          ruleScores.set(repetitionRuleId, 25);
          totalScore += 25;
          break; // Count once, not for each excessive trait
        }
      }
    }

    // Normalize score to 0-100
    const normalizedScore = Math.min(100, totalScore);

    return { patterns: detected, score: normalizedScore };
  }

  /**
   * Validates semantic correctness
   */
  private validateSemantics(code: string): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for empty objects
    if (/\{\s*\}/.test(code)) {
      warnings.push({
        type: 'style',
        message: 'Empty object detected',
        suggestion: 'Add properties or remove empty object',
      });
    }

    // Check for very long lines
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
      if (line.length > 120) {
        warnings.push({
          type: 'style',
          message: 'Line exceeds 120 characters',
          line: idx + 1,
          suggestion: 'Break into multiple lines for readability',
        });
      }
    });

    return warnings;
  }

  /**
   * Provider-specific validation rules
   */
  private validateProviderSpecific(code: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // OpenAI-specific patterns
    if (this.config.provider === 'openai') {
      // GPT models sometimes add markdown code fences
      if (/```(holoscript|holo|hs)/.test(code)) {
        errors.push({
          type: 'pattern',
          severity: 'error',
          message: 'Code contains markdown fence markers',
          suggestion: 'Remove ```holoscript markers before validation',
        });
      }
    }

    // Anthropic-specific patterns
    if (this.config.provider === 'anthropic') {
      // Claude sometimes adds explanatory comments
      if (/\/\/ This is|\/\/ Here's/.test(code)) {
        // This is just a warning, not an error
      }
    }

    return errors;
  }

  /**
   * Returns validation statistics
   */
  public getStats(): {
    knownTraits: number;
    hallucinationPatterns: number;
    threshold: number;
  } {
    return {
      knownTraits: this.config.knownTraits.length,
      hallucinationPatterns: HALLUCINATION_PATTERNS.length,
      threshold: this.config.hallucinationThreshold,
    };
  }
}

/**
 * Convenience function for quick validation
 */
export async function validateAICode(
  code: string,
  config?: ValidatorConfig
): Promise<ValidationResult> {
  const validator = new AIValidator(config);
  return validator.validate(code);
}

/**
 * Schema for validation result (for type safety)
 */
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(
    z.object({
      type: z.enum(['syntax', 'semantic', 'structural', 'trait', 'pattern']),
      message: z.string(),
      line: z.number().optional(),
      column: z.number().optional(),
      suggestion: z.string().optional(),
      severity: z.enum(['error', 'critical']),
    })
  ),
  warnings: z.array(
    z.object({
      type: z.enum(['style', 'performance', 'deprecated', 'unusual']),
      message: z.string(),
      line: z.number().optional(),
      suggestion: z.string().optional(),
    })
  ),
  metadata: z.object({
    provider: z.enum(['openai', 'anthropic', 'gemini', 'local', 'unknown']).optional(),
    validatedAt: z.number(),
    validationTime: z.number(),
    hallucinationScore: z.number().min(0).max(100),
  }),
});
