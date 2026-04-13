/**
 * RoomManager Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '@holoscript/core';

describe('RoomManager', () => {
  let rm: RoomManager;

  beforeEach(() => {
    rm = new RoomManager();
  });

  describe('room creation', () => {
    it('should create room with host', () => {
      const id = rm.createRoom('h1', { name: 'R1', maxPlayers: 4, isPublic: true });
      expect(id).toBeDefined();
      const room = rm.getRoom(id)!;
      expect(room.hostId).toBe('h1');
      expect(room.players.has('h1')).toBe(true);
    });

    it('should assign unique IDs', () => {
      const a = rm.createRoom('h1', { name: 'A', maxPlayers: 4, isPublic: true });
      const b = rm.createRoom('h2', { name: 'B', maxPlayers: 4, isPublic: true });
      expect(a).not.toBe(b);
    });
  });

  describe('joining', () => {
    it('should join room', () => {
      const id = rm.createRoom('h1', { name: 'R', maxPlayers: 4, isPublic: true });
      expect(rm.joinRoom('p1', id)).toBe(true);
      expect(rm.getRoom(id)!.players.size).toBe(2);
    });

    it('should reject full room', () => {
      const id = rm.createRoom('h1', { name: 'R', maxPlayers: 2, isPublic: true });
      rm.joinRoom('p1', id);
      expect(rm.joinRoom('p2', id)).toBe(false);
    });

    it('should reject wrong password', () => {
      const id = rm.createRoom('h1', {
        name: 'R',
        maxPlayers: 4,
        isPublic: false,
        password: 'abc',
      });
      expect(rm.joinRoom('p1', id, 'wrong')).toBe(false);
      expect(rm.joinRoom('p1', id, 'abc')).toBe(true);
    });
  });

  describe('leaving', () => {
    it('should remove player', () => {
      const id = rm.createRoom('h1', { name: 'R', maxPlayers: 4, isPublic: true });
      rm.joinRoom('p1', id);
      rm.leaveRoom('p1');
      expect(rm.getRoom(id)!.players.size).toBe(1);
    });

    it('should destroy empty room', () => {
      const id = rm.createRoom('h1', { name: 'R', maxPlayers: 4, isPublic: true });
      rm.leaveRoom('h1');
      expect(rm.getRoom(id)).toBeUndefined();
    });

    it('should transfer host', () => {
      const id = rm.createRoom('h1', { name: 'R', maxPlayers: 4, isPublic: true });
      rm.joinRoom('p1', id);
      rm.leaveRoom('h1');
      expect(rm.getRoom(id)!.hostId).toBe('p1');
    });
  });

  describe('queries', () => {
    it('should get player room', () => {
      const id = rm.createRoom('h1', { name: 'R', maxPlayers: 4, isPublic: true });
      expect(rm.getPlayerRoom('h1')?.id).toBe(id);
    });

    it('should list public rooms', () => {
      rm.createRoom('h1', { name: 'Pub', maxPlayers: 4, isPublic: true });
      rm.createRoom('h2', { name: 'Prv', maxPlayers: 4, isPublic: false });
      expect(rm.listPublicRooms().length).toBe(1);
    });

    it('should count rooms', () => {
      rm.createRoom('h1', { name: 'A', maxPlayers: 4, isPublic: true });
      rm.createRoom('h2', { name: 'B', maxPlayers: 4, isPublic: true });
      expect(rm.roomCount).toBe(2);
    });
  });
});
