/**
 * SharePlay Trait (V43 Tier 2)
 *
 * Apple SharePlay integration for synchronized visionOS group experiences.
 * Manages session lifecycle, participant tracking, and media synchronisation
 * across FaceTime and spatial computing shared activities.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type SharePlayState = 'idle' | 'joining' | 'active' | 'suspended' | 'ended';
export type SyncPolicy = 'none' | 'playback' | 'full_state' | 'custom';

export interface SharePlayConfig {
  activity_title: string;
  max_participants: number;
  auto_join: boolean;
  sync_policy: SyncPolicy;
  spatial_audio: boolean;
  fallback_to_screen_share: boolean;
}

interface SharePlayParticipant {
  id: string;
  displayName: string;
  isHost: boolean;
  joinedAt: number;
}

interface SharePlaySessionState {
  sessionState: SharePlayState;
  sessionId: string | null;
  isHost: boolean;
  participants: Map<string, SharePlayParticipant>;
  syncedProperties: Record<string, unknown>;
  startedAt: number | null;
}

// =============================================================================
// HANDLER
// =============================================================================

export const sharePlayHandler: TraitHandler<SharePlayConfig> = {
  name: 'shareplay' as any,

  defaultConfig: {
    activity_title: 'Shared Experience',
    max_participants: 8,
    auto_join: true,
    sync_policy: 'full_state',
    spatial_audio: true,
    fallback_to_screen_share: false,
  },

  onAttach(node, config, context) {
    const state: SharePlaySessionState = {
      sessionState: 'idle',
      sessionId: null,
      isHost: false,
      participants: new Map(),
      syncedProperties: {},
      startedAt: null,
    };
    context.setState({ sharePlay: state });
    context.emit('shareplay:ready', { activity: config.activity_title });
  },

  onDetach(node, config, context) {
    const state = context.getState().sharePlay as SharePlaySessionState | undefined;
    if (state?.sessionState === 'active') {
      context.emit('shareplay:ended', { sessionId: state.sessionId });
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().sharePlay as SharePlaySessionState | undefined;
    if (!state) return;

    if (event.type === 'shareplay:start') {
      const payload = event.payload as any;
      state.sessionState = 'active';
      state.sessionId = payload?.sessionId ?? `sp_${Date.now()}`;
      state.isHost = true;
      state.startedAt = Date.now();
      context.emit('shareplay:started', {
        sessionId: state.sessionId,
        activity: config.activity_title,
      });
    } else if (event.type === 'shareplay:join') {
      const payload = event.payload as any;
      state.sessionState = 'active';
      state.sessionId = payload?.sessionId ?? null;
      state.isHost = false;
      state.startedAt = Date.now();
      context.emit('shareplay:joined', { sessionId: state.sessionId });
    } else if (event.type === 'shareplay:end') {
      state.sessionState = 'ended';
      state.participants.clear();
      context.emit('shareplay:ended', { sessionId: state.sessionId });
    } else if (event.type === 'shareplay:participant_joined') {
      const participant = (event.payload as any) as SharePlayParticipant;
      if (state.participants.size < config.max_participants) {
        state.participants.set(participant.id, participant);
        context.emit('shareplay:participant_joined', {
          participantId: participant.id,
          displayName: participant.displayName,
          count: state.participants.size,
        });
      }
    } else if (event.type === 'shareplay:participant_left') {
      const id = (event.payload as any)?.id as string;
      state.participants.delete(id);
      context.emit('shareplay:participant_left', {
        participantId: id,
        count: state.participants.size,
      });
    } else if (event.type === 'shareplay:sync') {
      const payload = event.payload as any;
      if (payload?.properties) {
        state.syncedProperties = { ...state.syncedProperties, ...payload.properties };
        context.emit('shareplay:state_synced', {
          properties: Object.keys(payload.properties),
        });
      }
    }
  },
};
