/**
 * @holoscript/core Emotional Voice Trait
 *
 * Implements NPC vocalization using neural TTS with emotional synthesis.
 * Bridges with @builtin VoiceSynthesizer and synchronizes with @lip_sync.
 */

import type { TraitHandler, HSPlusNode } from './TraitTypes';
import {
  getVoiceSynthesizer,
  voiceSynthesizerRegistry,
  type VoiceRequest,
} from '../runtime/VoiceSynthesizer';

export interface EmotionalVoiceConfig {
  /** Default voice ID to use for this NPC */
  voiceId?: string;

  /** Default emotion profile */
  defaultEmotion?: 'angry' | 'sad' | 'excited' | 'friendly' | 'scared' | 'neutral';

  /** Default emotion intensity */
  defaultIntensity?: number;

  /** Enable automatic caching of audio segments */
  cacheEnabled?: boolean;
}

interface InternalState {
  audioCache: Map<string, ArrayBuffer>;
}

export const emotionalVoiceHandler: TraitHandler<EmotionalVoiceConfig> = {
  name: 'emotional_voice',

  defaultConfig: {
    defaultEmotion: 'neutral',
    defaultIntensity: 0.5,
    cacheEnabled: true,
  },

  onAttach(node, _config, _context) {
    const state: InternalState = {
      audioCache: new Map(),
    };
    node.__emotionalVoiceState = state;
  },

  onDetach(node) {
    delete node.__emotionalVoiceState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // No frame-based update needed for voice synthesis itself
  },

  onEvent(node, config, context, event) {
    const state = node.__emotionalVoiceState as InternalState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;

    if (eventType === 'speak') {
      const data = ((event as Record<string, unknown>).data as Record<string, any>) || {};
      const { text, emotion, intensity, voiceId } = data;

      (this as any).handleSpeak(node, config, state, {
        text,
        voiceId: voiceId ?? config.voiceId,
        emotion: {
          type: emotion ?? config.defaultEmotion ?? 'neutral',
          intensity: intensity ?? config.defaultIntensity ?? 0.5,
        },
      });
    }
  },
};

/**
 * Handle speech synthesis and lip sync integration
 */
(emotionalVoiceHandler as any).handleSpeak = async function (
  node: HSPlusNode,
  config: EmotionalVoiceConfig,
  state: InternalState,
  request: VoiceRequest
) {
  const synthesizer =
    getVoiceSynthesizer('default') || Array.from(voiceSynthesizerRegistry.values())[0];
  if (!synthesizer) {
    console.warn('No VoiceSynthesizer registered. Skipping speech for', node.name);
    return;
  }

  const cacheKey = `${request.voiceId}:${request.text}:${request.emotion?.type}:${request.emotion?.intensity}`;

  let audioBuffer: ArrayBuffer;
  if (config.cacheEnabled && state.audioCache.has(cacheKey)) {
    audioBuffer = state.audioCache.get(cacheKey)!;
  } else {
    try {
      if (synthesizer) {
        audioBuffer = await (synthesizer as any).generate(request);
      } else {
        return;
      }
      if (config.cacheEnabled) {
        state.audioCache.set(cacheKey, audioBuffer);
      }
    } catch (e) {
      console.error('Failed to synthesize voice for', node.name, e);
      return;
    }
  }

  // Integrate with LipSyncTrait if present
  // Note: In a real runtime, the audioBuffer would be played through a spatial audio source
  // and the LipSyncTrait would receive the audio stream or pre-calculated phonemes.

  // Emit event for runtime to play audio
  node.emit?.('vocalize', {
    buffer: audioBuffer,
    text: request.text,
    request,
  });

  // If node has LipSyncTrait, notifying it to start session if needed
  // (Actual implementation depends on how runtime handles audio -> phoneme conversion)
};

export default emotionalVoiceHandler;
