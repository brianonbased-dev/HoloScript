import { describe, it, expect, beforeEach } from 'vitest';
import { CombatManager, HitBox, HurtBox } from '../../combat/CombatManager';
import { DamageSystem } from '../../combat/DamageSystem';

describe('Combat Metrics & Systems', () => {
  let combatManager: CombatManager;
  let damageSystem: DamageSystem;

  beforeEach(() => {
    combatManager = new CombatManager();
    damageSystem = new DamageSystem();
  });

  describe('Hit Detection & Collision', () => {
    it('accurately resolves AABB collisions between active HitBoxes and HurtBoxes', () => {
      // 1. Setup Hitbox
      const hitbox: HitBox = {
        id: 'hb-1',
        ownerId: 'player_1',
        position: [0, 0, 0],
        size: { x: 2, y: 2, z: 2 },
        active: true,
        damage: 50,
        damageType: 'physical',
        knockback: 10,
      };

      // 2. Setup Hurtboxes
      const hitTarget: HurtBox = {
        id: 'hr-1',
        ownerId: 'enemy_1',
        position: [1, 1, 0],
        size: { x: 2, y: 2, z: 2 }, // Intersects
        active: true,
      };

      const missTarget: HurtBox = {
        id: 'hr-2',
        ownerId: 'enemy_2',
        position: [10, 10, 10],
        size: { x: 1, y: 1, z: 1 }, // No intersection
        active: true,
      };

      combatManager.addHitBox(hitbox);
      combatManager.addHurtBox(hitTarget);
      combatManager.addHurtBox(missTarget);

      // 3. Resolve
      const hits = combatManager.checkCollisions();

      expect(hits.length).toBe(1);
      expect(hits[0].hitbox.id).toBe('hb-1');
      expect(hits[0].hurtbox.id).toBe('hr-1');
    });

    it('rejects self-harm and inactive boxes', () => {
      const hitbox: HitBox = {
        id: 'hb-self',
        ownerId: 'player_1',
        position: [0, 0, 0],
        size: { x: 2, y: 2, z: 2 },
        active: true,
        damage: 10,
        damageType: 'fire',
        knockback: 0,
      };
      const hurtbox: HurtBox = {
        id: 'hr-self',
        ownerId: 'player_1',
        position: [0, 0, 0],
        size: { x: 2, y: 2, z: 2 },
        active: true,
      };

      combatManager.addHitBox(hitbox);
      combatManager.addHurtBox(hurtbox);

      expect(combatManager.checkCollisions().length).toBe(0); // Ignore self

      const hrEnemy: HurtBox = {
        id: 'hr-enemy',
        ownerId: 'enemy_1',
        position: [0, 0, 0],
        size: { x: 2, y: 2, z: 2 },
        active: false, // Inactive
      };
      combatManager.addHurtBox(hrEnemy);
      expect(combatManager.checkCollisions().length).toBe(0);
    });
  });

  describe('Damage Calculations & Dropoff', () => {
    it('applies armor penetration and global multipliers', () => {
      damageSystem.setConfig({ globalMultiplier: 1.5, armorPenetration: 0.5, critChance: 0 });
      damageSystem.setResistances('boss_1', { fire: 0.8 }); // 80% fire resistance

      // Base damage: 100
      // Effective Resistance: 0.8 * (1 - 0.5) = 0.4
      // Post-Resist Damage: 100 * (1 - 0.4) = 60
      // Post-Multiplier Damage: 60 * 1.5 = 90

      const instance = damageSystem.calculateDamage('player_1', 'boss_1', 100, 'fire');
      expect(instance.finalDamage).toBe(90);
    });

    it('bypasses calculation for true damage', () => {
      damageSystem.setConfig({ globalMultiplier: 1.0, critChance: 0 });
      damageSystem.setResistances('boss_2', { physical: 0.99, true: 0 } as any);

      const instance = damageSystem.calculateDamage('invader', 'boss_2', 500, 'true');
      expect(instance.finalDamage).toBe(500); // 100% bypass
    });
  });

  describe('Range Targeting & Dropoff Distances', () => {
    it('prioritizes targets by distance and priority tags', () => {
      const origin = { x: 0, y: 0, z: 0 };
      const candidates = [
        { entityId: 'far_enemy', position: [10, 0, 0], priority: 1 },
        { entityId: 'near_enemy', position: [5, 0, 0], priority: 1 },
        { entityId: 'priority_enemy', position: [8, 0, 0], priority: 10 },
      ];

      const targets = combatManager.findTargets(origin, candidates, 20);

      expect(targets.length).toBe(3);
      // Highest priority first, then closest distance
      expect(targets[0].entityId).toBe('priority_enemy');
      expect(targets[1].entityId).toBe('near_enemy');
      expect(targets[2].entityId).toBe('far_enemy');
    });
  });
});
