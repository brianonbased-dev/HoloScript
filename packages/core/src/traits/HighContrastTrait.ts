/**
 * HighContrast Trait
 *
 * High contrast visual mode for low-vision accessibility.
 * Supports system preferences and forced color modes.
 *
 * @version 2.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ContrastMode = 'auto' | 'light' | 'dark' | 'high' | 'inverted' | 'off';

interface StoredMaterial {
  color: string;
  emissive: string;
  opacity: number;
}

interface HighContrastState {
  isActive: boolean;
  activeMode: ContrastMode;
  originalMaterials: Map<string, StoredMaterial>;
  systemPreference: ContrastMode;
}

interface HighContrastConfig {
  mode: ContrastMode;
  outline_width: number;
  outline_color: string;
  forced_colors: boolean;
  foreground_color: string;
  background_color: string;
  preserve_images: boolean;
}

// =============================================================================
// CONTRAST PALETTES
// =============================================================================

const CONTRAST_PALETTES: Record<ContrastMode, { fg: string; bg: string; accent: string }> = {
  auto: { fg: '#FFFFFF', bg: '#000000', accent: '#00FFFF' },
  light: { fg: '#000000', bg: '#FFFFFF', accent: '#0066CC' },
  dark: { fg: '#FFFFFF', bg: '#000000', accent: '#66CCFF' },
  high: { fg: '#FFFF00', bg: '#000000', accent: '#00FF00' },
  inverted: { fg: '#000000', bg: '#FFFFFF', accent: '#FF0066' },
  off: { fg: '', bg: '', accent: '' },
};

// =============================================================================
// HANDLER
// =============================================================================

export const highContrastHandler: TraitHandler<HighContrastConfig> = {
  name: 'high_contrast',

  defaultConfig: {
    mode: 'auto',
    outline_width: 2,
    outline_color: '#FFFFFF',
    forced_colors: false,
    foreground_color: '#FFFFFF',
    background_color: '#000000',
    preserve_images: true,
  },

  onAttach(node, config, context) {
    const state: HighContrastState = {
      isActive: false,
      activeMode: 'off',
      originalMaterials: new Map(),
      systemPreference: 'auto',
    };
    node.__highContrastState = state;

    // Check system preference
    context.emit?.('high_contrast_check_system', { node });

    // If mode is not auto or off, apply immediately
    if (config.mode !== 'auto' && config.mode !== 'off') {
      applyContrast(node, config, state, config.mode, context);
    }
  },

  onDetach(node, config, context) {
    const state = node.__highContrastState as HighContrastState;
    if (state?.isActive) {
      restoreOriginalMaterials(node, state, context);
    }
    delete node.__highContrastState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // High contrast is event-driven, no per-frame updates
  },

  onEvent(node, config, context, event) {
    const state = node.__highContrastState as HighContrastState;
    if (!state) return;

    if (event.type === 'high_contrast_system_preference') {
      state.systemPreference = event.mode as ContrastMode;

      if (config.mode === 'auto') {
        applyContrast(node, config, state, state.systemPreference, context);
      }
    } else if (event.type === 'high_contrast_enable') {
      const mode = (event.mode as ContrastMode) || config.mode;
      applyContrast(node, config, state, mode, context);
    } else if (event.type === 'high_contrast_disable') {
      restoreOriginalMaterials(node, state, context);
    } else if (event.type === 'high_contrast_toggle') {
      if (state.isActive) {
        restoreOriginalMaterials(node, state, context);
      } else {
        const mode = config.mode === 'auto' ? state.systemPreference : config.mode;
        applyContrast(node, config, state, mode, context);
      }
    } else if (event.type === 'high_contrast_query') {
      context.emit?.('high_contrast_info', {
        queryId: event.queryId,
        node,
        isActive: state.isActive,
        activeMode: state.activeMode,
        systemPreference: state.systemPreference,
      });
    }
  },
};

function applyContrast(
  node: HSPlusNode,
  config: HighContrastConfig,
  state: HighContrastState,
  mode: ContrastMode,
  context: TraitContext
): void {
  if (mode === 'off') return;

  // Store original materials
  const materialId = node.id || 'default';
  if (!state.originalMaterials.has(materialId) && node.material) {
    state.originalMaterials.set(materialId, {
      color: node.material.color || '#FFFFFF',
      emissive: node.material.emissive || '#000000',
      opacity: node.material.opacity ?? 1,
    });
  }

  const palette = config.forced_colors
    ? { fg: config.foreground_color, bg: config.background_color, accent: config.outline_color }
    : CONTRAST_PALETTES[mode];

  // Apply high contrast materials
  context.emit?.('high_contrast_apply', {
    node,
    foreground: palette.fg,
    background: palette.bg,
    accent: palette.accent,
    outlineWidth: config.outline_width,
    outlineColor: config.outline_color,
    preserveImages: config.preserve_images,
  });

  state.isActive = true;
  state.activeMode = mode;

  context.emit?.('on_contrast_change', {
    node,
    mode,
    isActive: true,
  });
}

function restoreOriginalMaterials(node: HSPlusNode, state: HighContrastState, context: TraitContext): void {
  const materialId = node.id || 'default';
  const original = state.originalMaterials.get(materialId);

  if (original) {
    context.emit?.('high_contrast_restore', {
      node,
      color: original.color,
      emissive: original.emissive,
      opacity: original.opacity,
    });
  }

  state.isActive = false;
  state.activeMode = 'off';

  context.emit?.('on_contrast_change', {
    node,
    mode: 'off',
    isActive: false,
  });
}

export default highContrastHandler;
