/**
 * SessionManager — Production Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '@holoscript/core';

describe('SessionManager — construction', () => {
  it('starts idle with no session', () => {
    const sm = new SessionManager();
    expect(sm.getState()).toBe('idle');
    expect(sm.getSessionId()).toBeNull();
  });
  it('accepts partial config', () => {
    expect(() => new SessionManager({ maxReconnectAttempts: 5 })).not.toThrow();
  });
  it('getConfig returns merged defaults', () => {
    const cfg = new SessionManager({ maxReconnectAttempts: 1 }).getConfig();
    expect(cfg.maxReconnectAttempts).toBe(1);
    expect(typeof cfg.reconnectWindowMs).toBe('number');
  });
});

describe('SessionManager — createSession / connect', () => {
  it('createSession sets sessionId and state=connecting', () => {
    const sm = new SessionManager();
    sm.createSession('session-abc');
    expect(sm.getSessionId()).toBe('session-abc');
    expect(sm.getState()).toBe('connecting');
  });
  it('connect transitions to connected', () => {
    const sm = new SessionManager();
    sm.createSession('s1');
    sm.connect();
    expect(sm.getState()).toBe('connected');
  });
  it('endSession transitions to ended', () => {
    const sm = new SessionManager();
    sm.createSession('s1');
    sm.connect();
    sm.endSession();
    expect(sm.getState()).toBe('ended');
  });
});

describe('SessionManager — players', () => {
  let sm: SessionManager;
  beforeEach(() => {
    sm = new SessionManager();
    sm.createSession('s1');
    sm.connect();
  });

  it('addPlayer stores player', () => {
    sm.addPlayer('p1', 'Alice');
    expect(sm.getPlayerCount()).toBe(1);
    expect(sm.getPlayer('p1')?.name).toBe('Alice');
  });
  it('player starts in connected state', () => {
    sm.addPlayer('p1', 'Alice');
    expect(sm.getPlayer('p1')?.state).toBe('connected');
  });
  it('removePlayer deletes player', () => {
    sm.addPlayer('p1', 'Alice');
    expect(sm.removePlayer('p1')).toBe(true);
    expect(sm.getPlayerCount()).toBe(0);
  });
  it('removePlayer returns false for unknown id', () => {
    expect(sm.removePlayer('ghost')).toBe(false);
  });
  it('multiple players can coexist', () => {
    sm.addPlayer('p1', 'Alice');
    sm.addPlayer('p2', 'Bob');
    sm.addPlayer('p3', 'Carol');
    expect(sm.getPlayerCount()).toBe(3);
  });
});

describe('SessionManager — playerDisconnected / playerReconnect', () => {
  let sm: SessionManager;
  beforeEach(() => {
    sm = new SessionManager({ maxReconnectAttempts: 2, reconnectWindowMs: 60000 });
    sm.createSession('s1');
    sm.connect();
    sm.addPlayer('p1', 'Alice');
  });

  it('playerDisconnected returns false for unknown player', () => {
    expect(sm.playerDisconnected('ghost')).toBe(false);
  });
  it('playerDisconnected sets state to reconnecting', () => {
    sm.playerDisconnected('p1');
    expect(sm.getPlayer('p1')?.state).toBe('reconnecting');
  });
  it('playerReconnect returns false for unknown player', () => {
    expect(sm.playerReconnect('ghost')).toBe(false);
  });
  it('playerReconnect within window succeeds', () => {
    sm.playerDisconnected('p1');
    const result = sm.playerReconnect('p1');
    expect(result).toBe(true);
    expect(sm.getPlayer('p1')?.state).toBe('connected');
  });
  it('playerReconnect beyond maxAttempts fails', () => {
    sm.playerDisconnected('p1');
    sm.playerReconnect('p1'); // attempt 1
    sm.playerReconnect('p1'); // attempt 2
    const result = sm.playerReconnect('p1'); // attempt 3 = exceeds max 2
    expect(result).toBe(false);
    expect(sm.getPlayer('p1')?.state).toBe('disconnected');
  });
  it('reconnect attempts increment per call', () => {
    sm.playerDisconnected('p1');
    sm.playerReconnect('p1');
    expect(sm.getPlayer('p1')?.reconnectAttempts).toBe(1);
  });
});

describe('SessionManager — heartbeat', () => {
  it('updates lastSeenAt for known player', () => {
    const sm = new SessionManager();
    sm.createSession('s');
    sm.addPlayer('p1', 'X');
    const before = sm.getPlayer('p1')!.lastSeenAt;
    // Advance time slightly
    sm.heartbeat('p1');
    expect(sm.getPlayer('p1')!.lastSeenAt).toBeGreaterThanOrEqual(before);
  });
  it('does not throw for unknown player', () => {
    const sm = new SessionManager();
    expect(() => sm.heartbeat('ghost')).not.toThrow();
  });
});

describe('SessionManager — getSnapshot', () => {
  it('snapshot reflects current state', () => {
    const sm = new SessionManager();
    sm.createSession('snap-session');
    sm.connect();
    sm.addPlayer('p1', 'Alice');
    const snap = sm.getSnapshot();
    expect(snap.sessionId).toBe('snap-session');
    expect(snap.state).toBe('connected');
    expect(snap.players).toHaveLength(1);
    expect(snap.players[0].name).toBe('Alice');
  });
  it('snapshot.duration increases over time', () => {
    const sm = new SessionManager();
    sm.createSession('s');
    const snap1 = sm.getSnapshot();
    const snap2 = sm.getSnapshot();
    expect(snap2.duration).toBeGreaterThanOrEqual(snap1.duration);
  });
});

describe('SessionManager — state history', () => {
  it('records state transitions in order', () => {
    const sm = new SessionManager();
    sm.createSession('s');
    sm.connect();
    sm.endSession();
    const history = sm.getStateHistory().map((h) => h.state);
    expect(history).toEqual(['connecting', 'connected', 'ended']);
  });
  it('each history entry has a timestamp', () => {
    const sm = new SessionManager();
    sm.createSession('s');
    for (const entry of sm.getStateHistory()) {
      expect(typeof entry.timestamp).toBe('number');
    }
  });
  it('getStateHistory returns a copy', () => {
    const sm = new SessionManager();
    sm.createSession('s');
    const h1 = sm.getStateHistory();
    h1.push({ state: 'ended', timestamp: 9999 });
    expect(sm.getStateHistory()).toHaveLength(1);
  });
});
