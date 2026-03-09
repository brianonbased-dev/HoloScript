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
   */
  emit(graph: CodebaseGraph, options: EmitOptions = {}): string {
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
      forceDirectedLayout(layoutNodes, layoutEdges);
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
        if (sym.loc) {
          lines.push(`      loc: ${sym.loc}`);
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

  // ── Private ──────────────────────────────────────────────────────────────

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
          layoutNodes.push({
            id,
            x: 0,
            y: 0,
            z: 0,
            weight: sym.loc ?? 1,
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
