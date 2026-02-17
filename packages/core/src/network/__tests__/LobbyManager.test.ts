/**
 * LobbyManager Unit Tests
 *
 * Tests room creation, joining, leaving, host migration,
 * ready state, game start, listing, and password protection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../LobbyManager';

describe('LobbyManager', () => {
  let lobby: LobbyManager;

  beforeEach(() => {
    lobby = new LobbyManager();
  });

  describe('room creation', () => {
    it('should create a room with host as first player', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'Room1', maxPlayers: 4 });
      expect(room.id).toBeDefined();
      expect(room.hostId).toBe('h1');
      expect(room.players.size).toBe(1);
      expect(room.state).toBe('waiting');
    });

    it('should assign unique room IDs', () => {
      const r1 = lobby.createRoom('h1', 'A', { name: 'R1', maxPlayers: 4 });
      const r2 = lobby.createRoom('h2', 'B', { name: 'R2', maxPlayers: 4 });
      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('joining', () => {
    it('should allow joining a room', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      expect(lobby.joinRoom(room.id, 'p1', 'Player1')).toBe(true);
      expect(lobby.getRoom(room.id)!.players.size).toBe(2);
    });

    it('should reject join when room is full', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 2 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      expect(lobby.joinRoom(room.id, 'p2', 'P2')).toBe(false);
    });

    it('should reject join with wrong password', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4, password: 'secret' });
      expect(lobby.joinRoom(room.id, 'p1', 'P1', 'wrong')).toBe(false);
      expect(lobby.joinRoom(room.id, 'p1', 'P1', 'secret')).toBe(true);
    });

    it('should reject duplicate join', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      expect(lobby.joinRoom(room.id, 'h1', 'Host')).toBe(false);
    });

    it('should reject join when game in progress', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.startGame(room.id, 'h1');
      expect(lobby.joinRoom(room.id, 'p1', 'P1')).toBe(false);
    });
  });

  describe('leaving and host migration', () => {
    it('should remove player from room', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      lobby.leaveRoom('p1');
      expect(lobby.getRoom(room.id)!.players.size).toBe(1);
    });

    it('should destroy empty room', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.leaveRoom('h1');
      expect(lobby.getRoom(room.id)).toBeUndefined();
    });

    it('should migrate host when host leaves', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      const result = lobby.leaveRoom('h1');
      expect(result.migrated).toBe(true);
      expect(result.newHostId).toBe('p1');
      expect(lobby.getRoom(room.id)!.hostId).toBe('p1');
    });
  });

  describe('ready state', () => {
    it('should set player ready', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      lobby.setReady('p1', true);
      expect(lobby.getRoom(room.id)!.players.get('p1')!.ready).toBe(true);
    });

    it('should report allReady correctly', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      expect(lobby.allReady(room.id)).toBe(false);
      lobby.setReady('h1', true);
      lobby.setReady('p1', true);
      expect(lobby.allReady(room.id)).toBe(true);
    });
  });

  describe('game start', () => {
    it('should allow host to start game', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      expect(lobby.startGame(room.id, 'h1')).toBe(true);
      expect(lobby.getRoom(room.id)!.state).toBe('in_progress');
    });

    it('should reject non-host start', () => {
      const room = lobby.createRoom('h1', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      expect(lobby.startGame(room.id, 'p1')).toBe(false);
    });
  });

  describe('listing and queries', () => {
    it('should list available public rooms', () => {
      lobby.createRoom('h1', 'A', { name: 'R1', maxPlayers: 4 });
      lobby.createRoom('h2', 'B', { name: 'R2', maxPlayers: 4, password: 'secret' });
      const available = lobby.listRooms();
      expect(available.length).toBe(1); // password room excluded
    });

    it('should filter by tags', () => {
      lobby.createRoom('h1', 'A', { name: 'R1', maxPlayers: 4, tags: ['deathmatch'] });
      lobby.createRoom('h2', 'B', { name: 'R2', maxPlayers: 4, tags: ['coop'] });
      const results = lobby.listRooms(['coop']);
      expect(results.length).toBe(1);
    });

    it('should find room by player', () => {
      const room = lobby.createRoom('h1', 'A', { name: 'R1', maxPlayers: 4 });
      expect(lobby.getRoomForPlayer('h1')?.id).toBe(room.id);
    });

    it('should count rooms and players', () => {
      lobby.createRoom('h1', 'A', { name: 'R1', maxPlayers: 4 });
      lobby.createRoom('h2', 'B', { name: 'R2', maxPlayers: 4 });
      expect(lobby.getRoomCount()).toBe(2);
      expect(lobby.getPlayerCount()).toBe(2);
    });
  });
});
