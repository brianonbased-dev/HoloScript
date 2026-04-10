/**
 * DungeonGenerator — Production Test Suite
 *
 * Covers: generation, rooms, corridors, connectivity,
 * seed determinism, config, queries.
 */
import { describe, it, expect } from 'vitest';
import { DungeonGenerator } from '../DungeonGenerator';

describe('DungeonGenerator — Production', () => {
  // ─── Generation ───────────────────────────────────────────────────
  it('generates rooms and corridors', () => {
    const dg = new DungeonGenerator({ seed: 42 });
    const { rooms, corridors } = dg.generate();
    expect(rooms.length).toBeGreaterThan(0);
    expect(corridors.length).toBeGreaterThan(0);
  });

  it('rooms stay within bounds', () => {
    const dg = new DungeonGenerator({ width: 32, height: 32, seed: 42 });
    const { rooms } = dg.generate();
    for (const room of rooms) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.y).toBeGreaterThanOrEqual(0);
      expect(room.x + room.width).toBeLessThanOrEqual(32);
      expect(room.y + room.height).toBeLessThanOrEqual(32);
    }
  });

  it('rooms do not overlap', () => {
    const dg = new DungeonGenerator({ seed: 42 });
    const { rooms } = dg.generate();
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i],
          b = rooms[j];
        const overlap =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  // ─── Connectivity ─────────────────────────────────────────────────
  it('all rooms are connected', () => {
    const dg = new DungeonGenerator({ seed: 42 });
    dg.generate();
    expect(dg.isFullyConnected()).toBe(true);
  });

  it('corridors link consecutive rooms', () => {
    const dg = new DungeonGenerator({ seed: 42 });
    const { corridors } = dg.generate();
    for (const c of corridors) {
      expect(c.points.length).toBeGreaterThan(0);
      expect(typeof c.from).toBe('number');
      expect(typeof c.to).toBe('number');
    }
  });

  // ─── Config ───────────────────────────────────────────────────────
  it('respects maxRooms limit', () => {
    const dg = new DungeonGenerator({ maxRooms: 3, seed: 42 });
    const { rooms } = dg.generate();
    expect(rooms.length).toBeLessThanOrEqual(3);
  });

  it('room sizes respect min/max', () => {
    const dg = new DungeonGenerator({ minRoomSize: 5, maxRoomSize: 8, seed: 42 });
    const { rooms } = dg.generate();
    for (const room of rooms) {
      expect(room.width).toBeGreaterThanOrEqual(5);
      expect(room.width).toBeLessThanOrEqual(8);
      expect(room.height).toBeGreaterThanOrEqual(5);
      expect(room.height).toBeLessThanOrEqual(8);
    }
  });

  // ─── Determinism ──────────────────────────────────────────────────
  it('same seed produces same dungeon', () => {
    const gen = (seed: number) => {
      const dg = new DungeonGenerator({ seed });
      return JSON.stringify(dg.generate());
    };
    expect(gen(42)).toBe(gen(42));
  });

  it('different seeds produce different dungeons', () => {
    const gen = (seed: number) => {
      const dg = new DungeonGenerator({ seed });
      return JSON.stringify(dg.generate());
    };
    expect(gen(42)).not.toBe(gen(99));
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getRoomCount matches generated rooms', () => {
    const dg = new DungeonGenerator({ seed: 42 });
    const { rooms } = dg.generate();
    expect(dg.getRoomCount()).toBe(rooms.length);
  });
});
