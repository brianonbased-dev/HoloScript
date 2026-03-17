/**
 * MemoryCrystalTrait — Wisdom/Gotcha Atom #1
 *
 * Persistent memory store with capacity modes and prune thresholds.
 * Composes with @agent_memory to provide declarative memory crystallization.
 *
 * Capacity modes:
 * - "semantic": stores embeddings/summaries keyed by relevance
 * - "raw": stores full artifacts until policy pruning
 * - "time-window": keeps a sliding TTL window
 *
 * Gotcha guarded: Unbounded memory growth causes latency and cost blowups.
 *
 * Events emitted:
 *  crystal_initialized    { node, capacity, backend }
 *  crystal_write          { node, key, capacity }
 *  crystal_prune          { node, prunedCount, remaining }
 *  crystal_threshold_warn { node, usage, threshold }
 *  crystal_error          { node, error }
 *
 * @see proposals/WISDOM_GOTCHA_ATOMS_BATCH1_RFC.md
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { AgentMemoryState, Memory } from './AgentMemoryTrait';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CrystalCapacity = 'semantic' | 'raw' | 'time-window';
export type CrystalBackend = 'ipfs' | 'kv';

export interface MemoryCrystalConfig {
  /** Storage capacity mode */
  capacity: CrystalCapacity;
  /** Prune threshold (0.0-1.0): triggers pruning when usage exceeds this fraction */
  prune_threshold: number;
  /** Storage backend */
  backend: CrystalBackend;
  /** Default TTL for time-window mode (ms). Ignored for other modes. */
  time_window_ttl: number;
  /** Max memories before hard limit (overrides agent_memory max if set) */
  max_entries: number;
  /** Auto-emit warning when no @forget_policy is paired */
  warn_unpaired: boolean;
}

interface CrystalState {
  initialized: boolean;
  writeCount: number;
  pruneCount: number;
  lastPruneAt: number;
}

type CrystalNode = HSPlusNode & {
  __memoryCrystalState?: CrystalState;
  __agentMemoryState?: AgentMemoryState;
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: MemoryCrystalConfig = {
  capacity: 'semantic',
  prune_threshold: 0.8,
  backend: 'kv',
  time_window_ttl: 86_400_000, // 24 hours
  max_entries: 10_000,
  warn_unpaired: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMemoryState(node: CrystalNode): AgentMemoryState | null {
  return node.__agentMemoryState ?? null;
}

function getUsageRatio(memState: AgentMemoryState, maxEntries: number): number {
  return memState.memories.size / Math.max(maxEntries, 1);
}

function pruneByCapacity(
  memState: AgentMemoryState,
  capacity: CrystalCapacity,
  targetCount: number,
  timeWindowTtl: number
): Memory[] {
  const memories = [...memState.memories.values()];
  const now = Date.now();
  const pruned: Memory[] = [];

  if (capacity === 'time-window') {
    // Remove entries older than TTL window
    for (const m of memories) {
      if (now - m.createdAt > timeWindowTtl) {
        memState.memories.delete(m.key);
        pruned.push(m);
      }
    }
  } else if (capacity === 'semantic') {
    // Prune lowest-access memories first (proxy for lowest relevance)
    const sorted = memories.sort((a, b) => a.accessCount - b.accessCount);
    const removeCount = Math.max(0, memState.memories.size - targetCount);
    for (let i = 0; i < removeCount && i < sorted.length; i++) {
      memState.memories.delete(sorted[i].key);
      pruned.push(sorted[i]);
    }
  } else {
    // raw: prune oldest first
    const sorted = memories.sort((a, b) => a.createdAt - b.createdAt);
    const removeCount = Math.max(0, memState.memories.size - targetCount);
    for (let i = 0; i < removeCount && i < sorted.length; i++) {
      memState.memories.delete(sorted[i].key);
      pruned.push(sorted[i]);
    }
  }

  return pruned;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const memoryCrystalHandler: TraitHandler<MemoryCrystalConfig> = {
  name: 'memory_crystal',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: MemoryCrystalConfig, context: TraitContext): void {
    const crystalNode = node as CrystalNode;
    const state: CrystalState = {
      initialized: true,
      writeCount: 0,
      pruneCount: 0,
      lastPruneAt: 0,
    };
    crystalNode.__memoryCrystalState = state;

    // Gotcha: warn if no @forget_policy is paired
    if (config.warn_unpaired && !node.traits?.has('forget_policy')) {
      context.emit('crystal_threshold_warn', {
        node,
        warning: 'No @forget_policy paired with @memory_crystal. Memory may grow unbounded.',
      });
    }

    // Validate config at attach time
    if (config.prune_threshold < 0 || config.prune_threshold > 1) {
      context.emit('crystal_error', {
        node,
        error: `prune_threshold must be in [0, 1], got ${config.prune_threshold}`,
      });
      return;
    }

    if (config.capacity === 'semantic') {
      const memState = getMemoryState(crystalNode);
      if (memState && !memState.db) {
        context.emit('crystal_threshold_warn', {
          node,
          warning: 'semantic capacity requires embedding-capable backend. Falling back to keyword search.',
        });
      }
    }

    context.emit('crystal_initialized', {
      node,
      capacity: config.capacity,
      backend: config.backend,
    });
  },

  onDetach(node: HSPlusNode): void {
    delete (node as CrystalNode).__memoryCrystalState;
  },

  onUpdate(node: HSPlusNode, config: MemoryCrystalConfig, context: TraitContext): void {
    const crystalNode = node as CrystalNode;
    const crystalState = crystalNode.__memoryCrystalState;
    const memState = getMemoryState(crystalNode);
    if (!crystalState?.initialized || !memState) return;

    // Check usage against prune threshold
    const usage = getUsageRatio(memState, config.max_entries);
    if (usage >= config.prune_threshold) {
      const targetCount = Math.floor(config.max_entries * config.prune_threshold * 0.9);
      const pruned = pruneByCapacity(memState, config.capacity, targetCount, config.time_window_ttl);

      if (pruned.length > 0) {
        crystalState.pruneCount += pruned.length;
        crystalState.lastPruneAt = Date.now();

        context.emit('crystal_prune', {
          node,
          prunedCount: pruned.length,
          remaining: memState.memories.size,
          capacity: config.capacity,
        });
      }
    }
  },

  onEvent(node: HSPlusNode, config: MemoryCrystalConfig, context: TraitContext, event: { type: string; [key: string]: unknown }): void {
    const crystalNode = node as CrystalNode;
    const crystalState = crystalNode.__memoryCrystalState;
    if (!crystalState?.initialized) return;

    if (event.type === 'memory_stored') {
      crystalState.writeCount++;

      // Apply time-window TTL enforcement on write
      if (config.capacity === 'time-window') {
        const memState = getMemoryState(crystalNode);
        if (memState) {
          const memory = event.memory as Memory | undefined;
          if (memory && (memory.ttl === null || memory.ttl === undefined)) {
            memory.ttl = config.time_window_ttl;
          }
        }
      }

      context.emit('crystal_write', {
        node,
        key: (event.memory as Memory | undefined)?.key,
        capacity: config.capacity,
        writeCount: crystalState.writeCount,
      });

      // Check threshold after write
      const memState = getMemoryState(crystalNode);
      if (memState) {
        const usage = getUsageRatio(memState, config.max_entries);
        if (usage >= config.prune_threshold * 0.9) {
          context.emit('crystal_threshold_warn', {
            node,
            usage: Math.round(usage * 100),
            threshold: Math.round(config.prune_threshold * 100),
          });
        }
      }
    }

    if (event.type === 'crystal_force_prune') {
      const memState = getMemoryState(crystalNode);
      if (memState) {
        const keepPercent = (event.keep_percent as number) ?? 0.5;
        const targetCount = Math.floor(config.max_entries * keepPercent);
        const pruned = pruneByCapacity(memState, config.capacity, targetCount, config.time_window_ttl);
        crystalState.pruneCount += pruned.length;
        crystalState.lastPruneAt = Date.now();

        context.emit('crystal_prune', {
          node,
          prunedCount: pruned.length,
          remaining: memState.memories.size,
          forced: true,
        });
      }
    }
  },
};
