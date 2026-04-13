import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '@holoscript/core';

describe('LobbyManager', () => {
  let lm: LobbyManager;

  beforeEach(() => {
    lm = new LobbyManager();
  });

  // ---------------------------------------------------------------------------
  // Room Creation
  // ---------------------------------------------------------------------------

  it('createRoom returns a room with the host', () => {
    const room = lm.createRoom('host1', 'Alice', { name: 'Fun Room', maxPlayers: 4 });
    expect(room.id).toBeDefined();
    expect(room.name).toBe('Fun Room');
    expect(room.hostId).toBe('host1');
    expect(room.players.size).toBe(1);
    expect(room.state).toBe('waiting');
  });

  it('getRoomCount increases', () => {
    lm.createRoom('h1', 'A', { name: 'R1', maxPlayers: 4 });
    lm.createRoom('h2', 'B', { name: 'R2', maxPlayers: 4 });
    expect(lm.getRoomCount()).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Joining
  // ---------------------------------------------------------------------------

  it('joinRoom adds a player', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    expect(lm.joinRoom(room.id, 'p2', 'Bob')).toBe(true);
    expect(room.players.size).toBe(2);
    expect(lm.getPlayerCount()).toBe(2);
  });

  it('joinRoom fails when room is full', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 2 });
    lm.joinRoom(room.id, 'p2', 'Bob');
    expect(lm.joinRoom(room.id, 'p3', 'Carol')).toBe(false);
  });

  it('joinRoom fails with wrong password', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4, password: 'secret' });
    expect(lm.joinRoom(room.id, 'p2', 'Bob', 'wrong')).toBe(false);
    expect(lm.joinRoom(room.id, 'p2', 'Bob', 'secret')).toBe(true);
  });

  it('joinRoom fails for nonexistent room', () => {
    expect(lm.joinRoom('nope', 'p1', 'X')).toBe(false);
  });

  it('joinRoom fails if player already in room', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    expect(lm.joinRoom(room.id, 'host', 'Alice')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Leaving + Host Migration
  // ---------------------------------------------------------------------------

  it('leaveRoom removes player', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    lm.joinRoom(room.id, 'p2', 'Bob');
    lm.leaveRoom('p2');
    expect(room.players.size).toBe(1);
  });

  it('leaveRoom destroys empty room', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    lm.leaveRoom('host');
    expect(lm.getRoom(room.id)).toBeUndefined();
    expect(lm.getRoomCount()).toBe(0);
  });

  it('leaveRoom triggers host migration', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    lm.joinRoom(room.id, 'p2', 'Bob');
    const result = lm.leaveRoom('host');
    expect(result.migrated).toBe(true);
    expect(result.newHostId).toBe('p2');
    expect(room.hostId).toBe('p2');
  });

  // ---------------------------------------------------------------------------
  // Ready / Start
  // ---------------------------------------------------------------------------

  it('setReady marks player as ready', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    lm.setReady('host', true);
    expect(room.players.get('host')!.ready).toBe(true);
  });

  it('allReady returns true only when all ready', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    lm.joinRoom(room.id, 'p2', 'Bob');
    expect(lm.allReady(room.id)).toBe(false);
    lm.setReady('host', true);
    lm.setReady('p2', true);
    expect(lm.allReady(room.id)).toBe(true);
  });

  it('startGame only works for host', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    expect(lm.startGame(room.id, 'nothost')).toBe(false);
    expect(lm.startGame(room.id, 'host')).toBe(true);
    expect(room.state).toBe('in_progress');
  });

  it('startGame fails if already started', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    lm.startGame(room.id, 'host');
    expect(lm.startGame(room.id, 'host')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  it('getRoomForPlayer returns correct room', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    lm.joinRoom(room.id, 'p2', 'Bob');
    expect(lm.getRoomForPlayer('p2')!.id).toBe(room.id);
  });

  it('listRooms filters by availability and tags', () => {
    const r1 = lm.createRoom('h1', 'A', { name: 'R1', maxPlayers: 4, tags: ['ranked'] });
    lm.createRoom('h2', 'B', { name: 'R2', maxPlayers: 4, tags: ['casual'] });

    const ranked = lm.listRooms(['ranked']);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe(r1.id);
  });

  it('listRooms hides password-protected rooms', () => {
    lm.createRoom('h1', 'A', { name: 'R1', maxPlayers: 4, password: 'secret' });
    expect(lm.listRooms()).toHaveLength(0);
  });

  it('joinRoom fails if game in_progress', () => {
    const room = lm.createRoom('host', 'Alice', { name: 'R', maxPlayers: 4 });
    lm.startGame(room.id, 'host');
    expect(lm.joinRoom(room.id, 'p2', 'Bob')).toBe(false);
  });
});
