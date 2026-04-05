/**
 * SessionManager Unit Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../SessionManager';

describe('SessionManager', () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = new SessionManager({ maxReconnectAttempts: 3, reconnectWindowMs: 30000 });
  });

  describe('lifecycle', () => {
    it('should start idle', () => {
      expect(sm.getState()).toBe('idle');
      expect(sm.getSessionId()).toBeNull();
    });

    it('should create session', () => {
      sm.createSession('sess_1');
      expect(sm.getSessionId()).toBe('sess_1');
      expect(sm.getState()).toBe('connecting');
    });

    it('should connect', () => {
      sm.createSession('s');
      sm.connect();
      expect(sm.getState()).toBe('connected');
    });

    it('should end session', () => {
      sm.createSession('s');
      sm.connect();
      sm.endSession();
      expect(sm.getState()).toBe('ended');
    });
  });

  describe('players', () => {
    it('should add and count', () => {
      sm.addPlayer('p1', 'Alice');
      sm.addPlayer('p2', 'Bob');
      expect(sm.getPlayerCount()).toBe(2);
    });

    it('should get by id', () => {
      sm.addPlayer('p1', 'Alice');
      expect(sm.getPlayer('p1')?.name).toBe('Alice');
    });

    it('should remove', () => {
      sm.addPlayer('p1', 'A');
      expect(sm.removePlayer('p1')).toBe(true);
      expect(sm.getPlayerCount()).toBe(0);
    });
  });

  describe('disconnect/reconnect', () => {
    it('should mark reconnecting on disconnect', () => {
      sm.addPlayer('p1', 'A');
      sm.playerDisconnected('p1');
      expect(sm.getPlayer('p1')?.state).toBe('reconnecting');
    });

    it('should reconnect within window', () => {
      sm.addPlayer('p1', 'A');
      sm.playerDisconnected('p1');
      expect(sm.playerReconnect('p1')).toBe(true);
      expect(sm.getPlayer('p1')?.state).toBe('connected');
    });

    it('should fail after max attempts', () => {
      sm.addPlayer('p1', 'A');
      sm.playerDisconnected('p1');
      sm.playerReconnect('p1');
      sm.playerReconnect('p1');
      sm.playerReconnect('p1');
      expect(sm.playerReconnect('p1')).toBe(false);
    });
  });

  describe('heartbeat', () => {
    it('should update lastSeenAt', () => {
      sm.addPlayer('p1', 'A');
      const before = sm.getPlayer('p1')!.lastSeenAt;
      sm.heartbeat('p1');
      expect(sm.getPlayer('p1')!.lastSeenAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('snapshot', () => {
    it('should return snapshot', () => {
      sm.createSession('s1');
      sm.connect();
      sm.addPlayer('p1', 'A');
      const snap = sm.getSnapshot();
      expect(snap.sessionId).toBe('s1');
      expect(snap.players.length).toBe(1);
    });
  });

  describe('state history', () => {
    it('should track transitions', () => {
      sm.createSession('s1');
      sm.connect();
      sm.endSession();
      expect(sm.getStateHistory().map((h) => h.state)).toEqual([
        'connecting',
        'connected',
        'ended',
      ]);
    });
  });
});
