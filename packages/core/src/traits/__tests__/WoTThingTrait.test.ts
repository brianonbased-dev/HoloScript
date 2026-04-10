/**
 * WoTThingTrait Tests
 *
 * Tests for W3C Web of Things Thing Description trait.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  wotThingHandler,
  hasWoTThingTrait,
  getWoTThingState,
  getCachedThingDescription,
  invalidateThingDescription,
  type WoTThingConfig,
  type WoTThingState,
} from '../WoTThingTrait';
import {
  createMockContext,
  createMockNode,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('wotThingHandler', () => {
  describe('metadata', () => {
    it('should have correct name', () => {
      expect(wotThingHandler.name).toBe('wot_thing');
    });

    it('should have default config', () => {
      const config = wotThingHandler.defaultConfig;

      expect(config.title).toBe('');
      expect(config.security).toBe('nosec');
      expect(config.version).toBe('1.0.0');
      expect(config.auto_generate).toBe(false);
    });
  });

  describe('onAttach', () => {
    it('should initialize WoT state on node', () => {
      const node = createMockNode('thing1');
      const context = createMockContext();
      const config: WoTThingConfig = {
        title: 'Test Thing',
        security: 'nosec',
      };

      wotThingHandler.onAttach!(node, config, context);

      const state = getWoTThingState(node);
      expect(state).toBeDefined();
      expect(state?.tdGenerated).toBe(false);
      expect(state?.cachedTD).toBeNull();
      expect(state?.validationErrors).toEqual([]);
    });

    it('should emit wot_thing_attached event', () => {
      const node = createMockNode('thing1');
      const context = createMockContext();
      const config: WoTThingConfig = {
        title: 'Test Thing',
        security: 'basic',
      };

      wotThingHandler.onAttach!(node, config, context);

      expect(getEventCount(context, 'wot_thing_attached')).toBe(1);
      const event = getLastEvent(context, 'wot_thing_attached');
      expect(event.nodeId).toBe('thing1');
    });

    it('should trigger auto-generation when configured', () => {
      vi.useFakeTimers();

      const node = createMockNode('autoThing');
      const context = createMockContext();
      const config: WoTThingConfig = {
        title: 'Auto Thing',
        security: 'nosec',
        auto_generate: true,
      };

      wotThingHandler.onAttach!(node, config, context);

      // Fast-forward timer
      vi.runAllTimers();

      expect(getEventCount(context, 'wot_thing_generate')).toBe(1);
      const event = getLastEvent(context, 'wot_thing_generate');
      expect(event.nodeId).toBe('autoThing');

      vi.useRealTimers();
    });
  });

  describe('onDetach', () => {
    it('should remove WoT state from node', () => {
      const node = createMockNode('thing1');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);
      expect(getWoTThingState(node)).not.toBeNull();

      wotThingHandler.onDetach!(node, config, context);
      expect(getWoTThingState(node)).toBeNull();
    });

    it('should emit wot_thing_detached event', () => {
      const node = createMockNode('thing1');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);
      wotThingHandler.onDetach!(node, config, context);

      expect(getEventCount(context, 'wot_thing_detached')).toBe(1);
      const event = getLastEvent(context, 'wot_thing_detached');
      expect(event.nodeId).toBe('thing1');
    });
  });

  describe('onUpdate', () => {
    it('should mark TD as stale when state changes', () => {
      const node = createMockNode('thing1');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      // Set initial state
      const state = getWoTThingState(node)!;
      state.tdGenerated = true;
      state.cachedTD = '{"@context":"..."}';

      // First update sets hash
      (context as any).getState = () => ({ prop: 'value1' });
      wotThingHandler.onUpdate!(node, config, context, 16);

      // Change state
      (context as any).getState = () => ({ prop: 'value2' });
      wotThingHandler.onUpdate!(node, config, context, 16);

      expect(state.cachedTD).toBeNull();
      expect(getEventCount(context, 'wot_thing_stale')).toBe(1);
    });
  });

  describe('onEvent', () => {
    it('should handle wot_generate_request event', () => {
      const node = createMockNode('thing1');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      sendEvent(wotThingHandler, node, config, context, {
        type: 'wot_generate_request',
      });

      expect(getEventCount(context, 'wot_thing_generate')).toBe(1);
      const event = getLastEvent(context, 'wot_thing_generate');
      expect(event.nodeId).toBe('thing1');
    });

    it('should handle wot_td_generated event', () => {
      const node = createMockNode('thing1');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      const generatedTD = '{"@context":"https://www.w3.org/2022/wot/td/v1.1"}';
      sendEvent(wotThingHandler, node, config, context, {
        type: 'wot_td_generated',
        td: generatedTD,
        errors: [],
      });

      const state = getWoTThingState(node)!;
      expect(state.tdGenerated).toBe(true);
      expect(state.cachedTD).toBe(generatedTD);
      expect(state.lastGenerated).toBeGreaterThan(0);
    });

    it('should store validation errors from TD generation', () => {
      const node = createMockNode('thing1');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      sendEvent(wotThingHandler, node, config, context, {
        type: 'wot_td_generated',
        td: null,
        errors: ['Missing required property: @context'],
      });

      const state = getWoTThingState(node)!;
      expect(state.validationErrors).toHaveLength(1);
      expect(state.validationErrors[0]).toContain('Missing required property');
    });
  });
});

describe('helper functions', () => {
  describe('hasWoTThingTrait', () => {
    it('should return true for nodes with WoT state', () => {
      const node = createMockNode('thing');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      expect(hasWoTThingTrait(node)).toBe(true);
    });

    it('should return false for nodes without WoT state', () => {
      const node = createMockNode('plain');

      expect(hasWoTThingTrait(node)).toBe(false);
    });
  });

  describe('getWoTThingState', () => {
    it('should return state for nodes with WoT trait', () => {
      const node = createMockNode('thing');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      const state = getWoTThingState(node);
      expect(state).not.toBeNull();
      expect(state?.tdGenerated).toBe(false);
    });

    it('should return null for nodes without WoT trait', () => {
      const node = createMockNode('plain');

      expect(getWoTThingState(node)).toBeNull();
    });
  });

  describe('getCachedThingDescription', () => {
    it('should return cached TD', () => {
      const node = createMockNode('thing');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      // Set cached TD
      const state = getWoTThingState(node)!;
      state.cachedTD = '{"@context":"test"}';

      expect(getCachedThingDescription(node)).toBe('{"@context":"test"}');
    });

    it('should return null when no TD cached', () => {
      const node = createMockNode('thing');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      expect(getCachedThingDescription(node)).toBeNull();
    });
  });

  describe('invalidateThingDescription', () => {
    it('should clear cached TD', () => {
      const node = createMockNode('thing');
      const context = createMockContext();
      const config: WoTThingConfig = { title: 'Test', security: 'nosec' };

      wotThingHandler.onAttach!(node, config, context);

      // Set cached TD
      const state = getWoTThingState(node)!;
      state.cachedTD = '{"@context":"test"}';

      invalidateThingDescription(node);

      expect(state.cachedTD).toBeNull();
    });
  });
});
