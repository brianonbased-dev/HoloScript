/**
 * Knowledge Extractor
 *
 * Analyzes a CodebaseGraph to automatically extract W/P/G (Wisdom, Pattern, Gotcha)
 * knowledge entries. This is the core value of the absorb-to-marketplace pipeline:
 * any absorbed codebase becomes publishable knowledge.
 *
 * Extraction heuristics:
 *
 * - **Patterns (P):** Adapter/factory/strategy patterns detected via naming + structure,
 *   repeated module shapes across communities, barrel file patterns, test colocation.
 * - **Gotchas (G):** High fan-in symbols (fragile), circular imports, dead code,
 *   large files, deep call chains, files with no tests, mixed concerns.
 * - **Wisdom (W):** Architectural community structure, language boundaries,
 *   import depth distribution, coupling metrics, key hub files.
 *
 * @version 1.0.0
 */

import type { CodebaseGraph, CodebaseGraphStats } from './CodebaseGraph';
import type { ExternalSymbolDefinition, CallEdge, ImportEdge, ScannedFile } from './types';

// =============================================================================
// TYPES
// =============================================================================

export interface KnowledgeEntry {
  /** Auto-generated ID: W.AUTO.001, P.AUTO.001, G.AUTO.001 */
  id: string;
  /** wisdom | pattern | gotcha */
  type: 'wisdom' | 'pattern' | 'gotcha';
  /** Human-readable content */
  content: string;
  /** Confidence score 0.0-1.0 */
  confidence: number;
  /** Extraction source metadata */
  metadata: {
    extractor: string;
    files?: string[];
    symbols?: string[];
    community?: string;
    metric?: string;
    value?: number;
  };
}

export interface ExtractionResult {
  entries: KnowledgeEntry[];
  stats: {
    totalExtracted: number;
    byType: Record<string, number>;
    durationMs: number;
  };
}

export interface ExtractionOptions {
  /** Minimum confidence threshold (default: 0.5) */
  minConfidence?: number;
  /** Maximum entries per type (default: 20) */
  maxPerType?: number;
  /** Include low-confidence speculative entries (default: false) */
  includeSpeculative?: boolean;
  /** Project/workspace name for entry IDs */
  workspaceId?: string;
}

// =============================================================================
// THRESHOLDS
// =============================================================================

/** Files with more importers than this are "hub" files */
const HUB_FAN_IN_THRESHOLD = 8;
/** Symbols called by more callers than this are fragile */
const FRAGILE_CALLERS_THRESHOLD = 10;
/** Files above this LOC are "large" */
const LARGE_FILE_LOC = 300;
/** Call chain depth above this is suspicious */
const DEEP_CHAIN_THRESHOLD = 6;
/** Files in a community above this count mean a large module */
const LARGE_COMMUNITY_THRESHOLD = 15;

// =============================================================================
// KNOWLEDGE EXTRACTOR
// =============================================================================

export class KnowledgeExtractor {
  private wisdomCount = 0;
  private patternCount = 0;
  private gotchaCount = 0;

  /**
   * Extract W/P/G knowledge entries from an analyzed CodebaseGraph.
   */
  extract(graph: CodebaseGraph, options: ExtractionOptions = {}): ExtractionResult {
    const start = Date.now();
    const minConfidence = options.minConfidence ?? 0.5;
    const maxPerType = options.maxPerType ?? 20;
    const ws = options.workspaceId ?? 'auto';

    this.wisdomCount = 0;
    this.patternCount = 0;
    this.gotchaCount = 0;

    const allEntries: KnowledgeEntry[] = [];

    // Run all extractors
    allEntries.push(...this.extractArchitecturalWisdom(graph, ws));
    allEntries.push(...this.extractCommunityPatterns(graph, ws));
    allEntries.push(...this.extractCodePatterns(graph, ws));
    allEntries.push(...this.extractGotchas(graph, ws));
    allEntries.push(...this.extractHubWisdom(graph, ws));

    // Filter by confidence
    let filtered = allEntries.filter((e) => e.confidence >= minConfidence);
    if (!options.includeSpeculative) {
      filtered = filtered.filter((e) => e.confidence >= 0.5);
    }

    // Sort by confidence descending, then cap per type
    filtered.sort((a, b) => b.confidence - a.confidence);

    const byType: Record<string, KnowledgeEntry[]> = { wisdom: [], pattern: [], gotcha: [] };
    for (const entry of filtered) {
      if ((byType[entry.type]?.length ?? 0) < maxPerType) {
        byType[entry.type] = byType[entry.type] || [];
        byType[entry.type].push(entry);
      }
    }

    const entries = [...byType.wisdom, ...byType.pattern, ...byType.gotcha];

    return {
      entries,
      stats: {
        totalExtracted: entries.length,
        byType: {
          wisdom: byType.wisdom.length,
          pattern: byType.pattern.length,
          gotcha: byType.gotcha.length,
        },
        durationMs: Date.now() - start,
      },
    };
  }

  // ── Architectural Wisdom ──────────────────────────────────────────────────

  private extractArchitecturalWisdom(graph: CodebaseGraph, ws: string): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = [];
    const stats = graph.getStats();

    // W: Language distribution insight
    const languages = Object.entries(stats.filesByLanguage)
      .sort((a, b) => b[1] - a[1]);
    if (languages.length > 1) {
      const primary = languages[0];
      const secondary = languages.slice(1);
      const secondaryStr = secondary.map(([l, c]) => `${l} (${c})`).join(', ');
      entries.push({
        id: this.nextId('W', ws),
        type: 'wisdom',
        content: `Polyglot codebase: primary language is ${primary[0]} (${primary[1]} files), with secondary: ${secondaryStr}. Cross-language boundaries at community edges may need explicit interface contracts.`,
        confidence: 0.8,
        metadata: {
          extractor: 'architectural-wisdom',
          metric: 'language-distribution',
          value: languages.length,
        },
      });
    } else if (languages.length === 1) {
      entries.push({
        id: this.nextId('W', ws),
        type: 'wisdom',
        content: `Monoglot codebase: ${languages[0][0]} only (${languages[0][1]} files). Uniform tooling and consistent patterns expected.`,
        confidence: 0.7,
        metadata: {
          extractor: 'architectural-wisdom',
          metric: 'language-distribution',
          value: 1,
        },
      });
    }

    // W: Scale insight
    if (stats.totalFiles > 0) {
      const avgLoc = Math.round(stats.totalLoc / stats.totalFiles);
      const symbolDensity = stats.totalFiles > 0
        ? (stats.totalSymbols / stats.totalFiles).toFixed(1)
        : '0';
      entries.push({
        id: this.nextId('W', ws),
        type: 'wisdom',
        content: `Codebase scale: ${stats.totalFiles} files, ${stats.totalLoc.toLocaleString()} LOC, ${stats.totalSymbols} symbols. Average file: ${avgLoc} LOC, ${symbolDensity} symbols/file. Import graph has ${stats.totalImports} edges, call graph has ${stats.totalCalls} edges.`,
        confidence: 0.9,
        metadata: {
          extractor: 'architectural-wisdom',
          metric: 'scale',
          value: stats.totalFiles,
        },
      });
    }

    // W: Symbol type distribution
    const symbolTypes = Object.entries(stats.symbolsByType)
      .sort((a, b) => b[1] - a[1]);
    if (symbolTypes.length > 0) {
      const dominant = symbolTypes[0];
      const ratio = stats.totalSymbols > 0
        ? ((dominant[1] / stats.totalSymbols) * 100).toFixed(0)
        : '0';
      entries.push({
        id: this.nextId('W', ws),
        type: 'wisdom',
        content: `Dominant symbol type: ${dominant[0]} (${dominant[1]}, ${ratio}% of symbols). ${symbolTypes.length > 3 ? 'Rich type variety suggests well-structured domain model.' : 'Limited type variety — may be procedural or data-heavy.'}`,
        confidence: 0.7,
        metadata: {
          extractor: 'architectural-wisdom',
          metric: 'symbol-types',
          value: symbolTypes.length,
        },
      });
    }

    return entries;
  }

  // ── Community Patterns ────────────────────────────────────────────────────

  private extractCommunityPatterns(graph: CodebaseGraph, ws: string): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = [];
    const communities = graph.detectCommunities();

    if (communities.size === 0) return entries;

    // P: Module boundary pattern
    const commSizes = Array.from(communities.entries())
      .map(([name, files]) => ({ name, count: files.length }))
      .sort((a, b) => b.count - a.count);

    entries.push({
      id: this.nextId('P', ws),
      type: 'pattern',
      content: `${communities.size} detected module communities: ${commSizes.slice(0, 5).map((c) => `${c.name} (${c.count} files)`).join(', ')}${commSizes.length > 5 ? ` and ${commSizes.length - 5} more` : ''}. Community boundaries indicate natural module splits.`,
      confidence: 0.8,
      metadata: {
        extractor: 'community-patterns',
        metric: 'community-count',
        value: communities.size,
      },
    });

    // G: Oversized communities
    const large = commSizes.filter((c) => c.count > LARGE_COMMUNITY_THRESHOLD);
    for (const comm of large.slice(0, 3)) {
      entries.push({
        id: this.nextId('G', ws),
        type: 'gotcha',
        content: `Community "${comm.name}" has ${comm.count} files — consider splitting. Large communities often indicate hidden sub-modules with different change velocities.`,
        confidence: 0.7,
        metadata: {
          extractor: 'community-patterns',
          community: comm.name,
          metric: 'community-size',
          value: comm.count,
        },
      });
    }

    // P: Balanced vs skewed distribution
    if (commSizes.length >= 2) {
      const largest = commSizes[0].count;
      const smallest = commSizes[commSizes.length - 1].count;
      const ratio = smallest > 0 ? largest / smallest : Infinity;
      if (ratio > 5) {
        entries.push({
          id: this.nextId('P', ws),
          type: 'pattern',
          content: `Skewed module distribution: largest community (${commSizes[0].name}) is ${ratio.toFixed(1)}x bigger than smallest (${commSizes[commSizes.length - 1].name}). May indicate a "God module" that should be decomposed.`,
          confidence: 0.65,
          metadata: {
            extractor: 'community-patterns',
            metric: 'size-ratio',
            value: ratio,
          },
        });
      }
    }

    return entries;
  }

  // ── Code Patterns ─────────────────────────────────────────────────────────

  private extractCodePatterns(graph: CodebaseGraph, ws: string): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = [];
    const allSymbols = graph.getAllSymbols();
    const filePaths = graph.getFilePaths();

    // P: Adapter/Strategy/Factory naming patterns
    const adapterSymbols = allSymbols.filter((s) =>
      /adapter|strategy|factory|provider|handler|middleware|interceptor|decorator/i.test(s.name)
    );
    if (adapterSymbols.length >= 2) {
      const patterns = this.groupByPatternSuffix(adapterSymbols);
      for (const [suffix, symbols] of patterns) {
        if (symbols.length >= 2) {
          entries.push({
            id: this.nextId('P', ws),
            type: 'pattern',
            content: `${suffix} pattern detected: ${symbols.length} implementations (${symbols.slice(0, 4).map((s) => s.name).join(', ')}${symbols.length > 4 ? '...' : ''}). Consistent naming suggests a well-established abstraction.`,
            confidence: 0.75,
            metadata: {
              extractor: 'code-patterns',
              symbols: symbols.slice(0, 10).map((s) => s.name),
              metric: `${suffix.toLowerCase()}-count`,
              value: symbols.length,
            },
          });
        }
      }
    }

    // P: Barrel/index file pattern
    const barrelFiles = filePaths.filter((p) => /\/index\.(ts|js|tsx|jsx)$/.test(p));
    if (barrelFiles.length >= 3) {
      const totalFiles = filePaths.length;
      const barrelRatio = ((barrelFiles.length / totalFiles) * 100).toFixed(1);
      entries.push({
        id: this.nextId('P', ws),
        type: 'pattern',
        content: `Barrel export pattern: ${barrelFiles.length} index files (${barrelRatio}% of codebase). This codebase re-exports through barrel files for clean public APIs.`,
        confidence: 0.8,
        metadata: {
          extractor: 'code-patterns',
          files: barrelFiles.slice(0, 10),
          metric: 'barrel-count',
          value: barrelFiles.length,
        },
      });
    }

    // P: Test colocation
    const testFiles = filePaths.filter((p) => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(p));
    const testDirs = filePaths.filter((p) => /__tests__\//.test(p));
    if (testFiles.length > 0 || testDirs.length > 0) {
      const colocated = testFiles.filter((t) => {
        const dir = t.replace(/[^/]+$/, '');
        return filePaths.some((f) => f !== t && f.startsWith(dir) && !/(test|spec)/.test(f));
      });
      const style = testDirs.length > colocated.length
        ? `__tests__/ directories (${testDirs.length})`
        : `colocated test files (${colocated.length})`;
      entries.push({
        id: this.nextId('P', ws),
        type: 'pattern',
        content: `Test organization: primarily ${style}. Total test files: ${testFiles.length + testDirs.length}.`,
        confidence: 0.7,
        metadata: {
          extractor: 'code-patterns',
          metric: 'test-files',
          value: testFiles.length + testDirs.length,
        },
      });
    }

    return entries;
  }

  // ── Gotchas ───────────────────────────────────────────────────────────────

  private extractGotchas(graph: CodebaseGraph, ws: string): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = [];
    const filePaths = graph.getFilePaths();
    const allSymbols = graph.getAllSymbols();

    // G: High fan-in files (fragile hubs)
    const fanInByFile: Map<string, number> = new Map();
    for (const filePath of filePaths) {
      const importers = graph.getImportedBy(filePath);
      fanInByFile.set(filePath, importers.length);
    }
    const highFanIn = Array.from(fanInByFile.entries())
      .filter(([_, count]) => count >= HUB_FAN_IN_THRESHOLD)
      .sort((a, b) => b[1] - a[1]);

    for (const [filePath, count] of highFanIn.slice(0, 5)) {
      const shortPath = this.shortenPath(filePath);
      entries.push({
        id: this.nextId('G', ws),
        type: 'gotcha',
        content: `High fan-in file: ${shortPath} is imported by ${count} files. Changes here have wide blast radius. Consider extracting stable interfaces or splitting responsibilities.`,
        confidence: 0.85,
        metadata: {
          extractor: 'gotchas',
          files: [filePath],
          metric: 'fan-in',
          value: count,
        },
      });
    }

    // G: Large files
    for (const filePath of filePaths) {
      const file = graph.getFile(filePath);
      if (file && file.loc > LARGE_FILE_LOC) {
        const symbols = graph.getSymbolsInFile(filePath);
        const shortPath = this.shortenPath(filePath);
        entries.push({
          id: this.nextId('G', ws),
          type: 'gotcha',
          content: `Large file: ${shortPath} has ${file.loc} LOC and ${symbols.length} symbols. Files this large often contain multiple concerns — look for natural split points at community/class boundaries.`,
          confidence: 0.6,
          metadata: {
            extractor: 'gotchas',
            files: [filePath],
            metric: 'loc',
            value: file.loc,
          },
        });
      }
    }
    // Cap large file gotchas
    const largeFileEntries = entries.filter(
      (e) => e.metadata.extractor === 'gotchas' && e.metadata.metric === 'loc'
    );
    if (largeFileEntries.length > 5) {
      const toRemove = new Set(largeFileEntries.slice(5).map((e) => e.id));
      const beforeCount = entries.length;
      entries.splice(0, entries.length, ...entries.filter((e) => !toRemove.has(e.id)));
    }

    // G: Fragile symbols (many callers)
    const callerCounts: Map<string, number> = new Map();
    for (const sym of allSymbols) {
      const callers = graph.getCallersOf(sym.name, sym.owner);
      if (callers.length >= FRAGILE_CALLERS_THRESHOLD) {
        callerCounts.set(sym.name, callers.length);
      }
    }
    const fragile = Array.from(callerCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [name, count] of fragile) {
      entries.push({
        id: this.nextId('G', ws),
        type: 'gotcha',
        content: `Fragile symbol: "${name}" is called by ${count} call sites. Changing its signature will break many callers. Wrap in a facade or add overloads for backward compat.`,
        confidence: 0.8,
        metadata: {
          extractor: 'gotchas',
          symbols: [name],
          metric: 'caller-count',
          value: count,
        },
      });
    }

    // G: Files with no test coverage signal
    const sourceFiles = filePaths.filter(
      (p) => !/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(p)
        && !/__tests__\//.test(p)
        && !/(node_modules|dist|build)\//.test(p)
    );
    const testFiles = new Set(
      filePaths.filter(
        (p) => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(p) || /__tests__\//.test(p)
      )
    );
    const untestedCandidates = sourceFiles.filter((sf) => {
      // Check if there's a test file nearby
      const base = sf.replace(/\.(ts|js|tsx|jsx)$/, '');
      const testVariants = [
        `${base}.test.ts`, `${base}.spec.ts`,
        `${base}.test.js`, `${base}.spec.js`,
        sf.replace(/\/([^/]+)\.(ts|js)/, '/__tests__/$1.test.ts'),
        sf.replace(/\/([^/]+)\.(ts|js)/, '/__tests__/$1.test.js'),
      ];
      return !testVariants.some((tv) => testFiles.has(tv));
    });

    if (untestedCandidates.length > 0 && sourceFiles.length > 0) {
      const coverageGap = ((untestedCandidates.length / sourceFiles.length) * 100).toFixed(0);
      entries.push({
        id: this.nextId('G', ws),
        type: 'gotcha',
        content: `Test coverage gap: ${untestedCandidates.length} of ${sourceFiles.length} source files (${coverageGap}%) have no adjacent test file. Top untested: ${untestedCandidates.slice(0, 3).map((f) => this.shortenPath(f)).join(', ')}.`,
        confidence: 0.6,
        metadata: {
          extractor: 'gotchas',
          files: untestedCandidates.slice(0, 10),
          metric: 'untested-files',
          value: untestedCandidates.length,
        },
      });
    }

    return entries;
  }

  // ── Hub Wisdom ────────────────────────────────────────────────────────────

  private extractHubWisdom(graph: CodebaseGraph, ws: string): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = [];
    const filePaths = graph.getFilePaths();

    // W: Identify architectural hub files
    const hubs: Array<{ path: string; fanIn: number; fanOut: number; score: number }> = [];
    for (const filePath of filePaths) {
      const fanIn = graph.getImportedBy(filePath).length;
      const fanOut = graph.getImportsOf(filePath).length;
      const score = fanIn + fanOut;
      if (score >= 5) {
        hubs.push({ path: filePath, fanIn, fanOut, score });
      }
    }
    hubs.sort((a, b) => b.score - a.score);

    if (hubs.length > 0) {
      const topHubs = hubs.slice(0, 5);
      entries.push({
        id: this.nextId('W', ws),
        type: 'wisdom',
        content: `Key architectural hub files: ${topHubs.map((h) => `${this.shortenPath(h.path)} (in:${h.fanIn} out:${h.fanOut})`).join(', ')}. These files are critical path — changes propagate widely. Stabilize their interfaces first.`,
        confidence: 0.85,
        metadata: {
          extractor: 'hub-wisdom',
          files: topHubs.map((h) => h.path),
          metric: 'hub-score',
          value: topHubs[0].score,
        },
      });
    }

    // W: Import depth distribution
    const depths: number[] = [];
    for (const filePath of filePaths) {
      const imports = graph.getImportsOf(filePath);
      depths.push(imports.length);
    }
    if (depths.length > 0) {
      depths.sort((a, b) => a - b);
      const median = depths[Math.floor(depths.length / 2)];
      const max = depths[depths.length - 1];
      const avg = (depths.reduce((s, d) => s + d, 0) / depths.length).toFixed(1);
      entries.push({
        id: this.nextId('W', ws),
        type: 'wisdom',
        content: `Import depth: avg ${avg}, median ${median}, max ${max} imports per file. ${max > 20 ? 'Some files have very deep dependency trees — consider dependency injection or facade patterns.' : 'Import depth is healthy.'}`,
        confidence: 0.7,
        metadata: {
          extractor: 'hub-wisdom',
          metric: 'import-depth-max',
          value: max,
        },
      });
    }

    return entries;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private nextId(prefix: string, ws: string): string {
    let count: number;
    switch (prefix) {
      case 'W': count = ++this.wisdomCount; break;
      case 'P': count = ++this.patternCount; break;
      case 'G': count = ++this.gotchaCount; break;
      default: count = 0;
    }
    return `${prefix}.${ws}.${String(count).padStart(3, '0')}`;
  }

  private shortenPath(filePath: string): string {
    // Remove common prefixes, keep last 3 segments
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts.length > 3 ? `.../${parts.slice(-3).join('/')}` : parts.join('/');
  }

  private groupByPatternSuffix(
    symbols: ExternalSymbolDefinition[]
  ): Map<string, ExternalSymbolDefinition[]> {
    const groups: Map<string, ExternalSymbolDefinition[]> = new Map();
    const suffixes = ['Adapter', 'Strategy', 'Factory', 'Provider', 'Handler', 'Middleware', 'Interceptor', 'Decorator'];

    for (const sym of symbols) {
      for (const suffix of suffixes) {
        if (sym.name.endsWith(suffix) || sym.name.toLowerCase().includes(suffix.toLowerCase())) {
          if (!groups.has(suffix)) groups.set(suffix, []);
          groups.get(suffix)!.push(sym);
          break; // Only classify under first matching suffix
        }
      }
    }

    return groups;
  }
}
