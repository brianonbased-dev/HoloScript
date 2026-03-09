/**
 * TriggerTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { TriggerTrait, createTriggerTrait } from '../TriggerTrait';

describe('TriggerTrait constructor defaults', () => {
  const t = new TriggerTrait();
  it('shape=box', () => expect(t.getConfig().shape).toBe('box'));
  it('size={1,1,1}', () => expect(t.getConfig().size).toEqual({ x: 1, y: 1, z: 1 }));
  it('radius=0.5', () => expect(t.getConfig().radius).toBe(0.5));
  it('height=1', () => expect(t.getConfig().height).toBe(1));
  it('center={0,0,0}', () => expect(t.getConfig().center).toEqual({ x: 0, y: 0, z: 0 }));
  it('layer=0', () => expect(t.getConfig().layer).toBe(0));
  it('layerMask=-1', () => expect(t.getConfig().layerMask).toBe(-1));
  it('filterTags=[]', () => expect(t.getConfig().filterTags).toEqual([]));
  it('filterMode=include', () => expect(t.getConfig().filterMode).toBe('include'));
  it('cooldown=0', () => expect(t.getConfig().cooldown).toBe(0));
  it('enabled=true', () => expect(t.isEnabled()).toBe(true));
  it('createTriggerTrait factory', () => expect(createTriggerTrait()).toBeInstanceOf(TriggerTrait));
});

describe('TriggerTrait shape/size setters', () => {
  it('setShape sphere+radius', () => {
    const t = new TriggerTrait();
    t.setShape('sphere', { radius: 2.5 });
    expect(t.getConfig().shape).toBe('sphere');
    expect(t.getConfig().radius).toBe(2.5);
  });
  it('setSize', () => {
    const t = new TriggerTrait();
    t.setSize({ x: 10, y: 5, z: 2 });
    expect(t.getConfig().size).toEqual({ x: 10, y: 5, z: 2 });
  });
  it('setRadius clamps negative to 0', () => {
    const t = new TriggerTrait();
    t.setRadius(-5);
    expect(t.getConfig().radius).toBe(0);
  });
  it('setCenter', () => {
    const t = new TriggerTrait();
    t.setCenter({ x: 1, y: 2, z: 3 });
    expect(t.getConfig().center).toEqual({ x: 1, y: 2, z: 3 });
  });
  it('setLayerMask', () => {
    const t = new TriggerTrait();
    t.setLayerMask(7);
    expect(t.getConfig().layerMask).toBe(7);
  });
  it('setCooldown clamps to 0', () => {
    const t = new TriggerTrait();
    t.setCooldown(-100);
    expect(t.getConfig().cooldown).toBe(0);
  });
  it('setCooldown positive value', () => {
    const t = new TriggerTrait();
    t.setCooldown(500);
    expect(t.getConfig().cooldown).toBe(500);
  });
});

describe('TriggerTrait.setFilterTags', () => {
  it('include mode default', () => {
    const t = new TriggerTrait();
    t.setFilterTags(['player']);
    expect(t.getConfig().filterMode).toBe('include');
  });
  it('exclude mode', () => {
    const t = new TriggerTrait();
    t.setFilterTags(['boss'], 'exclude');
    expect(t.getConfig().filterMode).toBe('exclude');
  });
});

describe('TriggerTrait actions', () => {
  it('addEnterAction', () => {
    const t = new TriggerTrait();
    t.addEnterAction({ type: 'emit', event: 'damage' });
    expect(t.getConfig().onEnter).toHaveLength(1);
  });
  it('addStayAction', () => {
    const t = new TriggerTrait();
    t.addStayAction({ type: 'call' });
    expect(t.getConfig().onStay).toHaveLength(1);
  });
  it('addExitAction', () => {
    const t = new TriggerTrait();
    t.addExitAction({ type: 'set', property: 'active', value: false });
    expect(t.getConfig().onExit).toHaveLength(1);
  });
  it('clearActions(enter)', () => {
    const t = new TriggerTrait({ onEnter: [{ type: 'emit' }] });
    t.clearActions('enter');
    expect(t.getConfig().onEnter).toHaveLength(0);
  });
  it('clearActions(stay)', () => {
    const t = new TriggerTrait({ onStay: [{ type: 'emit' }, { type: 'call' }] });
    t.clearActions('stay');
    expect(t.getConfig().onStay).toHaveLength(0);
  });
  it('clearActions(exit)', () => {
    const t = new TriggerTrait({ onExit: [{ type: 'emit' }] });
    t.clearActions('exit');
    expect(t.getConfig().onExit).toHaveLength(0);
  });
});

describe('TriggerTrait.handleEnter', () => {
  it('returns TriggerEvent', () => {
    const ev = new TriggerTrait().handleEnter('obj1');
    expect(ev?.type).toBe('enter');
    expect(ev?.other).toBe('obj1');
  });
  it('adds to occupants', () => {
    const t = new TriggerTrait();
    t.handleEnter('obj1');
    expect(t.contains('obj1')).toBe(true);
  });
  it('returns null when disabled', () => {
    expect(new TriggerTrait({ enabled: false }).handleEnter('x')).toBeNull();
  });
  it('returns null when maxOccupants reached', () => {
    const t = new TriggerTrait({ maxOccupants: 1 });
    t.handleEnter('a');
    expect(t.handleEnter('b')).toBeNull();
  });
  it('include filter rejects unmatched tag', () => {
    const t = new TriggerTrait({ filterTags: ['player'], filterMode: 'include' });
    expect(t.handleEnter('e', ['enemy'])).toBeNull();
  });
  it('include filter passes matched tag', () => {
    const t = new TriggerTrait({ filterTags: ['player'], filterMode: 'include' });
    expect(t.handleEnter('p', ['player'])).not.toBeNull();
  });
  it('exclude filter rejects matched tag', () => {
    const t = new TriggerTrait({ filterTags: ['boss'], filterMode: 'exclude' });
    expect(t.handleEnter('b', ['boss'])).toBeNull();
  });
  it('exclude filter passes unmatched tag', () => {
    const t = new TriggerTrait({ filterTags: ['boss'], filterMode: 'exclude' });
    expect(t.handleEnter('m', ['minion'])).not.toBeNull();
  });
  it('cooldown blocks rapid re-entry', () => {
    const t = new TriggerTrait({ cooldown: 60000 });
    t.handleEnter('x');
    t.handleExit('x');
    expect(t.handleEnter('x')).toBeNull();
  });
  it('fires enter listener', () => {
    const t = new TriggerTrait();
    const cb = vi.fn();
    t.on('enter', cb);
    t.handleEnter('x');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'enter', other: 'x' }));
  });
  it('otherTags forwarded', () => {
    const t = new TriggerTrait();
    const ev = t.handleEnter('x', ['vip'])!;
    expect(ev.otherTags).toContain('vip');
  });
  it('no filters: any object passes', () => {
    expect(new TriggerTrait().handleEnter('anything')).not.toBeNull();
  });
});

describe('TriggerTrait.handleStay', () => {
  it('returns null for non-occupant', () => {
    expect(new TriggerTrait().handleStay('ghost')).toBeNull();
  });
  it('returns stay event for occupant', () => {
    const t = new TriggerTrait();
    t.handleEnter('x');
    expect(t.handleStay('x')?.type).toBe('stay');
  });
  it('stayDuration >= 0', () => {
    const t = new TriggerTrait();
    t.handleEnter('x');
    expect(t.handleStay('x')!.stayDuration).toBeGreaterThanOrEqual(0);
  });
  it('fires stay listener', () => {
    const t = new TriggerTrait();
    const cb = vi.fn();
    t.on('stay', cb);
    t.handleEnter('x');
    t.handleStay('x');
    expect(cb).toHaveBeenCalled();
  });
});

describe('TriggerTrait.handleExit', () => {
  it('returns null for non-occupant', () => {
    expect(new TriggerTrait().handleExit('ghost')).toBeNull();
  });
  it('removes from occupants', () => {
    const t = new TriggerTrait();
    t.handleEnter('x');
    t.handleExit('x');
    expect(t.contains('x')).toBe(false);
  });
  it('returns exit event', () => {
    const t = new TriggerTrait();
    t.handleEnter('x');
    expect(t.handleExit('x')?.type).toBe('exit');
  });
  it('fires exit listener', () => {
    const t = new TriggerTrait();
    const cb = vi.fn();
    t.on('exit', cb);
    t.handleEnter('x');
    t.handleExit('x');
    expect(cb).toHaveBeenCalled();
  });
});

describe('TriggerTrait query', () => {
  it('getOccupants returns all IDs', () => {
    const t = new TriggerTrait();
    t.handleEnter('a');
    t.handleEnter('b');
    expect(t.getOccupants()).toEqual(expect.arrayContaining(['a', 'b']));
  });
  it('getStayDuration null for unknown', () => {
    expect(new TriggerTrait().getStayDuration('ghost')).toBeNull();
  });
  it('getStayDuration >= 0 for occupant', () => {
    const t = new TriggerTrait();
    t.handleEnter('x');
    expect(t.getStayDuration('x')).toBeGreaterThanOrEqual(0);
  });
  it('getState returns occupantCount + occupants', () => {
    const t = new TriggerTrait();
    t.handleEnter('a');
    const s = t.getState();
    expect(s.occupantCount).toBe(1);
    expect(s.occupants).toContain('a');
  });
});

describe('TriggerTrait.setEnabled', () => {
  it('isEnabled false', () => {
    const t = new TriggerTrait();
    t.setEnabled(false);
    expect(t.isEnabled()).toBe(false);
  });
  it('handleEnter returns null when disabled', () => {
    const t = new TriggerTrait();
    t.setEnabled(false);
    expect(t.handleEnter('x')).toBeNull();
  });
  it('handleStay returns null when disabled', () => {
    const t = new TriggerTrait();
    t.handleEnter('x');
    // Force-disable without iterating (so x stays as occupant)
    (t as any).enabled = false;
    expect(t.handleStay('x')).toBeNull();
  });
  it('handleExit returns null when disabled (source guard, occupants unchanged)', () => {
    // setEnabled(false) → enabled=false → iterate occupants calling handleExit
    // handleExit guard: if (!this.enabled) return null → no removal, no events
    const t = new TriggerTrait();
    t.handleEnter('a');
    (t as any).enabled = false;
    const result = t.handleExit('a');
    expect(result).toBeNull();
    expect(t.getOccupantCount()).toBe(1); // occupant NOT removed by guard
  });
  it('re-enable works', () => {
    const t = new TriggerTrait();
    t.setEnabled(false);
    t.setEnabled(true);
    expect(t.isEnabled()).toBe(true);
    expect(t.handleEnter('x')).not.toBeNull();
  });
});

describe('TriggerTrait.on/off', () => {
  it('off removes listener', () => {
    const t = new TriggerTrait();
    const cb = vi.fn();
    t.on('enter', cb);
    t.off('enter', cb);
    t.handleEnter('x');
    expect(cb).not.toHaveBeenCalled();
  });
  it('multiple listeners fire', () => {
    const t = new TriggerTrait();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    t.on('enter', cb1);
    t.on('enter', cb2);
    t.handleEnter('x');
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });
});

describe('TriggerTrait.reset', () => {
  it('clears occupants', () => {
    const t = new TriggerTrait();
    t.handleEnter('a');
    t.reset();
    expect(t.getOccupantCount()).toBe(0);
  });
  it('no exit listeners fired on reset', () => {
    const t = new TriggerTrait();
    const cb = vi.fn();
    t.on('exit', cb);
    t.handleEnter('a');
    cb.mockClear();
    t.reset();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('TriggerTrait.serialize', () => {
  it('returns shape/radius/occupantCount/enabled', () => {
    const t = new TriggerTrait({ shape: 'sphere', radius: 2 });
    t.handleEnter('x');
    const s = t.serialize();
    expect(s.shape).toBe('sphere');
    expect(s.radius).toBe(2);
    expect(s.occupantCount).toBe(1);
    expect(s.enabled).toBe(true);
  });
});
