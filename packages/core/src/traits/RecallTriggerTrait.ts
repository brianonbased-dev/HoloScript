/**
 * RecallTriggerTrait — Wisdom/Gotcha Atom #2
 *
 * Proactive memory recall triggered by context patterns or events.
 * Composes with @memory_crystal / @agent_memory for retrieval.
 *
 * Gotcha guarded: Low-confidence retrieval spam can derail agents.
 *
 * Events emitted:
 *  recall_start     { node, query, minConfidence }
 *  recall_hit       { node, query, results, topScore }
 *  recall_miss      { node, query, reason }
 *  recall_cooldown  { node, query, remainingMs }
 *  recall_error     { node, error }
 *
 * @see proposals/WISDOM_GOTCHA_ATOMS_BATCH1_RFC.md
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { AgentMemoryState, Memory, MemoryRecallResult } from './AgentMemoryTrait';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecallTriggerConfig {
  /** Query string or pattern to match against memory */
  query: string;
  /** Minimum cosine similarity / keyword score to accept (0.0-1.0) */
  min_confidence: number;
  /** Maximum number of results to return */
  max_results: number;
  /** Cooldown in ms between recall triggers (prevents spam) */
  cooldown_ms: number;
  /** Tags to filter recall by */
  filter_tags: string[];
  /** Event types that trigger recall (empty = manual only) */
  trigger_on_events: string[];
  /** Write results to node state channel */
  write_to_state: boolean;
}

interface RecallState {
  lastRecallAt: number;
  totalRecalls: number;
  totalHits: number;
  totalMisses: number;
}

type RecallNode = HSPlusNode & {
  __recallTriggerState?: RecallState;
  __agentMemoryState?: AgentMemoryState;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: RecallTriggerConfig = {
  query: '',
  min_confidence: 0.3,
  max_results: 5,
  cooldown_ms: 1000,
  filter_tags: [],
  trigger_on_events: [],
  write_to_state: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
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

function performRecall(
  memState: AgentMemoryState,
  query: string,
  config: RecallTriggerConfig,
  embedding?: number[]
): MemoryRecallResult[] {
  const filterTags = config.filter_tags;
  let candidates: Memory[] = [...memState.memories.values()].filter(m => !isExpired(m));

  // Tag filter
  if (filterTags.length > 0) {
    candidates = candidates.filter(m => filterTags.every(t => m.tags.includes(t)));
  }

  let results: MemoryRecallResult[];

  if (embedding && embedding.length > 0) {
    // Semantic search via cosine similarity
    results = candidates
      .filter(m => m.embedding && m.embedding.length > 0)
      .map(m => ({ memory: m, score: cosineSimilarity(embedding, m.embedding!) }))
      .filter(r => r.score >= config.min_confidence)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.max_results);
  } else {
    // Keyword fallback
    const q = query.toLowerCase();
    results = candidates
      .map(m => {
        const content = m.content.toLowerCase();
        const key = m.key.toLowerCase();
        const tagScore = m.tags.some(t => t.toLowerCase().includes(q)) ? 0.3 : 0;
        const keyScore = key.includes(q) ? 0.5 : 0;
        const contentScore = content.includes(q) ? 0.8 : 0;
        return { memory: m, score: Math.max(tagScore, keyScore, contentScore) };
      })
      .filter(r => r.score >= config.min_confidence)
      .sort((a, b) => b.score - a.score)
      .slice(0, config.max_results);
  }

  // Update access stats
  const now = Date.now();
  for (const r of results) {
    r.memory.accessedAt = now;
    r.memory.accessCount++;
  }

  return results;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const recallTriggerHandler: TraitHandler<RecallTriggerConfig> = {
  name: 'recall_trigger',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: RecallTriggerConfig, context: TraitContext): void {
    const recallNode = node as RecallNode;

    // Validate config
    if (config.min_confidence < 0 || config.min_confidence > 1) {
      context.emit('recall_error', {
        node,
        error: `min_confidence must be in [0, 1], got ${config.min_confidence}`,
      });
      return;
    }

    if (!config.query && config.trigger_on_events.length === 0) {
      context.emit('recall_error', {
        node,
        error: 'query must be non-empty or trigger_on_events must be specified',
      });
      return;
    }

    if (config.max_results < 1) {
      context.emit('recall_error', {
        node,
        error: `max_results must be >= 1, got ${config.max_results}`,
      });
      return;
    }

    // Compiler-level check: require memory source in scope
    if (!recallNode.__agentMemoryState && !node.traits?.has('memory_crystal')) {
      context.emit('recall_error', {
        node,
        error: '@recall_trigger requires @agent_memory or @memory_crystal in scope',
      });
    }

    recallNode.__recallTriggerState = {
      lastRecallAt: 0,
      totalRecalls: 0,
      totalHits: 0,
      totalMisses: 0,
    };
  },

  onDetach(node: HSPlusNode): void {
    delete (node as RecallNode).__recallTriggerState;
  },

  onEvent(node: HSPlusNode, config: RecallTriggerConfig, context: TraitContext, event: { type: string; [key: string]: unknown }): void {
    const recallNode = node as RecallNode;
    const recallState = recallNode.__recallTriggerState;
    if (!recallState) return;

    // Check if this event should trigger recall
    const shouldTrigger =
      event.type === 'recall_execute' ||
      (config.trigger_on_events.length > 0 && config.trigger_on_events.includes(event.type));

    if (!shouldTrigger) return;

    // Cooldown guard (prevents retrieval spam)
    const now = Date.now();
    const elapsed = now - recallState.lastRecallAt;
    if (elapsed < config.cooldown_ms) {
      context.emit('recall_cooldown', {
        node,
        query: config.query,
        remainingMs: config.cooldown_ms - elapsed,
      });
      return;
    }

    // Get memory state
    const memState = recallNode.__agentMemoryState;
    if (!memState) {
      context.emit('recall_miss', {
        node,
        query: config.query,
        reason: 'No memory state available',
      });
      return;
    }

    // Perform recall
    const query = (event.query as string) ?? config.query;
    const embedding = event.embedding as number[] | undefined;

    recallState.lastRecallAt = now;
    recallState.totalRecalls++;

    context.emit('recall_start', {
      node,
      query,
      minConfidence: config.min_confidence,
    });

    const results = performRecall(memState, query, config, embedding);

    if (results.length > 0) {
      recallState.totalHits++;
      const topScore = results[0].score;

      context.emit('recall_hit', {
        node,
        query,
        results: results.map(r => ({
          key: r.memory.key,
          content: r.memory.content,
          score: r.score,
          tags: r.memory.tags,
        })),
        topScore,
        resultCount: results.length,
      });

      // Write to state channel for downstream traits
      if (config.write_to_state) {
        context.setState({
          lastRecall: {
            query,
            results: results.map(r => ({
              key: r.memory.key,
              content: r.memory.content,
              score: r.score,
            })),
            timestamp: now,
          },
        });
      }
    } else {
      recallState.totalMisses++;
      context.emit('recall_miss', {
        node,
        query,
        reason: `No results above min_confidence=${config.min_confidence}`,
      });
    }
  },
};
