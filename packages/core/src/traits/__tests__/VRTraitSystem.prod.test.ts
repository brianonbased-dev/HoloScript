/**
 * VRTraitSystem Production Tests
 *
 * Tests the VRTraitRegistry: handler registration, lookup, attach/detach/
 * update/event lifecycle, updateAllTraits, handleEventForAllTraits with
 * the physics↔haptics bridge pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vrTraitRegistry, VRTraitRegistry } from '../VRTraitSystem';
import type { TraitHandler, TraitContext, TraitEvent } from '../TraitTypes';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'vr-node') {
  return { id, traits: new Map(), properties: {} } as any;
}

function makeContext(overrides: any = {}): any {
  return {
    emit: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn(() => ({})),
    vr: {
      hands: { left: null, right: null },
      getDominantHand: vi.fn(() => null),
    },
    physics: {
      setKinematic: vi.fn(),
      applyVelocity: vi.fn(),
    },
    haptics: {
      pulse: vi.fn(),
    },
    getScaleMultiplier: vi.fn(() => 1),
    setScaleContext: vi.fn(),
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('VRTraitSystem — Production', () => {
  // ======== SINGLETON ========

  describe('singleton registry', () => {
    it('exports a vrTraitRegistry instance', () => {
      expect(vrTraitRegistry).toBeDefined();
      expect(vrTraitRegistry).toBeInstanceOf(VRTraitRegistry);
    });

    it('has many pre-registered handlers', () => {
      // The registry auto-registers 100+ handlers in its constructor
      const grabbable = vrTraitRegistry.getHandler('grabbable' as any);
      expect(grabbable).toBeDefined();
      expect(grabbable?.name).toBe('grabbable');
    });

    it('can look up known handlers', () => {
      expect(vrTraitRegistry.getHandler('throwable' as any)).toBeDefined();
      expect(vrTraitRegistry.getHandler('pointable' as any)).toBeDefined();
      expect(vrTraitRegistry.getHandler('hoverable' as any)).toBeDefined();
      expect(vrTraitRegistry.getHandler('scalable' as any)).toBeDefined();
      expect(vrTraitRegistry.getHandler('rotatable' as any)).toBeDefined();
    });

    it('returns undefined for unknown handler', () => {
      expect(vrTraitRegistry.getHandler('nonexistent_trait' as any)).toBeUndefined();
    });
  });

  // ======== CUSTOM REGISTRATION ========

  describe('register / getHandler', () => {
    it('registers a custom handler', () => {
      const reg = new VRTraitRegistry();
      const custom: TraitHandler<any> = {
        name: 'custom_test',
        defaultConfig: { value: 42 },
        onAttach: vi.fn(),
      };

      reg.register(custom);
      expect(reg.getHandler('custom_test' as any)).toBe(custom);
    });
  });

  // ======== ATTACH / DETACH ========

  describe('attachTrait / detachTrait', () => {
    it('attaches trait with merged config', () => {
      const reg = new VRTraitRegistry();
      const onAttach = vi.fn();
      reg.register({
        name: 'test_attach',
        defaultConfig: { a: 1, b: 2 },
        onAttach,
      });

      const node = makeNode();
      const ctx = makeContext();
      reg.attachTrait(node, 'test_attach', { b: 99 }, ctx);

      expect(node.traits.has('test_attach')).toBe(true);
      expect(node.traits.get('test_attach')).toEqual({ a: 1, b: 99 });
      expect(onAttach).toHaveBeenCalledWith(node, { a: 1, b: 99 }, ctx);
    });

    it('creates traits map if missing', () => {
      const reg = new VRTraitRegistry();
      reg.register({ name: 'auto_map', defaultConfig: {} });

      const node = { id: 'bare' } as any;
      reg.attachTrait(node, 'auto_map', {}, makeContext());
      expect(node.traits).toBeDefined();
      expect(node.traits.has('auto_map')).toBe(true);
    });

    it('detaches trait and calls onDetach', () => {
      const reg = new VRTraitRegistry();
      const onDetach = vi.fn();
      reg.register({ name: 'test_detach', defaultConfig: { x: 1 }, onDetach });

      const node = makeNode();
      const ctx = makeContext();
      reg.attachTrait(node, 'test_detach', {}, ctx);
      reg.detachTrait(node, 'test_detach', ctx);

      expect(onDetach).toHaveBeenCalled();
      expect(node.traits.has('test_detach')).toBe(false);
    });

    it('no-op attach for unknown handler', () => {
      const reg = new VRTraitRegistry();
      const node = makeNode();
      reg.attachTrait(node, 'does_not_exist', {}, makeContext());
      expect(node.traits.size).toBe(0);
    });
  });

  // ======== UPDATE ========

  describe('updateTrait', () => {
    it('calls onUpdate with config and delta', () => {
      const reg = new VRTraitRegistry();
      const onUpdate = vi.fn();
      reg.register({ name: 'test_update', defaultConfig: { speed: 5 }, onUpdate });

      const node = makeNode();
      const ctx = makeContext();
      reg.attachTrait(node, 'test_update', {}, ctx);
      reg.updateTrait(node, 'test_update', ctx, 0.016);

      expect(onUpdate).toHaveBeenCalledWith(node, { speed: 5 }, ctx, 0.016);
    });

    it('no-op for missing handler', () => {
      const reg = new VRTraitRegistry();
      reg.updateTrait(makeNode(), 'nope', makeContext(), 0.016);
      // No crash
    });
  });

  // ======== HANDLE EVENT ========

  describe('handleEvent', () => {
    it('routes event to handler.onEvent', () => {
      const reg = new VRTraitRegistry();
      const onEvent = vi.fn();
      reg.register({ name: 'test_event', defaultConfig: {}, onEvent });

      const node = makeNode();
      const ctx = makeContext();
      reg.attachTrait(node, 'test_event', {}, ctx);

      const event = { type: 'click', hand: {} } as any;
      reg.handleEvent(node, 'test_event', ctx, event);

      expect(onEvent).toHaveBeenCalledWith(node, {}, ctx, event);
    });
  });

  // ======== BATCH METHODS ========

  describe('updateAllTraits', () => {
    it('updates all traits on a node', () => {
      const reg = new VRTraitRegistry();
      const u1 = vi.fn();
      const u2 = vi.fn();
      reg.register({ name: 't1', defaultConfig: {}, onUpdate: u1 });
      reg.register({ name: 't2', defaultConfig: {}, onUpdate: u2 });

      const node = makeNode();
      const ctx = makeContext();
      reg.attachTrait(node, 't1', {}, ctx);
      reg.attachTrait(node, 't2', {}, ctx);

      reg.updateAllTraits(node, ctx, 0.016);

      expect(u1).toHaveBeenCalled();
      expect(u2).toHaveBeenCalled();
    });

    it('no-op for node without traits', () => {
      const reg = new VRTraitRegistry();
      reg.updateAllTraits({ id: 'bare' } as any, makeContext(), 0.016);
      // No crash
    });
  });

  describe('handleEventForAllTraits', () => {
    it('dispatches event to all traits', () => {
      const reg = new VRTraitRegistry();
      const e1 = vi.fn();
      const e2 = vi.fn();
      reg.register({ name: 'ev1', defaultConfig: {}, onEvent: e1 });
      reg.register({ name: 'ev2', defaultConfig: {}, onEvent: e2 });

      const node = makeNode();
      const ctx = makeContext();
      reg.attachTrait(node, 'ev1', {}, ctx);
      reg.attachTrait(node, 'ev2', {}, ctx);

      reg.handleEventForAllTraits(node, ctx, { type: 'custom' } as any);

      expect(e1).toHaveBeenCalled();
      expect(e2).toHaveBeenCalled();
    });

    it('triggers haptic bridge on collision without haptic trait', () => {
      const reg = new VRTraitRegistry();
      const node = makeNode();
      const dominant = { id: 'right' };
      const ctx = makeContext({
        vr: { getDominantHand: vi.fn(() => dominant), hands: {} },
      });

      reg.handleEventForAllTraits(node, ctx, { type: 'collision' } as any);

      expect(ctx.haptics.pulse).toHaveBeenCalledWith('right', 0.35, 40);
    });

    it('skips haptic bridge when haptic trait exists', () => {
      const reg = new VRTraitRegistry();
      const node = makeNode();
      node.traits.set('haptic', {});
      const ctx = makeContext({
        vr: { getDominantHand: vi.fn(() => ({ id: 'left' })), hands: {} },
      });

      reg.handleEventForAllTraits(node, ctx, { type: 'collision' } as any);

      expect(ctx.haptics.pulse).not.toHaveBeenCalled();
    });
  });
});
