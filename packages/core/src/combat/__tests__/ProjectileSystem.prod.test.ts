/**
 * ProjectileSystem — Production Test Suite
 *
 * Covers: spawning, movement, lifetime expiry, gravity, homing,
 * piercing, impact callback, cleanup, queries.
 */
import { describe, it, expect, vi } from 'vitest';
import { ProjectileSystem, type ProjectileConfig } from '../ProjectileSystem';

const BASIC: ProjectileConfig = {
  speed: 10,
  lifetime: 5,
  damage: 25,
  homing: false,
  homingStrength: 0,
  piercing: 0,
  gravity: 0,
};

describe('ProjectileSystem — Production', () => {
  // ─── Spawning ─────────────────────────────────────────────────────
  it('spawn creates a live projectile', () => {
    const ps = new ProjectileSystem();
    const id = ps.spawn('player', 0, 0, 0, 1, 0, 0, BASIC);
    expect(ps.getProjectile(id)!.alive).toBe(true);
    expect(ps.getAliveCount()).toBe(1);
  });

  // ─── Movement ─────────────────────────────────────────────────────
  it('projectile moves in direction', () => {
    const ps = new ProjectileSystem();
    const id = ps.spawn('player', 0, 0, 0, 1, 0, 0, BASIC);
    ps.update(1);
    expect(ps.getProjectile(id)!.x).toBeCloseTo(10);
  });

  // ─── Lifetime Expiry ──────────────────────────────────────────────
  it('projectile dies after lifetime', () => {
    const ps = new ProjectileSystem();
    const id = ps.spawn('player', 0, 0, 0, 1, 0, 0, BASIC);
    ps.update(6); // past 5s lifetime
    expect(ps.getProjectile(id)!.alive).toBe(false);
  });

  // ─── Gravity ──────────────────────────────────────────────────────
  it('gravity pulls projectile down', () => {
    const ps = new ProjectileSystem();
    const cfg = { ...BASIC, gravity: 10 };
    const id = ps.spawn('player', 0, 0, 0, 1, 0, 0, cfg);
    ps.update(1);
    // vy = 0 - 10*1 = -10, y = 0 + (-10)*1 = -10
    expect(ps.getProjectile(id)!.y).toBeLessThan(0);
  });

  // ─── Impact Detection ─────────────────────────────────────────────
  it('impact callback fires on hit', () => {
    const ps = new ProjectileSystem();
    const cb = vi.fn();
    ps.setImpactCallback(cb);
    ps.spawn('player', 0, 0, 0, 1, 0, 0, BASIC);
    const targets = [{ id: 'enemy', x: 5, y: 0, z: 0, radius: 10 }];
    ps.update(0.5, targets);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('projectile dies on first hit with piercing 0', () => {
    const ps = new ProjectileSystem();
    const id = ps.spawn('player', 0, 0, 0, 1, 0, 0, BASIC);
    const targets = [{ id: 'e1', x: 5, y: 0, z: 0, radius: 10 }];
    ps.update(0.5, targets);
    expect(ps.getProjectile(id)!.alive).toBe(false);
  });

  // ─── Piercing ─────────────────────────────────────────────────────
  it('piercing projectile survives hits up to pierce count', () => {
    const ps = new ProjectileSystem();
    const cfg = { ...BASIC, piercing: 2 };
    const id = ps.spawn('player', 0, 0, 0, 1, 0, 0, cfg);
    // hits one target, hitCount becomes 1 which is <= 2 → alive
    const targets = [{ id: 'e1', x: 5, y: 0, z: 0, radius: 10 }];
    ps.update(0.5, targets);
    expect(ps.getProjectile(id)!.alive).toBe(true);
  });

  // ─── Homing ───────────────────────────────────────────────────────
  it('homing projectile steers toward target', () => {
    const ps = new ProjectileSystem();
    const cfg = { ...BASIC, homing: true, homingStrength: 100 };
    const id = ps.spawn('player', 0, 0, 0, 1, 0, 0, cfg);
    const targets = [{ id: 'e', x: 0, y: 10, z: 0, radius: 1 }];
    ps.update(0.1, targets);
    // vy should be influenced toward target (positive)
    expect(ps.getProjectile(id)!.vy).toBeGreaterThan(0);
  });

  // ─── Cleanup ──────────────────────────────────────────────────────
  it('cleanup removes dead projectiles', () => {
    const ps = new ProjectileSystem();
    const id = ps.spawn('player', 0, 0, 0, 1, 0, 0, BASIC);
    ps.update(6); // dies
    ps.cleanup();
    expect(ps.getProjectile(id)).toBeUndefined();
    expect(ps.getAliveCount()).toBe(0);
  });

  // ─── Multiple Projectiles ─────────────────────────────────────────
  it('tracks multiple projectiles independently', () => {
    const ps = new ProjectileSystem();
    ps.spawn('a', 0, 0, 0, 1, 0, 0, BASIC);
    ps.spawn('b', 0, 0, 0, 0, 1, 0, BASIC);
    expect(ps.getAliveCount()).toBe(2);
    ps.update(1);
    expect(ps.getAliveCount()).toBe(2);
  });
});
