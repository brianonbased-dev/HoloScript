/**
 * Graph Tooltip Generator
 *
 * Generates rich tooltip content for hovered/selected nodes in the
 * codebase graph visualization. Supports both standard symbol info
 * and Graph RAG search result annotations.
 *
 * @version 1.0.0
 */

import type { ExternalSymbolDefinition } from '../types';
import type { CodebaseGraph } from '../CodebaseGraph';

// =============================================================================
// TYPES
// =============================================================================

export interface TooltipData {
  /** Primary label (symbol name) */
  title: string;
  /** Secondary label (type + language) */
  subtitle: string;
  /** Content lines */
  lines: TooltipLine[];
  /** Graph RAG annotations (if from a search result) */
  ragAnnotations?: RAGAnnotation[];
}

export interface TooltipLine {
  /** Label (e.g., "File", "Signature") */
  label: string;
  /** Value */
  value: string;
  /** Optional icon hint for renderer */
  icon?: 'file' | 'code' | 'link' | 'alert' | 'info';
}

export interface RAGAnnotation {
  /** Annotation type */
  type: 'score' | 'related' | 'impact';
  /** Display text */
  text: string;
  /** Numeric value (for score bars) */
  value?: number;
}

// =============================================================================
// GENERATOR
// =============================================================================

export class GraphTooltipGenerator {
  private graph: CodebaseGraph;

  constructor(graph: CodebaseGraph) {
    this.graph = graph;
  }

  /**
   * Generate tooltip data for a symbol.
   */
  generateTooltip(symbol: ExternalSymbolDefinition): TooltipData {
    const owner = symbol.owner ? `${symbol.owner}.` : '';
    const lines: TooltipLine[] = [];

    // File location
    lines.push({
      label: 'File',
      value: `${symbol.filePath}:${symbol.line}`,
      icon: 'file',
    });

    // Signature
    if (symbol.signature) {
      lines.push({
        label: 'Signature',
        value: symbol.signature,
        icon: 'code',
      });
    }

    // Visibility
    lines.push({
      label: 'Visibility',
      value: symbol.visibility,
    });

    // Lines of code
    if (symbol.loc) {
      lines.push({
        label: 'Lines',
        value: String(symbol.loc),
      });
    }

    // Doc comment (first line)
    if (symbol.docComment) {
      const firstLine = symbol.docComment.split('\n')[0].trim();
      if (firstLine) {
        lines.push({
          label: 'Doc',
          value: firstLine,
          icon: 'info',
        });
      }
    }

    // Callers
    const callers = this.graph.getCallersOf(symbol.name, symbol.owner);
    if (callers.length > 0) {
      lines.push({
        label: 'Called by',
        value: callers.length <= 3
          ? callers.map((c) => c.callerId).join(', ')
          : `${callers.slice(0, 3).map((c) => c.callerId).join(', ')} +${callers.length - 3} more`,
        icon: 'link',
      });
    }

    // Callees
    const callerId = symbol.owner ? `${symbol.owner}.${symbol.name}` : symbol.name;
    const callees = this.graph.getCalleesOf(callerId);
    if (callees.length > 0) {
      lines.push({
        label: 'Calls',
        value: callees.length <= 3
          ? callees.map((c) => c.calleeOwner ? `${c.calleeOwner}.${c.calleeName}` : c.calleeName).join(', ')
          : `${callees.slice(0, 3).map((c) => c.calleeOwner ? `${c.calleeOwner}.${c.calleeName}` : c.calleeName).join(', ')} +${callees.length - 3} more`,
        icon: 'link',
      });
    }

    // Community
    const community = this.graph.getCommunityForFile(symbol.filePath);
    if (community) {
      lines.push({
        label: 'Module',
        value: community,
      });
    }

    // Impact radius
    const impact = this.graph.getSymbolImpact(symbol.name, symbol.owner);
    if (impact.size > 0) {
      lines.push({
        label: 'Impact',
        value: `${impact.size} files affected`,
        icon: 'alert',
      });
    }

    return {
      title: `${owner}${symbol.name}`,
      subtitle: `${symbol.type} · ${symbol.language}`,
      lines,
    };
  }

  /**
   * Generate tooltip with Graph RAG annotations (for search results).
   */
  generateRAGTooltip(
    symbol: ExternalSymbolDefinition,
    ragData: {
      semanticScore: number;
      connectionScore: number;
      impactScore: number;
      relatedSymbols?: string[];
    },
  ): TooltipData {
    const tooltip = this.generateTooltip(symbol);

    const annotations: RAGAnnotation[] = [
      {
        type: 'score',
        text: `Semantic: ${Math.round(ragData.semanticScore * 100)}%`,
        value: ragData.semanticScore,
      },
      {
        type: 'score',
        text: `Connections: ${Math.round(ragData.connectionScore * 100)}%`,
        value: ragData.connectionScore,
      },
      {
        type: 'score',
        text: `Impact: ${Math.round(ragData.impactScore * 100)}%`,
        value: ragData.impactScore,
      },
    ];

    if (ragData.relatedSymbols && ragData.relatedSymbols.length > 0) {
      annotations.push({
        type: 'related',
        text: `Related: ${ragData.relatedSymbols.slice(0, 3).join(', ')}`,
      });
    }

    return {
      ...tooltip,
      ragAnnotations: annotations,
    };
  }

  /**
   * Generate tooltip from a node ID (looks up the symbol in the graph).
   */
  generateFromNodeId(nodeId: string): TooltipData | null {
    // Node IDs may be "Owner.name" or just "name"
    const parts = nodeId.split('.');
    const name = parts.length > 1 ? parts[parts.length - 1] : nodeId;
    const owner = parts.length > 1 ? parts[0] : undefined;

    const symbols = this.graph.findSymbolsByName(name);
    const match = owner
      ? symbols.find((s) => s.owner === owner)
      : symbols[0];

    if (!match) return null;
    return this.generateTooltip(match);
  }
}
