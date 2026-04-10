/**
 * Cycle 201 — Network Lobby System
 *
 * Covers LobbyManager (room creation, join/leave, host migration, ready/start, listing)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../network/LobbyManager';

describe('LobbyManager', () => {
  let lobby: LobbyManager;

  beforeEach(() => {
    lobby = new LobbyManager();
  });

  // --- Room creation ---
  it('createRoom returns a room with correct structure', () => {
    const room = lobby.createRoom('host1', 'Alice', { name: 'Arena', maxPlayers: 4 });
    expect(room.id).toMatch(/^room_/);
    expect(room.name).toBe('Arena');
    expect(room.hostId).toBe('host1');
    expect(room.maxPlayers).toBe(4);
    expect(room.state).toBe('waiting');
    expect(room.players.size).toBe(1);
  });

  it('createRoom auto-increments room IDs', () => {
    const r1 = lobby.createRoom('h1', 'A', { name: 'R1', maxPlayers: 2 });
    const r2 = lobby.createRoom('h2', 'B', { name: 'R2', maxPlayers: 2 });
    expect(r1.id).not.toBe(r2.id);
  });

  it('createRoom stores tags and settings', () => {
    const room = lobby.createRoom('h1', 'A', {
      name: 'Custom',
      maxPlayers: 8,
      tags: ['ranked', 'pvp'],
      settings: { map: 'desert' },
    });
    expect(room.tags).toEqual(['ranked', 'pvp']);
    expect(room.settings).toEqual({ map: 'desert' });
  });

  // --- Join ---
  it('joinRoom succeeds for valid room', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    expect(lobby.joinRoom(room.id, 'p1', 'Player1')).toBe(true);
    expect(room.players.size).toBe(2);
  });

  it('joinRoom rejects when room is full', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 2 });
    lobby.joinRoom(room.id, 'p1', 'P1');
    expect(lobby.joinRoom(room.id, 'p2', 'P2')).toBe(false);
  });

  it('joinRoom rejects wrong password', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4, password: 'secret' });
    expect(lobby.joinRoom(room.id, 'p1', 'P1', 'wrong')).toBe(false);
    expect(lobby.joinRoom(room.id, 'p1', 'P1', 'secret')).toBe(true);
  });

  it('joinRoom rejects duplicate player', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    lobby.joinRoom(room.id, 'p1', 'P1');
    expect(lobby.joinRoom(room.id, 'p1', 'P1')).toBe(false);
  });

  it('joinRoom rejects non-waiting state', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    lobby.startGame(room.id, 'h1');
    expect(lobby.joinRoom(room.id, 'p1', 'P1')).toBe(false);
  });

  it('joinRoom returns false for nonexistent room', () => {
    expect(lobby.joinRoom('room_999', 'p1', 'P1')).toBe(false);
  });

  // --- Leave & Host Migration ---
  it('leaveRoom removes player', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    lobby.joinRoom(room.id, 'p1', 'P1');
    lobby.leaveRoom('p1');
    expect(room.players.size).toBe(1);
  });

  it('leaveRoom destroys empty room', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    lobby.leaveRoom('h1');
    expect(lobby.getRoom(room.id)).toBeUndefined();
  });

  it('leaveRoom triggers host migration when host leaves', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    lobby.joinRoom(room.id, 'p1', 'P1');
    const result = lobby.leaveRoom('h1');
    expect(result.migrated).toBe(true);
    expect(result.newHostId).toBe('p1');
    expect(room.hostId).toBe('p1');
  });

  it('leaveRoom returns migrated=false for non-host', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    lobby.joinRoom(room.id, 'p1', 'P1');
    const result = lobby.leaveRoom('p1');
    expect(result.migrated).toBe(false);
  });

  // --- Ready / Start ---
  it('setReady / allReady', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    lobby.joinRoom(room.id, 'p1', 'P1');
    expect(lobby.allReady(room.id)).toBe(false);
    lobby.setReady('h1', true);
    lobby.setReady('p1', true);
    expect(lobby.allReady(room.id)).toBe(true);
  });

  it('startGame succeeds for host only', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    expect(lobby.startGame(room.id, 'p1')).toBe(false); // non-host
    expect(lobby.startGame(room.id, 'h1')).toBe(true);
    expect(room.state).toBe('in_progress');
  });

  it('startGame rejects if already started', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    lobby.startGame(room.id, 'h1');
    expect(lobby.startGame(room.id, 'h1')).toBe(false);
  });

  // --- Lookup ---
  it('getRoom / getRoomForPlayer', () => {
    const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
    expect(lobby.getRoom(room.id)).toBeDefined();
    expect(lobby.getRoomForPlayer('h1')?.id).toBe(room.id);
    expect(lobby.getRoomForPlayer('nobody')).toBeUndefined();
  });

  // --- Listing ---
  it('listRooms filters waiting/not-full/no-password rooms', () => {
    lobby.createRoom('h1', 'A', { name: 'Open', maxPlayers: 4 });
    lobby.createRoom('h2', 'B', { name: 'Locked', maxPlayers: 4, password: 'pass' });
    const rooms = lobby.listRooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].name).toBe('Open');
  });

  it('listRooms filters by tags', () => {
    lobby.createRoom('h1', 'A', { name: 'PVP', maxPlayers: 4, tags: ['pvp'] });
    lobby.createRoom('h2', 'B', { name: 'PVE', maxPlayers: 4, tags: ['pve'] });
    const pvp = lobby.listRooms(['pvp']);
    expect(pvp).toHaveLength(1);
    expect(pvp[0].name).toBe('PVP');
  });

  // --- Counts ---
  it('getRoomCount / getPlayerCount track correctly', () => {
    lobby.createRoom('h1', 'Host', { name: 'R1', maxPlayers: 4 });
    lobby.createRoom('h2', 'Host2', { name: 'R2', maxPlayers: 4 });
    expect(lobby.getRoomCount()).toBe(2);
    expect(lobby.getPlayerCount()).toBe(2);
  });
});
