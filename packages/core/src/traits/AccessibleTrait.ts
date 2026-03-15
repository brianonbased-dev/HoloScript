/**
 * Accessible Trait
 *
 * Master accessibility trait for spatial content.
 * Provides ARIA-like semantics, keyboard navigation, and focus management.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type Role =
  | 'button'
  | 'slider'
  | 'checkbox'
  | 'dialog'
  | 'menu'
  | 'menuitem'
  | 'progressbar'
  | 'region'
  | 'group'
  | 'list'
  | 'listitem'
  | 'none';
type LiveRegion = 'off' | 'polite' | 'assertive';

interface AccessibleState {
  isFocused: boolean;
  isHovered: boolean;
  announceQueue: string[];
  lastAnnounceTime: number;
  tabOrder: number;
  ariaExpanded: boolean | null;
  ariaChecked: boolean | null;
  ariaPressed: boolean | null;
  ariaValue: number | null;
}

interface AccessibleConfig {
  role: Role;
  label: string;
  description: string;
  live_region: LiveRegion;
  keyboard_shortcut: string;
  tab_index: number;
  focus_visible: boolean;
  disabled: boolean;
  value_min: number;
  value_max: number;
  value_now: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const accessibleHandler: TraitHandler<AccessibleConfig> = {
  name: 'accessible',

  defaultConfig: {
    role: 'button',
    label: '',
    description: '',
    live_region: 'off',
    keyboard_shortcut: '',
    tab_index: 0,
    focus_visible: true,
    disabled: false,
    value_min: 0,
    value_max: 100,
    value_now: 0,
  },

  onAttach(node, config, context) {
    const state: AccessibleState = {
      isFocused: false,
      isHovered: false,
      announceQueue: [],
      lastAnnounceTime: 0,
      tabOrder: config.tab_index,
      ariaExpanded: null,
      ariaChecked: null,
      ariaPressed: null,
      ariaValue:
        config.role === 'slider' || config.role === 'progressbar' ? config.value_now : null,
    };
    (node as any).__accessibleState = state;

    // Register with accessibility system
    context.emit?.('accessibility_register', {
      node,
      role: config.role,
      label: config.label,
      description: config.description,
      tabIndex: config.tab_index,
      shortcut: config.keyboard_shortcut,
    });

    // Set alt text if provided
    if (config.label && context.accessibility) {
      context.accessibility.setAltText(node.id || '', config.label);
    }
  },

  onDetach(node, config, context) {
    context.emit?.('accessibility_unregister', { node });
    delete (node as any).__accessibleState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__accessibleState as AccessibleState;
    if (!state) return;

    // Process announce queue
    if (state.announceQueue.length > 0) {
      const now = Date.now();
      if (now - state.lastAnnounceTime > 500) {
        const message = state.announceQueue.shift();
        if (message && context.accessibility) {
          context.accessibility.announce(message);
          state.lastAnnounceTime = now;
        }
      }
    }

    // Update focus visuals
    if (state.isFocused && config.focus_visible) {
      context.emit?.('accessibility_focus_ring', {
        node,
        visible: true,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__accessibleState as AccessibleState;
    if (!state) return;

    if (event.type === 'hover_enter') {
      state.isHovered = true;
      if (context.accessibility) {
        context.accessibility.announce(config.label || node.id || 'Object');
      }
    } else if (event.type === 'hover_exit') {
      state.isHovered = false;
    } else if (event.type === 'focus') {
      state.isFocused = true;

      // Build announcement
      let announcement = config.label || node.id || 'Object';
      announcement += `, ${config.role}`;
      if (config.description) {
        announcement += `, ${config.description}`;
      }
      if (config.keyboard_shortcut) {
        announcement += `, shortcut: ${config.keyboard_shortcut}`;
      }

      if (context.accessibility) {
        context.accessibility.announce(announcement);
      }

      context.emit?.('on_accessible_focus', { node });
    } else if (event.type === 'blur') {
      state.isFocused = false;
      context.emit?.('accessibility_focus_ring', { node, visible: false });
    } else if (event.type === 'keydown') {
      const key = event.key as string;

      // Check keyboard shortcut
      if (config.keyboard_shortcut && key === config.keyboard_shortcut) {
        context.emit?.('accessible_activate', { node });
      }

      // Handle role-specific keys
      if (config.role === 'slider' && state.ariaValue !== null) {
        if (key === 'ArrowRight' || key === 'ArrowUp') {
          const step = (config.value_max - config.value_min) / 10;
          state.ariaValue = Math.min(config.value_max, state.ariaValue + step);
          context.emit?.('accessible_value_change', { node, value: state.ariaValue });
        } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
          const step = (config.value_max - config.value_min) / 10;
          state.ariaValue = Math.max(config.value_min, state.ariaValue - step);
          context.emit?.('accessible_value_change', { node, value: state.ariaValue });
        }
      }
    } else if (event.type === 'accessible_announce') {
      const message = event.message as string;
      const priority = config.live_region;

      if (priority === 'assertive') {
        state.announceQueue.unshift(message);
      } else if (priority === 'polite') {
        state.announceQueue.push(message);
      }
    } else if (event.type === 'accessible_set_expanded') {
      state.ariaExpanded = event.expanded as boolean;
      context.emit?.('accessibility_update', {
        node,
        property: 'expanded',
        value: state.ariaExpanded,
      });
    } else if (event.type === 'accessible_set_checked') {
      state.ariaChecked = event.checked as boolean;
      context.emit?.('accessibility_update', {
        node,
        property: 'checked',
        value: state.ariaChecked,
      });
    } else if (event.type === 'accessible_set_value') {
      state.ariaValue = event.value as number;
      context.emit?.('accessibility_update', {
        node,
        property: 'valuenow',
        value: state.ariaValue,
      });
    }
  },
};

export default accessibleHandler;
