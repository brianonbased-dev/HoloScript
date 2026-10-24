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
import { hasObservedPageExtractInput, ingestObservedPage } from '../ingest/ingestObservedPage';

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
        observe: {
          type: 'object',
          description:
            'Live browser_session observe payload (dom.bodyText and/or markdown). Absorbs one page into the existing knowledge-extract path.',
        },
        pageExtract: {
          type: 'object',
          description:
            'Normalized page extract: { url?, title?, bodyText?, markdown? }. Same shape as observe.dom plus top-level markdown.',
        },
        markdown: {
          type: 'string',
          description: 'Observed page markdown from browser_session observe.',
        },
        bodyText: {
          type: 'string',
          description: 'Observed page bodyText from browser_session observe.',
        },
        url: {
          type: 'string',
          description: 'Single page URL to fetch as text and extract. One URL only — not a crawl.',
        },
        title: {
          type: 'string',
          description: 'Optional page title when the observe payload does not include one.',
        },
      },
      required: [],
    },
  },
];

// =============================================================================
// STATE — shares graph state with graph-rag-tools
// =============================================================================

/**
 * One graph per workspace (and owner, when the caller knows it). A request for
 * workspace X only ever sees X's graph: an unknown workspace is an error, never
 * whichever graph was loaded last (cross-tenant read, #617 set).
 *
 * Bounded LRU: at most MAX_KNOWLEDGE_GRAPHS graphs are held; reading or
 * writing a workspace marks it most recent, and the least recent is dropped.
 */
export const DEFAULT_KNOWLEDGE_WORKSPACE = 'auto';
export const MAX_KNOWLEDGE_GRAPHS = 64;
const graphsByWorkspace = new Map<string, CodebaseGraph>();

/** Verified caller identity, supplied by the transport, never by tool args. */
export interface KnowledgeCallerContext {
  ownerId?: string | null;
}

/** The caller's verified owner id, or null when the transport resolved none. */
export function resolvedOwner(ctx?: KnowledgeCallerContext): string | null {
  const owner = ctx?.ownerId;
  return typeof owner === 'string' && owner.trim() ? owner.trim() : null;
}

function graphKey(workspaceId?: string | null, ownerId?: string | null): string {
  const ws =
    typeof workspaceId === 'string' && workspaceId.trim()
      ? workspaceId.trim()
      : DEFAULT_KNOWLEDGE_WORKSPACE;
  const owner = typeof ownerId === 'string' && ownerId.trim() ? ownerId.trim() : '';
  return JSON.stringify([owner, ws]);
}

/**
 * Set the graph for one workspace. `null` clears that workspace's graph; with
 * no workspace and a null graph, every workspace's graph is cleared.
 * Called by the absorb pipeline after building the graph.
 */
export function setKnowledgeExtractionGraph(
  graph: CodebaseGraph | null,
  workspaceId?: string | null,
  ownerId?: string | null
): void {
  if (graph === null && workspaceId === undefined && ownerId === undefined) {
    graphsByWorkspace.clear();
    return;
  }
  const key = graphKey(workspaceId, ownerId);
  graphsByWorkspace.delete(key);
  if (!graph) return;
  graphsByWorkspace.set(key, graph);
  while (graphsByWorkspace.size > MAX_KNOWLEDGE_GRAPHS) {
    const oldest = graphsByWorkspace.keys().next().value;
    if (oldest === undefined) break;
    graphsByWorkspace.delete(oldest);
  }
}

/**
 * Get one workspace's graph (for testing).
 */
export function getActiveGraph(
  workspaceId?: string | null,
  ownerId?: string | null
): CodebaseGraph | null {
  const key = graphKey(workspaceId, ownerId);
  const graph = graphsByWorkspace.get(key);
  if (!graph) return null;
  graphsByWorkspace.delete(key);
  graphsByWorkspace.set(key, graph);
  return graph;
}

// =============================================================================
// HANDLER
// =============================================================================

export async function handleKnowledgeExtractionTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx?: KnowledgeCallerContext
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const respond = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  });

  if (toolName !== 'absorb_extract_knowledge') {
    return respond({ error: `Unknown tool: ${toolName}` });
  }

  const pageExtractInput = {
    observe: args.observe,
    pageExtract: args.pageExtract,
    markdown: typeof args.markdown === 'string' ? args.markdown : undefined,
    bodyText: typeof args.bodyText === 'string' ? args.bodyText : undefined,
    url: typeof args.url === 'string' ? args.url : undefined,
    title: typeof args.title === 'string' ? args.title : undefined,
  };
  const workspaceId = typeof args.workspaceId === 'string' ? args.workspaceId : undefined;
  const ownerId = resolvedOwner(ctx);
  let pageExtract: Awaited<ReturnType<typeof ingestObservedPage>> | undefined;
  if (hasObservedPageExtractInput(pageExtractInput)) {
    try {
      pageExtract = await ingestObservedPage(pageExtractInput);
      // workspaceId is caller-chosen. Only a verified owner may store under it;
      // without one the page graph serves this request only, so it can never
      // overwrite another tenant's workspace graph.
      if (ownerId) setKnowledgeExtractionGraph(pageExtract.graph, workspaceId, ownerId);
    } catch (error) {
      return respond({
        error: 'page_extract_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const activeGraph =
    pageExtract && !ownerId ? pageExtract.graph : getActiveGraph(workspaceId, ownerId);
  if (!activeGraph) {
    return respond({
      error: 'No codebase graph loaded. Run absorb_run_absorb first to build the graph.',
      hint: 'Pass a browser_session observe payload (markdown/bodyText) or one URL, or call absorb_run_absorb / holo_absorb_repo first.',
    });
  }

  const options: ExtractionOptions = {
    minConfidence: typeof args.minConfidence === 'number' ? args.minConfidence : undefined,
    maxPerType: typeof args.maxPerType === 'number' ? args.maxPerType : undefined,
    includeSpeculative:
      typeof args.includeSpeculative === 'boolean' ? args.includeSpeculative : undefined,
    workspaceId,
  };

  const extractor = new KnowledgeExtractor();
  const result: ExtractionResult = extractor.extract(activeGraph, options);

  return respond({
    success: true,
    ...result,
    ...(pageExtract && {
      pageExtract: {
        kind: pageExtract.kind,
        url: pageExtract.extract.url,
        title: pageExtract.extract.title,
        charCount: pageExtract.extract.charCount,
        sha256: pageExtract.extract.sha256,
        source: pageExtract.extract.source,
        sourceFiles: pageExtract.sourceFiles.map((file) => file.path),
        formatId: pageExtract.document.formatId,
        holoPartial: pageExtract.holo.partial,
      },
    }),
    usage: {
      hint: 'Pass these entries to knowledge_publish to add them to the marketplace.',
      example:
        'For each entry: knowledge_publish({ id: entry.id, type: entry.type, content: entry.content, workspace_id: "your-workspace" })',
    },
  });
}
