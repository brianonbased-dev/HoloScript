import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../network/LobbyManager';

describe('LobbyManager', () => {
  let lm: LobbyManager;

  beforeEach(() => { lm = new LobbyManager(); });

  it('createRoom creates room with host as player', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 4 });
    expect(room.hostId).toBe('h1');
    expect(room.players.size).toBe(1);
    expect(room.state).toBe('waiting');
  });

  it('joinRoom adds player to room', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 4 });
    expect(lm.joinRoom(room.id, 'p1', 'Player1')).toBe(true);
    expect(lm.getRoom(room.id)!.players.size).toBe(2);
  });

  it('joinRoom rejects when full', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 2 });
    lm.joinRoom(room.id, 'p1', 'P1');
    expect(lm.joinRoom(room.id, 'p2', 'P2')).toBe(false);
  });

  it('joinRoom rejects wrong password', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 4, password: 'secret' });
    expect(lm.joinRoom(room.id, 'p1', 'P1', 'wrong')).toBe(false);
    expect(lm.joinRoom(room.id, 'p1', 'P1', 'secret')).toBe(true);
  });

  it('leaveRoom removes player and destroys empty room', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 4 });
    lm.leaveRoom('h1');
    expect(lm.getRoom(room.id)).toBeUndefined();
    expect(lm.getRoomCount()).toBe(0);
  });

  it('host migration picks earliest player when host leaves', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 4 });
    lm.joinRoom(room.id, 'p1', 'P1');
    lm.joinRoom(room.id, 'p2', 'P2');
    const result = lm.leaveRoom('h1');
    expect(result.migrated).toBe(true);
    expect(result.newHostId).toBe('p1');
    expect(lm.getRoom(room.id)!.hostId).toBe('p1');
  });

  it('setReady + allReady tracks readiness', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 4 });
    lm.joinRoom(room.id, 'p1', 'P1');
    expect(lm.allReady(room.id)).toBe(false);
    lm.setReady('h1', true);
    lm.setReady('p1', true);
    expect(lm.allReady(room.id)).toBe(true);
  });

  it('startGame requires host and sets state', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 4 });
    expect(lm.startGame(room.id, 'p1')).toBe(false); // not host
    expect(lm.startGame(room.id, 'h1')).toBe(true);
    expect(lm.getRoom(room.id)!.state).toBe('in_progress');
  });

  it('listRooms filters public waiting rooms', () => {
    lm.createRoom('h1', 'Host', { name: 'Public', maxPlayers: 4, tags: ['pvp'] });
    lm.createRoom('h2', 'Host2', { name: 'Secret', maxPlayers: 4, password: 'x' });
    const rooms = lm.listRooms();
    expect(rooms.length).toBe(1);
    expect(rooms[0].name).toBe('Public');
  });

  it('getRoomForPlayer returns correct room', () => {
    const room = lm.createRoom('h1', 'Host', { name: 'Test', maxPlayers: 4 });
    lm.joinRoom(room.id, 'p1', 'P1');
    expect(lm.getRoomForPlayer('p1')!.id).toBe(room.id);
  });

  it('getPlayerCount returns total across rooms', () => {
    lm.createRoom('h1', 'Host', { name: 'R1', maxPlayers: 4 });
    lm.createRoom('h2', 'Host2', { name: 'R2', maxPlayers: 4 });
    expect(lm.getPlayerCount()).toBe(2);
  });
});
