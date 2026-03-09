import { describe, it, expect, beforeEach } from 'vitest';
import { HitboxSystem, type Hitbox, type Hurtbox } from '../HitboxSystem';

function makeHitbox(overrides: Partial<Hitbox> = {}): Hitbox {
  return {
    id: 'hb1',
    ownerId: 'attacker',
    x: 0,
    y: 0,
    z: 0,
    width: 2,
    height: 2,
    depth: 2,
    damage: 10,
    knockbackX: 5,
    knockbackY: 3,
    activeStart: 0,
    activeEnd: 10,
    group: 'atk1',
    ...overrides,
  };
}

function makeHurtbox(overrides: Partial<Hurtbox> = {}): Hurtbox {
  return {
    id: 'hr1',
    entityId: 'defender',
    x: 1,
    y: 1,
    z: 1,
    width: 2,
    height: 2,
    depth: 2,
    ...overrides,
  };
}

describe('HitboxSystem', () => {
  let sys: HitboxSystem;

  beforeEach(() => {
    sys = new HitboxSystem();
  });

  it('detects overlapping hitbox/hurtbox', () => {
    sys.addHitbox(makeHitbox());
    sys.addHurtbox(makeHurtbox());
    const events = sys.update(5);
    expect(events.length).toBe(1);
    expect(events[0].damage).toBe(10);
    expect(events[0].attackerId).toBe('attacker');
    expect(events[0].defenderId).toBe('defender');
  });

  it('no hit outside active frames', () => {
    sys.addHitbox(makeHitbox({ activeStart: 5, activeEnd: 10 }));
    sys.addHurtbox(makeHurtbox());
    expect(sys.update(3).length).toBe(0);
    expect(sys.update(7).length).toBe(1);
  });

  it('no self-hit', () => {
    sys.addHitbox(makeHitbox({ ownerId: 'player' }));
    sys.addHurtbox(makeHurtbox({ entityId: 'player' }));
    expect(sys.update(5).length).toBe(0);
  });

  it('deduplicates hits by group', () => {
    sys.addHitbox(makeHitbox());
    sys.addHurtbox(makeHurtbox());
    sys.update(5); // First hit
    const events = sys.update(6); // Same group → deduped
    expect(events.length).toBe(0);
  });

  it('clearHitLog resets dedup', () => {
    sys.addHitbox(makeHitbox());
    sys.addHurtbox(makeHurtbox());
    sys.update(5);
    sys.clearHitLog();
    expect(sys.update(6).length).toBe(1);
  });

  it('no hit if boxes dont overlap', () => {
    sys.addHitbox(makeHitbox({ x: 100 })); // Far away
    sys.addHurtbox(makeHurtbox());
    expect(sys.update(5).length).toBe(0);
  });

  it('removeHitbox/removeHurtbox', () => {
    sys.addHitbox(makeHitbox());
    sys.addHurtbox(makeHurtbox());
    sys.removeHitbox('hb1');
    expect(sys.update(5).length).toBe(0);
  });

  it('getHitCount tracks unique hits', () => {
    sys.addHitbox(makeHitbox());
    sys.addHurtbox(makeHurtbox());
    sys.update(5);
    expect(sys.getHitCount()).toBe(1);
  });

  it('knockback values propagate', () => {
    sys.addHitbox(makeHitbox({ knockbackX: 12, knockbackY: 8 }));
    sys.addHurtbox(makeHurtbox());
    const events = sys.update(5);
    expect(events[0].knockbackX).toBe(12);
    expect(events[0].knockbackY).toBe(8);
  });

  it('multiple hurtboxes register separate hits', () => {
    sys.addHitbox(makeHitbox());
    sys.addHurtbox(makeHurtbox({ id: 'hr1', entityId: 'def1' }));
    sys.addHurtbox(makeHurtbox({ id: 'hr2', entityId: 'def2' }));
    const events = sys.update(5);
    expect(events.length).toBe(2);
  });
});
