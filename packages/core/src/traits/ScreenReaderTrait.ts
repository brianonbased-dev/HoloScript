/**
 * ScreenReader Trait
 *
 * Expose semantic structure to 3D screen readers for blind/low-vision users.
 * Supports spatial navigation, sonification, and reading modes.
 *
 * @version 2.0.0
 */

import type { TraitHandler, HSPlusNode } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ReadingMode = 'spatial' | 'linear' | 'hierarchical' | 'interactive';

interface ScreenReaderState {
  isFocused: boolean;
  isAnnouncing: boolean;
  announcementQueue: string[];
  lastPosition: { x: number; y: number; z: number };
  navigationStack: string[];
  childNodes: string[];
}

interface ScreenReaderConfig {
  semantic_structure: boolean;
  navigation_order: number;
  announce_changes: boolean;
  reading_mode: ReadingMode;
  sonify_position: boolean;
  distance_scaling: boolean;
  pitch_for_height: boolean;
  pan_for_position: boolean;
  verbosity: 'minimal' | 'normal' | 'verbose';
}

// =============================================================================
// HANDLER
// =============================================================================

export const screenReaderHandler: TraitHandler<ScreenReaderConfig> = {
  name: 'screen_reader',

  defaultConfig: {
    semantic_structure: true,
    navigation_order: 0,
    announce_changes: true,
    reading_mode: 'spatial',
    sonify_position: false,
    distance_scaling: true,
    pitch_for_height: true,
    pan_for_position: true,
    verbosity: 'normal',
  },

  onAttach(node, config, context) {
    const state: ScreenReaderState = {
      isFocused: false,
      isAnnouncing: false,
      announcementQueue: [],
      lastPosition: { x: 0, y: 0, z: 0 },
      navigationStack: [],
      childNodes: [],
    };
    node.__screenReaderState = state;

    // Store initial position
    if (node.position) {
      state.lastPosition = { ...node.position };
    }

    // Register with screen reader navigation system
    context.emit?.('screen_reader_register', {
      node,
      order: config.navigation_order,
      semanticStructure: config.semantic_structure,
      readingMode: config.reading_mode,
    });
  },

  onDetach(node, config, context) {
    context.emit?.('screen_reader_unregister', { node });
    delete node.__screenReaderState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__screenReaderState as ScreenReaderState;
    if (!state) return;

    // Process announcement queue
    if (state.announcementQueue.length > 0 && !state.isAnnouncing) {
      const message = state.announcementQueue.shift();
      if (message) {
        state.isAnnouncing = true;
        context.emit?.('screen_reader_announce', {
          node,
          message,
          interrupt: false,
        });
      }
    }

    // Check for position changes and announce
    if (config.announce_changes && state.isFocused && node.position) {
      const pos = node.position;
      const dx = pos.x - state.lastPosition.x;
      const dy = pos.y - state.lastPosition.y;
      const dz = pos.z - state.lastPosition.z;
      const distMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distMoved > 0.5) {
        state.lastPosition = { x: pos.x, y: pos.y, z: pos.z };

        // Sonify position change
        if (config.sonify_position) {
          context.emit?.('screen_reader_sonify', {
            node,
            position: pos,
            pitchForHeight: config.pitch_for_height,
            panForPosition: config.pan_for_position,
          });
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__screenReaderState as ScreenReaderState;
    if (!state) return;

    if (event.type === 'screen_reader_focus') {
      state.isFocused = true;
      state.navigationStack.push(node.id || 'node');

      // Build announcement based on verbosity
      let announcement = getNodeAnnouncement(node, config.verbosity);

      // Add spatial information
      if (config.reading_mode === 'spatial' && node.position) {
        const pos = node.position;
        announcement += `. Position: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
      }

      context.emit?.('screen_reader_announce', {
        node,
        message: announcement,
        interrupt: true,
      });

      // Sonify position
      if (config.sonify_position && node.position) {
        context.emit?.('screen_reader_sonify', {
          node,
          position: node.position,
          pitchForHeight: config.pitch_for_height,
          panForPosition: config.pan_for_position,
        });
      }

      context.emit?.('on_screen_reader_focus', { node });
    } else if (event.type === 'screen_reader_blur') {
      state.isFocused = false;
      state.navigationStack.pop();
    } else if (event.type === 'screen_reader_navigate_next') {
      context.emit?.('screen_reader_focus_next', {
        node,
        order: config.navigation_order,
        mode: config.reading_mode,
      });
    } else if (event.type === 'screen_reader_navigate_prev') {
      context.emit?.('screen_reader_focus_prev', {
        node,
        order: config.navigation_order,
        mode: config.reading_mode,
      });
    } else if (event.type === 'screen_reader_navigate_in') {
      // Navigate into child elements
      if (state.childNodes.length > 0) {
        context.emit?.('screen_reader_focus_child', {
          node,
          childId: state.childNodes[0],
        });
      }
    } else if (event.type === 'screen_reader_navigate_out') {
      // Navigate to parent
      context.emit?.('screen_reader_focus_parent', { node });
    } else if (event.type === 'screen_reader_announce_complete') {
      state.isAnnouncing = false;
    } else if (event.type === 'screen_reader_add_child') {
      const childId = event.childId as string;
      if (!state.childNodes.includes(childId)) {
        state.childNodes.push(childId);
      }
    } else if (event.type === 'screen_reader_describe') {
      // Provide detailed description
      let description = getNodeDescription(node, config.verbosity);

      if (node.position) {
        const pos = node.position;
        description += ` Located at ${pos.x.toFixed(1)} meters right, ${pos.y.toFixed(1)} meters up, ${pos.z.toFixed(1)} meters forward.`;
      }

      state.announcementQueue.push(description);
    } else if (event.type === 'screen_reader_query') {
      context.emit?.('screen_reader_info', {
        queryId: event.queryId,
        node,
        isFocused: state.isFocused,
        navigationOrder: config.navigation_order,
        readingMode: config.reading_mode,
        childCount: state.childNodes.length,
      });
    }
  },
};

function getNodeAnnouncement(node: HSPlusNode, verbosity: string): string {
  const name = node.name || node.id || 'Object';
  const type = node.type || 'item';

  switch (verbosity) {
    case 'minimal':
      return name;
    case 'verbose':
      return `${name}, ${type}, interactive element`;
    default:
      return `${name}, ${type}`;
  }
}

function getNodeDescription(node: HSPlusNode, _verbosity: string): string {
  const name = node.name || node.id || 'Object';
  const type = node.type || 'item';

  let desc = `${name} is a ${type}`;

  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  if (node.material?.color) {
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    desc += `, colored ${node.material.color}`;
  }

  if (node.scale) {
    const s = node.scale;
    desc += `, size ${s.x?.toFixed(1) || 1} by ${s.y?.toFixed(1) || 1} by ${s.z?.toFixed(1) || 1} meters`;
  }

  return desc;
}

export default screenReaderHandler;
