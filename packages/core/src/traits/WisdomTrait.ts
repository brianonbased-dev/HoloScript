/**
 * WisdomTrait — Meta-trait for declarative wisdom patterns
 *
 * Captures battle-tested, reusable insights that apply to one or more
 * traits or categories. Makes implicit knowledge explicit, queryable,
 * and self-documenting at the language level.
 *
 * Events emitted:
 *  wisdom_registered   { node, description, applies_to, source }
 *  wisdom_query_result  { node, wisdoms }
 *
 * CLASS handler:
 *  @onWisdomQuery — invoked when Studio/LSP/MCP queries wisdom metadata
 *
 * @see proposals/WISDOM_AND_GOTCHA_TRAITS_v1.md
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WisdomConfig {
  /** Battle-tested insight description */
  description: string;
  /** Provenance: URL, commit hash, or "community" */
  source: string;
  /** Traits or categories this wisdom applies to */
  applies_to: string[];
  /** Optional example .holo snippet references */
  examples: string[];
}

export interface WisdomEntry {
  description: string;
  source: string;
  applies_to: string[];
  examples: string[];
  nodeId: string | undefined;
  registeredAt: number;
}

interface WisdomState {
  initialized: boolean;
  entry: WisdomEntry;
}

type WisdomNode = HSPlusNode & {
  __wisdomState?: WisdomState;
};

/** Module-level registry for all wisdom entries across the composition */
const wisdomRegistry: Map<string, WisdomEntry[]> = new Map();

// ─── Public API ───────────────────────────────────────────────────────────────

/** Query all wisdom entries, optionally filtered by trait name */
export function queryWisdom(trait?: string): WisdomEntry[] {
  if (!trait) {
    const all: WisdomEntry[] = [];
    for (const entries of wisdomRegistry.values()) {
      all.push(...entries);
    }
    return all;
  }
  return wisdomRegistry.get(trait) ?? [];
}

/** Clear all wisdom entries (for testing) */
export function clearWisdomRegistry(): void {
  wisdomRegistry.clear();
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: WisdomConfig = {
  description: '',
  source: 'community',
  applies_to: [],
  examples: [],
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export const wisdomHandler: TraitHandler<WisdomConfig> = {
  name: 'wisdom',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: WisdomConfig, context: TraitContext): void {
    const wNode = node as WisdomNode;

    if (!config.description) {
      context.emit('wisdom_error', {
        node,
        error: '@wisdom requires a non-empty description',
      });
      return;
    }

    const entry: WisdomEntry = {
      description: config.description,
      source: config.source || 'community',
      applies_to: config.applies_to || [],
      examples: config.examples || [],
      nodeId: node.id,
      registeredAt: Date.now(),
    };

    wNode.__wisdomState = {
      initialized: true,
      entry,
    };

    // Register in module-level registry indexed by each applies_to trait
    if (entry.applies_to.length > 0) {
      for (const trait of entry.applies_to) {
        const key = trait.replace(/^@/, '');
        if (!wisdomRegistry.has(key)) {
          wisdomRegistry.set(key, []);
        }
        wisdomRegistry.get(key)!.push(entry);
      }
    } else {
      // Global wisdom (no specific trait)
      if (!wisdomRegistry.has('_global')) {
        wisdomRegistry.set('_global', []);
      }
      wisdomRegistry.get('_global')!.push(entry);
    }

    context.emit('wisdom_registered', {
      node,
      description: entry.description,
      applies_to: entry.applies_to,
      source: entry.source,
    });
  },

  onDetach(node: HSPlusNode): void {
    const wNode = node as WisdomNode;
    const state = wNode.__wisdomState;
    if (state?.initialized) {
      // Remove from registry
      for (const [key, entries] of wisdomRegistry) {
        const idx = entries.indexOf(state.entry);
        if (idx >= 0) {
          entries.splice(idx, 1);
          if (entries.length === 0) wisdomRegistry.delete(key);
        }
      }
    }
    delete wNode.__wisdomState;
  },

  onUpdate(): void {
    // No per-frame work
  },

  onEvent(
    node: HSPlusNode,
    _config: WisdomConfig,
    context: TraitContext,
    event: { type: string; [key: string]: unknown }
  ): void {
    const wNode = node as WisdomNode;
    const state = wNode.__wisdomState;
    if (!state?.initialized) return;

    // CLASS handler: @onWisdomQuery
    if (event.type === 'wisdom_query') {
      const traitFilter = event.trait as string | undefined;
      const results = queryWisdom(traitFilter);

      context.emit('wisdom_query_result', {
        node,
        trait: traitFilter,
        wisdoms: results,
        count: results.length,
      });
    }
  },
};
