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

// =============================================================================
// TYPES
// =============================================================================

/**
 * Avatar tracking source
 */
export type AvatarTrackingSource = 'headset' | 'camera' | 'ai' | 'remote' | 'playback';

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
    tracking_source: 'ai',
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
    (node as any).__avatarEmbodimentState = state;
  },

  onDetach(node) {
    delete (node as any).__avatarEmbodimentState;
  },

  onUpdate(node, _config, _context, _delta) {
    const state = (node as any).__avatarEmbodimentState as AvatarEmbodimentState | undefined;
    if (!state) return;

    // Pipeline state management handled by runtime in @hololand
    // This handler provides the trait definition and state storage
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__avatarEmbodimentState as AvatarEmbodimentState | undefined;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;

    // Handle pipeline events
    if (eventType === 'embody') {
      state.isEmbodied = true;
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
