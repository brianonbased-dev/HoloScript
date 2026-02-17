import { describe, it, expect } from 'vitest';
import { DungeonGenerator } from '../DungeonGenerator';

describe('DungeonGenerator', () => {
  it('generate produces rooms and corridors', () => {
    const gen = new DungeonGenerator({ seed: 42, maxRooms: 10 });
    const result = gen.generate();
    expect(result.rooms.length).toBeGreaterThan(0);
    expect(result.corridors.length).toBeGreaterThan(0);
  });

  it('rooms have valid dimensions', () => {
    const gen = new DungeonGenerator({ seed: 42, minRoomSize: 4, maxRoomSize: 12 });
    gen.generate();
    for (const room of gen.getRooms()) {
      expect(room.width).toBeGreaterThanOrEqual(4);
      expect(room.width).toBeLessThanOrEqual(12);
      expect(room.height).toBeGreaterThanOrEqual(4);
      expect(room.height).toBeLessThanOrEqual(12);
    }
  });

  it('rooms do not overlap', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    gen.generate();
    const rooms = gen.getRooms();
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        const overlapX = a.x < b.x + b.width + 1 && a.x + a.width + 1 > b.x;
        const overlapY = a.y < b.y + b.height + 1 && a.y + a.height + 1 > b.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('isFullyConnected returns true after generation', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    gen.generate();
    expect(gen.isFullyConnected()).toBe(true);
  });

  it('getRoomCount matches rooms array', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    gen.generate();
    expect(gen.getRoomCount()).toBe(gen.getRooms().length);
  });

  it('corridors connect existing rooms', () => {
    const gen = new DungeonGenerator({ seed: 42 });
    gen.generate();
    const roomIds = new Set(gen.getRooms().map(r => r.id));
    for (const corridor of gen.getCorridors()) {
      expect(roomIds.has(corridor.from)).toBe(true);
      expect(roomIds.has(corridor.to)).toBe(true);
      expect(corridor.points.length).toBeGreaterThan(0);
    }
  });

  it('maxRooms is respected', () => {
    const gen = new DungeonGenerator({ seed: 42, maxRooms: 5 });
    gen.generate();
    expect(gen.getRoomCount()).toBeLessThanOrEqual(5);
  });

  it('deterministic with same seed', () => {
    const g1 = new DungeonGenerator({ seed: 100 });
    const g2 = new DungeonGenerator({ seed: 100 });
    const r1 = g1.generate();
    const r2 = g2.generate();
    expect(r1.rooms.length).toBe(r2.rooms.length);
    expect(r1.corridors.length).toBe(r2.corridors.length);
  });

  it('different seed produces different layout', () => {
    const g1 = new DungeonGenerator({ seed: 1 });
    const g2 = new DungeonGenerator({ seed: 9999 });
    const r1 = g1.generate();
    const r2 = g2.generate();
    // very likely different room count or positions
    const same = r1.rooms.length === r2.rooms.length &&
      r1.rooms.every((r, i) => r.x === r2.rooms[i].x && r.y === r2.rooms[i].y);
    expect(same).toBe(false);
  });
});
