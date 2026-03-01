/**
 * DungeonGenerator — BSP rooms, corridors, door placement, connectivity
 *
 * @version 1.0.0
 */

export interface Room {
  id: number;
  x: number; y: number;
  width: number; height: number;
  connected: number[];
}

export interface Corridor {
  from: number; to: number;
  points: { x: number; y: number }[];
}

export interface DungeonConfig {
  width: number;
  height: number;
  minRoomSize: number;
  maxRoomSize: number;
  maxRooms: number;
  corridorWidth: number;
  seed: number;
}

export class DungeonGenerator {
  private config: DungeonConfig;
  private rooms: Room[] = [];
  private corridors: Corridor[] = [];
  private nextRoomId: number = 0;
  private rng: () => number;

  constructor(config?: Partial<DungeonConfig>) {
    this.config = {
      width: config?.width ?? 64,
      height: config?.height ?? 64,
      minRoomSize: config?.minRoomSize ?? 4,
      maxRoomSize: config?.maxRoomSize ?? 12,
      maxRooms: config?.maxRooms ?? 15,
      corridorWidth: config?.corridorWidth ?? 1,
      seed: config?.seed ?? 42,
    };
    // Seeded PRNG
    let s = this.config.seed;
    this.rng = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  /**
   * Generate a full dungeon
   */
  generate(): { rooms: Room[]; corridors: Corridor[] } {
    this.rooms = [];
    this.corridors = [];
    this.nextRoomId = 0;

    // Place rooms
    for (let i = 0; i < this.config.maxRooms * 3; i++) {
      if (this.rooms.length >= this.config.maxRooms) break;

      const w = this.randInt(this.config.minRoomSize, this.config.maxRoomSize);
      const h = this.randInt(this.config.minRoomSize, this.config.maxRoomSize);
      const x = this.randInt(1, this.config.width - w - 1);
      const y = this.randInt(1, this.config.height - h - 1);

      if (!this.overlaps(x, y, w, h)) {
        this.rooms.push({ id: this.nextRoomId++, x, y, width: w, height: h, connected: [] });
      }
    }

    // Connect rooms with corridors
    for (let i = 1; i < this.rooms.length; i++) {
      this.connectRooms(this.rooms[i - 1], this.rooms[i]);
    }

    return { rooms: [...this.rooms], corridors: [...this.corridors] };
  }

  private overlaps(x: number, y: number, w: number, h: number): boolean {
    for (const room of this.rooms) {
      if (x < room.x + room.width + 1 && x + w + 1 > room.x &&
          y < room.y + room.height + 1 && y + h + 1 > room.y) return true;
    }
    return false;
  }

  private connectRooms(a: Room, b: Room): void {
    const ax = Math.floor(a.x + a.width / 2);
    const ay = Math.floor(a.y + a.height / 2);
    const bx = Math.floor(b.x + b.width / 2);
    const by = Math.floor(b.y + b.height / 2);

    const points: { x: number; y: number }[] = [];

    // L-shaped corridor
    if (this.rng() > 0.5) {
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) points.push({ x, y: ay });
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) points.push({ x: bx, y });
    } else {
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) points.push({ x: ax, y });
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) points.push({ x, y: by });
    }

    a.connected.push(b.id);
    b.connected.push(a.id);
    this.corridors.push({ from: a.id, to: b.id, points });
  }

  private randInt(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  /**
   * Check if all rooms are connected
   */
  isFullyConnected(): boolean {
    if (this.rooms.length === 0) return true;
    const visited = new Set<number>();
    const queue = [this.rooms[0].id];
    visited.add(this.rooms[0].id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const room = this.rooms.find(r => r.id === current)!;
      for (const neighbor of room.connected) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return visited.size === this.rooms.length;
  }

  getRooms(): Room[] { return [...this.rooms]; }
  getCorridors(): Corridor[] { return [...this.corridors]; }
  getRoomCount(): number { return this.rooms.length; }
}
