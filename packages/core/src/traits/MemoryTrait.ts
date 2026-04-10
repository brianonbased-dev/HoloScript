/**
 * Memory Trait
 *
 * Persistent agent memory with episodic and semantic memory banks.
 * Supports importance-weighted storage, relevance-based retrieval, and temporal decay.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type MemoryType = 'episodic' | 'semantic' | 'procedural';

interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  tags: string[];
  importance: number; // 0-1 scale
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  associations: string[]; // IDs of related memories
  context: Record<string, unknown>;
}

interface MemoryState {
  memories: Map<string, Memory>;
  workingMemory: string[]; // IDs of recently accessed memories
  decayTimer: number;
  nextId: number;
}

interface MemoryConfig {
  memory_type: MemoryType;
  capacity: number;
  decay_rate: number; // How much importance decays per interval
  decay_interval: number; // Seconds between decay ticks
  importance_threshold: number; // Minimum importance to retain
  retrieval_mode: 'relevance' | 'recency' | 'importance';
  working_memory_size: number;
  persist_across_sessions: boolean;
  consolidation_interval: number; // Sleep/consolidation cycle in seconds
}

// =============================================================================
// HELPERS
// =============================================================================

function generateId(state: MemoryState): string {
  return `mem_${state.nextId++}`;
}

function calculateRelevance(memory: Memory, query: string, tags: string[]): number {
  let score = 0;

  // Tag matching
  const matchingTags = memory.tags.filter((t) => tags.includes(t));
  score += matchingTags.length * 0.3;

  // Content similarity (simple word overlap)
  const queryWords = query.toLowerCase().split(/\s+/);
  const contentWords = memory.content.toLowerCase().split(/\s+/);
  const overlap = queryWords.filter((w) => contentWords.includes(w)).length;
  score += (overlap / Math.max(queryWords.length, 1)) * 0.4;

  // Importance boost
  score += memory.importance * 0.2;

  // Recency boost (exponential decay over 24 hours)
  const ageHours = (Date.now() - memory.timestamp) / (1000 * 60 * 60);
  score += Math.exp(-ageHours / 24) * 0.1;

  return Math.min(1, score);
}

function sortMemories(memories: Memory[], mode: MemoryConfig['retrieval_mode']): Memory[] {
  switch (mode) {
    case 'recency':
      return memories.sort((a, b) => b.lastAccessed - a.lastAccessed);
    case 'importance':
      return memories.sort((a, b) => b.importance - a.importance);
    case 'relevance':
    default:
      // Relevance sorting happens during retrieval
      return memories;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const memoryHandler: TraitHandler<MemoryConfig> = {
  name: 'memory',

  defaultConfig: {
    memory_type: 'episodic',
    capacity: 1000,
    decay_rate: 0.01,
    decay_interval: 60,
    importance_threshold: 0.3,
    retrieval_mode: 'relevance',
    working_memory_size: 7,
    persist_across_sessions: false,
    consolidation_interval: 300,
  },

  onAttach(node, config, context) {
    const state: MemoryState = {
      memories: new Map(),
      workingMemory: [],
      decayTimer: 0,
      nextId: 1,
    };
    node.__memoryState = state;

    // Try to load persisted memories
    if (config.persist_across_sessions) {
      context.emit?.('memory_load_request', { node });
    }
  },

  onDetach(node, config, context) {
    const state = node.__memoryState as MemoryState;

    // Persist before detach
    if (config.persist_across_sessions && state) {
      const serialized = Array.from(state.memories.values());
      context.emit?.('memory_save', { node, memories: serialized });
    }

    delete node.__memoryState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__memoryState as MemoryState;
    if (!state) return;

    state.decayTimer += delta;

    if (state.decayTimer >= config.decay_interval) {
      state.decayTimer = 0;

      // Apply decay to all memories
      const toRemove: string[] = [];

      for (const [id, memory] of state.memories) {
        // Decay based on time since last access
        const hoursSinceAccess = (Date.now() - memory.lastAccessed) / (1000 * 60 * 60);
        const decayFactor = Math.exp(-hoursSinceAccess * config.decay_rate);
        memory.importance *= decayFactor;

        // Remove if below threshold
        if (memory.importance < config.importance_threshold) {
          toRemove.push(id);
        }
      }

      // Remove forgotten memories
      for (const id of toRemove) {
        state.memories.delete(id);
        context.emit?.('memory_forgotten', { node, memoryId: id });
      }

      // Enforce capacity limit
      if (state.memories.size > config.capacity) {
        const sorted = sortMemories(Array.from(state.memories.values()), 'importance');
        while (state.memories.size > config.capacity) {
          const toForget = sorted.pop();
          if (toForget) {
            state.memories.delete(toForget.id);
          }
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__memoryState as MemoryState;
    if (!state) return;

    if (event.type === 'remember') {
      // Store a new memory
      const memory: Memory = {
        id: generateId(state),
        type: (event.memoryType as MemoryType) || config.memory_type,
        content: event.content as string,
        tags: (event.tags as string[]) || [],
        importance: (event.importance as number) ?? 0.5,
        timestamp: Date.now(),
        accessCount: 0,
        lastAccessed: Date.now(),
        associations: (event.associations as string[]) || [],
        context: (event.context as Record<string, unknown>) || {},
      };

      state.memories.set(memory.id, memory);

      // Add to working memory
      state.workingMemory.unshift(memory.id);
      if (state.workingMemory.length > config.working_memory_size) {
        state.workingMemory.pop();
      }

      context.emit?.('memory_stored', { node, memory });
    } else if (event.type === 'recall') {
      // Retrieve memories matching query
      const query = (event.query as string) || '';
      const tags = (event.tags as string[]) || [];
      const limit = (event.limit as number) || 5;

      const results: Array<{ memory: Memory; relevance: number }> = [];

      for (const memory of state.memories.values()) {
        const relevance = calculateRelevance(memory, query, tags);
        if (relevance > 0.1) {
          results.push({ memory, relevance });
        }
      }

      // Sort by relevance and take top results
      results.sort((a, b) => b.relevance - a.relevance);
      const topResults = results.slice(0, limit);

      // Update access counts and times
      for (const result of topResults) {
        result.memory.accessCount++;
        result.memory.lastAccessed = Date.now();

        // Strengthen importance on access
        result.memory.importance = Math.min(1, result.memory.importance + 0.1);

        // Update working memory
        const idx = state.workingMemory.indexOf(result.memory.id);
        if (idx !== -1) state.workingMemory.splice(idx, 1);
        state.workingMemory.unshift(result.memory.id);
      }

      // Trim working memory
      state.workingMemory = state.workingMemory.slice(0, config.working_memory_size);

      context.emit?.('memory_recalled', {
        node,
        queryId: event.queryId,
        results: topResults.map((r) => ({ ...r.memory, relevance: r.relevance })),
      });
    } else if (event.type === 'forget') {
      // Explicitly remove a memory
      const memoryId = event.memoryId as string;
      if (state.memories.has(memoryId)) {
        state.memories.delete(memoryId);
        state.workingMemory = state.workingMemory.filter((id) => id !== memoryId);
        context.emit?.('memory_forgotten', { node, memoryId });
      }
    } else if (event.type === 'associate') {
      // Link two memories
      const sourceId = event.sourceId as string;
      const targetId = event.targetId as string;

      const source = state.memories.get(sourceId);
      const target = state.memories.get(targetId);

      if (source && target) {
        if (!source.associations.includes(targetId)) {
          source.associations.push(targetId);
        }
        if (!target.associations.includes(sourceId)) {
          target.associations.push(sourceId);
        }
        context.emit?.('memories_associated', { node, sourceId, targetId });
      }
    } else if (event.type === 'get_working_memory') {
      const memories = state.workingMemory
        .map((id) => state.memories.get(id))
        .filter((m): m is Memory => !!m);

      context.emit?.('working_memory_result', {
        node,
        queryId: event.queryId,
        memories,
      });
    } else if (event.type === 'memory_load_response') {
      // Restore persisted memories
      const loaded = event.memories as Memory[];
      if (Array.isArray(loaded)) {
        for (const memory of loaded) {
          state.memories.set(memory.id, memory);
          state.nextId = Math.max(state.nextId, parseInt(memory.id.replace('mem_', '')) + 1);
        }
      }
    }
  },
};

export default memoryHandler;
