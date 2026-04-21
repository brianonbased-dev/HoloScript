import { describe, it, expect, beforeEach } from 'vitest';
import { NetEntitySync } from '@holoscript/mesh/network/NetEntitySync';
import { NetEventBus } from '@holoscript/mesh';
import { SessionManager } from '@holoscript/mesh';

describe('Multiplayer Sync (Cycle 175)', () => {
  describe('NetEntitySync', () => {
    let sync: NetEntitySync;

    beforeEach(() => {
      sync = new NetEntitySync(20);
    });

    it('should register entities and add components', () => {
      sync.addComponent('e1', 'transform', { x: 0, y: 0 }, 'player1');
      expect(sync.getEntityCount()).toBe(1);
    });

    it('should track dirty components', () => {
      sync.addComponent('e1', 'transform', { x: 0 });
      const snapshots = sync.collectDirty();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].entityId).toBe('e1');

      // After collect, no longer dirty
      const again = sync.collectDirty();
      expect(again).toHaveLength(0);
    });

    it('should update components and mark dirty', () => {
      sync.addComponent('e1', 'transform', { x: 0 });
      sync.collectDirty(); // clear
      sync.updateComponent('e1', 'transform', { x: 10 });
      const snapshots = sync.collectDirty();
      expect(snapshots).toHaveLength(1);
    });

    it('should transfer ownership', () => {
      sync.addComponent('e1', 'transform', { x: 0 }, 'player1');
      sync.collectDirty();
      expect(sync.transferOwnership('e1', 'player2')).toBe(true);
      const dirty = sync.collectDirty();
      expect(dirty).toHaveLength(1); // ownership change marks dirty
    });

    it('should apply received snapshots', () => {
      sync.addComponent('e1', 'transform', { x: 0 });
      sync.applySnapshot({
        entityId: 'e1',
        components: { transform: { x: 99 } },
        version: 5,
        timestamp: Date.now(),
      });
      // Component updated
      const dirty = sync.collectDirty();
      // Should not be dirty after apply (apply clears dirty)
      expect(dirty).toHaveLength(0);
    });
  });

  describe('NetEventBus', () => {
    let bus: NetEventBus;

    beforeEach(() => {
      bus = new NetEventBus('host', 16);
    });

    it('should create channels', () => {
      bus.createChannel('game', 'reliable');
      expect(bus.getChannelCount()).toBe(1);
    });

    it('should send and flush messages', () => {
      bus.createChannel('game');
      bus.send('game', 'spawn', { id: 'e1' });
      expect(bus.getOutboxSize()).toBe(1);
      const batch = bus.flush();
      expect(batch).toHaveLength(1);
      expect(bus.getOutboxSize()).toBe(0);
    });

    it('should subscribe and receive events', () => {
      bus.createChannel('game');
      const received: unknown[] = [];
      bus.subscribe('game', 'hit', (p) => received.push(p));
      bus.receive({
        channel: 'game',
        event: 'hit',
        payload: { damage: 10 },
        senderId: 'p1',
        timestamp: Date.now(),
        sequenceId: 1,
      });
      expect(received).toHaveLength(1);
    });

    it('should track channel stats', () => {
      bus.createChannel('game');
      bus.send('game', 'move', { x: 1 });
      bus.send('game', 'move', { x: 2 });
      const ch = bus.getChannel('game')!;
      expect(ch.messageCount).toBe(2);
      expect(ch.bytesTransferred).toBeGreaterThan(0);
    });
  });

  describe('SessionManager', () => {
    let session: SessionManager;

    beforeEach(() => {
      session = new SessionManager({ maxReconnectAttempts: 2, reconnectWindowMs: 60000 });
    });

    it('should create and connect session', () => {
      session.createSession('s1');
      expect(session.getState()).toBe('connecting');
      session.connect();
      expect(session.getState()).toBe('connected');
    });

    it('should add and track players', () => {
      session.createSession('s1');
      session.addPlayer('p1', 'Alice');
      session.addPlayer('p2', 'Bob');
      expect(session.getPlayerCount()).toBe(2);
    });

    it('should handle disconnect and reconnect', () => {
      session.createSession('s1');
      session.addPlayer('p1', 'Alice');
      session.playerDisconnected('p1');
      expect(session.getPlayer('p1')?.state).toBe('reconnecting');

      expect(session.playerReconnect('p1')).toBe(true);
      expect(session.getPlayer('p1')?.state).toBe('connected');
    });

    it('should reject reconnection after max attempts', () => {
      session.createSession('s1');
      session.addPlayer('p1', 'Alice');
      session.playerDisconnected('p1');
      session.playerReconnect('p1'); // attempt 1
      session.getPlayer('p1')!.state = 'reconnecting';
      session.playerReconnect('p1'); // attempt 2
      session.getPlayer('p1')!.state = 'reconnecting';
      const result = session.playerReconnect('p1'); // attempt 3 — exceeds max
      expect(result).toBe(false);
      expect(session.getPlayer('p1')?.state).toBe('disconnected');
    });

    it('should end session', () => {
      session.createSession('s1');
      session.endSession();
      expect(session.getState()).toBe('ended');
    });

    it('should provide session snapshot', () => {
      session.createSession('s1');
      session.addPlayer('p1', 'Alice');
      const snap = session.getSnapshot();
      expect(snap.sessionId).toBe('s1');
      expect(snap.players).toHaveLength(1);
    });
  });
});
