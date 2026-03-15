/**
 * Subtitle Trait
 *
 * Real-time speech-to-text overlay for deaf/hard-of-hearing users.
 * Supports multiple languages, auto-translation, and speaker identification.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type SubtitlePosition = 'bottom' | 'top' | 'left' | 'right' | 'follow_speaker';

interface SubtitleLine {
  text: string;
  speaker: string;
  timestamp: number;
  language: string;
}

interface SubtitleState {
  isDisplaying: boolean;
  lines: SubtitleLine[];
  currentSpeaker: string | null;
  speechRecognitionActive: boolean;
  translationPending: boolean;
}

interface SubtitleConfig {
  language: string;
  position: SubtitlePosition;
  font_size: number;
  background: boolean;
  background_opacity: number;
  max_lines: number;
  line_duration: number; // ms before line fades
  auto_translate: string[]; // Target languages
  speaker_colors: boolean;
  speaker_labels: boolean;
  word_highlight: boolean; // Highlight words as spoken
}

// =============================================================================
// SPEAKER COLORS
// =============================================================================

const SPEAKER_COLORS = [
  '#FFFFFF', // White
  '#00FFFF', // Cyan
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FF00', // Green
  '#FFA500', // Orange
];

// =============================================================================
// HANDLER
// =============================================================================

export const subtitleHandler: TraitHandler<SubtitleConfig> = {
  name: 'subtitle',

  defaultConfig: {
    language: 'en',
    position: 'bottom',
    font_size: 16,
    background: true,
    background_opacity: 0.7,
    max_lines: 3,
    line_duration: 5000,
    auto_translate: [],
    speaker_colors: false,
    speaker_labels: true,
    word_highlight: false,
  },

  onAttach(node, config, context) {
    const state: SubtitleState = {
      isDisplaying: false,
      lines: [],
      currentSpeaker: null,
      speechRecognitionActive: false,
      translationPending: false,
    };
    (node as any).__subtitleState = state;

    // Initialize subtitle display
    context.emit?.('subtitle_init', {
      node,
      position: config.position,
      fontSize: config.font_size,
      background: config.background,
      backgroundOpacity: config.background_opacity,
      maxLines: config.max_lines,
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__subtitleState as SubtitleState;
    if (state?.speechRecognitionActive) {
      context.emit?.('subtitle_stop_recognition', { node });
    }
    context.emit?.('subtitle_destroy', { node });
    delete (node as any).__subtitleState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__subtitleState as SubtitleState;
    if (!state) return;

    const now = Date.now();

    // Remove expired lines
    const expiredBefore = now - config.line_duration;
    const activeLines = state.lines.filter((line) => line.timestamp > expiredBefore);

    if (activeLines.length !== state.lines.length) {
      state.lines = activeLines;

      // Update display
      if (state.lines.length === 0) {
        state.isDisplaying = false;
        context.emit?.('subtitle_hide', { node });
      } else {
        updateDisplay(node, config, state, context);
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__subtitleState as SubtitleState;
    if (!state) return;

    if (event.type === 'subtitle_text') {
      const text = event.text as string;
      const speaker = (event.speaker as string) || 'Unknown';
      const language = (event.language as string) || config.language;

      // Add new line
      state.lines.push({
        text,
        speaker,
        timestamp: Date.now(),
        language,
      });

      // Trim to max lines
      while (state.lines.length > config.max_lines) {
        state.lines.shift();
      }

      state.currentSpeaker = speaker;
      state.isDisplaying = true;

      updateDisplay(node, config, state, context);

      // Auto-translate if configured
      if (config.auto_translate.length > 0 && language === config.language) {
        state.translationPending = true;

        for (const targetLang of config.auto_translate) {
          context.emit?.('subtitle_translate', {
            node,
            text,
            sourceLang: language,
            targetLang,
          });
        }
      }

      context.emit?.('on_subtitle_display', {
        node,
        text,
        speaker,
      });
    } else if (event.type === 'subtitle_translation_complete') {
      const translatedText = event.translatedText as string;
      const targetLang = event.targetLang as string;

      state.translationPending = false;

      context.emit?.('subtitle_translation_ready', {
        node,
        text: translatedText,
        language: targetLang,
      });
    } else if (event.type === 'speech_recognition_result') {
      // Handle live speech recognition
      const text = event.text as string;
      const isFinal = event.isFinal as boolean;
      const speaker = (event.speaker as string) || 'Speaker';

      if (isFinal) {
        state.lines.push({
          text,
          speaker,
          timestamp: Date.now(),
          language: config.language,
        });

        while (state.lines.length > config.max_lines) {
          state.lines.shift();
        }
      }

      state.isDisplaying = true;
      updateDisplay(node, config, state, context, isFinal ? undefined : text);
    } else if (event.type === 'subtitle_start_recognition') {
      state.speechRecognitionActive = true;

      context.emit?.('speech_recognition_start', {
        node,
        language: config.language,
        continuous: true,
      });
    } else if (event.type === 'subtitle_stop_recognition') {
      state.speechRecognitionActive = false;

      context.emit?.('speech_recognition_stop', { node });
    } else if (event.type === 'subtitle_clear') {
      state.lines = [];
      state.isDisplaying = false;

      context.emit?.('subtitle_hide', { node });
    } else if (event.type === 'subtitle_set_position') {
      context.emit?.('subtitle_update_position', {
        node,
        position: event.position,
      });
    } else if (event.type === 'subtitle_query') {
      context.emit?.('subtitle_info', {
        queryId: event.queryId,
        node,
        isDisplaying: state.isDisplaying,
        lineCount: state.lines.length,
        currentSpeaker: state.currentSpeaker,
        speechRecognitionActive: state.speechRecognitionActive,
        translationPending: state.translationPending,
      });
    }
  },
};

function updateDisplay(
  node: any,
  config: SubtitleConfig,
  state: SubtitleState,
  context: any,
  interimText?: string
): void {
  const speakerColorMap = new Map<string, string>();
  let colorIndex = 0;

  const formattedLines = state.lines.map((line) => {
    let color = '#FFFFFF';

    if (config.speaker_colors) {
      if (!speakerColorMap.has(line.speaker)) {
        speakerColorMap.set(line.speaker, SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length]);
        colorIndex++;
      }
      color = speakerColorMap.get(line.speaker)!;
    }

    return {
      text: config.speaker_labels ? `${line.speaker}: ${line.text}` : line.text,
      color,
      timestamp: line.timestamp,
    };
  });

  // Add interim text if available
  if (interimText) {
    formattedLines.push({
      text: interimText,
      color: '#888888', // Gray for interim
      timestamp: Date.now(),
    });
  }

  context.emit?.('subtitle_render', {
    node,
    lines: formattedLines,
    position: config.position,
    fontSize: config.font_size,
    background: config.background,
    backgroundOpacity: config.background_opacity,
    wordHighlight: config.word_highlight,
  });
}

export default subtitleHandler;
