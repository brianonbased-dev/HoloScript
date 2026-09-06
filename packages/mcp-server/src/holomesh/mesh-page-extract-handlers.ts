/**
 * Local fold of one leftover-2 observe extract into existing
 * holomesh_contribute / holomesh_feed_source. Kept out of
 * holomesh-tools.ts so unit tests do not load the full MCP graph.
 */

import { createHash } from 'node:crypto';
import {
  hasCrawlShape,
  meshArgsHavePageExtract,
  observedPageToFeedBlock,
  observedPageToKnowledgeContent,
  resolveMeshObservedPage,
  type HoloMeshPageExtractReceipt,
} from './observed-page-extract';

export interface MeshPageExtractClient {
  getAgentId(): string | null;
  registerAgent(traits: string[]): Promise<string | void>;
  contributeKnowledge(entries: Array<Record<string, unknown>>): Promise<number>;
}

export interface MeshPageExtractFeed {
  appendToFeed(block: string, authorDid: string): void;
  getFeedSource(): string;
}

export async function contributeObservedPageExtract(
  client: MeshPageExtractClient | null,
  args: Record<string, unknown>,
  feed?: MeshPageExtractFeed
): Promise<Record<string, unknown>> {
  if (hasCrawlShape(args)) {
    return {
      error: 'page_extract_not_crawl',
      message: 'Page extract accepts one URL or one observed page only — not a crawl or SERP.',
    };
  }

  let extractContent: string | undefined;
  let extractTags: string[] = [];
  let pageExtract: HoloMeshPageExtractReceipt | undefined;
  let localFeedSource: string | undefined;

  if (meshArgsHavePageExtract(args)) {
    const resolved = await resolveMeshObservedPage(args);
    if (!resolved.ok) {
      return { error: resolved.error, message: resolved.message };
    }
    pageExtract = resolved.receipt;
    extractContent = observedPageToKnowledgeContent(resolved.extract);
    extractTags = ['observed-page', resolved.extract.source];
    const feedAgentId = client?.getAgentId() || process.env.HOLOMESH_AGENT_ID || 'did:agent:local';
    if (feed) {
      feed.appendToFeed(observedPageToFeedBlock(resolved.extract), feedAgentId);
      localFeedSource = feed.getFeedSource();
    }
  }

  const content =
    typeof args.content === 'string' && args.content.trim().length > 0
      ? args.content
      : extractContent;
  if (!content) {
    return {
      error:
        'Contribute requires type+content or one observed page extract (observe / pageExtract / bodyText+markdown+url).',
    };
  }

  if (client && !client.getAgentId()) {
    await client.registerAgent(['@knowledge-exchange']);
  }

  const entryType = (args.type as string) || 'wisdom';
  const entryId = (args.id as string) || `${entryType.charAt(0).toUpperCase()}.auto.${Date.now()}`;
  const provenanceHash = createHash('sha256').update(content).digest('hex');
  const tags = [...(Array.isArray(args.tags) ? (args.tags as string[]) : []), ...extractTags];

  const entry = {
    id: entryId,
    workspaceId: process.env.HOLOMESH_WORKSPACE || 'default',
    type: entryType,
    content,
    provenanceHash,
    authorId: client?.getAgentId() || process.env.HOLOMESH_AGENT_ID || 'did:agent:local',
    authorName: process.env.HOLOMESH_AGENT_NAME || 'holomesh-agent',
    price: (args.price as number) || 0,
    queryCount: 0,
    reuseCount: 0,
    domain: (args.domain as string) || (pageExtract ? 'general' : undefined),
    tags: tags.length > 0 ? tags : (args.tags as string[] | undefined),
    confidence: (args.confidence as number) || 0.9,
    createdAt: new Date().toISOString(),
    ...(pageExtract ? { metadata: { pageExtract } } : {}),
  };

  const synced = client ? await client.contributeKnowledge([entry]) : 0;

  return {
    success: true,
    entryId,
    provenanceHash,
    synced,
    type: entryType,
    ...(pageExtract
      ? {
          pageExtractPresent: true,
          pageExtract,
          localFeedAppended: Boolean(feed),
          feedSource: localFeedSource,
          localOnly: !client,
        }
      : {}),
  };
}

export async function feedSourceObservedPageExtract(
  args: Record<string, unknown> = {},
  feed: MeshPageExtractFeed
): Promise<Record<string, unknown>> {
  if (hasCrawlShape(args)) {
    return {
      error: 'page_extract_not_crawl',
      message: 'Page extract accepts one URL or one observed page only — not a crawl or SERP.',
    };
  }

  if (!meshArgsHavePageExtract(args)) {
    return {
      success: true,
      source: feed.getFeedSource(),
    };
  }

  const resolved = await resolveMeshObservedPage(args);
  if (!resolved.ok) {
    return { error: resolved.error, message: resolved.message };
  }
  const agentId = process.env.HOLOMESH_AGENT_ID || 'did:agent:local';
  feed.appendToFeed(observedPageToFeedBlock(resolved.extract), agentId);
  return {
    success: true,
    source: feed.getFeedSource(),
    pageExtractPresent: true,
    pageExtract: resolved.receipt,
  };
}

export function createMemoryPageExtractFeed(): MeshPageExtractFeed {
  let source = '';
  return {
    appendToFeed(block: string, authorDid: string) {
      source += `\n// @author ${authorDid} @timestamp ${Date.now()}\n${block}\n`;
    },
    getFeedSource() {
      return source;
    },
  };
}
