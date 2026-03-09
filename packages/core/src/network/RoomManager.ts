/**
 * RoomManager.ts
 *
 * Manages multiplayer rooms/sessions for HoloScript+ VR.
 * Handles room creation, joining, leaving, and player tracking.
 */

export interface RoomConfig {
  name: string;
  maxPlayers: number;
  isPublic: boolean;
  password?: string;
}

export interface Room {
  id: string;
  config: RoomConfig;
  hostId: string;
  players: Set<string>;
  createdAt: number;
  metadata: Record<string, any>;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRoom: Map<string, string> = new Map(); // playerId -> roomId
  private nextRoomId: number = 1;

  /**
   * Create a new room.
   */
  createRoom(hostId: string, config: RoomConfig): string {
    const id = `room_${this.nextRoomId++}`;
    const room: Room = {
      id,
      config,
      hostId,
      players: new Set([hostId]),
      createdAt: Date.now(),
      metadata: {},
    };
    this.rooms.set(id, room);
    this.playerRoom.set(hostId, id);
    return id;
  }

  /**
   * Join an existing room.
   */
  joinRoom(playerId: string, roomId: string, password?: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.players.size >= room.config.maxPlayers) return false;
    if (room.config.password && room.config.password !== password) return false;

    room.players.add(playerId);
    this.playerRoom.set(playerId, roomId);
    return true;
  }

  /**
   * Leave a room.
   */
  leaveRoom(playerId: string): void {
    const roomId = this.playerRoom.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.players.delete(playerId);
      // Clean up empty rooms
      if (room.players.size === 0) {
        this.rooms.delete(roomId);
      } else if (room.hostId === playerId) {
        // Transfer host
        room.hostId = Array.from(room.players)[0];
      }
    }
    this.playerRoom.delete(playerId);
  }

  /**
   * Get room by ID.
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get room a player is in.
   */
  getPlayerRoom(playerId: string): Room | undefined {
    const roomId = this.playerRoom.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /**
   * List all public rooms.
   */
  listPublicRooms(): Room[] {
    return Array.from(this.rooms.values()).filter((r) => r.config.isPublic);
  }

  /**
   * Get total room count.
   */
  get roomCount(): number {
    return this.rooms.size;
  }
}
