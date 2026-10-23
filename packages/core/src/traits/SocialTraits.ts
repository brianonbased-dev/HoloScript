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
import { avatarRenderAllowed } from './AvatarEmbodimentTrait';
import {
  grantLikenessShare,
  revokeLikenessShare,
  grantVoiceUse,
  revokeVoiceUse,
  voiceUseAllowed,
  type VoiceUse,
} from './LikenessShareGrant';

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
  /** Share-grant scope for the live mic stream (Trust POLICY §3). */
  sessionId?: string;
  /** Peers that receive the mic stream; every one must be inside the granted audience. */
  audience?: string[];
  /** Host-supplied id of the person speaking on this device (binds the share grant). */
  localUserId?: string;
}

/** Plain state shown to the speaker while their mic is not relayed. Not an error. */
export const VOICE_MUTED_MESSAGE = "You're muted";

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

/**
 * Session-wide recording indicator: every participant (the whole session audience) is told
 * whenever any recording-type use is on, and when it ends.
 */
export function emitRecordingIndicator(
  context: TraitContext,
  config: Partial<CollaborativeConfig>,
  uses: ReadonlySet<string>
): void {
  context.emit('recording_active', {
    active: uses.size > 0,
    uses: [...uses].sort(),
    sessionId: config.sessionId ?? null,
    audience: 'session',
    broadcast: true,
  });
}

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
      // Trust ruling: everyone joins muted. Only the speaker's own unmute / push-to-talk shares.
      muted: true,
      relaying: false,
      recordingUses: new Set<string>(),
    };
    node.__collaborativeState = state;
    if (config.localUserId && (node as unknown as Record<string, unknown>).__trackedPersonId === undefined) {
      (node as unknown as Record<string, unknown>).__trackedPersonId = config.localUserId;
    }

    // Initialize Voice Chat if enabled
    if (config.voice) {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      this.initializeVoice(node, context, config);
    }
  },

  onDetach(node) {
    const state = node.__collaborativeState;
    // @ts-expect-error
    if (state && state.localStream) {
      // @ts-expect-error
      (state.localStream as MediaStream).getTracks().forEach((track) => track.stop());
    }
    delete node.__collaborativeState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__collaborativeState as Record<string, any> | undefined;
    if (!state) return;
    // Sync logic handled by WebRTC layer.
    // Live voice relay is re-checked every frame: a mute, push-to-talk release or leave revokes
    // the share grant, and the very next frame stops the relay.
    if (!state.localStream) return;
    const scope = { sessionId: config.sessionId, audience: config.audience ?? [], livePose: true };
    const allowed = avatarRenderAllowed(node as unknown as Record<string, unknown>, true, scope);
    if (allowed && !state.relaying) {
      state.relaying = true;
      state.muted = false;
      context.emit('local_voice_stream_ready', { stream: state.localStream });
    } else if (!allowed && state.relaying) {
      state.relaying = false;
      state.muted = true;
      context.emit('voice_stream_stop', { avatarId: typeof node.id === 'string' ? node.id : null });
      context.emit('voice_muted', { muted: true, message: VOICE_MUTED_MESSAGE });
    }
  },

  async initializeVoice(node: HSPlusNode, context: TraitContext, config?: Partial<CollaborativeConfig>) {
    try {
      // In a real browser environment, this would request mic access
      // navigator.mediaDevices.getUserMedia({ audio: true })

      // For now, we emit an event to request the host app to provide the stream
      context.emit('request_mic_access', {
        node,
        onStream: (stream: MediaStream) => {
          const state = node.__collaborativeState;
          if (state) {
            // @ts-expect-error
            state.localStream = stream;
            // Live voice is likeness data (Trust POLICY §3, Release B1). Users join muted: the
            // stream stays on the device until the speaker unmutes (or holds push-to-talk) for
            // this session and audience. onUpdate does the relay, re-checked every frame.
            context.emit('voice_muted', { muted: true, message: VOICE_MUTED_MESSAGE });
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
      case 'user_leave': {
        const user = (event as Record<string, unknown>).user as { id?: unknown } | undefined;
        if (user && config.localUserId && user.id === config.localUserId) {
          // Leaving revokes at once: relay and every voice-use grant for this session.
          revokeLikenessShare(node);
          revokeVoiceUse(node, config.sessionId);
        }
        context.emit('on_user_leave', { node, user });
        break;
      }
      case 'voice_unmute':
      case 'push_to_talk_start': {
        // The speaker's own deliberate unmute / push-to-talk IS the share grant (Trust ruling),
        // scoped to this session and audience. Nobody else can unmute them.
        const userId = (event as Record<string, unknown>).userId;
        if (!config.localUserId || userId !== config.localUserId || !config.sessionId) break;
        grantLikenessShare(node, {
          grantorId: config.localUserId,
          trackedPersonId: config.localUserId,
          sessionId: config.sessionId,
          audience: config.audience ?? [],
          renderLikenessYes: true,
        });
        break;
      }
      case 'voice_mute':
      case 'push_to_talk_end':
        revokeLikenessShare(node);
        break;
      case 'voice_use_grant': {
        // A separate, explicit grant from the speaker for one use beyond live relay.
        const e = event as Record<string, unknown>;
        if (!config.localUserId || e.userId !== config.localUserId || !config.sessionId) break;
        grantVoiceUse(node, {
          grantorId: config.localUserId,
          speakerId: config.localUserId,
          sessionId: config.sessionId,
          use: e.use as VoiceUse,
        });
        break;
      }
      case 'recording_request': {
        // Recording, storing, transcription (beyond live captions), replay, sending to an AI or
        // deriving a voice_print: refused without the speaker's separate grant for that use.
        const e = event as Record<string, unknown>;
        const use = e.use as VoiceUse;
        if (!voiceUseAllowed(node, config.sessionId, use)) {
          context.emit('voice_use_refused', { use, requesterId: e.requesterId ?? null });
          break;
        }
        const uses = (state as Record<string, any>).recordingUses as Set<string>;
        if (use !== 'live_captions') uses.add(use);
        emitRecordingIndicator(context, config, uses);
        break;
      }
      case 'recording_stop': {
        const uses = (state as Record<string, any>).recordingUses as Set<string>;
        uses.delete((event as Record<string, unknown>).use as string);
        emitRecordingIndicator(context, config, uses);
        break;
      }
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
 * Generate a QR code for a scene as a local data: URI.
 *
 * Generated LOCALLY via the `qrcode` package — never routed through a
 * third-party service. Sending scene URLs to a hosted QR API leaks every
 * shared/published `.holo` link (F.106/F.117: local generation only).
 */
export async function generateQRCodeUrl(sceneUrl: string): Promise<string> {
  const QRCode = await import('qrcode');
  return QRCode.toDataURL(sceneUrl, {
    width: 200,
    margin: 2,
  });
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
