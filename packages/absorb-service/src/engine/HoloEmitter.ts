/**
 * HoloScript Emitter
 *
 * Generates `.holo` composition source text from a CodebaseGraph.
 * Groups symbols by community/directory, assigns 3D positions via
 * force-directed or layered layout, and emits valid HoloScript syntax.
 *
 * @version 1.0.0
 */

import type { CodebaseGraph } from './CodebaseGraph';
import type { ExternalSymbolDefinition, ImportEdge } from './types';
import type { LayoutNode, LayoutEdge } from './layouts/ForceDirectedLayout';
import { forceDirectedLayout } from './layouts/ForceDirectedLayout';
import { layeredLayout } from './layouts/LayeredLayout';

// =============================================================================
// TYPES
// =============================================================================

export type LayoutMode = 'force' | 'layered';

export interface EmitOptions {
  /** Composition name (defaults to directory name) */
  name?: string;
  /** Layout algorithm (default: 'force') */
  layout?: LayoutMode;
  /** Skybox preset (default: 'dark-grid') */
  skybox?: string;
  /** Ambient light intensity (default: 0.4) */
  ambientLight?: number;
  /** Whether to include call edges as logic flows (default: true) */
  includeCallEdges?: boolean;
  /** Whether to include import edges as connections (default: true) */
  includeImportEdges?: boolean;
  /** Minimum symbol visibility to include (default: 'public') */
  minVisibility?: 'public' | 'protected' | 'internal' | 'private';
  /** Maximum symbols per spatial group before collapsing (default: 50) */
  maxSymbolsPerGroup?: number;

  // ── Agent-mode options ──────────────────────────────────────────────────
  /**
   * Emit an agent-optimized manifest instead of 3D spatial output.
   * Strips positions, adds manifest/hotspots/search_index, emits doc comments.
   */
  forAgent?: boolean;
  /**
   * Agent output depth.
   * - 'shallow': manifest + search_index only (fast orientation)
   * - 'medium':  + public API spatial groups + cross-community logic
   * - 'deep':    + all symbol detail (default for agent mode)
   */
  depth?: 'shallow' | 'medium' | 'deep';
  /** Pre-resolved package.json metadata (name, version, description, scripts) */
  packageMeta?: {
    name?: string;
    version?: string;
    description?: string;
    scripts?: Record<string, string>;
  };
  /** ISO timestamp of when absorb ran */
  absorbedAt?: string;
  /** Git branch + HEAD hash, e.g. "main@abc1234" */
  gitInfo?: string;
  /** Files changed since sinceRef (absolute paths from git diff --name-only) */
  changedFiles?: string[];
  /** Transitive blast radius: files transitively affected by changedFiles */
  changeImpact?: string[];
  /** Git ref used for --since display (e.g. "HEAD~1") */
  sinceRef?: string;
  /** Whether to only emit changed files and their immediate impact (incremental update) */
  incremental?: boolean;
  /** Previous positions for layout warm-start */
  lastPositions?: Map<string, [number, number, number]>;
}

// Visibility ordering for filtering
const VISIBILITY_ORDER = { public: 0, protected: 1, internal: 2, private: 3 };

// Color mapping by language
const LANGUAGE_COLORS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  python: '#3776ab',
  rust: '#dea584',
  go: '#00add8',
  java: '#b07219',
  cpp: '#f34b7d',
  csharp: '#178600',
  php: '#4f5d95',
  swift: '#f05138',
  kotlin: '#a97bff',
  holoscript: '#00ff88',
};

// Trait mapping by symbol type
const TYPE_TRAITS: Record<string, string> = {
  class: '@class',
  interface: '@interface',
  enum: '@enum',
  struct: '@struct',
  trait: '@trait',
  function: '@function',
  method: '@method',
  module: '@module',
  namespace: '@namespace',
  package: '@package',
};

// =============================================================================
// EMITTER
// =============================================================================

export class HoloEmitter {
  /**
   * Generate `.holo` source text from a CodebaseGraph.
   * Pass `options.forAgent = true` for an agent-optimized manifest output.
   */
  emit(graph: CodebaseGraph, options: EmitOptions = {}): string {
    if (options.forAgent) {
      return this.emitForAgent(graph, options);
    }
    return this.emitSpatial(graph, options);
  }

  // ── Spatial (3D visualization) output ────────────────────────────────────

  private emitSpatial(graph: CodebaseGraph, options: EmitOptions): string {
    const name = options.name ?? 'codebase';
    const skybox = options.skybox ?? 'dark-grid';
    const ambientLight = options.ambientLight ?? 0.4;
    const includeCallEdges = options.includeCallEdges ?? true;
    const includeImportEdges = options.includeImportEdges ?? true;
    const minVis = VISIBILITY_ORDER[options.minVisibility ?? 'public'];
    const maxPerGroup = options.maxSymbolsPerGroup ?? 50;

    // Detect communities for grouping
    const communities = graph.detectCommunities();

    // Collect symbols per community, filtered by visibility
    const communitySymbols = new Map<string, ExternalSymbolDefinition[]>();
    for (const [community, files] of communities) {
      const symbols: ExternalSymbolDefinition[] = [];
      for (const file of files) {
        // If incremental, only include changed files and their community
        if (options.incremental && options.changedFiles && !options.changedFiles.includes(file)) {
          // Check if any symbols in this file are in changeImpact?
          // For now, let's keep it simple: if incremental, only show changed files.
          continue;
        }
        for (const sym of graph.getSymbolsInFile(file)) {
          if (VISIBILITY_ORDER[sym.visibility] <= minVis) {
            symbols.push(sym);
          }
        }
      }
      if (symbols.length > 0) {
        communitySymbols.set(community, symbols);
      }
    }

    // Build layout nodes and edges
    const { layoutNodes, layoutEdges } = this.buildLayoutGraph(graph, communitySymbols);

    // Run layout
    const layout = options.layout ?? 'force';
    if (layout === 'layered') {
      layeredLayout(layoutNodes, layoutEdges);
    } else {
      forceDirectedLayout(layoutNodes, layoutEdges, {
        iterations: options.incremental ? 50 : 200, // Faster delta resolution if incremental
      });
    }

    // Build position lookup
    const positions = new Map<string, [number, number, number]>();
    for (const node of layoutNodes) {
      positions.set(node.id, [
        Math.round(node.x * 100) / 100,
        Math.round(node.y * 100) / 100,
        Math.round(node.z * 100) / 100,
      ]);
    }

    // Emit HoloScript
    const lines: string[] = [];
    lines.push(`composition "${this.escapeString(name)}" {`);
    lines.push('');

    // Environment
    lines.push('  environment {');
    lines.push(`    skybox: "${skybox}"`);
    lines.push(`    ambient_light: ${ambientLight}`);
    lines.push('    shadows: true');
    lines.push('  }');
    lines.push('');

    // Stats comment
    const stats = graph.getStats();
    lines.push(
      `  // Codebase: ${stats.totalFiles} files, ${stats.totalSymbols} symbols, ${stats.totalLoc} LOC`
    );
    lines.push(
      `  // Languages: ${Object.entries(stats.filesByLanguage)
        .map(([l, n]) => `${l}(${n})`)
        .join(', ')}`
    );
    lines.push('');

    // Emit spatial groups per community
    for (const [community, symbols] of communitySymbols) {
      const groupId = this.sanitizeId(community);

      // Collapse large groups
      const visibleSymbols = symbols.length > maxPerGroup ? symbols.slice(0, maxPerGroup) : symbols;

      lines.push(`  spatial_group "${groupId}" {`);

      for (const sym of visibleSymbols) {
        const symId = this.makeObjectId(sym);
        const pos = positions.get(symId) ?? [0, 0, 0];
        const color = LANGUAGE_COLORS[sym.language] ?? '#888888';
        const trait = TYPE_TRAITS[sym.type] ?? '';
        const visibilityTrait = sym.visibility === 'public' ? '@public' : '';
        const traits = [trait, visibilityTrait].filter(Boolean).join(' ');

        lines.push(`    object "${this.escapeString(symId)}" ${traits} {`);
        lines.push(`      position: [${pos[0]}, ${pos[1]}, ${pos[2]}]`);
        lines.push(`      color: "${color}"`);
        lines.push(`      language: "${sym.language}"`);
        lines.push(`      file: "${this.escapeString(sym.filePath)}"`);

        if (sym.signature) {
          lines.push(`      signature: "${this.escapeString(sym.signature)}"`);
        }
        if (sym.lineCount) {
          lines.push(`      loc: ${sym.lineCount}`);
        }
        if (sym.owner) {
          lines.push(`      owner: "${this.escapeString(sym.owner)}"`);
        }

        lines.push('    }');
      }

      if (symbols.length > maxPerGroup) {
        lines.push(`    // ... ${symbols.length - maxPerGroup} more symbols collapsed`);
      }

      lines.push('  }');
      lines.push('');
    }

    // Logic block: call edges and import connections
    if (includeCallEdges || includeImportEdges) {
      const logicLines = this.emitLogicBlock(graph, includeCallEdges, includeImportEdges);
      if (logicLines.length > 0) {
        lines.push('  logic {');
        for (const line of logicLines) {
          lines.push(`    ${line}`);
        }
        lines.push('  }');
        lines.push('');
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  // ── Agent-optimized output ──────────────────────────────────────────────

  /**
   * Emit an agent-optimized manifest.
   *
   * Output sections:
   *   manifest {}      — project meta, stats, hotspots, read_first priority
   *   spatial_group {} — symbols WITHOUT 3D positions, WITH doc comments
   *                      (omitted when depth === 'shallow')
   *   logic {}         — cross-community edges only (architectural boundaries)
   *                      (omitted when depth === 'shallow')
   *   search_index {}  — public symbol → file#line lookup table
   */
  private emitForAgent(graph: CodebaseGraph, options: EmitOptions): string {
    const name = options.name ?? 'codebase';
    const depth = options.depth ?? 'deep';
    const stats = graph.getStats();
    const communities = graph.detectCommunities();

    // Build community → symbols map (all visibilities for deep, public-only otherwise)
    const minVis = depth === 'deep' ? VISIBILITY_ORDER['private'] : VISIBILITY_ORDER['public'];
    const communitySymbols = new Map<string, ExternalSymbolDefinition[]>();
    for (const [community, files] of communities) {
      const syms: ExternalSymbolDefinition[] = [];
      for (const file of files) {
        for (const sym of graph.getSymbolsInFile(file)) {
          if (VISIBILITY_ORDER[sym.visibility] <= minVis) {
            syms.push(sym);
          }
        }
      }
      if (syms.length > 0) communitySymbols.set(community, syms);
    }

    // Compute in-degree (how many files import each file) for read_first ranking
    const filePaths = graph.getFilePaths();
    const inDegree: Array<{ file: string; count: number }> = filePaths
      .map((fp) => ({ file: fp, count: graph.getImportedBy(fp).length }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);

    // Compute top LOC hotspots
    const locHotspots: Array<{ file: string; loc: number }> = filePaths
      .map((fp) => {
        const syms = graph.getSymbolsInFile(fp);
        const loc = syms.reduce((s, sym) => s + ((sym as ExternalSymbolDefinition).lineCount ?? 0), 0);
        return { file: fp, loc };
      })
      .filter((x) => x.loc > 0)
      .sort((a, b) => b.loc - a.loc);

    const lines: string[] = [];
    lines.push(`composition "${this.escapeString(name)}" {`);
    lines.push('');

    // ── manifest ────────────────────────────────────────────────────────
    lines.push('  manifest {');
    const pkg = options.packageMeta;
    if (pkg?.name) lines.push(`    project: "${this.escapeString(pkg.name)}"`);
    if (pkg?.version) lines.push(`    version: "${this.escapeString(pkg.version)}"`);
    if (pkg?.description) lines.push(`    description: "${this.escapeString(pkg.description)}"`);
    if (options.absorbedAt) lines.push(`    absorbed_at: "${options.absorbedAt}"`);
    if (options.gitInfo) lines.push(`    git: "${this.escapeString(options.gitInfo)}"`);
    lines.push('');

    lines.push('    stats {');
    lines.push(`      files: ${stats.totalFiles}`);
    lines.push(`      symbols: ${stats.totalSymbols}`);
    lines.push(`      loc: ${stats.totalLoc}`);
    lines.push(`      imports: ${stats.totalImports}`);
    lines.push(`      calls: ${stats.totalCalls}`);
    lines.push(`      communities: ${stats.communities}`);
    const langSummary = Object.entries(stats.filesByLanguage)
      .sort((a, b) => b[1] - a[1])
      .map(([l, n]) => `${l}(${n})`)
      .join(', ');
    lines.push(`      languages: "${langSummary}"`);
    const typeSummary = Object.entries(stats.symbolsByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t, n]) => `${t}(${n})`)
      .join(', ');
    lines.push(`      symbol_types: "${typeSummary}"`);
    lines.push('    }');
    lines.push('');

    if (pkg?.scripts && Object.keys(pkg.scripts).length > 0) {
      lines.push('    build_commands {');
      for (const [cmd, script] of Object.entries(pkg.scripts).slice(0, 8)) {
        lines.push(`      ${cmd}: "${this.escapeString(script)}"`);
      }
      lines.push('    }');
      lines.push('');
    }

    if (inDegree.length > 0) {
      lines.push('    // Files agents should read first (ranked by architectural centrality)');
      lines.push('    read_first {');
      const top = inDegree.slice(0, 12);
      for (let i = 0; i < top.length; i++) {
        const rel = this.escapeString(top[i].file);
        const fileMeta = graph.getFile(top[i].file);
        const doc = fileMeta?.docComment
          ? `  // ${top[i].count} dependents — ${fileMeta.docComment.replace(/\n/g, ' ').trim().slice(0, 100)}`
          : `  // ${top[i].count} dependents`;
        lines.push(`      ${i + 1}: "${rel}"${doc}`);
      }
      lines.push('    }');
      lines.push('');
    }

    if (locHotspots.length > 0) {
      lines.push('    // Largest files (LOC hotspots)');
      lines.push('    hotspots {');
      const top = locHotspots.slice(0, 8);
      for (let i = 0; i < top.length; i++) {
        const rel = this.escapeString(top[i].file);
        const fileMeta = graph.getFile(top[i].file);
        const doc = fileMeta?.docComment
          ? `  // ${top[i].loc} LOC — ${fileMeta.docComment.replace(/\n/g, ' ').trim().slice(0, 100)}`
          : `  // ${top[i].loc} LOC`;
        lines.push(`      ${i + 1}: "${rel}"${doc}`);
      }
      lines.push('    }');
    }

    lines.push('  }');
    lines.push('');

    // ── change_impact block (when --since was provided) ───────────────────
    if (options.changedFiles && options.changedFiles.length > 0) {
      lines.push(
        `  // Changes since ${this.escapeString(options.sinceRef ?? 'last ref')} and their blast radius`
      );
      lines.push('  change_impact {');
      if (options.sinceRef) lines.push(`    since: "${this.escapeString(options.sinceRef)}"`);
      lines.push(`    changed_count: ${options.changedFiles.length}`);
      lines.push('    changed {');
      options.changedFiles.slice(0, 20).forEach((f, i) => {
        lines.push(`      ${i + 1}: "${this.escapeString(f)}"`);
      });
      if (options.changedFiles.length > 20) {
        lines.push(`      // ... ${options.changedFiles.length - 20} more`);
      }
      lines.push('    }');
      if (options.changeImpact && options.changeImpact.length > 0) {
        lines.push(`    blast_radius_count: ${options.changeImpact.length}`);
        lines.push('    blast_radius {');
        options.changeImpact.slice(0, 20).forEach((f, i) => {
          lines.push(`      ${i + 1}: "${this.escapeString(f)}"`);
        });
        if (options.changeImpact.length > 20) {
          lines.push(`      // ... ${options.changeImpact.length - 20} more affected files`);
        }
        lines.push('    }');
      }
      lines.push('  }');
      lines.push('');
    }

    // ── spatial_group sections (skipped for shallow depth) ───────────────
    if (depth !== 'shallow') {
      const maxPerGroup = options.maxSymbolsPerGroup ?? 80;
      for (const [community, syms] of communitySymbols) {
        const groupId = this.sanitizeId(community);
        const visibleSyms = syms.length > maxPerGroup ? syms.slice(0, maxPerGroup) : syms;

        lines.push(`  spatial_group "${groupId}" {`);
        for (const sym of visibleSyms) {
          const symId = this.makeObjectId(sym);
          const trait = TYPE_TRAITS[sym.type] ?? '';
          const visTrait = sym.visibility === 'public' ? '@public' : '';
          const traits = [trait, visTrait].filter(Boolean).join(' ');

          lines.push(`    object "${this.escapeString(symId)}" ${traits} {`);
          lines.push(`      community: "${this.escapeString(community)}"`);
          lines.push(`      file: "${this.escapeString(sym.filePath)}"`);
          lines.push(`      line: ${sym.line}`);
          lines.push(`      language: "${sym.language}"`);

          if (sym.signature) {
            lines.push(`      signature: "${this.escapeString(sym.signature)}"`);
          }
          if (sym.docComment) {
            // Single-line doc comment summary (first 120 chars)
            const doc = sym.docComment.replace(/\n/g, ' ').trim().slice(0, 120);
            lines.push(`      doc: "${this.escapeString(doc)}"`);
          }
          if (sym.lineCount) lines.push(`      loc: ${sym.lineCount}`);
          if (sym.owner) lines.push(`      owner: "${this.escapeString(sym.owner)}"`);

          // Caller count for hotspot awareness
          const callerCount = graph.getCallersOf(sym.name, sym.owner).length;
          if (callerCount > 0) lines.push(`      callers: ${callerCount}`);

          lines.push('    }');
        }
        if (syms.length > maxPerGroup) {
          lines.push(
            `    // ... ${syms.length - maxPerGroup} more symbols (increase maxSymbolsPerGroup to see all)`
          );
        }
        lines.push('  }');
        lines.push('');
      }
    }

    // ── logic block: cross-community edges only ──────────────────────────
    if (depth !== 'shallow') {
      const logicLines = this.emitCrossCommunityLogic(graph, communities);
      if (logicLines.length > 0) {
        lines.push('  // Architectural boundaries: calls and imports that cross community lines');
        lines.push('  logic {');
        for (const line of logicLines) {
          lines.push(`    ${line}`);
        }
        lines.push('  }');
        lines.push('');
      }
    }

    // ── warnings: code quality alerts ────────────────────────────────────
    const warningLines = this.buildWarningsLines(graph, filePaths);
    if (warningLines.length > 0) {
      lines.push('  // Code quality alerts: circular imports and over-complex files');
      lines.push('  warnings {');
      for (const line of warningLines) {
        lines.push(`    ${line}`);
      }
      lines.push('  }');
      lines.push('');
    }

    // ── search_index: rapid symbol lookup ────────────────────────────────
    lines.push('  // Symbol → file#line lookup for rapid agent navigation');
    lines.push('  search_index {');
    const allSyms = graph.getAllSymbols();
    const pubSyms = allSyms.filter((s) => s.visibility === 'public');
    // Sort by name for deterministic output
    pubSyms.sort((a, b) => a.name.localeCompare(b.name));
    for (const sym of pubSyms) {
      const qualName = sym.owner ? `${sym.owner}.${sym.name}` : sym.name;
      const loc = `${this.escapeString(sym.filePath)}#${sym.line}`;
      lines.push(`    "${this.escapeString(qualName)}": "${loc}"`);
    }
    lines.push('  }');
    lines.push('');

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Emit only logic edges that cross community boundaries.
   * This surfaces architectural coupling rather than internal implementation details.
   */
  private emitCrossCommunityLogic(
    graph: CodebaseGraph,
    communities: Map<string, string[]>
  ): string[] {
    // Build file → community lookup
    const fileToComm = new Map<string, string>();
    for (const [comm, files] of communities) {
      for (const f of files) fileToComm.set(f, comm);
    }

    const lines: string[] = [];
    const seen = new Set<string>();
    let edgeCount = 0;
    const maxEdges = 150;

    // Cross-community call edges
    const filePaths = graph.getFilePaths();
    for (const filePath of filePaths) {
      const callerComm = fileToComm.get(filePath);
      const syms = graph.getSymbolsInFile(filePath);
      for (const sym of syms) {
        if (sym.type !== 'function' && sym.type !== 'method') continue;
        const callers = graph.getCallersOf(sym.name, sym.owner);
        for (const caller of callers) {
          if (edgeCount >= maxEdges) break;
          const calleeComm = fileToComm.get(caller.filePath);
          if (!callerComm || !calleeComm || callerComm === calleeComm) continue;
          const key = `call:${calleeComm}->${callerComm}:${sym.name}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const callee = sym.owner ? `${sym.owner}.${sym.name}` : sym.name;
          lines.push(
            `// [${calleeComm}] → [${callerComm}]: on_call("${this.escapeString(callee)}")`
          );
          edgeCount++;
        }
        if (edgeCount >= maxEdges) break;
      }
      if (edgeCount >= maxEdges) break;
    }

    // Cross-community import edges (architectural dependencies)
    if (edgeCount < maxEdges) {
      const seenImportComms = new Set<string>();
      for (const filePath of filePaths) {
        if (edgeCount >= maxEdges) break;
        const fromComm = fileToComm.get(filePath);
        if (!fromComm) continue;
        const imports = graph.getImportsOf(filePath);
        for (const imp of imports) {
          if (edgeCount >= maxEdges) break;
          const target = imp.resolvedPath ?? imp.toModule;
          const toComm = fileToComm.get(target);
          if (!toComm || fromComm === toComm) continue;
          const commKey = `import:${fromComm}->${toComm}`;
          if (seenImportComms.has(commKey)) continue;
          seenImportComms.add(commKey);
          const named = imp.namedImports?.slice(0, 3).join(', ') ?? '*';
          const more =
            (imp.namedImports?.length ?? 0) > 3
              ? ` +${(imp.namedImports?.length ?? 0) - 3} more`
              : '';
          lines.push(
            `// [${this.sanitizeId(fromComm)}] depends_on [${this.sanitizeId(toComm)}]: { ${named}${more} }`
          );
          edgeCount++;
        }
      }
    }

    if (edgeCount >= maxEdges) {
      lines.push(`// ... (${edgeCount} cross-community edges shown, further edges omitted)`);
    }

    return lines;
  }

  /**
   * Detect circular import chains using DFS (up to MAX_CYCLES cycles).
   * Only follows resolved (project-internal) import paths.
   */
  private detectImportCycles(graph: CodebaseGraph): string[][] {
    const cycles: string[][] = [];
    const MAX_CYCLES = 8;
    const filePathSet = new Set(graph.getFilePaths());
    const black = new Set<string>();

    const dfs = (file: string, path: string[], inPath: Set<string>): void => {
      if (cycles.length >= MAX_CYCLES || black.has(file)) return;
      inPath.add(file);

      for (const imp of graph.getImportsOf(file)) {
        if (cycles.length >= MAX_CYCLES) break;
        const target = imp.resolvedPath;
        if (!target || !filePathSet.has(target)) continue;

        if (inPath.has(target)) {
          const cycleStart = path.indexOf(target);
          if (cycleStart >= 0) {
            const cycle = [...path.slice(cycleStart), target];
            if (cycle.length >= 3) cycles.push(cycle); // skip trivial self-loops
          }
        } else if (!black.has(target)) {
          path.push(target);
          dfs(target, path, inPath);
          path.pop();
        }
      }

      inPath.delete(file);
      black.add(file);
    };

    for (const fp of graph.getFilePaths()) {
      if (cycles.length >= MAX_CYCLES) break;
      if (!black.has(fp)) dfs(fp, [fp], new Set([fp]));
    }

    return cycles;
  }

  /**
   * Build warning lines for the `warnings {}` block in agent mode.
   * Surfaces circular imports and god files (high LOC / symbol count).
   */
  private buildWarningsLines(graph: CodebaseGraph, filePaths: string[]): string[] {
    const lines: string[] = [];

    // Circular imports
    const cycles = this.detectImportCycles(graph);
    if (cycles.length > 0) {
      lines.push('circular_imports {');
      lines.push(`  total: ${cycles.length}`);
      cycles.forEach((cycle, i) => {
        const cycleStr = cycle
          .map((f) => {
            const parts = f.replace(/\\/g, '/').split('/');
            return parts.slice(-2).join('/');
          })
          .join(' → ');
        lines.push(`  cycle_${i + 1}: "${this.escapeString(cycleStr)}"`);
      });
      lines.push('}');
    }

    // God files (high LOC or high symbol count)
    const godFiles: Array<{ file: string; loc: number; symbols: number }> = [];
    for (const fp of filePaths) {
      const syms = graph.getSymbolsInFile(fp);
      const loc = syms.reduce((s, sym) => s + ((sym as ExternalSymbolDefinition).lineCount ?? 0), 0);
      if (loc >= 500 || syms.length >= 30) {
        godFiles.push({ file: fp, loc, symbols: syms.length });
      }
    }
    if (godFiles.length > 0) {
      godFiles.sort((a, b) => b.loc - a.loc);
      if (lines.length > 0) lines.push('');
      lines.push('god_files {');
      lines.push(`  total: ${godFiles.length}`);
      godFiles.slice(0, 8).forEach((gf, i) => {
        lines.push(
          `  ${i + 1}: "${this.escapeString(gf.file)}"  // ${gf.loc} LOC, ${gf.symbols} symbols`
        );
      });
      if (godFiles.length > 8) lines.push(`  // ... ${godFiles.length - 8} more`);
      lines.push('}');
    }

    return lines;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private buildLayoutGraph(
    graph: CodebaseGraph,
    communitySymbols: Map<string, ExternalSymbolDefinition[]>
  ): { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[] } {
    const layoutNodes: LayoutNode[] = [];
    const nodeIds = new Set<string>();

    for (const [, symbols] of communitySymbols) {
      for (const sym of symbols) {
        const id = this.makeObjectId(sym);
        if (!nodeIds.has(id)) {
          nodeIds.add(id);
          const pos = [0, 0, 0];
          layoutNodes.push({
            id,
            x: pos[0],
            y: pos[1],
            z: pos[2],
            weight: (sym as ExternalSymbolDefinition).lineCount ?? 1,
          });
        }
      }
    }

    // Build edges from imports
    const layoutEdges: LayoutEdge[] = [];
    const filePaths = graph.getFilePaths();
    for (const filePath of filePaths) {
      const imports = graph.getImportsOf(filePath);
      for (const imp of imports) {
        const target = imp.resolvedPath ?? imp.toModule;
        // Create edges between files (simplified -- links first symbol of each file)
        const sourceSymbols = graph.getSymbolsInFile(filePath);
        const targetSymbols = graph.getSymbolsInFile(target);
        if (sourceSymbols.length > 0 && targetSymbols.length > 0) {
          layoutEdges.push({
            source: this.makeObjectId(sourceSymbols[0]),
            target: this.makeObjectId(targetSymbols[0]),
            weight: imp.namedImports?.length ?? 1,
          });
        }
      }
    }

    return { layoutNodes, layoutEdges };
  }

  private emitLogicBlock(
    graph: CodebaseGraph,
    includeCalls: boolean,
    includeImports: boolean
  ): string[] {
    const lines: string[] = [];
    const seen = new Set<string>();
    let edgeCount = 0;
    const maxEdges = 100; // Cap for readability

    if (includeCalls) {
      const filePaths = graph.getFilePaths();
      for (const filePath of filePaths) {
        const symbols = graph.getSymbolsInFile(filePath);
        for (const sym of symbols) {
          if (sym.type === 'function' || sym.type === 'method') {
            const callers = graph.getCallersOf(sym.name, sym.owner);
            for (const caller of callers) {
              if (edgeCount >= maxEdges) break;
              const key = `${caller.callerId}->${sym.name}`;
              if (seen.has(key)) continue;
              seen.add(key);

              const callerName = caller.calleeOwner
                ? `${caller.calleeOwner}.${caller.calleeName}`
                : caller.calleeName;
              lines.push(
                `on_interact("${this.escapeString(callerName)}"): { ${this.escapeString(sym.owner ? `${sym.owner}.${sym.name}` : sym.name)}() }`
              );
              edgeCount++;
            }
          }
        }
        if (edgeCount >= maxEdges) break;
      }
    }

    if (includeImports && edgeCount < maxEdges) {
      lines.push('');
      lines.push('// Import connections');
      const filePaths = graph.getFilePaths();
      for (const filePath of filePaths) {
        const imports = graph.getImportsOf(filePath);
        for (const imp of imports) {
          if (edgeCount >= maxEdges) break;
          const key = `${imp.fromFile}->${imp.toModule}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const named = imp.namedImports?.join(', ') ?? '*';
          lines.push(
            `// ${this.sanitizeId(imp.fromFile)} imports { ${named} } from "${imp.toModule}"`
          );
          edgeCount++;
        }
        if (edgeCount >= maxEdges) break;
      }
    }

    if (edgeCount >= maxEdges) {
      lines.push(`// ... ${edgeCount}+ edges (truncated for readability)`);
    }

    return lines;
  }

  private makeObjectId(sym: ExternalSymbolDefinition): string {
    const owner = sym.owner ? `${sym.owner}.` : '';
    return `${owner}${sym.name}`;
  }

  private sanitizeId(s: string): string {
    return s.replace(/[\\\/]/g, '/').replace(/[^a-zA-Z0-9_\-\/\.]/g, '_');
  }

  private escapeString(s: string): string {
    return s.replace(/\\/g, '/').replace(/"/g, '\\"');
  }
}
