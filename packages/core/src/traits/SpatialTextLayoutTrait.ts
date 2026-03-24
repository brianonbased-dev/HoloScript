/**
 * SpatialTextLayoutTrait — v5.1
 * 
 * Projects text into 3D volumes (Sphere, Cylinder, Wave, Spiral).
 */

import type { TraitHandler, HSPlusNode, TraitContext } from './TraitTypes';

export interface SpatialTextLayoutConfig {
  layout: 'sphere' | 'cylinder' | 'wave' | 'spiral';
  radius: number;
  letterSpacing: number;
  lineHeight: number;
  interactive: boolean;
  hoverEffect: 'none' | 'scale' | 'glow' | 'lift';
}

export const spatialTextLayoutHandler: TraitHandler<SpatialTextLayoutConfig> = {
  name: 'spatial_text_layout',
  defaultConfig: {
    layout: 'cylinder',
    radius: 5,
    letterSpacing: 1.1,
    lineHeight: 1.5,
    interactive: true,
    hoverEffect: 'scale',
  },

  onAttach(node: HSPlusNode, config: SpatialTextLayoutConfig): void {
    console.log(`[SpatialText] Attaching ${config.layout} layout with radius ${config.radius} to ${node.id}`);
    (node as any).__spatialTextState = { initialized: true, rotationY: 0 };
  },

  onDetach(node: HSPlusNode): void {
    delete (node as any).__spatialTextState;
  },

  onUpdate(_node: HSPlusNode, _config: SpatialTextLayoutConfig, _context: TraitContext, _delta: number): void {
    // Math logic for projection would happen here in the renderer adapter
  },

  onEvent(node: HSPlusNode, _config: SpatialTextLayoutConfig, context: TraitContext, event: any): void {
    if ((typeof event === 'string' ? event : event.type) === 'spatial:rotate') {
      if (event.target === node.id || event.target === 'all') {
        const delta = event.delta ?? 0;
        const dampening = 0.005;
        // Emit rotation event to the renderer
        context.emit?.('node:rotate', { 
          id: node.id, 
          rotation: [0, delta * dampening, 0],
          relative: true 
        });
      }
    }
  },
};

export default spatialTextLayoutHandler;
