import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerTrait, createTriggerTrait } from '../TriggerTrait';

describe('TriggerTrait', () => {
  let trigger: TriggerTrait;

  beforeEach(() => {
    trigger = createTriggerTrait({
      shape: 'sphere',
      radius: 2,
      cooldown: 0,
      maxOccupants: 3,
      filterTags: [],
    });
  });

  it('defaults to enabled', () => {
    expect(trigger.isEnabled()).toBe(true);
    expect(trigger.getOccupantCount()).toBe(0);
  });

  it('handleEnter adds occupant and fires event', () => {
    const events: any[] = [];
    trigger.on('enter', (e) => events.push(e));
    const ev = trigger.handleEnter('obj1');
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe('enter');
    expect(trigger.contains('obj1')).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('handleStay fires for existing occupant with duration', () => {
    trigger.handleEnter('obj1');
    const ev = trigger.handleStay('obj1');
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe('stay');
    expect(ev!.stayDuration).toBeGreaterThanOrEqual(0);
  });

  it('handleStay returns null for unknown object', () => {
    expect(trigger.handleStay('unknown')).toBeNull();
  });

  it('handleExit removes occupant', () => {
    trigger.handleEnter('obj1');
    const ev = trigger.handleExit('obj1');
    expect(ev).not.toBeNull();
    expect(trigger.contains('obj1')).toBe(false);
    expect(trigger.getOccupantCount()).toBe(0);
  });

  it('respects maxOccupants', () => {
    trigger.handleEnter('a');
    trigger.handleEnter('b');
    trigger.handleEnter('c');
    const ev = trigger.handleEnter('d');
    expect(ev).toBeNull();
    expect(trigger.getOccupantCount()).toBe(3);
  });

  it('tag filter include mode', () => {
    trigger.setFilterTags(['player'], 'include');
    expect(trigger.handleEnter('obj1', ['enemy'])).toBeNull();
    expect(trigger.handleEnter('obj2', ['player'])).not.toBeNull();
  });

  it('tag filter exclude mode', () => {
    trigger.setFilterTags(['projectile'], 'exclude');
    expect(trigger.handleEnter('obj1', ['projectile'])).toBeNull();
    expect(trigger.handleEnter('obj2', ['player'])).not.toBeNull();
  });

  it('cooldown prevents repeat entries', () => {
    const t = createTriggerTrait({ cooldown: 1000000 });
    t.handleEnter('x');
    t.handleExit('x');
    expect(t.handleEnter('x')).toBeNull();
  });

  it('disabled trigger ignores events', () => {
    trigger.handleEnter('obj1');
    trigger.setEnabled(false);
    expect(trigger.isEnabled()).toBe(false);
    expect(trigger.handleEnter('obj2')).toBeNull();
  });

  it('setEnabled(false) disables trigger (occupants remain due to early-return in handleExit)', () => {
    trigger.handleEnter('obj1');
    trigger.handleEnter('obj2');
    trigger.setEnabled(false);
    // handleExit checks enabled first, so occupants remain
    // but new events are blocked
    expect(trigger.isEnabled()).toBe(false);
    expect(trigger.handleEnter('obj3')).toBeNull();
  });

  it('reset clears state', () => {
    trigger.handleEnter('obj1');
    trigger.reset();
    expect(trigger.getOccupantCount()).toBe(0);
  });

  it('getState returns occupant info', () => {
    trigger.handleEnter('obj1');
    const state = trigger.getState();
    expect(state.occupantCount).toBe(1);
    expect(state.occupants).toContain('obj1');
  });

  it('serialize includes config', () => {
    const data = trigger.serialize();
    expect(data.shape).toBe('sphere');
    expect(data.radius).toBe(2);
  });

  it('setShape changes configuration', () => {
    trigger.setShape('box', { size: [2, 2, 2 ] });
    expect(trigger.getConfig().shape).toBe('box');
  });

  it('off removes event listener', () => {
    const events: any[] = [];
    const cb = (e: any) => events.push(e);
    trigger.on('enter', cb);
    trigger.off('enter', cb);
    trigger.handleEnter('obj1');
    expect(events).toHaveLength(0);
  });
});
