import { describe, it, expect, beforeEach } from 'vitest';
import { HitboxSystem, type Hitbox, type Hurtbox } from '../combat/HitboxSystem';

// =============================================================================
// C308 — HitboxSystem
// =============================================================================

function hitbox(overrides: Partial<Hitbox> = {}): Hitbox {
  return {
    id: 'hb1',
    ownerId: 'attacker',
    x: 0,
    y: 0,
    z: 0,
    width: 2,
    height: 2,
    depth: 2,
    damage: 50,
    knockbackX: 10,
    knockbackY: 5,
    activeStart: 0,
    activeEnd: 10,
    group: 'attack1',
    ...overrides,
  };
}

function hurtbox(overrides: Partial<Hurtbox> = {}): Hurtbox {
  return {
    id: 'hr1',
    entityId: 'defender',
    x: 1,
    y: 0,
    z: 0,
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

  it('registers hit on overlap during active frames', () => {
    sys.addHitbox(hitbox());
    sys.addHurtbox(hurtbox());
    const events = sys.update(5);
    expect(events.length).toBe(1);
    expect(events[0].damage).toBe(50);
    expect(events[0].attackerId).toBe('attacker');
    expect(events[0].defenderId).toBe('defender');
  });

  it('no hit outside active frame window', () => {
    sys.addHitbox(hitbox({ activeStart: 5, activeEnd: 8 }));
    sys.addHurtbox(hurtbox());
    expect(sys.update(3).length).toBe(0);
    expect(sys.update(6).length).toBe(1);
  });

  it('no hit when bounding boxes do not overlap', () => {
    sys.addHitbox(hitbox({ x: 100 }));
    sys.addHurtbox(hurtbox({ x: 0 }));
    expect(sys.update(5).length).toBe(0);
  });

  it('self-hit is prevented', () => {
    sys.addHitbox(hitbox({ ownerId: 'player' }));
    sys.addHurtbox(hurtbox({ entityId: 'player' }));
    expect(sys.update(5).length).toBe(0);
  });

  it('dedup prevents same group hitting same entity twice', () => {
    sys.addHitbox(hitbox());
    sys.addHurtbox(hurtbox());
    sys.update(5);
    const events2 = sys.update(6);
    expect(events2.length).toBe(0);
  });

  it('clearHitLog allows re-hitting', () => {
    sys.addHitbox(hitbox());
    sys.addHurtbox(hurtbox());
    sys.update(5);
    sys.clearHitLog();
    const events = sys.update(6);
    expect(events.length).toBe(1);
  });

  it('knockback values are passed through', () => {
    sys.addHitbox(hitbox({ knockbackX: 15, knockbackY: 8 }));
    sys.addHurtbox(hurtbox());
    const events = sys.update(5);
    expect(events[0].knockbackX).toBe(15);
    expect(events[0].knockbackY).toBe(8);
  });

  it('multiple hitboxes vs multiple hurtboxes', () => {
    sys.addHitbox(hitbox({ id: 'hb1', ownerId: 'p1', group: 'g1' }));
    sys.addHitbox(hitbox({ id: 'hb2', ownerId: 'p2', group: 'g2' }));
    sys.addHurtbox(hurtbox({ id: 'hr1', entityId: 'p2' }));
    sys.addHurtbox(hurtbox({ id: 'hr2', entityId: 'p1' }));
    const events = sys.update(5);
    expect(events.length).toBe(2); // p1 hits p2, p2 hits p1
  });

  it('removeHitbox stops future hits', () => {
    sys.addHitbox(hitbox());
    sys.addHurtbox(hurtbox());
    sys.removeHitbox('hb1');
    expect(sys.update(5).length).toBe(0);
  });

  it('getHitCount tracks unique hits', () => {
    sys.addHitbox(hitbox());
    sys.addHurtbox(hurtbox());
    sys.update(5);
    expect(sys.getHitCount()).toBe(1);
  });
});
