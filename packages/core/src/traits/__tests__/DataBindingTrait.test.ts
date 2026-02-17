import { describe, it, expect, beforeEach } from 'vitest';
import { dataBindingHandler } from '../DataBindingTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('DataBindingTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  const baseConfig = {
    source: 'https://api.example.com/data',
    source_type: 'rest' as const,
    bindings: [
      { source_path: 'temperature', target_property: 'temp' },
      { source_path: 'nested.value', target_property: 'nestedVal' },
    ],
    refresh_rate: 1000,
    interpolation: false,
  };

  beforeEach(() => {
    node = createMockNode('data-node');
    ctx = createMockContext();
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================
  describe('lifecycle', () => {
    it('attaches and emits connect when source is set', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);
      expect((node as any).__dataBindingState).toBeDefined();
      expect(getEventCount(ctx, 'data_binding_connect')).toBe(1);
    });

    it('does not connect when source is empty', () => {
      attachTrait(dataBindingHandler, node, { source: '' }, ctx);
      expect(getEventCount(ctx, 'data_binding_connect')).toBe(0);
    });

    it('cleans up on detach', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);
      dataBindingHandler.onDetach?.(node as any, dataBindingHandler.defaultConfig, ctx as any);
      expect((node as any).__dataBindingState).toBeUndefined();
    });
  });

  // ===========================================================================
  // Data Reception
  // ===========================================================================
  describe('data reception', () => {
    it('applies data to bound properties', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);

      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_connected',
        handle: 'conn-1',
      });

      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_data',
        data: { temperature: 72, nested: { value: 'deep' } },
      });

      expect(node.temp).toBe(72);
      expect(node.nestedVal).toBe('deep');
      expect(getEventCount(ctx, 'on_data_change')).toBe(1);
    });

    it('handles missing nested values', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);

      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_connected',
        handle: 'c1',
      });

      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_data',
        data: { temperature: 50 }, // nested.value missing
      });

      expect(node.temp).toBe(50);
      expect(node.nestedVal).toBeUndefined();
    });
  });

  // ===========================================================================
  // Transforms
  // ===========================================================================
  describe('transforms', () => {
    it('applies scale transform', () => {
      const config = {
        ...baseConfig,
        bindings: [{
          source_path: 'rawVal',
          target_property: 'scaled',
          transform: 'scale' as const,
          transform_params: { factor: 2.5 },
        }],
      };
      attachTrait(dataBindingHandler, node, config, ctx);
      sendEvent(dataBindingHandler, node, config, ctx, {
        type: 'data_binding_connected', handle: 'c1',
      });
      sendEvent(dataBindingHandler, node, config, ctx, {
        type: 'data_binding_data',
        data: { rawVal: 10 },
      });

      expect(node.scaled).toBe(25);
    });

    it('applies normalize transform', () => {
      const config = {
        ...baseConfig,
        bindings: [{
          source_path: 'v',
          target_property: 'norm',
          transform: 'normalize' as const,
          transform_params: { min: 0, max: 100 },
        }],
      };
      attachTrait(dataBindingHandler, node, config, ctx);
      sendEvent(dataBindingHandler, node, config, ctx, {
        type: 'data_binding_connected', handle: 'c1',
      });
      sendEvent(dataBindingHandler, node, config, ctx, {
        type: 'data_binding_data',
        data: { v: 50 },
      });

      expect(node.norm).toBe(0.5);
    });

    it('applies map transform', () => {
      const config = {
        ...baseConfig,
        bindings: [{
          source_path: 'status',
          target_property: 'color',
          transform: 'map' as const,
          transform_params: { mapping: { ok: 'green', error: 'red' } },
        }],
      };
      attachTrait(dataBindingHandler, node, config, ctx);
      sendEvent(dataBindingHandler, node, config, ctx, {
        type: 'data_binding_connected', handle: 'c1',
      });
      sendEvent(dataBindingHandler, node, config, ctx, {
        type: 'data_binding_data',
        data: { status: 'ok' },
      });

      expect(node.color).toBe('green');
    });
  });

  // ===========================================================================
  // Connection Events
  // ===========================================================================
  describe('connection events', () => {
    it('data_binding_connected sets connected state', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);
      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_connected', handle: 'h1',
      });

      const state = (node as any).__dataBindingState;
      expect(state.isConnected).toBe(true);
      expect(getEventCount(ctx, 'on_data_connected')).toBe(1);
    });

    it('data_binding_error increments error count', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);
      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_error', error: 'timeout',
      });

      const state = (node as any).__dataBindingState;
      expect(state.errorCount).toBe(1);
      expect(getEventCount(ctx, 'on_data_error')).toBe(1);
    });

    it('data_binding_disconnect clears connection', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);
      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_connected', handle: 'h1',
      });
      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_disconnect',
      });

      const state = (node as any).__dataBindingState;
      expect(state.isConnected).toBe(false);
    });

    it('data_binding_query returns binding info', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);
      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_query', queryId: 'q1',
      });

      expect(getEventCount(ctx, 'data_binding_info')).toBe(1);
      const info = getLastEvent(ctx, 'data_binding_info') as any;
      expect(info.queryId).toBe('q1');
      expect(info.bindingCount).toBe(2);
    });
  });

  // ===========================================================================
  // Polling (onUpdate)
  // ===========================================================================
  describe('polling', () => {
    it('emits fetch at configured interval', () => {
      attachTrait(dataBindingHandler, node, baseConfig, ctx);
      sendEvent(dataBindingHandler, node, baseConfig, ctx, {
        type: 'data_binding_connected', handle: 'h1',
      });
      ctx.clearEvents();

      // Force time to exceed refresh_rate
      const state = (node as any).__dataBindingState;
      state.lastRefresh = Date.now() - 2000;

      updateTrait(dataBindingHandler, node, baseConfig, ctx, 0.1);
      expect(getEventCount(ctx, 'data_binding_fetch')).toBe(1);
    });
  });
});
