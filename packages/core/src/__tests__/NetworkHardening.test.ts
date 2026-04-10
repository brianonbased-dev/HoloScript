import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from '../network/LobbyManager';
import { Matchmaker } from '../network/Matchmaker';
import { AntiCheat } from '../network/AntiCheat';

describe('Networking Hardening (Cycle 170)', () => {
  // ===========================================================================
  // LobbyManager
  // ===========================================================================
  describe('LobbyManager', () => {
    let lobby: LobbyManager;

    beforeEach(() => {
      lobby = new LobbyManager();
    });

    it('should create a room with host', () => {
      const room = lobby.createRoom('host1', 'Alice', { name: 'Fun Room', maxPlayers: 4 });
      expect(room.id).toBeDefined();
      expect(room.hostId).toBe('host1');
      expect(room.players.size).toBe(1);
    });

    it('should allow players to join and leave', () => {
      const room = lobby.createRoom('h', 'Host', { name: 'R', maxPlayers: 4 });
      expect(lobby.joinRoom(room.id, 'p1', 'Player1')).toBe(true);
      expect(room.players.size).toBe(2);

      lobby.leaveRoom('p1');
      expect(room.players.size).toBe(1);
    });

    it('should enforce max players', () => {
      const room = lobby.createRoom('h', 'Host', { name: 'R', maxPlayers: 2 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      expect(lobby.joinRoom(room.id, 'p2', 'P2')).toBe(false); // full
    });

    it('should require password for protected rooms', () => {
      const room = lobby.createRoom('h', 'Host', { name: 'R', maxPlayers: 4, password: 'secret' });
      expect(lobby.joinRoom(room.id, 'p1', 'P1')).toBe(false); // no password
      expect(lobby.joinRoom(room.id, 'p1', 'P1', 'wrong')).toBe(false);
      expect(lobby.joinRoom(room.id, 'p1', 'P1', 'secret')).toBe(true);
    });

    it('should perform host migration', () => {
      const room = lobby.createRoom('h', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      lobby.joinRoom(room.id, 'p2', 'P2');

      const result = lobby.leaveRoom('h');
      expect(result.migrated).toBe(true);
      expect(result.newHostId).toBeDefined();
      expect(room.hostId).not.toBe('h');
    });

    it('should track ready state', () => {
      const room = lobby.createRoom('h', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'p1', 'P1');
      expect(lobby.allReady(room.id)).toBe(false);

      lobby.setReady('h', true);
      lobby.setReady('p1', true);
      expect(lobby.allReady(room.id)).toBe(true);
    });

    it('should list available rooms', () => {
      lobby.createRoom('h1', 'Host1', { name: 'Public', maxPlayers: 4, tags: ['casual'] });
      lobby.createRoom('h2', 'Host2', { name: 'Private', maxPlayers: 4, password: 'x' });

      const rooms = lobby.listRooms();
      expect(rooms).toHaveLength(1); // password rooms excluded
    });
  });

  // ===========================================================================
  // Matchmaker
  // ===========================================================================
  describe('Matchmaker', () => {
    let mm: Matchmaker;

    beforeEach(() => {
      mm = new Matchmaker({ minPlayers: 2, maxPlayers: 4, ratingWindow: 200 });
    });

    it('should enqueue and dequeue players', () => {
      mm.enqueue({ id: 'p1', name: 'P1', rating: 1500, region: 'us-east' });
      expect(mm.getQueueSize()).toBe(1);
      mm.dequeue('p1');
      expect(mm.getQueueSize()).toBe(0);
    });

    it('should match players by rating', () => {
      mm.enqueue({ id: 'p1', name: 'P1', rating: 1500, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'P2', rating: 1550, region: 'us-east' });

      const matches = mm.processQueue();
      expect(matches).toHaveLength(1);
      expect(matches[0].players).toHaveLength(2);
      expect(mm.getQueueSize()).toBe(0); // both consumed
    });

    it('should not match players from different regions', () => {
      mm.enqueue({ id: 'p1', name: 'P1', rating: 1500, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'P2', rating: 1500, region: 'eu-west' });

      const matches = mm.processQueue();
      expect(matches).toHaveLength(0);
      expect(mm.getQueueSize()).toBe(2);
    });

    it('should not match players with rating outside window', () => {
      mm.enqueue({ id: 'p1', name: 'P1', rating: 1000, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'P2', rating: 1500, region: 'us-east' });

      const matches = mm.processQueue();
      expect(matches).toHaveLength(0);
    });

    it('should estimate wait time', () => {
      mm.enqueue({ id: 'p1', name: 'P1', rating: 1500, region: 'us-east' });
      const wait = mm.estimateWaitTime(1500, 'us-east');
      expect(wait).toBe(0); // 1 nearby player, need 1 more = 0 since we have one
    });

    it('should report queue size by region', () => {
      mm.enqueue({ id: 'p1', name: 'P1', rating: 1500, region: 'us-east' });
      mm.enqueue({ id: 'p2', name: 'P2', rating: 1500, region: 'eu-west' });
      expect(mm.getQueueSizeByRegion('us-east')).toBe(1);
    });
  });

  // ===========================================================================
  // AntiCheat
  // ===========================================================================
  describe('AntiCheat', () => {
    let ac: AntiCheat;

    beforeEach(() => {
      ac = new AntiCheat({ maxSpeed: 10, maxTeleportDistance: 30, banThreshold: 3 });
    });

    it('should register and track players', () => {
      ac.registerPlayer('p1');
      expect(ac.getPlayerIds()).toContain('p1');
    });

    it('should accept valid position updates', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });

      // Small move after enough time
      const state = ac.getPlayerState('p1')!;
      state.lastUpdateAt = Date.now() - 1000; // 1 second ago
      const result = ac.validatePositionUpdate('p1', { x: 5, y: 0, z: 0 });
      expect(result.valid).toBe(true);
    });

    it('should detect teleport violations', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      const result = ac.validatePositionUpdate('p1', { x: 100, y: 0, z: 0 });
      expect(result.valid).toBe(false);
      expect(result.violation?.type).toBe('teleport');
    });

    it('should detect speed violations', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      const state = ac.getPlayerState('p1')!;
      state.lastUpdateAt = Date.now() - 100; // 0.1 seconds ago

      // Attempt to move 20 units in 0.1s = 200 u/s > max 10
      const result = ac.validatePositionUpdate('p1', { x: 20, y: 0, z: 0 });
      expect(result.valid).toBe(false);
      expect(result.violation?.type).toBe('speed');
    });

    it('should rate limit actions', () => {
      ac.registerPlayer('p1');
      for (let i = 0; i < 30; i++) {
        ac.validateAction('p1');
      }
      const result = ac.validateAction('p1');
      expect(result.allowed).toBe(false);
      expect(result.violation?.type).toBe('rate_limit');
    });

    it('should auto-ban after threshold', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      // Generate 3 violations to trigger auto-ban (banThreshold=3)
      for (let i = 0; i < 3; i++) {
        ac.validatePositionUpdate('p1', { x: 999, y: 0, z: 0 });
        // Reset position for next violation
        const state = ac.getPlayerState('p1')!;
        state.position = { x: 0, y: 0, z: 0 };
      }
      expect(ac.isBanned('p1')).toBe(true);
    });

    it('should track violation count', () => {
      ac.registerPlayer('p1', { x: 0, y: 0, z: 0 });
      ac.validatePositionUpdate('p1', { x: 999, y: 0, z: 0 });
      expect(ac.getViolationCount('p1')).toBe(1);
    });
  });
});
