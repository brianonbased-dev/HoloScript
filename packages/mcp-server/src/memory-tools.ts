/**
 * Memory MCP Tools — holo_memory_* surface
 *
 * Exposes a unified memory API backed by a singleton KnowledgeStore so every
 * agent surface (Claude/Cursor/Gemini/Copilot) shares one queryable store.
 *
 * Taxonomy mapping (MCP abbreviated form → KnowledgeInsight.type):
 *   W (Wisdom)    → 'wisdom'
 *   P (Pattern)   → 'pattern'
 *   G (Gotcha)    → 'gotcha'
 *   F (Feedback)  → 'wisdom'   (feedback is a subclass of durable knowledge)
 *   D (Direction) → 'wisdom'   (strategic direction is a subclass of durable knowledge)
 *
 * Tools:
 *   holo_memory_store    — write an entry
 *   holo_memory_recall   — semantic/keyword query → ranked entries
 *   holo_memory_list     — filter by type/tag, paginated
 *   holo_memory_stats    — counts by type, hot/cold sizes, decay state
 *   holo_memory_farm     — cluster mature entries by theme
 *   holo_memory_graduate — mark a cluster as GOLD-graduation candidate
 */

import * as os from 'os';
import * as path from 'path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { KnowledgeStore } from '@holoscript/framework';
import { ConsolidationEngine } from '@holoscript/framework';
import type { KnowledgeInsight, StoredEntry } from '@holoscript/framework';

// ── Singleton store ──────────────────────────────────────────────────────────

const HOLO_DATA_DIR =
  process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript');
const MEMORY_STORE_PATH = path.join(HOLO_DATA_DIR, 'memory-store.json');
const MEMORY_ARCHIVE_PATH = path.join(HOLO_DATA_DIR, 'memory-archive.json');

let _store: KnowledgeStore | null = null;

function getStore(): KnowledgeStore {
  if (!_store) {
    _store = new KnowledgeStore({
      persist: true,
      path: MEMORY_STORE_PATH,
      remoteUrl: process.env.HOLOSCRIPT_API_URL || undefined,
      remoteApiKey: process.env.HOLOSCRIPT_API_KEY || undefined,
    });
  }
  return _store;
}

// Expose for tests to inject a fresh store
export function _setStoreForTest(store: KnowledgeStore): void {
  _store = store;
}

// ── Taxonomy helpers ─────────────────────────────────────────────────────────

type MemoryTypeMnemonic = 'W' | 'P' | 'G' | 'F' | 'D';
type KnowledgeInsightType = KnowledgeInsight['type'];

const MNEMONIC_TO_INSIGHT_TYPE: Record<MemoryTypeMnemonic, KnowledgeInsightType> = {
  W: 'wisdom',
  P: 'pattern',
  G: 'gotcha',
  F: 'wisdom', // Feedback graduates as durable wisdom
  D: 'wisdom', // Direction graduates as durable wisdom
};

const INSIGHT_TYPE_TO_MNEMONIC: Record<KnowledgeInsightType, MemoryTypeMnemonic> = {
  wisdom: 'W',
  pattern: 'P',
  gotcha: 'G',
};

function toInsightType(mnemonic: string): KnowledgeInsightType {
  const m = (mnemonic as string).toUpperCase() as MemoryTypeMnemonic;
  return MNEMONIC_TO_INSIGHT_TYPE[m] ?? 'wisdom';
}

function toMnemonic(insight: KnowledgeInsightType): MemoryTypeMnemonic {
  return INSIGHT_TYPE_TO_MNEMONIC[insight] ?? 'W';
}

/** Derive a domain tag from content keywords when no explicit domain is given. */
function inferDomain(content: string, tags: string[]): string {
  const text = `${content} ${tags.join(' ')}`.toLowerCase();
  if (/security|auth|secret|token|key|exploit|vuln/.test(text)) return 'security';
  if (/render|3d|webgpu|shader|mesh|gltf|scene/.test(text)) return 'rendering';
  if (/agent|memory|knowledge|protocol|cycle|skill/.test(text)) return 'agents';
  if (/compile|compiler|trait|ast|parse|holoscript/.test(text)) return 'compilation';
  return 'general';
}

/** Shape a StoredEntry for MCP output — keeps output concise. */
function formatEntry(entry: StoredEntry): Record<string, unknown> {
  return {
    id: entry.id,
    type: toMnemonic(entry.type),
    insightType: entry.type,
    content: entry.content,
    domain: entry.domain,
    confidence: entry.confidence,
    source: entry.source,
    authorAgent: entry.authorAgent,
    section: entry.section,
    tags: entry.tags ?? [],
    queryCount: entry.queryCount,
    reuseCount: entry.reuseCount,
    createdAt: entry.createdAt,
    taskId: entry.taskId,
  };
}

// ── Tool definitions ─────────────────────────────────────────────────────────

export const memoryTools: Tool[] = [
  {
    name: 'holo_memory_store',
    description:
      'Write a memory entry to the shared agent knowledge store. All agent surfaces (Claude/Cursor/Gemini/Copilot) can query it. ' +
      'Returns: { id, type, status, synced }.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The memory content to store (1-2 concise sentences; no headers).',
        },
        type: {
          type: 'string',
          enum: ['W', 'P', 'G', 'F', 'D'],
          description:
            'W=Wisdom (durable insight), P=Pattern (reusable template), G=Gotcha (known pitfall), ' +
            'F=Feedback (behavioral rule), D=Direction (strategic direction).',
        },
        domain: {
          type: 'string',
          description:
            'Knowledge domain: security | rendering | agents | compilation | general. Auto-inferred when omitted.',
        },
        confidence: {
          type: 'number',
          description: 'Confidence 0–1 (default 0.8).',
        },
        source: {
          type: 'string',
          description: 'Source reference (e.g. agent handle, commit hash, task ID).',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for filtering and clustering.',
        },
        authorAgent: {
          type: 'string',
          description: 'Agent handle writing this entry (e.g. claude1, cursor2). Defaults to "mcp".',
        },
        syncRemote: {
          type: 'boolean',
          description:
            'When true, embed+sync to the remote knowledge store (pgvector). Default false for speed.',
        },
      },
      required: ['content', 'type'],
    },
  },
  {
    name: 'holo_memory_recall',
    description:
      'Query the shared agent knowledge store by keyword or semantic similarity. Returns ranked entries. ' +
      'Returns: { results: Entry[], total, query, mode }.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (keywords or natural language).',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 10, max 50).',
        },
        type: {
          type: 'string',
          enum: ['W', 'P', 'G', 'F', 'D'],
          description: 'Filter by memory type. Omit to search all types.',
        },
        semantic: {
          type: 'boolean',
          description:
            'When true, use semantic/vector search (requires remote store). Falls back to keyword search.',
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum confidence threshold (0–1). Default 0.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'holo_memory_list',
    description:
      'List memory entries with optional type/tag filter and pagination. ' +
      'Returns: { entries: Entry[], total, page, pageSize }.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['W', 'P', 'G', 'F', 'D'],
          description: 'Filter by memory type.',
        },
        domain: {
          type: 'string',
          description: 'Filter by knowledge domain.',
        },
        tag: {
          type: 'string',
          description: 'Filter entries whose tags include this value.',
        },
        page: {
          type: 'number',
          description: 'Page number (1-based, default 1).',
        },
        pageSize: {
          type: 'number',
          description: 'Entries per page (default 20, max 100).',
        },
      },
      required: [],
    },
  },
  {
    name: 'holo_memory_stats',
    description:
      'Return memory store statistics: counts by type, hot/cold buffer sizes, decay state. ' +
      'Returns: { total, byType, hotBufferByDomain, coldStoreByDomain, archivePath }.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'holo_memory_farm',
    description:
      'Cluster mature memory entries by theme and return proposed story groupings. ' +
      'Groups are derived by tag+type overlap. Use this before holo_memory_graduate to review what would graduate. ' +
      'Returns: { clusters: Cluster[], totalEntries, totalClusters }.',
    inputSchema: {
      type: 'object',
      properties: {
        minClusterSize: {
          type: 'number',
          description: 'Minimum entries per cluster to surface (default 2).',
        },
        domain: {
          type: 'string',
          description: 'Restrict clustering to a specific knowledge domain.',
        },
        type: {
          type: 'string',
          enum: ['W', 'P', 'G', 'F', 'D'],
          description: 'Restrict clustering to a specific memory type.',
        },
      },
      required: [],
    },
  },
  {
    name: 'holo_memory_graduate',
    description:
      'Mark a memory cluster or list of entry IDs as a GOLD-graduation candidate. ' +
      'Emits a structured GraduationPayload — does NOT write to D:/GOLD directly. ' +
      'The payload should be reviewed and committed via the GOLD pipeline. ' +
      'Returns: { graduationId, candidateIds, payload, status }.',
    inputSchema: {
      type: 'object',
      properties: {
        entryIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entry IDs to graduate (from holo_memory_farm cluster.entryIds).',
        },
        title: {
          type: 'string',
          description: 'Title for the GOLD graduation entry.',
        },
        rationale: {
          type: 'string',
          description: 'Why these entries deserve GOLD-vault promotion.',
        },
        tier: {
          type: 'string',
          enum: ['Bronze', 'Silver', 'GOLD'],
          description: 'Target GOLD vault tier (default Silver).',
        },
      },
      required: ['entryIds', 'title', 'rationale'],
    },
  },
];

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function handleMemoryTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'holo_memory_store':
      return handleMemoryStore(args);
    case 'holo_memory_recall':
      return handleMemoryRecall(args);
    case 'holo_memory_list':
      return handleMemoryList(args);
    case 'holo_memory_stats':
      return handleMemoryStats();
    case 'holo_memory_farm':
      return handleMemoryFarm(args);
    case 'holo_memory_graduate':
      return handleMemoryGraduate(args);
    default:
      return null;
  }
}

// ── holo_memory_store ────────────────────────────────────────────────────────

async function handleMemoryStore(args: Record<string, unknown>): Promise<unknown> {
  const content = typeof args.content === 'string' ? args.content.trim() : '';
  if (!content) {
    return { success: false, error: 'content is required and must be a non-empty string.' };
  }

  const typeMnemonic = typeof args.type === 'string' ? args.type : 'W';
  const insightType = toInsightType(typeMnemonic);

  const tagsRaw = Array.isArray(args.tags) ? (args.tags as unknown[]) : [];
  const tags = tagsRaw.filter((t): t is string => typeof t === 'string');

  const domain =
    typeof args.domain === 'string' && args.domain.trim()
      ? args.domain.trim()
      : inferDomain(content, tags);

  const confidence =
    typeof args.confidence === 'number' ? Math.max(0, Math.min(1, args.confidence)) : 0.8;

  const source = typeof args.source === 'string' ? args.source : 'mcp';
  // Identity-keyed authorship (de-silo P0): explicit arg → per-surface seat handle → 'mcp'.
  const authorAgent =
    typeof args.authorAgent === 'string' && args.authorAgent.trim()
      ? args.authorAgent
      : process.env.HOLOMESH_AGENT_NAME || 'mcp';
  // Preserve the uAA2 section letter (W/P/G/F/D) that the 3-value insight type collapses.
  const section = typeof args.type === 'string' ? args.type.toUpperCase() : 'W';
  const syncRemote = args.syncRemote === true;

  const insight: KnowledgeInsight = {
    type: insightType,
    content,
    domain,
    confidence,
    source,
    section,
    tags,
  };

  const store = getStore();

  if (syncRemote) {
    const result = await store.embedAndStore(insight, authorAgent);
    return {
      success: true,
      id: result.entryId,
      type: typeMnemonic,
      insightType,
      status: result.synced ? 'stored_and_synced' : 'stored_local',
      synced: result.synced,
      remoteId: result.remoteId,
    };
  }

  const entry = store.publish(insight, authorAgent);
  return {
    success: true,
    id: entry.id,
    type: typeMnemonic,
    insightType,
    status: 'stored_local',
    synced: false,
  };
}

// ── holo_memory_recall ───────────────────────────────────────────────────────

async function handleMemoryRecall(args: Record<string, unknown>): Promise<unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) {
    return { success: false, error: 'query is required and must be a non-empty string.' };
  }

  const rawLimit = typeof args.limit === 'number' ? args.limit : 10;
  const limit = Math.max(1, Math.min(50, rawLimit));
  const semantic = args.semantic === true;
  const minConfidence = typeof args.minConfidence === 'number' ? args.minConfidence : 0;

  // Optional type filter
  const typeMnemonic = typeof args.type === 'string' ? args.type.toUpperCase() : null;
  const insightTypeFilter =
    typeMnemonic && typeMnemonic in MNEMONIC_TO_INSIGHT_TYPE
      ? MNEMONIC_TO_INSIGHT_TYPE[typeMnemonic as MemoryTypeMnemonic]
      : null;

  const store = getStore();

  let results: StoredEntry[];

  if (semantic) {
    results = await store.semanticSearch(query, {
      limit,
      type: insightTypeFilter ?? undefined,
      minConfidence: minConfidence > 0 ? minConfidence : undefined,
      hybridSearch: true,
    });
  } else {
    results = store.search(query, limit);
    if (insightTypeFilter) {
      results = results.filter((e) => e.type === insightTypeFilter);
    }
    if (minConfidence > 0) {
      results = results.filter((e) => e.confidence >= minConfidence);
    }
  }

  return {
    success: true,
    query,
    mode: semantic ? 'semantic' : 'keyword',
    total: results.length,
    results: results.map(formatEntry),
  };
}

// ── holo_memory_list ─────────────────────────────────────────────────────────

function handleMemoryList(args: Record<string, unknown>): unknown {
  const typeMnemonic = typeof args.type === 'string' ? args.type.toUpperCase() : null;
  const insightTypeFilter =
    typeMnemonic && typeMnemonic in MNEMONIC_TO_INSIGHT_TYPE
      ? MNEMONIC_TO_INSIGHT_TYPE[typeMnemonic as MemoryTypeMnemonic]
      : null;

  const domainFilter = typeof args.domain === 'string' ? args.domain.toLowerCase() : null;
  const tagFilter = typeof args.tag === 'string' ? args.tag.toLowerCase() : null;

  const rawPage = typeof args.page === 'number' ? args.page : 1;
  const page = Math.max(1, rawPage);
  const rawPageSize = typeof args.pageSize === 'number' ? args.pageSize : 20;
  const pageSize = Math.max(1, Math.min(100, rawPageSize));

  const store = getStore();
  let entries = store.all();

  if (insightTypeFilter) {
    entries = entries.filter((e) => e.type === insightTypeFilter);
  }
  if (domainFilter) {
    entries = entries.filter((e) => e.domain.toLowerCase() === domainFilter);
  }
  if (tagFilter) {
    entries = entries.filter((e) => {
      const tags = (e as unknown as { tags?: string[] }).tags ?? [];
      return tags.some((t) => t.toLowerCase() === tagFilter);
    });
  }

  // Sort newest first
  entries = entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = entries.length;
  const start = (page - 1) * pageSize;
  const paged = entries.slice(start, start + pageSize);

  return {
    success: true,
    total,
    page,
    pageSize,
    entries: paged.map(formatEntry),
  };
}

// ── holo_memory_stats ────────────────────────────────────────────────────────

function handleMemoryStats(): unknown {
  const store = getStore();
  const all = store.all();

  const byType: Record<string, number> = { W: 0, P: 0, G: 0 };
  for (const e of all) {
    const m = toMnemonic(e.type);
    byType[m] = (byType[m] ?? 0) + 1;
  }

  // Consolidation engine for hot/cold buffer stats (independent instance used only for stats)
  const engine = new ConsolidationEngine();
  const hotBufferByDomain = engine.getHotBufferStats();
  const coldStoreByDomain = engine.getColdStoreStats();

  return {
    success: true,
    total: store.size,
    byType,
    hotBufferByDomain,
    coldStoreByDomain,
    storePath: MEMORY_STORE_PATH,
    archivePath: MEMORY_ARCHIVE_PATH,
  };
}

// ── holo_memory_farm ─────────────────────────────────────────────────────────

interface MemoryCluster {
  theme: string;
  type: MemoryTypeMnemonic;
  domain: string;
  tags: string[];
  entryIds: string[];
  entryCount: number;
  avgConfidence: number;
  sampleContent: string;
}

function handleMemoryFarm(args: Record<string, unknown>): unknown {
  const minClusterSize = typeof args.minClusterSize === 'number' ? Math.max(1, args.minClusterSize) : 2;
  const domainFilter = typeof args.domain === 'string' ? args.domain.toLowerCase() : null;
  const typeMnemonic = typeof args.type === 'string' ? args.type.toUpperCase() : null;
  const insightTypeFilter =
    typeMnemonic && typeMnemonic in MNEMONIC_TO_INSIGHT_TYPE
      ? MNEMONIC_TO_INSIGHT_TYPE[typeMnemonic as MemoryTypeMnemonic]
      : null;

  const store = getStore();
  let entries = store.all();

  if (domainFilter) {
    entries = entries.filter((e) => e.domain.toLowerCase() === domainFilter);
  }
  if (insightTypeFilter) {
    entries = entries.filter((e) => e.type === insightTypeFilter);
  }

  // Cluster by: domain + type + common tags
  // Key = "domain|insightType|sortedCommonTags"
  const clusterMap = new Map<string, StoredEntry[]>();

  for (const entry of entries) {
    const entryTags = (entry as unknown as { tags?: string[] }).tags ?? [];
    // Primary key: domain + type
    const primaryKey = `${entry.domain}|${entry.type}`;

    // If entry has tags, create per-tag sub-clusters
    if (entryTags.length > 0) {
      for (const tag of entryTags) {
        const key = `${primaryKey}|${tag}`;
        const group = clusterMap.get(key) ?? [];
        group.push(entry);
        clusterMap.set(key, group);
      }
    } else {
      // No tags — group by domain+type only
      const group = clusterMap.get(primaryKey) ?? [];
      group.push(entry);
      clusterMap.set(primaryKey, group);
    }
  }

  const clusters: MemoryCluster[] = [];

  for (const [key, group] of clusterMap) {
    if (group.length < minClusterSize) continue;

    const parts = key.split('|');
    const domain = parts[0] ?? 'general';
    const insightType = (parts[1] ?? 'wisdom') as KnowledgeInsightType;
    const tagPart = parts[2];
    const clusterTags = tagPart ? [tagPart] : [];

    const avgConfidence =
      group.reduce((sum, e) => sum + e.confidence, 0) / group.length;

    // Deduplicate entry IDs within this cluster
    const uniqueIds = [...new Set(group.map((e) => e.id))];
    const uniqueEntries = uniqueIds
      .map((id) => group.find((e) => e.id === id))
      .filter((e): e is StoredEntry => e !== undefined);

    if (uniqueEntries.length < minClusterSize) continue;

    const theme = clusterTags.length > 0
      ? `${domain}:${clusterTags[0]}`
      : `${domain}:${insightType}`;

    // Avoid duplicate clusters (same set of IDs under different keys)
    const idSetKey = uniqueIds.sort().join(',');
    if (clusters.some((c) => c.entryIds.sort().join(',') === idSetKey)) continue;

    clusters.push({
      theme,
      type: toMnemonic(insightType),
      domain,
      tags: clusterTags,
      entryIds: uniqueIds,
      entryCount: uniqueEntries.length,
      avgConfidence: Math.round(avgConfidence * 1000) / 1000,
      sampleContent: uniqueEntries[0]?.content.slice(0, 120) ?? '',
    });
  }

  // Sort by cluster size descending
  clusters.sort((a, b) => b.entryCount - a.entryCount);

  return {
    success: true,
    totalEntries: entries.length,
    totalClusters: clusters.length,
    clusters,
  };
}

// ── holo_memory_graduate ─────────────────────────────────────────────────────

interface GraduationPayload {
  graduationId: string;
  schemaVersion: 'holo_memory.graduation.v1';
  createdAt: string;
  title: string;
  rationale: string;
  tier: string;
  candidateIds: string[];
  entries: Array<{
    id: string;
    type: MemoryTypeMnemonic;
    content: string;
    domain: string;
    confidence: number;
    source: string;
    authorAgent: string;
    createdAt: string;
  }>;
  instructions: string;
}

function handleMemoryGraduate(args: Record<string, unknown>): unknown {
  const entryIds = Array.isArray(args.entryIds)
    ? (args.entryIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];

  if (entryIds.length === 0) {
    return { success: false, error: 'entryIds must be a non-empty array of string IDs.' };
  }

  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (!title) {
    return { success: false, error: 'title is required.' };
  }

  const rationale = typeof args.rationale === 'string' ? args.rationale.trim() : '';
  if (!rationale) {
    return { success: false, error: 'rationale is required.' };
  }

  const tier =
    typeof args.tier === 'string' && ['Bronze', 'Silver', 'GOLD'].includes(args.tier)
      ? args.tier
      : 'Silver';

  const store = getStore();
  const all = store.all();
  const idSet = new Set(entryIds);

  const resolved = all.filter((e) => idSet.has(e.id));
  const missingIds = entryIds.filter((id) => !resolved.find((e) => e.id === id));

  const graduationId = `grad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload: GraduationPayload = {
    graduationId,
    schemaVersion: 'holo_memory.graduation.v1',
    createdAt: new Date().toISOString(),
    title,
    rationale,
    tier,
    candidateIds: entryIds,
    entries: resolved.map((e) => ({
      id: e.id,
      type: toMnemonic(e.type),
      content: e.content,
      domain: e.domain,
      confidence: e.confidence,
      source: e.source,
      authorAgent: e.authorAgent,
      createdAt: e.createdAt,
    })),
    instructions:
      'Review this payload and commit it to the GOLD vault via the knowledge graduation pipeline. ' +
      'Do NOT write to D:/GOLD directly. Use: python farm.py graduate --payload <path>',
  };

  return {
    success: true,
    graduationId,
    candidateIds: entryIds,
    resolvedCount: resolved.length,
    missingIds,
    tier,
    status:
      missingIds.length === 0
        ? 'ready_for_review'
        : 'partial_match_check_missing_ids',
    payload,
  };
}
