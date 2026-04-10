/**
 * RemotePresence Trait
 *
 * Telepresence with avatar representation for remote collaboration.
 * Enables seeing and interacting with remote participants.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AvatarType = 'head_hands' | 'upper_body' | 'full_body' | 'custom';
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

interface RemotePeer {
  peerId: string;
  avatarType: AvatarType;
  isVoiceActive: boolean;
  isVideoActive: boolean;
  latency: number;
  lastUpdate: number;
  pose: {
    head: {
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number; w: number };
    };
    leftHand?: {
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number; w: number };
    };
    rightHand?: {
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number; w: number };
    };
  };
}

interface RemotePresenceState {
  state: ConnectionState;
  isConnected: boolean;
  localPeerId: string | null;
  latency: number;
  peers: Map<string, RemotePeer>;
  voiceEnabled: boolean;
  videoEnabled: boolean;
  qualityLevel: number; // 0-1
  bandwidthUsage: number; // bytes/sec
}

interface RemotePresenceConfig {
  avatar_type: AvatarType;
  voice_enabled: boolean;
  video_enabled: boolean;
  latency_compensation: boolean;
  quality_adaptive: boolean;
  bandwidth_limit: number; // bytes/sec, 0 = unlimited
  interpolation_buffer: number; // ms
  sync_rate: number; // Hz
}

// =============================================================================
// HANDLER
// =============================================================================

export const remotePresenceHandler: TraitHandler<RemotePresenceConfig> = {
  name: 'remote_presence',

  defaultConfig: {
    avatar_type: 'head_hands',
    voice_enabled: true,
    video_enabled: false,
    latency_compensation: true,
    quality_adaptive: true,
    bandwidth_limit: 0,
    interpolation_buffer: 100,
    sync_rate: 30,
  },

  onAttach(node, config, context) {
    const state: RemotePresenceState = {
      state: 'disconnected',
      isConnected: false,
      localPeerId: null,
      latency: 0,
      peers: new Map(),
      voiceEnabled: config.voice_enabled,
      videoEnabled: config.video_enabled,
      qualityLevel: 1.0,
      bandwidthUsage: 0,
    };
    node.__remotePresenceState = state;

    // Initialize presence system
    context.emit?.('remote_presence_init', {
      node,
      avatarType: config.avatar_type,
      voiceEnabled: config.voice_enabled,
      videoEnabled: config.video_enabled,
      syncRate: config.sync_rate,
    });
  },

  onDetach(node, config, context) {
    const state = node.__remotePresenceState as RemotePresenceState;

    if (state?.isConnected) {
      context.emit?.('remote_presence_disconnect', { node });
    }

    delete node.__remotePresenceState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__remotePresenceState as RemotePresenceState;
    if (!state || !state.isConnected) return;

    // Adaptive quality based on bandwidth
    if (config.quality_adaptive && config.bandwidth_limit > 0) {
      if (state.bandwidthUsage > config.bandwidth_limit * 0.9) {
        state.qualityLevel = Math.max(0.3, state.qualityLevel - delta * 0.5);
      } else if (state.bandwidthUsage < config.bandwidth_limit * 0.5) {
        state.qualityLevel = Math.min(1.0, state.qualityLevel + delta * 0.2);
      }
    }

    // Update remote peer avatars with interpolation
    for (const peer of state.peers.values()) {
      const age = Date.now() - peer.lastUpdate;

      // Skip stale peers
      if (age > 5000) {
        continue;
      }

      // Latency compensation prediction
      if (config.latency_compensation && peer.latency > 0) {
        // Would apply prediction here based on velocity
      }

      context.emit?.('remote_presence_update_avatar', {
        node,
        peerId: peer.peerId,
        pose: peer.pose,
        interpolate: config.interpolation_buffer > 0,
        interpolationTime: config.interpolation_buffer,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__remotePresenceState as RemotePresenceState;
    if (!state) return;

    if (event.type === 'remote_presence_connected') {
      state.state = 'connected';
      state.isConnected = true;
      state.localPeerId = event.peerId as string;

      context.emit?.('on_presence_connected', {
        node,
        peerId: state.localPeerId,
      });
    } else if (event.type === 'remote_presence_disconnected') {
      state.state = 'disconnected';
      state.isConnected = false;
      state.peers.clear();

      context.emit?.('on_presence_disconnected', {
        node,
        reason: event.reason,
      });
    } else if (event.type === 'remote_presence_peer_joined') {
      const peerId = event.peerId as string;

      state.peers.set(peerId, {
        peerId,
        avatarType: (event.avatarType as AvatarType) || 'head_hands',
        isVoiceActive: false,
        isVideoActive: false,
        latency: 0,
        lastUpdate: Date.now(),
        pose: {
          head: {
            position: { x: 0, y: 1.6, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      });

      context.emit?.('remote_presence_spawn_avatar', {
        node,
        peerId,
        avatarType: event.avatarType || 'head_hands',
      });

      context.emit?.('on_peer_joined', {
        node,
        peerId,
        peerCount: state.peers.size,
      });
    } else if (event.type === 'remote_presence_peer_left') {
      const peerId = event.peerId as string;
      state.peers.delete(peerId);

      context.emit?.('remote_presence_remove_avatar', {
        node,
        peerId,
      });

      context.emit?.('on_peer_left', {
        node,
        peerId,
        peerCount: state.peers.size,
      });
    } else if (event.type === 'remote_presence_pose_update') {
      const peerId = event.peerId as string;
      const peer = state.peers.get(peerId);

      if (peer) {
        peer.pose = event.pose as typeof peer.pose;
        peer.lastUpdate = Date.now();
        peer.latency = (event.latency as number) || 0;
      }
    } else if (event.type === 'remote_presence_voice_state') {
      const peerId = event.peerId as string;
      const peer = state.peers.get(peerId);

      if (peer) {
        peer.isVoiceActive = event.isActive as boolean;

        context.emit?.('remote_presence_voice_indicator', {
          node,
          peerId,
          isActive: peer.isVoiceActive,
        });
      }
    } else if (event.type === 'remote_presence_enable_voice') {
      state.voiceEnabled = true;
      context.emit?.('remote_presence_voice_start', { node });
    } else if (event.type === 'remote_presence_disable_voice') {
      state.voiceEnabled = false;
      context.emit?.('remote_presence_voice_stop', { node });
    } else if (event.type === 'remote_presence_enable_video') {
      state.videoEnabled = true;
      context.emit?.('remote_presence_video_start', { node });
    } else if (event.type === 'remote_presence_disable_video') {
      state.videoEnabled = false;
      context.emit?.('remote_presence_video_stop', { node });
    } else if (event.type === 'remote_presence_bandwidth_update') {
      state.bandwidthUsage = event.bytesPerSec as number;
    } else if (event.type === 'remote_presence_latency_update') {
      state.latency = event.latency as number;
    } else if (event.type === 'remote_presence_connect') {
      state.state = 'connecting';
      context.emit?.('remote_presence_connect_request', {
        node,
        avatarType: config.avatar_type,
      });
    } else if (event.type === 'remote_presence_query') {
      context.emit?.('remote_presence_info', {
        queryId: event.queryId,
        node,
        state: state.state,
        isConnected: state.isConnected,
        localPeerId: state.localPeerId,
        peerCount: state.peers.size,
        peers: Array.from(state.peers.values()).map((p) => ({
          peerId: p.peerId,
          avatarType: p.avatarType,
          isVoiceActive: p.isVoiceActive,
          isVideoActive: p.isVideoActive,
          latency: p.latency,
        })),
        latency: state.latency,
        qualityLevel: state.qualityLevel,
        bandwidthUsage: state.bandwidthUsage,
      });
    }
  },
};

export default remotePresenceHandler;
