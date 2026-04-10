import { describe, it, expect, vi } from 'vitest';
import { NetworkManager } from '../network/NetworkManager';
import { RoomManager } from '../network/RoomManager';

describe('Networking & Multiplayer', () => {
  describe('NetworkManager', () => {
    it('Connects and tracks state', () => {
      const nm = new NetworkManager('player1');
      expect(nm.isConnected()).toBe(false);
      nm.connect();
      expect(nm.isConnected()).toBe(true);
      expect(nm.getPeerId()).toBe('player1');
    });

    it('Manages peers', () => {
      const nm = new NetworkManager('p1');
      nm.addPeer('p2', 'Alice');
      nm.addPeer('p3', 'Bob');
      expect(nm.getPeerCount()).toBe(2);
      nm.removePeer('p2');
      expect(nm.getPeerCount()).toBe(1);
    });

    it('Broadcasts messages to outbox', () => {
      const nm = new NetworkManager('p1');
      nm.connect();
      nm.broadcast('state_sync', { x: 1, y: 2 });
      const msgs = nm.flush();
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe('state_sync');
      expect(msgs[0].senderId).toBe('p1');
    });

    it('Receives and dispatches messages', () => {
      const nm = new NetworkManager('p1');
      const handler = vi.fn();
      nm.onMessage('event', handler);

      nm.receive({
        type: 'event',
        senderId: 'p2',
        timestamp: Date.now(),
        payload: { action: 'jump' },
      });
      nm.processInbox();

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].payload.action).toBe('jump');
    });

    it('Does not broadcast when disconnected', () => {
      const nm = new NetworkManager('p1');
      nm.broadcast('event', {});
      expect(nm.flush()).toHaveLength(0);
    });
  });

  describe('RoomManager', () => {
    it('Creates rooms', () => {
      const rm = new RoomManager();
      const id = rm.createRoom('host1', { name: 'Test', maxPlayers: 4, isPublic: true });
      expect(rm.roomCount).toBe(1);
      expect(rm.getRoom(id)?.config.name).toBe('Test');
    });

    it('Joins rooms with capacity check', () => {
      const rm = new RoomManager();
      const id = rm.createRoom('host', { name: 'R', maxPlayers: 2, isPublic: true });
      expect(rm.joinRoom('p2', id)).toBe(true);
      expect(rm.joinRoom('p3', id)).toBe(false); // Full
    });

    it('Password-protects rooms', () => {
      const rm = new RoomManager();
      const id = rm.createRoom('host', {
        name: 'Secret',
        maxPlayers: 4,
        isPublic: false,
        password: 'abc',
      });
      expect(rm.joinRoom('p2', id, 'wrong')).toBe(false);
      expect(rm.joinRoom('p2', id, 'abc')).toBe(true);
    });

    it('Cleans up empty rooms on leave', () => {
      const rm = new RoomManager();
      const id = rm.createRoom('host', { name: 'R', maxPlayers: 4, isPublic: true });
      rm.leaveRoom('host');
      expect(rm.roomCount).toBe(0);
    });

    it('Transfers host on leave', () => {
      const rm = new RoomManager();
      const id = rm.createRoom('host', { name: 'R', maxPlayers: 4, isPublic: true });
      rm.joinRoom('p2', id);
      rm.leaveRoom('host');
      expect(rm.getRoom(id)?.hostId).toBe('p2');
    });

    it('Lists public rooms only', () => {
      const rm = new RoomManager();
      rm.createRoom('h1', { name: 'Public', maxPlayers: 4, isPublic: true });
      rm.createRoom('h2', { name: 'Private', maxPlayers: 4, isPublic: false });
      expect(rm.listPublicRooms()).toHaveLength(1);
    });
  });
});
