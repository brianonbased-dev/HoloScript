/**
 * FocusedDPOSplitter.ts
 *
 * Implements Focused Direct Preference Optimization (DPO) at HoloScript AST
 * segment boundaries. Based on the Focused-DPO paper finding of +4.79% on
 * HumanEval/MBPP benchmarks by targeting error-prone code points.
 *
 * The pipeline:
 *   1. Parse .holo source via HoloCompositionParser -> HoloComposition AST
 *   2. Split source into segments at composition/object/material/trait/
 *      animation/environment/state/logic/template/data_source boundaries
 *   3. For each segment, generate a "chosen" (correct) and multiple
 *      "rejected" (degraded) versions via controlled degradation strategies
 *   4. Each example amplifies to 3-8 DPO pairs per segment
 *   5. Output in TRL DPOTrainer JSONL format: {prompt, chosen, rejected}
 *   6. Quality scoring via re-parse validation
 *
 * Degradation strategies:
 *   - Remove required trait arguments
 *   - Break material property syntax
 *   - Use invalid trait names
 *   - Remove closing braces/brackets
 *   - Swap object types with incompatible ones
 *   - Remove required permissions blocks
 *   - Break animation keyframe syntax
 *   - Corrupt property values
 *   - Remove required colons in key-value pairs
 *   - Introduce invalid nesting
 *
 * @module self-improvement
 */

import { HoloCompositionParser } from '../parser/HoloCompositionParser';
import type { HoloComposition, HoloParseResult, SourceRange } from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/** A segment extracted from the HoloScript source at an AST boundary */
export interface ASTSegment {
  /** Type of the AST node this segment represents */
  kind: SegmentKind;
  /** Human-readable name (e.g. "object RedBall", "template Chair") */
  name: string;
  /** The raw source text of this segment */
  source: string;
  /** Start line in the original source (1-based) */
  startLine: number;
  /** End line in the original source (1-based) */
  endLine: number;
  /** Depth in the AST (0 = top-level composition) */
  depth: number;
}

export type SegmentKind =
  | 'composition'
  | 'environment'
  | 'state'
  | 'template'
  | 'object'
  | 'material'
  | 'trait'
  | 'animation'
  | 'logic'
  | 'light'
  | 'effects'
  | 'camera'
  | 'timeline'
  | 'audio'
  | 'zone'
  | 'ui'
  | 'npc'
  | 'quest'
  | 'ability'
  | 'dialogue'
  | 'state_machine'
  | 'spatial_group'
  | 'domain_block'
  | 'data_source'
  | 'import';

/** A single DPO training pair */
export interface DPOPair {
  /** The prompt/instruction that describes the task */
  prompt: string;
  /** The correct (chosen) code */
  chosen: string;
  /** The degraded (rejected) code */
  rejected: string;
  /** Metadata for analysis and filtering */
  metadata: DPOPairMetadata;
}

export interface DPOPairMetadata {
  /** Source file this was extracted from */
  sourceFile?: string;
  /** Segment kind */
  segmentKind: SegmentKind;
  /** Name of the segment */
  segmentName: string;
  /** What degradation strategy was applied */
  degradationStrategy: DegradationStrategy;
  /** Whether chosen parsed successfully */
  chosenValid: boolean;
  /** Whether rejected failed to parse (expected: true = it failed) */
  rejectedInvalid: boolean;
  /** Quality score (0-1): 1.0 means chosen valid AND rejected invalid */
  qualityScore: number;
  /** ISO timestamp */
  timestamp: string;
}

export type DegradationStrategy =
  | 'remove_closing_brace'
  | 'remove_closing_bracket'
  | 'remove_trait_arguments'
  | 'break_material_syntax'
  | 'invalid_trait_name'
  | 'swap_object_type'
  | 'remove_permissions'
  | 'break_animation_syntax'
  | 'corrupt_property_value'
  | 'remove_colon_separator'
  | 'invalid_nesting'
  | 'remove_required_property'
  | 'duplicate_block_name'
  | 'break_string_literal';

/** Configuration for the FocusedDPOSplitter */
export interface FocusedDPOConfig {
  /** Maximum DPO pairs per segment (default: 8) */
  maxPairsPerSegment: number;
  /** Minimum DPO pairs per segment (default: 3) */
  minPairsPerSegment: number;
  /** Whether to validate pairs via re-parse (default: true) */
  validatePairs: boolean;
  /** Minimum quality score to include a pair (default: 0.5) */
  minQualityScore: number;
  /** Whether to include the surrounding context in prompts (default: true) */
  includeContext: boolean;
  /** Source file name for metadata */
  sourceFile?: string;
}

/** Statistics from a splitting operation */
export interface SplitterStats {
  /** Number of segments extracted */
  segmentsExtracted: number;
  /** Number of DPO pairs generated */
  totalPairs: number;
  /** Number of pairs that passed quality validation */
  validPairs: number;
  /** Number of pairs that failed quality validation */
  rejectedPairs: number;
  /** Breakdown by segment kind */
  byKind: Partial<Record<SegmentKind, number>>;
  /** Breakdown by degradation strategy */
  byStrategy: Partial<Record<DegradationStrategy, number>>;
  /** Average quality score across all valid pairs */
  avgQualityScore: number;
  /** Amplification ratio (pairs / segments) */
  amplificationRatio: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_CONFIG: FocusedDPOConfig = {
  maxPairsPerSegment: 8,
  minPairsPerSegment: 3,
  validatePairs: true,
  minQualityScore: 0.5,
  includeContext: true,
};

// =============================================================================
// FOCUSED DPO SPLITTER
// =============================================================================

export class FocusedDPOSplitter {
  private parser: HoloCompositionParser;
  private config: FocusedDPOConfig;

  constructor(config: Partial<FocusedDPOConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.parser = new HoloCompositionParser({ tolerant: true, locations: true });
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  /**
   * Process a .holo source file and produce DPO training pairs.
   *
   * @param source - Raw HoloScript source code
   * @param sourceFile - Optional filename for metadata
   * @returns Object with pairs array and stats
   */
  process(source: string, sourceFile?: string): { pairs: DPOPair[]; stats: SplitterStats } {
    const file = sourceFile ?? this.config.sourceFile;

    // Step 1: Parse
    const parseResult = this.parser.parse(source);

    // Step 2: Extract segments
    const segments = this.extractSegments(source, parseResult);

    // Step 3: Generate DPO pairs for each segment
    const allPairs: DPOPair[] = [];
    const stats: SplitterStats = {
      segmentsExtracted: segments.length,
      totalPairs: 0,
      validPairs: 0,
      rejectedPairs: 0,
      byKind: {},
      byStrategy: {},
      avgQualityScore: 0,
      amplificationRatio: 0,
    };

    for (const segment of segments) {
      const pairs = this.generatePairsForSegment(segment, source, file);

      for (const pair of pairs) {
        stats.totalPairs++;
        stats.byKind[pair.metadata.segmentKind] =
          (stats.byKind[pair.metadata.segmentKind] ?? 0) + 1;
        stats.byStrategy[pair.metadata.degradationStrategy] =
          (stats.byStrategy[pair.metadata.degradationStrategy] ?? 0) + 1;

        if (pair.metadata.qualityScore >= this.config.minQualityScore) {
          allPairs.push(pair);
          stats.validPairs++;
          stats.avgQualityScore += pair.metadata.qualityScore;
        } else {
          stats.rejectedPairs++;
        }
      }
    }

    // Finalize stats
    if (stats.validPairs > 0) {
      stats.avgQualityScore /= stats.validPairs;
    }
    stats.amplificationRatio = segments.length > 0 ? stats.validPairs / segments.length : 0;

    return { pairs: allPairs, stats };
  }

  /**
   * Process multiple .holo files and combine results.
   */
  processMultiple(files: Array<{ source: string; filename: string }>): {
    pairs: DPOPair[];
    stats: SplitterStats;
  } {
    const allPairs: DPOPair[] = [];
    const combinedStats: SplitterStats = {
      segmentsExtracted: 0,
      totalPairs: 0,
      validPairs: 0,
      rejectedPairs: 0,
      byKind: {},
      byStrategy: {},
      avgQualityScore: 0,
      amplificationRatio: 0,
    };

    for (const file of files) {
      const result = this.process(file.source, file.filename);
      allPairs.push(...result.pairs);
      combinedStats.segmentsExtracted += result.stats.segmentsExtracted;
      combinedStats.totalPairs += result.stats.totalPairs;
      combinedStats.validPairs += result.stats.validPairs;
      combinedStats.rejectedPairs += result.stats.rejectedPairs;

      for (const [kind, count] of Object.entries(result.stats.byKind)) {
        const k = kind as SegmentKind;
        combinedStats.byKind[k] = (combinedStats.byKind[k] ?? 0) + (count ?? 0);
      }
      for (const [strat, count] of Object.entries(result.stats.byStrategy)) {
        const s = strat as DegradationStrategy;
        combinedStats.byStrategy[s] = (combinedStats.byStrategy[s] ?? 0) + (count ?? 0);
      }
    }

    if (combinedStats.validPairs > 0) {
      // Re-calculate average quality
      let totalQuality = 0;
      for (const pair of allPairs) {
        totalQuality += pair.metadata.qualityScore;
      }
      combinedStats.avgQualityScore = totalQuality / allPairs.length;
    }
    combinedStats.amplificationRatio =
      combinedStats.segmentsExtracted > 0
        ? combinedStats.validPairs / combinedStats.segmentsExtracted
        : 0;

    return { pairs: allPairs, stats: combinedStats };
  }

  /**
   * Convert DPO pairs to JSONL string (TRL DPOTrainer format).
   */
  toJSONL(pairs: DPOPair[]): string {
    return pairs
      .map((pair) =>
        JSON.stringify({
          prompt: pair.prompt,
          chosen: pair.chosen,
          rejected: pair.rejected,
        })
      )
      .join('\n');
  }

  /**
   * Convert DPO pairs to full JSONL with metadata.
   */
  toFullJSONL(pairs: DPOPair[]): string {
    return pairs.map((pair) => JSON.stringify(pair)).join('\n');
  }

  // ---------------------------------------------------------------------------
  // SEGMENT EXTRACTION
  // ---------------------------------------------------------------------------

  /**
   * Extract segments from parsed HoloScript source. Uses regex-based block
   * detection to reliably extract source ranges for each top-level and nested
   * AST node, since the parser may not always emit precise source locations.
   */
  extractSegments(source: string, parseResult: HoloParseResult): ASTSegment[] {
    const segments: ASTSegment[] = [];
    const lines = source.split('\n');

    // Strategy: Use regex to find block boundaries in the source,
    // informed by the AST parse result for context.

    // Pattern: keyword "name" [optional] {
    const blockPatterns: Array<{ pattern: RegExp; kind: SegmentKind }> = [
      { pattern: /^(\s*)composition\s+"([^"]+)"\s*\{/m, kind: 'composition' },
      { pattern: /^(\s*)environment\s*\{/m, kind: 'environment' },
      { pattern: /^(\s*)state\s*\{/m, kind: 'state' },
      { pattern: /^(\s*)template\s+"([^"]+)"\s*\{/m, kind: 'template' },
      {
        pattern: /^(\s*)object\s+"([^"]+)"(?:\s+using\s+"[^"]+")?\s*\{/m,
        kind: 'object',
      },
      { pattern: /^(\s*)material\s+"([^"]+)"[^{]*\{/m, kind: 'material' },
      { pattern: /^(\s*)pbr_material\s+"([^"]+)"[^{]*\{/m, kind: 'material' },
      { pattern: /^(\s*)unlit_material\s+"([^"]+)"[^{]*\{/m, kind: 'material' },
      { pattern: /^(\s*)toon_material\s+"([^"]+)"[^{]*\{/m, kind: 'material' },
      { pattern: /^(\s*)glass_material\s+"([^"]+)"[^{]*\{/m, kind: 'material' },
      {
        pattern: /^(\s*)subsurface_material\s+"([^"]+)"[^{]*\{/m,
        kind: 'material',
      },
      { pattern: /^(\s*)shader\s+"([^"]+)"\s*\{/m, kind: 'material' },
      { pattern: /^(\s*)light\s+"([^"]+)"\s*\{/m, kind: 'light' },
      { pattern: /^(\s*)point_light\s+"([^"]+)"[^{]*\{/m, kind: 'light' },
      { pattern: /^(\s*)spot_light\s+"([^"]+)"[^{]*\{/m, kind: 'light' },
      { pattern: /^(\s*)directional_light\s+"([^"]+)"[^{]*\{/m, kind: 'light' },
      { pattern: /^(\s*)effects\s*\{/m, kind: 'effects' },
      { pattern: /^(\s*)camera\s+"([^"]+)"\s*\{/m, kind: 'camera' },
      { pattern: /^(\s*)timeline\s+"([^"]+)"\s*\{/m, kind: 'timeline' },
      { pattern: /^(\s*)audio\s+"([^"]+)"\s*\{/m, kind: 'audio' },
      { pattern: /^(\s*)zone\s+"([^"]+)"\s*\{/m, kind: 'zone' },
      { pattern: /^(\s*)ui\s*\{/m, kind: 'ui' },
      { pattern: /^(\s*)npc\s+"([^"]+)"\s*\{/m, kind: 'npc' },
      { pattern: /^(\s*)quest\s+"([^"]+)"\s*\{/m, kind: 'quest' },
      { pattern: /^(\s*)ability\s+"([^"]+)"\s*\{/m, kind: 'ability' },
      { pattern: /^(\s*)dialogue\s+"([^"]+)"\s*\{/m, kind: 'dialogue' },
      { pattern: /^(\s*)state_machine\s+"([^"]+)"\s*\{/m, kind: 'state_machine' },
      {
        pattern: /^(\s*)spatial_group\s+"([^"]+)"\s*\{/m,
        kind: 'spatial_group',
      },
      { pattern: /^(\s*)logic\s*\{/m, kind: 'logic' },
      { pattern: /^(\s*)trait\s+(\w+)[^{]*\{/m, kind: 'trait' },
      { pattern: /^(\s*)data_source\s+"([^"]+)"\s*\{/m, kind: 'data_source' },
    ];

    // Find all block starts with their line numbers
    const blockStarts: Array<{
      kind: SegmentKind;
      name: string;
      lineIndex: number;
      indent: number;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, kind } of blockPatterns) {
        const match = pattern.exec(line);
        if (match) {
          const indent = (match[1] ?? '').length;
          const name = match[2] ?? kind;
          blockStarts.push({ kind, name, lineIndex: i, indent });
          break; // Only match one pattern per line
        }
      }
    }

    // For each block start, find matching closing brace
    for (const block of blockStarts) {
      const endLine = this.findMatchingBrace(lines, block.lineIndex);
      if (endLine >= 0) {
        const segmentLines = lines.slice(block.lineIndex, endLine + 1);
        segments.push({
          kind: block.kind,
          name: block.name,
          source: segmentLines.join('\n'),
          startLine: block.lineIndex + 1,
          endLine: endLine + 1,
          depth: block.indent > 0 ? 1 : 0,
        });
      }
    }

    // Also extract import lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*import\s+/.test(line)) {
        segments.push({
          kind: 'import',
          name: 'import',
          source: line,
          startLine: i + 1,
          endLine: i + 1,
          depth: 0,
        });
      }
    }

    return segments;
  }

  // ---------------------------------------------------------------------------
  // DPO PAIR GENERATION
  // ---------------------------------------------------------------------------

  /**
   * Generate DPO pairs for a single segment by applying degradation strategies.
   */
  generatePairsForSegment(segment: ASTSegment, fullSource: string, sourceFile?: string): DPOPair[] {
    const strategies = this.selectStrategies(segment);
    const pairs: DPOPair[] = [];
    const timestamp = new Date().toISOString();

    // Limit to configured range
    const selectedStrategies = strategies.slice(0, this.config.maxPairsPerSegment);

    for (const strategy of selectedStrategies) {
      const rejected = this.applyDegradation(segment.source, strategy, segment.kind);

      // Skip if degradation produced the same text (no-op)
      if (rejected === segment.source) {
        continue;
      }

      // Build prompt with context
      const prompt = this.buildPrompt(segment, fullSource);

      // Quality validation via re-parse
      let qualityScore = 0.5; // default
      let chosenValid = true;
      let rejectedInvalid = true;

      if (this.config.validatePairs) {
        const validation = this.validatePair(segment.source, rejected, fullSource);
        chosenValid = validation.chosenValid;
        rejectedInvalid = validation.rejectedInvalid;
        qualityScore = validation.qualityScore;
      }

      pairs.push({
        prompt,
        chosen: segment.source,
        rejected,
        metadata: {
          sourceFile,
          segmentKind: segment.kind,
          segmentName: segment.name,
          degradationStrategy: strategy,
          chosenValid,
          rejectedInvalid,
          qualityScore,
          timestamp,
        },
      });
    }

    // Ensure we meet minimum pairs if we have at least one
    // by applying additional strategies if needed
    if (pairs.length < this.config.minPairsPerSegment && pairs.length > 0) {
      // Try remaining strategies
      for (const strategy of strategies.slice(selectedStrategies.length)) {
        if (pairs.length >= this.config.minPairsPerSegment) break;

        const rejected = this.applyDegradation(segment.source, strategy, segment.kind);
        if (rejected === segment.source) continue;

        const prompt = this.buildPrompt(segment, fullSource);
        let qualityScore = 0.5;
        let chosenValid = true;
        let rejectedInvalid = true;

        if (this.config.validatePairs) {
          const validation = this.validatePair(segment.source, rejected, fullSource);
          chosenValid = validation.chosenValid;
          rejectedInvalid = validation.rejectedInvalid;
          qualityScore = validation.qualityScore;
        }

        pairs.push({
          prompt,
          chosen: segment.source,
          rejected,
          metadata: {
            sourceFile,
            segmentKind: segment.kind,
            segmentName: segment.name,
            degradationStrategy: strategy,
            chosenValid,
            rejectedInvalid,
            qualityScore,
            timestamp,
          },
        });
      }
    }

    return pairs;
  }

  // ---------------------------------------------------------------------------
  // DEGRADATION STRATEGIES
  // ---------------------------------------------------------------------------

  /**
   * Select which degradation strategies apply to a given segment type.
   * Different segment kinds are susceptible to different error patterns.
   */
  selectStrategies(segment: ASTSegment): DegradationStrategy[] {
    const common: DegradationStrategy[] = [
      'remove_closing_brace',
      'corrupt_property_value',
      'remove_colon_separator',
      'break_string_literal',
    ];

    const kindSpecific: Record<SegmentKind, DegradationStrategy[]> = {
      composition: ['remove_closing_brace', 'duplicate_block_name'],
      environment: ['corrupt_property_value', 'remove_colon_separator'],
      state: ['corrupt_property_value', 'remove_colon_separator'],
      template: ['remove_closing_brace', 'invalid_trait_name', 'remove_trait_arguments'],
      object: [
        'remove_closing_brace',
        'invalid_trait_name',
        'remove_trait_arguments',
        'swap_object_type',
        'remove_required_property',
      ],
      material: [
        'break_material_syntax',
        'corrupt_property_value',
        'remove_colon_separator',
        'remove_closing_brace',
      ],
      trait: ['invalid_trait_name', 'remove_trait_arguments', 'remove_closing_brace'],
      animation: ['break_animation_syntax', 'corrupt_property_value'],
      logic: ['remove_closing_brace', 'invalid_nesting', 'corrupt_property_value'],
      light: ['corrupt_property_value', 'remove_colon_separator'],
      effects: ['corrupt_property_value', 'remove_closing_brace'],
      camera: ['corrupt_property_value', 'remove_colon_separator'],
      timeline: ['break_animation_syntax', 'corrupt_property_value', 'remove_closing_brace'],
      audio: ['corrupt_property_value', 'remove_colon_separator'],
      zone: ['corrupt_property_value', 'remove_closing_brace'],
      ui: ['remove_closing_brace', 'corrupt_property_value'],
      npc: ['remove_closing_brace', 'invalid_trait_name', 'corrupt_property_value'],
      quest: ['remove_closing_brace', 'corrupt_property_value', 'remove_required_property'],
      ability: ['corrupt_property_value', 'remove_closing_brace', 'remove_required_property'],
      dialogue: ['break_string_literal', 'remove_closing_brace'],
      state_machine: ['remove_closing_brace', 'invalid_nesting', 'corrupt_property_value'],
      spatial_group: ['remove_closing_brace', 'invalid_nesting', 'remove_required_property'],
      domain_block: ['remove_closing_brace', 'corrupt_property_value', 'invalid_trait_name'],
      data_source: ['corrupt_property_value', 'remove_colon_separator', 'remove_closing_brace'],
      import: ['break_string_literal', 'corrupt_property_value'],
    };

    // Merge common + kind-specific, deduplicate
    const specific = kindSpecific[segment.kind] ?? [];
    const merged = [...new Set([...specific, ...common])];
    return merged;
  }

  /**
   * Apply a single degradation strategy to source text.
   * Returns the degraded source, or the original if the strategy
   * doesn't apply (caller should skip these).
   */
  applyDegradation(source: string, strategy: DegradationStrategy, _kind: SegmentKind): string {
    switch (strategy) {
      case 'remove_closing_brace':
        return this.degradeRemoveClosingBrace(source);

      case 'remove_closing_bracket':
        return this.degradeRemoveClosingBracket(source);

      case 'remove_trait_arguments':
        return this.degradeRemoveTraitArguments(source);

      case 'break_material_syntax':
        return this.degradeBreakMaterialSyntax(source);

      case 'invalid_trait_name':
        return this.degradeInvalidTraitName(source);

      case 'swap_object_type':
        return this.degradeSwapObjectType(source);

      case 'remove_permissions':
        return this.degradeRemovePermissions(source);

      case 'break_animation_syntax':
        return this.degradeBreakAnimationSyntax(source);

      case 'corrupt_property_value':
        return this.degradeCorruptPropertyValue(source);

      case 'remove_colon_separator':
        return this.degradeRemoveColonSeparator(source);

      case 'invalid_nesting':
        return this.degradeInvalidNesting(source);

      case 'remove_required_property':
        return this.degradeRemoveRequiredProperty(source);

      case 'duplicate_block_name':
        return this.degradeDuplicateBlockName(source);

      case 'break_string_literal':
        return this.degradeBreakStringLiteral(source);

      default:
        return source;
    }
  }

  // ---------------------------------------------------------------------------
  // INDIVIDUAL DEGRADATION FUNCTIONS
  // ---------------------------------------------------------------------------

  /** Remove the last closing brace, creating an unterminated block */
  private degradeRemoveClosingBrace(source: string): string {
    const lastBrace = source.lastIndexOf('}');
    if (lastBrace < 0) return source;
    return source.slice(0, lastBrace) + source.slice(lastBrace + 1);
  }

  /** Remove the last closing bracket, breaking array syntax */
  private degradeRemoveClosingBracket(source: string): string {
    const lastBracket = source.lastIndexOf(']');
    if (lastBracket < 0) return source;
    return source.slice(0, lastBracket) + source.slice(lastBracket + 1);
  }

  /** Remove @trait decorators, leaving object without required traits */
  private degradeRemoveTraitArguments(source: string): string {
    // Remove all @trait lines
    const lines = source.split('\n');
    const filtered = lines.filter((line) => !/^\s*@\w+/.test(line));
    if (filtered.length === lines.length) return source; // no traits to remove
    return filtered.join('\n');
  }

  /** Break material property syntax (remove value from a key-value pair) */
  private degradeBreakMaterialSyntax(source: string): string {
    const lines = source.split('\n');
    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      // Match property lines like "roughness: 0.3" or "baseColor: #ffffff"
      const match = /^(\s+\w+):\s*.+$/.exec(lines[i]);
      if (match && !modified) {
        // Remove the value, leaving just "roughness:"
        lines[i] = match[1] + ':';
        modified = true;
        break;
      }
    }

    return modified ? lines.join('\n') : source;
  }

  /** Replace valid @trait with invalid ones */
  private degradeInvalidTraitName(source: string): string {
    const invalidTraits = [
      '@flibbable',
      '@zorkified',
      '@quantum_entangled',
      '@non_euclidean',
      '@hyperboloid',
    ];

    const traitPattern = /@(\w+)/g;
    let match: RegExpExecArray | null;
    let result = source;
    let count = 0;

    // Reset lastIndex
    traitPattern.lastIndex = 0;

    while ((match = traitPattern.exec(source)) !== null && count < 2) {
      const originalTrait = match[0];
      const invalidTrait = invalidTraits[count % invalidTraits.length];
      result = result.replace(originalTrait, invalidTrait);
      count++;
    }

    return count > 0 ? result : source;
  }

  /** Swap geometry/object types with incompatible ones */
  private degradeSwapObjectType(source: string): string {
    const swaps: Record<string, string> = {
      sphere: 'nonexistent_shape',
      cube: 'invalid_mesh',
      cylinder: '???',
      plane: '(broken)',
      torus: 'geometry_404',
    };

    let result = source;
    for (const [valid, invalid] of Object.entries(swaps)) {
      const pattern = new RegExp(`geometry:\\s*"${valid}"`, 'g');
      if (pattern.test(result)) {
        result = result.replace(pattern, `geometry: "${invalid}"`);
        return result; // Only swap one
      }
    }

    return source; // No geometry found to swap
  }

  /** Remove permissions block */
  private degradeRemovePermissions(source: string): string {
    // Remove lines containing "permissions" blocks
    const lines = source.split('\n');
    let inPermissions = false;
    let braceDepth = 0;
    const filtered: string[] = [];

    for (const line of lines) {
      if (/permissions\s*\{/.test(line)) {
        inPermissions = true;
        braceDepth = 1;
        continue;
      }
      if (inPermissions) {
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }
        if (braceDepth <= 0) {
          inPermissions = false;
        }
        continue;
      }
      filtered.push(line);
    }

    return filtered.length < lines.length ? filtered.join('\n') : source;
  }

  /** Break animation-related syntax */
  private degradeBreakAnimationSyntax(source: string): string {
    // Corrupt animate property values or timing
    const lines = source.split('\n');
    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      if (/animate|animation|keyframe|duration|delay/i.test(lines[i])) {
        // Replace numeric values with invalid text
        lines[i] = lines[i].replace(/:\s*(\d+(?:\.\d+)?)/, ': not_a_number');
        if (lines[i] !== source.split('\n')[i]) {
          modified = true;
          break;
        }
      }
    }

    return modified ? lines.join('\n') : source;
  }

  /** Corrupt a property value to an invalid type */
  private degradeCorruptPropertyValue(source: string): string {
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Find property assignment: key: value
      const match = /^(\s+\w+:\s*)(.+)$/.exec(lines[i]);
      if (match) {
        const prefix = match[1];
        const value = match[2].trim();

        // Corrupt based on value type
        if (/^\d/.test(value)) {
          // Number -> invalid string without quotes
          lines[i] = prefix + 'INVALID_@@_VALUE';
          return lines.join('\n');
        } else if (/^"/.test(value)) {
          // String -> unterminated
          lines[i] = prefix + '"unterminated string value';
          return lines.join('\n');
        } else if (/^\[/.test(value)) {
          // Array -> broken array
          lines[i] = prefix + '[, , ,]';
          return lines.join('\n');
        } else if (/^(true|false)/.test(value)) {
          // Boolean -> invalid value
          lines[i] = prefix + 'maybe_true_ish';
          return lines.join('\n');
        } else if (/^#[0-9a-fA-F]/.test(value)) {
          // Color -> invalid color
          lines[i] = prefix + '#GGHHZZ';
          return lines.join('\n');
        }
      }
    }

    return source; // No suitable property found
  }

  /** Remove the colon separator from a property assignment */
  private degradeRemoveColonSeparator(source: string): string {
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      // Find "key: value" patterns
      const match = /^(\s+)(\w+)(:\s*)(.+)$/.exec(lines[i]);
      if (match) {
        // Remove the colon, producing "key value" which is invalid
        lines[i] = match[1] + match[2] + ' ' + match[4];
        return lines.join('\n');
      }
    }

    return source;
  }

  /** Create invalid nesting (move a block inside itself) */
  private degradeInvalidNesting(source: string): string {
    const lines = source.split('\n');
    if (lines.length < 3) return source;

    // Insert a random block opener inside the middle of existing block
    const midpoint = Math.floor(lines.length / 2);
    const invalidBlock = '    invalid_nested_block { broken: true }';
    lines.splice(midpoint, 0, invalidBlock);
    return lines.join('\n');
  }

  /** Remove a property line (simulating missing required property) */
  private degradeRemoveRequiredProperty(source: string): string {
    const lines = source.split('\n');
    // Find the first property-like line (key: value) and remove it
    for (let i = 0; i < lines.length; i++) {
      if (
        /^\s+\w+:\s*.+$/.test(lines[i]) &&
        !/^\s*(composition|object|template|environment|state)/.test(lines[i])
      ) {
        lines.splice(i, 1);
        return lines.join('\n');
      }
    }
    return source;
  }

  /** Duplicate a block name (causing name collision) */
  private degradeDuplicateBlockName(source: string): string {
    const lines = source.split('\n');
    // Find a named block and duplicate it at the end
    for (const line of lines) {
      const match = /^(\s*)(object|template|material)\s+"([^"]+)"/.exec(line);
      if (match) {
        const duplicate = `  object "${match[3]}" {\n    geometry: "cube"\n  }`;
        return source + '\n' + duplicate;
      }
    }
    return source;
  }

  /** Break a string literal by removing closing quote */
  private degradeBreakStringLiteral(source: string): string {
    // Find the first string literal and remove its closing quote
    const match = /"([^"]+)"/;
    const found = match.exec(source);
    if (found) {
      const idx = source.indexOf(found[0]);
      // Remove the closing quote
      const broken = source.slice(0, idx) + '"' + found[1] + source.slice(idx + found[0].length);
      return broken;
    }
    return source;
  }

  // ---------------------------------------------------------------------------
  // PROMPT GENERATION
  // ---------------------------------------------------------------------------

  /**
   * Build a training prompt for a segment.
   */
  private buildPrompt(segment: ASTSegment, fullSource: string): string {
    const kindLabel = segment.kind.replace(/_/g, ' ');

    if (this.config.includeContext) {
      // Include surrounding context (3 lines before and after)
      const lines = fullSource.split('\n');
      const ctxStart = Math.max(0, segment.startLine - 4); // -1 for 0-index, -3 for context
      const ctxEnd = Math.min(lines.length, segment.endLine + 3);
      const context = lines.slice(ctxStart, segment.startLine - 1).join('\n');

      if (context.trim()) {
        return (
          `Write the correct HoloScript ${kindLabel} block named "${segment.name}". ` +
          `The block appears after the following context:\n\n${context}\n\n` +
          `Generate the complete, syntactically valid ${kindLabel} block.`
        );
      }
    }

    return (
      `Write a syntactically correct HoloScript ${kindLabel} block named "${segment.name}". ` +
      `The block should follow HoloScript .holo composition syntax with proper ` +
      `property declarations, trait decorators, and brace matching.`
    );
  }

  // ---------------------------------------------------------------------------
  // QUALITY VALIDATION
  // ---------------------------------------------------------------------------

  /**
   * Validate a DPO pair by re-parsing chosen and rejected through the parser.
   * A high-quality pair has: chosen parses cleanly, rejected fails to parse.
   */
  private validatePair(
    chosen: string,
    rejected: string,
    _fullSource: string
  ): { chosenValid: boolean; rejectedInvalid: boolean; qualityScore: number } {
    // Wrap in minimal composition if not already a composition
    const wrapInComposition = (code: string): string => {
      if (/composition\s+"/.test(code)) return code;
      return `composition "DPO_Validation" {\n${code}\n}`;
    };

    const chosenWrapped = wrapInComposition(chosen);
    const rejectedWrapped = wrapInComposition(rejected);

    let chosenValid = false;
    let rejectedInvalid = false;

    try {
      const chosenResult = this.parser.parse(chosenWrapped);
      chosenValid = chosenResult.success || chosenResult.errors.length === 0;
    } catch {
      chosenValid = false;
    }

    try {
      const rejectedResult = this.parser.parse(rejectedWrapped);
      // We WANT the rejected to fail (have errors)
      rejectedInvalid = !rejectedResult.success || rejectedResult.errors.length > 0;
    } catch {
      // Parse threw an exception = definitely invalid, which is good
      rejectedInvalid = true;
    }

    // Quality scoring:
    // 1.0 = chosen valid AND rejected invalid (perfect pair)
    // 0.75 = chosen valid, rejected status unknown
    // 0.5 = both parse or both fail (mediocre)
    // 0.25 = chosen invalid (bad pair)
    let qualityScore = 0.5;
    if (chosenValid && rejectedInvalid) {
      qualityScore = 1.0;
    } else if (chosenValid && !rejectedInvalid) {
      qualityScore = 0.6; // chosen good, but rejected also parsed (subtle error)
    } else if (!chosenValid && rejectedInvalid) {
      qualityScore = 0.3; // chosen also has issues
    } else {
      qualityScore = 0.25; // both invalid
    }

    return { chosenValid, rejectedInvalid, qualityScore };
  }

  // ---------------------------------------------------------------------------
  // UTILITY
  // ---------------------------------------------------------------------------

  /**
   * Find the line index of the matching closing brace for a block
   * that starts at the given line index.
   */
  private findMatchingBrace(lines: string[], startLineIndex: number): number {
    let depth = 0;
    let foundOpen = false;

    for (let i = startLineIndex; i < lines.length; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') {
          depth++;
          foundOpen = true;
        } else if (ch === '}') {
          depth--;
          if (foundOpen && depth === 0) {
            return i;
          }
        }
      }
    }

    return -1; // No matching brace found
  }
}
