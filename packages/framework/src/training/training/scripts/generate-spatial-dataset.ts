#!/usr/bin/env npx tsx
/**
 * Spatial Reasoning Training Dataset Generator
 *
 * Generates 10,000 spatial reasoning training examples for Brittney fine-tuning.
 * Applies deduplication per W.004 and quality validation per W.010.
 *
 * Usage:
 *   npx tsx packages/core/src/training/scripts/generate-spatial-dataset.ts
 *
 * Output:
 *   packages/core/src/training/data/spatial-reasoning-10k.jsonl
 *
 * @module training/scripts/generate-spatial-dataset
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpatialTrainingDataGenerator } from '../SpatialTrainingDataGenerator';
import type {
  SpatialTrainingExample,
  SpatialTrainingJSONLEntry,
  SpatialRelationshipType,
  SpatialDifficulty,
} from '../SpatialTrainingDataTypes';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  /** Target number of examples (before dedup) */
  targetExamples: 10_008, // 1112 * 9 categories = 10,008
  /** Examples per category (relationship_type x difficulty_level) */
  examplesPerCategory: 1112, // 9 categories => 10,008 total
  /** Positive/negative ratio: 60% positive, 40% negative */
  positiveRatio: 0.6,
  /** Seed for reproducibility */
  seed: 2026_0306,
  /** Include HoloScript context in instructions */
  includeContext: true,
  /** Output file path */
  outputPath: join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'data',
    'spatial-reasoning-10k.jsonl'
  ),
};

// =============================================================================
// N-GRAM DEDUPLICATION (W.004)
// =============================================================================

/**
 * Generates n-grams from text for near-duplicate detection.
 */
function getNgrams(text: string, n: number = 3): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Jaccard similarity between two n-gram sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicates examples using n-gram Jaccard similarity.
 * W.004: ALWAYS run deduplication before training.
 *
 * Uses a combination of exact hash dedup (instruction+response) and
 * near-duplicate detection via 3-gram Jaccard similarity > 0.85 threshold.
 */
function deduplicateExamples(
  examples: SpatialTrainingExample[],
  threshold: number = 0.85
): { unique: SpatialTrainingExample[]; duplicateCount: number; duplicateRate: number } {
  console.log('\n--- W.004: Running Deduplication ---');

  // Phase 1: Exact deduplication (hash-based)
  const seen = new Set<string>();
  const afterExact: SpatialTrainingExample[] = [];
  let exactDupes = 0;

  for (const ex of examples) {
    const key = `${ex.instruction}|||${ex.response}`;
    if (seen.has(key)) {
      exactDupes++;
      continue;
    }
    seen.add(key);
    afterExact.push(ex);
  }
  console.log(`  Phase 1 (Exact): ${exactDupes} exact duplicates removed`);

  // Phase 2: Near-duplicate detection (n-gram Jaccard)
  // For performance with 10K examples, we compare within same category
  const categories = new Map<string, SpatialTrainingExample[]>();
  for (const ex of afterExact) {
    const cat = `${ex.relationshipType}:${ex.difficulty}`;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(ex);
  }

  const unique: SpatialTrainingExample[] = [];
  let nearDupes = 0;

  for (const [_cat, catExamples] of categories) {
    const catUnique: SpatialTrainingExample[] = [];
    const ngramCache: Array<Set<string>> = [];

    for (const ex of catExamples) {
      const combined = `${ex.instruction} ${ex.response}`;
      const ngrams = getNgrams(combined);

      let isDup = false;
      // Compare against existing unique examples in this category
      // Only check last 100 to keep O(n) reasonable
      const startIdx = Math.max(0, ngramCache.length - 100);
      for (let i = startIdx; i < ngramCache.length; i++) {
        if (jaccardSimilarity(ngrams, ngramCache[i]) > threshold) {
          isDup = true;
          nearDupes++;
          break;
        }
      }

      if (!isDup) {
        catUnique.push(ex);
        ngramCache.push(ngrams);
      }
    }

    unique.push(...catUnique);
  }

  console.log(
    `  Phase 2 (Near-dup): ${nearDupes} near-duplicates removed (threshold: ${threshold})`
  );

  const totalDupes = exactDupes + nearDupes;
  const rate = totalDupes / examples.length;
  console.log(
    `  Total: ${totalDupes} duplicates removed (${(rate * 100).toFixed(1)}% duplication rate)`
  );
  console.log(`  Remaining: ${unique.length} unique examples`);

  return { unique, duplicateCount: totalDupes, duplicateRate: rate };
}

// =============================================================================
// QUALITY VALIDATION (W.010)
// =============================================================================

interface QualityScores {
  helpfulness: number;
  correctness: number;
  coherence: number;
  complexity: number;
  verbosity: number;
  overall: number;
}

/**
 * Multi-dimensional quality scoring per W.010.
 * Evaluates each example on 5 metrics: helpfulness, correctness, coherence, complexity, verbosity.
 */
function scoreQuality(ex: SpatialTrainingExample): QualityScores {
  // Helpfulness: Does the instruction ask a clear, answerable question?
  let helpfulness = 0;
  if (ex.instruction.length > 20) helpfulness += 0.3;
  if (
    ex.instruction.includes('?') ||
    ex.instruction.toLowerCase().includes('evaluate') ||
    ex.instruction.toLowerCase().includes('check') ||
    ex.instruction.toLowerCase().includes('analyze') ||
    ex.instruction.toLowerCase().includes('verify')
  )
    helpfulness += 0.3;
  if (ex.instruction.includes('"')) helpfulness += 0.2; // References specific objects
  if (ex.response.length > 20) helpfulness += 0.2;

  // Correctness: Does the response contain concrete spatial data (distances, positions)?
  let correctness = 0;
  if (ex.response.match(/\d+\.\d+m/)) correctness += 0.4; // Contains distance measurement
  if (
    ex.response.includes('Yes') ||
    ex.response.includes('No') ||
    ex.response.includes('constraint') ||
    ex.response.includes('satisf') ||
    ex.response.includes('violat') ||
    ex.response.includes('pass') ||
    ex.response.includes('fail')
  )
    correctness += 0.3; // Contains a definitive answer
  if (
    ex.tags.includes('positive') &&
    (ex.response.includes('Yes') || ex.response.includes('pass') || ex.response.includes('satisf'))
  ) {
    correctness += 0.3; // Positive label matches positive response
  } else if (
    ex.tags.includes('negative') &&
    (ex.response.includes('No') ||
      ex.response.includes('fail') ||
      ex.response.includes('violat') ||
      ex.response.includes('block'))
  ) {
    correctness += 0.3; // Negative label matches negative response
  }

  // Coherence: Is the instruction-response pair logically consistent?
  let coherence = 0;
  // Check that the response references objects from the instruction
  const instructionObjects = ex.instruction.match(/"([^"]+)"/g) || [];
  const responseObjects = ex.response.match(/"([^"]+)"/g) || [];
  if (instructionObjects.length > 0 && responseObjects.length > 0) {
    const instrSet = new Set(instructionObjects);
    const overlap = responseObjects.filter((o) => instrSet.has(o));
    coherence += Math.min(1.0, overlap.length / instructionObjects.length);
  } else {
    coherence += 0.5; // Partial credit if no quoted objects
  }

  // Complexity: Is the example sufficiently complex for training value?
  let complexity = 0;
  const difficultyScore: Record<SpatialDifficulty, number> = {
    basic: 0.3,
    intermediate: 0.6,
    advanced: 1.0,
  };
  complexity = difficultyScore[ex.difficulty];

  // Verbosity: Is the response appropriately verbose (not too short, not excessive)?
  let verbosity = 0;
  const responseLen = ex.response.length;
  if (responseLen >= 20 && responseLen <= 300) {
    verbosity = 1.0; // Ideal range
  } else if (responseLen < 20) {
    verbosity = responseLen / 20; // Too short
  } else {
    verbosity = Math.max(0.5, 1.0 - (responseLen - 300) / 500); // Slightly penalize verbose
  }

  const overall = (helpfulness + correctness + coherence + complexity + verbosity) / 5;

  return { helpfulness, correctness, coherence, complexity, verbosity, overall };
}

/**
 * Validate quality across all examples per W.010.
 * Returns distribution stats and flags low-quality examples.
 */
function validateQuality(
  examples: SpatialTrainingExample[],
  minQualityThreshold: number = 0.4
): {
  passed: SpatialTrainingExample[];
  rejected: SpatialTrainingExample[];
  avgScores: QualityScores;
  distribution: Record<string, number>;
} {
  console.log('\n--- W.010: Multi-Dimensional Quality Validation ---');

  const allScores: QualityScores[] = [];
  const passed: SpatialTrainingExample[] = [];
  const rejected: SpatialTrainingExample[] = [];
  const distribution: Record<string, number> = {
    'excellent (0.8-1.0)': 0,
    'good (0.6-0.8)': 0,
    'fair (0.4-0.6)': 0,
    'poor (0.2-0.4)': 0,
    'bad (0.0-0.2)': 0,
  };

  for (const ex of examples) {
    const scores = scoreQuality(ex);
    allScores.push(scores);

    if (scores.overall >= minQualityThreshold) {
      passed.push(ex);
    } else {
      rejected.push(ex);
    }

    if (scores.overall >= 0.8) distribution['excellent (0.8-1.0)']++;
    else if (scores.overall >= 0.6) distribution['good (0.6-0.8)']++;
    else if (scores.overall >= 0.4) distribution['fair (0.4-0.6)']++;
    else if (scores.overall >= 0.2) distribution['poor (0.2-0.4)']++;
    else distribution['bad (0.0-0.2)']++;
  }

  // Compute averages
  const avgScores: QualityScores = {
    helpfulness: allScores.reduce((s, q) => s + q.helpfulness, 0) / allScores.length,
    correctness: allScores.reduce((s, q) => s + q.correctness, 0) / allScores.length,
    coherence: allScores.reduce((s, q) => s + q.coherence, 0) / allScores.length,
    complexity: allScores.reduce((s, q) => s + q.complexity, 0) / allScores.length,
    verbosity: allScores.reduce((s, q) => s + q.verbosity, 0) / allScores.length,
    overall: allScores.reduce((s, q) => s + q.overall, 0) / allScores.length,
  };

  console.log(`  Average Quality Score: ${(avgScores.overall * 100).toFixed(1)}%`);
  console.log(`  - Helpfulness:  ${(avgScores.helpfulness * 100).toFixed(1)}%`);
  console.log(`  - Correctness:  ${(avgScores.correctness * 100).toFixed(1)}%`);
  console.log(`  - Coherence:    ${(avgScores.coherence * 100).toFixed(1)}%`);
  console.log(`  - Complexity:   ${(avgScores.complexity * 100).toFixed(1)}%`);
  console.log(`  - Verbosity:    ${(avgScores.verbosity * 100).toFixed(1)}%`);
  console.log(`\n  Quality Distribution:`);
  for (const [band, count] of Object.entries(distribution)) {
    const pct = ((count / examples.length) * 100).toFixed(1);
    const bar = '#'.repeat(Math.round((count / examples.length) * 50));
    console.log(`    ${band.padEnd(22)} ${String(count).padStart(6)} (${pct.padStart(5)}%) ${bar}`);
  }
  console.log(
    `\n  Passed:   ${passed.length} (${((passed.length / examples.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Rejected: ${rejected.length} (${((rejected.length / examples.length) * 100).toFixed(1)}%)`
  );

  return { passed, rejected, avgScores, distribution };
}

// =============================================================================
// STATISTICS REPORTING
// =============================================================================

function reportStatistics(
  examples: SpatialTrainingExample[],
  generator: SpatialTrainingDataGenerator,
  dedupStats: { duplicateCount: number; duplicateRate: number },
  qualityStats: { avgScores: QualityScores; distribution: Record<string, number> },
  originalCount: number
): void {
  const stats = generator.getStats(examples);

  console.log('\n' + '='.repeat(70));
  console.log('  SPATIAL REASONING TRAINING DATASET - FINAL REPORT');
  console.log('='.repeat(70));

  console.log('\n--- Generation Summary ---');
  console.log(`  Seed:                ${CONFIG.seed}`);
  console.log(`  Target Examples:     ${CONFIG.targetExamples}`);
  console.log(`  Generated:           ${originalCount}`);
  console.log(`  After Dedup:         ${examples.length}`);
  console.log(
    `  Dedup Removed:       ${dedupStats.duplicateCount} (${(dedupStats.duplicateRate * 100).toFixed(1)}%)`
  );
  console.log(`  Positive Ratio:      ${CONFIG.positiveRatio} (target: 60/40)`);

  console.log('\n--- Examples by Relationship Type ---');
  console.log(`  spatial_adjacent:    ${stats.byRelationship.spatial_adjacent}`);
  console.log(`  spatial_contains:    ${stats.byRelationship.spatial_contains}`);
  console.log(`  spatial_reachable:   ${stats.byRelationship.spatial_reachable}`);

  console.log('\n--- Examples by Difficulty Level ---');
  console.log(`  basic:               ${stats.byDifficulty.basic}`);
  console.log(`  intermediate:        ${stats.byDifficulty.intermediate}`);
  console.log(`  advanced:            ${stats.byDifficulty.advanced}`);

  console.log('\n--- Positive/Negative Balance ---');
  const actualPositiveRatio = stats.positiveCount / stats.totalExamples;
  console.log(
    `  Positive:            ${stats.positiveCount} (${(actualPositiveRatio * 100).toFixed(1)}%)`
  );
  console.log(
    `  Negative:            ${stats.negativeCount} (${((1 - actualPositiveRatio) * 100).toFixed(1)}%)`
  );

  console.log('\n--- Template Diversity (G.002 Compliance) ---');
  console.log(`  Unique Templates:    ${stats.uniqueTemplatesUsed}`);
  console.log(
    `  G.002 Mandate:       ${stats.uniqueTemplatesUsed >= 10 ? 'PASS (>=10)' : 'FAIL (<10)'}`
  );

  // Detailed template usage per relationship type
  const templatesByType: Record<string, Set<string>> = {
    spatial_adjacent: new Set(),
    spatial_contains: new Set(),
    spatial_reachable: new Set(),
  };
  for (const ex of examples) {
    const tplTag = ex.tags.find((t) => t.startsWith('template:'));
    if (tplTag) {
      templatesByType[ex.relationshipType].add(tplTag);
    }
  }
  console.log(`  Templates per type:`);
  for (const [type, templates] of Object.entries(templatesByType)) {
    console.log(`    ${type}: ${templates.size} unique templates`);
  }

  console.log('\n--- Quality Metrics (W.010) ---');
  console.log(`  Overall Score:       ${(qualityStats.avgScores.overall * 100).toFixed(1)}%`);
  console.log(`  Distribution:`);
  for (const [band, count] of Object.entries(qualityStats.distribution)) {
    console.log(`    ${band}: ${count}`);
  }

  // Cross-tabulation: relationship x difficulty
  console.log('\n--- Cross-Tabulation (Relationship x Difficulty) ---');
  const crossTab: Record<string, Record<string, number>> = {};
  for (const ex of examples) {
    const key = ex.relationshipType;
    if (!crossTab[key]) crossTab[key] = { basic: 0, intermediate: 0, advanced: 0 };
    crossTab[key][ex.difficulty]++;
  }
  console.log(
    '  ' +
      'Type'.padEnd(25) +
      'Basic'.padStart(8) +
      'Intermediate'.padStart(15) +
      'Advanced'.padStart(12)
  );
  for (const [type, diffs] of Object.entries(crossTab)) {
    console.log(
      `  ${type.padEnd(25)}${String(diffs.basic).padStart(8)}${String(diffs.intermediate).padStart(15)}${String(diffs.advanced).padStart(12)}`
    );
  }

  console.log('\n--- Output ---');
  console.log(`  File:   ${CONFIG.outputPath}`);
  console.log(`  Format: JSONL (one JSON object per line)`);
  console.log(`  Lines:  ${examples.length}`);

  console.log('\n' + '='.repeat(70));
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('  HoloScript Spatial Reasoning Training Data Generator');
  console.log('  Target: 10,000 examples | 3 types | 3 difficulties | 60/40 ratio');
  console.log('='.repeat(70));

  const startTime = Date.now();

  // Step 1: Generate raw examples
  console.log('\n--- Step 1: Generating Raw Examples ---');
  const generator = new SpatialTrainingDataGenerator({
    seed: CONFIG.seed,
    examplesPerCategory: CONFIG.examplesPerCategory,
    positiveRatio: CONFIG.positiveRatio,
    includeContext: CONFIG.includeContext,
    relationshipTypes: ['spatial_adjacent', 'spatial_contains', 'spatial_reachable'],
    difficultyLevels: ['basic', 'intermediate', 'advanced'],
  });

  const rawExamples = generator.generate();
  const originalCount = rawExamples.length;
  console.log(`  Generated ${rawExamples.length} raw examples`);
  console.log(`  Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // Step 2: Deduplication (W.004)
  const dedupStart = Date.now();
  const { unique: dedupExamples, duplicateCount, duplicateRate } = deduplicateExamples(rawExamples);
  console.log(`  Dedup time: ${((Date.now() - dedupStart) / 1000).toFixed(1)}s`);

  // Step 3: Quality Validation (W.010)
  const qualStart = Date.now();
  const { passed: qualityExamples, avgScores, distribution } = validateQuality(dedupExamples);
  console.log(`  Quality validation time: ${((Date.now() - qualStart) / 1000).toFixed(1)}s`);

  // Step 4: Export to JSONL
  console.log('\n--- Step 4: Exporting to JSONL ---');
  const outputDir = dirname(CONFIG.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Use the generator's exportJSONL for consistency
  const jsonl = generator.exportJSONL(qualityExamples);
  writeFileSync(CONFIG.outputPath, jsonl, 'utf-8');
  console.log(`  Written ${qualityExamples.length} examples to:`);
  console.log(`  ${CONFIG.outputPath}`);

  // File size
  const fileSizeBytes = Buffer.byteLength(jsonl, 'utf-8');
  const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  console.log(`  File size: ${fileSizeMB} MB`);

  // Step 5: Final Report
  reportStatistics(
    qualityExamples,
    generator,
    { duplicateCount, duplicateRate },
    { avgScores, distribution },
    originalCount
  );

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nTotal generation time: ${totalTime}s`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
