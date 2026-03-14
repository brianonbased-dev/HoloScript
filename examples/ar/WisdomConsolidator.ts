/**
 * WisdomConsolidator — Deduplicates wisdom entries across the uAA2++ protocol
 *
 * Over multiple research cycles, wisdom entries (W.xxx), gotchas (G.xxx), and
 * patterns (P.xxx, SP.xxx) accumulate duplicates, near-duplicates, and
 * superseded entries. This utility detects semantic similarity, applies a merge
 * strategy that keeps the highest-confidence version, tracks provenance through
 * merges, and generates a human-readable consolidation report.
 *
 * Features:
 *   - Semantic similarity via trigram Jaccard coefficient (no ML dependency)
 *   - Configurable similarity threshold (default 0.65)
 *   - Merge strategy: keep highest confidence, union sources, preserve lineage
 *   - Provenance chain tracking through multiple consolidation passes
 *   - Consolidation report with statistics and merge justifications
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type WisdomCategory = 'wisdom' | 'gotcha' | 'pattern' | 'structural_pattern';

export interface WisdomEntry {
  /** Unique identifier, e.g. "W.004", "G.002", "SP.001" */
  id: string;
  /** Category of the entry */
  category: WisdomCategory;
  /** Short title / summary */
  title: string;
  /** Full description / content */
  content: string;
  /** Confidence score 0.0 - 1.0 */
  confidence: number;
  /** Source file(s) where this entry was discovered */
  sources: string[];
  /** ISO timestamp of when this was first recorded */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Tags for cross-referencing */
  tags: string[];
  /** IDs of entries that were merged into this one */
  mergedFrom?: string[];
  /** Number of times this entry has been validated / confirmed */
  confirmationCount: number;
}

/** Result of comparing two entries */
export interface SimilarityResult {
  entryA: string;
  entryB: string;
  similarity: number;
  matchType: 'exact' | 'near_duplicate' | 'related' | 'distinct';
  sharedTrigrams: number;
  totalTrigrams: number;
}

/** Describes a single merge operation */
export interface MergeOperation {
  /** ID of the surviving (merged) entry */
  survivorId: string;
  /** IDs of entries absorbed into the survivor */
  absorbedIds: string[];
  /** Similarity score that triggered the merge */
  similarity: number;
  /** Why this merge was performed */
  justification: string;
  /** Timestamp of the merge */
  timestamp: string;
}

/** Full consolidation report */
export interface ConsolidationReport {
  timestamp: string;
  /** Total entries before consolidation */
  inputCount: number;
  /** Total entries after consolidation */
  outputCount: number;
  /** Number of merges performed */
  mergeCount: number;
  /** Entries removed as exact duplicates */
  exactDuplicates: number;
  /** Entries merged as near-duplicates */
  nearDuplicates: number;
  /** Reduction percentage */
  reductionPercent: number;
  /** All merge operations performed */
  merges: MergeOperation[];
  /** Surviving entries */
  entries: WisdomEntry[];
  /** Duration in milliseconds */
  durationMs: number;
}

/** Configuration for the consolidator */
export interface ConsolidatorConfig {
  /** Similarity threshold for near-duplicate detection (0.0-1.0). Default: 0.65 */
  similarityThreshold: number;
  /** Similarity threshold for exact duplicate detection. Default: 0.95 */
  exactThreshold: number;
  /** Whether to merge across categories. Default: false */
  crossCategoryMerge: boolean;
  /** Minimum confidence to keep an entry (filter low-quality). Default: 0.0 */
  minConfidence: number;
  /** When merging, how to combine content */
  contentStrategy: 'keep_longest' | 'keep_highest_confidence' | 'concatenate';
  /** Whether to preserve the full provenance chain. Default: true */
  trackProvenance: boolean;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: ConsolidatorConfig = {
  similarityThreshold: 0.65,
  exactThreshold: 0.95,
  crossCategoryMerge: false,
  minConfidence: 0.0,
  contentStrategy: 'keep_highest_confidence',
  trackProvenance: true,
};

// =============================================================================
// TRIGRAM SIMILARITY ENGINE
// =============================================================================

/**
 * Generate character-level trigrams from a string.
 * Lowercases and strips non-alphanumeric characters for normalization.
 */
function generateTrigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const trigrams = new Set<string>();

  if (normalized.length < 3) {
    if (normalized.length > 0) trigrams.add(normalized);
    return trigrams;
  }

  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.substring(i, i + 3));
  }

  return trigrams;
}

/**
 * Compute Jaccard similarity between two trigram sets.
 * Returns value in [0, 1] where 1.0 = identical.
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): { similarity: number; shared: number; total: number } {
  if (setA.size === 0 && setB.size === 0) return { similarity: 1.0, shared: 0, total: 0 };
  if (setA.size === 0 || setB.size === 0) return { similarity: 0, shared: 0, total: 0 };

  let intersection = 0;
  for (const trigram of setA) {
    if (setB.has(trigram)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return {
    similarity: intersection / union,
    shared: intersection,
    total: union,
  };
}

// =============================================================================
// WISDOM CONSOLIDATOR
// =============================================================================

export class WisdomConsolidator {
  private config: ConsolidatorConfig;

  constructor(config: Partial<ConsolidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compare two wisdom entries and return a similarity result.
   */
  comparePair(a: WisdomEntry, b: WisdomEntry): SimilarityResult {
    // Combine title + content for comparison, weighted toward content
    const textA = `${a.title} ${a.title} ${a.content}`; // title counted twice for weighting
    const textB = `${b.title} ${b.title} ${b.content}`;

    const trigramsA = generateTrigrams(textA);
    const trigramsB = generateTrigrams(textB);
    const { similarity, shared, total } = jaccardSimilarity(trigramsA, trigramsB);

    let matchType: SimilarityResult['matchType'];
    if (similarity >= this.config.exactThreshold) {
      matchType = 'exact';
    } else if (similarity >= this.config.similarityThreshold) {
      matchType = 'near_duplicate';
    } else if (similarity >= this.config.similarityThreshold * 0.6) {
      matchType = 'related';
    } else {
      matchType = 'distinct';
    }

    return {
      entryA: a.id,
      entryB: b.id,
      similarity,
      matchType,
      sharedTrigrams: shared,
      totalTrigrams: total,
    };
  }

  /**
   * Find all duplicate/near-duplicate pairs in a set of entries.
   */
  findDuplicates(entries: WisdomEntry[]): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        // Skip cross-category comparisons if not enabled
        if (!this.config.crossCategoryMerge && entries[i].category !== entries[j].category) {
          continue;
        }

        const result = this.comparePair(entries[i], entries[j]);
        if (result.matchType === 'exact' || result.matchType === 'near_duplicate') {
          results.push(result);
        }
      }
    }

    // Sort by similarity descending (merge most similar first)
    results.sort((a, b) => b.similarity - a.similarity);

    return results;
  }

  /**
   * Merge two entries into one, following the configured strategy.
   */
  mergeEntries(survivor: WisdomEntry, absorbed: WisdomEntry): WisdomEntry {
    // Pick the entry with higher confidence as the base
    const primary = survivor.confidence >= absorbed.confidence ? survivor : absorbed;
    const secondary = primary === survivor ? absorbed : survivor;

    // Determine content
    let content: string;
    switch (this.config.contentStrategy) {
      case 'keep_longest':
        content = primary.content.length >= secondary.content.length
          ? primary.content
          : secondary.content;
        break;
      case 'keep_highest_confidence':
        content = primary.content;
        break;
      case 'concatenate':
        content = primary.content === secondary.content
          ? primary.content
          : `${primary.content}\n\n--- Merged from ${secondary.id} ---\n${secondary.content}`;
        break;
    }

    // Union sources
    const sourcesSet = new Set([...primary.sources, ...secondary.sources]);

    // Union tags
    const tagsSet = new Set([...primary.tags, ...secondary.tags]);

    // Build provenance
    const mergedFrom = new Set<string>();
    if (this.config.trackProvenance) {
      mergedFrom.add(secondary.id);
      if (primary.mergedFrom) primary.mergedFrom.forEach((id) => mergedFrom.add(id));
      if (secondary.mergedFrom) secondary.mergedFrom.forEach((id) => mergedFrom.add(id));
    }

    return {
      id: primary.id,
      category: primary.category,
      title: primary.title.length >= secondary.title.length ? primary.title : secondary.title,
      content,
      confidence: Math.max(primary.confidence, secondary.confidence),
      sources: Array.from(sourcesSet),
      createdAt: primary.createdAt < secondary.createdAt ? primary.createdAt : secondary.createdAt,
      updatedAt: new Date().toISOString(),
      tags: Array.from(tagsSet),
      mergedFrom: mergedFrom.size > 0 ? Array.from(mergedFrom) : undefined,
      confirmationCount: primary.confirmationCount + secondary.confirmationCount,
    };
  }

  /**
   * Run full consolidation on a set of wisdom entries.
   * Returns a report containing the deduplicated entries and merge history.
   */
  consolidate(entries: WisdomEntry[]): ConsolidationReport {
    const start = Date.now();

    // Filter by minimum confidence
    let working = entries.filter((e) => e.confidence >= this.config.minConfidence);
    const filteredOut = entries.length - working.length;

    // Find all duplicate pairs
    const duplicates = this.findDuplicates(working);

    const merges: MergeOperation[] = [];
    const absorbed = new Set<string>();
    let exactCount = 0;
    let nearCount = 0;

    // Process merges in similarity order (highest first)
    for (const dup of duplicates) {
      // Skip if either entry was already absorbed
      if (absorbed.has(dup.entryA) || absorbed.has(dup.entryB)) continue;

      const entryA = working.find((e) => e.id === dup.entryA);
      const entryB = working.find((e) => e.id === dup.entryB);
      if (!entryA || !entryB) continue;

      // Determine survivor (higher confidence wins)
      const survivor = entryA.confidence >= entryB.confidence ? entryA : entryB;
      const toAbsorb = survivor === entryA ? entryB : entryA;

      // Merge
      const merged = this.mergeEntries(survivor, toAbsorb);

      // Replace survivor in working set with merged version
      working = working.map((e) => (e.id === merged.id ? merged : e));

      // Mark absorbed
      absorbed.add(toAbsorb.id);

      if (dup.matchType === 'exact') exactCount++;
      else nearCount++;

      merges.push({
        survivorId: merged.id,
        absorbedIds: [toAbsorb.id],
        similarity: dup.similarity,
        justification: dup.matchType === 'exact'
          ? `Exact duplicate (${(dup.similarity * 100).toFixed(1)}% similarity)`
          : `Near-duplicate merged (${(dup.similarity * 100).toFixed(1)}% similarity, threshold: ${(this.config.similarityThreshold * 100).toFixed(0)}%)`,
        timestamp: new Date().toISOString(),
      });
    }

    // Remove absorbed entries
    const final = working.filter((e) => !absorbed.has(e.id));

    const inputCount = entries.length;
    const outputCount = final.length;
    const reductionPercent =
      inputCount > 0 ? ((inputCount - outputCount) / inputCount) * 100 : 0;

    return {
      timestamp: new Date().toISOString(),
      inputCount,
      outputCount,
      mergeCount: merges.length,
      exactDuplicates: exactCount,
      nearDuplicates: nearCount,
      reductionPercent,
      merges,
      entries: final,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Generate a human-readable text report from a ConsolidationReport.
   */
  static formatReport(report: ConsolidationReport): string {
    const lines: string[] = [
      'Wisdom Consolidation Report',
      '===========================',
      `Timestamp: ${report.timestamp}`,
      `Duration: ${report.durationMs}ms`,
      '',
      'Summary:',
      `  Input entries:      ${report.inputCount}`,
      `  Output entries:     ${report.outputCount}`,
      `  Exact duplicates:   ${report.exactDuplicates}`,
      `  Near-duplicates:    ${report.nearDuplicates}`,
      `  Total merges:       ${report.mergeCount}`,
      `  Reduction:          ${report.reductionPercent.toFixed(1)}%`,
    ];

    if (report.merges.length > 0) {
      lines.push('', 'Merge History:', '--------------');
      for (const merge of report.merges) {
        lines.push(
          `  ${merge.survivorId} <- [${merge.absorbedIds.join(', ')}]`,
          `    ${merge.justification}`,
        );
      }
    }

    lines.push('', 'Surviving Entries:', '------------------');
    const byCategory = new Map<string, WisdomEntry[]>();
    for (const entry of report.entries) {
      const list = byCategory.get(entry.category) ?? [];
      list.push(entry);
      byCategory.set(entry.category, list);
    }

    for (const [category, entries] of byCategory) {
      lines.push(`  [${category}] (${entries.length} entries)`);
      for (const e of entries) {
        const merged = e.mergedFrom && e.mergedFrom.length > 0
          ? ` (merged from: ${e.mergedFrom.join(', ')})`
          : '';
        lines.push(`    ${e.id} | ${e.title} | conf=${e.confidence}${merged}`);
      }
    }

    return lines.join('\n');
  }
}

// =============================================================================
// FACTORY / UTILITY
// =============================================================================

/**
 * Quick-check if two entries are likely duplicates without full consolidation.
 */
export function areLikelyDuplicates(
  a: WisdomEntry,
  b: WisdomEntry,
  threshold: number = 0.65,
): boolean {
  const consolidator = new WisdomConsolidator({ similarityThreshold: threshold });
  const result = consolidator.comparePair(a, b);
  return result.matchType === 'exact' || result.matchType === 'near_duplicate';
}

/**
 * Parse a MEMORY.md-style wisdom entry into a WisdomEntry object.
 * Expects format: "### W.004 | Title | confidence"
 */
export function parseWisdomLine(
  line: string,
  content: string,
  source: string,
): WisdomEntry | null {
  const match = line.match(/^###\s+(W|G|P|SP)\.(\d+(?:\.\d+)?)\s*\|\s*(.+?)\s*\|\s*(?:⚡)?(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const prefixMap: Record<string, WisdomCategory> = {
    W: 'wisdom',
    G: 'gotcha',
    P: 'pattern',
    SP: 'structural_pattern',
  };

  const [, prefix, num, title, confStr] = match;

  return {
    id: `${prefix}.${num}`,
    category: prefixMap[prefix] ?? 'wisdom',
    title: title.trim(),
    content: content.trim(),
    confidence: parseFloat(confStr),
    sources: [source],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
    confirmationCount: 1,
  };
}
