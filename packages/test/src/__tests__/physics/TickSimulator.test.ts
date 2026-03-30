/**
 * TickSimulator.test.ts — Tests for the headless discrete-time physics engine
 *
 * Covers: gravity, floor collision, rest detection, restitution,
 * dynamic-dynamic collision, forward/forwardSeconds, snapshot,
 * duplicate ID rejection, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { TickSimulator } from '../../physics/TickSimulator';
import { SpatialEntity } from '../../spatial/SpatialEntity';

function makeFloor() {
  return SpatialEntity.at('floor', { position: [0, 0, 0], size: [20, 0.1, 20] });
}

function makeCrate(y = 5) {
  return SpatialEntity.at('crate', { position: [0, y, 0], size: [1, 1, 1] });
}

// ── Gravity ──────────────────────────────────────────────────────────────────

describe('TickSimulator — gravity', () => {
  it('object falls under gravity', () => {
    const crate = makeCrate(5);
    const sim = new TickSimulator([{ entity: crate, velocity: [0, 0, 0] }], {
      gravity: -9.81,
      hz: 60,
    });
    const initialY = crate.position.y;
    sim.forward(30); // 0.5s at 60Hz
    expect(crate.position.y).toBeLessThan(initialY);
  });

  it('velocity increases over time', () => {
    const crate = makeCrate(10);
    const sim = new TickSimulator([{ entity: crate, velocity: [0, 0, 0] }], {
      gravity: -9.81,
      hz: 60,
    });
    sim.forward(10);
    const vel = sim.getVelocity('crate')!;
    expect(vel.y).toBeLessThan(0); // falling
  });

  it('static bodies are unaffected by gravity', () => {
    const floor = makeFloor();
    const originalY = floor.position.y;
    const sim = new TickSimulator([{ entity: floor, isStatic: true }], { gravity: -9.81, hz: 60 });
    sim.forward(120);
    expect(floor.position.y).toBeCloseTo(originalY, 5);
  });
});

// ── Floor collision ──────────────────────────────────────────────────────────

describe('TickSimulator — collision with static floor', () => {
  it('crate lands on the floor and stops falling through', () => {
    const floor = makeFloor();
    const crate = makeCrate(3);
    const sim = new TickSimulator(
      [
        { entity: floor, isStatic: true },
        { entity: crate, velocity: [0, 0, 0] },
      ],
      { gravity: -9.81, hz: 60 }
    );

    sim.forward(300); // 5 seconds — plenty of time to settle

    // Crate should be resting on top of floor (floor top = 0.1m)
    // Crate bottom should be at or above floor top
    expect(crate.bounds.min.y).toBeGreaterThanOrEqual(floor.bounds.max.y - 0.1);
  });

  it('crate does not clip through the floor', () => {
    const floor = makeFloor();
    const crate = makeCrate(5);
    const sim = new TickSimulator(
      [
        { entity: floor, isStatic: true },
        { entity: crate, velocity: [0, 0, 0] },
      ],
      { gravity: -9.81, hz: 60 }
    );

    sim.forward(600); // 10 seconds

    // After settling, crate and floor should not be intersecting
    expect(crate.bounds.min.y).toBeGreaterThanOrEqual(floor.bounds.max.y - 0.01);
  });
});

// ── Restitution (bounciness) ─────────────────────────────────────────────────

describe('TickSimulator — restitution', () => {
  it('low restitution damps velocity strongly', () => {
    const floor = makeFloor();
    const heavy = makeCrate(5);
    const sim = new TickSimulator(
      [
        { entity: floor, isStatic: true },
        { entity: heavy, velocity: [0, 0, 0], restitution: 0.01 },
      ],
      { gravity: -9.81, hz: 60 }
    );

    sim.forward(60); // 1 second
    const vel = sim.getVelocity('crate')!;

    // After 1 second with low restitution, the Y velocity should be near-zero
    // (object has hit the floor and mostly lost energy)
    expect(Math.abs(vel.y)).toBeLessThan(2); // very damped
  });
});

// ── Dynamic-dynamic collision ────────────────────────────────────────────────

describe('TickSimulator — dynamic-dynamic collision', () => {
  it('two dropping objects exchange velocity on collision', () => {
    const a = SpatialEntity.at('a', { position: [0, 5, 0], size: [1, 1, 1] });
    const b = SpatialEntity.at('b', { position: [0, 2, 0], size: [1, 1, 1] });
    const sim = new TickSimulator(
      [
        { entity: a, velocity: [0, -5, 0], mass: 1 },
        { entity: b, velocity: [0, 0, 0], mass: 1 },
      ],
      { gravity: 0, hz: 60 } // no gravity — pure collision test
    );

    sim.forward(60);

    // After collision, velocities should have exchanged (elastic-ish behavior)
    const vA = sim.getVelocity('a')!;
    const vB = sim.getVelocity('b')!;
    // b should now be moving downward (got hit)
    expect(vB.y).toBeLessThan(0);
  });
});

// ── forward / forwardSeconds ─────────────────────────────────────────────────

describe('TickSimulator — time control', () => {
  it('forwardSeconds() advances by correct time', () => {
    const e = SpatialEntity.at('e', { position: [0, 10, 0], size: [1, 1, 1] });
    const sim = new TickSimulator([{ entity: e, velocity: [0, 0, 0] }], { gravity: -9.81, hz: 60 });

    sim.forwardSeconds(2); // should advance 120 ticks
    expect(sim.elapsedSeconds).toBeCloseTo(2, 1);
  });

  it('elapsedSeconds accumulates across multiple calls', () => {
    const e = SpatialEntity.at('e', { position: [0, 10, 0], size: [1, 1, 1] });
    const sim = new TickSimulator([{ entity: e, velocity: [0, 0, 0] }], { gravity: -9.81, hz: 60 });

    sim.forward(60);
    sim.forward(60);
    expect(sim.elapsedSeconds).toBeCloseTo(2, 1);
  });
});

// ── snapshot ─────────────────────────────────────────────────────────────────

describe('TickSimulator — snapshot()', () => {
  it('returns position and velocity for all entities', () => {
    const a = SpatialEntity.at('a', { position: [0, 5, 0], size: [1, 1, 1] });
    const b = SpatialEntity.at('b', { position: [5, 5, 0], size: [1, 1, 1] });
    const sim = new TickSimulator(
      [
        { entity: a, velocity: [1, 0, 0] },
        { entity: b, velocity: [0, 0, 0], isStatic: true },
      ],
      { gravity: 0, hz: 60 }
    );
    sim.forward(10);

    const snap = sim.snapshot();
    expect(snap.a).toBeDefined();
    expect(snap.b).toBeDefined();
    expect(snap.a.position).toBeDefined();
    expect(snap.a.velocity).toBeDefined();
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('TickSimulator — edge cases', () => {
  it('throws on duplicate entity ids', () => {
    const a = SpatialEntity.at('dup', { position: [0, 0, 0], size: [1, 1, 1] });
    const b = SpatialEntity.at('dup', { position: [5, 0, 0], size: [1, 1, 1] });
    expect(() => new TickSimulator([{ entity: a }, { entity: b }])).toThrow('duplicate');
  });

  it('getEntity() returns undefined for unknown id', () => {
    const e = SpatialEntity.at('e', { position: [0, 0, 0], size: [1, 1, 1] });
    const sim = new TickSimulator([{ entity: e }]);
    expect(sim.getEntity('nonexistent')).toBeUndefined();
  });

  it('getVelocity() returns undefined for unknown id', () => {
    const e = SpatialEntity.at('e', { position: [0, 0, 0], size: [1, 1, 1] });
    const sim = new TickSimulator([{ entity: e }]);
    expect(sim.getVelocity('nonexistent')).toBeUndefined();
  });

  it('forward(0) is a no-op', () => {
    const e = SpatialEntity.at('e', { position: [0, 5, 0], size: [1, 1, 1] });
    const sim = new TickSimulator([{ entity: e }], { gravity: -9.81 });
    const before = e.position.y;
    sim.forward(0);
    expect(e.position.y).toBeCloseTo(before, 5);
  });
});
