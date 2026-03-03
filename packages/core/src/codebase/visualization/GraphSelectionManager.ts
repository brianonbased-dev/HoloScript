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

// =============================================================================
// TYPES
// =============================================================================

export interface SelectionSubgraph {
  /** Selected node IDs */
  nodes: string[];
  /** Edges between selected nodes */
  edges: Array<{ from: string; to: string; type: 'import' | 'call' }>;
  /** Symbol definitions for selected nodes */
  symbols: ExternalSymbolDefinition[];
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
}

// =============================================================================
// MANAGER
// =============================================================================

export class GraphSelectionManager {
  private selectedIds: Set<string> = new Set();
  private graph: CodebaseGraph;

  constructor(graph: CodebaseGraph) {
    this.graph = graph;
  }

  /**
   * Select a node. Returns true if the node was newly added.
   */
  select(nodeId: string): boolean {
    if (this.selectedIds.has(nodeId)) return false;
    this.selectedIds.add(nodeId);
    return true;
  }

  /**
   * Deselect a node. Returns true if the node was removed.
   */
  deselect(nodeId: string): boolean {
    return this.selectedIds.delete(nodeId);
  }

  /**
   * Toggle selection of a node.
   */
  toggle(nodeId: string): boolean {
    if (this.selectedIds.has(nodeId)) {
      this.selectedIds.delete(nodeId);
      return false;
    }
    this.selectedIds.add(nodeId);
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
    return this.selectedIds.has(nodeId);
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
    const symbols: ExternalSymbolDefinition[] = [];
    const edges: Array<{ from: string; to: string; type: 'import' | 'call' }> = [];

    // Collect symbols for selected nodes
    for (const nodeId of nodes) {
      // Node IDs may be "Owner.name" or just "name"
      const parts = nodeId.split('.');
      const name = parts.length > 1 ? parts[parts.length - 1] : nodeId;
      const found = this.graph.findSymbolsByName(name);
      if (found.length > 0) {
        symbols.push(found[0]);
      }
    }

    // Find edges between selected nodes
    const nodeSet = new Set(nodes);
    for (const sym of symbols) {
      const callerId = sym.owner ? `${sym.owner}.${sym.name}` : sym.name;
      const callees = this.graph.getCalleesOf(callerId);
      for (const call of callees) {
        const calleeId = call.calleeOwner
          ? `${call.calleeOwner}.${call.calleeName}`
          : call.calleeName;
        if (nodeSet.has(calleeId)) {
          edges.push({ from: callerId, to: calleeId, type: 'call' });
        }
      }
    }

    // Import edges between selected files
    const selectedFiles = new Set(symbols.map((s) => s.filePath));
    for (const filePath of selectedFiles) {
      const imports = this.graph.getImportsOf(filePath);
      for (const imp of imports) {
        const target = imp.resolvedPath ?? imp.toModule;
        if (selectedFiles.has(target)) {
          edges.push({ from: filePath, to: target, type: 'import' });
        }
      }
    }

    return { nodes, edges, symbols };
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

      const callers = this.graph.getCallersOf(sym.name, sym.owner);
      if (callers.length > 0) {
        lines.push(`  Called by: ${callers.slice(0, 5).map((c) => c.callerId).join(', ')}`);
      }
    }

    if (subgraph.edges.length > 0) {
      lines.push('');
      lines.push('## Connections');
      for (const edge of subgraph.edges) {
        lines.push(`- ${edge.from} → ${edge.to} (${edge.type})`);
      }
    }

    return {
      text: lines.join('\n'),
      symbolCount: subgraph.symbols.length,
      fileCount: files.size,
      communities: Array.from(communities),
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
        // Find connected symbols
        const parts = nodeId.split('.');
        const name = parts.length > 1 ? parts[parts.length - 1] : nodeId;
        const owner = parts.length > 1 ? parts[0] : undefined;

        // Outgoing calls
        const callees = this.graph.getCalleesOf(nodeId);
        for (const call of callees) {
          const calleeId = call.calleeOwner
            ? `${call.calleeOwner}.${call.calleeName}`
            : call.calleeName;
          if (!this.selectedIds.has(calleeId)) {
            nextFrontier.add(calleeId);
          }
        }

        // Incoming calls
        const callers = this.graph.getCallersOf(name, owner);
        for (const call of callers) {
          if (!this.selectedIds.has(call.callerId)) {
            nextFrontier.add(call.callerId);
          }
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
}
