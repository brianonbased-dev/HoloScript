import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectileSystem, ProjectileConfig } from '@holoscript/engine/combat';

function config(overrides: Partial<ProjectileConfig> = {}): ProjectileConfig {
  return {
    speed: 20,
    lifetime: 5,
    damage: 10,
    homing: false,
    homingStrength: 0,
    piercing: 0,
    gravity: 0,
    ...overrides,
  };
}

describe('ProjectileSystem', () => {
  let ps: ProjectileSystem;

  beforeEach(() => {
    ps = new ProjectileSystem();
  });

  it('spawn creates a projectile', () => {
    const id = ps.spawn('owner', 0, 0, 0, 1, 0, 0, config());
    expect(ps.getProjectile(id)).toBeDefined();
    expect(ps.getAliveCount()).toBe(1);
  });

  it('projectile moves along direction on update', () => {
    const id = ps.spawn('owner', 0, 0, 0, 1, 0, 0, config());
    ps.update(1);
    expect(ps.getProjectile(id)!.x).toBeCloseTo(20); // speed=20, dt=1
  });

  it('projectile dies after lifetime', () => {
    ps.spawn('owner', 0, 0, 0, 1, 0, 0, config({ lifetime: 1 }));
    ps.update(1.1);
    expect(ps.getAliveCount()).toBe(0);
  });

  it('gravity applies downward acceleration', () => {
    const id = ps.spawn('owner', 0, 10, 0, 1, 0, 0, config({ gravity: 10 }));
    ps.update(1);
    const p = ps.getProjectile(id)!;
    expect(p.vy).toBeLessThan(0);
  });

  it('hit detection triggers impact callback', () => {
    const hits: string[] = [];
    ps.setImpactCallback((proj, targetId) => hits.push(targetId));
    ps.spawn('owner', 0, 0, 0, 1, 0, 0, config());
    const targets = [{ id: 'enemy', x: 10, y: 0, z: 0, radius: 100 }];
    ps.update(0.5, targets);
    expect(hits).toContain('enemy');
  });

  it('non-piercing projectile dies after first hit', () => {
    ps.spawn('owner', 0, 0, 0, 1, 0, 0, config({ piercing: 0 }));
    const targets = [{ id: 'e1', x: 5, y: 0, z: 0, radius: 100 }];
    ps.update(0.25, targets);
    expect(ps.getAliveCount()).toBe(0);
  });

  it('piercing projectile survives until exceeding pierce count', () => {
    ps.spawn('owner', 0, 0, 0, 1, 0, 0, config({ piercing: 2 }));
    const targets = [
      { id: 'e1', x: 1, y: 0, z: 0, radius: 100 },
      { id: 'e2', x: 1, y: 0, z: 0, radius: 100 },
    ];
    ps.update(0.1, targets);
    // hitCount=2, piercing=2 → hitCount <= piercing, still alive after 2 hits
    expect(ps.getAliveCount()).toBe(1);
  });

  it('homing turns toward nearest target', () => {
    const id = ps.spawn('owner', 0, 0, 0, 1, 0, 0, config({ homing: true, homingStrength: 50 }));
    const targets = [{ id: 'e1', x: 0, y: 10, z: 0, radius: 1 }];
    ps.update(0.1, targets);
    expect(ps.getProjectile(id)!.vy).toBeGreaterThan(0);
  });

  it('cleanup removes dead projectiles', () => {
    ps.spawn('owner', 0, 0, 0, 1, 0, 0, config({ lifetime: 0.1 }));
    ps.update(0.2);
    ps.cleanup();
    expect(ps.getProjectile('proj_0')).toBeUndefined();
  });

  it('direction is normalized to config speed', () => {
    const id = ps.spawn('owner', 0, 0, 0, 3, 4, 0, config({ speed: 10 }));
    const p = ps.getProjectile(id)!;
    const spd = Math.sqrt(p.vx ** 2 + p.vy ** 2 + p.vz ** 2);
    expect(spd).toBeCloseTo(10);
  });
});
