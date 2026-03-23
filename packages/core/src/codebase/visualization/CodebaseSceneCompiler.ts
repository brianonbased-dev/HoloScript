/**
 * Codebase Scene Compiler
 *
 * Transforms a CodebaseGraph + layout into a HoloComposition AST.
 * The resulting AST feeds into existing compilers (WebGPU, Babylon, R3F)
 * without any changes to those compilers.
 *
 * @version 1.0.0
 */

import type { CodebaseGraph } from '../CodebaseGraph';
import type { ExternalSymbolDefinition } from '../types';
import type { LayoutNode, LayoutEdge } from '../layouts/ForceDirectedLayout';
import { forceDirectedLayout } from '../layouts/ForceDirectedLayout';
import { layeredLayout } from '../layouts/LayeredLayout';
import { CodebaseTheme } from './CodebaseTheme';
import type { ThemeOptions } from './CodebaseTheme';
import { EdgeRenderer } from './EdgeRenderer';
import type { EdgeRenderOptions } from './EdgeRenderer';
import { InteractiveSceneEnricher } from './InteractiveSceneEnricher';

// =============================================================================
// TYPES (re-exported from CodebaseSceneTypes to avoid circular deps)
// =============================================================================

export type {
  SceneComposition,
  SceneEnvironment,
  SceneObject,
  SceneSpatialGroup,
  SceneEdge,
  SceneMetadata,
} from './CodebaseSceneTypes';

import type {
  SceneComposition,
  SceneObject,
  SceneSpatialGroup,
  SceneEdge,
} from './CodebaseSceneTypes';

export interface SceneCompilerOptions {
  /** Composition name */
  name?: string;
  /** Layout mode (default: 'force') */
  layout?: 'force' | 'layered';
  /** Theme options */
  theme?: ThemeOptions;
  /** Edge rendering options */
  edges?: EdgeRenderOptions;
  /** Skybox preset (default: 'dark-grid') */
  skybox?: string;
  /** Ambient light intensity (default: 0.4) */
  ambientLight?: number;
  /** Enable fog (default: true) */
  fog?: boolean;
  /** Minimum visibility to include (default: 'public') */
  minVisibility?: 'public' | 'protected' | 'internal' | 'private';
  /** Maximum symbols per group (default: 50) */
  maxSymbolsPerGroup?: number;
  /** Enable interactive 3D (hover, click, selection, edge highlighting) */
  interactive?: boolean;
  /** Graph RAG highlight hints (node IDs to visually emphasize) */
  ragHighlights?: { nodeIds: string[]; type: 'search' | 'impact' | 'trace' };
  /** Previous positions for incremental warm-start layout */
  lastPositions?: Map<string, [number, number, number]>;
}

const VISIBILITY_ORDER = { public: 0, protected: 1, internal: 2, private: 3 };

// =============================================================================
// COMPILER
// =============================================================================

export class CodebaseSceneCompiler {
  /**
   * Compile a CodebaseGraph into a SceneComposition AST.
   * This AST can be fed into any HoloScript compiler backend.
   */
  compile(graph: CodebaseGraph, options: SceneCompilerOptions = {}): SceneComposition {
    const name = options.name ?? 'codebase';
    const skybox = options.skybox ?? 'dark-grid';
    const ambientLight = options.ambientLight ?? 0.4;
    const minVis = VISIBILITY_ORDER[options.minVisibility ?? 'public'];
    const maxPerGroup = options.maxSymbolsPerGroup ?? 50;

    const theme = new CodebaseTheme(options.theme);
    const edgeRenderer = new EdgeRenderer(options.edges);

    // 1. Detect communities
    const communities = graph.detectCommunities();

    // 2. Collect symbols per community
    const communitySymbols = new Map<string, ExternalSymbolDefinition[]>();
    let maxLoc = 0;

    for (const [community, files] of communities) {
      const symbols: ExternalSymbolDefinition[] = [];
      for (const file of files) {
        for (const sym of graph.getSymbolsInFile(file)) {
          if (VISIBILITY_ORDER[sym.visibility] <= minVis) {
            symbols.push(sym);
            if (sym.loc && sym.loc > maxLoc) maxLoc = sym.loc;
          }
        }
      }
      if (symbols.length > 0) {
        communitySymbols.set(community, symbols.slice(0, maxPerGroup));
      }
    }

    // 3. Build layout
    const { layoutNodes, layoutEdges } = this.buildLayoutGraph(graph, communitySymbols, options.lastPositions);

    const layout = options.layout ?? 'force';
    if (layout === 'layered') {
      layeredLayout(layoutNodes, layoutEdges);
    } else {
      forceDirectedLayout(layoutNodes, layoutEdges);
    }

    // Position lookup
    const positions = new Map<string, [number, number, number]>();
    for (const node of layoutNodes) {
      positions.set(node.id, [
        Math.round(node.x * 100) / 100,
        Math.round(node.y * 100) / 100,
        Math.round(node.z * 100) / 100,
      ]);
    }

    // 4. Build scene objects grouped by community
    const spatialGroups: SceneSpatialGroup[] = [];
    const allObjects: SceneObject[] = [];

    for (const [community, symbols] of communitySymbols) {
      const groupObjects: SceneObject[] = [];

      for (const sym of symbols) {
        const objId = this.makeObjectId(sym);
        const pos = positions.get(objId) ?? [0, 0, 0];
        const style = theme.getStyle(sym, { maxLoc });

        const obj: SceneObject = {
          type: 'Object',
          name: objId,
          position: pos,
          scale: style.scale,
          color: style.color,
          emissive: style.emissive,
          emissiveIntensity: style.emissiveIntensity,
          opacity: style.opacity,
          geometry: style.geometry,
          traits: this.getTraits(sym),
          properties: {
            language: sym.language,
            file: sym.filePath,
            symbolType: sym.type,
            visibility: sym.visibility,
            ...(sym.signature ? { signature: sym.signature } : {}),
            ...(sym.loc ? { loc: sym.loc } : {}),
            ...(sym.owner ? { owner: sym.owner } : {}),
          },
        };

        groupObjects.push(obj);
        allObjects.push(obj);
      }

      spatialGroups.push({
        type: 'SpatialGroup',
        name: this.sanitizeId(community),
        objects: groupObjects,
      });
    }

    // 5. Render edges
    const edgeInputs: Array<{ from: string; to: string; type: 'import' | 'call' }> = [];

    // Import edges
    for (const filePath of graph.getFilePaths()) {
      const imports = graph.getImportsOf(filePath);
      for (const imp of imports) {
        const sourceSyms = graph.getSymbolsInFile(filePath);
        const target = imp.resolvedPath ?? imp.toModule;
        const targetSyms = graph.getSymbolsInFile(target);
        if (sourceSyms.length > 0 && targetSyms.length > 0) {
          edgeInputs.push({
            from: this.makeObjectId(sourceSyms[0]),
            to: this.makeObjectId(targetSyms[0]),
            type: 'import',
          });
        }
      }
    }

    // Call edges (simplified: use first symbol per file)
    // Full call resolution would require cross-referencing symbol IDs
    const positionMap = new Map(
      allObjects.map((o) => [o.name, { x: o.position[0], y: o.position[1], z: o.position[2] }])
    );

    const renderedEdges = edgeRenderer.render(edgeInputs, positionMap);
    const sceneEdges: SceneEdge[] = renderedEdges.map((e) => ({
      from: e.from,
      to: e.to,
      edgeType: e.type,
      points: e.points,
      color: e.color,
      opacity: e.opacity,
      width: e.width,
    }));

    // 6. Build composition
    const stats = graph.getStats();
    const communityList = Array.from(communities.entries()).map(
      ([n, files]: [string, string[]]) => ({
        name: n,
        fileCount: files.length,
      })
    );

    const composition: SceneComposition = {
      type: 'Composition',
      name,
      environment: {
        skybox,
        ambientLight,
        shadows: true,
        ...(options.fog !== false
          ? { fog: { type: 'exponential', color: '#0a0a1a', near: 20, far: 100 } }
          : {}),
      },
      objects: allObjects,
      spatialGroups,
      edges: sceneEdges,
      metadata: {
        stats,
        communities: communityList,
        generatedAt: new Date().toISOString(),
      },
    };

    // Apply interactive enrichment
    if (options.interactive) {
      const enricher = new InteractiveSceneEnricher();
      return enricher.enrich(composition);
    }

    // Apply Graph RAG highlights
    if (options.ragHighlights) {
      return this.applyRAGHighlights(composition, options.ragHighlights);
    }

    return composition;
  }

  /**
   * Apply visual emphasis to nodes matching RAG search/impact/trace results.
   */
  private applyRAGHighlights(
    composition: SceneComposition,
    highlights: { nodeIds: string[]; type: 'search' | 'impact' | 'trace' }
  ): SceneComposition {
    const highlightSet = new Set(highlights.nodeIds);
    const highlightColors = {
      search: '#00ff88',
      impact: '#ff4444',
      trace: '#ffaa00',
    };
    const color = highlightColors[highlights.type];

    return {
      ...composition,
      objects: composition.objects.map((obj) => {
        if (highlightSet.has(obj.name)) {
          return {
            ...obj,
            emissive: color,
            emissiveIntensity: 0.7,
            opacity: 1.0,
            scale: obj.scale * 1.2,
          };
        }
        if (highlightSet.size > 0) {
          return { ...obj, opacity: 0.3, emissiveIntensity: 0.05 };
        }
        return obj;
      }),
      edges: composition.edges.map((edge) => {
        const isConnected = highlightSet.has(edge.from) && highlightSet.has(edge.to);
        if (isConnected) {
          return { ...edge, color, opacity: 0.9, width: edge.width + 2 };
        }
        if (highlightSet.size > 0) {
          return { ...edge, opacity: 0.05 };
        }
        return edge;
      }),
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private buildLayoutGraph(
    graph: CodebaseGraph,
    communitySymbols: Map<string, ExternalSymbolDefinition[]>,
    lastPositions?: Map<string, [number, number, number]>
  ): { layoutNodes: LayoutNode[]; layoutEdges: LayoutEdge[] } {
    const layoutNodes: LayoutNode[] = [];
    const nodeIds = new Set<string>();

    for (const [, symbols] of communitySymbols) {
      for (const sym of symbols) {
        const id = this.makeObjectId(sym);
        if (!nodeIds.has(id)) {
          nodeIds.add(id);
          const pos = lastPositions?.get(id) || [0, 0, 0];
          layoutNodes.push({ id, x: pos[0], y: pos[1], z: pos[2], weight: sym.loc ?? 1 });
        }
      }
    }

    const layoutEdges: LayoutEdge[] = [];
    for (const filePath of graph.getFilePaths()) {
      const imports = graph.getImportsOf(filePath);
      for (const imp of imports) {
        const target = imp.resolvedPath ?? imp.toModule;
        const sourceSyms = graph.getSymbolsInFile(filePath);
        const targetSyms = graph.getSymbolsInFile(target);
        if (sourceSyms.length > 0 && targetSyms.length > 0) {
          const sourceId = this.makeObjectId(sourceSyms[0]);
          const targetId = this.makeObjectId(targetSyms[0]);
          if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
            layoutEdges.push({
              source: sourceId,
              target: targetId,
              weight: imp.namedImports?.length ?? 1,
            });
          }
        }
      }
    }

    return { layoutNodes, layoutEdges };
  }

  private getTraits(sym: ExternalSymbolDefinition): string[] {
    const traits: string[] = [];
    if (sym.type) traits.push(`@${sym.type}`);
    if (sym.visibility === 'public') traits.push('@public');
    if (sym.visibility === 'private') traits.push('@private');
    return traits;
  }

  private makeObjectId(sym: ExternalSymbolDefinition): string {
    const owner = sym.owner ? `${sym.owner}.` : '';
    return `${owner}${sym.name}`;
  }

  private sanitizeId(s: string): string {
    return s.replace(/[\\\/]/g, '/').replace(/[^a-zA-Z0-9_\-\/\.]/g, '_');
  }
}
