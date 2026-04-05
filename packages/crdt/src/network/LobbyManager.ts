/**
 * LobbyManager — Room management, player slots, and host migration
 *
 * Handles room creation, join/leave, ready state, host selection,
 * and host migration when the current host disconnects.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  joinedAt: number;
  team?: string;
  metadata?: Record<string, unknown>;
}

export interface LobbyRoom {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  players: Map<string, LobbyPlayer>;
  state: 'waiting' | 'starting' | 'in_progress' | 'finished';
  settings: Record<string, unknown>;
  createdAt: number;
  password?: string;
  tags: string[];
}

export interface RoomCreateOptions {
  name: string;
  maxPlayers: number;
  password?: string;
  settings?: Record<string, unknown>;
  tags?: string[];
}

// =============================================================================
// LOBBY MANAGER
// =============================================================================

export class LobbyManager {
  private rooms: Map<string, LobbyRoom> = new Map();
  private playerRoomMap: Map<string, string> = new Map();
  private nextRoomId: number = 1;

  /**
   * Create a new room
   */
  createRoom(hostId: string, hostName: string, options: RoomCreateOptions): LobbyRoom {
    const roomId = `room_${this.nextRoomId++}`;

    const host: LobbyPlayer = {
      id: hostId,
      name: hostName,
      ready: false,
      joinedAt: Date.now(),
    };

    const room: LobbyRoom = {
      id: roomId,
      name: options.name,
      hostId,
      maxPlayers: options.maxPlayers,
      players: new Map([[hostId, host]]),
      state: 'waiting',
      settings: options.settings || {},
      createdAt: Date.now(),
      password: options.password,
      tags: options.tags || [],
    };

    this.rooms.set(roomId, room);
    this.playerRoomMap.set(hostId, roomId);
    return room;
  }

  /**
   * Join an existing room
   */
  joinRoom(roomId: string, playerId: string, playerName: string, password?: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.state !== 'waiting') return false;
    if (room.players.size >= room.maxPlayers) return false;
    if (room.password && room.password !== password) return false;
    if (room.players.has(playerId)) return false;

    room.players.set(playerId, {
      id: playerId,
      name: playerName,
      ready: false,
      joinedAt: Date.now(),
    });

    this.playerRoomMap.set(playerId, roomId);
    return true;
  }

  /**
   * Leave a room (with host migration if host leaves)
   */
  leaveRoom(playerId: string): { migrated: boolean; newHostId?: string } {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return { migrated: false };

    const room = this.rooms.get(roomId);
    if (!room) return { migrated: false };

    room.players.delete(playerId);
    this.playerRoomMap.delete(playerId);

    // If room is empty, destroy it
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return { migrated: false };
    }

    // Host migration
    if (room.hostId === playerId) {
      // Pick the player who joined earliest
      let earliest: LobbyPlayer | null = null;
      for (const player of room.players.values()) {
        if (!earliest || player.joinedAt < earliest.joinedAt) {
          earliest = player;
        }
      }
      if (earliest) {
        room.hostId = earliest.id;
        return { migrated: true, newHostId: earliest.id };
      }
    }

    return { migrated: false };
  }

  /**
   * Set player ready state
   */
  setReady(playerId: string, ready: boolean): void {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (player) player.ready = ready;
  }

  /**
   * Check if all players in a room are ready
   */
  allReady(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    for (const player of room.players.values()) {
      if (!player.ready) return false;
    }
    return true;
  }

  /**
   * Start the game (host only)
   */
  startGame(roomId: string, requesterId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostId !== requesterId) return false;
    if (room.state !== 'waiting') return false;

    room.state = 'in_progress';
    return true;
  }

  /**
   * Get a room by ID
   */
  getRoom(roomId: string): LobbyRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get room by player ID
   */
  getRoomForPlayer(playerId: string): LobbyRoom | undefined {
    const roomId = this.playerRoomMap.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  /**
   * List all available rooms (waiting, not full, optionally filtered by tags)
   */
  listRooms(tags?: string[]): LobbyRoom[] {
    let rooms = [...this.rooms.values()].filter(
      (r) => r.state === 'waiting' && r.players.size < r.maxPlayers && !r.password
    );

    if (tags && tags.length > 0) {
      rooms = rooms.filter((r) => tags.some((t) => r.tags.includes(t)));
    }

    return rooms;
  }

  /**
   * Get total active room count
   */
  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * Get total player count across all rooms
   */
  getPlayerCount(): number {
    return this.playerRoomMap.size;
  }
}
