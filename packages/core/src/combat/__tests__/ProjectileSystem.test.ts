import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProjectileSystem, type ProjectileConfig } from '../ProjectileSystem';

const baseConfig: ProjectileConfig = {
  speed: 10, lifetime: 5, damage: 25,
  homing: false, homingStrength: 0, piercing: 0, gravity: 0,
};

describe('ProjectileSystem', () => {
  let sys: ProjectileSystem;

  beforeEach(() => {
    sys = new ProjectileSystem();
  });

  it('spawn creates a projectile', () => {
    const id = sys.spawn('p1', 0, 0, 0, 1, 0, 0, baseConfig);
    expect(sys.getProjectile(id)).toBeDefined();
    expect(sys.getAliveCount()).toBe(1);
  });

  it('projectile moves each update', () => {
    const id = sys.spawn('p1', 0, 0, 0, 1, 0, 0, baseConfig);
    sys.update(1); // 1 second
    const p = sys.getProjectile(id)!;
    expect(p.x).toBeCloseTo(10, 0); // speed=10 * dt=1
  });

  it('projectile expires after lifetime', () => {
    const id = sys.spawn('p1', 0, 0, 0, 1, 0, 0, baseConfig);
    sys.update(6); // > 5s lifetime
    expect(sys.getProjectile(id)!.alive).toBe(false);
    expect(sys.getAliveCount()).toBe(0);
  });

  it('gravity pulls projectile down', () => {
    const id = sys.spawn('p1', 0, 10, 0, 1, 0, 0, { ...baseConfig, gravity: 10 });
    sys.update(1);
    const p = sys.getProjectile(id)!;
    expect(p.vy).toBeLessThan(0); // Gravity applied
    expect(p.y).toBeLessThan(10);
  });

  it('hits target within radius', () => {
    const cb = vi.fn();
    sys.setImpactCallback(cb);
    sys.spawn('p1', 0, 0, 0, 1, 0, 0, baseConfig);
    sys.update(0.5, [{ id: 'enemy', x: 5, y: 0, z: 0, radius: 2 }]);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][1]).toBe('enemy');
  });

  it('dies on first hit with piercing=0', () => {
    sys.spawn('p1', 0, 0, 0, 1, 0, 0, { ...baseConfig, piercing: 0 });
    sys.update(0.5, [{ id: 'e1', x: 5, y: 0, z: 0, radius: 2 }]);
    expect(sys.getAliveCount()).toBe(0);
  });

  it('piercing allows hitting multiple targets', () => {
    const cb = vi.fn();
    sys.setImpactCallback(cb);
    sys.spawn('p1', 0, 0, 0, 1, 0, 0, { ...baseConfig, piercing: 2 });
    sys.update(0.5, [
      { id: 'e1', x: 3, y: 0, z: 0, radius: 2 },
      { id: 'e2', x: 4, y: 0, z: 0, radius: 2 },
    ]);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(sys.getAliveCount()).toBe(1); // Still alive after 2 hits (piercing=2)
  });

  it('homing adjusts velocity toward nearest target', () => {
    const id = sys.spawn('p1', 0, 0, 0, 1, 0, 0, {
      ...baseConfig, homing: true, homingStrength: 100,
    });
    sys.update(0.1, [{ id: 'e', x: 0, y: 10, z: 0, radius: 1 }]);
    const p = sys.getProjectile(id)!;
    expect(p.vy).toBeGreaterThan(0); // Turned toward target above
  });

  it('cleanup removes dead projectiles', () => {
    const id = sys.spawn('p1', 0, 0, 0, 1, 0, 0, baseConfig);
    sys.update(10); // Expired
    sys.cleanup();
    expect(sys.getProjectile(id)).toBeUndefined();
  });

  it('multiple projectiles tracked independently', () => {
    sys.spawn('p1', 0, 0, 0, 1, 0, 0, baseConfig);
    sys.spawn('p2', 10, 0, 0, -1, 0, 0, baseConfig);
    expect(sys.getAliveCount()).toBe(2);
    sys.update(1);
    expect(sys.getAliveCount()).toBe(2);
  });
});
