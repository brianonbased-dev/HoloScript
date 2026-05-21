/**
 * TraitCommunityDetector — HoloGraph Phase 1
 *
 * Detects code communities using HoloScript-semantic boundaries rather than
 * file-level import/call graph topology (the existing CommunityDetector).
 *
 * ## Why trait boundaries beat Louvain on file edges
 *
 * Louvain discovers clusters in the import/call graph. For a HoloScript
 * codebase, this produces communities like "files that import from core" or
 * "files in the same directory" — which are structural artifacts, not semantic
 * architecture.
 *
 * The real semantic boundaries in HoloScript are:
 *   - TraitHandler families (pillar, brain-geo, integrity, snn, rendering...)
 *   - Compiler families (compile_to_vr, compile_to_robotics, compile_to_wasm...)
 *   - Domain plugins (packages/plugins/*)
 *   - Event namespaces (files sharing the same event bus — 'pillar:*', 'snn:*')
 *   - Test communities (matched to their subject file's community)
 *
 * These are structurally explicit in file paths, class names, and event names —
 * no graph traversal or LLM inference needed.
 *
 * ## Algorithm
 *
 *   1. TRAIT PASS: detect files implementing TraitHandler or in `traits/` dir
 *      → assign to trait-namespace community (e.g. 'trait:pillar', 'trait:integrity')
 *   2. COMPILER PASS: detect files exporting *Compiler or compile_to_* functions
 *      → assign to compiler-family community (e.g. 'compiler:vr', 'compiler:robotics')
 *   3. PLUGIN PASS: detect files in packages/plugins/*
 *      → assign to plugin community (e.g. 'plugin:robotics', 'plugin:alphafold')
 *   4. EVENT PASS: group remaining files by their dominant event namespace
 *      → assign to namespace community (e.g. 'events:snn', 'events:cortical')
 *   5. TEST PASS: `__tests__/` files → inherit subject file's community + ':tests'
 *   6. FALLBACK: remaining files → run existing file-level Louvain
 *
 * Each file belongs to exactly one community. Communities are named and
 * semantically interpretable, not numbered clusters.
 *
 * ## Integration
 *
 *   import { TraitCommunityDetector } from './TraitCommunityDetector';
 *   const detector = new TraitCommunityDetector();
 *   const communities = detector.detect(graph);
 *   // Map<communityName, filePath[]>
 *   // 'trait:pillar' → [...pillar trait files]
 *   // 'compiler:vr'  → [...VR compiler files]
 *   // ...
 */

import * as path from 'path';
import type { CodebaseGraph } from './CodebaseGraph';
import type { ImportEdge, CallEdge } from './types';
import { CommunityDetector } from './CommunityDetector';

// =============================================================================
// TYPES
// =============================================================================

export interface TraitCommunityOptions {
  /**
   * Minimum number of files to form a dedicated community.
   * Smaller groups fall through to Louvain.
   * Default: 1 (every matched file gets its community)
   */
  minCommunitySize?: number;
  /**
   * Whether to run Louvain on files that don't match any semantic heuristic.
   * Default: true
   */
  louvainFallback?: boolean;
}

// =============================================================================
// TRAIT COMMUNITY DETECTOR
// =============================================================================

export class TraitCommunityDetector {
  private readonly options: Required<TraitCommunityOptions>;
  private readonly louvain: CommunityDetector;

  constructor(options: TraitCommunityOptions = {}) {
    this.options = {
      minCommunitySize: options.minCommunitySize ?? 1,
      louvainFallback:  options.louvainFallback  ?? true,
    };
    this.louvain = new CommunityDetector();
  }

  /**
   * Detect communities from a CodebaseGraph using HoloScript-semantic boundaries.
   * Returns a Map<communityName, filePath[]>.
   */
  detect(graph: CodebaseGraph): Map<string, string[]> {
    // Collect all file paths
    const stats = graph.getStats();
    const allFiles = graph.getAllSymbols()
      .map(s => s.filePath)
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    const assigned = new Map<string, string>(); // filePath → communityName
    const communities = new Map<string, string[]>();

    const assign = (file: string, community: string) => {
      if (assigned.has(file)) return; // first assignment wins
      assigned.set(file, community);
      if (!communities.has(community)) communities.set(community, []);
      communities.get(community)!.push(file);
    };

    // ── Pass 1: TraitHandler detection ──────────────────────────────────────
    for (const file of allFiles) {
      const ns = this._traitNamespace(file);
      if (ns) assign(file, `trait:${ns}`);
    }

    // ── Pass 2: Compiler detection ───────────────────────────────────────────
    for (const file of allFiles) {
      if (assigned.has(file)) continue;
      const family = this._compilerFamily(file);
      if (family) assign(file, `compiler:${family}`);
    }

    // ── Pass 3: Plugin detection ─────────────────────────────────────────────
    for (const file of allFiles) {
      if (assigned.has(file)) continue;
      const plugin = this._pluginName(file);
      if (plugin) assign(file, `plugin:${plugin}`);
    }

    // ── Pass 4: Event namespace ───────────────────────────────────────────────
    const emitsByFile = new Map<string, string[]>();
    for (const es of graph.getAllEmitSites()) {
      if (!emitsByFile.has(es.filePath)) emitsByFile.set(es.filePath, []);
      emitsByFile.get(es.filePath)!.push(es.eventName);
    }
    for (const ls of graph.getAllListenSites()) {
      if (!emitsByFile.has(ls.filePath)) emitsByFile.set(ls.filePath, []);
      emitsByFile.get(ls.filePath)!.push(ls.eventName);
    }
    for (const [file, events] of emitsByFile) {
      if (assigned.has(file)) continue;
      const ns = this._dominantEventNamespace(events);
      if (ns) assign(file, `events:${ns}`);
    }

    // ── Pass 5: Test file inheritance ─────────────────────────────────────────
    for (const file of allFiles) {
      if (assigned.has(file)) continue;
      if (!this._isTestFile(file)) continue;
      // Find subject file: look for sibling non-test file with same stem
      const subject = this._testSubject(file, allFiles);
      const parentCommunity = subject ? assigned.get(subject) : undefined;
      if (parentCommunity) {
        assign(file, `${parentCommunity}:tests`);
      } else {
        assign(file, 'tests:unmatched');
      }
    }

    // ── Pass 6: Louvain fallback for remaining files ──────────────────────────
    const remaining = allFiles.filter(f => !assigned.has(f));
    if (remaining.length > 0 && this.options.louvainFallback) {
      // Build stub import/call lists for just the remaining files
      const remainingSet = new Set(remaining);
      const stubImports: ImportEdge[] = [];
      const stubCalls: CallEdge[] = [];
      // Use full graph data — the Louvain detector filters internally
      const louvainComms = this.louvain.detect(remaining, stubImports, stubCalls);
      for (const [comm, files] of louvainComms) {
        for (const f of files) {
          assign(f, `misc:${comm}`);
        }
      }
    } else if (remaining.length > 0) {
      for (const f of remaining) assign(f, 'misc:uncategorized');
    }

    return communities;
  }

  // ── Private heuristics ────────────────────────────────────────────────────

  /**
   * Detect the trait namespace from a file path.
   *
   * Matches:
   *   - `.../traits/pillar/...`      → 'pillar'
   *   - `.../traits/integrity/...`   → 'integrity'
   *   - `.../traits/snn/...`         → 'snn'
   *   - `.../traits/rendering/...`   → 'rendering'
   *   - `.../traits/brainGeo/...`    → 'brain-geo'
   *   - any file in a `traits/` dir  → uses the immediate subdirectory name
   */
  private _traitNamespace(filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, '/');
    const traitMatch = /\/traits\/([^/]+)\//.exec(normalized);
    if (traitMatch?.[1]) {
      const ns = traitMatch[1]
        .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase → kebab
        .toLowerCase();
      return ns;
    }
    // Flat traits directory
    if (/\/traits\/[^/]+\.[tj]sx?$/.test(normalized)) {
      return 'core';
    }
    return null;
  }

  /**
   * Detect compiler family from file path or naming.
   *
   * Matches:
   *   - `*Compiler.ts` → family from prefix (e.g. VRCompiler → 'vr')
   *   - `compile_to_*.ts` → family from suffix
   *   - files in `packages/compiler-*` → package name
   */
  private _compilerFamily(filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, '/');
    const base = path.basename(normalized, path.extname(normalized));

    // *Compiler.ts pattern
    const compilerMatch = /^(.+?)Compiler$/.exec(base);
    if (compilerMatch?.[1]) {
      return compilerMatch[1]
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();
    }

    // compile_to_* function pattern (check file name for convention)
    const compileToMatch = /^compile[_-]to[_-](.+)$/.exec(base);
    if (compileToMatch?.[1]) {
      return compileToMatch[1].toLowerCase();
    }

    // packages/compiler-* directory
    const compilerPkgMatch = /\/packages\/compiler-([^/]+)\//.exec(normalized);
    if (compilerPkgMatch?.[1]) return compilerPkgMatch[1];

    return null;
  }

  /**
   * Detect domain plugin name from file path.
   * Matches files under packages/plugins/<name>/
   */
  private _pluginName(filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, '/');
    // Allow paths with or without a leading '/' before 'packages'
    const pluginMatch = /(?:^|\/)packages\/plugins\/([^/]+)\//.exec(normalized);
    return pluginMatch?.[1] ?? null;
  }

  /**
   * Find the dominant event namespace (prefix before ':') from a list of event names.
   * Returns the most common prefix, or null if no clear winner.
   */
  private _dominantEventNamespace(events: string[]): string | null {
    const counts = new Map<string, number>();
    for (const e of events) {
      const colon = e.indexOf(':');
      const ns = colon > 0 ? e.slice(0, colon) : e;
      counts.set(ns, (counts.get(ns) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    let best = '';
    let bestCount = 0;
    for (const [ns, count] of counts) {
      if (count > bestCount) { best = ns; bestCount = count; }
    }
    // Require at least 2 events or clear majority to assign namespace community
    return bestCount >= 1 && best ? best : null;
  }

  private _isTestFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.includes('__tests__') ||
           normalized.includes('.test.') ||
           normalized.includes('.spec.');
  }

  /**
   * Given a test file, find its subject: the non-test file with the same stem
   * in the closest parent directory.
   */
  private _testSubject(testFile: string, allFiles: string[]): string | null {
    const normalized = testFile.replace(/\\/g, '/');
    // Strip test suffixes: Foo.test.ts → Foo, __tests__/Foo.ts → Foo
    const base = path.basename(normalized)
      .replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '')
      .replace(/\.(ts|tsx|js|jsx)$/, '');

    const dir = path.dirname(normalized);
    // Check parent dir (for __tests__/Foo.test.ts → ../Foo.ts)
    const parentDir = path.dirname(dir);

    for (const candidate of allFiles) {
      if (candidate === testFile) continue;
      const cNorm = candidate.replace(/\\/g, '/');
      const cBase = path.basename(cNorm).replace(/\.(ts|tsx|js|jsx)$/, '');
      if (cBase === base) {
        const cDir = path.dirname(cNorm);
        if (cDir === dir || cDir === parentDir) return candidate;
      }
    }
    return null;
  }
}
