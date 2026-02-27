import type { TraitHandler, HSPlusNode } from './TraitTypes';

export interface LayerAwareTrait {
  layers: Array<'vr' | 'vrr' | 'ar' | 'all'>;
  fallback?: 'hidden' | 'placeholder';
}

export const layerAwareHandler: TraitHandler<LayerAwareTrait> = {
  name: 'layer_aware',

  defaultConfig: {
    layers: ['all'],
    fallback: 'hidden',
  },

  onAttach(node, config, context) {
    // Determine active layer (vr, vrr, ar) and apply visibility based on config
    const state = {
      activeLayers: config.layers,
      fallbackMode: config.fallback,
    };
    (node as unknown as { __layerAwareState: any }).__layerAwareState = state;
  },

  onDetach(node) {
    delete (node as unknown as { __layerAwareState?: any }).__layerAwareState;
  },

  onUpdate(node, config, context, _delta) {
    // In a full implementation, we'd query the runtime layer state (AR/VRR/VR)
    // and toggle node.properties.visible accordingly if node.properties exists.
  }
};
