/**
 * @anti_grief Trait — Behavioral Griefing Detection
 *
 * Monitors player behavior patterns to detect and prevent griefing:
 * spawn killing, building destruction, harassment patterns, etc.
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

interface AntiGriefConfig {
  /** Detection sensitivity 0-1 (default: 0.5) */
  sensitivity: number;
  /** Shield activation threshold (grief score, default: 0.7) */
  shield_threshold: number;
  /** Monitoring window in seconds (default: 60) */
  window_seconds: number;
  /** Max kills in window before flagged (default: 5) */
  kill_threshold: number;
  /** Max destructions in window before flagged (default: 10) */
  destruction_threshold: number;
  /** Shield duration in seconds (default: 30) */
  shield_duration: number;
  /** Shield color (default: '#32cd3230') */
  shield_color: string;
  /** Auto-report to moderation (default: true) */
  auto_report: boolean;
}

interface BehaviorRecord {
  kills: number[]; // timestamps
  destructions: number[]; // timestamps
  reports: number[]; // timestamps from other players
  griefScore: number;
}

interface AntiGriefState {
  active: boolean;
  players: Map<string, BehaviorRecord>;
  shieldedPlayers: Map<string, number>; // playerId -> shield expiry
}

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, AntiGriefState>();

export const antiGriefHandler: TraitHandler<AntiGriefConfig> = {
  name: 'anti_grief',
  defaultConfig: {
    sensitivity: 0.5,
    shield_threshold: 0.7,
    window_seconds: 60,
    kill_threshold: 5,
    destruction_threshold: 10,
    shield_duration: 30,
    shield_color: '#32cd3230',
    auto_report: true,
  },

  onAttach(node, config, context) {
    const state: AntiGriefState = {
      active: true,
      players: new Map(),
      shieldedPlayers: new Map(),
    };
    traitState.set(node, state);

    context.emit('anti_grief_create', {
      sensitivity: config.sensitivity,
      shieldThreshold: config.shield_threshold,
      shieldColor: config.shield_color,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      context.emit('anti_grief_destroy', { nodeId: node.id });
      traitState.delete(node);
    }
  },

  onUpdate(node, config, context, _delta) {
    const state = traitState.get(node);
    if (!state?.active) return;

    const now = Date.now();
    const windowMs = config.window_seconds * 1000;

    // Expire old shields
    for (const [playerId, expiry] of state.shieldedPlayers) {
      if (now > expiry) {
        state.shieldedPlayers.delete(playerId);
        context.emit('anti_grief_shield_expired', { playerId });
      }
    }

    // Compute grief scores for monitored players
    for (const [playerId, record] of state.players) {
      // Prune old events
      record.kills = record.kills.filter((t) => now - t < windowMs);
      record.destructions = record.destructions.filter((t) => now - t < windowMs);
      record.reports = record.reports.filter((t) => now - t < windowMs);

      // Compute score
      const killRatio = record.kills.length / config.kill_threshold;
      const destructionRatio = record.destructions.length / config.destruction_threshold;
      const reportBonus = record.reports.length * 0.2;
      record.griefScore = Math.min(
        1,
        (killRatio + destructionRatio + reportBonus) * config.sensitivity
      );

      // Shield victim if griefer detected
      if (record.griefScore >= config.shield_threshold && !state.shieldedPlayers.has(playerId)) {
        context.emit('anti_grief_detected', {
          grieferId: playerId,
          griefScore: record.griefScore,
          kills: record.kills.length,
          destructions: record.destructions.length,
        });

        if (config.auto_report) {
          context.emit('moderation_check', {
            userId: playerId,
            contentType: 'behavior',
            content: `Grief score: ${record.griefScore.toFixed(2)}, kills: ${record.kills.length}, destructions: ${record.destructions.length}`,
          });
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    const getRecord = (playerId: string): BehaviorRecord => {
      if (!state.players.has(playerId)) {
        state.players.set(playerId, { kills: [], destructions: [], reports: [], griefScore: 0 });
      }
      return state.players.get(playerId)!;
    };

    switch (event.type) {
      case 'player_kill': {
        const record = getRecord((event.killerId as string) ?? 'unknown');
        record.kills.push(Date.now());
        break;
      }
      case 'object_destroyed': {
        const record = getRecord((event.destroyerId as string) ?? 'unknown');
        record.destructions.push(Date.now());
        break;
      }
      case 'player_report': {
        const record = getRecord((event.reportedId as string) ?? 'unknown');
        record.reports.push(Date.now());
        break;
      }
      case 'anti_grief_shield_player': {
        const playerId = event.playerId as string | undefined;
        if (playerId) {
          state.shieldedPlayers.set(playerId, Date.now() + config.shield_duration * 1000);
          context.emit('anti_grief_shield_activated', {
            playerId,
            duration: config.shield_duration,
            color: config.shield_color,
          });
        }
        break;
      }
      case 'anti_grief_reset': {
        state.players.clear();
        state.shieldedPlayers.clear();
        break;
      }
    }
  },
};
