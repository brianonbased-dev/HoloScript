/**
 * AltText Trait
 *
 * Alternative text description for 3D objects.
 * Supports multiple verbosity levels and languages.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface AltTextState {
  isRegistered: boolean;
  generatedText: string | null;
  isGenerating: boolean;
}

interface AltTextConfig {
  text: string; // Brief description
  verbose: string; // Detailed description
  language: string;
  auto_generate: boolean;
  context_aware: boolean;
  include_spatial: boolean; // Include position/orientation info
}

// =============================================================================
// HANDLER
// =============================================================================

export const altTextHandler: TraitHandler<AltTextConfig> = {
  name: 'alt_text',

  defaultConfig: {
    text: '',
    verbose: '',
    language: 'en',
    auto_generate: false,
    context_aware: true,
    include_spatial: false,
  },

  onAttach(node, config, context) {
    const state: AltTextState = {
      isRegistered: false,
      generatedText: null,
      isGenerating: false,
    };
    node.__altTextState = state;

    // Register alt text
    if (config.text) {
      context.emit?.('alt_text_register', {
        node,
        text: config.text,
        verbose: config.verbose,
        language: config.language,
      });
      state.isRegistered = true;
    } else if (config.auto_generate) {
      state.isGenerating = true;
      context.emit?.('alt_text_generate_request', {
        node,
        contextAware: config.context_aware,
        includeSpatial: config.include_spatial,
      });
    }
  },

  onDetach(node, config, context) {
    context.emit?.('alt_text_unregister', { node });
    delete node.__altTextState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Alt text is mostly static, no per-frame updates needed
  },

  onEvent(node, config, context, event) {
    const state = node.__altTextState as AltTextState;
    if (!state) return;

    if (event.type === 'alt_text_generated') {
      state.generatedText = event.text as string;
      state.isGenerating = false;

      context.emit?.('alt_text_register', {
        node,
        text: state.generatedText,
        verbose: (event.verbose as string) || '',
        language: config.language,
      });
      state.isRegistered = true;
    } else if (event.type === 'alt_text_query') {
      const verbosity = (event.verbosity as 'brief' | 'verbose') || 'brief';
      let text = verbosity === 'verbose' && config.verbose ? config.verbose : config.text;

      if (!text && state.generatedText) {
        text = state.generatedText;
      }

      // Add spatial context if requested
      if (config.include_spatial && node.position) {
        const pos = node.position;
        text += ` Located at ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}.`;
      }

      context.emit?.('alt_text_response', {
        queryId: event.queryId,
        node,
        text,
        language: config.language,
      });
    } else if (event.type === 'alt_text_update') {
      // Update text dynamically
      context.emit?.('alt_text_register', {
        node,
        text: event.text as string,
        verbose: (event.verbose as string) || config.verbose,
        language: config.language,
      });
    }
  },
};

export default altTextHandler;
