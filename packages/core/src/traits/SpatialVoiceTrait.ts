/**
 * @spatial_voice Trait — WebRTC Spatial Voice Chat
 *
 * Spatialized voice communication using WebRTC for transport and
 * HRTF (Head-Related Transfer Function) for 3D audio positioning.
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

interface SpatialVoiceConfig {
  /** Voice range in world units (default: 20) */
  range: number;
  /** Rolloff model (default: 'inverse') */
  rolloff: 'linear' | 'inverse' | 'exponential';
  /** Rolloff factor (default: 1.0) */
  rolloff_factor: number;
  /** Enable HRTF spatialization (default: true) */
  hrtf: boolean;
  /** Voice activity detection threshold in dB (default: -40) */
  vad_threshold: number;
  /** Echo cancellation (default: true) */
  echo_cancellation: boolean;
  /** Noise suppression (default: true) */
  noise_suppression: boolean;
  /** Max simultaneous voice streams (default: 8) */
  max_streams: number;
}

interface SpatialVoiceState {
  active: boolean;
  isSpeaking: boolean;
  connectedPeers: Set<string>;
  localVolume: number;
}

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, SpatialVoiceState>();

export const spatialVoiceHandler: TraitHandler<SpatialVoiceConfig> = {
  name: 'spatial_voice',
  defaultConfig: {
    range: 20,
    rolloff: 'inverse',
    rolloff_factor: 1.0,
    hrtf: true,
    vad_threshold: -40,
    echo_cancellation: true,
    noise_suppression: true,
    max_streams: 8,
  },

  onAttach(node, config, context) {
    const state: SpatialVoiceState = {
      active: true,
      isSpeaking: false,
      connectedPeers: new Set(),
      localVolume: 0,
    };
    traitState.set(node, state);

    context.emit('spatial_voice_create', {
      range: config.range,
      rolloff: config.rolloff,
      rolloffFactor: config.rolloff_factor,
      hrtf: config.hrtf,
      vadThreshold: config.vad_threshold,
      echoCancellation: config.echo_cancellation,
      noiseSuppression: config.noise_suppression,
      maxStreams: config.max_streams,
    });
  },

  onDetach(node, _config, context) {
    const state = traitState.get(node);
    if (state) {
      context.emit('spatial_voice_destroy', { nodeId: node.id });
      state.connectedPeers.clear();
      traitState.delete(node);
    }
  },

  onUpdate(node, config, context, _delta) {
    const state = traitState.get(node);
    if (!state?.active) return;

    // Emit position update for spatialization
    context.emit('spatial_voice_position', {
      nodeId: node.id,
      range: config.range,
    });
  },

  onEvent(node, _config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    switch (event.type) {
      case 'voice_peer_connected':
        state.connectedPeers.add(event.peerId as string);
        context.emit('spatial_voice_peer_joined', {
          peerId: event.peerId,
          peerCount: state.connectedPeers.size,
        });
        break;
      case 'voice_peer_disconnected':
        state.connectedPeers.delete(event.peerId as string);
        context.emit('spatial_voice_peer_left', {
          peerId: event.peerId,
          peerCount: state.connectedPeers.size,
        });
        break;
      case 'voice_mute':
        state.active = false;
        context.emit('spatial_voice_muted', {});
        break;
      case 'voice_unmute':
        state.active = true;
        context.emit('spatial_voice_unmuted', {});
        break;
      case 'voice_vad_event':
        state.isSpeaking = (event.speaking as boolean) ?? false;
        context.emit('on_voice_activity', {
          speaking: state.isSpeaking,
          volume: (event.volume as number) ?? 0,
        });
        break;
    }
  },
};
