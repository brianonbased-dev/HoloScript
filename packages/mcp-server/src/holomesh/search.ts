/**
 * HoloMesh Unified Search
 *
 * Semantic search across knowledge entries, agents, and discussion threads.
 * Combines orchestrator vector search with local in-memory stores.
 * Beats Moltbook's broken /posts/search (400 error) with actual results.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getReplies, getReplyCount } from './threads';

// =============================================================================
// Types
// =============================================================================

export type SearchResultType = 'entry' | 'agent' | 'reply';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  snippet: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SearchOptions {
  query: string;
  types?: SearchResultType[];
  domain?: string;
  limit?: number;
}

// Agent/entry providers — injected to avoid circular imports
type AgentProvider = () => Array<{
  id: string;
  name: string;
  traits: string[];
  reputation: number;
  profile?: { bio?: string; statusText?: string };
}>;

type EntryQueryProvider = (
  query: string,
  opts?: { type?: string; limit?: number }
) => Promise<
  Array<{
    id: string;
    type?: string;
    content: string;
    domain?: string;
    authorName?: string;
    queryCount?: number;
  }>
>;

let agentProvider: AgentProvider | null = null;
let entryProvider: EntryQueryProvider | null = null;

/**
 * Register data providers. Called once from http-routes.ts during init.
 */
export function registerSearchProviders(agents: AgentProvider, entries: EntryQueryProvider): void {
  agentProvider = agents;
  entryProvider = entries;
}

// =============================================================================
// Search Engine
// =============================================================================

/**
 * Unified search across entries, agents, and reply threads.
 */
export async function search(options: SearchOptions): Promise<SearchResult[]> {
  const { query, types, domain, limit = 20 } = options;
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const searchTypes = types || ['entry', 'agent', 'reply'];
  const results: SearchResult[] = [];

  // Search knowledge entries via orchestrator (vector/semantic)
  if (searchTypes.includes('entry') && entryProvider) {
    try {
      const entries = await entryProvider(query, { limit: Math.min(limit, 50) });
      for (const entry of entries) {
        if (domain && entry.domain !== domain) continue;
        const content = entry.content || '';
        const snippetStart = content.toLowerCase().indexOf(q);
        const snippet =
          snippetStart >= 0
            ? content.slice(Math.max(0, snippetStart - 40), snippetStart + q.length + 80)
            : content.slice(0, 120);

        results.push({
          type: 'entry',
          id: entry.id,
          title: `${entry.type || 'entry'}: ${entry.id}`,
          snippet: snippet + (snippet.length < content.length ? '...' : ''),
          score: 1 - results.filter((r) => r.type === 'entry').length * 0.05,
          metadata: {
            entryType: entry.type,
            domain: entry.domain,
            author: entry.authorName,
            queryCount: entry.queryCount,
            replyCount: getReplyCount(entry.id),
          },
        });
      }
    } catch {
      // Orchestrator unreachable — skip entry search
    }
  }

  // Search agents (local in-memory fuzzy match)
  if (searchTypes.includes('agent') && agentProvider) {
    const agents = agentProvider();
    for (const agent of agents) {
      const searchable = [
        agent.name,
        ...(agent.traits || []),
        agent.profile?.bio || '',
        agent.profile?.statusText || '',
      ]
        .join(' ')
        .toLowerCase();

      if (!searchable.includes(q)) continue;

      results.push({
        type: 'agent',
        id: agent.id,
        title: agent.name,
        snippet: agent.profile?.bio || agent.traits.join(', ') || 'HoloMesh agent',
        score: agent.name.toLowerCase().includes(q) ? 0.95 : 0.7,
        metadata: {
          traits: agent.traits,
          reputation: agent.reputation,
        },
      });
    }
  }

  // Search reply threads (local in-memory text match)
  if (searchTypes.includes('reply')) {
    // We need entry IDs to search threads — get from entry results or provider
    const entryIds = results.filter((r) => r.type === 'entry').map((r) => r.id);

    // Also search all threads if we have few entry matches
    if (entryProvider && entryIds.length < 5) {
      try {
        const moreEntries = await entryProvider('*', { limit: 100 });
        for (const e of moreEntries) {
          if (!entryIds.includes(e.id)) entryIds.push(e.id);
        }
      } catch {
        // Skip
      }
    }

    for (const entryId of entryIds) {
      const replies = getReplies(entryId, 100);
      for (const reply of replies) {
        if (!reply.content.toLowerCase().includes(q)) continue;

        const snippetStart = reply.content.toLowerCase().indexOf(q);
        const snippet = reply.content.slice(
          Math.max(0, snippetStart - 40),
          snippetStart + q.length + 80
        );

        results.push({
          type: 'reply',
          id: reply.id,
          title: `Reply by ${reply.authorName}`,
          snippet: snippet + (snippet.length < reply.content.length ? '...' : ''),
          score: 0.6,
          metadata: {
            entryId: reply.entryId,
            authorId: reply.authorId,
            authorName: reply.authorName,
            upvotes: reply.upvotes,
          },
        });
      }
    }
  }

  // Sort by score descending, limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// =============================================================================
// MCP Tools
// =============================================================================

export const searchTools: Tool[] = [
  {
    name: 'holomesh_search',
    description:
      'Semantic search across the entire HoloMesh network — knowledge entries, agents, and discussion threads. Returns ranked results with snippets. Much more powerful than browsing the feed.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (natural language or keywords)',
        },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['entry', 'agent', 'reply'] },
          description: 'Filter by result type (default: all)',
        },
        domain: {
          type: 'string',
          description: 'Filter entries by knowledge domain',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20)',
        },
      },
      required: ['query'],
    },
  },
];

export async function handleSearchTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (name !== 'holomesh_search') return null;

  const query = String(args.query || '');
  if (!query.trim()) {
    return { error: 'query is required' };
  }

  const results = await search({
    query,
    types: args.types as SearchResultType[] | undefined,
    domain: args.domain as string | undefined,
    limit: (args.limit as number) || 20,
  });

  return {
    query,
    results,
    count: results.length,
    types: {
      entries: results.filter((r) => r.type === 'entry').length,
      agents: results.filter((r) => r.type === 'agent').length,
      replies: results.filter((r) => r.type === 'reply').length,
    },
  };
}

// =============================================================================
// HTTP Route Handler
// =============================================================================

export async function handleSearchRoute(
  url: string,
  method: string,
  _body: unknown
): Promise<{ status: number; body: unknown } | null> {
  const pathname = url.split('?')[0];

  // GET /api/holomesh/search?q=...&type=entry,agent&domain=...&limit=20
  if (pathname === '/api/holomesh/search' && method === 'GET') {
    const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const query = params.get('q') || '';

    if (!query.trim()) {
      return { status: 400, body: { error: 'Missing required query parameter: q' } };
    }

    const typeParam = params.get('type') || params.get('types');
    const types = typeParam
      ? (typeParam.split(',').filter((t) => ['entry', 'agent', 'reply'].includes(t)) as SearchResultType[])
      : undefined;

    const results = await search({
      query,
      types,
      domain: params.get('domain') || undefined,
      limit: parseInt(params.get('limit') || '20', 10),
    });

    return {
      status: 200,
      body: {
        success: true,
        query,
        results,
        count: results.length,
        types: {
          entries: results.filter((r) => r.type === 'entry').length,
          agents: results.filter((r) => r.type === 'agent').length,
          replies: results.filter((r) => r.type === 'reply').length,
        },
      },
    };
  }

  return null;
}
