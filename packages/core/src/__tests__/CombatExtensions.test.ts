import { describe, it, expect } from 'vitest';
import { ProjectileSystem } from '@holoscript/engine/combat';
import { ComboTracker } from '@holoscript/engine/combat';
import { HitboxSystem } from '@holoscript/engine/combat';

describe('Cycle 161: Combat Extensions', () => {
  // -------------------------------------------------------------------------
  // ProjectileSystem
  // -------------------------------------------------------------------------

  it('should spawn and move projectiles', () => {
    const sys = new ProjectileSystem();
    const id = sys.spawn('p1', 0, 0, 0, 1, 0, 0, {
      speed: 10,
      lifetime: 2,
      damage: 5,
      homing: false,
      homingStrength: 0,
      piercing: 0,
      gravity: 0,
    });

    sys.update(1);
    const proj = sys.getProjectile(id)!;
    expect(proj.x).toBeCloseTo(10); // speed * dt
  });

  it('should expire projectiles after lifetime', () => {
    const sys = new ProjectileSystem();
    sys.spawn('p1', 0, 0, 0, 1, 0, 0, {
      speed: 5,
      lifetime: 0.5,
      damage: 1,
      homing: false,
      homingStrength: 0,
      piercing: 0,
      gravity: 0,
    });

    sys.update(1); // age = 1 > lifetime 0.5
    expect(sys.getAliveCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // ComboTracker
  // -------------------------------------------------------------------------

  it('should detect completed combos', () => {
    const tracker = new ComboTracker();
    tracker.registerCombo({
      id: 'hadouken',
      name: 'Hadouken',
      steps: [
        { input: 'down', maxDelay: 300 },
        { input: 'forward', maxDelay: 300 },
        { input: 'punch', maxDelay: 300 },
      ],
      reward: 'fireball',
    });

    tracker.pushInput('down', 0);
    tracker.pushInput('forward', 100);
    const result = tracker.pushInput('punch', 200);
    expect(result).toBe('fireball');
  });

  it('should timeout combos that are too slow', () => {
    const tracker = new ComboTracker();
    tracker.registerCombo({
      id: 'quick',
      name: 'Quick',
      steps: [
        { input: 'a', maxDelay: 100 },
        { input: 'b', maxDelay: 100 },
      ],
      reward: 'quick_attack',
    });

    tracker.pushInput('a', 0);
    tracker.pushInput('b', 500); // Too late — 500 > 100
    expect(tracker.getCompletedCombos()).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // HitboxSystem
  // -------------------------------------------------------------------------

  it('should detect hitbox/hurtbox overlap and prevent self-hits', () => {
    const sys = new HitboxSystem();

    sys.addHitbox({
      id: 'hb1',
      ownerId: 'attacker',
      x: 5,
      y: 0,
      z: 0,
      width: 4,
      height: 4,
      depth: 4,
      damage: 10,
      knockbackX: 5,
      knockbackY: 2,
      activeStart: 0,
      activeEnd: 10,
      group: 'slash',
    });

    sys.addHurtbox({
      id: 'hr_self',
      entityId: 'attacker',
      x: 5,
      y: 0,
      z: 0,
      width: 2,
      height: 2,
      depth: 2,
    });
    sys.addHurtbox({
      id: 'hr_enemy',
      entityId: 'enemy',
      x: 6,
      y: 1,
      z: 1,
      width: 2,
      height: 2,
      depth: 2,
    });

    const events = sys.update(5);
    expect(events.length).toBe(1); // Only enemy hit
    expect(events[0].defenderId).toBe('enemy');
    expect(events[0].damage).toBe(10);
  });

  it('should deduplicate hits within same group', () => {
    const sys = new HitboxSystem();

    sys.addHitbox({
      id: 'hb1',
      ownerId: 'a',
      x: 0,
      y: 0,
      z: 0,
      width: 10,
      height: 10,
      depth: 10,
      damage: 5,
      knockbackX: 0,
      knockbackY: 0,
      activeStart: 0,
      activeEnd: 100,
      group: 'attack1',
    });

    sys.addHurtbox({ id: 'hr1', entityId: 'b', x: 1, y: 1, z: 1, width: 2, height: 2, depth: 2 });

    sys.update(1); // First hit registered
    const events = sys.update(2); // Same group → deduped
    expect(events.length).toBe(0);
    expect(sys.getHitCount()).toBe(1);
  });
});
