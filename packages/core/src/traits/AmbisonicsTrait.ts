/**
 * Ambisonics Trait
 *
 * Higher-order ambisonic encoding and decoding for immersive 360° audio.
 * Supports first through third order ambisonics with binaural decoding.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type Normalization = 'sn3d' | 'n3d' | 'fuma';
type ChannelOrdering = 'acn' | 'fuma' | 'sid';
type DecoderType = 'binaural' | 'stereo' | 'quad' | '5.1' | '7.1' | 'custom';

interface AmbisonicsState {
  isPlaying: boolean;
  currentOrder: number;
  sourceLoaded: boolean;
  decoderReady: boolean;
  rotation: [number, number, number, number];
  gain: number;
}

interface AmbisonicsConfig {
  order: 1 | 2 | 3;
  normalization: Normalization;
  channel_ordering: ChannelOrdering;
  decoder: DecoderType;
  source: string;
  loop: boolean;
  volume: number;
  scene_rotation_lock: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const ambisonicsHandler: TraitHandler<AmbisonicsConfig> = {
  name: 'ambisonics',

  defaultConfig: {
    order: 1,
    normalization: 'sn3d',
    channel_ordering: 'acn',
    decoder: 'binaural',
    source: '',
    loop: true,
    volume: 1.0,
    scene_rotation_lock: false,
  },

  onAttach(node, config, context) {
    const state: AmbisonicsState = {
      isPlaying: false,
      currentOrder: config.order,
      sourceLoaded: false,
      decoderReady: false,
      rotation: [0, 0, 0, 1 ],
      gain: config.volume,
    };
    node.__ambisonicsState = state;

    // Initialize decoder
    context.emit?.('ambisonics_init_decoder', {
      node,
      order: config.order,
      normalization: config.normalization,
      channelOrdering: config.channel_ordering,
      decoderType: config.decoder,
    });

    // Load source if provided
    if (config.source) {
      context.emit?.('ambisonics_load_source', {
        node,
        url: config.source,
        order: config.order,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__ambisonicsState as AmbisonicsState;
    if (state?.isPlaying) {
      context.emit?.('ambisonics_stop', { node });
    }
    context.emit?.('ambisonics_cleanup', { node });
    delete node.__ambisonicsState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__ambisonicsState as AmbisonicsState;
    if (!state) return;

    // Update scene rotation for head tracking
    if (!config.scene_rotation_lock && state.isPlaying) {
      context.emit?.('ambisonics_update_rotation', {
        node,
        rotation: state.rotation,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__ambisonicsState as AmbisonicsState;
    if (!state) return;

    if (event.type === 'ambisonics_source_loaded') {
      state.sourceLoaded = true;
      context.emit?.('ambisonics_ready', { node });
    } else if (event.type === 'ambisonics_decoder_ready') {
      state.decoderReady = true;
    } else if (event.type === 'ambisonics_play') {
      if (state.sourceLoaded && state.decoderReady) {
        state.isPlaying = true;
        context.emit?.('ambisonics_start_playback', {
          node,
          loop: config.loop,
          volume: state.gain,
        });
      }
    } else if (event.type === 'ambisonics_stop') {
      state.isPlaying = false;
      context.emit?.('ambisonics_stop_playback', { node });
    } else if (event.type === 'ambisonics_pause') {
      state.isPlaying = false;
      context.emit?.('ambisonics_pause_playback', { node });
    } else if (event.type === 'listener_rotation_update') {
      state.rotation = event.rotation as typeof state.rotation;
    } else if (event.type === 'ambisonics_set_volume') {
      state.gain = event.volume as number;
      context.emit?.('ambisonics_update_gain', { node, gain: state.gain });
    } else if (event.type === 'ambisonics_set_order') {
      const newOrder = event.order as 1 | 2 | 3;
      if (newOrder !== state.currentOrder) {
        state.currentOrder = newOrder;
        context.emit?.('ambisonics_reconfigure', {
          node,
          order: newOrder,
        });
      }
    }
  },
};

export default ambisonicsHandler;
