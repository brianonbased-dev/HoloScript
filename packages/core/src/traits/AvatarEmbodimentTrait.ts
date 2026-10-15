/**
 * AvatarEmbodiment Trait
 *
 * User/AI body representation in VR/AR with integrated
 * lip sync, emotion directives, and voice output.
 *
 * This trait orchestrates the full AI avatar embodiment pipeline:
 * Voice Input → LLM → Voice Output → Lip Sync → Emotion → Animation
 *
 * @example
 * ```hsplus
 * object "AICompanion" {
 *   @avatar_embodiment {
 *     tracking_source: "ai",
 *     ik_mode: "full_body",
 *     lip_sync: true,
 *     emotion_directives: true,
 *     voice_output: { engine: "elevenlabs", voice: "aria" },
 *     personality: { sociability: 0.8, warmth: 0.9 }
 *   }
 * }
 * ```
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';
import type { LipSyncConfig } from './LipSyncTrait';
import type { EmotionDirectiveConfig } from './EmotionDirectiveTrait';
import type { VoiceOutputConfig } from './VoiceOutputTrait';
import { isLocalCapture } from './LocalCapture';
import { avatarEmbodimentNeedsGrant, carriesRealLikeness, LIVE_TRACKING_SOURCES } from './AvatarLikeness';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Avatar tracking source
 */
export type AvatarTrackingSource = 'headset' | 'camera' | 'ai' | 'remote' | 'playback' | 'unknown';

/**
 * IK mode for avatar body
 */
export type AvatarIKMode = 'head_only' | 'upper_body' | 'full_body' | 'none';

/**
 * Avatar embodiment pipeline stage
 */
export type PipelineStage =
  | 'idle'
  | 'listening' // STT active, processing user speech
  | 'processing' // LLM generating response
  | 'speaking' // TTS playing, lip sync active
  | 'transitioning'; // Between states

/**
 * AI avatar personality traits (affect gesture/expression selection)
 */
export interface AvatarPersonality {
  sociability?: number; // 0-1: affects gesture frequency
  warmth?: number; // 0-1: affects smile frequency
  expressiveness?: number; // 0-1: affects expression intensity
  formality?: number; // 0-1: affects gesture style
  energy?: number; // 0-1: affects animation speed
}

/**
 * Avatar embodiment configuration
 */
export interface AvatarEmbodimentConfig {
  /** Tracking source for avatar position/rotation */
  tracking_source?: AvatarTrackingSource;

  /** IK mode for body animation */
  ik_mode?: AvatarIKMode;

  /** Enable lip sync */
  lip_sync?: boolean;

  /** Lip sync configuration */
  lip_sync_config?: LipSyncConfig;

  /** Enable emotion directives */
  emotion_directives?: boolean;

  /** Emotion directive configuration */
  emotion_config?: EmotionDirectiveConfig;

  /** Mirror facial expressions from tracking */
  mirror_expressions?: boolean;

  /** Enable eye tracking forwarding */
  eye_tracking_forward?: boolean;

  /** Personal space radius (meters) */
  personal_space_radius?: number;

  /** Voice output configuration */
  voice_output?: VoiceOutputConfig;

  /** Avatar personality traits */
  personality?: AvatarPersonality;

  /** Enable conversation fillers while LLM processes */
  conversation_fillers?: boolean;

  /** Auto-manage pipeline state transitions */
  auto_pipeline?: boolean;
}

/**
 * Avatar embodiment state
 */
export interface AvatarEmbodimentState {
  /** Is the avatar embodied/active */
  isEmbodied: boolean;

  /** Has calibration completed */
  calibrated: boolean;

  /** Current pipeline stage */
  pipelineStage: PipelineStage;

  /** Is lip sync active */
  lipSyncActive: boolean;

  /** Current facial expression */
  currentExpression: string;

  /** Current body animation */
  currentAnimation: string;

  /** Is speaking */
  isSpeaking: boolean;

  /** Is listening to user */
  isListening: boolean;

  /** Conversation turn count */
  turnCount: number;

  /**
   * Who may see this avatar (Trust and Consent). 'self_preview': a declared live source
   * (headset / camera) embodied without a verified local capture handle; only the local
   * self-preview may render it, never a surface shown to other people. 'shared': verified live,
   * or a non-live source (ai / remote / playback) that passed the static render_likeness gate.
   */
  visibility?: 'shared' | 'self_preview';
}

/**
 * May a surface render this avatar? `shownToOthers`: a networked, spectator, mirror-for-others,
 * recording or any shared view. Local self-preview passes `false`.
 *
 * HARD REQUIREMENT: every network / spectator / broadcast path that replicates avatar or
 * embodiment state to other people must call avatarRenderAllowed(node, true) first and send
 * nothing when it returns false. A declared live avatar without a verified local capture handle
 * is self-preview only. Guarded by traits/__tests__/AvatarReplicationGuard.test.ts.
 */
export function avatarRenderAllowed(node: Record<string, unknown>, shownToOthers: boolean): boolean {
  const state = node.__avatarEmbodimentState as AvatarEmbodimentState | undefined;
  if (!state || !state.isEmbodied) return false;
  return !shownToOthers || state.visibility === 'shared';
}

/**
 * Avatar embodiment event types
 */
export type AvatarEmbodimentEventType =
  | 'embodied'
  | 'disembodied'
  | 'calibrated'
  | 'pipeline-stage-change'
  | 'turn-start'
  | 'turn-end'
  | 'speech-start'
  | 'speech-end'
  | 'listen-start'
  | 'listen-end';

/**
 * Avatar embodiment event
 */
export interface AvatarEmbodimentEvent {
  type: AvatarEmbodimentEventType;
  stage?: PipelineStage;
  turnCount?: number;
  timestamp: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const avatarEmbodimentHandler: TraitHandler<any> = {
  name: 'avatar_embodiment',

  defaultConfig: {
    // Trust: no driver is assumed. 'unknown' is gated like the checker: it fails closed on an
    // avatar that carries a real person's likeness and renders on a synthetic one.
    tracking_source: 'unknown',
    ik_mode: 'upper_body',
    mirror_expressions: true,
    lip_sync: true,
    emotion_directives: true,
    eye_tracking_forward: false,
    personal_space_radius: 0.5,
    conversation_fillers: true,
    auto_pipeline: true,
  } as AvatarEmbodimentConfig,

  onAttach(node, _config, _context) {
    const state: AvatarEmbodimentState = {
      isEmbodied: false,
      calibrated: false,
      pipelineStage: 'idle',
      lipSyncActive: false,
      currentExpression: 'neutral',
      currentAnimation: 'idle',
      isSpeaking: false,
      isListening: false,
      turnCount: 0,
    };
    node.__avatarEmbodimentState = state;
  },

  onDetach(node) {
    delete node.__avatarEmbodimentState;
  },

  onUpdate(node, _config, _context, _delta) {
    const state = node.__avatarEmbodimentState as AvatarEmbodimentState | undefined;
    if (!state) return;

    // Pipeline state management handled by runtime in @hololand
    // This handler provides the trait definition and state storage
  },

  onEvent(node, config, context, event) {
    const state = node.__avatarEmbodimentState as AvatarEmbodimentState | undefined;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;

    // Handle pipeline events
    if (eventType === 'embody') {
      const source = config?.tracking_source ?? 'unknown';
      const traits = (node as { traits?: unknown }).traits;
      const names =
        traits instanceof Map ? [...traits.keys()] : traits && typeof traits === 'object' ? Object.keys(traits) : [];
      // Runtime half of the shared rule: where a grant is needed, the node's @consent_gate must
      // be granted at runtime (ConsentGateTrait state); otherwise fail closed.
      if (avatarEmbodimentNeedsGrant(source, carriesRealLikeness(names))) {
        const consent = (node as { __consentGateState?: { status?: string } }).__consentGateState;
        if (!consent || consent.status !== 'granted') {
          state.isEmbodied = false;
          state.visibility = undefined;
          context.emit('avatar_generic_fallback', {
            node,
            trait: 'avatar_embodiment',
            reason: `tracking_source ${JSON.stringify(source)} carries a real person's likeness and no consent is granted`,
          });
          return;
        }
      }
      const live = LIVE_TRACKING_SOURCES.includes(String(source));
      const capture = typeof event === 'object' ? (event as { capture?: unknown }).capture : undefined;
      const verified = isLocalCapture(capture, 'body') || isLocalCapture(capture, 'face');
      state.visibility = live && !verified ? 'self_preview' : 'shared';
      state.isEmbodied = true;
      if (state.visibility === 'self_preview') {
        context.emit('avatar_visibility_restricted', {
          node,
          visibility: 'self_preview',
          reason: 'declared live tracking without a verified local capture handle',
        });
      }
      context.emit('on_avatar_embodied', { node });
    } else if (eventType === 'disembody') {
      state.isEmbodied = false;
      context.emit('on_avatar_disembodied', { node });
    } else if (eventType === 'calibrate') {
      state.calibrated = true;
      context.emit('on_avatar_calibrated', { node });
    }
  },
};

export default avatarEmbodimentHandler;
