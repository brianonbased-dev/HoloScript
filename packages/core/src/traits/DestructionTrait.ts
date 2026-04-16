import type { Vector3 } from '../types';
﻿/**
 * Destruction Trait
 *
 * Physics-based destruction with fragmentation, chain reactions, and debris
 *
 * @version 2.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface Fragment {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
  rotation: [number, number, number];
  angularVelocity: [number, number, number];
  scale: number;
  lifetime: number;
  mesh?: unknown;
}

interface DestructionState {
  currentHealth: number;
  maxHealth: number;
  isDestroyed: boolean;
  fragments: Fragment[];
  accumulatedDamage: number;
  lastImpactTime: number;
  originalMesh?: unknown;
  chainReactionTriggered: boolean;
}

interface DestructionConfig {
  mode: 'voronoi' | 'shatter' | 'chunks' | 'dissolve';
  fragment_count: number;
  impact_threshold: number; // Minimum impulse to trigger destruction
  damage_threshold: number; // Health at which destruction occurs
  fragment_lifetime: number; // Seconds before fragments despawn
  explosion_force: number; // Outward force on fragments
  chain_reaction: boolean; // Can trigger destruction in nearby objects
  chain_radius: number; // Radius for chain reactions
  chain_delay: number; // Delay before chain reaction
  debris_physics: boolean; // Fragments have physics
  sound_on_break: string; // Sound to play
  effect_on_break: string; // Particle effect to spawn
  fade_fragments: boolean; // Fragments fade over time
}

// =============================================================================
// FRAGMENTATION HELPERS
// =============================================================================

function generateVoronoiPoints(
  count: number,
  bounds: Vector3
): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    points.push([
      (Math.random() - 0.5) * bounds[0],
      (Math.random() - 0.5) * bounds[1],
      (Math.random() - 0.5) * bounds[2],
    ]);
  }
  return points;
}

function generateFragments(
  position: [number, number, number],
  scale: Vector3,
  impactPoint: Vector3 | null,
  config: DestructionConfig
): Fragment[] {
  const fragments: Fragment[] = [];
  const points = generateVoronoiPoints(config.fragment_count, scale);

  for (let i = 0; i < points.length; i++) {
    // Direction from center (or impact point)
    const center = impactPoint || [0, 0, 0 ];
    const dx = points[i][0] - center[0];
    const dy = points[i][1] - center[1];
    const dz = points[i][2] - center[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

    // Normalize and apply explosion force
    const explosionScale = config.explosion_force + Math.random() * config.explosion_force * 0.5;

    fragments.push({
      id: `fragment_${i}_${Date.now()}`,
      position: [position[0] + points[i][0], position[1] + points[i][1], position[2] + points[i][2]],
      velocity: [
        (dx / dist) * explosionScale,
        (dy / dist) * explosionScale + Math.random() * 2, // Slight upward bias
        (dz / dist) * explosionScale,
      ],
      rotation: [0, 0, 0],
      angularVelocity: [
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      ],
      scale: (0.3 + Math.random() * 0.7) / Math.sqrt(config.fragment_count),
      lifetime: config.fragment_lifetime,
    });
  }

  return fragments;
}

// =============================================================================
// HANDLER
// =============================================================================

export const destructionHandler: TraitHandler<DestructionConfig> = {
  name: 'destruction',

  defaultConfig: {
    mode: 'voronoi',
    fragment_count: 8,
    impact_threshold: 10,
    damage_threshold: 0,
    fragment_lifetime: 5,
    explosion_force: 5,
    chain_reaction: false,
    chain_radius: 3,
    chain_delay: 0.1,
    debris_physics: true,
    sound_on_break: '',
    effect_on_break: '',
    fade_fragments: true,
  },

  onAttach(node, config, context) {
    const state: DestructionState = {
      currentHealth: 100,
      maxHealth: 100,
      isDestroyed: false,
      fragments: [],
      accumulatedDamage: 0,
      lastImpactTime: 0,
      chainReactionTriggered: false,
    };
    node.__destructionState = state;

    // Subscribe to collision events via emit
    context.emit?.('subscribe_collision', { node });
  },

  onDetach(node, config, context) {
    const state = node.__destructionState as DestructionState;
    if (state?.fragments) {
      // Clean up fragments via emit
      for (const frag of state.fragments) {
        if (frag.mesh) {
          context.emit?.('remove_object', { node: frag.mesh });
        }
      }
    }
    delete node.__destructionState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__destructionState as DestructionState;
    if (!state) return;

    // Update fragments
    if (state.isDestroyed && state.fragments.length > 0) {
      const gravity = 9.81;
      const remainingFragments: Fragment[] = [];

      for (const frag of state.fragments) {
        frag.lifetime -= delta;

        if (frag.lifetime > 0) {
          // Update physics
          frag.velocity[1] -= gravity * delta;

          frag.position[0] += frag.velocity[0] * delta;
          frag.position[1] += frag.velocity[1] * delta;
          frag.position[2] += frag.velocity[2] * delta;

          frag.rotation[0] += frag.angularVelocity[0] * delta;
          frag.rotation[1] += frag.angularVelocity[1] * delta;
          frag.rotation[2] += frag.angularVelocity[2] * delta;

          // Apply drag
          const drag = 0.98;
          frag.velocity[0] *= drag;
          frag.velocity[2] *= drag;

          // Update visual via emit
          if (frag.mesh) {
            const alpha = config.fade_fragments ? frag.lifetime / config.fragment_lifetime : 1;
            context.emit?.('update_object', {
              node: frag.mesh,
              position: frag.position,
              rotation: frag.rotation,
              opacity: alpha,
            });
          }

          // Ground collision
          if (frag.position[1] < 0) {
            frag.position[1] = 0;
            frag.velocity[1] = -frag.velocity[1] * 0.3; // Bounce
            frag.velocity[0] *= 0.8;
            frag.velocity[2] *= 0.8;
          }

          remainingFragments.push(frag);
        } else {
          // Remove fragment via emit
          if (frag.mesh) {
            context.emit?.('remove_object', { node: frag.mesh });
          }
        }
      }

      state.fragments = remainingFragments;

      // Emit completion when all fragments gone
      if (remainingFragments.length === 0) {
        context.emit?.('on_destruction_complete', { node });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__destructionState as DestructionState;
    if (!state) return;

    if (event.type === 'damage') {
      const damageAmount = ((event as unknown as Record<string, unknown>).amount as number) || 10;
      state.currentHealth -= damageAmount;
      state.accumulatedDamage += damageAmount;

      if (state.currentHealth <= config.damage_threshold && !state.isDestroyed) {
        triggerDestruction(
          node,
          config,
          context,
          state,
          event.impactPoint as [number, number, number] | undefined
        );
      }
    } else if (event.type === 'destroy') {
      if (!state.isDestroyed) {
        triggerDestruction(
          node,
          config,
          context,
          state,
          event.impactPoint as [number, number, number] | undefined
        );
      }
    } else if (event.type === 'repair') {
      state.currentHealth = state.maxHealth;
      state.accumulatedDamage = 0;

      // Restore original mesh: remove fragments and reset state
      if (state.isDestroyed) {
        for (const frag of state.fragments) {
          if (frag.mesh) {
            context.emit?.('remove_object', { node: frag.mesh });
          }
        }
        state.fragments = [];
        state.isDestroyed = false;
        state.chainReactionTriggered = false;

        // Restore original node visibility/mesh
        if (state.originalMesh) {
          context.emit?.('restore_mesh', { node, mesh: state.originalMesh });
        }
        context.emit?.('set_visible', { node, visible: true });
        context.emit?.('on_repaired', { node });
      }
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function _handleImpact(
  node: unknown,
  config: DestructionConfig,
  context: TraitContext,
  state: DestructionState,
  impulse: number,
  impactPoint: Vector3 | undefined
): void {
  if (impulse >= config.impact_threshold) {
    // Calculate damage based on impulse
    const damage = (impulse / config.impact_threshold) * 10;
    state.currentHealth -= damage;
    state.accumulatedDamage += damage;
    state.lastImpactTime = Date.now();

    context.emit?.('on_damage', {
      node,
      damage,
      health: state.currentHealth,
      impactPoint,
    });

    if (state.currentHealth <= config.damage_threshold) {
      triggerDestruction(node, config, context, state, impactPoint);
    }
  }
}

function triggerDestruction(
  node: unknown,
  config: DestructionConfig,
  context: TraitContext,
  state: DestructionState,
  impactPoint: Vector3 | undefined
): void {
  if (state.isDestroyed) return;

  // Store original mesh for repair restoration
  if (!state.originalMesh) {
    state.originalMesh =
      (node as Record<string, unknown>).mesh ?? (node as Record<string, unknown>).geometry ?? node;
  }

  state.isDestroyed = true;

  const nodeRecord = node as Record<string, unknown>;
  const position = (nodeRecord.position as [number, number, number]) || [0, 0, 0];
  const scale = (nodeRecord.scale as [number, number, number]) || [1, 1, 1];

  // Generate fragments
  state.fragments = generateFragments(
    position,
    scale,
    impactPoint
      ? [
          impactPoint[0] - position[0],
          impactPoint[1] - position[1],
          impactPoint[2] - position[2],
        ]
      : null,
    config
  );

  // Create fragment meshes
  const ctxExt = context as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const frag of state.fragments) {
    if (typeof ctxExt.createFragment === 'function') {
      frag.mesh = ctxExt.createFragment({
        position: frag.position,
        scale: frag.scale,
        material: (node as Record<string, unknown>).material,
        physics: config.debris_physics,
      });
    }
  }

  // Hide original object
  if (typeof ctxExt.setVisible === 'function') {
    ctxExt.setVisible(node, false);
  }

  // Play sound
  if (config.sound_on_break && typeof ctxExt.playSound === 'function') {
    ctxExt.playSound(config.sound_on_break, position);
  }

  // Spawn particle effect
  if (config.effect_on_break && typeof ctxExt.spawnEffect === 'function') {
    ctxExt.spawnEffect(config.effect_on_break, position);
  }

  // Emit destruction event
  context.emit?.('on_destruction', {
    node,
    fragments: state.fragments.length,
    impactPoint,
  });

  // Chain reaction
  if (config.chain_reaction && !state.chainReactionTriggered) {
    state.chainReactionTriggered = true;

    setTimeout(() => {
      const nearbyDestructibles = (
        typeof ctxExt.getObjectsInRadius === 'function'
          ? ctxExt.getObjectsInRadius(position, config.chain_radius)
          : []
      ) as Array<Record<string, unknown>>;
      for (const other of nearbyDestructibles) {
        if (other !== node && other.__destructionState) {
          if (typeof ctxExt.dispatchEvent === 'function') {
            ctxExt.dispatchEvent(other, { type: 'destroy', impactPoint: position });
          }
        }
      }
    }, config.chain_delay * 1000);
  }
}

export default destructionHandler;
