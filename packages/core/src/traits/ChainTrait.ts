/**
 * Chain Trait
 *
 * Rigid body chain constraint for linked objects.
 * Uses physics joints to connect individual rigid links.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface ChainLink {
  position: [number, number, number];
  rotation: { x: number; y: number; z: number; w: number };
  bodyHandle: unknown;
}

interface ChainState {
  isSimulating: boolean;
  links: ChainLink[];
  startAttachment: unknown;
  endAttachment: unknown;
  isBroken: boolean;
  breakPoint: number | null;
  totalLength: number;
}

interface ChainConfig {
  links: number;
  link_length: number; // meters
  link_mass: number; // kg per link
  stiffness: number; // Joint stiffness
  damping: number;
  attach_start: string; // node ID
  attach_end: string; // node ID
  collision_between_links: boolean;
  breakable: boolean;
  break_force: number;
  link_geometry: 'capsule' | 'box' | 'custom';
}

// =============================================================================
// HANDLER
// =============================================================================

export const chainHandler: TraitHandler<ChainConfig> = {
  name: 'chain',

  defaultConfig: {
    links: 10,
    link_length: 0.1,
    link_mass: 0.5,
    stiffness: 1.0,
    damping: 0.1,
    attach_start: '',
    attach_end: '',
    collision_between_links: true,
    breakable: false,
    break_force: 500,
    link_geometry: 'capsule',
  },

  onAttach(node, config, context) {
    const state: ChainState = {
      isSimulating: false,
      links: [],
      startAttachment: null,
      endAttachment: null,
      isBroken: false,
      breakPoint: null,
      totalLength: config.links * config.link_length,
    };
    node.__chainState = state;

    // Initialize links
    for (let i = 0; i < config.links; i++) {
      state.links.push({
        position: [0, -i * config.link_length, 0],
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        bodyHandle: null,
      });
    }

    // Create chain physics
    context.emit?.('chain_create', {
      node,
      linkCount: config.links,
      linkLength: config.link_length,
      linkMass: config.link_mass,
      stiffness: config.stiffness,
      damping: config.damping,
      collisionBetweenLinks: config.collision_between_links,
      linkGeometry: config.link_geometry,
    });

    // Attach endpoints
    if (config.attach_start) {
      context.emit?.('chain_attach', {
        node,
        endpoint: 'start',
        targetNodeId: config.attach_start,
      });
    }
    if (config.attach_end) {
      context.emit?.('chain_attach', {
        node,
        endpoint: 'end',
        targetNodeId: config.attach_end,
      });
    }

    state.isSimulating = true;
  },

  onDetach(node, config, context) {
    const state = node.__chainState as ChainState;
    if (state?.isSimulating) {
      context.emit?.('chain_destroy', { node });
    }
    delete node.__chainState;
  },

  onUpdate(node, _config, _context, _delta) {
    const state = node.__chainState as ChainState;
    if (!state || !state.isSimulating) return;

    // Physics update is handled by physics engine
    // Just update visuals based on received positions
  },

  onEvent(node, config, context, event) {
    const state = node.__chainState as ChainState;
    if (!state) return;

    if (event.type === 'chain_link_update') {
      const linkIndex = event.linkIndex as number;
      const position = event.position as
        [number, number, number] | [number, number, number];
      const rotation = event.rotation as { x: number; y: number; z: number; w: number };
      const normalizedPos: [number, number, number] = Array.isArray(position)
        ? position
        : [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0];

      if (state.links[linkIndex]) {
        state.links[linkIndex].position = normalizedPos;
        state.links[linkIndex].rotation = rotation;
      }

      // Update visual mesh
      context.emit?.('chain_mesh_update', {
        node,
        linkIndex,
        position: normalizedPos,
        rotation,
      });
    } else if (event.type === 'chain_full_update') {
      const positions = event.positions as Array<
        [number, number, number] | [number, number, number]
      >;
      const rotations = event.rotations as Array<{ x: number; y: number; z: number; w: number }>;

      for (let i = 0; i < state.links.length && i < positions.length; i++) {
        const p = positions[i];
        const px = Array.isArray(p) ? (p[0] ?? 0) : (p[0] ?? 0);
        const py = Array.isArray(p) ? (p[1] ?? 0) : (p[1] ?? 0);
        const pz = Array.isArray(p) ? (p[2] ?? 0) : (p[2] ?? 0);
        state.links[i].position = [px, py, pz];
        state.links[i].rotation = rotations[i] || state.links[i].rotation;
      }

      context.emit?.('chain_full_mesh_update', {
        node,
        links: state.links,
      });
    } else if (event.type === 'chain_attach') {
      const endpoint = event.endpoint as 'start' | 'end';
      const targetNodeId = event.targetNodeId as string;

      context.emit?.('chain_create_attachment', {
        node,
        endpoint,
        targetNodeId,
        linkIndex: endpoint === 'start' ? 0 : state.links.length - 1,
      });
    } else if (event.type === 'chain_detach') {
      const endpoint = event.endpoint as 'start' | 'end';

      if (endpoint === 'start') {
        state.startAttachment = null;
      } else {
        state.endAttachment = null;
      }

      context.emit?.('chain_remove_attachment', {
        node,
        endpoint,
      });
    } else if (event.type === 'chain_break') {
      if (config.breakable || event.force) {
        const linkIndex = (event.linkIndex as number) || Math.floor(config.links / 2);

        state.isBroken = true;
        state.breakPoint = linkIndex;

        context.emit?.('chain_break_at', {
          node,
          linkIndex,
        });

        context.emit?.('on_chain_break', {
          node,
          breakPoint: linkIndex,
        });
      }
    } else if (event.type === 'chain_repair') {
      if (state.isBroken) {
        state.isBroken = false;
        state.breakPoint = null;

        context.emit?.('chain_reconnect', { node });
      }
    } else if (event.type === 'chain_apply_force') {
      const linkIndex = event.linkIndex as number;
      const force = event.force as [number, number, number];

      context.emit?.('chain_external_force', {
        node,
        linkIndex,
        force,
      });
    } else if (event.type === 'chain_pause') {
      state.isSimulating = false;
      context.emit?.('chain_sleep', { node });
    } else if (event.type === 'chain_resume') {
      state.isSimulating = true;
      context.emit?.('chain_wake', { node });
    } else if (event.type === 'chain_query') {
      context.emit?.('chain_info', {
        queryId: event.queryId,
        node,
        isSimulating: state.isSimulating,
        linkCount: state.links.length,
        totalLength: state.totalLength,
        isBroken: state.isBroken,
        breakPoint: state.breakPoint,
        hasStartAttachment: state.startAttachment !== null,
        hasEndAttachment: state.endAttachment !== null,
      });
    }
  },
};

export default chainHandler;
