/**
 * Knowledge Extraction MCP Tools
 *
 * Automatically extracts W/P/G (Wisdom, Pattern, Gotcha) entries from an
 * absorbed codebase graph. This is the bridge between `absorb_run_absorb`
 * and `knowledge_publish` — it turns raw graph data into publishable
 * marketplace entries.
 *
 * Tools:
 * - absorb_extract_knowledge: Run knowledge extraction on a graph
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { KnowledgeExtractor } from '../engine/KnowledgeExtractor';
import type { ExtractionOptions, ExtractionResult } from '../engine/KnowledgeExtractor';
import type { CodebaseGraph } from '../engine/CodebaseGraph';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const knowledgeExtractionTools: Tool[] = [
  {
    name: 'absorb_extract_knowledge',
    description:
      'Extract W/P/G (Wisdom/Pattern/Gotcha) knowledge entries from an absorbed codebase. Analyzes the knowledge graph to identify architectural patterns, code gotchas, and design wisdom. Run after absorb_run_absorb to auto-generate publishable knowledge. Returns entries ready for knowledge_publish.',
    inputSchema: {
      type: 'object',
      properties: {
        minConfidence: {
          type: 'number',
          description:
            'Minimum confidence threshold 0.0-1.0 (default: 0.5). Lower values produce more speculative entries.',
        },
        maxPerType: {
          type: 'number',
          description: 'Maximum entries per type (wisdom/pattern/gotcha). Default: 20.',
        },
        includeSpeculative: {
          type: 'boolean',
          description: 'Include low-confidence speculative entries (default: false).',
        },
        workspaceId: {
          type: 'string',
          description: 'Workspace/project name for entry IDs (default: "auto").',
        },
      },
      required: [],
    },
  },
];

// =============================================================================
// STATE — shares graph state with graph-rag-tools
// =============================================================================

let activeGraph: CodebaseGraph | null = null;

/**
 * Set the active graph for knowledge extraction.
 * Called by the absorb pipeline after building the graph.
 */
export function setKnowledgeExtractionGraph(graph: CodebaseGraph | null): void {
  activeGraph = graph;
}

/**
 * Get the active graph (for testing).
 */
export function getActiveGraph(): CodebaseGraph | null {
  return activeGraph;
}

// =============================================================================
// HANDLER
// =============================================================================

export async function handleKnowledgeExtractionTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const respond = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  });

  if (toolName !== 'absorb_extract_knowledge') {
    return respond({ error: `Unknown tool: ${toolName}` });
  }

  if (!activeGraph) {
    return respond({
      error: 'No codebase graph loaded. Run absorb_run_absorb first to build the graph.',
      hint: 'The knowledge extraction pipeline requires an absorbed codebase graph. Call absorb_run_absorb with a repo path, then call this tool.',
    });
  }

  const options: ExtractionOptions = {
    minConfidence: typeof args.minConfidence === 'number' ? args.minConfidence : undefined,
    maxPerType: typeof args.maxPerType === 'number' ? args.maxPerType : undefined,
    includeSpeculative:
      typeof args.includeSpeculative === 'boolean' ? args.includeSpeculative : undefined,
    workspaceId: typeof args.workspaceId === 'string' ? args.workspaceId : undefined,
  };

  const extractor = new KnowledgeExtractor();
  const result: ExtractionResult = extractor.extract(activeGraph, options);

  return respond({
    success: true,
    ...result,
    usage: {
      hint: 'Pass these entries to knowledge_publish to add them to the marketplace.',
      example:
        'For each entry: knowledge_publish({ id: entry.id, type: entry.type, content: entry.content, workspace_id: "your-workspace" })',
    },
  });
}
