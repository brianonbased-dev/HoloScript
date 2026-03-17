/**
 * Rope Trait
 *
 * Rope/cable simulation with attachment points and breakability.
 * Uses Verlet integration for realistic physics.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface RopeSegment {
  position: { x: number; y: number; z: number };
  prevPosition: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
}

interface RopeState {
  isSimulating: boolean;
  isSnapped: boolean;
  snapPoint: number | null;
  segments: RopeSegment[];
  currentLength: number;
  tension: number;
  startAttachment: unknown;
  endAttachment: unknown;
}

interface RopeConfig {
  length: number; // meters
  segments: number;
  stiffness: number; // 0-1
  damping: number;
  radius: number; // visual radius
  attach_start: string; // node ID
  attach_end: string; // node ID
  breakable: boolean;
  break_force: number; // Newtons
  gravity_scale: number;
  mass_per_meter: number;
  collision: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const ropeHandler: TraitHandler<RopeConfig> = {
  name: 'rope',

  defaultConfig: {
    length: 5,
    segments: 20,
    stiffness: 0.9,
    damping: 0.02,
    radius: 0.02,
    attach_start: '',
    attach_end: '',
    breakable: false,
    break_force: 1000,
    gravity_scale: 1.0,
    mass_per_meter: 0.1,
    collision: true,
  },

  onAttach(node, config, context) {
    const state: RopeState = {
      isSimulating: false,
      isSnapped: false,
      snapPoint: null,
      segments: [],
      currentLength: config.length,
      tension: 0,
      startAttachment: null,
      endAttachment: null,
    };
    node.__ropeState = state;

    // Initialize segments
    const segmentLength = config.length / config.segments;
    for (let i = 0; i <= config.segments; i++) {
      state.segments.push({
        position: { x: 0, y: -i * segmentLength, z: 0 },
        prevPosition: { x: 0, y: -i * segmentLength, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
      });
    }

    // Create rope physics
    context.emit?.('rope_create', {
      node,
      segments: config.segments,
      length: config.length,
      stiffness: config.stiffness,
      damping: config.damping,
      massPerMeter: config.mass_per_meter,
      gravityScale: config.gravity_scale,
      collision: config.collision,
      radius: config.radius,
    });

    // Attach endpoints
    if (config.attach_start) {
      context.emit?.('rope_attach', {
        node,
        endpoint: 'start',
        targetNodeId: config.attach_start,
      });
    }
    if (config.attach_end) {
      context.emit?.('rope_attach', {
        node,
        endpoint: 'end',
        targetNodeId: config.attach_end,
      });
    }

    state.isSimulating = true;
  },

  onDetach(node, config, context) {
    const state = node.__ropeState as RopeState;
    if (state?.isSimulating) {
      context.emit?.('rope_destroy', { node });
    }
    delete node.__ropeState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__ropeState as RopeState;
    if (!state || !state.isSimulating || state.isSnapped) return;

    // Step rope simulation
    context.emit?.('rope_step', {
      node,
      deltaTime: delta,
    });

    // Check for breakage
    if (config.breakable && state.tension > config.break_force) {
      state.isSnapped = true;
      state.snapPoint = Math.floor(config.segments / 2);

      context.emit?.('rope_break', {
        node,
        snapPoint: state.snapPoint,
      });

      context.emit?.('on_rope_snap', {
        node,
        tension: state.tension,
        snapPoint: state.snapPoint,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__ropeState as RopeState;
    if (!state) return;

    if (event.type === 'rope_segment_update') {
      const positions = event.positions as Array<{ x: number; y: number; z: number }>;

      for (let i = 0; i < positions.length && i < state.segments.length; i++) {
        state.segments[i].position = positions[i];
      }

      state.tension = (event.tension as number) || 0;

      // Calculate current length
      let length = 0;
      for (let i = 1; i < state.segments.length; i++) {
        const prev = state.segments[i - 1].position;
        const curr = state.segments[i].position;
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dz = curr.z - prev.z;
        length += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      state.currentLength = length;

      // Update visual mesh
      context.emit?.('rope_mesh_update', {
        node,
        segments: state.segments,
        radius: config.radius,
      });
    } else if (event.type === 'rope_attach') {
      const endpoint = event.endpoint as 'start' | 'end';
      const targetNodeId = event.targetNodeId as string;
      const offset = (event.offset as { x: number; y: number; z: number }) || { x: 0, y: 0, z: 0 };

      context.emit?.('rope_create_attachment', {
        node,
        endpoint,
        targetNodeId,
        offset,
      });
    } else if (event.type === 'rope_detach') {
      const endpoint = event.endpoint as 'start' | 'end';

      if (endpoint === 'start') {
        state.startAttachment = null;
      } else {
        state.endAttachment = null;
      }

      context.emit?.('rope_remove_attachment', {
        node,
        endpoint,
      });
    } else if (event.type === 'rope_apply_force') {
      const segmentIndex = (event.segmentIndex as number) || Math.floor(config.segments / 2);
      const force = event.force as { x: number; y: number; z: number };

      context.emit?.('rope_external_force', {
        node,
        segmentIndex,
        force,
      });
    } else if (event.type === 'rope_set_length') {
      const newLength = event.length as number;

      context.emit?.('rope_change_length', {
        node,
        length: newLength,
      });
    } else if (event.type === 'rope_repair') {
      if (state.isSnapped) {
        state.isSnapped = false;
        state.snapPoint = null;

        context.emit?.('rope_reconnect', { node });
      }
    } else if (event.type === 'rope_pause') {
      state.isSimulating = false;
    } else if (event.type === 'rope_resume') {
      state.isSimulating = true;
    } else if (event.type === 'rope_query') {
      context.emit?.('rope_info', {
        queryId: event.queryId,
        node,
        isSimulating: state.isSimulating,
        isSnapped: state.isSnapped,
        currentLength: state.currentLength,
        tension: state.tension,
        segmentCount: state.segments.length,
        hasStartAttachment: state.startAttachment !== null,
        hasEndAttachment: state.endAttachment !== null,
      });
    }
  },
};

export default ropeHandler;
