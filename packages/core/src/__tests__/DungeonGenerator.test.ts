import { describe, it, expect } from 'vitest';
import { DungeonGenerator } from '@holoscript/engine/procedural/DungeonGenerator';

// =============================================================================
// C225 — Dungeon Generator
// =============================================================================

describe('DungeonGenerator', () => {
  it('constructor uses defaults', () => {
    const dg = new DungeonGenerator();
    expect(dg.getRoomCount()).toBe(0); // before generate
  });

  it('generate creates rooms', () => {
    const dg = new DungeonGenerator({ maxRooms: 5, seed: 42 });
    const result = dg.generate();
    expect(result.rooms.length).toBeGreaterThan(0);
    expect(result.rooms.length).toBeLessThanOrEqual(5);
  });

  it('rooms have valid dimensions', () => {
    const dg = new DungeonGenerator({ minRoomSize: 4, maxRoomSize: 8, seed: 42 });
    const { rooms } = dg.generate();
    for (const r of rooms) {
      expect(r.width).toBeGreaterThanOrEqual(4);
      expect(r.width).toBeLessThanOrEqual(8);
      expect(r.height).toBeGreaterThanOrEqual(4);
      expect(r.height).toBeLessThanOrEqual(8);
    }
  });

  it('rooms have unique IDs', () => {
    const dg = new DungeonGenerator({ seed: 42 });
    const { rooms } = dg.generate();
    const ids = rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rooms stay within bounds', () => {
    const w = 64,
      h = 64;
    const dg = new DungeonGenerator({ width: w, height: h, seed: 42 });
    const { rooms } = dg.generate();
    for (const r of rooms) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(w);
      expect(r.y + r.height).toBeLessThanOrEqual(h);
    }
  });

  it('corridors connect rooms', () => {
    const dg = new DungeonGenerator({ maxRooms: 5, seed: 42 });
    const { rooms, corridors } = dg.generate();
    if (rooms.length > 1) {
      expect(corridors.length).toBeGreaterThanOrEqual(rooms.length - 1);
    }
  });

  it('corridors have points', () => {
    const dg = new DungeonGenerator({ maxRooms: 5, seed: 42 });
    const { corridors } = dg.generate();
    for (const c of corridors) {
      expect(c.points.length).toBeGreaterThan(0);
    }
  });

  it('isFullyConnected returns true for generated dungeon', () => {
    const dg = new DungeonGenerator({ maxRooms: 8, seed: 42 });
    dg.generate();
    expect(dg.isFullyConnected()).toBe(true);
  });

  it('getRooms returns copy', () => {
    const dg = new DungeonGenerator({ seed: 42 });
    dg.generate();
    const r1 = dg.getRooms();
    const r2 = dg.getRooms();
    expect(r1).not.toBe(r2); // Different references
  });

  it('getCorridors returns copy', () => {
    const dg = new DungeonGenerator({ seed: 42 });
    dg.generate();
    const c1 = dg.getCorridors();
    const c2 = dg.getCorridors();
    expect(c1).not.toBe(c2);
  });

  it('same seed produces same layout', () => {
    const d1 = new DungeonGenerator({ seed: 99 });
    const d2 = new DungeonGenerator({ seed: 99 });
    const r1 = d1.generate();
    const r2 = d2.generate();
    expect(r1.rooms.length).toBe(r2.rooms.length);
    for (let i = 0; i < r1.rooms.length; i++) {
      expect(r1.rooms[i].x).toBe(r2.rooms[i].x);
      expect(r1.rooms[i].y).toBe(r2.rooms[i].y);
    }
  });

  it('different seeds produce different layouts', () => {
    const d1 = new DungeonGenerator({ seed: 1 });
    const d2 = new DungeonGenerator({ seed: 999 });
    const r1 = d1.generate();
    const r2 = d2.generate();
    // Very unlikely to be identical
    const same =
      r1.rooms.length === r2.rooms.length &&
      r1.rooms.every((r, i) => r.x === r2.rooms[i].x && r.y === r2.rooms[i].y);
    expect(same).toBe(false);
  });

  it('generate can be called multiple times (resets state)', () => {
    const dg = new DungeonGenerator({ seed: 42, maxRooms: 5 });
    const first = dg.generate();
    const second = dg.generate();
    // Both should produce rooms
    expect(first.rooms.length).toBeGreaterThan(0);
    expect(second.rooms.length).toBeGreaterThan(0);
  });
});
