/**
 * gravity.test.ts
 *
 * Demonstrates how to use TickSimulator + spatial matchers from @holoscript/test
 * to verify physics behaviour without a running runtime.
 *
 * Run:  pnpm --filter @holoscript/test test -- gravity
 */

import { describe, beforeAll, it, expect } from 'vitest';
import { TickSimulator } from '../src/physics';
import { SpatialEntity, BoundingBox, setupSpatialMatchers } from '../src/spatial';

beforeAll(() => {
  setupSpatialMatchers();
});

describe('gravity simulation', () => {
  const floor = SpatialEntity.at('main_floor', { position: [0, 0, 0], size: [10, 0.5, 10] });
  const crate = SpatialEntity.at('nft_crate', { position: [0, 5, 0], size: [1, 1, 1] });

  const sim = new TickSimulator(
    [
      { entity: floor, isStatic: true },
      { entity: crate, velocity: [0, 0, 0] },
    ],
    { gravity: -9.81, hz: 60 }
  );

  it('crate starts above floor', () => {
    expect(crate).not.toIntersect(floor);
  });

  it('crate lands on floor after 2 seconds', () => {
    sim.forward(120); // 120 ticks × (1/60)s = 2.0 s
    const landed = sim.getEntity('nft_crate');
    expect(landed).toBeDefined();
    // The crate rests ON the floor — its bottom Y should be at or above the floor top Y
    const floorTopY = sim.getEntity('main_floor')!.bounds.max.y;
    expect(landed!.bounds.min.y).toBeGreaterThanOrEqual(floorTopY - 0.01); // max 1cm penetration
  });

  it('crate stays in reasonable horizontal bounds', () => {
    const bounds = BoundingBox.fromMinMax({ x: -2, y: 0, z: -2 }, { x: 2, y: 8, z: 2 });
    const landed = sim.getEntity('nft_crate')!;
    expect(landed).toBeWithinVolume(bounds);
  });

  it('snapshot includes velocity', () => {
    const snap = sim.snapshot(); // Record<string, { position: Vec3; velocity: Vec3 }>
    const crateSnap = snap['nft_crate'];
    expect(crateSnap).toBeDefined();
    expect(typeof crateSnap.velocity.y).toBe('number');
  });
});
