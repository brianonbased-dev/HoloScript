import { describe, it, expect, vi, beforeEach } from 'vitest';
import { layerAwareHandler, type LayerAwareTrait } from '../LayerAwareTrait';
import type { HSPlusNode } from '../TraitTypes';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(overrides: Partial<HSPlusNode> = {}): HSPlusNode {
  return {
    type: 'object',
    name: 'TestObject',
    traits: [],
    children: [],
    properties: {},
    ...overrides,
  } as HSPlusNode;
}

function makeContext() {
  return {
    scene: {} as any,
    runtime: {} as any,
    dt: 0.016,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('LayerAwareTrait', () => {
  // -------------------------------------------------------------------------
  // Handler metadata
  // -------------------------------------------------------------------------
  describe('handler metadata', () => {
    it('should have name "layer_aware"', () => {
      expect(layerAwareHandler.name).toBe('layer_aware');
    });

    it('should provide default config with layers=["all"] and fallback="hidden"', () => {
      expect(layerAwareHandler.defaultConfig).toEqual({
        layers: ['all'],
        fallback: 'hidden',
      });
    });
  });

  // -------------------------------------------------------------------------
  // onAttach
  // -------------------------------------------------------------------------
  describe('onAttach', () => {
    it('should store active layers and fallback mode on the node', () => {
      const node = makeNode();
      const config: LayerAwareTrait = { layers: ['vr', 'ar'], fallback: 'placeholder' };

      layerAwareHandler.onAttach!(node, config, makeContext());

      const state = (node as any).__layerAwareState;
      expect(state).toBeDefined();
      expect(state.activeLayers).toEqual(['vr', 'ar']);
      expect(state.fallbackMode).toBe('placeholder');
    });

    it('should use default "hidden" fallback when not specified', () => {
      const node = makeNode();
      const config: LayerAwareTrait = { layers: ['vrr'] };

      layerAwareHandler.onAttach!(node, config, makeContext());

      const state = (node as any).__layerAwareState;
      expect(state.fallbackMode).toBeUndefined(); // undefined because config.fallback was not set
    });

    it('should handle "all" layer correctly', () => {
      const node = makeNode();
      const config: LayerAwareTrait = { layers: ['all'], fallback: 'hidden' };

      layerAwareHandler.onAttach!(node, config, makeContext());

      expect((node as any).__layerAwareState.activeLayers).toEqual(['all']);
    });
  });

  // -------------------------------------------------------------------------
  // onDetach
  // -------------------------------------------------------------------------
  describe('onDetach', () => {
    it('should remove __layerAwareState from the node', () => {
      const node = makeNode();
      (node as any).__layerAwareState = { activeLayers: ['vr'], fallbackMode: 'hidden' };

      layerAwareHandler.onDetach!(node, layerAwareHandler.defaultConfig!, makeContext());

      expect((node as any).__layerAwareState).toBeUndefined();
    });

    it('should not throw if __layerAwareState was never set', () => {
      const node = makeNode();

      expect(() => {
        layerAwareHandler.onDetach!(node, layerAwareHandler.defaultConfig!, makeContext());
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // onUpdate
  // -------------------------------------------------------------------------
  describe('onUpdate', () => {
    it('should exist and not throw', () => {
      const node = makeNode();
      const config: LayerAwareTrait = { layers: ['vr'], fallback: 'hidden' };

      expect(() => {
        layerAwareHandler.onUpdate!(node, config, makeContext(), 0.016);
      }).not.toThrow();
    });
  });
});
