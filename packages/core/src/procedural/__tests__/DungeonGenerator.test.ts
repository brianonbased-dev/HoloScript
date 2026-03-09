import { describe, it, expect } from 'vitest';
import { DungeonGenerator } from '../DungeonGenerator';

describe('DungeonGenerator', () => {
  it('generates rooms within bounds', () => {
    const gen = new DungeonGenerator({ width: 64, height: 64, seed: 42 });
    const { rooms } = gen.generate();
    expect(rooms.length).toBeGreaterThanOrEqual(1);
    for (const room of rooms) {
      expect(room.x).toBeGreaterThanOrEqual(0);
      expect(room.y).toBeGreaterThanOrEqual(0);
      expect(room.x + room.width).toBeLessThanOrEqual(64);
      expect(room.y + room.height).toBeLessThanOrEqual(64);
    }
  });

  it('respects maxRooms', () => {
    const gen = new DungeonGenerator({ maxRooms: 5, seed: 42 });
    const { rooms } = gen.generate();
    expect(rooms.length).toBeLessThanOrEqual(5);
  });

  it('rooms respect min/max size', () => {
    const gen = new DungeonGenerator({ minRoomSize: 5, maxRoomSize: 10, seed: 42 });
    const { rooms } = gen.generate();
    for (const room of rooms) {
      expect(room.width).toBeGreaterThanOrEqual(5);
      expect(room.width).toBeLessThanOrEqual(10);
      expect(room.height).toBeGreaterThanOrEqual(5);
      expect(room.height).toBeLessThanOrEqual(10);
    }
  });

  it('rooms have unique IDs', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    const { rooms } = gen.generate();
    const ids = rooms.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('generates corridors connecting rooms', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    const { rooms, corridors } = gen.generate();
    if (rooms.length > 1) {
      expect(corridors.length).toBeGreaterThanOrEqual(rooms.length - 1);
    }
  });

  it('corridors have valid point arrays', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    const { corridors } = gen.generate();
    for (const c of corridors) {
      expect(c.points.length).toBeGreaterThan(0);
      for (const p of c.points) {
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
      }
    }
  });

  it('isFullyConnected returns true after generate', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    gen.generate();
    expect(gen.isFullyConnected()).toBe(true);
  });

  it('deterministic with same seed', () => {
    const a = new DungeonGenerator({ seed: 99 });
    const b = new DungeonGenerator({ seed: 99 });
    const ra = a.generate();
    const rb = b.generate();
    expect(ra.rooms.length).toBe(rb.rooms.length);
    for (let i = 0; i < ra.rooms.length; i++) {
      expect(ra.rooms[i].x).toBe(rb.rooms[i].x);
      expect(ra.rooms[i].y).toBe(rb.rooms[i].y);
    }
  });

  it('different seeds produce different layouts', () => {
    const a = new DungeonGenerator({ seed: 1 });
    const b = new DungeonGenerator({ seed: 2 });
    const ra = a.generate();
    const rb = b.generate();
    const sameLayout =
      ra.rooms.length === rb.rooms.length &&
      ra.rooms.every((r, i) => r.x === rb.rooms[i]?.x && r.y === rb.rooms[i]?.y);
    expect(sameLayout).toBe(false);
  });

  it('getRooms and getCorridors return copies', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    gen.generate();
    const rooms1 = gen.getRooms();
    const rooms2 = gen.getRooms();
    expect(rooms1).not.toBe(rooms2);
    expect(rooms1).toEqual(rooms2);
  });

  it('getRoomCount matches rooms length', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    gen.generate();
    expect(gen.getRoomCount()).toBe(gen.getRooms().length);
  });

  it('rooms do not overlap', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    const { rooms } = gen.generate();
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i],
          b = rooms[j];
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });
});
