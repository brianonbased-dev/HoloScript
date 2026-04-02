/**
 * Social VR Traits for HoloScript
 *
 * New traits for social sharing, collaboration, and X platform integration.
 * These traits enable AI-generated scenes to be easily shared and experienced
 * collaboratively on social platforms.
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface ShareableConfig {
  camera: [number, number, number];
  target: [number, number, number];
  animation: 'rotate' | 'orbit' | 'zoom' | 'none';
  duration: number;
  format: 'png' | 'gif' | 'mp4' | 'webp';
  resolution: [number, number];
  includeQR: boolean;
}

interface CollaborativeConfig {
  sync: 'realtime' | 'periodic' | 'manual';
  maxUsers: number;
  permissions: ('view' | 'edit' | 'delete')[];
  cursors: boolean;
  voice: boolean;
  presence: boolean;
}

interface TweetableConfig {
  template: string;
  hashtags: string[];
  mention: string;
  includePreview: boolean;
  autoThread: boolean;
}

// =============================================================================
// @shareable HANDLER
// =============================================================================

/**
 * @shareable - Auto-generates X-optimized previews for sharing
 *
 * When applied to an object or scene, automatically generates:
 * - Preview image for social cards
 * - Animated GIF for engagement
 * - QR code for mobile XR access
 */
export const shareableHandler: TraitHandler<ShareableConfig> = {
  name: 'shareable',

  defaultConfig: {
    camera: [5, 2, 5],
    target: [0, 0, 0],
    animation: 'rotate',
    duration: 3000,
    format: 'gif',
    resolution: [1200, 630],
    includeQR: true,
  },

  onAttach(node, _config, _context) {
    const state: Record<string, unknown> = {
      previewGenerated: false,
      previewUrl: null,
      qrCodeUrl: null,
    };
    node.__shareableState = state;
  },

  onDetach(node) {
    delete node.__shareableState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Preview generation is handled externally
  },

  onEvent(node, config, context, event) {
    if (event.type === 'share') {
      context.emit('on_share', {
        node,
        platform: (event as Record<string, unknown>).platform || 'x',
      });
    }
  },
};

// =============================================================================
// @collaborative HANDLER
// =============================================================================

/**
 * @collaborative - Real-time multi-user editing via WebRTC
 *
 * Enables multiple users to interact with and modify objects
 * simultaneously. Perfect for building in X threads together.
 */
export const collaborativeHandler: TraitHandler<CollaborativeConfig> = {
  name: 'collaborative',

  defaultConfig: {
    sync: 'realtime',
    maxUsers: 10,
    permissions: ['view'],
    cursors: true,
    voice: false,
    presence: true,
  },

  onAttach(node, config, context) {
    const state: Record<string, unknown> = {
      users: new Map(),
      editHistory: [],
      isConnected: false,
      localStream: null,
    };
    node.__collaborativeState = state;

    // Initialize Voice Chat if enabled
    if (config.voice) {
      this.initializeVoice(node, context);
    }
  },

  onDetach(node) {
    const state = node.__collaborativeState;
    if (state && state.localStream) {
      (state.localStream as MediaStream).getTracks().forEach((track) => track.stop());
    }
    delete node.__collaborativeState;
  },

  onUpdate(node, _config, _context, _delta) {
    const state = node.__collaborativeState;
    if (!state) return;
    // Sync logic handled by WebRTC layer
  },

  async initializeVoice(node: HSPlusNode, context: TraitContext) {
    try {
      // In a real browser environment, this would request mic access
      // navigator.mediaDevices.getUserMedia({ audio: true })

      // For now, we emit an event to request the host app to provide the stream
      context.emit('request_mic_access', {
        node,
        onStream: (stream: MediaStream) => {
          const state = node.__collaborativeState;
          if (state) {
            state.localStream = stream;
            // Provide stream to network layer
            // This assumes context has access to the transport or we emit an event
            context.emit('local_voice_stream_ready', { stream });
          }
        },
      });
    } catch (err) {
      console.warn('Failed to initialize voice chat:', err);
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__collaborativeState;
    if (!state) return;

    switch (event.type) {
      case 'user_join':
        context.emit('on_user_join', { node, user: (event as Record<string, unknown>).user });
        break;
      case 'user_leave':
        context.emit('on_user_leave', { node, user: (event as Record<string, unknown>).user });
        break;
      case 'edit':
        context.emit('on_edit', { node, edit: (event as Record<string, unknown>).edit });
        break;
      case 'voice_stream_received':
        // Handle incoming voice stream from a peer
        // This event would be triggered by the runtime bridging WebRTCTransport events to traits
        context.emit('on_voice_stream', {
          node,
          peerId: (event as Record<string, unknown>).peerId,
          stream: (event as Record<string, unknown>).stream,
        });
        break;
    }
  },
};

// =============================================================================
// @tweetable HANDLER
// =============================================================================

/**
 * @tweetable - Generates tweet with preview when shared
 *
 * Automatically creates X-optimized content when the object
 * or scene is shared, including hashtags and preview cards.
 */
export const tweetableHandler: TraitHandler<TweetableConfig> = {
  name: 'tweetable',

  defaultConfig: {
    template: 'Check out {name}! Built with HoloScript 🎮',
    hashtags: ['HoloScript', 'VR'],
    mention: '',
    includePreview: true,
    autoThread: false,
  },

  onAttach(node, _config, _context) {
    const state: Record<string, unknown> = {
      tweetGenerated: false,
      tweetUrl: null,
    };
    node.__tweetableState = state;
  },

  onDetach(node) {
    delete node.__tweetableState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Tweet generation is handled externally
  },

  onEvent(node, config, context, event) {
    if (event.type === 'tweet') {
      context.emit('on_tweet', { node });
    }
    if (event.type === 'thread_created') {
      context.emit('on_thread_created', { node });
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a tweet URL for sharing a HoloScript scene
 */
export function generateTweetUrl(name: string, url: string, config: TweetableConfig): string {
  let text = config.template.replace('{name}', name).replace('{url}', url);

  if (config.mention) {
    text = `${config.mention} ${text}`;
  }

  const hashtags = config.hashtags.map((h) => `#${h}`).join(' ');
  text = `${text}\n\n${hashtags}\n\n${url}`;

  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

/**
 * Generate a QR code URL for a scene
 */
export function generateQRCodeUrl(sceneUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(sceneUrl)}`;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const socialTraitHandlers = {
  shareable: shareableHandler,
  collaborative: collaborativeHandler,
  tweetable: tweetableHandler,
};

export default socialTraitHandlers;
