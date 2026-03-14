/**
 * CompressionRatioOptimizer — Optimizes knowledge compression from 74.7% to 93-96%
 *
 * The uAA2++ protocol accumulates knowledge across research cycles. Raw knowledge
 * (MEMORY.md, research files, wisdom entries) needs aggressive compression while
 * preserving semantic fidelity. This optimizer applies multi-pass compression
 * (structural -> semantic -> redundancy elimination), scores quality preservation,
 * and provides an A/B testing framework for comparing compression strategies.
 *
 * Features:
 *   - Three-pass compression pipeline (structural, semantic, redundancy)
 *   - Quality preservation scoring (BLEU-like n-gram overlap + key fact retention)
 *   - A/B testing framework: run two strategies, pick winner by quality/ratio
 *   - Strategy registry for pluggable compression algorithms
 *   - Compression analytics dashboard data
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/** A chunk of knowledge to be compressed */
export interface KnowledgeChunk {
  id: string;
  source: string;
  category: 'wisdom' | 'research' | 'pattern' | 'gotcha' | 'memory' | 'raw';
  originalText: string;
  /** Pre-identified key facts that must survive compression */
  keyFacts: string[];
  /** Priority: 0.0 (can be dropped) to 1.0 (must preserve verbatim) */
  priority: number;
  /** Word count of original */
  wordCount: number;
  metadata?: Record<string, string>;
}

/** Result of compressing a single chunk */
export interface CompressedChunk {
  id: string;
  originalId: string;
  compressedText: string;
  originalWordCount: number;
  compressedWordCount: number;
  compressionRatio: number;
  qualityScore: number;
  keyFactRetention: number;
  passesApplied: CompressionPassType[];
}

/** Types of compression passes */
export type CompressionPassType =
  | 'structural'
  | 'semantic'
  | 'redundancy'
  | 'abbreviation'
  | 'quantization';

/** A single compression pass definition */
export interface CompressionPass {
  type: CompressionPassType;
  name: string;
  description: string;
  /** Apply this pass to text. Returns compressed text. */
  apply: (text: string, context: PassContext) => string;
  /** Expected compression ratio contribution (0-1, where 0 = no change, 1 = empty) */
  expectedRatio: number;
}

/** Context available to compression passes */
export interface PassContext {
  keyFacts: string[];
  priority: number;
  category: string;
  previousPasses: CompressionPassType[];
}

/** Named compression strategy (a pipeline of passes) */
export interface CompressionStrategy {
  name: string;
  description: string;
  passes: CompressionPass[];
  /** Target compression ratio (0-1, e.g. 0.95 = 95% reduction) */
  targetRatio: number;
}

/** A/B test configuration */
export interface ABTest {
  id: string;
  name: string;
  strategyA: CompressionStrategy;
  strategyB: CompressionStrategy;
  /** Number of chunks to test */
  sampleSize: number;
  /** Minimum quality score to consider acceptable */
  minQuality: number;
}

/** A/B test result */
export interface ABTestResult {
  testId: string;
  testName: string;
  strategyAName: string;
  strategyBName: string;
  strategyAResults: StrategyTestResults;
  strategyBResults: StrategyTestResults;
  winner: 'A' | 'B' | 'tie';
  winReason: string;
  timestamp: string;
}

export interface StrategyTestResults {
  avgCompressionRatio: number;
  avgQualityScore: number;
  avgKeyFactRetention: number;
  minQualityScore: number;
  maxCompressionRatio: number;
  totalOriginalWords: number;
  totalCompressedWords: number;
  chunksProcessed: number;
  passBreakdown: Record<CompressionPassType, number>;
}

/** Full compression report */
export interface CompressionReport {
  timestamp: string;
  strategyUsed: string;
  inputChunks: number;
  totalOriginalWords: number;
  totalCompressedWords: number;
  overallCompressionRatio: number;
  avgQualityScore: number;
  avgKeyFactRetention: number;
  chunks: CompressedChunk[];
  durationMs: number;
}

// =============================================================================
// BUILT-IN COMPRESSION PASSES
// =============================================================================

/**
 * Structural compression: Remove markdown formatting, normalize whitespace,
 * strip headers/dividers, collapse lists.
 */
const structuralPass: CompressionPass = {
  type: 'structural',
  name: 'Structural Cleanup',
  description: 'Remove markdown formatting, normalize whitespace, collapse structure',
  expectedRatio: 0.15,
  apply: (text: string, _ctx: PassContext): string => {
    let result = text;

    // Remove markdown headers (keep text)
    result = result.replace(/^#{1,6}\s+/gm, '');

    // Remove horizontal rules
    result = result.replace(/^[-=*]{3,}\s*$/gm, '');

    // Remove bold/italic markers
    result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
    result = result.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');

    // Remove code block markers (keep content)
    result = result.replace(/```[a-z]*\n?/g, '');
    result = result.replace(/`([^`]+)`/g, '$1');

    // Collapse multiple blank lines
    result = result.replace(/\n{3,}/g, '\n\n');

    // Remove leading/trailing whitespace per line
    result = result
      .split('\n')
      .map((line) => line.trim())
      .join('\n');

    // Collapse bullet markers to semicolons in flowing text
    result = result.replace(/\n\s*[-*+]\s+/g, '; ');

    // Normalize whitespace
    result = result.replace(/[ \t]+/g, ' ').trim();

    return result;
  },
};

/**
 * Semantic compression: Shorten verbose phrases, remove filler words,
 * use standard abbreviations for common technical terms.
 */
const semanticPass: CompressionPass = {
  type: 'semantic',
  name: 'Semantic Condensation',
  description: 'Shorten verbose phrases, remove filler, use technical abbreviations',
  expectedRatio: 0.25,
  apply: (text: string, ctx: PassContext): string => {
    let result = text;

    // Common verbose -> concise substitutions
    const substitutions: [RegExp, string][] = [
      [/\bin order to\b/gi, 'to'],
      [/\bdue to the fact that\b/gi, 'because'],
      [/\bat this point in time\b/gi, 'now'],
      [/\bin the event that\b/gi, 'if'],
      [/\bfor the purpose of\b/gi, 'to'],
      [/\bwith regard to\b/gi, 'regarding'],
      [/\bin the process of\b/gi, 'while'],
      [/\bit is important to note that\b/gi, ''],
      [/\bit should be noted that\b/gi, ''],
      [/\bas a matter of fact\b/gi, ''],
      [/\bthe fact that\b/gi, 'that'],
      [/\bin terms of\b/gi, 'in'],
      [/\ba large number of\b/gi, 'many'],
      [/\ba small number of\b/gi, 'few'],
      [/\bhas the ability to\b/gi, 'can'],
      [/\bis able to\b/gi, 'can'],
      [/\bmake use of\b/gi, 'use'],
      [/\btake into account\b/gi, 'consider'],
      [/\bat the present time\b/gi, 'now'],
      [/\bon a regular basis\b/gi, 'regularly'],
      [/\bin spite of the fact that\b/gi, 'despite'],
      [/\bprior to\b/gi, 'before'],
      [/\bsubsequent to\b/gi, 'after'],
      [/\bin close proximity to\b/gi, 'near'],
      [/\bthe majority of\b/gi, 'most'],
    ];

    for (const [pattern, replacement] of substitutions) {
      result = result.replace(pattern, replacement);
    }

    // Technical abbreviations (only for lower priority content)
    if (ctx.priority < 0.8) {
      const techAbbrevs: [RegExp, string][] = [
        [/\bconfiguration\b/gi, 'config'],
        [/\bimplementation\b/gi, 'impl'],
        [/\bdocumentation\b/gi, 'docs'],
        [/\bapplication\b/gi, 'app'],
        [/\binformation\b/gi, 'info'],
        [/\benvironment\b/gi, 'env'],
        [/\bdevelopment\b/gi, 'dev'],
        [/\bproduction\b/gi, 'prod'],
        [/\brepository\b/gi, 'repo'],
        [/\bdirectory\b/gi, 'dir'],
        [/\bparameter\b/gi, 'param'],
        [/\bfunction\b/gi, 'fn'],
        [/\bmanagement\b/gi, 'mgmt'],
        [/\bperformance\b/gi, 'perf'],
        [/\barchitecture\b/gi, 'arch'],
      ];

      for (const [pattern, replacement] of techAbbrevs) {
        result = result.replace(pattern, replacement);
      }
    }

    // Remove filler words
    result = result.replace(/\b(basically|essentially|actually|literally|really|very|quite|rather|somewhat|just)\b\s*/gi, '');

    // Collapse double spaces from removals
    result = result.replace(/\s{2,}/g, ' ').trim();

    return result;
  },
};

/**
 * Redundancy elimination: Remove repeated phrases, deduplicate sentences,
 * collapse repeated information.
 */
const redundancyPass: CompressionPass = {
  type: 'redundancy',
  name: 'Redundancy Elimination',
  description: 'Remove repeated phrases, deduplicate sentences, collapse repetition',
  expectedRatio: 0.20,
  apply: (text: string, _ctx: PassContext): string => {
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];

    // Deduplicate exact sentences
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const sentence of sentences) {
      const normalized = sentence.trim().toLowerCase();
      if (!seen.has(normalized) && normalized.length > 5) {
        seen.add(normalized);
        unique.push(sentence.trim());
      }
    }

    let result = unique.join(' ');

    // Remove repeated multi-word phrases (3+ words repeated within 200 chars)
    const words = result.split(/\s+/);
    for (let phraseLen = 5; phraseLen >= 3; phraseLen--) {
      for (let i = 0; i < words.length - phraseLen; i++) {
        const phrase = words.slice(i, i + phraseLen).join(' ').toLowerCase();
        // Look for the same phrase later in the text
        for (let j = i + phraseLen; j <= words.length - phraseLen; j++) {
          const candidate = words.slice(j, j + phraseLen).join(' ').toLowerCase();
          if (phrase === candidate && phrase.length > 10) {
            // Remove the second occurrence
            words.splice(j, phraseLen);
            break;
          }
        }
      }
    }

    result = words.join(' ');

    // Collapse "X. X." patterns (same sentence repeated)
    result = result.replace(/([^.]{20,}\.)\s*\1/g, '$1');

    return result.trim();
  },
};

/**
 * Abbreviation pass: Convert known identifiers and paths to short forms.
 */
const abbreviationPass: CompressionPass = {
  type: 'abbreviation',
  name: 'Identifier Abbreviation',
  description: 'Shorten known identifiers, paths, and repeated references',
  expectedRatio: 0.10,
  apply: (text: string, _ctx: PassContext): string => {
    let result = text;

    // Shorten common path patterns
    result = result.replace(/c:\\Users\\[^\\]+\\Documents\\GitHub\\/gi, '~/');
    result = result.replace(/C:\/Users\/[^/]+\/Documents\/GitHub\//gi, '~/');
    result = result.replace(/node_modules\//g, 'nm/');

    // Shorten @holoscript references
    result = result.replace(/@holoscript\/core/g, '@hs/core');
    result = result.replace(/@holoscript\/lsp/g, '@hs/lsp');
    result = result.replace(/@holoscript\/studio/g, '@hs/studio');

    // Shorten repeated protocol references
    result = result.replace(/uAA2\+\+\s+protocol/gi, 'uAA2++');

    return result;
  },
};

/**
 * Quantization pass: Round numbers, simplify percentages, compress numeric data.
 */
const quantizationPass: CompressionPass = {
  type: 'quantization',
  name: 'Numeric Quantization',
  description: 'Round numbers, simplify percentages, compress numeric data',
  expectedRatio: 0.05,
  apply: (text: string, ctx: PassContext): string => {
    if (ctx.priority > 0.9) return text; // Don't quantize high-priority content

    let result = text;

    // Round long decimals to 1 decimal place
    result = result.replace(/(\d+\.\d{3,})/g, (match) => {
      const n = parseFloat(match);
      return isNaN(n) ? match : n.toFixed(1);
    });

    // Simplify large numbers (only in non-critical contexts)
    if (ctx.priority < 0.7) {
      result = result.replace(/\b(\d{4,})\b/g, (match) => {
        const n = parseInt(match, 10);
        if (isNaN(n)) return match;
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
        return match;
      });
    }

    return result;
  },
};

// =============================================================================
// QUALITY SCORER
// =============================================================================

/**
 * Score how well compressed text preserves the original meaning.
 * Uses n-gram overlap (BLEU-inspired) and key fact retention.
 */
export function scoreQuality(
  original: string,
  compressed: string,
  keyFacts: string[],
): { overallScore: number; ngramScore: number; keyFactRetention: number } {
  // N-gram overlap (unigrams and bigrams)
  const origUnigrams = getUnigrams(original);
  const compUnigrams = getUnigrams(compressed);
  const origBigrams = getBigrams(original);
  const compBigrams = getBigrams(compressed);

  const unigramOverlap = setOverlap(origUnigrams, compUnigrams);
  const bigramOverlap = setBigramOverlap(origBigrams, compBigrams);

  // Weighted n-gram score (unigrams more important for compression)
  const ngramScore = unigramOverlap * 0.6 + bigramOverlap * 0.4;

  // Key fact retention
  let factsRetained = 0;
  const compressedLower = compressed.toLowerCase();

  for (const fact of keyFacts) {
    // Check if the key fact (or a significant portion) survives
    const factWords = fact.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    let matchedWords = 0;
    for (const word of factWords) {
      if (compressedLower.includes(word)) matchedWords++;
    }
    const factRetention = factWords.length > 0 ? matchedWords / factWords.length : 0;
    if (factRetention >= 0.6) factsRetained++;
  }

  const keyFactRetention = keyFacts.length > 0 ? factsRetained / keyFacts.length : 1.0;

  // Overall: 60% n-gram preservation + 40% key fact retention
  const overallScore = ngramScore * 0.6 + keyFactRetention * 0.4;

  return { overallScore, ngramScore, keyFactRetention };
}

function getUnigrams(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

function getBigrams(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

function setOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let intersection = 0;
  for (const item of b) {
    if (a.has(item)) intersection++;
  }
  return intersection / a.size;
}

function setBigramOverlap(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  const bSet = new Set(b);
  let intersection = 0;
  for (const bigram of a) {
    if (bSet.has(bigram)) intersection++;
  }
  return intersection / a.length;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

// =============================================================================
// COMPRESSION RATIO OPTIMIZER
// =============================================================================

export class CompressionRatioOptimizer {
  private strategies: Map<string, CompressionStrategy> = new Map();
  private testResults: ABTestResult[] = [];

  constructor() {
    // Register default strategies
    this.registerStrategy({
      name: 'standard',
      description: 'Three-pass compression: structural -> semantic -> redundancy',
      passes: [structuralPass, semanticPass, redundancyPass],
      targetRatio: 0.85,
    });

    this.registerStrategy({
      name: 'aggressive',
      description: 'Five-pass compression targeting 93-96% ratio',
      passes: [structuralPass, semanticPass, redundancyPass, abbreviationPass, quantizationPass],
      targetRatio: 0.95,
    });

    this.registerStrategy({
      name: 'conservative',
      description: 'Two-pass compression prioritizing quality preservation',
      passes: [structuralPass, redundancyPass],
      targetRatio: 0.60,
    });
  }

  /**
   * Register a compression strategy.
   */
  registerStrategy(strategy: CompressionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Get a registered strategy by name.
   */
  getStrategy(name: string): CompressionStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * List all registered strategy names.
   */
  listStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Compress a single knowledge chunk using the specified strategy.
   */
  compressChunk(chunk: KnowledgeChunk, strategyName: string = 'aggressive'): CompressedChunk {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown strategy: "${strategyName}". Available: ${this.listStrategies().join(', ')}`);
    }

    let text = chunk.originalText;
    const passesApplied: CompressionPassType[] = [];

    const context: PassContext = {
      keyFacts: chunk.keyFacts,
      priority: chunk.priority,
      category: chunk.category,
      previousPasses: [],
    };

    // Apply each pass in sequence
    for (const pass of strategy.passes) {
      const before = text;
      text = pass.apply(text, context);
      context.previousPasses.push(pass.type);

      if (text !== before) {
        passesApplied.push(pass.type);
      }
    }

    // Score quality
    const { overallScore, keyFactRetention } = scoreQuality(
      chunk.originalText,
      text,
      chunk.keyFacts,
    );

    const compressedWordCount = countWords(text);
    const compressionRatio =
      chunk.wordCount > 0 ? 1 - compressedWordCount / chunk.wordCount : 0;

    return {
      id: `compressed-${chunk.id}`,
      originalId: chunk.id,
      compressedText: text,
      originalWordCount: chunk.wordCount,
      compressedWordCount,
      compressionRatio,
      qualityScore: overallScore,
      keyFactRetention,
      passesApplied,
    };
  }

  /**
   * Compress a batch of knowledge chunks and generate a report.
   */
  compressBatch(
    chunks: KnowledgeChunk[],
    strategyName: string = 'aggressive',
  ): CompressionReport {
    const start = Date.now();
    const results: CompressedChunk[] = [];

    for (const chunk of chunks) {
      results.push(this.compressChunk(chunk, strategyName));
    }

    const totalOriginal = results.reduce((s, r) => s + r.originalWordCount, 0);
    const totalCompressed = results.reduce((s, r) => s + r.compressedWordCount, 0);
    const avgQuality =
      results.length > 0
        ? results.reduce((s, r) => s + r.qualityScore, 0) / results.length
        : 0;
    const avgKeyFact =
      results.length > 0
        ? results.reduce((s, r) => s + r.keyFactRetention, 0) / results.length
        : 0;

    return {
      timestamp: new Date().toISOString(),
      strategyUsed: strategyName,
      inputChunks: chunks.length,
      totalOriginalWords: totalOriginal,
      totalCompressedWords: totalCompressed,
      overallCompressionRatio: totalOriginal > 0 ? 1 - totalCompressed / totalOriginal : 0,
      avgQualityScore: avgQuality,
      avgKeyFactRetention: avgKeyFact,
      chunks: results,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Run an A/B test comparing two strategies on the same data.
   */
  runABTest(test: ABTest, chunks: KnowledgeChunk[]): ABTestResult {
    // Sample if needed
    const sample =
      chunks.length > test.sampleSize ? chunks.slice(0, test.sampleSize) : chunks;

    // Run strategy A
    const resultsA = sample.map((chunk) => {
      let text = chunk.originalText;
      const ctx: PassContext = {
        keyFacts: chunk.keyFacts,
        priority: chunk.priority,
        category: chunk.category,
        previousPasses: [],
      };
      const applied: CompressionPassType[] = [];
      for (const pass of test.strategyA.passes) {
        text = pass.apply(text, ctx);
        ctx.previousPasses.push(pass.type);
        applied.push(pass.type);
      }
      const quality = scoreQuality(chunk.originalText, text, chunk.keyFacts);
      const wc = countWords(text);
      return {
        compressionRatio: chunk.wordCount > 0 ? 1 - wc / chunk.wordCount : 0,
        qualityScore: quality.overallScore,
        keyFactRetention: quality.keyFactRetention,
        originalWords: chunk.wordCount,
        compressedWords: wc,
        passes: applied,
      };
    });

    // Run strategy B
    const resultsB = sample.map((chunk) => {
      let text = chunk.originalText;
      const ctx: PassContext = {
        keyFacts: chunk.keyFacts,
        priority: chunk.priority,
        category: chunk.category,
        previousPasses: [],
      };
      const applied: CompressionPassType[] = [];
      for (const pass of test.strategyB.passes) {
        text = pass.apply(text, ctx);
        ctx.previousPasses.push(pass.type);
        applied.push(pass.type);
      }
      const quality = scoreQuality(chunk.originalText, text, chunk.keyFacts);
      const wc = countWords(text);
      return {
        compressionRatio: chunk.wordCount > 0 ? 1 - wc / chunk.wordCount : 0,
        qualityScore: quality.overallScore,
        keyFactRetention: quality.keyFactRetention,
        originalWords: chunk.wordCount,
        compressedWords: wc,
        passes: applied,
      };
    });

    const aggregateResults = (
      results: typeof resultsA,
    ): StrategyTestResults => {
      const n = results.length;
      const passBreakdown: Record<CompressionPassType, number> = {
        structural: 0,
        semantic: 0,
        redundancy: 0,
        abbreviation: 0,
        quantization: 0,
      };
      for (const r of results) {
        for (const p of r.passes) passBreakdown[p]++;
      }
      return {
        avgCompressionRatio: results.reduce((s, r) => s + r.compressionRatio, 0) / n,
        avgQualityScore: results.reduce((s, r) => s + r.qualityScore, 0) / n,
        avgKeyFactRetention: results.reduce((s, r) => s + r.keyFactRetention, 0) / n,
        minQualityScore: Math.min(...results.map((r) => r.qualityScore)),
        maxCompressionRatio: Math.max(...results.map((r) => r.compressionRatio)),
        totalOriginalWords: results.reduce((s, r) => s + r.originalWords, 0),
        totalCompressedWords: results.reduce((s, r) => s + r.compressedWords, 0),
        chunksProcessed: n,
        passBreakdown,
      };
    };

    const statsA = aggregateResults(resultsA);
    const statsB = aggregateResults(resultsB);

    // Determine winner: higher quality-weighted compression ratio wins
    // Score = compressionRatio * qualityScore (both must be good)
    const scoreA = statsA.avgCompressionRatio * statsA.avgQualityScore;
    const scoreB = statsB.avgCompressionRatio * statsB.avgQualityScore;

    // Quality gate: both must meet minimum quality
    const aPassesQuality = statsA.minQualityScore >= test.minQuality;
    const bPassesQuality = statsB.minQualityScore >= test.minQuality;

    let winner: 'A' | 'B' | 'tie';
    let winReason: string;

    if (!aPassesQuality && !bPassesQuality) {
      winner = 'tie';
      winReason = `Neither strategy meets quality minimum (${test.minQuality}). A min=${statsA.minQualityScore.toFixed(2)}, B min=${statsB.minQualityScore.toFixed(2)}.`;
    } else if (!aPassesQuality) {
      winner = 'B';
      winReason = `Strategy A fails quality gate (min=${statsA.minQualityScore.toFixed(2)} < ${test.minQuality}).`;
    } else if (!bPassesQuality) {
      winner = 'A';
      winReason = `Strategy B fails quality gate (min=${statsB.minQualityScore.toFixed(2)} < ${test.minQuality}).`;
    } else if (Math.abs(scoreA - scoreB) < 0.02) {
      winner = 'tie';
      winReason = `Strategies within 2% composite score (A=${scoreA.toFixed(3)}, B=${scoreB.toFixed(3)}).`;
    } else if (scoreA > scoreB) {
      winner = 'A';
      winReason = `Strategy A wins on composite score: ${scoreA.toFixed(3)} vs ${scoreB.toFixed(3)} (ratio*quality).`;
    } else {
      winner = 'B';
      winReason = `Strategy B wins on composite score: ${scoreB.toFixed(3)} vs ${scoreA.toFixed(3)} (ratio*quality).`;
    }

    const result: ABTestResult = {
      testId: test.id,
      testName: test.name,
      strategyAName: test.strategyA.name,
      strategyBName: test.strategyB.name,
      strategyAResults: statsA,
      strategyBResults: statsB,
      winner,
      winReason,
      timestamp: new Date().toISOString(),
    };

    this.testResults.push(result);
    return result;
  }

  /**
   * Get all A/B test results.
   */
  getTestResults(): ABTestResult[] {
    return [...this.testResults];
  }

  /**
   * Format a compression report as human-readable text.
   */
  static formatReport(report: CompressionReport): string {
    const lines: string[] = [
      'Compression Report',
      '==================',
      `Strategy: ${report.strategyUsed}`,
      `Timestamp: ${report.timestamp}`,
      `Duration: ${report.durationMs}ms`,
      '',
      'Summary:',
      `  Input chunks:        ${report.inputChunks}`,
      `  Original words:      ${report.totalOriginalWords}`,
      `  Compressed words:    ${report.totalCompressedWords}`,
      `  Compression ratio:   ${(report.overallCompressionRatio * 100).toFixed(1)}%`,
      `  Avg quality:         ${(report.avgQualityScore * 100).toFixed(1)}%`,
      `  Avg fact retention:  ${(report.avgKeyFactRetention * 100).toFixed(1)}%`,
    ];

    if (report.chunks.length > 0) {
      lines.push('', 'Chunk Details:');
      for (const chunk of report.chunks) {
        lines.push(
          `  ${chunk.originalId}: ${chunk.originalWordCount} -> ${chunk.compressedWordCount} words ` +
            `(${(chunk.compressionRatio * 100).toFixed(0)}% reduction, ` +
            `quality=${(chunk.qualityScore * 100).toFixed(0)}%, ` +
            `facts=${(chunk.keyFactRetention * 100).toFixed(0)}%) ` +
            `[${chunk.passesApplied.join(', ')}]`,
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Format an A/B test result as human-readable text.
   */
  static formatABTestResult(result: ABTestResult): string {
    const lines: string[] = [
      `A/B Test: ${result.testName}`,
      '=' .repeat(40),
      `Test ID: ${result.testId}`,
      `Timestamp: ${result.timestamp}`,
      '',
      `Strategy A: "${result.strategyAName}"`,
      `  Avg compression: ${(result.strategyAResults.avgCompressionRatio * 100).toFixed(1)}%`,
      `  Avg quality:     ${(result.strategyAResults.avgQualityScore * 100).toFixed(1)}%`,
      `  Avg fact retention: ${(result.strategyAResults.avgKeyFactRetention * 100).toFixed(1)}%`,
      `  Min quality:     ${(result.strategyAResults.minQualityScore * 100).toFixed(1)}%`,
      `  Chunks tested:   ${result.strategyAResults.chunksProcessed}`,
      '',
      `Strategy B: "${result.strategyBName}"`,
      `  Avg compression: ${(result.strategyBResults.avgCompressionRatio * 100).toFixed(1)}%`,
      `  Avg quality:     ${(result.strategyBResults.avgQualityScore * 100).toFixed(1)}%`,
      `  Avg fact retention: ${(result.strategyBResults.avgKeyFactRetention * 100).toFixed(1)}%`,
      `  Min quality:     ${(result.strategyBResults.minQualityScore * 100).toFixed(1)}%`,
      `  Chunks tested:   ${result.strategyBResults.chunksProcessed}`,
      '',
      `Winner: ${result.winner}`,
      `Reason: ${result.winReason}`,
    ];

    return lines.join('\n');
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a knowledge chunk from raw text for compression testing.
 */
export function createKnowledgeChunk(
  id: string,
  text: string,
  options: {
    source?: string;
    category?: KnowledgeChunk['category'];
    keyFacts?: string[];
    priority?: number;
  } = {},
): KnowledgeChunk {
  return {
    id,
    source: options.source ?? 'unknown',
    category: options.category ?? 'raw',
    originalText: text,
    keyFacts: options.keyFacts ?? [],
    priority: options.priority ?? 0.5,
    wordCount: countWords(text),
  };
}
