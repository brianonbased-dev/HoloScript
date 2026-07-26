/**
 * Graph Selection Manager
 *
 * Manages multi-select state for interactive graph visualizations.
 * Supports additive selection, subgraph extraction, context generation
 * for AI queries, and N-hop expansion.
 *
 * @version 1.0.0
 */

import type { CodebaseGraph } from '../CodebaseGraph';
import type { ExternalSymbolDefinition } from '../types';
import type { SceneComposition, SceneObject, SceneEdge } from './CodebaseSceneCompiler';
import { makeSymbolObjectId } from '../SymbolObjectId';

// =============================================================================
// TYPES
// =============================================================================

export const VISUAL_GRAPH_FOCUS_SCHEMA = 'holoscript.holoabsorb.visual-graph-focus.v1' as const;

export interface SelectionSubgraph {
  /** Selected node IDs */
  nodes: string[];
  /** Edges between selected nodes */
  edges: Array<{ from: string; to: string; type: 'import' | 'call' }>;
  /** Symbol definitions for selected nodes */
  symbols: ExternalSymbolDefinition[];
  /** Selected IDs that do not resolve to an absorbed symbol. */
  unresolvedNodeIds: string[];
}

export interface VisualGraphCitation {
  nodeId: string;
  name: string;
  file: string;
  line: number;
  type: ExternalSymbolDefinition['type'];
}

/**
 * Machine-readable bridge from a visible graph selection to GraphRAG.
 *
 * The receipt deliberately carries collision-safe scene node IDs and file:line
 * citations. Symbol names alone are not authoritative because overloads and
 * same-name declarations are common in large repositories.
 */
export interface VisualGraphFocus {
  schemaVersion: typeof VISUAL_GRAPH_FOCUS_SCHEMA;
  kind: 'VisualGraphFocusReceipt';
  selectedNodeIds: string[];
  selectedSymbolKeys: string[];
  selectedFiles: string[];
  selectedCommunities: string[];
  neighborNodeIds: string[];
  unresolvedNodeIds: string[];
  citations: VisualGraphCitation[];
  selectedEdgeCount: number;
  resolutionRate: number;
}

export interface SelectionContext {
  /** Formatted text suitable for AI query context */
  text: string;
  /** Selected symbol count */
  symbolCount: number;
  /** File count spanned by selection */
  fileCount: number;
  /** Communities spanned by selection */
  communities: string[];
  /** Machine-readable evidence for agent retrieval and score receipts. */
  visualFocus: VisualGraphFocus;
}

interface VisualGraphSymbolIndexes {
  symbolBySceneId: Map<string, ExternalSymbolDefinition>;
  sceneIdsBySymbolKey: Map<string, string[]>;
  firstSceneIdByFile: Map<string, string>;
}

/**
 * A warm graph may serve many agents and selection turns. Index collision-safe
 * scene identities once per graph instance instead of walking every symbol on
 * every click or holo_ask_codebase call.
 */
const symbolIndexCache = new WeakMap<CodebaseGraph, VisualGraphSymbolIndexes>();

// =============================================================================
// MANAGER
// =============================================================================

export class GraphSelectionManager {
  private selectedIds: Set<string> = new Set();
  private graph: CodebaseGraph;
  private symbolBySceneId = new Map<string, ExternalSymbolDefinition>();
  private sceneIdsBySymbolKey = new Map<string, string[]>();
  private firstSceneIdByFile = new Map<string, string>();

  constructor(graph: CodebaseGraph) {
    this.graph = graph;
    const cached = symbolIndexCache.get(graph);
    if (cached) {
      this.symbolBySceneId = cached.symbolBySceneId;
      this.sceneIdsBySymbolKey = cached.sceneIdsBySymbolKey;
      this.firstSceneIdByFile = cached.firstSceneIdByFile;
    } else {
      this.buildSymbolIndexes();
      symbolIndexCache.set(graph, {
        symbolBySceneId: this.symbolBySceneId,
        sceneIdsBySymbolKey: this.sceneIdsBySymbolKey,
        firstSceneIdByFile: this.firstSceneIdByFile,
      });
    }
  }

  /**
   * Select a node. Returns true if the node was newly added.
   */
  select(nodeId: string): boolean {
    const normalizedId = this.normalizeSelectionId(nodeId);
    if (this.selectedIds.has(normalizedId)) return false;
    this.selectedIds.add(normalizedId);
    return true;
  }

  /**
   * Deselect a node. Returns true if the node was removed.
   */
  deselect(nodeId: string): boolean {
    return this.selectedIds.delete(this.normalizeSelectionId(nodeId));
  }

  /**
   * Toggle selection of a node.
   */
  toggle(nodeId: string): boolean {
    const normalizedId = this.normalizeSelectionId(nodeId);
    if (this.selectedIds.has(normalizedId)) {
      this.selectedIds.delete(normalizedId);
      return false;
    }
    this.selectedIds.add(normalizedId);
    return true;
  }

  /**
   * Clear all selections.
   */
  clear(): void {
    this.selectedIds.clear();
  }

  /**
   * Check if a node is selected.
   */
  isSelected(nodeId: string): boolean {
    return this.selectedIds.has(this.normalizeSelectionId(nodeId));
  }

  /**
   * Get all selected node IDs.
   */
  getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  /** Number of selected nodes */
  get size(): number {
    return this.selectedIds.size;
  }

  /**
   * Get the subgraph containing only selected nodes and their interconnecting edges.
   */
  getSelectedSubgraph(): SelectionSubgraph {
    const nodes = Array.from(this.selectedIds);
    const resolved = nodes
      .map((nodeId) => ({ nodeId, symbol: this.symbolBySceneId.get(nodeId) }))
      .filter(
        (entry): entry is { nodeId: string; symbol: ExternalSymbolDefinition } =>
          entry.symbol !== undefined
      );
    const symbols = resolved.map((entry) => entry.symbol);
    const unresolvedNodeIds = nodes.filter((nodeId) => !this.symbolBySceneId.has(nodeId));
    const edges: Array<{ from: string; to: string; type: 'import' | 'call' }> = [];
    const seenEdges = new Set<string>();

    // Find edges between selected nodes
    const nodeSet = new Set(nodes);
    for (const { nodeId: callerSceneId, symbol: sym } of resolved) {
      const callees = this.graph.getCalleesOf(this.symbolKey(sym));
      for (const call of callees) {
        const calleeKey = call.calleeOwner
          ? `${call.calleeOwner}.${call.calleeName}`
          : call.calleeName;
        for (const calleeSceneId of this.sceneIdsBySymbolKey.get(calleeKey) ?? []) {
          if (!nodeSet.has(calleeSceneId)) continue;
          this.pushEdge(edges, seenEdges, callerSceneId, calleeSceneId, 'call');
        }
      }
    }

    // Import edges between selected files
    const selectedNodesByFile = new Map<string, string[]>();
    for (const { nodeId, symbol } of resolved) {
      const ids = selectedNodesByFile.get(symbol.filePath) ?? [];
      ids.push(nodeId);
      selectedNodesByFile.set(symbol.filePath, ids);
    }
    for (const [filePath, sourceIds] of selectedNodesByFile) {
      const imports = this.graph.getImportsOf(filePath);
      for (const imp of imports) {
        const target = imp.resolvedPath ?? imp.toModule;
        const targetIds = selectedNodesByFile.get(target);
        if (!targetIds) continue;
        for (const sourceId of sourceIds) {
          for (const targetId of targetIds) {
            this.pushEdge(edges, seenEdges, sourceId, targetId, 'import');
          }
        }
      }
    }

    return { nodes, edges, symbols, unresolvedNodeIds };
  }

  /**
   * Generate a formatted context string for AI queries about selected symbols.
   * Useful for Graph RAG: "Tell me about these selected symbols..."
   */
  getSelectionContext(): SelectionContext {
    const subgraph = this.getSelectedSubgraph();
    const files = new Set(subgraph.symbols.map((s) => s.filePath));
    const communities = new Set<string>();

    for (const sym of subgraph.symbols) {
      const community = this.graph.getCommunityForFile(sym.filePath);
      if (community) communities.add(community);
    }

    const lines: string[] = [];
    lines.push(`## Selected Symbols (${subgraph.symbols.length})`);
    lines.push('');

    for (const sym of subgraph.symbols) {
      const owner = sym.owner ? `${sym.owner}.` : '';
      lines.push(`- **${owner}${sym.name}** (${sym.type}, ${sym.language})`);
      lines.push(`  File: ${sym.filePath}:${sym.line}`);
      if (sym.signature) lines.push(`  Signature: ${sym.signature}`);
      if (sym.docComment) lines.push(`  Doc: ${sym.docComment.split('\n')[0]}`);
      lines.push(`  Scene node: ${makeSymbolObjectId(sym)}`);

      const callers = this.graph.getCallersOf(sym.name, sym.owner);
      if (callers.length > 0) {
        lines.push(
          `  Called by: ${callers
            .slice(0, 5)
            .map((c) => c.callerId)
            .join(', ')}`
        );
      }
    }

    if (subgraph.edges.length > 0) {
      lines.push('');
      lines.push('## Connections');
      for (const edge of subgraph.edges) {
        lines.push(`- ${edge.from} → ${edge.to} (${edge.type})`);
      }
    }

    if (subgraph.unresolvedNodeIds.length > 0) {
      lines.push('');
      lines.push('## Unresolved Visual Nodes');
      for (const nodeId of subgraph.unresolvedNodeIds) lines.push(`- ${nodeId}`);
    }

    const visualFocus = this.getVisualFocus(subgraph);

    return {
      text: lines.join('\n'),
      symbolCount: subgraph.symbols.length,
      fileCount: files.size,
      communities: Array.from(communities).sort(),
      visualFocus,
    };
  }

  /**
   * Produce the evidence receipt consumed by GraphRAG visual-focus reranking.
   *
   * Neighbor nodes are direct call/import neighbors only. This keeps the visual
   * signal explicit and bounded instead of silently turning a viewport into an
   * unbounded graph crawl.
   */
  getVisualFocus(
    subgraph: SelectionSubgraph = this.getSelectedSubgraph(),
    maxNeighbors = 100
  ): VisualGraphFocus {
    const selectedNodeIds = [...subgraph.nodes].sort();
    const selectedSet = new Set(selectedNodeIds);
    const neighborNodeIds = new Set<string>();
    const communities = new Set<string>();

    for (const sym of subgraph.symbols) {
      const community = this.graph.getCommunityForFile(sym.filePath);
      if (community) communities.add(community);

      const callerId = this.symbolKey(sym);
      for (const call of this.graph.getCalleesOf(callerId)) {
        const calleeKey = call.calleeOwner
          ? `${call.calleeOwner}.${call.calleeName}`
          : call.calleeName;
        this.addNeighborIds(neighborNodeIds, selectedSet, calleeKey);
      }
      for (const call of this.graph.getCallersOf(sym.name, sym.owner)) {
        this.addNeighborIds(neighborNodeIds, selectedSet, call.callerId);
      }

      for (const imp of this.graph.getImportsOf(sym.filePath)) {
        const target = imp.resolvedPath ?? imp.toModule;
        const targetId = this.firstSceneIdByFile.get(target);
        if (targetId && !selectedSet.has(targetId)) neighborNodeIds.add(targetId);
      }
      for (const importer of this.graph.getImportedBy(sym.filePath)) {
        const importerId = this.firstSceneIdByFile.get(importer);
        if (importerId && !selectedSet.has(importerId)) neighborNodeIds.add(importerId);
      }
    }

    const citations = subgraph.symbols
      .map((sym) => ({
        nodeId: makeSymbolObjectId(sym),
        name: this.symbolKey(sym),
        file: sym.filePath,
        line: sym.line,
        type: sym.type,
      }))
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    const selectedCount = selectedNodeIds.length;

    return {
      schemaVersion: VISUAL_GRAPH_FOCUS_SCHEMA,
      kind: 'VisualGraphFocusReceipt',
      selectedNodeIds,
      selectedSymbolKeys: citations.map((citation) => citation.name),
      selectedFiles: Array.from(new Set(citations.map((citation) => citation.file))).sort(),
      selectedCommunities: Array.from(communities).sort(),
      neighborNodeIds: Array.from(neighborNodeIds).sort().slice(0, maxNeighbors),
      unresolvedNodeIds: [...subgraph.unresolvedNodeIds].sort(),
      citations,
      selectedEdgeCount: subgraph.edges.length,
      resolutionRate: selectedCount === 0 ? 1 : citations.length / selectedCount,
    };
  }

  /**
   * Expand the selection by N hops along call/import edges.
   * Adds connected nodes up to `depth` hops from currently selected nodes.
   */
  expandSelection(depth = 1): string[] {
    const newNodes: string[] = [];
    let frontier = new Set(this.selectedIds);

    for (let hop = 0; hop < depth; hop++) {
      const nextFrontier = new Set<string>();

      for (const nodeId of frontier) {
        const sym = this.symbolBySceneId.get(nodeId);
        if (!sym) continue;
        const callerId = this.symbolKey(sym);

        // Outgoing calls
        const callees = this.graph.getCalleesOf(callerId);
        for (const call of callees) {
          const calleeKey = call.calleeOwner
            ? `${call.calleeOwner}.${call.calleeName}`
            : call.calleeName;
          for (const calleeId of this.sceneIdsBySymbolKey.get(calleeKey) ?? []) {
            if (!this.selectedIds.has(calleeId)) nextFrontier.add(calleeId);
          }
        }

        // Incoming calls
        const callers = this.graph.getCallersOf(sym.name, sym.owner);
        for (const call of callers) {
          for (const callerSceneId of this.sceneIdsBySymbolKey.get(call.callerId) ?? []) {
            if (!this.selectedIds.has(callerSceneId)) nextFrontier.add(callerSceneId);
          }
        }

        for (const imp of this.graph.getImportsOf(sym.filePath)) {
          const target = imp.resolvedPath ?? imp.toModule;
          const targetId = this.firstSceneIdByFile.get(target);
          if (targetId && !this.selectedIds.has(targetId)) nextFrontier.add(targetId);
        }
        for (const importer of this.graph.getImportedBy(sym.filePath)) {
          const importerId = this.firstSceneIdByFile.get(importer);
          if (importerId && !this.selectedIds.has(importerId)) nextFrontier.add(importerId);
        }
      }

      // Add discovered nodes to selection
      for (const id of nextFrontier) {
        if (this.selectedIds.add(id)) {
          newNodes.push(id);
        }
      }

      frontier = nextFrontier;
    }

    return newNodes;
  }

  /**
   * Apply selection visual state to a SceneComposition.
   * Returns modified scene objects with updated colors/emissive for selected nodes.
   */
  applyToScene(scene: SceneComposition): SceneComposition {
    const selectedSet = this.selectedIds;

    return {
      ...scene,
      objects: scene.objects.map((obj) => {
        if (selectedSet.has(obj.name)) {
          return {
            ...obj,
            emissive: '#00ff88',
            emissiveIntensity: 0.8,
            opacity: 1.0,
          };
        }
        // Dim unselected nodes when there's an active selection
        if (selectedSet.size > 0) {
          return {
            ...obj,
            opacity: 0.3,
            emissiveIntensity: 0.05,
          };
        }
        return obj;
      }),
      edges: scene.edges.map((edge) => {
        const isConnected = selectedSet.has(edge.from) || selectedSet.has(edge.to);
        if (selectedSet.size > 0 && !isConnected) {
          return { ...edge, opacity: 0.05 };
        }
        if (isConnected) {
          return { ...edge, opacity: 0.9, width: edge.width + 1 };
        }
        return edge;
      }),
    };
  }

  private buildSymbolIndexes(): void {
    for (const filePath of this.graph.getFilePaths()) {
      for (const sym of this.graph.getSymbolsInFile(filePath)) {
        const sceneId = makeSymbolObjectId(sym);
        this.symbolBySceneId.set(sceneId, sym);
        if (!this.firstSceneIdByFile.has(filePath)) {
          this.firstSceneIdByFile.set(filePath, sceneId);
        }
        const key = this.symbolKey(sym);
        const sceneIds = this.sceneIdsBySymbolKey.get(key) ?? [];
        sceneIds.push(sceneId);
        this.sceneIdsBySymbolKey.set(key, sceneIds);
      }
    }
  }

  private normalizeSelectionId(nodeId: string): string {
    if (this.symbolBySceneId.has(nodeId)) return nodeId;
    const exactKeyMatches = this.sceneIdsBySymbolKey.get(nodeId) ?? [];
    return exactKeyMatches.length === 1 ? exactKeyMatches[0] : nodeId;
  }

  private symbolKey(sym: ExternalSymbolDefinition): string {
    return sym.owner ? `${sym.owner}.${sym.name}` : sym.name;
  }

  private addNeighborIds(target: Set<string>, selected: Set<string>, symbolKey: string): void {
    for (const sceneId of this.sceneIdsBySymbolKey.get(symbolKey) ?? []) {
      if (!selected.has(sceneId)) target.add(sceneId);
    }
  }

  private pushEdge(
    edges: Array<{ from: string; to: string; type: 'import' | 'call' }>,
    seen: Set<string>,
    from: string,
    to: string,
    type: 'import' | 'call'
  ): void {
    const key = `${type}:${from}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, type });
  }
}
