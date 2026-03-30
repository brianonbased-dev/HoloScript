/**
 * AgentMemoryTrait
 *
 * Persistent, queryable vector memory for HoloScript agents.
 * Replaces ephemeral LLM context windows with durable, searchable memory.
 *
 * Storage backends:
 * - Primary: IndexedDB (local, offline-first)
 * - Optional sync: PostgreSQL via adapter-postgres / pgvector
 *
 * Retrieval: cosine similarity search over embeddings
 *
 * Events:
 *  memory_stored    { node, memory }
 *  memory_recalled  { node, query, results }
 *  memory_forgotten { node, key }
 *  memory_compressed{ node, before, after }
 *  memory_error     { node, error }
 *
 * @version 4.0.0
 * @milestone HoloScript v4.0 — OpenClaw Competitor
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal trait context */
interface TraitCtx {
  emit(event: string, data: Record<string, unknown>): void;
}
/** Node with dynamic agent memory state */
type MemoryNode = Record<string, unknown> & { __agentMemoryState?: AgentMemoryState };

export interface Memory {
  id: string;
  key: string;
  content: string;
  tags: string[];
  embedding: number[] | null;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  ttl: number | null; // ms, null = permanent
  source: string; // trait/scene that stored it
}

export interface MemoryRecallResult {
  memory: Memory;
  score: number; // cosine similarity 0-1
}

export interface AgentMemoryConfig {
  /** Max memories to retain before auto-compressing oldest */
  max_memories: number;
  /** Default TTL in ms. null = permanent */
  default_ttl: number | null;
  /** Embedding model for semantic search */
  embedding_model: 'local' | 'openai' | 'none';
  /** Embedding dimension (must match model) */
  embedding_dim: number;
  /** Auto-compress when memory count exceeds max_memories */
  auto_compress: boolean;
  /** LLM prompt prefix for compression summaries */
  compress_prompt: string;
  /** Sync memories to PostgreSQL via adapter-postgres */
  sync_to_postgres: boolean;
  /** PostgreSQL connection string (if sync enabled) */
  postgres_url: string;
  /** IndexedDB database name */
  db_name: string;
}

export interface AgentMemoryState {
  memories: Map<string, Memory>;
  db: IDBDatabase | null;
  isReady: boolean;
  totalStored: number;
  totalRecalled: number;
  totalCompressed: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AgentMemoryConfig = {
  max_memories: 10_000,
  default_ttl: null,
  embedding_model: 'none',
  embedding_dim: 384,
  auto_compress: true,
  compress_prompt: 'Summarize the following memories into a compact representation:',
  sync_to_postgres: false,
  postgres_url: '',
  db_name: 'holoscript-agent-memory',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function isExpired(memory: Memory): boolean {
  if (memory.ttl === null) return false;
  return Date.now() > memory.createdAt + memory.ttl;
}

/** Open or upgrade IndexedDB store */
async function openDB(dbName: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('memories')) {
        const store = db.createObjectStore('memories', { keyPath: 'id' });
        store.createIndex('key', 'key', { unique: true });
        store.createIndex('tags', 'tags', { multiEntry: true });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => {
      console.warn('[AgentMemoryTrait] IndexedDB not available, using in-memory store');
      resolve(null);
    };
  });
}

async function persistMemory(db: IDBDatabase | null, memory: Memory): Promise<void> {
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction('memories', 'readwrite');
    tx.objectStore('memories').put(memory);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve(); // silent fail
  });
}

async function deleteFromDB(db: IDBDatabase | null, id: string): Promise<void> {
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction('memories', 'readwrite');
    tx.objectStore('memories').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function loadAllFromDB(db: IDBDatabase | null): Promise<Memory[]> {
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction('memories', 'readonly');
    const req = tx.objectStore('memories').getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => resolve([]);
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const agentMemoryHandler = {
  defaultConfig: DEFAULT_CONFIG,

  async onAttach(node: MemoryNode, config: AgentMemoryConfig, ctx: TraitCtx): Promise<void> {
    const db = await openDB(config.db_name);
    const existing = await loadAllFromDB(db);

    const memories = new Map<string, Memory>();
    for (const m of existing) {
      if (!isExpired(m)) memories.set(m.key, m);
    }

    const state: AgentMemoryState = {
      memories,
      db,
      isReady: true,
      totalStored: existing.length,
      totalRecalled: 0,
      totalCompressed: 0,
    };

    node.__agentMemoryState = state;

    ctx.emit('memory_ready', {
      node,
      count: memories.size,
      dbAvailable: db !== null,
    });
  },

  onDetach(node: MemoryNode, _config: AgentMemoryConfig, ctx: TraitCtx): void {
    const state: AgentMemoryState | undefined = node.__agentMemoryState;
    if (!state) return;

    if (state.db) state.db.close();
    ctx.emit('memory_closed', {
      node,
      totalStored: state.totalStored,
      totalRecalled: state.totalRecalled,
    });
    delete node.__agentMemoryState;
  },

  onEvent(
    node: MemoryNode,
    config: AgentMemoryConfig,
    ctx: TraitCtx,
    event: { type: string; payload?: unknown }
  ): void {
    const state: AgentMemoryState | undefined = node.__agentMemoryState;
    if (!state?.isReady) return;

    switch (event.type) {
      case 'memory_store':
        this._store(
          state,
          node,
          config,
          ctx,
          event.payload as {
            key: string;
            content: string;
            tags?: string[];
            ttl?: number | null;
            source?: string;
            embedding?: number[];
          }
        );
        break;
      case 'memory_recall':
        this._recall(
          state,
          node,
          config,
          ctx,
          event.payload as { query: string; top_k?: number; tags?: string[]; embedding?: number[] }
        );
        break;
      case 'memory_forget':
        this._forget(
          state,
          node,
          config,
          ctx,
          event.payload as { key?: string; tag?: string; all?: boolean }
        );
        break;
      case 'memory_compress':
        this._compress(
          state,
          node,
          config,
          ctx,
          event.payload as {
            strategy?: 'oldest' | 'least_accessed' | 'tag';
            keep_percent?: number;
            tag?: string;
          }
        );
        break;
      case 'memory_list':
        this._list(
          state,
          node,
          ctx,
          event.payload as { limit?: number; offset?: number; tags?: string[] }
        );
        break;
      case 'memory_stats':
        this._stats(state, node, ctx);
        break;
    }
  },

  onUpdate(node: MemoryNode, _config: AgentMemoryConfig, _ctx: TraitCtx, _dt: number): void {
    const state: AgentMemoryState | undefined = node.__agentMemoryState;
    if (!state?.isReady) return;
    // Evict expired memories on each update cycle (low-frequency)
    for (const [key, mem] of state.memories) {
      if (isExpired(mem)) state.memories.delete(key);
    }
  },

  // ── Private ops ─────────────────────────────────────────────────────────────

  _store(
    state: AgentMemoryState,
    node: MemoryNode,
    config: AgentMemoryConfig,
    ctx: TraitCtx,
    payload: {
      key: string;
      content: string;
      tags?: string[];
      ttl?: number | null;
      source?: string;
      embedding?: number[];
    }
  ): void {
    if (!payload?.key || !payload?.content) return;

    const memory: Memory = {
      id: generateId(),
      key: payload.key,
      content: payload.content,
      tags: payload.tags ?? [],
      embedding: payload.embedding ?? null,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      ttl: payload.ttl !== undefined ? payload.ttl : config.default_ttl,
      source: payload.source ?? 'unknown',
    };

    // Replace existing by key
    const existing = state.memories.get(payload.key);
    if (existing) deleteFromDB(state.db, existing.id);

    state.memories.set(payload.key, memory);
    state.totalStored++;
    persistMemory(state.db, memory);

    ctx.emit('memory_stored', { node, memory });

    // Auto-compress if over limit
    if (config.auto_compress && state.memories.size > config.max_memories) {
      this._compress(state, node, config, ctx, { strategy: 'oldest', keep_percent: 0.8 });
    }
  },

  _recall(
    state: AgentMemoryState,
    node: MemoryNode,
    _config: AgentMemoryConfig,
    ctx: TraitCtx,
    payload: { query: string; top_k?: number; tags?: string[]; embedding?: number[] }
  ): void {
    if (!payload?.query && !payload?.tags?.length && !payload?.embedding?.length) return;

    state.totalRecalled++;
    const topK = payload.top_k ?? 10;
    const filterTags = payload.tags ?? [];
    const queryEmbedding = payload.embedding ?? null;

    let candidates: Memory[] = [...state.memories.values()].filter((m) => !isExpired(m));

    // Tag filter
    if (filterTags.length > 0) {
      candidates = candidates.filter((m) => filterTags.every((t) => m.tags.includes(t)));
    }

    let results: MemoryRecallResult[];

    if (queryEmbedding && queryEmbedding.length > 0) {
      // Semantic search via cosine similarity
      results = candidates
        .filter((m) => m.embedding && m.embedding.length > 0)
        .map((m) => ({ memory: m, score: cosineSimilarity(queryEmbedding, m.embedding!) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } else {
      // Keyword fallback
      const q = payload.query.toLowerCase();
      results = candidates
        .map((m) => {
          const content = m.content.toLowerCase();
          const key = m.key.toLowerCase();
          const tagScore = m.tags.some((t) => t.toLowerCase().includes(q)) ? 0.3 : 0;
          const keyScore = key.includes(q) ? 0.5 : 0;
          const contentScore = content.includes(q) ? 0.8 : 0;
          return { memory: m, score: Math.max(tagScore, keyScore, contentScore) };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }

    // Update access stats
    const now = Date.now();
    for (const r of results) {
      r.memory.accessedAt = now;
      r.memory.accessCount++;
      persistMemory(state.db, r.memory);
    }

    ctx.emit('memory_recalled', { node, query: payload.query, results, total: results.length });
  },

  _forget(
    state: AgentMemoryState,
    node: MemoryNode,
    _config: AgentMemoryConfig,
    ctx: TraitCtx,
    payload: { key?: string; tag?: string; all?: boolean }
  ): void {
    if (payload?.all) {
      for (const m of state.memories.values()) deleteFromDB(state.db, m.id);
      state.memories.clear();
      ctx.emit('memory_forgotten', { node, key: '*', count: state.memories.size });
      return;
    }

    if (payload?.tag) {
      let count = 0;
      for (const [k, m] of state.memories) {
        if (m.tags.includes(payload.tag)) {
          deleteFromDB(state.db, m.id);
          state.memories.delete(k);
          count++;
        }
      }
      ctx.emit('memory_forgotten', { node, tag: payload.tag, count });
      return;
    }

    if (payload?.key) {
      const m = state.memories.get(payload.key);
      if (!m) return;
      deleteFromDB(state.db, m.id);
      state.memories.delete(payload.key);
      ctx.emit('memory_forgotten', { node, key: payload.key, count: 1 });
    }
  },

  _compress(
    state: AgentMemoryState,
    node: MemoryNode,
    _config: AgentMemoryConfig,
    ctx: TraitCtx,
    payload: { strategy?: 'oldest' | 'least_accessed' | 'tag'; keep_percent?: number; tag?: string }
  ): void {
    const strategy = payload?.strategy ?? 'oldest';
    const keepPercent = payload?.keep_percent ?? 0.8;
    const before = state.memories.size;
    // Use Math.ceil so we never remove more than intended when rounding
    const keepCount = Math.ceil(before * keepPercent);
    const removeCount = before - keepCount;

    if (removeCount <= 0) {
      ctx.emit('memory_compressed', { node, before, after: before, removed: 0 });
      return;
    }

    let sorted: Memory[];
    if (strategy === 'least_accessed') {
      sorted = [...state.memories.values()].sort((a, b) => a.accessCount - b.accessCount);
    } else if (strategy === 'tag' && payload?.tag) {
      sorted = [...state.memories.values()].filter((m) => m.tags.includes(payload.tag!));
    } else {
      sorted = [...state.memories.values()].sort((a, b) => a.createdAt - b.createdAt);
    }

    const toRemove = sorted.slice(0, removeCount);
    for (const m of toRemove) {
      deleteFromDB(state.db, m.id);
      state.memories.delete(m.key);
    }

    state.totalCompressed += removeCount;
    const after = state.memories.size;
    ctx.emit('memory_compressed', { node, before, after, removed: removeCount, strategy });
  },

  _list(
    state: AgentMemoryState,
    node: MemoryNode,
    ctx: TraitCtx,
    payload: { limit?: number; offset?: number; tags?: string[] }
  ): void {
    let list = [...state.memories.values()].filter((m) => !isExpired(m));
    if (payload?.tags?.length) {
      list = list.filter((m) => payload.tags!.every((t) => m.tags.includes(t)));
    }
    const offset = payload?.offset ?? 0;
    const limit = payload?.limit ?? 50;
    const page = list.slice(offset, offset + limit);
    ctx.emit('memory_listed', { node, memories: page, total: list.length, offset, limit });
  },

  _stats(state: AgentMemoryState, node: MemoryNode, ctx: TraitCtx): void {
    ctx.emit('memory_stats', {
      node,
      count: state.memories.size,
      totalStored: state.totalStored,
      totalRecalled: state.totalRecalled,
      totalCompressed: state.totalCompressed,
      dbAvailable: state.db !== null,
    });
  },
} as const;
