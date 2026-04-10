/**
 * GRPOPromptExtractor.ts
 *
 * Scans the HoloScript monorepo to extract diverse, training-worthy prompts
 * for GRPO (Group Relative Policy Optimization) training. These prompts
 * become the input that GRPO generates completions for, which are then
 * scored by the 5 QualityScore reward functions.
 *
 * Prompt sources (4 extraction strategies):
 *
 *   1. TODO/FIXME/HACK comments:
 *      Parse all .ts files for annotated comments, extract surrounding
 *      function context, format as actionable instructions.
 *
 *   2. Empty/stub implementations:
 *      Find functions with empty bodies, single-line returns, or
 *      `throw new Error("not implemented")` patterns.
 *
 *   3. Failing/skipped tests:
 *      Find test files with `it.skip`, `xit`, `xdescribe`, or `test.todo`.
 *
 *   4. Low-coverage functions:
 *      Cross-reference exported functions against test files to find
 *      symbols that lack corresponding test coverage.
 *
 * Output: JSONL in TRL-compatible format with instruction, context,
 * difficulty estimate, and domain tags.
 *
 * Deduplication: ROUGE-L similarity < 0.7 threshold reuses the existing
 * `computeRougeL` from SelfImproveHarvester.
 *
 * @module self-improvement
 */

/**
 * Compute ROUGE-L similarity between two strings using Longest Common Subsequence.
 * Returns F1-score in [0, 1].
 */
export function computeRougeL(a: string, b: string): number {
  const tokA = a.toLowerCase().split(/\s+/).filter(Boolean);
  const tokB = b.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokA.length === 0 || tokB.length === 0) return 0;

  // LCS via dynamic programming
  const m = tokA.length;
  const n = tokB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        tokA[i - 1] === tokB[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lcs = dp[m][n];
  const precision = lcs / m;
  const recall = lcs / n;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

// =============================================================================
// TYPES
// =============================================================================

/** Difficulty estimate based on context complexity */
export type PromptDifficulty = 'easy' | 'medium' | 'hard';

/** Extraction source that produced this prompt */
export type PromptSource = 'todo-comment' | 'stub-implementation' | 'skipped-test' | 'low-coverage';

/** Domain tags inferred from file path and content */
export type DomainTag =
  | 'compiler'
  | 'parser'
  | 'ai'
  | 'analysis'
  | 'runtime'
  | 'lsp'
  | 'formatter'
  | 'linter'
  | 'testing'
  | 'visualization'
  | 'codebase'
  | 'security'
  | 'registry'
  | 'cli'
  | 'vm'
  | 'wasm'
  | 'shader'
  | 'spatial'
  | 'robotics'
  | 'self-improvement'
  | 'graphql'
  | 'agent'
  | 'marketplace'
  | 'other';

/**
 * A single extracted GRPO prompt, ready for TRL training.
 *
 * Follows TRL's expected structure: `instruction` is the prompt text,
 * `context` provides surrounding code, and metadata enables curriculum
 * sorting and filtering.
 */
export interface GRPOPrompt {
  /** The instruction for the model (what to implement/fix/test) */
  instruction: string;
  /** Surrounding code context (function signatures, imports, class) */
  context: string;
  /** Package name (e.g., "core", "lsp", "compiler-wasm") */
  packageName: string;
  /** Relative file path within the monorepo */
  filePath: string;
  /** Estimated difficulty */
  difficulty: PromptDifficulty;
  /** Domain tags for curriculum filtering */
  domainTags: DomainTag[];
  /** Extraction source */
  source: PromptSource;
  /** Line number where the prompt was extracted from */
  line: number;
  /** Function or symbol name related to this prompt */
  symbolName: string;
}

/**
 * TRL-compatible JSONL record for GRPO training.
 *
 * This matches the prompt format expected by TRL's GRPOTrainer:
 * the `prompt` field contains the complete instruction with context.
 */
export interface TRLPromptRecord {
  /** The prompt text for the model */
  prompt: string;
  /** Structured metadata for filtering and curriculum sorting */
  metadata: {
    source: 'grpo-prompt-extractor';
    extractionSource: PromptSource;
    packageName: string;
    filePath: string;
    difficulty: PromptDifficulty;
    domainTags: DomainTag[];
    symbolName: string;
    line: number;
    timestamp: number;
  };
}

/** Configuration for the prompt extractor */
export interface PromptExtractorConfig {
  /** Root directory of the monorepo (default: auto-detect) */
  rootDir: string;
  /** Output directory for JSONL files (default: "datasets") */
  outputDir: string;
  /** Maximum ROUGE-L similarity for deduplication (default: 0.7) */
  maxRougeLSimilarity: number;
  /** Minimum context lines to include around extraction point (default: 5) */
  minContextLines: number;
  /** Maximum context lines to include (default: 30) */
  maxContextLines: number;
  /** Maximum instruction length in characters (default: 500) */
  maxInstructionLength: number;
  /** File extensions to scan (default: ['.ts']) */
  extensions: string[];
  /** Directories to exclude from scanning */
  excludeDirs: string[];
  /** Maximum total prompts to collect before stopping (default: 10000) */
  maxPrompts: number;
  /** Maximum lines to scan when extracting a function body (default: 500) */
  maxBodyScanLines: number;
}

/** Statistics about the extraction run */
export interface ExtractionStats {
  /** Total prompts extracted before deduplication */
  totalExtracted: number;
  /** Total prompts after deduplication */
  totalAfterDedup: number;
  /** Prompts removed by ROUGE-L dedup */
  removedByDedup: number;
  /** Breakdown by source type */
  bySource: Record<PromptSource, number>;
  /** Breakdown by difficulty */
  byDifficulty: Record<PromptDifficulty, number>;
  /** Breakdown by domain tag (a prompt can have multiple tags) */
  byDomain: Record<string, number>;
  /** Packages covered */
  packagesCovered: string[];
  /** Output file path */
  outputFile: string;
}

// =============================================================================
// FILE SYSTEM ABSTRACTION (for testability)
// =============================================================================

/**
 * Abstraction over file system operations so the extractor can be
 * unit-tested with pure stubs without touching disk.
 */
export interface PromptExtractorFS {
  /** Read a file as UTF-8 string */
  readFile(filePath: string): Promise<string>;
  /** Write a file (creates directories if needed) */
  writeFile(filePath: string, content: string): Promise<void>;
  /** Recursively list files matching extensions under a directory */
  listFiles(rootDir: string, extensions: string[], excludeDirs: string[]): Promise<string[]>;
  /** Check if a file exists */
  exists(filePath: string): Promise<boolean>;
  /** Resolve a path to absolute */
  resolve(...segments: string[]): string;
  /** Get the relative path from base to target */
  relative(from: string, to: string): string;
  /** Get the directory name of a path */
  dirname(filePath: string): string;
  /** Get the base name of a path */
  basename(filePath: string, ext?: string): string;
  /** Join path segments */
  join(...segments: string[]): string;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: PromptExtractorConfig = {
  rootDir: '.',
  outputDir: 'datasets',
  maxRougeLSimilarity: 0.7,
  minContextLines: 5,
  maxContextLines: 30,
  maxInstructionLength: 500,
  extensions: ['.ts'],
  excludeDirs: ['node_modules', 'dist', 'build', '.git', 'coverage', '.stryker-tmp', '.turbo'],
  maxPrompts: 10_000,
  maxBodyScanLines: 500,
};

// =============================================================================
// DOMAIN TAG INFERENCE
// =============================================================================

/** Map of path patterns to domain tags */
const DOMAIN_PATTERNS: Array<{ pattern: RegExp; tag: DomainTag }> = [
  { pattern: /compiler|compile/i, tag: 'compiler' },
  { pattern: /pars(?:er|e|ing)/i, tag: 'parser' },
  { pattern: /\bai[-_]|llm|model|embedding|grpo|self-improv/i, tag: 'ai' },
  { pattern: /analy(?:sis|zer|ze)/i, tag: 'analysis' },
  { pattern: /runtime|holo-vm|vm-bridge/i, tag: 'runtime' },
  { pattern: /\blsp\b/i, tag: 'lsp' },
  { pattern: /format(?:ter|ting)/i, tag: 'formatter' },
  { pattern: /lint(?:er|ing)/i, tag: 'linter' },
  { pattern: /test|spec|__tests__/i, tag: 'testing' },
  { pattern: /visual(?:ize|izer|ization)|preview|scene/i, tag: 'visualization' },
  { pattern: /codebase|graph-?rag|absorb/i, tag: 'codebase' },
  { pattern: /secur(?:ity|e)|sandbox|rbac|identity/i, tag: 'security' },
  { pattern: /registry|trait-?reg/i, tag: 'registry' },
  { pattern: /\bcli\b|command/i, tag: 'cli' },
  { pattern: /\bvm\b|holo-?vm/i, tag: 'vm' },
  { pattern: /wasm|webassembly/i, tag: 'wasm' },
  { pattern: /shader|wgpu|webgpu/i, tag: 'shader' },
  { pattern: /spatial|engine|3d|ar\b|vr\b/i, tag: 'spatial' },
  { pattern: /robot(?:ics|)|urdf|sdf|ros/i, tag: 'robotics' },
  { pattern: /self-?improv|training|harvest|quality/i, tag: 'self-improvement' },
  { pattern: /graphql|query|mutation|resolver/i, tag: 'graphql' },
  { pattern: /agent|protocol|sdk/i, tag: 'agent' },
  { pattern: /market(?:place)?|partner/i, tag: 'marketplace' },
];

/**
 * Infer domain tags from a file path and optional content.
 */
export function inferDomainTags(filePath: string, content?: string): DomainTag[] {
  const tags = new Set<DomainTag>();
  const searchText = content ? `${filePath}\n${content}` : filePath;

  for (const { pattern, tag } of DOMAIN_PATTERNS) {
    if (pattern.test(searchText)) {
      tags.add(tag);
    }
  }

  if (tags.size === 0) {
    tags.add('other');
  }

  return Array.from(tags);
}

// =============================================================================
// DIFFICULTY ESTIMATION
// =============================================================================

/**
 * Estimate prompt difficulty based on context complexity metrics.
 *
 * Easy: short functions, simple patterns, few dependencies
 * Medium: moderate complexity, some dependencies
 * Hard: complex logic, many dependencies, advanced patterns
 */
export function estimateDifficulty(
  contextLines: number,
  symbolName: string,
  content: string
): PromptDifficulty {
  let score = 0;

  // Context length scoring
  if (contextLines > 20) score += 2;
  else if (contextLines > 10) score += 1;

  // Type complexity indicators
  if (/generic|<[A-Z]\w*>/i.test(content)) score += 1;
  if (/async\s+/.test(content)) score += 1;
  if (/Promise|Observable|Iterator/i.test(content)) score += 1;
  if (/class\s+\w+\s+(?:extends|implements)/i.test(content)) score += 1;

  // Dependency complexity
  const importCount = (content.match(/^import\s/gm) || []).length;
  if (importCount > 5) score += 2;
  else if (importCount > 2) score += 1;

  // Nested structures
  const maxNesting = countMaxNesting(content);
  if (maxNesting > 3) score += 2;
  else if (maxNesting > 2) score += 1;

  // Name complexity (longer names tend to be more complex)
  if (symbolName.length > 30) score += 1;

  if (score >= 5) return 'hard';
  if (score >= 2) return 'medium';
  return 'easy';
}

/**
 * Count the maximum brace nesting depth in a code string.
 */
function countMaxNesting(code: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of code) {
    if (ch === '{') {
      depth++;
      if (depth > max) max = depth;
    } else if (ch === '}') {
      depth--;
    }
  }
  return max;
}

// =============================================================================
// PACKAGE NAME EXTRACTION
// =============================================================================

/**
 * Extract the package name from a file path within the monorepo.
 *
 * Expected structure: .../packages/{packageName}/src/...
 */
export function extractPackageName(filePath: string, rootDir: string): string {
  const normalised = filePath.replace(/\\/g, '/');
  const rootNorm = rootDir.replace(/\\/g, '/');
  const relative = normalised.startsWith(rootNorm) ? normalised.slice(rootNorm.length) : normalised;

  // Match packages/{name}/
  const match = relative.match(/\/?packages\/([^/]+)\//);
  if (match) return match[1];

  // Fallback: use the first directory segment
  const segments = relative.replace(/^\//, '').split('/');
  return segments[0] || 'root';
}

// =============================================================================
// EXTRACTION HELPERS
// =============================================================================

/** Parsed TODO/FIXME/HACK comment with context */
interface CommentAnnotation {
  type: 'TODO' | 'FIXME' | 'HACK';
  text: string;
  line: number;
  functionName: string;
  context: string;
}

/** Parsed stub/empty function */
interface StubFunction {
  name: string;
  signature: string;
  line: number;
  context: string;
  stubType: 'empty-body' | 'single-return' | 'not-implemented';
}

/** Parsed skipped test */
interface SkippedTest {
  description: string;
  line: number;
  context: string;
  skipType: 'it.skip' | 'xit' | 'xdescribe' | 'test.todo' | 'test.skip' | 'describe.skip';
}

/** Parsed untested export */
interface UntestedExport {
  symbolName: string;
  symbolType: string;
  filePath: string;
  line: number;
  signature: string;
  context: string;
}

// =============================================================================
// EXTRACTOR
// =============================================================================

/**
 * GRPOPromptExtractor scans the HoloScript monorepo and extracts
 * diverse, training-worthy prompts for GRPO training.
 *
 * Usage:
 * ```ts
 * const extractor = new GRPOPromptExtractor(
 *   { rootDir: '/path/to/HoloScript' },
 *   nodeFS,  // injected file system
 * );
 *
 * const result = await extractor.extract();
 * console.log(result.stats);
 * // Output: datasets/grpo-prompts-2026-03-05.jsonl
 * ```
 */
export class GRPOPromptExtractor {
  private readonly config: PromptExtractorConfig;
  private readonly fs: PromptExtractorFS;

  constructor(config: Partial<PromptExtractorConfig> = {}, fs: PromptExtractorFS) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fs = fs;
  }

  // ---------------------------------------------------------------------------
  // Main Entry Point
  // ---------------------------------------------------------------------------

  /**
   * Extract prompts from all 4 sources, deduplicate, and write JSONL output.
   *
   * Returns the extracted prompts and extraction statistics.
   */
  async extract(): Promise<{
    prompts: GRPOPrompt[];
    records: TRLPromptRecord[];
    stats: ExtractionStats;
  }> {
    // 1. Collect all source files
    const allFiles = await this.fs.listFiles(
      this.config.rootDir,
      this.config.extensions,
      this.config.excludeDirs
    );

    // Partition files once to avoid redundant filtering
    const testFiles: string[] = [];
    const nonTestFiles: string[] = [];
    for (const f of allFiles) {
      if (f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')) {
        testFiles.push(f);
      } else {
        nonTestFiles.push(f);
      }
    }

    // 2. Extract prompts from all 4 sources, reading each file at most once
    //    per extraction method, with a global cap to prevent unbounded growth.
    const rawPrompts: GRPOPrompt[] = [];
    const cap = this.config.maxPrompts;

    // Source A: TODO/FIXME/HACK comments
    const todoPrompts = await this.extractTodoComments(allFiles, cap);
    rawPrompts.push(...todoPrompts);

    // Source B: Empty/stub implementations (skip test files)
    const stubPrompts = await this.extractStubImplementations(
      nonTestFiles,
      cap - rawPrompts.length
    );
    rawPrompts.push(...stubPrompts);

    // Source C: Failing/skipped tests
    const skippedPrompts = await this.extractSkippedTests(testFiles, cap - rawPrompts.length);
    rawPrompts.push(...skippedPrompts);

    // Source D: Low-coverage functions (exported symbols without test files)
    const coveragePrompts = await this.extractLowCoverageExports(
      nonTestFiles,
      testFiles,
      cap - rawPrompts.length
    );
    rawPrompts.push(...coveragePrompts);

    // 3. Deduplicate using ROUGE-L
    const dedupedPrompts = this.deduplicatePrompts(rawPrompts);

    // 4. Convert to TRL records
    const timestamp = Date.now();
    const records: TRLPromptRecord[] = dedupedPrompts.map((p) => this.toTRLRecord(p, timestamp));

    // 5. Write JSONL output
    const date = new Date().toISOString().slice(0, 10);
    const outputFile = this.fs.join(
      this.config.rootDir,
      this.config.outputDir,
      `grpo-prompts-${date}.jsonl`
    );
    const jsonl = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await this.fs.writeFile(outputFile, jsonl);

    // 6. Compute statistics
    const stats = this.computeStats(rawPrompts, dedupedPrompts, outputFile);

    return { prompts: dedupedPrompts, records, stats };
  }

  // ---------------------------------------------------------------------------
  // Source A: TODO/FIXME/HACK Comments
  // ---------------------------------------------------------------------------

  /**
   * Parse all .ts files for TODO, FIXME, and HACK comments.
   * Extract surrounding function context and format as actionable instructions.
   *
   * @param cap Maximum number of prompts to collect (prevents unbounded growth)
   */
  async extractTodoComments(files: string[], cap = Infinity): Promise<GRPOPrompt[]> {
    const prompts: GRPOPrompt[] = [];

    for (const filePath of files) {
      if (prompts.length >= cap) break;

      let content: string;
      try {
        content = await this.fs.readFile(filePath);
      } catch {
        continue;
      }

      const annotations = this.parseTodoComments(content);

      for (const ann of annotations) {
        if (prompts.length >= cap) break;

        const actionVerb = this.todoActionVerb(ann.type);
        const instruction = truncate(
          `${actionVerb} ${ann.text} in ${this.fs.basename(filePath)}:${ann.functionName}`,
          this.config.maxInstructionLength
        );

        const packageName = extractPackageName(filePath, this.config.rootDir);
        const relativePath = this.fs.relative(this.config.rootDir, filePath);

        prompts.push({
          instruction,
          context: ann.context,
          packageName,
          filePath: relativePath,
          difficulty: estimateDifficulty(
            ann.context.split('\n').length,
            ann.functionName,
            ann.context
          ),
          domainTags: inferDomainTags(filePath),
          source: 'todo-comment',
          line: ann.line,
          symbolName: ann.functionName,
        });
      }

      // Release content reference eagerly for GC
      content = '';
    }

    return prompts;
  }

  /**
   * Parse TODO/FIXME/HACK comments from source text.
   * Returns annotations with the comment text, line, and enclosing function.
   */
  parseTodoComments(content: string): CommentAnnotation[] {
    const annotations: CommentAnnotation[] = [];
    const lines = content.split('\n');
    const todoPattern = /\/\/\s*(TODO|FIXME|HACK)\s*:?\s*(.+)/i;

    for (let i = 0; i < lines.length; i++) {
      const match = todoPattern.exec(lines[i]);
      if (!match) continue;

      const type = match[1].toUpperCase() as 'TODO' | 'FIXME' | 'HACK';
      const text = match[2].trim();
      const lineNum = i + 1;

      // Find enclosing function
      const functionName = this.findEnclosingFunction(lines, i);

      // Extract context around the annotation
      const contextStart = Math.max(0, i - this.config.minContextLines);
      const contextEnd = Math.min(lines.length, i + this.config.maxContextLines);
      const context = lines.slice(contextStart, contextEnd).join('\n');

      annotations.push({ type, text, line: lineNum, functionName, context });
    }

    return annotations;
  }

  // ---------------------------------------------------------------------------
  // Source B: Empty/Stub Implementations
  // ---------------------------------------------------------------------------

  /**
   * Find functions with empty bodies, single-line returns, or
   * `throw new Error("not implemented")`.
   *
   * @param cap Maximum number of prompts to collect (prevents unbounded growth)
   */
  async extractStubImplementations(files: string[], cap = Infinity): Promise<GRPOPrompt[]> {
    const prompts: GRPOPrompt[] = [];

    for (const filePath of files) {
      if (prompts.length >= cap) break;

      let content: string;
      try {
        content = await this.fs.readFile(filePath);
      } catch {
        continue;
      }

      const stubs = this.parseStubFunctions(content);

      for (const stub of stubs) {
        if (prompts.length >= cap) break;

        const instruction = truncate(
          `Complete the implementation of ${stub.name} in ${this.fs.basename(filePath)}`,
          this.config.maxInstructionLength
        );

        const packageName = extractPackageName(filePath, this.config.rootDir);
        const relativePath = this.fs.relative(this.config.rootDir, filePath);

        prompts.push({
          instruction,
          context: stub.context,
          packageName,
          filePath: relativePath,
          difficulty: estimateDifficulty(stub.context.split('\n').length, stub.name, stub.context),
          domainTags: inferDomainTags(filePath),
          source: 'stub-implementation',
          line: stub.line,
          symbolName: stub.name,
        });
      }

      // Release content reference eagerly for GC
      content = '';
    }

    return prompts;
  }

  /**
   * Parse source code for stub/empty function implementations.
   */
  parseStubFunctions(content: string): StubFunction[] {
    const stubs: StubFunction[] = [];
    const lines = content.split('\n');

    // Pattern 1: throw new Error("not implemented") or throw new Error("Not implemented")
    const notImplPattern =
      /throw\s+new\s+Error\s*\(\s*['"`](?:not?\s*implemented|todo|stub)['"`]\s*\)/i;

    // Pattern 2: Function with empty body (just braces or braces with only a comment)
    // Pattern 3: Function with only `return;` or `return undefined;` or `return null;`
    const returnStubPattern = /^\s*return\s*(?:undefined|null|void\s+0)?\s*;?\s*$/;

    // Find function declarations and arrow functions
    const funcPattern =
      /(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*(?::\s*[^=]*?)?\s*=>|(\w+)\s*\([^)]*\)\s*(?::\s*[^{]*?)?\s*\{)/;

    for (let i = 0; i < lines.length; i++) {
      const funcMatch = funcPattern.exec(lines[i]);
      if (!funcMatch) continue;

      const name = funcMatch[1] || funcMatch[2] || funcMatch[3];
      if (!name) continue;

      // Skip constructors and lifecycle methods
      if (name === 'constructor' || name === 'render') continue;

      // Find the function body
      const bodyInfo = this.extractFunctionBody(lines, i);
      if (!bodyInfo) continue;

      const bodyContent = bodyInfo.body.trim();

      // Check for stub patterns
      let stubType: StubFunction['stubType'] | null = null;

      if (notImplPattern.test(bodyContent)) {
        stubType = 'not-implemented';
      } else if (bodyContent === '' || bodyContent === '{}' || /^\s*\/\//.test(bodyContent)) {
        stubType = 'empty-body';
      } else if (returnStubPattern.test(bodyContent)) {
        stubType = 'single-return';
      }

      if (!stubType) continue;

      const signature = lines[i].trim();
      const contextStart = Math.max(0, i - this.config.minContextLines);
      const contextEnd = Math.min(lines.length, bodyInfo.endLine + 1);
      const context = lines.slice(contextStart, contextEnd).join('\n');

      stubs.push({
        name,
        signature,
        line: i + 1,
        context,
        stubType,
      });
    }

    return stubs;
  }

  // ---------------------------------------------------------------------------
  // Source C: Skipped/Failing Tests
  // ---------------------------------------------------------------------------

  /**
   * Find test files with skipped or todo tests.
   *
   * @param cap Maximum number of prompts to collect (prevents unbounded growth)
   */
  async extractSkippedTests(testFiles: string[], cap = Infinity): Promise<GRPOPrompt[]> {
    const prompts: GRPOPrompt[] = [];

    for (const filePath of testFiles) {
      if (prompts.length >= cap) break;

      let content: string;
      try {
        content = await this.fs.readFile(filePath);
      } catch {
        continue;
      }

      const skipped = this.parseSkippedTests(content);

      for (const skip of skipped) {
        if (prompts.length >= cap) break;

        const instruction = truncate(
          `Write the test implementation for "${skip.description}" in ${this.fs.basename(filePath)}`,
          this.config.maxInstructionLength
        );

        const packageName = extractPackageName(filePath, this.config.rootDir);
        const relativePath = this.fs.relative(this.config.rootDir, filePath);

        prompts.push({
          instruction,
          context: skip.context,
          packageName,
          filePath: relativePath,
          difficulty: estimateDifficulty(
            skip.context.split('\n').length,
            skip.description,
            skip.context
          ),
          domainTags: inferDomainTags(filePath),
          source: 'skipped-test',
          line: skip.line,
          symbolName: skip.description,
        });
      }

      // Release content reference eagerly for GC
      content = '';
    }

    return prompts;
  }

  /**
   * Parse test source code for skipped/todo test declarations.
   */
  parseSkippedTests(content: string): SkippedTest[] {
    const skipped: SkippedTest[] = [];
    const lines = content.split('\n');

    const skipPatterns: Array<{
      pattern: RegExp;
      type: SkippedTest['skipType'];
    }> = [
      { pattern: /\bit\.skip\s*\(\s*['"`]([^'"`]+)['"`]/, type: 'it.skip' },
      { pattern: /\bxit\s*\(\s*['"`]([^'"`]+)['"`]/, type: 'xit' },
      { pattern: /\bxdescribe\s*\(\s*['"`]([^'"`]+)['"`]/, type: 'xdescribe' },
      { pattern: /\btest\.todo\s*\(\s*['"`]([^'"`]+)['"`]/, type: 'test.todo' },
      { pattern: /\btest\.skip\s*\(\s*['"`]([^'"`]+)['"`]/, type: 'test.skip' },
      {
        pattern: /\bdescribe\.skip\s*\(\s*['"`]([^'"`]+)['"`]/,
        type: 'describe.skip',
      },
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, type } of skipPatterns) {
        const match = pattern.exec(lines[i]);
        if (!match) continue;

        const description = match[1];
        const contextStart = Math.max(0, i - this.config.minContextLines);
        const contextEnd = Math.min(lines.length, i + this.config.maxContextLines);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        skipped.push({
          description,
          line: i + 1,
          context,
          skipType: type,
        });
      }
    }

    return skipped;
  }

  // ---------------------------------------------------------------------------
  // Source D: Low-Coverage Exports
  // ---------------------------------------------------------------------------

  /**
   * Cross-reference exported functions against test files to find
   * symbols that lack corresponding test coverage.
   *
   * @param cap Maximum number of prompts to collect (prevents unbounded growth)
   */
  async extractLowCoverageExports(
    sourceFiles: string[],
    testFiles: string[],
    cap = Infinity
  ): Promise<GRPOPrompt[]> {
    const prompts: GRPOPrompt[] = [];

    // Build a set of symbol names mentioned in test files
    const testedSymbols = await this.collectTestedSymbols(testFiles);

    for (const filePath of sourceFiles) {
      if (prompts.length >= cap) break;

      let content: string;
      try {
        content = await this.fs.readFile(filePath);
      } catch {
        continue;
      }

      const exports = this.parseExportedSymbols(content);

      for (const exp of exports) {
        if (prompts.length >= cap) break;

        // Check if any test file references this symbol
        if (testedSymbols.has(exp.symbolName)) continue;

        // Also check for common test file naming conventions
        const baseName = this.fs.basename(filePath, '.ts');
        const hasTestFile = testFiles.some((tf) => {
          const testBase = this.fs.basename(tf);
          return testBase.includes(baseName) || testBase.includes(exp.symbolName);
        });
        if (hasTestFile) continue;

        const instruction = truncate(
          `Write tests for ${exp.symbolName} exported from ${this.fs.basename(filePath)}`,
          this.config.maxInstructionLength
        );

        const packageName = extractPackageName(filePath, this.config.rootDir);
        const relativePath = this.fs.relative(this.config.rootDir, filePath);

        prompts.push({
          instruction,
          context: exp.context,
          packageName,
          filePath: relativePath,
          difficulty: estimateDifficulty(
            exp.context.split('\n').length,
            exp.symbolName,
            exp.context
          ),
          domainTags: inferDomainTags(filePath),
          source: 'low-coverage',
          line: exp.line,
          symbolName: exp.symbolName,
        });
      }

      // Release content reference eagerly for GC
      content = '';
    }

    return prompts;
  }

  /**
   * Collect all symbol names referenced in test files.
   * Looks for import statements and direct symbol references.
   */
  async collectTestedSymbols(testFiles: string[]): Promise<Set<string>> {
    const symbols = new Set<string>();

    for (const filePath of testFiles) {
      let content: string;
      try {
        content = await this.fs.readFile(filePath);
      } catch {
        continue;
      }

      // Extract imported names from test files
      const importPattern = /import\s+(?:type\s+)?{([^}]+)}\s+from/g;
      let match: RegExpExecArray | null;
      while ((match = importPattern.exec(content)) !== null) {
        const names = match[1].split(',');
        for (const name of names) {
          const clean = name
            .trim()
            .split(/\s+as\s+/)[0]
            .trim();
          if (clean) symbols.add(clean);
        }
      }

      // Extract default imports
      const defaultImport = /import\s+(\w+)\s+from/g;
      while ((match = defaultImport.exec(content)) !== null) {
        symbols.add(match[1]);
      }

      // Look for symbol names used in describe/it blocks
      const describePattern = /(?:describe|it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g;
      while ((match = describePattern.exec(content)) !== null) {
        // Extract potential symbol names from test descriptions
        const words = match[1].split(/\s+/);
        for (const word of words) {
          // PascalCase or camelCase words are likely symbol names
          if (/^[A-Z][a-zA-Z0-9]+$/.test(word) || /^[a-z][a-zA-Z0-9]+$/.test(word)) {
            if (word.length > 3) {
              symbols.add(word);
            }
          }
        }
      }

      // Release content reference eagerly for GC
      content = '';
    }

    return symbols;
  }

  /**
   * Parse exported symbols (functions, classes, constants) from source code.
   */
  parseExportedSymbols(content: string): UntestedExport[] {
    const exports: UntestedExport[] = [];
    const lines = content.split('\n');

    const exportPatterns: Array<{
      pattern: RegExp;
      getNameIndex: number;
      symbolType: string;
    }> = [
      // export function name(...)
      {
        pattern: /^export\s+(?:async\s+)?function\s+(\w+)/,
        getNameIndex: 1,
        symbolType: 'function',
      },
      // export class Name
      { pattern: /^export\s+class\s+(\w+)/, getNameIndex: 1, symbolType: 'class' },
      // export const name =
      { pattern: /^export\s+const\s+(\w+)\s*[=:]/, getNameIndex: 1, symbolType: 'constant' },
      // export interface Name (skip -- no code to test)
      // export enum Name
      { pattern: /^export\s+enum\s+(\w+)/, getNameIndex: 1, symbolType: 'enum' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();

      for (const { pattern, getNameIndex, symbolType } of exportPatterns) {
        const match = pattern.exec(trimmed);
        if (!match) continue;

        const symbolName = match[getNameIndex];
        if (!symbolName) continue;

        // Skip type-only exports and re-exports
        if (/^export\s+type\s/.test(trimmed)) continue;
        if (/^export\s*\{/.test(trimmed)) continue;

        const contextStart = Math.max(0, i - 2);
        const bodyEnd = this.findBlockEnd(lines, i);
        const contextEnd = Math.min(lines.length, bodyEnd + 1);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        exports.push({
          symbolName,
          symbolType,
          filePath: '', // filled by caller
          line: i + 1,
          signature: lines[i].trim(),
          context,
        });
      }
    }

    return exports;
  }

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  /**
   * Remove near-duplicate prompts using ROUGE-L similarity.
   *
   * Iterates through prompts in order; a prompt is kept only if its
   * instruction has ROUGE-L < maxRougeLSimilarity with all previously
   * accepted prompts.
   */
  deduplicatePrompts(prompts: GRPOPrompt[]): GRPOPrompt[] {
    const accepted: GRPOPrompt[] = [];
    const acceptedInstructions: string[] = [];

    for (const prompt of prompts) {
      let isDuplicate = false;

      for (const existing of acceptedInstructions) {
        const similarity = computeRougeL(existing, prompt.instruction);
        if (similarity > this.config.maxRougeLSimilarity) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        accepted.push(prompt);
        acceptedInstructions.push(prompt.instruction);
      }
    }

    return accepted;
  }

  // ---------------------------------------------------------------------------
  // TRL Record Conversion
  // ---------------------------------------------------------------------------

  /**
   * Convert a GRPOPrompt into a TRL-compatible JSONL record.
   *
   * The `prompt` field combines instruction and context in a format
   * suitable for LLM consumption.
   */
  toTRLRecord(prompt: GRPOPrompt, timestamp: number): TRLPromptRecord {
    const promptText = [
      prompt.instruction,
      '',
      '### Context',
      '```typescript',
      prompt.context,
      '```',
      '',
      `Package: ${prompt.packageName}`,
      `File: ${prompt.filePath}`,
      `Difficulty: ${prompt.difficulty}`,
    ].join('\n');

    return {
      prompt: promptText,
      metadata: {
        source: 'grpo-prompt-extractor',
        extractionSource: prompt.source,
        packageName: prompt.packageName,
        filePath: prompt.filePath,
        difficulty: prompt.difficulty,
        domainTags: prompt.domainTags,
        symbolName: prompt.symbolName,
        line: prompt.line,
        timestamp,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Compute extraction statistics from raw and deduped prompt lists.
   */
  computeStats(raw: GRPOPrompt[], deduped: GRPOPrompt[], outputFile: string): ExtractionStats {
    const bySource: Record<PromptSource, number> = {
      'todo-comment': 0,
      'stub-implementation': 0,
      'skipped-test': 0,
      'low-coverage': 0,
    };

    const byDifficulty: Record<PromptDifficulty, number> = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    const byDomain: Record<string, number> = {};
    const packages = new Set<string>();

    for (const p of deduped) {
      bySource[p.source]++;
      byDifficulty[p.difficulty]++;
      packages.add(p.packageName);

      for (const tag of p.domainTags) {
        byDomain[tag] = (byDomain[tag] || 0) + 1;
      }
    }

    return {
      totalExtracted: raw.length,
      totalAfterDedup: deduped.length,
      removedByDedup: raw.length - deduped.length,
      bySource,
      byDifficulty,
      byDomain,
      packagesCovered: Array.from(packages).sort(),
      outputFile,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  /**
   * Find the name of the function enclosing a given line index.
   * Searches upward from the line for the nearest function/method declaration.
   */
  findEnclosingFunction(lines: string[], lineIndex: number): string {
    // Pattern 1: function declarations (function name(...) {)
    const funcDeclPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/;
    // Pattern 2: arrow function assignments (const name = (...) => or const name = async (...) =>)
    const arrowFuncPattern =
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*(?::\s*[^=]*?)?\s*=>/;
    // Pattern 3: method declarations (name(...) { -- inside a class)
    const methodPattern = /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]*?)?\s*\{/;

    for (let i = lineIndex; i >= 0; i--) {
      const line = lines[i];

      const funcMatch = funcDeclPattern.exec(line);
      if (funcMatch) return funcMatch[1];

      const arrowMatch = arrowFuncPattern.exec(line);
      if (arrowMatch) return arrowMatch[1];

      const methodMatch = methodPattern.exec(line);
      if (
        methodMatch &&
        methodMatch[1] !== 'if' &&
        methodMatch[1] !== 'for' &&
        methodMatch[1] !== 'while' &&
        methodMatch[1] !== 'switch' &&
        methodMatch[1] !== 'catch'
      ) {
        return methodMatch[1];
      }
    }
    return 'module-level';
  }

  /**
   * Extract the body of a function starting at the given line index.
   * Returns the body text and end line, or null if no body is found.
   *
   * Bounded to `maxBodyScanLines` to prevent unbounded memory growth
   * when parsing malformed files with unmatched braces.
   */
  extractFunctionBody(
    lines: string[],
    startLine: number
  ): { body: string; endLine: number } | null {
    // Find the opening brace
    let braceStart = -1;
    for (let i = startLine; i < Math.min(startLine + 5, lines.length); i++) {
      const idx = lines[i].indexOf('{');
      if (idx !== -1) {
        braceStart = i;
        break;
      }
    }

    if (braceStart === -1) {
      // Arrow function without braces (single expression)
      const arrowIdx = lines[startLine].indexOf('=>');
      if (arrowIdx !== -1) {
        const afterArrow = lines[startLine].slice(arrowIdx + 2).trim();
        return { body: afterArrow, endLine: startLine };
      }
      return null;
    }

    // Find matching closing brace, bounded to prevent scanning entire files
    const scanLimit = Math.min(lines.length, braceStart + this.config.maxBodyScanLines);
    let depth = 0;
    const bodyLines: string[] = [];
    for (let i = braceStart; i < scanLimit; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }

      if (i === braceStart) {
        // First line: content after the opening brace
        const afterBrace = lines[i].slice(lines[i].indexOf('{') + 1);
        bodyLines.push(afterBrace);
      } else if (depth <= 0) {
        // Last line: content before the closing brace
        const beforeBrace = lines[i].slice(0, lines[i].lastIndexOf('}'));
        bodyLines.push(beforeBrace);
        return { body: bodyLines.join('\n'), endLine: i };
      } else {
        bodyLines.push(lines[i]);
      }
    }

    return null;
  }

  /**
   * Find the end of a block (matching closing brace) starting from
   * a given line index. Returns the line index of the closing brace.
   */
  findBlockEnd(lines: string[], startLine: number): number {
    let depth = 0;
    let foundOpen = false;

    for (let i = startLine; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          depth++;
          foundOpen = true;
        }
        if (ch === '}') {
          depth--;
        }
      }

      if (foundOpen && depth <= 0) {
        return i;
      }
    }

    // If no matching brace found, return a reasonable range
    return Math.min(startLine + this.config.maxContextLines, lines.length - 1);
  }

  /**
   * Map TODO/FIXME/HACK type to an action verb for the instruction.
   */
  private todoActionVerb(type: 'TODO' | 'FIXME' | 'HACK'): string {
    switch (type) {
      case 'TODO':
        return 'Implement';
      case 'FIXME':
        return 'Fix';
      case 'HACK':
        return 'Improve';
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Truncate a string to a maximum length, adding "..." if truncated.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// =============================================================================
// DEFAULT NODE.JS FILE SYSTEM IMPLEMENTATION
// =============================================================================

/**
 * Create a PromptExtractorFS backed by Node.js `fs` and `path` modules.
 *
 * This is the production implementation. For tests, inject a mock FS
 * that returns predetermined file contents.
 */
export function createNodeFS(): PromptExtractorFS {
  // Lazy imports to avoid bundling issues in non-Node environments
  const fsModule = require('fs') as typeof import('fs');
  const pathModule = require('path') as typeof import('path');

  return {
    async readFile(filePath: string): Promise<string> {
      return fsModule.promises.readFile(filePath, 'utf-8');
    },

    async writeFile(filePath: string, content: string): Promise<void> {
      const dir = pathModule.dirname(filePath);
      if (!fsModule.existsSync(dir)) {
        fsModule.mkdirSync(dir, { recursive: true });
      }
      await fsModule.promises.writeFile(filePath, content, 'utf-8');
    },

    async listFiles(
      rootDir: string,
      extensions: string[],
      excludeDirs: string[]
    ): Promise<string[]> {
      const results: string[] = [];
      const extSet = new Set(extensions);
      const excludeSet = new Set(excludeDirs);

      function walk(dir: string): void {
        let entries: string[];
        try {
          entries = fsModule.readdirSync(dir);
        } catch {
          return;
        }

        for (const entry of entries) {
          if (excludeSet.has(entry)) continue;

          const fullPath = pathModule.join(dir, entry);
          let stat;
          try {
            stat = fsModule.statSync(fullPath);
          } catch {
            continue;
          }

          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (stat.isFile()) {
            const ext = pathModule.extname(entry);
            if (extSet.has(ext)) {
              results.push(fullPath);
            }
          }
        }
      }

      walk(rootDir);
      return results;
    },

    async exists(filePath: string): Promise<boolean> {
      return fsModule.existsSync(filePath);
    },

    resolve(...segments: string[]): string {
      return pathModule.resolve(...segments);
    },

    relative(from: string, to: string): string {
      return pathModule.relative(from, to);
    },

    dirname(filePath: string): string {
      return pathModule.dirname(filePath);
    },

    basename(filePath: string, ext?: string): string {
      return ext ? pathModule.basename(filePath, ext) : pathModule.basename(filePath);
    },

    join(...segments: string[]): string {
      return pathModule.join(...segments);
    },
  };
}
