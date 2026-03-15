/**
 * Faction Trait
 *
 * Faction and reputation system with dynamic relationships.
 * Supports multi-faction relationships, reputation decay, and faction-based AI targeting.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type RelationType = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'allied';

interface FactionRelation {
  factionId: string;
  standing: number; // -100 to 100
  type: RelationType;
  locked: boolean; // Prevents changes
}

interface ReputationChange {
  sourceId: string;
  factionId: string;
  amount: number;
  reason: string;
  timestamp: number;
}

interface FactionState {
  relations: Map<string, FactionRelation>;
  history: ReputationChange[];
  decayTimer: number;
}

interface FactionConfig {
  faction_id: string;
  reputation: Record<string, number>; // Initial standings
  hostile_factions: string[]; // Always hostile
  allied_factions: string[]; // Always allied
  neutral_threshold: number; // Standing for neutral (-25 to 25 typical)
  friendly_threshold: number; // Standing for friendly (25-75 typical)
  allied_threshold: number; // Standing for allied (75+ typical)
  reputation_decay: number; // Decay per second toward neutral
  decay_interval: number; // Seconds between decay ticks
  history_limit: number;
}

function getRelationType(standing: number, factionId: string, config: FactionConfig): RelationType {
  if (config.hostile_factions.includes(factionId)) return 'hostile';
  if (config.allied_factions.includes(factionId)) return 'allied';

  if (standing <= -config.neutral_threshold) return 'hostile';
  if (standing < -config.neutral_threshold * 0.4) return 'unfriendly';
  if (standing > config.allied_threshold) return 'allied';
  if (standing > config.friendly_threshold) return 'friendly';
  return 'neutral';
}

// =============================================================================
// HANDLER
// =============================================================================

export const factionHandler: TraitHandler<FactionConfig> = {
  name: 'faction',

  defaultConfig: {
    faction_id: '',
    reputation: {},
    hostile_factions: [],
    allied_factions: [],
    neutral_threshold: 25,
    friendly_threshold: 50,
    allied_threshold: 75,
    reputation_decay: 0.01,
    decay_interval: 60,
    history_limit: 100,
  },

  onAttach(node, config, context) {
    const relations = new Map<string, FactionRelation>();

    // Initialize from config
    for (const [factionId, standing] of Object.entries(config.reputation)) {
      const locked =
        config.hostile_factions.includes(factionId) || config.allied_factions.includes(factionId);
      relations.set(factionId, {
        factionId,
        standing,
        type: getRelationType(standing, factionId, config),
        locked,
      });
    }

    // Add locked hostile factions
    for (const factionId of config.hostile_factions) {
      if (!relations.has(factionId)) {
        relations.set(factionId, {
          factionId,
          standing: -100,
          type: 'hostile',
          locked: true,
        });
      }
    }

    // Add locked allied factions
    for (const factionId of config.allied_factions) {
      if (!relations.has(factionId)) {
        relations.set(factionId, {
          factionId,
          standing: 100,
          type: 'allied',
          locked: true,
        });
      }
    }

    const state: FactionState = {
      relations,
      history: [],
      decayTimer: 0,
    };
    (node as any).__factionState = state;

    // Register in global faction registry
    context.emit?.('faction_registered', {
      node,
      factionId: config.faction_id,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('faction_unregistered', {
      factionId: config.faction_id,
    });
    delete (node as any).__factionState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__factionState as FactionState;
    if (!state) return;

    // Decay timer
    state.decayTimer += delta;
    if (state.decayTimer >= config.decay_interval) {
      state.decayTimer = 0;

      // Decay all non-locked relations toward neutral
      for (const relation of state.relations.values()) {
        if (relation.locked) continue;

        const previousType = relation.type;

        if (relation.standing > 0) {
          relation.standing = Math.max(0, relation.standing - config.reputation_decay);
        } else if (relation.standing < 0) {
          relation.standing = Math.min(0, relation.standing + config.reputation_decay);
        }

        relation.type = getRelationType(relation.standing, relation.factionId, config);

        if (relation.type !== previousType) {
          context.emit?.('faction_relation_changed', {
            node,
            factionId: relation.factionId,
            from: previousType,
            to: relation.type,
            standing: relation.standing,
          });
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__factionState as FactionState;
    if (!state) return;

    if (event.type === 'reputation_change') {
      const factionId = event.factionId as string;
      const amount = event.amount as number;
      const reason = (event.reason as string) || 'unknown';

      let relation = state.relations.get(factionId);
      if (!relation) {
        relation = {
          factionId,
          standing: 0,
          type: 'neutral',
          locked: false,
        };
        state.relations.set(factionId, relation);
      }

      if (relation.locked) return;

      const previousType = relation.type;
      relation.standing = Math.max(-100, Math.min(100, relation.standing + amount));
      relation.type = getRelationType(relation.standing, factionId, config);

      // Record history
      state.history.push({
        sourceId: (event.sourceId as string) || 'unknown',
        factionId,
        amount,
        reason,
        timestamp: Date.now(),
      });
      if (state.history.length > config.history_limit) {
        state.history.shift();
      }

      context.emit?.('reputation_updated', {
        node,
        factionId,
        standing: relation.standing,
        change: amount,
        reason,
      });

      if (relation.type !== previousType) {
        context.emit?.('faction_relation_changed', {
          node,
          factionId,
          from: previousType,
          to: relation.type,
          standing: relation.standing,
        });
      }
    } else if (event.type === 'get_relation') {
      // Query relation type
      const factionId = event.factionId as string;
      const relation = state.relations.get(factionId);
      context.emit?.('relation_result', {
        queryId: event.queryId,
        factionId,
        relation: relation?.type ?? 'neutral',
        standing: relation?.standing ?? 0,
      });
    } else if (event.type === 'check_hostile') {
      // Quick hostility check
      const targetFaction = event.factionId as string;
      const relation = state.relations.get(targetFaction);
      const isHostile = relation?.type === 'hostile' || relation?.type === 'unfriendly';
      context.emit?.('hostility_result', {
        queryId: event.queryId,
        isHostile,
        standing: relation?.standing ?? 0,
      });
    }
  },
};

export default factionHandler;
