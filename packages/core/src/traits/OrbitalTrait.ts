/**
 * Orbital Trait
 *
 * Automatically updates orb position based on Keplerian orbital elements
 * and current simulation time. Enables realistic orbital motion for celestial bodies.
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import { calculatePosition, type OrbitalElements } from '../orbital/KeplerianCalculator';
import { logger } from '../logger';
import type { HSPlusNode } from '../types/HoloScriptPlus';

export type OrbitalTraitConfig = OrbitalElements;

/**
 * Orbital trait handler
 * Updates orb position based on orbital mechanics on every frame
 */
export const orbitalHandler: TraitHandler<OrbitalTraitConfig> = {
  name: 'orbital',
  defaultConfig: {} as OrbitalTraitConfig,

  /**
   * Called when trait is attached to a node
   */
  onAttach(node: HSPlusNode, _config: OrbitalTraitConfig, _context: TraitContext) {
    logger.info(`[OrbitalTrait] Attached to ${node.name}`);
  },

  /**
   * Called every frame to update orbital position
   */
  onUpdate(node: HSPlusNode, config: OrbitalTraitConfig, context: TraitContext, _delta: number) {
    // Merge node properties into config to allow @orbital() to pick up elements from the object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime duck typing requires any spread
    const properties = (node as any).properties || {};
    const mergedConfig = { ...properties, ...config };

    if (!mergedConfig || !mergedConfig.semiMajorAxis) {
      return; // No orbital configuration
    }

    // Get current simulation time (Julian date) from context
    const julianDate = (context as any).julianDate || 0;

    // Scale factor to convert AU to visible units (1 AU = 50 units for better visibility)
    const visualScale = context.getScaleMultiplier() * 50;
    // Boost relative distance for satellites (moons) to keep them outside the parent's mesh
    const satelliteScale = 5;

    // Calculate position using Keplerian orbital mechanics
    const rawPosition = calculatePosition(mergedConfig, julianDate);

    // Map to Three.js coordinates: Keplerian Z (height) -> Three.js Y (up)
    // Scale factor to use (global vs satellite relative)
    const currentScale = mergedConfig.parent ? visualScale * satelliteScale : visualScale;

    let finalPosition = {
      x: rawPosition.x * currentScale,
      y: rawPosition.z * currentScale,
      z: rawPosition.y * currentScale,
    };

    // Get parent position if this is a moon/satellite
    if (mergedConfig.parent) {
      // Try to get parent node by name or object reference
      let parentNode = (context as any).getNode?.(mergedConfig.parent);

      // Fallback: If parent is already the object (evaluated string)
      if (!parentNode && typeof mergedConfig.parent === 'object' && mergedConfig.parent.position) {
        parentNode = mergedConfig.parent;
      }

      if (parentNode && parentNode.position) {
        // Add parent's position to our orbital position
        finalPosition = {
          x: finalPosition.x + (parentNode.position.x || 0),
          y: finalPosition.y + (parentNode.position.y || 0),
          z: finalPosition.z + (parentNode.position.z || 0),
        };
      } else {
        // Failure to find parent - Moon will end up in the Sun (0, 0, 0)
        if (typeof mergedConfig.parent === 'string') {
          logger.warn(`[OrbitalTrait] Parent "${mergedConfig.parent}" not found for ${node.name}`);
        }
      }
    }

    // Update node position
    node.position = finalPosition as any;

    // Emit position update event
    context.emit('position_update', { position: finalPosition });
  },
};
