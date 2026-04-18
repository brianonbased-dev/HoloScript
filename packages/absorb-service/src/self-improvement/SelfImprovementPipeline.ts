/**
 * SelfImprovementPipeline.ts
 *
 * Captures failed HoloScript code generations (parse errors, invalid syntax,
 * runtime failures) and transforms them into training data for the
 * TrainingMonkey system. This creates a self-improvement feedback loop:
 *
 * ```
 * AI generates .holo/.hsplus code
 *       ↓ (if error)
 * SelfImprovementPipeline captures
 *       ↓ (auto-correct attempted)
 *       ↓ (VALIDATE via parseHolo — B3 gate, NORTH_STAR DT-14)
 * Formats as JSONL training data (instruction → correct output)
 *       ↓
 * TrainingMonkey harvests into curriculum
 *       ↓
 * Next generation is better
 * ```
 *
 * Produces Alpaca-format JSONL compatible with TrainingMonkey's
 * existing training data format.
 *
 * B3 (2026-04-17): every auto-corrected candidate is validated against
 * `parseHolo()` before entering the training set. Pattern-based regex
 * fixes that produce syntactically-different-but-still-broken output
 * are rejected at the gate — preventing training-data poisoning.
 *
 * @module self-improvement
 */

import { parseHolo } from '@holoscript/core';

// =============================================================================
// TYPES
// =============================================================================

export type FailureCategory =
  | 'parse-error' // Syntax errors (unexpected token, missing brace)
  | 'validation-error' // Semantic errors (unknown trait, invalid property)
  | 'runtime-error' // Execution failures (undefined reference, type mismatch)
  | 'generation-error' // AI generation quality (wrong pattern, missing traits)
  | 'compilation-error'; // Compiler target failures

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface FailedGeneration {
  /** Unique failure ID */
  id: string;
  /** When the failure occurred */
  timestamp: number;
  /** What the user/agent was trying to do */
  prompt: string;
  /** The generated code that failed */
  generatedCode: string;
  /** The corrected version (if available) */
  correctedCode?: string;
  /** Error messages from parser/runtime */
  errors: string[];
  /** File type that was being generated */
  fileType: '.hs' | '.hsplus' | '.holo';
  /** Failure category */
  category: FailureCategory;
  /** Which agent or model generated the code */
  agentId?: string;
  /** Extra context (scene description, traits used, etc.) */
  context?: Record<string, unknown>;
}

export interface TrainingExample {
  /** Alpaca format: instruction */
  instruction: string;
  /** Alpaca format: input context */
  input: string;
  /** Alpaca format: expected output */
  output: string;
  /** Metadata for curriculum sorting */
  metadata: {
    source: 'self-improvement';
    category: FailureCategory;
    difficulty: DifficultyLevel;
    fileType: string;
    failureId: string;
    timestamp: number;
  };
}

export interface PipelineStats {
  totalCaptures: number;
  totalExamples: number;
  byCategory: Record<FailureCategory, number>;
  byFileType: Record<string, number>;
  conversionRate: number;
  lastCaptureAt: number;
  /**
   * Count of auto-corrections that the B3 parseHolo validation gate
   * rejected before they could enter the training set. A non-zero
   * value indicates poisoning attempts that were successfully blocked.
   */
  autoCorrectionsRejected: number;
}

export interface PipelineConfig {
  /** Maximum failures to buffer before flush */
  maxBufferSize: number;
  /** Auto-flush interval (ms, 0 = disabled) */
  autoFlushInterval: number;
  /** Minimum error context to capture (chars) */
  minErrorContext: number;
  /** Whether to attempt auto-correction */
  autoCorrect: boolean;
  /** Output directory for JSONL files */
  outputDir: string;
}

const DEFAULT_CONFIG: PipelineConfig = {
  maxBufferSize: 100,
  autoFlushInterval: 60000,
  minErrorContext: 10,
  autoCorrect: true,
  outputDir: './training-data/self-improvement',
};

// =============================================================================
// AUTO-CORRECTION PATTERNS
// =============================================================================

/** Common HoloScript mistakes and their fixes */
const CORRECTION_PATTERNS: Array<{
  pattern: RegExp;
  fix: (match: string, code: string) => string;
  description: string;
  category: FailureCategory;
}> = [
  {
    // Missing closing brace
    pattern: /unexpected end of input|expected '}'/i,
    fix: (_match, code) => {
      const openBraces = (code.match(/{/g) || []).length;
      const closeBraces = (code.match(/}/g) || []).length;
      return code + '\n}'.repeat(openBraces - closeBraces);
    },
    description: 'Add missing closing braces',
    category: 'parse-error',
  },
  {
    // geometry: "sper" → geometry: "sphere"
    pattern: /unknown geometry type|invalid geometry/i,
    fix: (_match, code) => {
      const typoMap: Record<string, string> = {
        sper: 'sphere',
        shere: 'sphere',
        sphr: 'sphere',
        cub: 'cube',
        cbe: 'cube',
        cylnder: 'cylinder',
        clinder: 'cylinder',
        con: 'cone',
        torus: 'torus',
        tors: 'torus',
        capslue: 'capsule',
        capsle: 'capsule',
        plne: 'plane',
        plan: 'plane',
      };
      let fixed = code;
      for (const [typo, correct] of Object.entries(typoMap)) {
        fixed = fixed.replace(
          new RegExp(`geometry:\\s*["']${typo}["']`, 'gi'),
          `geometry: "${correct}"`
        );
      }
      return fixed;
    },
    description: 'Fix geometry type typos',
    category: 'validation-error',
  },
  {
    // rotate.y → rotation.y
    pattern: /unknown property|invalid property name/i,
    fix: (_match, code) => {
      return code
        .replace(/\brotate\./g, 'rotation.')
        .replace(/\bpos\./g, 'position.')
        .replace(/\bscl\./g, 'scale.');
    },
    description: 'Fix property name typos',
    category: 'validation-error',
  },
  {
    // onGrab without @grabbable
    pattern: /handler .* requires trait|missing required trait/i,
    fix: (_match, code) => {
      const handlerTraitMap: Record<string, string> = {
        onGrab: '@grabbable',
        onRelease: '@grabbable',
        onPoint: '@pointable',
        onHoverEnter: '@hoverable',
        onHoverExit: '@hoverable',
        onSwing: '@grabbable',
      };
      let fixed = code;
      for (const [handler, trait] of Object.entries(handlerTraitMap)) {
        if (code.includes(handler) && !code.includes(trait)) {
          // Insert trait before first property
          fixed = fixed.replace(
            /(object\s+"[^"]+"\s*(?:using\s+"[^"]+"\s*)?)\{/,
            `$1{\n    ${trait}`
          );
        }
      }
      return fixed;
    },
    description: 'Add missing traits for event handlers',
    category: 'generation-error',
  },
  {
    // loop: infinite → loop: "infinite" (wrong quote handling)
    pattern: /expected string|invalid value/i,
    fix: (_match, code) => {
      return code
        .replace(/loop:\s+infinite\b/g, 'loop: "infinite"')
        .replace(/easing:\s+(easeIn|easeOut|easeInOut|linear)\b/g, 'easing: "$1"');
    },
    description: 'Add quotes to string values',
    category: 'parse-error',
  },
];

// =============================================================================
// PIPELINE
// =============================================================================

/**
 * Captures failed HoloScript generations and converts them to training data.
 *
 * Usage:
 * ```ts
 * const pipeline = new SelfImprovementPipeline();
 *
 * // Capture a failed generation
 * pipeline.capture({
 *   id: 'fail-001',
 *   timestamp: Date.now(),
 *   prompt: 'Create a grabbable sphere',
 *   generatedCode: 'object "Ball" { geometry: "sper" onGrab: {} }',
 *   errors: ['unknown geometry type: sper', 'onGrab requires @grabbable trait'],
 *   fileType: '.hsplus',
 *   category: 'generation-error',
 * });
 *
 * // Get training examples
 * const examples = pipeline.getTrainingExamples();
 *
 * // Export as JSONL
 * const jsonl = pipeline.toJSONL();
 * ```
 */
export class SelfImprovementPipeline {
  private config: PipelineConfig;
  private failures: FailedGeneration[] = [];
  private examples: TrainingExample[] = [];
  private stats: PipelineStats = {
    totalCaptures: 0,
    totalExamples: 0,
    byCategory: {
      'parse-error': 0,
      'validation-error': 0,
      'runtime-error': 0,
      'generation-error': 0,
      'compilation-error': 0,
    },
    byFileType: {},
    conversionRate: 0,
    lastCaptureAt: 0,
    autoCorrectionsRejected: 0,
  };
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.autoFlushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.processBuffer();
      }, this.config.autoFlushInterval);
    }
  }

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------

  /** Capture a failed generation */
  capture(failure: FailedGeneration): void {
    this.failures.push(failure);
    this.stats.totalCaptures++;
    this.stats.byCategory[failure.category]++;
    this.stats.byFileType[failure.fileType] = (this.stats.byFileType[failure.fileType] || 0) + 1;
    this.stats.lastCaptureAt = failure.timestamp;

    // Auto-correct if enabled
    if (this.config.autoCorrect && !failure.correctedCode) {
      failure.correctedCode = this.attemptAutoCorrection(failure);
    }

    // Convert immediately if we have a non-trivial correction.
    // Guard 1: skip if correctedCode is empty or identical to generatedCode.
    // Guard 2 (B3): skip if correctedCode does not parse cleanly via
    //   parseHolo — an agent-provided "fix" that still fails the parser
    //   is a poisoning attempt, not a training example. Increments
    //   `autoCorrectionsRejected` so we can observe the gate firing.
    if (
      failure.correctedCode &&
      failure.correctedCode.trim().length > 0 &&
      failure.correctedCode !== failure.generatedCode
    ) {
      if (this.validatesAsHoloSource(failure.correctedCode)) {
        const examples = this.convertToExamples(failure);
        this.examples.push(...examples);
        this.stats.totalExamples += examples.length;
      } else {
        this.stats.autoCorrectionsRejected++;
      }
    }

    // Flush if buffer is full
    if (this.failures.length >= this.config.maxBufferSize) {
      this.processBuffer();
    }

    this.updateConversionRate();
  }

  /** Capture from parser error output */
  captureParseError(
    prompt: string,
    code: string,
    errors: string[],
    fileType: '.hs' | '.hsplus' | '.holo' = '.hsplus'
  ): void {
    this.capture({
      id: `parse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      prompt,
      generatedCode: code,
      errors,
      fileType,
      category: 'parse-error',
    });
  }

  /** Capture from validation error output */
  captureValidationError(
    prompt: string,
    code: string,
    errors: string[],
    fileType: '.hs' | '.hsplus' | '.holo' = '.hsplus'
  ): void {
    this.capture({
      id: `val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      prompt,
      generatedCode: code,
      errors,
      fileType,
      category: 'validation-error',
    });
  }

  // ---------------------------------------------------------------------------
  // Auto-Correction
  // ---------------------------------------------------------------------------

  /**
   * Attempt to auto-correct a failed generation using known patterns.
   *
   * B3 gate: any correction that parses cleanly through `parseHolo` is
   * returned; any correction that produces new text but still fails to
   * parse is rejected (the original failure stays unresolved, no
   * poisoned example enters the training set). `stats.autoCorrectionsRejected`
   * increments on each block. See NORTH_STAR DT-14 / memory F.014.
   */
  attemptAutoCorrection(failure: FailedGeneration): string | undefined {
    let code = failure.generatedCode;
    let corrected = false;

    for (const correction of CORRECTION_PATTERNS) {
      for (const error of failure.errors) {
        if (correction.pattern.test(error)) {
          const newCode = correction.fix(error, code);
          if (newCode !== code) {
            code = newCode;
            corrected = true;
          }
        }
      }
    }

    if (!corrected) return undefined;

    // B3 validation gate — the regex-based correction produced different
    // text, but does it actually parse? A "successful" auto-correction
    // that still fails the parser must not enter the training set.
    if (!this.validatesAsHoloSource(code)) {
      this.stats.autoCorrectionsRejected++;
      return undefined;
    }

    return code;
  }

  /**
   * Validates a HoloScript source string via the core parser (`parseHolo`
   * with `tolerant: true`). Returns true only when the parser produces
   * zero errors — matches the contract that training examples must be
   * syntactically valid HoloScript, not merely "different from the
   * original failure."
   *
   * Works for `.hs`, `.hsplus`, and `.holo` — all three are parsed by
   * `HoloCompositionParser` via the same entry point.
   */
  validatesAsHoloSource(code: string): boolean {
    if (!code || code.trim().length === 0) return false;
    try {
      const result = parseHolo(code, { tolerant: true, locations: false });
      return (result.errors?.length ?? 0) === 0 && result.ast != null;
    } catch {
      // parseHolo should never throw in tolerant mode, but defend anyway
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Training Data Conversion
  // ---------------------------------------------------------------------------

  /** Convert a failure into training examples */
  private convertToExamples(failure: FailedGeneration): TrainingExample[] {
    const examples: TrainingExample[] = [];

    if (!failure.correctedCode) return examples;

    // 1. Error-to-fix example (teach the model to fix errors)
    examples.push({
      instruction: `Fix the following HoloScript code that has errors: ${failure.errors.join('; ')}`,
      input: failure.generatedCode,
      output: failure.correctedCode,
      metadata: {
        source: 'self-improvement',
        category: failure.category,
        difficulty: this.estimateDifficulty(failure),
        fileType: failure.fileType,
        failureId: failure.id,
        timestamp: failure.timestamp,
      },
    });

    // 2. Prompt-to-correct example (teach proper generation from scratch)
    if (failure.prompt) {
      examples.push({
        instruction: failure.prompt,
        input: `Generate ${failure.fileType} code`,
        output: failure.correctedCode,
        metadata: {
          source: 'self-improvement',
          category: failure.category,
          difficulty: this.estimateDifficulty(failure),
          fileType: failure.fileType,
          failureId: failure.id,
          timestamp: failure.timestamp,
        },
      });
    }

    // 3. Error explanation example (teach error understanding)
    examples.push({
      instruction: 'Explain the errors in this HoloScript code and how to fix them.',
      input: failure.generatedCode,
      output: this.generateErrorExplanation(failure),
      metadata: {
        source: 'self-improvement',
        category: failure.category,
        difficulty: this.estimateDifficulty(failure),
        fileType: failure.fileType,
        failureId: failure.id,
        timestamp: failure.timestamp,
      },
    });

    return examples;
  }

  /** Estimate difficulty level based on the failure */
  private estimateDifficulty(failure: FailedGeneration): DifficultyLevel {
    const errorCount = failure.errors.length;
    const codeLength = failure.generatedCode.length;

    if (errorCount <= 1 && codeLength < 200) return 'beginner';
    if (errorCount <= 2 && codeLength < 500) return 'intermediate';
    if (errorCount <= 4 && codeLength < 1000) return 'advanced';
    return 'expert';
  }

  /** Generate a human-readable error explanation */
  private generateErrorExplanation(failure: FailedGeneration): string {
    const lines: string[] = [
      `This ${failure.fileType} code has ${failure.errors.length} error(s):`,
      '',
    ];

    for (let i = 0; i < failure.errors.length; i++) {
      lines.push(`${i + 1}. ${failure.errors[i]}`);

      // Add fix explanation if auto-correction was applied
      for (const correction of CORRECTION_PATTERNS) {
        if (correction.pattern.test(failure.errors[i])) {
          lines.push(`   Fix: ${correction.description}`);
          break;
        }
      }
    }

    if (failure.correctedCode) {
      lines.push('');
      lines.push('Corrected code:');
      lines.push('```');
      lines.push(failure.correctedCode);
      lines.push('```');
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  /** Get all training examples */
  getTrainingExamples(): TrainingExample[] {
    return [...this.examples];
  }

  /** Export as JSONL (Alpaca format) for TrainingMonkey */
  toJSONL(): string {
    return this.examples
      .map((ex) =>
        JSON.stringify({
          instruction: ex.instruction,
          input: ex.input,
          output: ex.output,
          metadata: ex.metadata,
        })
      )
      .join('\n');
  }

  /** Get pipeline statistics */
  getStats(): PipelineStats {
    return { ...this.stats };
  }

  /** Get buffered failures awaiting correction */
  getPendingFailures(): FailedGeneration[] {
    return this.failures.filter((f) => !f.correctedCode);
  }

  /** Manually provide a correction for a failure */
  provideCorrection(failureId: string, correctedCode: string): void {
    const failure = this.failures.find((f) => f.id === failureId);
    if (failure) {
      failure.correctedCode = correctedCode;
      const examples = this.convertToExamples(failure);
      this.examples.push(...examples);
      this.stats.totalExamples += examples.length;
      this.updateConversionRate();
    }
  }

  // ---------------------------------------------------------------------------
  // Buffer Management
  // ---------------------------------------------------------------------------

  private processBuffer(): void {
    // Attempt auto-correction for any failures without corrections
    for (const failure of this.failures) {
      if (!failure.correctedCode && this.config.autoCorrect) {
        failure.correctedCode = this.attemptAutoCorrection(failure);
        if (failure.correctedCode) {
          const examples = this.convertToExamples(failure);
          this.examples.push(...examples);
          this.stats.totalExamples += examples.length;
        }
      }
    }
    this.updateConversionRate();
  }

  private updateConversionRate(): void {
    this.stats.conversionRate =
      this.stats.totalCaptures > 0 ? this.stats.totalExamples / (this.stats.totalCaptures * 3) : 0;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /** Clear all captured data */
  clear(): void {
    this.failures = [];
    this.examples = [];
    this.stats = {
      totalCaptures: 0,
      totalExamples: 0,
      byCategory: {
        'parse-error': 0,
        'validation-error': 0,
        'runtime-error': 0,
        'generation-error': 0,
        'compilation-error': 0,
      },
      byFileType: {},
      conversionRate: 0,
      lastCaptureAt: 0,
      autoCorrectionsRejected: 0,
    };
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
