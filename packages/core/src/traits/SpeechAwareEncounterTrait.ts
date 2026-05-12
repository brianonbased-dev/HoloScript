/**
 * SpeechAwareEncounterTrait
 *
 * v2: voice-channel encounter engine with ReID-backed speaker attribution.
 * v1 fallback: text-channel encounter engine when voice is unavailable.
 *
 * ReID integration:
 * - Consumes ReidEmbeddingTrait embeddings (packages/core/src/traits/ReidEmbeddingTrait.ts).
 * - Maps acoustic/voice-print embeddings to persistent speaker IDs.
 * - Falls back to text-channel speaker naming when ReID confidence is below threshold.
 *
 * CI gate: attribution test >= 80% accuracy on ReID-backed speaker mapping.
 *
 * @version 0.1.0-skeleton
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface SpeakerAttribution {
  speakerId: string;
  confidence: number; // 0.0 – 1.0
  reidEmbeddingId?: string;
  channel: 'voice' | 'text';
}

export interface EncounterTurn {
  turnId: string;
  speakerId: string;
  text: string;
  timestamp: number;
  channel: 'voice' | 'text';
  attribution: SpeakerAttribution;
}

export interface SpeechAwareEncounterConfig {
  /** v2 voice channel enabled. */
  voice_enabled: boolean;
  /** ReID confidence threshold below which we fall back to text naming. */
  reid_confidence_threshold: number;
  /** If true and voice fails, transparently switch to text channel. */
  fallback_to_text: boolean;
  /** Max turns retained in sliding window. */
  max_turns: number;
  /** Backend identifier for ReID service (e.g. 'reid_local', 'reid_cloud'). */
  reid_backend: string;
}

export interface SpeechAwareEncounterState {
  turns: EncounterTurn[];
  speakerMap: Map<string, SpeakerAttribution>; // reidEmbeddingId or textName -> attribution
  currentChannel: 'voice' | 'text';
  voiceAvailable: boolean;
}

function getState(node: HSPlusNode): SpeechAwareEncounterState | undefined {
  return node.__speechAwareEncounterState as SpeechAwareEncounterState | undefined;
}

// =============================================================================
// HANDLER
// =============================================================================

export const speechAwareEncounterHandler: TraitHandler<SpeechAwareEncounterConfig> = {
  name: 'speech_aware_encounter',

  defaultConfig: {
    voice_enabled: true,
    reid_confidence_threshold: 0.75,
    fallback_to_text: true,
    max_turns: 100,
    reid_backend: 'reid_local',
  },

  onAttach(node, config, context) {
    const state: SpeechAwareEncounterState = {
      turns: [],
      speakerMap: new Map(),
      currentChannel: config.voice_enabled ? 'voice' : 'text',
      voiceAvailable: config.voice_enabled,
    };
    node.__speechAwareEncounterState = state;

    context.emit?.('speech_aware_encounter_ready', {
      node,
      channel: state.currentChannel,
      voiceEnabled: config.voice_enabled,
      fallbackToText: config.fallback_to_text,
      reidBackend: config.reid_backend,
    });
  },

  onDetach(node) {
    delete node.__speechAwareEncounterState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'speech_detected') {
      const payload = extractPayload(event);
      const text = String(payload.text ?? '');
      const rawSpeaker = String(payload.speakerId ?? 'unknown');
      const reidEmbeddingId = typeof payload.reidEmbeddingId === 'string' ? payload.reidEmbeddingId : undefined;
      const confidence = typeof payload.confidence === 'number' ? payload.confidence : 0;

      let channel: 'voice' | 'text' = state.currentChannel;
      let attribution: SpeakerAttribution;

      if (state.currentChannel === 'voice' && reidEmbeddingId && confidence >= config.reid_confidence_threshold) {
        const existing = state.speakerMap.get(reidEmbeddingId);
        if (existing) {
          attribution = { ...existing, confidence };
        } else {
          attribution = {
            speakerId: rawSpeaker,
            confidence,
            reidEmbeddingId,
            channel: 'voice',
          };
          state.speakerMap.set(reidEmbeddingId, attribution);
        }
      } else {
        // Text fallback or low-confidence voice
        if (state.currentChannel === 'voice' && config.fallback_to_text && confidence < config.reid_confidence_threshold) {
          channel = 'text';
          state.currentChannel = 'text';
          context.emit?.('speech_channel_switched', {
            node,
            from: 'voice',
            to: 'text',
            reason: 'reid_confidence_below_threshold',
            confidence,
          });
        }
        attribution = {
          speakerId: rawSpeaker,
          confidence,
          channel,
        };
      }

      const turn: EncounterTurn = {
        turnId: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        speakerId: attribution.speakerId,
        text,
        timestamp: Date.now(),
        channel,
        attribution,
      };
      state.turns.push(turn);
      if (state.turns.length > config.max_turns) {
        state.turns.shift();
      }

      context.emit?.('encounter_turn_recorded', {
        node,
        turnId: turn.turnId,
        speakerId: turn.speakerId,
        channel,
        confidence: attribution.confidence,
      });
      return;
    }

    if (event.type === 'speech_channel_request') {
      const payload = extractPayload(event);
      const requested = String(payload.channel ?? 'text') as 'voice' | 'text';
      if (requested === 'voice' && !config.voice_enabled) {
        context.emit?.('speech_channel_request_denied', {
          node,
          requested,
          reason: 'voice_disabled_in_config',
        });
        return;
      }
      const oldChannel = state.currentChannel;
      state.currentChannel = requested;
      state.voiceAvailable = requested === 'voice';
      context.emit?.('speech_channel_switched', {
        node,
        from: oldChannel,
        to: requested,
        reason: 'explicit_request',
      });
      return;
    }

    if (event.type === 'speech_aware_query') {
      const payload = extractPayload(event);
      const speakerId = typeof payload.speakerId === 'string' ? payload.speakerId : undefined;
      const turns = speakerId
        ? state.turns.filter((t) => t.speakerId === speakerId)
        : [...state.turns];
      context.emit?.('speech_aware_encounter_state', {
        queryId: payload.queryId,
        node,
        turns: turns.slice(-20),
        speakerCount: new Set(state.turns.map((t) => t.speakerId)).size,
        currentChannel: state.currentChannel,
      });
      return;
    }
  },
};

export default speechAwareEncounterHandler;
