import { describe, expect, it, vi } from 'vitest';
import {
  handleShop,
  handleInventory,
  handlePurchase,
  handlePresence,
  handleInvite,
  handleShare,
  handlePhysics,
  handleGravity,
  handleCollide,
  handleAnimate,
} from '../primitives';

describe('primitives', () => {
  describe('handleShop', () => {
    it('emits shop event with config', () => {
      const emit = vi.fn();
      const config = { items: ['sword'] };
      handleShop([config], emit);
      expect(emit).toHaveBeenCalledWith('shop', config);
    });

    it('returns success envelope', () => {
      const emit = vi.fn();
      const result = handleShop([{ type: 'weapon' }], emit);
      expect(result).toMatchObject({ success: true, type: 'shop' });
    });

    it('uses empty object if no args', () => {
      const emit = vi.fn();
      handleShop([], emit);
      expect(emit).toHaveBeenCalledWith('shop', {});
    });
  });

  describe('handleInventory', () => {
    it('emits inventory event with item and action', () => {
      const emit = vi.fn();
      handleInventory(['sword', 'remove'], emit);
      expect(emit).toHaveBeenCalledWith('inventory', { item: 'sword', action: 'remove' });
    });

    it('defaults action to add', () => {
      const emit = vi.fn();
      const result = handleInventory(['potion'], emit);
      expect(emit).toHaveBeenCalledWith('inventory', { item: 'potion', action: 'add' });
      expect(result).toMatchObject({ action: 'add' });
    });
  });

  describe('handlePurchase', () => {
    it('emits purchase event with productId', () => {
      const emit = vi.fn();
      handlePurchase(['item-42'], emit);
      expect(emit).toHaveBeenCalledWith('purchase', { productId: 'item-42' });
    });

    it('returns pending status', () => {
      const emit = vi.fn();
      const result = handlePurchase(['x'], emit);
      expect(result).toMatchObject({ success: true, status: 'pending', productId: 'x' });
    });
  });

  describe('handlePresence', () => {
    it('emits presence event with config', () => {
      const emit = vi.fn();
      const config = { visible: true };
      handlePresence([config], emit);
      expect(emit).toHaveBeenCalledWith('presence', config);
    });

    it('returns active: true', () => {
      const emit = vi.fn();
      const result = handlePresence([], emit);
      expect(result).toMatchObject({ success: true, active: true });
    });
  });

  describe('handleInvite', () => {
    it('emits invite event with userId', () => {
      const emit = vi.fn();
      handleInvite(['user-99'], emit);
      expect(emit).toHaveBeenCalledWith('invite', { userId: 'user-99' });
    });

    it('returns userId in result', () => {
      const emit = vi.fn();
      const result = handleInvite(['alice'], emit);
      expect(result).toMatchObject({ success: true, userId: 'alice' });
    });
  });

  describe('handleShare', () => {
    it('emits share event with scriptId and targetUserId', () => {
      const emit = vi.fn();
      handleShare(['script-1', 'bob'], emit);
      expect(emit).toHaveBeenCalledWith('share', { scriptId: 'script-1', targetUserId: 'bob' });
    });

    it('returns scriptId in result', () => {
      const emit = vi.fn();
      const result = handleShare(['s-1', 'user-2'], emit);
      expect(result).toMatchObject({ success: true, scriptId: 's-1' });
    });
  });

  describe('handlePhysics', () => {
    it('emits physics event with config', () => {
      const emit = vi.fn();
      const config = { enabled: true, mass: 5 };
      handlePhysics([config], emit);
      expect(emit).toHaveBeenCalledWith('physics', config);
    });

    it('enabled is true when not explicitly false', () => {
      const emit = vi.fn();
      const result = handlePhysics([{ mass: 1 }], emit);
      expect(result).toMatchObject({ success: true, enabled: true });
    });

    it('enabled is false when explicitly false', () => {
      const emit = vi.fn();
      const result = handlePhysics([{ enabled: false }], emit);
      expect(result).toMatchObject({ enabled: false });
    });

    it('handles no args', () => {
      const emit = vi.fn();
      handlePhysics([], emit);
      expect(emit).toHaveBeenCalledWith('physics', {});
    });
  });

  describe('handleGravity', () => {
    it('emits gravity event with provided value', () => {
      const emit = vi.fn();
      handleGravity([1.62], emit);
      expect(emit).toHaveBeenCalledWith('gravity', { value: 1.62 });
    });

    it('defaults to 9.81 when no arg provided', () => {
      const emit = vi.fn();
      const result = handleGravity([], emit);
      expect(emit).toHaveBeenCalledWith('gravity', { value: 9.81 });
      expect(result).toMatchObject({ value: 9.81 });
    });
  });

  describe('handleCollide', () => {
    it('emits collide event with target and handler', () => {
      const emit = vi.fn();
      handleCollide(['wall', 'onHit'], emit);
      expect(emit).toHaveBeenCalledWith('collide', { target: 'wall', handler: 'onHit' });
    });

    it('returns target in result', () => {
      const emit = vi.fn();
      const result = handleCollide(['floor', 'bounce'], emit);
      expect(result).toMatchObject({ success: true, target: 'floor' });
    });
  });

  describe('handleAnimate', () => {
    it('emits animate event with options', () => {
      const emit = vi.fn();
      const options = { duration: 500, easing: 'linear' };
      handleAnimate([options], emit);
      expect(emit).toHaveBeenCalledWith('animate', options);
    });

    it('uses empty options if no args', () => {
      const emit = vi.fn();
      handleAnimate([], emit);
      expect(emit).toHaveBeenCalledWith('animate', {});
    });

    it('returns success with options', () => {
      const emit = vi.fn();
      const opts = { loop: true };
      const result = handleAnimate([opts], emit);
      expect(result).toMatchObject({ success: true, options: opts });
    });
  });
});
