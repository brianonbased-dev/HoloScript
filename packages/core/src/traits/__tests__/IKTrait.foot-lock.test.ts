/**
 * IKTrait — foot-lock seam (WIRE-1)
 *
 * Tests the on_foot_contact bridge wired by idea-run-3 (research/2026-04-26_idea-run-3-neural-locomotion.md).
 * NeuralAnimationTrait emits on_foot_contact when a foot transitions in/out of contact;
 * IKTrait stores the lock-state on its instance for the runtime solver to consult.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { iKHandler, IKTrait } from '../IKTrait';
import { createMockContext, createMockNode, getEventCount, getLastEvent } from './traitTestHelpers';

describe('IKTrait — foot-lock seam (WIRE-1)', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = { chain: 'LeftLeg', target: 'FloorTarget' };

  beforeEach(() => {
    node = createMockNode('ik');
    ctx = createMockContext();
    iKHandler.onAttach(node as any, cfg as any, ctx as any);
  });

  it('IKTrait class initializes with both feet unlocked', () => {
    const t = new IKTrait(cfg as any);
    expect(t.getFootLockState()).toEqual({ left: false, right: false });
  });

  it('setFootLock mutates one side at a time', () => {
    const t = new IKTrait(cfg as any);
    t.setFootLock('left', true);
    expect(t.getFootLockState()).toEqual({ left: true, right: false });
    t.setFootLock('right', true);
    expect(t.getFootLockState()).toEqual({ left: true, right: true });
    t.setFootLock('left', false);
    expect(t.getFootLockState()).toEqual({ left: false, right: true });
  });

  it('on_foot_contact event with side=left, state=true locks left foot + emits i_k_foot_lock_changed', () => {
    iKHandler.onEvent(node as any, cfg as any, ctx as any, {
      type: 'on_foot_contact',
      side: 'left',
      state: true,
    });
    const instance = (node as any).__i_k_instance as IKTrait;
    expect(instance.getFootLockState()).toEqual({ left: true, right: false });
    expect(getEventCount(ctx, 'i_k_foot_lock_changed')).toBe(1);
    expect(getLastEvent(ctx, 'i_k_foot_lock_changed')).toMatchObject({
      side: 'left',
      locked: true,
    });
  });

  it('on_foot_contact with side=right, state=false leaves left untouched', () => {
    iKHandler.onEvent(node as any, cfg as any, ctx as any, {
      type: 'on_foot_contact',
      side: 'left',
      state: true,
    });
    iKHandler.onEvent(node as any, cfg as any, ctx as any, {
      type: 'on_foot_contact',
      side: 'right',
      state: false,
    });
    const instance = (node as any).__i_k_instance as IKTrait;
    expect(instance.getFootLockState()).toEqual({ left: true, right: false });
  });

  it('malformed on_foot_contact (missing side) is ignored — no state mutation, no emit', () => {
    iKHandler.onEvent(node as any, cfg as any, ctx as any, {
      type: 'on_foot_contact',
      state: true,
    });
    const instance = (node as any).__i_k_instance as IKTrait;
    expect(instance.getFootLockState()).toEqual({ left: false, right: false });
    expect(getEventCount(ctx, 'i_k_foot_lock_changed')).toBe(0);
  });

  it('on_foot_contact with invalid side is ignored', () => {
    iKHandler.onEvent(node as any, cfg as any, ctx as any, {
      type: 'on_foot_contact',
      side: 'middle',
      state: true,
    });
    const instance = (node as any).__i_k_instance as IKTrait;
    expect(instance.getFootLockState()).toEqual({ left: false, right: false });
    expect(getEventCount(ctx, 'i_k_foot_lock_changed')).toBe(0);
  });
});
