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
          description:
            'Page URL, used only as a label for markdown/bodyText/observe text. This tool never fetches it: a url with no page text is refused (url_fetch_refused). Fetch the page on the caller side (Studio does this behind an SSRF guard) and pass its text.',
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
// STATE
// =============================================================================
//
// There is deliberately no module-level graph. A shared "active graph" let one
// tenant's call extract from whatever graph the previous caller (any tenant)
// had loaded. The graph is built per request from the page text in the call,
// or handed in by an in-process caller that already holds its own graph.

export interface KnowledgeExtractionContext {
  /** A graph the in-process caller owns (e.g. its own absorb run). Never shared. */
  graph?: CodebaseGraph | null;
}

/** Thrown by the fetch stub below: this tool never fetches a caller-supplied URL. */
const URL_FETCH_REFUSED = 'url_fetch_refused';
const refuseFetch = (async () => {
  throw new Error(URL_FETCH_REFUSED);
}) as unknown as typeof fetch;

// =============================================================================
// HANDLER
// =============================================================================

export async function handleKnowledgeExtractionTool(
  toolName: string,
  args: Record<string, unknown>,
  context: KnowledgeExtractionContext = {}
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
    // Never fetch the caller's URL from this server (SSRF). Text only.
    fetchImpl: refuseFetch,
  };
  let graph: CodebaseGraph | null = context.graph ?? null;
  let pageExtract: Awaited<ReturnType<typeof ingestObservedPage>> | undefined;
  if (hasObservedPageExtractInput(pageExtractInput)) {
    try {
      pageExtract = await ingestObservedPage(pageExtractInput);
      graph = pageExtract.graph;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === URL_FETCH_REFUSED) {
        return respond({
          error: URL_FETCH_REFUSED,
          message:
            'absorb_extract_knowledge does not fetch URLs. Pass the page text (markdown, bodyText or observe); url is only a label.',
        });
      }
      return respond({
        error: 'page_extract_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!graph) {
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
    workspaceId: typeof args.workspaceId === 'string' ? args.workspaceId : undefined,
  };

  const extractor = new KnowledgeExtractor();
  const result: ExtractionResult = extractor.extract(graph, options);

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
