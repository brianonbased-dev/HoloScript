/**
 * Unit tests for primitives — AUDIT-mode coverage
 *
 * Slice 8 pure module. All 10 primitives emit a named event and return
 * a success envelope. These tests verify (a) the correct event name
 * is fired, (b) the correct payload shape, (c) the envelope shape
 * returned to the script.
 *
 * **See**: packages/core/src/runtime/primitives.ts (slice 8)
 */

import { describe, it, expect, vi } from 'vitest';
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
} from './primitives';
import type { HoloScriptValue } from '../types';

describe('commerce primitives', () => {
  it('handleShop — emits "shop" with config, returns success envelope', () => {
    const emit = vi.fn();
    const config = { open: true, tier: 'premium' };
    const result = handleShop([config], emit);
    expect(emit).toHaveBeenCalledWith('shop', config);
    expect(result).toEqual({ success: true, type: 'shop', config });
  });

  it('handleShop — empty args defaults config to {}', () => {
    const emit = vi.fn();
    const result = handleShop([], emit);
    expect(emit).toHaveBeenCalledWith('shop', {});
    expect(result).toEqual({ success: true, type: 'shop', config: {} });
  });

  it('handleInventory — emits with item + action defaulting to "add"', () => {
    const emit = vi.fn();
    const result = handleInventory(['sword'], emit);
    expect(emit).toHaveBeenCalledWith('inventory', { item: 'sword', action: 'add' });
    expect(result).toEqual({ success: true, item: 'sword', action: 'add' });
  });

  it('handleInventory — explicit action overrides default', () => {
    const emit = vi.fn();
    handleInventory(['sword', 'remove'], emit);
    expect(emit).toHaveBeenCalledWith('inventory', { item: 'sword', action: 'remove' });
  });

  it('handlePurchase — emits productId + returns pending status', () => {
    const emit = vi.fn();
    const result = handlePurchase(['sku-42'], emit);
    expect(emit).toHaveBeenCalledWith('purchase', { productId: 'sku-42' });
    expect(result).toEqual({ success: true, productId: 'sku-42', status: 'pending' });
  });
});

describe('social primitives', () => {
  it('handlePresence — returns active:true envelope', () => {
    const emit = vi.fn();
    const cfg = { status: 'online' };
    const result = handlePresence([cfg], emit);
    expect(emit).toHaveBeenCalledWith('presence', cfg);
    expect(result).toEqual({ success: true, active: true });
  });

  it('handleInvite — emits userId', () => {
    const emit = vi.fn();
    const result = handleInvite(['user-7'], emit);
    expect(emit).toHaveBeenCalledWith('invite', { userId: 'user-7' });
    expect(result).toEqual({ success: true, userId: 'user-7' });
  });

  it('handleShare — emits scriptId + targetUserId', () => {
    const emit = vi.fn();
    const result = handleShare(['script-A', 'user-B'], emit);
    expect(emit).toHaveBeenCalledWith('share', { scriptId: 'script-A', targetUserId: 'user-B' });
    expect(result).toEqual({ success: true, scriptId: 'script-A' });
  });

  it('handleShare — target defaults to undefined', () => {
    const emit = vi.fn();
    handleShare(['script-A'], emit);
    expect(emit).toHaveBeenCalledWith('share', { scriptId: 'script-A', targetUserId: undefined });
  });
});

describe('physics primitives', () => {
  it('handlePhysics — enabled defaults true unless config.enabled === false', () => {
    const emit = vi.fn();
    expect(handlePhysics([{}], emit)).toEqual({ success: true, enabled: true });
    expect(handlePhysics([{ enabled: true }], emit)).toEqual({ success: true, enabled: true });
    // Only strictly-false disables
    expect(handlePhysics([{ enabled: false }], emit)).toEqual({ success: true, enabled: false });
    // Other falsy values still count as "enabled"
    expect(handlePhysics([{ enabled: 0 }] as HoloScriptValue[], emit)).toEqual({ success: true, enabled: true });
    expect(handlePhysics([{ enabled: null }] as HoloScriptValue[], emit)).toEqual({ success: true, enabled: true });
  });

  it('handleGravity — default value is 9.81 (earth-surface)', () => {
    const emit = vi.fn();
    const result = handleGravity([], emit);
    expect(emit).toHaveBeenCalledWith('gravity', { value: 9.81 });
    expect(result).toEqual({ success: true, value: 9.81 });
  });

  it('handleGravity — accepts custom value', () => {
    const emit = vi.fn();
    handleGravity([3.71], emit); // mars
    expect(emit).toHaveBeenCalledWith('gravity', { value: 3.71 });
  });

  it('handleGravity — null coalesces to default (?? operator)', () => {
    const emit = vi.fn();
    handleGravity([null as HoloScriptValue], emit);
    expect(emit).toHaveBeenCalledWith('gravity', { value: 9.81 });
  });

  it('handleGravity — 0 is preserved (0 ?? default keeps 0)', () => {
    const emit = vi.fn();
    handleGravity([0], emit);
    expect(emit).toHaveBeenCalledWith('gravity', { value: 0 });
  });

  it('handleCollide — emits target + handler', () => {
    const emit = vi.fn();
    const result = handleCollide(['enemy', 'onDamage'], emit);
    expect(emit).toHaveBeenCalledWith('collide', { target: 'enemy', handler: 'onDamage' });
    expect(result).toEqual({ success: true, target: 'enemy' });
  });
});

describe('animation primitive', () => {
  it('handleAnimate — emits options, returns success envelope', () => {
    const emit = vi.fn();
    const options = { target: 'obj', property: 'y', duration: 500 };
    const result = handleAnimate([options], emit);
    expect(emit).toHaveBeenCalledWith('animate', options);
    expect(result).toEqual({ success: true, options });
  });

  it('handleAnimate — empty args defaults options to {}', () => {
    const emit = vi.fn();
    handleAnimate([], emit);
    expect(emit).toHaveBeenCalledWith('animate', {});
  });
});

describe('primitives — emit is fire-and-forget (not awaited)', () => {
  it('synchronous return — even if emit is async, the primitive does not block', () => {
    // Primitives declare emit as void, but callers may pass async functions
    // (fire-and-forget). Verify the primitive returns synchronously.
    let emitCalled = false;
    const asyncEmit = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 100));
      emitCalled = true;
    });
    const result = handleShop([{}], asyncEmit);
    // Primitive returned synchronously — emit hasn't completed yet
    expect(emitCalled).toBe(false);
    expect(result).toEqual({ success: true, type: 'shop', config: {} });
  });
});
