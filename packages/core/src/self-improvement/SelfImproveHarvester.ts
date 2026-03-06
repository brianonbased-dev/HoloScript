/**
 * SelfImproveHarvester.ts
 *
 * Hooks into the SelfImproveCommand pipeline to capture
 * (instruction, output, test_result, quality_score) tuples as JSONL
 * training data compatible with TrainingMonkey.
 *
 * The harvester decorates the SelfImproveIO interface to intercept
 * each iteration's data flow:
 *
 *   1. GraphRAG query      -> instruction
 *   2. Generated test code  -> output
 *   3. Vitest result        -> test_result
 *   4. QualityScore         -> quality_score
 *
 * Captured tuples pass through a 5-stage quality filter:
 *
 *   Stage 1: HoloScript syntax validation
 *   Stage 2: Execution filter (pass rate >= 0.8)
 *   Stage 3: Complexity filter (instruction > 20 chars)
 *   Stage 4: ROUGE-L dedup (< 0.7 similarity to existing)
 *   Stage 5: Format validation (required fields present)
 *
 * Output: datasets/self-improve-harvest-{date}.jsonl
 *
 * @module self-improvement
 */

import type { QualityReport } from './QualityScore';
import type { ConvergenceStatus } from './ConvergenceDetector';
import type {
  SelfImproveIO,
  UntestedTarget,
  GeneratedTest,
  VitestResult,
} from './SelfImproveCommand';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single harvested training record from one iteration of the
 * self-improvement pipeline.
 */
export interface HarvestRecord {
  /** The GraphRAG query used as instruction */
  instruction: string;
  /** The generated test code as output */
  output: string;
  /** Vitest pass/fail result */
  test_result: {
    passed: boolean;
    testsPassed: number;
    testsFailed: number;
    testsTotal: number;
    duration: number;
    error?: string;
  };
  /** QualityScore composite (0-1) */
  quality_score: number;
  /** Rich metadata for curriculum sorting and analysis */
  metadata: {
    /** ISO 8601 timestamp of capture */
    timestamp: string;
    /** Iteration number within the pipeline run */
    iteration: number;
    /** Current convergence state snapshot */
    convergence_state: {
      converged: boolean;
      reason: string | null;
      plateauCount: number;
      windowSlope: number;
    } | null;
    /** The target symbol being tested */
    target_symbol: string;
    /** The target file path */
    target_file: string;
    /** Target language */
    target_language: string;
    /** GraphRAG relevance score for the target */
    relevance_score: number;
    /** Source identifier for TrainingMonkey */
    source: 'self-improve-harvester';
    /** Quality report breakdown if available */
    quality_report: {
      scorePercent: number;
      status: string;
    } | null;
  };
}

/**
 * TrainingMonkey-compatible JSONL line format.
 * Matches the TrainingExample interface from SelfImprovementPipeline.
 */
export interface HarvestTrainingExample {
  /** Alpaca format: instruction (the GraphRAG query) */
  instruction: string;
  /** Alpaca format: input context (target symbol + file info) */
  input: string;
  /** Alpaca format: expected output (the generated test code) */
  output: string;
  /** Structured metadata for curriculum learning */
  metadata: {
    source: 'self-improve-harvester';
    timestamp: number;
    iteration: number;
    target_symbol: string;
    target_file: string;
    quality_score: number;
    test_passed: boolean;
    pass_rate: number;
    convergence_converged: boolean;
    filter_stages_passed: string[];
  };
}

/** Configuration for the harvester */
export interface HarvesterConfig {
  /** Enable/disable harvesting (default: false, opt-in via --harvest) */
  enabled: boolean;
  /** Output directory for JSONL files (default: datasets/) */
  outputDir: string;
  /** Minimum test pass rate to accept a record (default: 0.8) */
  minPassRate: number;
  /** Minimum instruction length in characters (default: 20) */
  minInstructionLength: number;
  /** Maximum ROUGE-L similarity for dedup (default: 0.7) */
  maxRougeLSimilarity: number;
  /** Whether to validate HoloScript syntax in output (default: true) */
  validateSyntax: boolean;
  /** Flush buffer to disk every N records (default: 10) */
  flushInterval: number;
}

/** Statistics about harvesting progress */
export interface HarvesterStats {
  totalCaptured: number;
  totalAccepted: number;
  totalRejected: number;
  rejectedBySyntax: number;
  rejectedByExecution: number;
  rejectedByComplexity: number;
  rejectedByDedup: number;
  rejectedByFormat: number;
  outputFile: string;
}

/** Result of a single filter stage */
interface FilterResult {
  passed: boolean;
  stage: string;
  reason?: string;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_HARVESTER_CONFIG: HarvesterConfig = {
  enabled: false,
  outputDir: 'datasets',
  minPassRate: 0.8,
  minInstructionLength: 20,
  maxRougeLSimilarity: 0.7,
  validateSyntax: true,
  flushInterval: 10,
};

// =============================================================================
// ROUGE-L IMPLEMENTATION (Character N-gram)
// =============================================================================

/**
 * Compute ROUGE-L score (Longest Common Subsequence based) between two strings.
 * Uses the standard LCS-based F-measure formula.
 *
 * @returns Similarity score in [0, 1] where 1 = identical
 */
export function computeRougeL(reference: string, candidate: string): number {
  if (reference.length === 0 && candidate.length === 0) return 1.0;
  if (reference.length === 0 || candidate.length === 0) return 0.0;

  const lcsLen = lcsLength(reference, candidate);

  const precision = lcsLen / candidate.length;
  const recall = lcsLen / reference.length;

  if (precision + recall === 0) return 0.0;

  // F-measure with beta=1 (equal weight to precision and recall)
  const fMeasure = (2 * precision * recall) / (precision + recall);
  return fMeasure;
}

/**
 * Compute length of Longest Common Subsequence using
 * space-optimized dynamic programming (O(min(m,n)) space).
 */
function lcsLength(a: string, b: string): number {
  // Ensure a is the shorter string for space efficiency
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(m + 1).fill(0);
  let curr = new Array<number>(m + 1).fill(0);

  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      if (a[i - 1] === b[j - 1]) {
        curr[i] = prev[i - 1] + 1;
      } else {
        curr[i] = Math.max(curr[i - 1], prev[i]);
      }
    }
    // Swap rows
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[m];
}

// =============================================================================
// HARVESTER
// =============================================================================

/**
 * SelfImproveHarvester captures training data from the self-improvement
 * pipeline by decorating the SelfImproveIO interface.
 *
 * Usage:
 * ```ts
 * const harvester = new SelfImproveHarvester({ enabled: true });
 * const harvestingIO = harvester.wrapIO(originalIO);
 *
 * // Use harvestingIO with SelfImproveCommand
 * const cmd = new SelfImproveCommand(harvestingIO, config);
 * const result = await cmd.execute();
 *
 * // Flush remaining records
 * await harvester.flush();
 * console.log(harvester.getStats());
 * ```
 */
export class SelfImproveHarvester {
  private config: HarvesterConfig;
  private records: HarvestRecord[] = [];
  private accepted: HarvestTrainingExample[] = [];
  private buffer: HarvestTrainingExample[] = [];
  private stats: HarvesterStats;
  private outputFile: string;
  private acceptedInstructions: string[] = [];
  private iteration = 0;

  // Per-iteration state captured from IO interception
  private currentQuery = '';
  private currentTarget: UntestedTarget | null = null;
  private currentGenerated: GeneratedTest | null = null;
  private currentVitestResult: VitestResult | null = null;

  /** Optional file system writer (injected for testability) */
  private fileWriter: FileWriter;

  /** Optional HoloScript syntax validator */
  private syntaxValidator: SyntaxValidator | null = null;

  constructor(
    config: Partial<HarvesterConfig> = {},
    deps?: {
      fileWriter?: FileWriter;
      syntaxValidator?: SyntaxValidator;
    },
  ) {
    this.config = { ...DEFAULT_HARVESTER_CONFIG, ...config };

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    this.outputFile = `${this.config.outputDir}/self-improve-harvest-${date}.jsonl`;

    this.stats = {
      totalCaptured: 0,
      totalAccepted: 0,
      totalRejected: 0,
      rejectedBySyntax: 0,
      rejectedByExecution: 0,
      rejectedByComplexity: 0,
      rejectedByDedup: 0,
      rejectedByFormat: 0,
      outputFile: this.outputFile,
    };

    this.fileWriter = deps?.fileWriter ?? defaultFileWriter;
    this.syntaxValidator = deps?.syntaxValidator ?? null;
  }

  // ---------------------------------------------------------------------------
  // IO Decorator
  // ---------------------------------------------------------------------------

  /**
   * Wrap a SelfImproveIO instance to intercept iteration data.
   * Returns a new IO object that transparently captures data while
   * delegating all operations to the original.
   */
  wrapIO(original: SelfImproveIO): SelfImproveIO {
    if (!this.config.enabled) return original;

    const harvester = this;

    return {
      absorb: original.absorb.bind(original),

      queryUntested: async (query: string) => {
        // Capture the GraphRAG query as instruction
        harvester.currentQuery = query;
        harvester.iteration++;
        return original.queryUntested(query);
      },

      generateTest: async (target: UntestedTarget) => {
        // Capture the target and generated test
        harvester.currentTarget = target;
        const result = await original.generateTest(target);
        harvester.currentGenerated = result;
        return result;
      },

      writeFile: original.writeFile.bind(original),

      runVitest: async (testFilePath: string) => {
        const result = await original.runVitest(testFilePath);
        harvester.currentVitestResult = result;
        return result;
      },

      runFullVitest: original.runFullVitest.bind(original),
      runTypeCheck: original.runTypeCheck.bind(original),
      runLint: original.runLint.bind(original),
      getCircuitBreakerHealth: original.getCircuitBreakerHealth.bind(original),
      gitAdd: original.gitAdd.bind(original),
      gitCommit: original.gitCommit.bind(original),

      log: (level, message) => {
        original.log(level, message);
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Capture API (called after each iteration completes)
  // ---------------------------------------------------------------------------

  /**
   * Capture the current iteration's data as a harvest record.
   * Call this after each iteration of the SelfImproveCommand pipeline
   * completes, passing the quality report and convergence status.
   *
   * The record is automatically run through the 5-stage filter pipeline.
   */
  captureIteration(
    qualityReport: QualityReport | null,
    convergenceStatus: ConvergenceStatus | null,
  ): HarvestRecord | null {
    if (!this.config.enabled) return null;

    const target = this.currentTarget;
    const generated = this.currentGenerated;
    const vitestResult = this.currentVitestResult;

    // Cannot capture without core data
    if (!target || !generated || !vitestResult) {
      return null;
    }

    const record: HarvestRecord = {
      instruction: this.currentQuery,
      output: generated.content,
      test_result: {
        passed: vitestResult.passed,
        testsPassed: vitestResult.testsPassed,
        testsFailed: vitestResult.testsFailed,
        testsTotal: vitestResult.testsTotal,
        duration: vitestResult.duration,
        error: vitestResult.error,
      },
      quality_score: qualityReport?.score ?? 0,
      metadata: {
        timestamp: new Date().toISOString(),
        iteration: this.iteration,
        convergence_state: convergenceStatus
          ? {
              converged: convergenceStatus.converged,
              reason: convergenceStatus.reason,
              plateauCount: convergenceStatus.plateauCount,
              windowSlope: convergenceStatus.windowSlope,
            }
          : null,
        target_symbol: target.symbolName,
        target_file: target.filePath,
        target_language: target.language,
        relevance_score: target.relevanceScore,
        source: 'self-improve-harvester',
        quality_report: qualityReport
          ? {
              scorePercent: qualityReport.scorePercent,
              status: qualityReport.status,
            }
          : null,
      },
    };

    this.records.push(record);
    this.stats.totalCaptured++;

    // Run through 5-stage quality filter pipeline
    const filterResults = this.runFilterPipeline(record);
    const allPassed = filterResults.every((f) => f.passed);

    if (allPassed) {
      const example = this.toTrainingExample(record, filterResults);
      this.accepted.push(example);
      this.buffer.push(example);
      this.acceptedInstructions.push(record.instruction);
      this.stats.totalAccepted++;

      // Auto-flush if buffer threshold reached
      if (this.buffer.length >= this.config.flushInterval) {
        this.flushSync();
      }
    } else {
      this.stats.totalRejected++;
    }

    // Reset per-iteration state
    this.currentTarget = null;
    this.currentGenerated = null;
    this.currentVitestResult = null;

    return record;
  }

  // ---------------------------------------------------------------------------
  // 5-Stage Quality Filter Pipeline
  // ---------------------------------------------------------------------------

  /**
   * Run all 5 filter stages against a harvest record.
   * Returns an array of FilterResult, one per stage.
   */
  runFilterPipeline(record: HarvestRecord): FilterResult[] {
    return [
      this.filterSyntax(record),
      this.filterExecution(record),
      this.filterComplexity(record),
      this.filterDedup(record),
      this.filterFormat(record),
    ];
  }

  /**
   * Stage 1: HoloScript syntax validation.
   *
   * If the output contains HoloScript code blocks, validate them
   * using the HoloScriptPlusParser. If no parser is available,
   * falls back to basic structural checks.
   */
  private filterSyntax(record: HarvestRecord): FilterResult {
    if (!this.config.validateSyntax) {
      return { passed: true, stage: 'syntax', reason: 'Syntax validation disabled' };
    }

    // The output is generated TypeScript test code, not HoloScript.
    // For test code we do basic structural validation.
    const output = record.output;

    // Check for obvious structural issues in TypeScript test code
    const hasDescribe = /describe\s*\(/.test(output);
    const hasIt = /it\s*\(/.test(output) || /test\s*\(/.test(output);
    const hasExpect = /expect\s*\(/.test(output);

    if (!hasDescribe && !hasIt) {
      this.stats.rejectedBySyntax++;
      return {
        passed: false,
        stage: 'syntax',
        reason: 'Output lacks test structure (no describe/it/test blocks)',
      };
    }

    // Check balanced braces
    const openBraces = (output.match(/{/g) || []).length;
    const closeBraces = (output.match(/}/g) || []).length;
    if (Math.abs(openBraces - closeBraces) > 1) {
      this.stats.rejectedBySyntax++;
      return {
        passed: false,
        stage: 'syntax',
        reason: `Unbalanced braces: ${openBraces} open vs ${closeBraces} close`,
      };
    }

    // If a HoloScript syntax validator is available, check any embedded
    // HoloScript code blocks in the test
    if (this.syntaxValidator) {
      const holoBlocks = extractHoloScriptBlocks(output);
      for (const block of holoBlocks) {
        const result = this.syntaxValidator.validate(block);
        if (!result.valid) {
          this.stats.rejectedBySyntax++;
          return {
            passed: false,
            stage: 'syntax',
            reason: `HoloScript syntax error: ${result.errors.join('; ')}`,
          };
        }
      }
    }

    return {
      passed: true,
      stage: 'syntax',
      reason: hasExpect ? 'Valid test structure with assertions' : 'Valid test structure',
    };
  }

  /**
   * Stage 2: Execution filter.
   *
   * Requires the test pass rate to be >= minPassRate (default 0.8).
   * This ensures we only capture high-quality test generations.
   */
  private filterExecution(record: HarvestRecord): FilterResult {
    const { testsTotal, testsPassed } = record.test_result;
    const passRate = testsTotal > 0 ? testsPassed / testsTotal : 0;

    if (passRate < this.config.minPassRate) {
      this.stats.rejectedByExecution++;
      return {
        passed: false,
        stage: 'execution',
        reason: `Pass rate ${(passRate * 100).toFixed(1)}% < ${(this.config.minPassRate * 100).toFixed(1)}% threshold`,
      };
    }

    return {
      passed: true,
      stage: 'execution',
      reason: `Pass rate ${(passRate * 100).toFixed(1)}% meets threshold`,
    };
  }

  /**
   * Stage 3: Complexity filter.
   *
   * Rejects records where the instruction is too short (< minInstructionLength chars),
   * which typically indicates trivial or degenerate queries.
   */
  private filterComplexity(record: HarvestRecord): FilterResult {
    if (record.instruction.length < this.config.minInstructionLength) {
      this.stats.rejectedByComplexity++;
      return {
        passed: false,
        stage: 'complexity',
        reason: `Instruction length ${record.instruction.length} < ${this.config.minInstructionLength} chars`,
      };
    }

    // Also reject very short outputs (less than 50 chars = likely stub/empty)
    if (record.output.length < 50) {
      this.stats.rejectedByComplexity++;
      return {
        passed: false,
        stage: 'complexity',
        reason: `Output length ${record.output.length} < 50 chars (likely stub)`,
      };
    }

    return {
      passed: true,
      stage: 'complexity',
      reason: `Instruction: ${record.instruction.length} chars, Output: ${record.output.length} chars`,
    };
  }

  /**
   * Stage 4: ROUGE-L deduplication.
   *
   * Compares the instruction against all previously accepted instructions.
   * If the ROUGE-L similarity exceeds maxRougeLSimilarity (default 0.7),
   * the record is considered a near-duplicate and rejected.
   */
  private filterDedup(record: HarvestRecord): FilterResult {
    for (const existing of this.acceptedInstructions) {
      const similarity = computeRougeL(existing, record.instruction);
      if (similarity > this.config.maxRougeLSimilarity) {
        this.stats.rejectedByDedup++;
        return {
          passed: false,
          stage: 'dedup',
          reason: `ROUGE-L ${similarity.toFixed(3)} > ${this.config.maxRougeLSimilarity} threshold (similar to existing)`,
        };
      }
    }

    return {
      passed: true,
      stage: 'dedup',
      reason: `No near-duplicates found (checked ${this.acceptedInstructions.length} existing)`,
    };
  }

  /**
   * Stage 5: Format validation.
   *
   * Ensures all required fields are present and non-empty for a valid
   * TrainingMonkey training example.
   */
  private filterFormat(record: HarvestRecord): FilterResult {
    const issues: string[] = [];

    if (!record.instruction || record.instruction.trim().length === 0) {
      issues.push('Missing instruction');
    }
    if (!record.output || record.output.trim().length === 0) {
      issues.push('Missing output');
    }
    if (!record.metadata.target_symbol) {
      issues.push('Missing target_symbol');
    }
    if (!record.metadata.target_file) {
      issues.push('Missing target_file');
    }
    if (typeof record.quality_score !== 'number' || isNaN(record.quality_score)) {
      issues.push('Invalid quality_score');
    }

    if (issues.length > 0) {
      this.stats.rejectedByFormat++;
      return {
        passed: false,
        stage: 'format',
        reason: `Format issues: ${issues.join(', ')}`,
      };
    }

    return {
      passed: true,
      stage: 'format',
      reason: 'All required fields present and valid',
    };
  }

  // ---------------------------------------------------------------------------
  // Training Example Conversion
  // ---------------------------------------------------------------------------

  /**
   * Convert a HarvestRecord into a TrainingMonkey-compatible TrainingExample.
   */
  private toTrainingExample(
    record: HarvestRecord,
    filterResults: FilterResult[],
  ): HarvestTrainingExample {
    const { testsTotal, testsPassed } = record.test_result;
    const passRate = testsTotal > 0 ? testsPassed / testsTotal : 0;

    return {
      instruction: record.instruction,
      input: [
        `Target: ${record.metadata.target_symbol}`,
        `File: ${record.metadata.target_file}`,
        `Language: ${record.metadata.target_language}`,
        `Description: Generate comprehensive unit tests for this symbol.`,
      ].join('\n'),
      output: record.output,
      metadata: {
        source: 'self-improve-harvester',
        timestamp: Date.now(),
        iteration: record.metadata.iteration,
        target_symbol: record.metadata.target_symbol,
        target_file: record.metadata.target_file,
        quality_score: record.quality_score,
        test_passed: record.test_result.passed,
        pass_rate: Math.round(passRate * 10000) / 10000,
        convergence_converged: record.metadata.convergence_state?.converged ?? false,
        filter_stages_passed: filterResults
          .filter((f) => f.passed)
          .map((f) => f.stage),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  /**
   * Flush buffered records to the JSONL output file (synchronous version
   * for use in the iteration loop).
   */
  private flushSync(): void {
    if (this.buffer.length === 0) return;

    const lines = this.buffer
      .map((ex) => JSON.stringify(ex))
      .join('\n') + '\n';

    this.fileWriter.appendSync(this.outputFile, lines);
    this.buffer = [];
  }

  /**
   * Flush any remaining buffered records to the JSONL output file.
   * Call this after the pipeline completes.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const lines = this.buffer
      .map((ex) => JSON.stringify(ex))
      .join('\n') + '\n';

    await this.fileWriter.append(this.outputFile, lines);
    this.buffer = [];
  }

  /**
   * Get all accepted training examples.
   */
  getAcceptedExamples(): HarvestTrainingExample[] {
    return [...this.accepted];
  }

  /**
   * Get all raw harvest records (before filtering).
   */
  getRawRecords(): HarvestRecord[] {
    return [...this.records];
  }

  /**
   * Get harvester statistics.
   */
  getStats(): HarvesterStats {
    return { ...this.stats };
  }

  /**
   * Get the output file path.
   */
  getOutputFile(): string {
    return this.outputFile;
  }

  /**
   * Export all accepted examples as a JSONL string.
   */
  toJSONL(): string {
    return this.accepted
      .map((ex) => JSON.stringify(ex))
      .join('\n');
  }

  /**
   * Reset the harvester state.
   */
  reset(): void {
    this.records = [];
    this.accepted = [];
    this.buffer = [];
    this.acceptedInstructions = [];
    this.iteration = 0;
    this.currentQuery = '';
    this.currentTarget = null;
    this.currentGenerated = null;
    this.currentVitestResult = null;

    this.stats = {
      totalCaptured: 0,
      totalAccepted: 0,
      totalRejected: 0,
      rejectedBySyntax: 0,
      rejectedByExecution: 0,
      rejectedByComplexity: 0,
      rejectedByDedup: 0,
      rejectedByFormat: 0,
      outputFile: this.outputFile,
    };
  }
}

// =============================================================================
// FILE WRITER INTERFACE (for testability)
// =============================================================================

/**
 * Abstraction for file I/O so the harvester can be unit-tested with stubs.
 */
export interface FileWriter {
  /** Append content to a file (async) */
  append(filePath: string, content: string): Promise<void>;
  /** Append content to a file (sync) */
  appendSync(filePath: string, content: string): void;
  /** Ensure directory exists */
  ensureDir(dirPath: string): void;
}

/**
 * Abstraction for HoloScript syntax validation.
 */
export interface SyntaxValidator {
  validate(code: string): { valid: boolean; errors: string[] };
}

// =============================================================================
// DEFAULT FILE WRITER (Node.js)
// =============================================================================

/**
 * Default file writer using Node.js fs module.
 * Lazily imports fs to avoid bundling issues in non-Node environments.
 */
const defaultFileWriter: FileWriter = {
  append: async (filePath: string, content: string) => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(filePath, content, 'utf-8');
  },

  appendSync: (filePath: string, content: string) => {
    // Dynamic require for sync operations
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(filePath, content, 'utf-8');
    } catch {
      // If require is not available (ESM-only environment), buffer for async flush
      console.warn('[SelfImproveHarvester] Sync write unavailable, buffering for async flush');
    }
  },

  ensureDir: (dirPath: string) => {
    try {
      const fs = require('fs');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    } catch {
      // Best effort
    }
  },
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract HoloScript code blocks from test source code.
 * Looks for string literals containing HoloScript patterns.
 */
function extractHoloScriptBlocks(source: string): string[] {
  const blocks: string[] = [];

  // Match template literals or strings containing HoloScript-like patterns
  // e.g., `object "name" { ... }` or `scene "name" { ... }`
  const holoPatterns = /`((?:object|scene|trait|material|animation)\s+[\s\S]*?)`/g;
  let match: RegExpExecArray | null;

  while ((match = holoPatterns.exec(source)) !== null) {
    if (match[1] && match[1].length > 10) {
      blocks.push(match[1]);
    }
  }

  return blocks;
}

/**
 * Create a SyntaxValidator from a HoloScriptPlusParser instance.
 * This bridges the parser API to the harvester's validation interface.
 */
export function createSyntaxValidatorFromParser(
  parser: { parse(source: string): { success: boolean; errors: Array<{ message: string }> } },
): SyntaxValidator {
  return {
    validate(code: string) {
      try {
        const result = parser.parse(code);
        return {
          valid: result.success,
          errors: result.errors.map((e) => e.message),
        };
      } catch (err) {
        return {
          valid: false,
          errors: [String(err)],
        };
      }
    },
  };
}
